'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createClient, toMarketView, FIELDS } = require('../payd_market_client');
const dataset = require('../../../../public/data/intelligence/token-index.json');
const capture = require('../../../../reports/stage5c-consolidated-live-audit-20261018.json');
const record = dataset.records.find(r => r.id === 'safe');
const observed = capture.candidate_diagnostic.results.find(r => r.canonical_id === 'safe');
function envelope() {
  return { canonical_id: record.id, symbol: record.symbol, provider: 'coinmarketcap',
    provider_id: record.cmcId, status: 'LIVE', access_mode: 'PRO_API',
    provider_updated_at: observed.provider_updated_at, market: { ...observed.market } };
}
function response(e = envelope(), status = 200) {
  return { status, json: async () => ({ ok: true, envelope: e }) };
}
function client(fetch, extra = {}) {
  return createClient({ enabled: true, records: dataset.records,
    baseUrl: 'https://payd-api.example', fetch, ...extra });
}

test('disabled by default; browser registration and disabled reads make zero requests', async () => {
  let calls = 0;
  const c = createClient({ fetch: async () => { calls++; throw Error('unexpected'); } });
  assert.equal(c.enabled, false);
  assert.equal((await c.getMarket('safe')).status, 'UPDATING');
  const context = { fetch: () => { calls++; } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../payd_market_client.js'), 'utf8'), context);
  assert.equal(typeof context.PAYD_INTEL.PaydMarketClient.createClient, 'function');
  assert.equal(calls, 0);
  assert.throws(() => createClient({ enabled: true }), /catalog/);
});

test('observed seven-row capture passes through without numeric conversion or extra properties', async () => {
  const applied = require('../../../../reports/stage5c-consolidated-release-20261018.json').applied;
  const c = client(async url => {
    const id = new URL(url).searchParams.get('id');
    const row = capture.candidate_diagnostic.results.find(r => r.canonical_id === id);
    const expected = dataset.records.find(r => r.id === id);
    return response({ ...envelope(), canonical_id: id, symbol: expected.symbol,
      provider_id: expected.cmcId, market: { ...row.market }, secret_extra: 'not copied' });
  });
  for (const r of applied) {
    const e = await c.getMarket(r.canonical_id);
    const original = capture.candidate_diagnostic.results.find(v => v.canonical_id === r.canonical_id);
    assert.equal(e.status, 'LIVE');
    assert.deepEqual(e.market, original.market);
    assert.equal(e.secret_extra, undefined);
  }
});

test('wrong canonical/provider identity, keyless results and inconsistent HTTP status fail closed', async () => {
  for (const patch of [{ canonical_id: 'eclipse' }, { provider_id: '1' },
    { symbol: 'BTC' }, { provider: 'coingecko' }, { access_mode: 'KEYLESS_PUBLIC' },
    { status: 'BOGUS' }]) {
    const e = await client(async () => response({ ...envelope(), ...patch })).getMarket('safe');
    assert.ok(['MAPPING_CONFLICT', 'INVALID_RESPONSE'].includes(e.status));
    assert.equal(e.market, null);
  }
  assert.equal((await client(async () => response(envelope(), 404)).getMarket('safe')).status, 'INVALID_RESPONSE');
});

test('exact canonical IDs only; only the PAYD route is requested with no credentials or redirects', async () => {
  let calls = 0;
  const c = client(async (url, opts) => {
    calls++;
    assert.equal(url, 'https://payd-api.example/api/intelligence/market?id=safe');
    assert.equal(opts.method, 'GET'); assert.equal(opts.credentials, 'omit');
    assert.equal(opts.redirect, 'error'); assert.deepEqual(opts.headers, { Accept: 'application/json' });
    return response();
  });
  for (const id of ['SAFE', ' safe', 'safe ', 'ES', 'Safe', null]) {
    assert.equal((await c.getMarket(id)).status, 'INVALID_ID');
  }
  assert.equal(calls, 0);
  assert.equal((await c.getMarket('safe')).status, 'LIVE'); assert.equal(calls, 1);
  for (const baseUrl of ['https://pro-api.coinmarketcap.com', 'https://api.coingecko.com',
    'http://payd-api.example', 'https://user:pass@payd-api.example', 'https://payd-api.example/?key=x']) {
    assert.throws(() => client(async () => response(), { baseUrl }));
  }
});

test('null and zero stay distinct; malformed or non-positive prices never reach the UI', async () => {
  const e = envelope(); e.market.volume_24h_usd = 0; e.market.fdv_usd = null; e.status = 'PARTIAL';
  const valid = await client(async () => response(e)).getMarket('safe');
  assert.equal(valid.status, 'PARTIAL'); assert.equal(valid.market.volume_24h_usd, 0);
  assert.equal(valid.market.fdv_usd, null);
  for (const price of [0, -1, '', true, '1', NaN, Infinity, undefined]) {
    const bad = envelope(); bad.market.price_usd = price;
    assert.equal((await client(async () => response(bad)).getMarket('safe')).status, 'INVALID_RESPONSE');
  }
});

test('no stale fallback after an error; blocked/error statuses erase every market field', async () => {
  let calls = 0;
  const c = client(async () => ++calls === 1 ? response() : response({ ...envelope(), status: 'UNKNOWN_MAPPING' }));
  assert.equal((await c.getMarket('safe')).status, 'LIVE');
  const next = toMarketView(await c.getMarket('safe'));
  assert.equal(next.status, 'UNKNOWN_MAPPING');
  assert.ok(FIELDS.every(key => next.market[key] === null));
  assert.equal(next.provider_updated_at, null);
  assert.equal(next.hint, 'Market data temporarily unavailable');
  for (const status of ['UPDATING', 'MAPPING_CONFLICT', 'PROVIDER_ERROR', 'RATE_LIMITED', 'INVALID_ID']) {
    assert.ok(FIELDS.every(key => toMarketView({ ...envelope(), status }).market[key] === null));
  }
});

test('CORS/network failures, auth pages and transport errors return bounded empty states', async () => {
  const cases = [
    [async () => { throw new TypeError('CORS failure with private details'); }, 'PROVIDER_UNAVAILABLE'],
    [async () => ({ status: 200, json: async () => { throw new SyntaxError('<html>'); } }), 'INVALID_RESPONSE'],
    [async () => response(null, 302), 'PROVIDER_UNAVAILABLE'],
    [async () => response(null, 401), 'PROVIDER_UNAVAILABLE'],
    [async () => response(null, 429), 'RATE_LIMITED'],
    [async () => response(null, 500), 'PROVIDER_UNAVAILABLE'],
  ];
  for (const [fetch, status] of cases) {
    const e = await client(fetch).getMarket('safe');
    assert.equal(e.status, status); assert.equal(e.market, null);
    assert.equal(JSON.stringify(e).includes('private details'), false);
  }
});

test('concurrent reads coalesce; stalled fetch and body reads time out and allow a subsequent read', async () => {
  for (const bodyStalls of [false, true]) {
    let calls = 0;
    const c = client(async () => {
      calls++;
      if (calls > 1) return response();
      if (bodyStalls) return { status: 200, json: () => new Promise(() => {}) };
      return new Promise(() => {});
    }, { timeoutMs: 20 });
    const a = c.getMarket('safe'), b = c.getMarket('safe');
    assert.equal(a, b);
    assert.equal((await a).status, 'PROVIDER_UNAVAILABLE'); assert.equal(calls, 1);
    assert.equal((await c.getMarket('safe')).status, 'LIVE'); assert.equal(calls, 2);
  }
});
