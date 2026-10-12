'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MarketResolver } = require('../../code/server/market/market_resolver');
const handler = require('../audit-stage5c-runtime');

function fixture(overrides = {}) {
  const records = ['alpha', 'beta'].map((id, i) => ({
    id, symbol: id.toUpperCase(), cmcId: String(i + 1), cmcSlug: id,
    mapping_status: 'verified', identity_review: { status: 'LIVE_AUDIT_VERIFIED' },
  }));
  const resolver = new MarketResolver({ dataset: { records, _mapping_repair: { released_after_live_audit: 2 } } });
  const data = {};
  for (const record of records) {
    const n = Number(record.cmcId);
    data[record.cmcId] = {
      id: n, symbol: record.symbol, slug: record.cmcSlug, cmc_rank: n,
      quote: { USD: { price: 11 * n, market_cap: null, volume_24h: 0,
        fully_diluted_market_cap: 0, percent_change_24h: -0.5 * n,
        percent_change_7d: 1 * n, percent_change_30d: null } },
    };
  }
  if (overrides.modify) overrides.modify(data);
  let calls = 0;
  const adapter = {
    getAccessMode: () => overrides.mode || 'PRO_API',
    fetchQuoteById: async ids => {
      calls++;
      assert.equal(ids, '1,2');
      return { payload: { data }, mode: 'PRO_API', rawUrl: 'https://example.test' };
    },
  };
  return { service: { _internals: { resolver, adapter } }, calls: () => calls };
}

test('runtime parity checks eight fields for every identity with one batch; null and zero stay distinct', async () => {
  const f = fixture();
  const result = await handler.runAudit(f.service);
  assert.equal(result.ok, true);
  assert.deepEqual(result.counts, { checked: 2, pass: 2, fail: 0, fields_per_record: 8, provider_batches: 1 });
  assert.equal(f.calls(), 1);
  assert.equal(result.results[0].market.price_usd, 11);
  assert.equal(result.results[1].market.price_usd, 22);
  assert.equal(result.results[0].market.market_cap_usd, null);
  assert.equal(result.results[0].market.fdv_usd, 0);
  assert.equal(result.results[0].market.volume_24h_usd, 0);
});

test('same-ID wrong symbol fails in the actual service pipeline and yields no market data', async () => {
  const f = fixture({ modify: data => { data['1'].symbol = 'OTHER'; } });
  const result = await handler.runAudit(f.service);
  assert.equal(result.ok, false);
  assert.equal(result.counts.fail, 1);
  assert.equal(result.results[0].market, null);
});

test('same-ID wrong slug fails in the actual service pipeline', async () => {
  const f = fixture({ modify: data => { data['2'].slug = 'unrelated'; } });
  const result = await handler.runAudit(f.service);
  assert.equal(result.counts.fail, 1);
  assert.equal(result.results[1].status, 'INVALID_RESPONSE');
});

test('zero provider price cannot pass runtime parity even if the previous audit accepted zero', async () => {
  const f = fixture({ modify: data => { data['1'].quote.USD.price = 0; } });
  const result = await handler.runAudit(f.service);
  assert.equal(result.ok, false);
  assert.ok(result.results[0].reasons.includes('INVALID_RUNTIME_PRICE'));
});

test('an omitted quote cannot be substituted with another asset from the batch', async () => {
  const f = fixture({ modify: data => { delete data['1']; } });
  const result = await handler.runAudit(f.service);
  assert.equal(result.counts.fail, 1);
  assert.equal(result.results[0].market, null);
  assert.equal(result.results[1].market.price_usd, 22);
});

test('runtime audit requires authenticated PRO_API mode', async () => {
  const f = fixture({ mode: 'KEYLESS_PUBLIC' });
  await assert.rejects(handler.runAudit(f.service), /PRO_API_REQUIRED/);
  assert.equal(f.calls(), 0);
});

test('runtime audit route remains unavailable in production', async () => {
  const before = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'production';
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { this.body = JSON.parse(s); } };
  try {
    await handler({ method: 'GET', query: { run: '1' } }, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, 'NOT_FOUND');
  } finally {
    if (before === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = before;
  }
});
