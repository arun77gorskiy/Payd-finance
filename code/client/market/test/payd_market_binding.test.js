'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const Client = require('../payd_market_client');
const { createBinding } = require('../payd_market_binding');
const capture = require('../../../../reports/stage5c-public-market-observations-20261018.json');
const dataset = require('../../../../public/data/intelligence/token-index.json');
const source = fs.readFileSync(path.resolve(__dirname, 'fixtures/canonical-normalizer-20260908.js'));
assert.equal(createHash('sha256').update(source).digest('hex'),
  '1c79b425588c224ae1589494b5cc7d3fd1a57b3675309c346a1573c13a1e919e');
const context = { window: {}, console: { log() {} } };
vm.runInNewContext(source.toString(), context);
const Canonical = context.window.PAYD_INTEL.Canonical;
function runtime(ids = ['safe', 'ceramic', 'bitcoin']) {
  return Canonical.build(ids.map(id => ({ id, name: 'Original ' + id, symbol: id.toUpperCase(),
    sectors: ['Infrastructure', 'DeFi'], cmcId: 'old-frontend-id',
    identity: { tradable_asset: id !== 'ceramic', identity_status: 'VERIFIED' },
    market: { price_usd: 999, market_cap_usd: 12345, volume_24h_usd: 999,
      ath: 1000, atl: 1, last_updated: '2020-01-01T00:00:00Z' },
    protocol: { tvl_usd: 700 }, ai: { payd_score: 88, risk_score: 12 } })));
}
function live(id = 'safe', price = 1) {
  return { ...capture.responses[0].envelope, canonical_id: id,
    market: { ...capture.responses[0].envelope.market, price_usd: price } };
}
function options(client, rt, extra = {}) {
  return { client, runtime: rt, format: Canonical.fmt, ...extra };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('disabled binding does not change runtime, request data or invoke rendering callbacks', async () => {
  const rt = runtime(); const before = JSON.stringify(rt.list); let calls = 0;
  const binding = createBinding(options({ enabled: false, getMarket() { calls++; } }, rt,
    { onChange() { calls++; } }));
  assert.equal(binding.enabled, false); await binding.refresh(['safe']); binding.dispose();
  assert.equal(JSON.stringify(rt.list), before); assert.equal(calls, 0);
});

test('real canonical normalizer and actual client apply the two supplied public API bodies without snapshots', async () => {
  const rt = runtime(); const safe = rt.projects.get('safe');
  const previous = { name: safe.name, symbol: safe.symbol, cmcId: safe.cmcId,
    sectors: safe.sector_memberships, ai: safe.ai, protocol: safe.protocol, stats: rt.stats };
  safe._v1_view = { metrics: { market_cap_usd: 12345 } };
  const calls = [];
  const client = Client.createClient({ enabled: true, records: dataset.records, baseUrl: 'https://api.example',
    fetch: async url => {
      const id = new URL(url).searchParams.get('id'); calls.push(id);
      return { status: 200, json: async () => capture.responses.find(r => r.envelope.canonical_id === id) };
    } });
  const binding = createBinding(options(client, rt));
  assert.equal(safe._display.price, null); assert.equal(safe._v1_view, undefined);
  assert.equal(safe.market_status, 'UPDATING'); assert.equal(calls.length, 0);
  await binding.refresh(['safe', 'ceramic', 'safe']);
  assert.deepEqual(calls.sort(), ['ceramic', 'safe']);
  const expected = capture.responses[0].envelope;
  assert.equal(safe.market_status, 'LIVE');
  for (const key of Client.FIELDS) assert.equal(safe.market[key], expected.market[key]);
  assert.equal(safe._display.price, Canonical.fmt.usd(expected.market.price_usd));
  assert.equal(safe.market_updated_at, expected.provider_updated_at);
  assert.equal(safe.market.ath, null); assert.equal(safe.market.atl, null);
  const ceramic = rt.projects.get('ceramic');
  assert.equal(ceramic.market_status, 'UNKNOWN_MAPPING');
  assert.ok(Client.FIELDS.every(key => ceramic.market[key] === null));
  assert.equal(ceramic._display.price, null); assert.equal(ceramic._display.market_cap, null);
  assert.equal(rt.projects.get('bitcoin').market_status, 'UPDATING');
  assert.equal(safe.name, previous.name); assert.equal(safe.symbol, previous.symbol);
  assert.equal(safe.cmcId, previous.cmcId); assert.equal(safe.sector_memberships, previous.sectors);
  assert.equal(safe.ai, previous.ai); assert.equal(safe.protocol, previous.protocol); assert.equal(rt.stats, previous.stats);
  assert.equal(safe._display.tvl, '$700.00'); assert.equal(safe._display.ai_score, 88);
});

test('every sector shares the same updated canonical object, including null and zero display values', async () => {
  const rt = runtime(); const e = live('safe', 1e-9); e.market.volume_24h_usd = 0; e.market.fdv_usd = null; e.status = 'PARTIAL';
  const binding = createBinding(options({ enabled: true, getMarket: async () => e }, rt));
  await binding.refresh(['safe']);
  const a = Canonical.getBySector(rt, 'Infrastructure').find(p => p.id === 'safe');
  const b = Canonical.getBySector(rt, 'DeFi').find(p => p.id === 'safe');
  assert.equal(a, b); assert.equal(a, rt.list.find(p => p.id === 'safe'));
  assert.equal(a.market_status, 'PARTIAL'); assert.equal(a._display.volume_24h, '$0.000000');
  assert.equal(a._display.fdv, null); assert.equal(a._display.is_no_token, false);
  assert.equal(a._display.price, '$1.0000e-9'); assert.equal(a.market.price_usd, 1e-9);
});

test('one shared queue bounds concurrent requests across overlapping refresh calls and deduplicates IDs', async () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f']; const rt = runtime(ids);
  let running = 0, max = 0, started = 0; const pending = [];
  const client = { enabled: true, getMarket: id => {
    running++; started++; max = Math.max(max, running);
    return new Promise(resolve => pending.push(() => { running--; resolve(live(id)); }));
  } };
  const binding = createBinding(options(client, rt, { concurrency: 2 }));
  const first = binding.refresh(['a', 'b', 'c', 'c']);
  const second = binding.refresh(['d', 'e', 'f']);
  assert.equal(started, 2);
  for (let finished = 0; finished < 6; finished++) { assert.ok(pending.length); pending.shift()(); await tick(); }
  await Promise.all([first, second]); assert.equal(started, 6); assert.equal(max, 2);
});

test('a slower earlier response cannot overwrite a later refresh of the same project', async () => {
  const rt = runtime(['safe']); const pending = [];
  const binding = createBinding(options({ enabled: true,
    getMarket: () => new Promise(resolve => pending.push(resolve)) }, rt, { concurrency: 2 }));
  const first = binding.refresh(['safe']), second = binding.refresh(['safe']);
  pending[1](live('safe', 2)); await second;
  pending[0](live('safe', 1)); await first;
  assert.equal(rt.projects.get('safe').market.price_usd, 2);
});

test('disposing clears displayed prices, cancels queued reads and ignores a late LIVE response', async () => {
  const rt = runtime(['safe', 'bitcoin']); let finish; let calls = 0;
  const binding = createBinding(options({ enabled: true, getMarket: () => {
    calls++; return new Promise(resolve => { finish = resolve; });
  } }, rt, { concurrency: 1 }));
  const result = binding.refresh(['safe', 'bitcoin']);
  binding.dispose(); finish(live()); await result;
  assert.equal(calls, 1); assert.equal(rt.projects.get('safe').market_status, 'UPDATING');
  assert.equal(rt.projects.get('safe')._display.price, null);
  assert.deepEqual(await binding.refresh(['safe']), []);
});

test('provider exceptions, wrong canonical IDs and later errors erase market values and memoized V1 views', async () => {
  const rt = runtime(['safe']); let result = live();
  const binding = createBinding(options({ enabled: true, getMarket: async () => {
    if (result instanceof Error) throw result; return result;
  } }, rt, { onChange() { throw Error('UI redraw failure'); } }));
  await binding.refresh(['safe']); const p = rt.projects.get('safe');
  assert.equal(p.market_status, 'LIVE'); p._v1_view = { old: true };
  result = new Error('private provider detail'); await binding.refresh(['safe']);
  assert.equal(p.market_status, 'PROVIDER_UNAVAILABLE'); assert.equal(p._v1_view, undefined);
  assert.ok(Client.FIELDS.every(key => p.market[key] === null));
  result = live('bitcoin'); await binding.refresh(['safe']);
  assert.equal(p.market_status, 'MAPPING_CONFLICT'); assert.equal(p._display.price, null);
  await assert.rejects(binding.refresh(['SAFE']), /exact canonical/);
  assert.throws(() => createBinding(options({ enabled: true, getMarket() {} }, rt, { concurrency: 99 })), /Concurrency/);
});
