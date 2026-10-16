'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { MarketResolver } = require('../market_resolver');
const { MarketCache } = require('../market_cache');
const { createPaydMarketService } = require('../payd_market_service');

const datasetPath = path.resolve(__dirname, '../../../../public/data/intelligence/token-index.json');
const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));

function payload({ symbol = 'BTC', slug = 'bitcoin', id = 1 } = {}) {
  return { data: { '1': { id, symbol, slug, quote: { USD: { price: 100, market_cap: 1000,
    volume_24h: 10, percent_change_24h: 0, percent_change_7d: 0, percent_change_30d: 0 } } } } };
}
function serviceWith(response, records, cache) {
  let calls = 0;
  const adapter = {
    getAccessMode: () => 'PRO_API',
    isAuthAvailable: () => true,
    fetchQuoteById: async () => {
      calls++;
      return { payload: response, mode: 'PRO_API', rawUrl: 'https://example.test' };
    },
  };
  const service = createPaydMarketService({
    dataset: { records: records || [{ id: 'bitcoin', symbol: 'BTC', cmcId: '1', cmcSlug: 'bitcoin' }] },
    adapter, cache,
  });
  return { service, calls: () => calls };
}

test('all 59 remaining quarantined entries return no market data and make zero provider calls', async () => {
  const rows = dataset.records.filter(r => r.mapping_status === 'unverified');
  assert.equal(rows.length, 59);
  const { service, calls } = serviceWith(payload(), dataset.records);
  for (const r of rows) {
    const result = await service.getMarket(r.id);
    assert.equal(result.status, 'UNKNOWN_MAPPING', r.id);
    assert.equal(result.market, null, r.id);
  }
  assert.equal(calls(), 0);
});

test('all 31 originally unmapped entries stay blocked without a ticker fallback', async () => {
  const rows = dataset.records.filter(r => !r.cmcId);
  assert.equal(rows.length, 31);
  const { service, calls } = serviceWith(payload(), dataset.records);
  for (const r of rows) {
    const result = await service.getMarket(r.id);
    assert.equal(result.status, 'UNKNOWN_MAPPING', r.id);
    assert.equal(result.market, null);
  }
  assert.equal(calls(), 0);
});

test('same numeric CMC ID with another symbol cannot produce LIVE/PARTIAL data or cache it', async () => {
  const { service } = serviceWith(payload({ symbol: 'OTHER' }));
  assert.equal((await service.getMarket('bitcoin')).status, 'INVALID_RESPONSE');
  assert.equal((await service.getMarket('bitcoin')).market, null);
  assert.equal(service._internals.cache.getSync('bitcoin'), null);
});

test('same numeric CMC ID with another slug cannot produce market data', async () => {
  const { service } = serviceWith(payload({ slug: 'another-bitcoin' }));
  assert.equal((await service.getMarket('bitcoin')).status, 'INVALID_RESPONSE');
  assert.equal((await service.getMarket('bitcoin')).market, null);
});

test('exact CMC identity still returns usable market data', async () => {
  const { service, calls } = serviceWith(payload());
  const result = await service.getMarket('bitcoin');
  assert.ok(['LIVE', 'PARTIAL'].includes(result.status));
  assert.equal(result.market.price_usd, 100);
  await service.getMarket('bitcoin');
  assert.equal(calls(), 1);
});

test('quarantining a previously cached identity blocks its old LIVE response', async () => {
  const record = { id: 'bitcoin', symbol: 'BTC', cmcId: '1', cmcSlug: 'bitcoin' };
  const cache = new MarketCache();
  const { service, calls } = serviceWith(payload(), [record], cache);
  await service.getMarket('bitcoin');
  record.mapping_status = 'unverified';
  const result = await service.getMarket('bitcoin');
  assert.equal(result.status, 'UNKNOWN_MAPPING');
  assert.equal(result.market, null);
  assert.equal(calls(), 1);
});

test('explicit project_without_token cannot fetch a quote even when an old CMC ID remains', async () => {
  const { service, calls } = serviceWith(payload(), [
    { id: 'company', symbol: 'BTC', cmcId: '1', cmcSlug: 'bitcoin', asset_type: 'project_without_token' },
  ]);
  const result = await service.getMarket('company');
  assert.equal(result.status, 'UNKNOWN_MAPPING');
  assert.equal(result.market, null);
  assert.equal(calls(), 0);
});

test('dataset fingerprint records the exact bytes loaded by the resolver', () => {
  const resolver = new MarketResolver({ datasetPath });
  assert.equal(resolver.datasetSha256, createHash('sha256').update(fs.readFileSync(datasetPath)).digest('hex'));
  assert.equal(dataset.records.filter(r => resolver.resolve(r.id).ok).length, 264);
});

test('legacy classification metadata agrees with all corrected and quarantined records', () => {
  for (const r of dataset.records.filter(r => r.mapping_status === 'unverified' ||
    dataset._classification[r.id].requires_live_reaudit)) {
    assert.equal(dataset._classification[r.id].cmcId, r.cmcId, r.id);
    assert.equal(dataset._classification[r.id].cmcSlug, r.cmcSlug, r.id);
  }
});
