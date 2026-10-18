'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const dataset = require('../../public/data/intelligence/token-index.json');
const decision = require('../../reports/stage5c-consolidated-release-20261018.json');
const capture = require('../../reports/stage5c-consolidated-live-audit-20261018.json');
const { createPaydMarketService } = require('../../code/server/market/payd_market_service');
const marketHandler = require('../intelligence/market');

test('local public HTTP serves seven applied identities, caches them, preserves CORS and blocks all 75 held/unmapped rows', async () => {
  // Offline reconstruction from the observed normalized capture. This tests
  // public-route composition/cache/headers, not a new live provider fetch.
  const raw = {};
  for (const c of decision.applied) {
    const row = capture.candidate_diagnostic.results.find(r => r.canonical_id === c.canonical_id);
    const m = row.market;
    raw[c.after.cmcId] = { id: Number(c.after.cmcId), symbol: c.after.symbol, slug: c.after.cmcSlug,
      cmc_rank: m.market_cap_rank, circulating_supply: m.circulating_supply,
      total_supply: m.total_supply, max_supply: m.max_supply,
      quote: { USD: { price: m.price_usd, market_cap: m.market_cap_usd, volume_24h: m.volume_24h_usd,
        fully_diluted_market_cap: m.fdv_usd, percent_change_1h: m.change_1h_pct,
        percent_change_24h: m.change_24h_pct, percent_change_7d: m.change_7d_pct,
        percent_change_30d: m.change_30d_pct, last_updated: row.provider_updated_at } } };
  }
  let calls = 0;
  const service = createPaydMarketService({ datasetPath: path.resolve(__dirname, '../../public/data/intelligence/token-index.json'),
    adapter: { getAccessMode: () => 'PRO_API', isAuthAvailable: () => true,
      fetchQuoteById: async id => {
        calls++; assert.ok(raw[id]);
        return { mode: 'PRO_API', payload: { data: { [id]: raw[id] } }, rawUrl: 'https://offline.test' };
      } } });
  const saved = { service: globalThis.__PAYD_MARKET_SERVICE__, env: process.env.VERCEL_ENV,
    key: process.env.CMC_API_KEY, force: process.env.CMC_FORCE_KEYLESS, origins: process.env.PAYD_ALLOWED_ORIGINS };
  process.env.VERCEL_ENV = 'preview'; process.env.CMC_API_KEY = 'offline-public-route-fixture';
  delete process.env.CMC_FORCE_KEYLESS;
  process.env.PAYD_ALLOWED_ORIGINS = 'https://payd.finance';
  globalThis.__PAYD_MARKET_SERVICE__ = service;
  const server = http.createServer((req, res) => marketHandler(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/intelligence/market';
  try {
    for (const c of decision.applied) {
      const expected = capture.candidate_diagnostic.results.find(r => r.canonical_id === c.canonical_id);
      for (let i = 0; i < 2; i++) {
        const response = await fetch(base + '?id=' + c.canonical_id, { headers: { Origin: 'https://payd.finance' } });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('access-control-allow-origin'), 'https://payd.finance');
        assert.ok(response.headers.get('cache-control').includes('s-maxage=60'));
        const body = await response.json();
        assert.equal(body.envelope.status, 'LIVE');
        assert.equal(body.envelope.canonical_id, c.canonical_id);
        assert.equal(body.envelope.symbol, c.after.symbol);
        assert.equal(body.envelope.provider_id, c.after.cmcId);
        assert.deepEqual(body.envelope.market, expected.market);
      }
    }
    assert.equal(calls, 7);
    const blocked = dataset.records.filter(r => !service._internals.resolver.resolve(r.id).ok);
    assert.equal(blocked.length, 75);
    for (const record of blocked) {
      const response = await fetch(base + '?id=' + record.id);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const body = await response.json();
      assert.equal(body.envelope.status, 'UNKNOWN_MAPPING');
      assert.equal(body.envelope.market, null);
    }
    assert.equal(calls, 7);
    const preflight = await fetch(base, { method: 'OPTIONS', headers: { Origin: 'https://payd.finance' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
    assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
    const deniedOrigin = await fetch(base + '?id=safe', { headers: { Origin: 'https://unlisted.test' } });
    assert.equal(deniedOrigin.headers.get('access-control-allow-origin'), null);
    await deniedOrigin.arrayBuffer();
    const ticker = await fetch(base + '?id=ES');
    assert.equal(ticker.status, 404);
    assert.equal((await ticker.json()).envelope.market ?? null, null);
    assert.equal(calls, 7);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const [key, value] of [['VERCEL_ENV', saved.env], ['CMC_API_KEY', saved.key],
      ['CMC_FORCE_KEYLESS', saved.force], ['PAYD_ALLOWED_ORIGINS', saved.origins]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    if (saved.service === undefined) delete globalThis.__PAYD_MARKET_SERVICE__;
    else globalThis.__PAYD_MARKET_SERVICE__ = saved.service;
  }
});
