'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPaydMarketService } = require('../../code/server/market/payd_market_service');
const handler = require('../_lib/stage5c-review');
const runtimeHandler = require('../audit-stage5c-runtime');
const manifest = require('../../reports/stage5c-candidates-20261018.json');
const datasetPath = path.resolve(__dirname, '../../public/data/intelligence/token-index.json');
const dataset = JSON.parse(fs.readFileSync(datasetPath));

function quote(r, blocked = false) {
  return { id: Number(r.cmcId), symbol: r.symbol, slug: r.cmcSlug, cmc_rank: 1,
    quote: { USD: { price: blocked ? null : 1.25, market_cap: null, volume_24h: 0,
      fully_diluted_market_cap: 0, percent_change_1h: null, percent_change_24h: -1,
      percent_change_7d: 0, percent_change_30d: null, last_updated: '2026-10-18T00:00:00Z' } } };
}

function fixture(modify) {
  const data = {};
  for (const r of dataset.records.filter(r => r.cmcId)) {
    data[r.cmcId] = quote(r, r.mapping_status === 'unverified');
  }
  for (const c of manifest.candidates) {
    data[c.cmc_id] = quote({ cmcId: c.cmc_id, symbol: c.symbol, cmcSlug: c.cmc_slug });
  }
  if (modify) modify(data);
  const requests = [];
  const fetch = async (url, init) => {
    const u = new URL(url);
    assert.equal(u.origin, 'https://pro-api.coinmarketcap.com');
    assert.equal(u.pathname, '/v1/cryptocurrency/quotes/latest');
    assert.ok(init.headers['X-CMC_PRO_API_KEY']);
    const ids = u.searchParams.get('id').split(',');
    requests.push(ids);
    return { ok: true, status: 200, json: async () => ({ status: { error_code: 0 },
      data: Object.fromEntries(ids.filter(id => data[id]).map(id => [id, data[id]])) }) };
  };
  const { CoinMarketCapAdapter } = require('../../code/server/market/coinmarketcap_adapter');
  const service = createPaydMarketService({ datasetPath,
    adapter: new CoinMarketCapAdapter({ apiKey: 'offline-fixture-only', fetch }) });
  return { service, fetch, requests };
}

function response() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; },
    end(s) { this.body = JSON.parse(s); } };
}

test('one Preview request runs unchanged 323-ID audit, 93 released rows and 10 isolated candidates; catalog stays blocked', async () => {
  const saved = { env: process.env.VERCEL_ENV, key: process.env.CMC_API_KEY,
    force: process.env.CMC_FORCE_KEYLESS, fetch: globalThis.fetch, service: globalThis.__PAYD_MARKET_SERVICE__ };
  const f = fixture();
  const bytes = fs.readFileSync(datasetPath);
  process.env.VERCEL_ENV = 'preview';
  process.env.CMC_API_KEY = 'offline-fixture-only';
  delete process.env.CMC_FORCE_KEYLESS;
  globalThis.fetch = f.fetch;
  globalThis.__PAYD_MARKET_SERVICE__ = f.service;
  try {
    const res = response();
    await runtimeHandler({ method: 'GET', query: { run: '1', review: '1' } }, res);
    assert.equal(res.statusCode, 200);
    const b = res.body;
    assert.equal(b.audit_completed, true);
    assert.equal(b.ok, true);
    assert.equal(b.stage_complete, false);
    assert.equal(b.release_authorized, false);
    assert.equal(b.baseline_strict.counts.mapped_checked, 323);
    assert.equal(b.baseline_strict.counts.fail, 51);
    assert.equal(b.baseline_strict.ok, false); // Expected holds are not hidden.
    assert.equal(b.released_runtime.counts.checked, 93);
    assert.equal(b.candidate_diagnostic.counts.checked, 10);
    assert.deepEqual(f.requests.map(r => r.length).sort((a, z) => a - z), [3, 10, 53, 90, 90, 90, 90]);
    assert.equal(b.health.canonical_dataset.sha256, b.dataset_sha256);
    assert.equal(b.health.canonical_dataset.eligible, 272);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(JSON.stringify(b).includes('offline-fixture-only'), false);
    for (const row of b.candidate_diagnostic.results) {
      assert.equal(row.release_authorized, false);
      assert.equal(Object.values(row.exact_fields).filter(Boolean).length, 8);
      const actual = f.service._internals.resolver.index.get(row.canonical_id);
      assert.equal(actual.cmcId ?? null, null);
      const beforeCalls = f.requests.length;
      assert.equal((await f.service.getMarket(row.canonical_id)).market, null);
      assert.equal(f.requests.length, beforeCalls);
    }
    assert.deepEqual(fs.readFileSync(datasetPath), bytes);
  } finally {
    for (const [key, value] of [['VERCEL_ENV', saved.env], ['CMC_API_KEY', saved.key], ['CMC_FORCE_KEYLESS', saved.force]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    globalThis.fetch = saved.fetch;
    if (saved.service === undefined) delete globalThis.__PAYD_MARKET_SERVICE__;
    else globalThis.__PAYD_MARKET_SERVICE__ = saved.service;
  }
});

test('candidate diagnostic fails missing, wrong-symbol, wrong-slug and zero-price quotes without substituting another asset', async () => {
  const [first, second, third, fourth] = manifest.candidates;
  const f = fixture(data => {
    delete data[first.cmc_id];
    data[second.cmc_id].symbol = 'OTHER';
    data[third.cmc_id].slug = 'unrelated';
    data[fourth.cmc_id].quote.USD.price = 0;
  });
  const result = await handler.runCandidates(f.service);
  assert.equal(result.counts.checked, 10);
  assert.equal(result.counts.fail, 4);
  assert.equal(result.counts.pass, 6);
  for (const c of [first, second, third, fourth]) {
    const r = result.results.find(row => row.canonical_id === c.canonical_id);
    assert.ok(r.reasons.length);
    assert.equal(r.release_authorized, false);
  }
  assert.equal(result.results[1].market, null);
  assert.equal(result.results[2].market, null);
});

test('candidate collisions with an existing provider ID or duplicate canonical ID fail before any provider request', async () => {
  for (const mutate of [m => { m.candidates[0].cmc_id = '1'; },
    m => { m.candidates[1].canonical_id = m.candidates[0].canonical_id; }]) {
    const f = fixture();
    const changed = JSON.parse(JSON.stringify(manifest));
    mutate(changed);
    await assert.rejects(handler.runCandidates(f.service, changed), /COLLISION/);
    assert.equal(f.requests.length, 0);
  }
});

function strictFixture() {
  const blocked = dataset.records.filter(r => r.mapping_status === 'unverified');
  return { counts: { dataset_total: 354, mapped_expected: 323, mapped_checked: 323,
    unmapped: 31, pass: 272, fail: 51, duplicate_cmc_ids: 0, duplicate_canonical_ids: 0 },
    structural_failures: [], failures: blocked.map(r => ({ canonical_id: r.id, symbol: r.symbol,
      expected_cmc_id: r.cmcId, expected_cmc_slug: r.cmcSlug, reasons: ['invalid_price'] })),
    mandatory: ['bitcoin','ethereum','chainlink','ondo-finance','bittensor','aave','decentraland']
      .map(canonical_id => ({ canonical_id, status: 'PASS' })) };
}

test('assessment detects a newly failing eligible row and rejects incomplete, duplicated or misattributed failure coverage', () => {
  const f = fixture();
  let s = strictFixture();
  const btc = dataset.records.find(r => r.id === 'bitcoin');
  s.failures.push({ canonical_id: btc.id, symbol: btc.symbol, expected_cmc_id: btc.cmcId,
    expected_cmc_slug: btc.cmcSlug, reasons: ['invalid_price'] });
  s.counts.pass--; s.counts.fail++;
  const assessed = handler.assessBaseline(f.service, s);
  assert.equal(assessed.complete, true);
  assert.deepEqual(assessed.unexpected_failures.map(r => r.canonical_id), ['bitcoin']);
  for (const mutate of [s => { s.counts.mapped_checked = 322; },
    s => { s.failures[1] = s.failures[0]; },
    s => { s.failures[0].expected_cmc_id = '999'; },
    s => { s.structural_failures = ['unexpected']; },
    s => { s.mandatory[0].status = 'FAIL'; }]) {
    s = strictFixture(); mutate(s);
    assert.equal(handler.assessBaseline(f.service, s).complete, false);
  }
});

test('section failures preserve other completed evidence and redact provider exception text', async () => {
  const f = fixture();
  const result = await handler.runReview(f.service, {
    baseline: async () => strictFixture(),
    runtime: async () => { throw new Error('provider-secret-like-text'); },
    candidates: async () => ({ ok: true, counts: { checked: 10 }, results: [] }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.audit_completed, false);
  assert.equal(result.baseline_strict.counts.mapped_checked, 323);
  assert.equal(result.candidate_diagnostic.counts.checked, 10);
  assert.equal(JSON.stringify(result).includes('provider-secret-like-text'), false);
  assert.equal(result.released_runtime.error, 'RELEASED_RUNTIME_FAILED');
});

test('review route rejects production, non-GET and missing confirmation without reaching provider', async () => {
  const previous = process.env.VERCEL_ENV;
  try {
    for (const [env, req, status] of [
      ['production', { method: 'GET', query: { run: '1' } }, 404],
      ['preview', { method: 'POST', query: { run: '1' } }, 405],
      ['preview', { method: 'GET', query: {} }, 400],
    ]) {
      process.env.VERCEL_ENV = env;
      const res = response();
      await handler(req, res);
      assert.equal(res.statusCode, status);
    }
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous;
  }
});
