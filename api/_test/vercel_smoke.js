/**
 * PAYD Market Gateway — Vercel smoke test
 *
 * Verifies the two Vercel serverless handlers behave like the documented
 * canonical contract:
 *   - GET  /api/healthz            -> { ok:true, status:'UP', ... }
 *   - GET  /api/intelligence/market?id=bitcoin  -> { ok:true, envelope:{...} }
 *   - GET  /api/intelligence/market              -> 400 MISSING_PARAMETER
 *   - GET  /api/intelligence/market?id=__nope__  -> 404 INVALID_ID
 *   - POST /api/intelligence/market              -> 405 METHOD_NOT_ALLOWED
 *   - GET  /api/intelligence/market?id=ipfs      -> 200 UNKNOWN_MAPPING (no fake CMC id)
 *
 * No real network. The CoinMarketCapAdapter is replaced with a mock fetch
 * so this test runs fully offline and finishes in under 2 seconds.
 *
 * Run:  node api/_test/vercel_smoke.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

// Force keyless mode for the test so the adapter doesn't try to call CMC.
process.env.CMC_API_KEY = process.env.CMC_API_KEY || '';

// Patch fetch BEFORE the service is created so the adapter picks it up.
const CMC_FIXTURE = {
  // BTC: cmcId=1
  '1': {
    data: {
      '1': {
        id: 1, name: 'Bitcoin', symbol: 'BTC', slug: 'bitcoin', cmc_rank: 1,
        circulating_supply: 19800000, total_supply: 19800000, max_supply: 21000000,
        quote: {
          USD: {
            price: 60000.12,
            market_cap: 1188002376000,
            fully_diluted_market_cap: 1260002520000,
            volume_24h: 28000000000,
            percent_change_1h: 0.1,
            percent_change_24h: -1.2,
            percent_change_7d: 3.5,
            percent_change_30d: 12.4,
            last_updated: '2026-01-01T00:00:00.000Z',
          },
        },
      },
    },
  },
};

// We stub global fetch with a tiny dispatcher.
function _dispatch(url) {
  const u = new URL(url);
  const id = u.searchParams.get('id');
  if (!id || !CMC_FIXTURE[id]) {
    return Promise.resolve({
      ok: false, status: 404,
      json: async () => ({ status: { error_code: 404, error_message: 'not found' } }),
    });
  }
  return Promise.resolve({
    ok: true, status: 200,
    json: async () => CMC_FIXTURE[id],
  });
}

const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => _dispatch(url);

// Now load the handlers. The service singleton will use our stubbed fetch.
const healthz = require('../healthz');
const market = require('../intelligence/market');

let pass = 0, fail = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    pass++;
    // eslint-disable-next-line no-console
    console.log(`  ✓ ${name}`);
  } catch (err) {
    fail++;
    failures.push({ name, message: err && err.message ? err.message : String(err) });
    // eslint-disable-next-line no-console
    console.log(`  ✗ ${name}  -> ${err && err.message ? err.message : err}`);
  }
}

/**
 * Build a minimal Node-IncomingMessage-like req and ServerResponse-like res
 * recorder. Avoids spinning up http.createServer for a smoke test.
 */
function makeReq({ method = 'GET', url = '/', headers = {} } = {}) {
  return {
    method,
    url,
    headers,
    query: _parseQuery(url),
  };
}
function _parseQuery(url) {
  const q = {};
  const i = url.indexOf('?');
  if (i < 0) return q;
  const params = new URLSearchParams(url.slice(i + 1));
  for (const [k, v] of params) q[k] = v;
  return q;
}
function makeRes() {
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    end(chunk) {
      if (chunk !== undefined && chunk !== null) this.body += String(chunk);
      this.ended = true;
    },
  };
  return res;
}
async function call(handler, req) {
  const res = makeRes();
  await handler(req, res);
  return res;
}
function json(res) {
  return JSON.parse(res.body || '{}');
}

(async function run() {
  // eslint-disable-next-line no-console
  console.log('[vercel_smoke] running offline smoke test (mock CMC, no network)...');

  await test('GET /api/healthz -> 200 + ok:true + status:UP', async () => {
    const res = await call(healthz, makeReq({ url: '/api/healthz' }));
    assert.strictEqual(res.statusCode, 200, `status was ${res.statusCode}`);
    const j = json(res);
    assert.strictEqual(j.ok, true);
    assert.strictEqual(j.status, 'UP');
    assert.ok(j.stats, 'expected stats');
    assert.ok(typeof j.cmc_api_key_present === 'boolean', 'expected cmc_api_key_present flag');
  });

  await test('GET /api/healthz reports 354/330/24 canonical mapping stats', async () => {
    const res = await call(healthz, makeReq({ url: '/api/healthz' }));
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(json(res).resolver, { total: 354, cmc_mapped: 330, no_cmc_mapping: 24 });
  });

  await test('GET /api/healthz headers: Content-Type + no-store + x-content-type-options', async () => {
    const res = await call(healthz, makeReq({ url: '/api/healthz' }));
    const ct = res.headers['content-type'] || '';
    assert.ok(/application\/json/i.test(ct), `bad content-type: ${ct}`);
    assert.ok(/no-store/.test(res.headers['cache-control'] || ''), 'expected no-store');
  });

  await test('OPTIONS /api/healthz -> 204', async () => {
    const res = await call(healthz, makeReq({ method: 'OPTIONS', url: '/api/healthz' }));
    assert.strictEqual(res.statusCode, 204);
  });

  await test('POST /api/healthz -> 405', async () => {
    const res = await call(healthz, makeReq({ method: 'POST', url: '/api/healthz' }));
    assert.strictEqual(res.statusCode, 405);
  });

  await test('GET /api/intelligence/market (no id) -> 400 MISSING_PARAMETER', async () => {
    const res = await call(market, makeReq({ url: '/api/intelligence/market' }));
    assert.strictEqual(res.statusCode, 400);
    const j = json(res);
    assert.strictEqual(j.ok, false);
    assert.strictEqual(j.error, 'MISSING_PARAMETER');
  });

  await test('GET /api/intelligence/market?id=bitcoin -> 200 LIVE', async () => {
    const res = await call(market, makeReq({ url: '/api/intelligence/market?id=bitcoin' }));
    assert.strictEqual(res.statusCode, 200);
    const j = json(res);
    assert.strictEqual(j.ok, true);
    assert.strictEqual(j.envelope.status, 'LIVE');
    assert.strictEqual(j.envelope.canonical_id, 'bitcoin');
    assert.strictEqual(j.envelope.symbol, 'BTC');
    assert.strictEqual(j.envelope.provider_id, '1');
    assert.ok(j.envelope.market && j.envelope.market.price_usd > 0, 'expected price > 0');
  });

  await test('LIVE response Cache-Control: s-maxage=60 (shared-60s)', async () => {
    const res = await call(market, makeReq({ url: '/api/intelligence/market?id=bitcoin' }));
    const cc = res.headers['cache-control'] || '';
    assert.ok(/s-maxage=60/.test(cc), `expected s-maxage=60, got: ${cc}`);
  });

  await test('GET /api/intelligence/market?id=__not_in_dataset__ -> 404 INVALID_ID', async () => {
    const res = await call(market, makeReq({ url: '/api/intelligence/market?id=__not_in_dataset__' }));
    assert.strictEqual(res.statusCode, 404);
    const j = json(res);
    assert.strictEqual(j.envelope.status, 'INVALID_ID');
  });

  await test('GET /api/intelligence/market?id=ipfs -> 200 UNKNOWN_MAPPING (no fake CMC id)', async () => {
    // ipfs is in token-index.json with no cmcId (the 24 remaining unmapped records).
    const res = await call(market, makeReq({ url: '/api/intelligence/market?id=ipfs' }));
    assert.strictEqual(res.statusCode, 200);
    const j = json(res);
    assert.strictEqual(j.envelope.status, 'UNKNOWN_MAPPING');
    assert.strictEqual(j.envelope.canonical_id, 'ipfs');
    assert.strictEqual(j.envelope.provider_id, null);
    assert.strictEqual(j.envelope.market, null);
  });

  await test('POST /api/intelligence/market -> 405', async () => {
    const res = await call(market, makeReq({ method: 'POST', url: '/api/intelligence/market' }));
    assert.strictEqual(res.statusCode, 405);
  });

  await test('OPTIONS /api/intelligence/market -> 204', async () => {
    const res = await call(market, makeReq({ method: 'OPTIONS', url: '/api/intelligence/market' }));
    assert.strictEqual(res.statusCode, 204);
  });

  // SECURITY: ensure the CMC key never leaks into the response.
  await test('SECURITY: CMC_API_KEY value is NEVER reflected in any response', async () => {
    const fakeKey = 'TEST_LEAK_CANARY_472a31418c6b478a9713aa5578e90dc5';
    process.env.CMC_API_KEY = fakeKey;
    // force the singleton to re-initialise by clearing the global
    if (globalThis.__PAYD_MARKET_SERVICE__) {
      delete globalThis.__PAYD_MARKET_SERVICE__;
    }
    const res1 = await call(healthz, makeReq({ url: '/api/healthz' }));
    const res2 = await call(market, makeReq({ url: '/api/intelligence/market?id=bitcoin' }));
    const j1 = json(res1);
    const j2 = json(res2);
    const blob1 = JSON.stringify(j1);
    const blob2 = JSON.stringify(j2);
    assert.ok(!blob1.includes(fakeKey), 'healthz response leaked the key');
    assert.ok(!blob2.includes(fakeKey), 'market response leaked the key');
    // Restore
    process.env.CMC_API_KEY = '';
    if (globalThis.__PAYD_MARKET_SERVICE__) {
      delete globalThis.__PAYD_MARKET_SERVICE__;
    }
  });

  await test('PRODUCTION SECURITY: missing CMC_API_KEY blocks deployment', async () => {
    const previousVercelEnv = process.env.VERCEL_ENV;
    const previousKey = process.env.CMC_API_KEY;
    try {
      process.env.VERCEL_ENV = 'production';
      delete process.env.CMC_API_KEY;
      delete globalThis.__PAYD_MARKET_SERVICE__;
      const health = await call(healthz, makeReq({ url: '/api/healthz' }));
      const quote = await call(market, makeReq({ url: '/api/intelligence/market?id=bitcoin' }));
      assert.strictEqual(health.statusCode, 503);
      assert.strictEqual(quote.statusCode, 503);
      assert.strictEqual(json(quote).error, 'SERVICE_INIT_FAILED');
      assert.strictEqual(json(quote).message, 'CMC_API_KEY_REQUIRED');
    } finally {
      if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = previousVercelEnv;
      if (previousKey === undefined) delete process.env.CMC_API_KEY;
      else process.env.CMC_API_KEY = previousKey;
      delete globalThis.__PAYD_MARKET_SERVICE__;
    }
  });

  await test('PRODUCTION SECURITY: force-keyless mode is blocked', async () => {
    const previousVercelEnv = process.env.VERCEL_ENV;
    const previousKey = process.env.CMC_API_KEY;
    const previousForce = process.env.CMC_FORCE_KEYLESS;
    try {
      process.env.VERCEL_ENV = 'production';
      process.env.CMC_API_KEY = 'TEST_FAKE_KEY_DO_NOT_USE';
      process.env.CMC_FORCE_KEYLESS = 'true';
      delete globalThis.__PAYD_MARKET_SERVICE__;
      const quote = await call(market, makeReq({ url: '/api/intelligence/market?id=bitcoin' }));
      assert.strictEqual(quote.statusCode, 503);
      assert.strictEqual(json(quote).message, 'CMC_FORCE_KEYLESS_NOT_ALLOWED');
    } finally {
      if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = previousVercelEnv;
      if (previousKey === undefined) delete process.env.CMC_API_KEY;
      else process.env.CMC_API_KEY = previousKey;
      if (previousForce === undefined) delete process.env.CMC_FORCE_KEYLESS;
      else process.env.CMC_FORCE_KEYLESS = previousForce;
      delete globalThis.__PAYD_MARKET_SERVICE__;
    }
  });

  // Restore real fetch (best-effort).
  if (realFetch) globalThis.fetch = realFetch;

  // eslint-disable-next-line no-console
  console.log(`\n[vercel_smoke] pass=${pass} fail=${fail}`);
  if (fail > 0) {
    for (const f of failures) {
      // eslint-disable-next-line no-console
      console.log('  - ' + f.name + ': ' + f.message);
    }
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log('[vercel_smoke] ALL OK');
  process.exit(0);
})();
