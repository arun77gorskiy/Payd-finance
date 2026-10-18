/**
 * PAYD Market Gateway — Unit Tests
 *
 * Lightweight, no external dependencies. Runs in ~1s.
 * Each test is fully isolated; no real network calls are made.
 *
 * Run with:  node code/server/market/test/market_gateway.test.js
 */

'use strict';

const assert = require('assert');

// ── Subjects under test ────────────────────────────────────────────────────
const {
  STATUS,
  InvalidIdError,
  UnknownMappingError,
  MappingConflictError,
  ProviderUnavailableError,
  ProviderError,
  RateLimitedError,
  InvalidResponseError,
  TimeoutError,
  normalizeUnknownError,
} = require('../market_errors');

const normalizer = require('../market_normalizer');
const { MarketCache } = require('../market_cache');
const {
  CoinMarketCapAdapter,
  MODE_PRO_API,
  MODE_KEYLESS_PUBLIC,
} = require('../coinmarketcap_adapter');
const { MarketResolver } = require('../market_resolver');
const { createPaydMarketService } = require('../payd_market_service');

// ── Tiny test harness ──────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
const failures = [];

function test(name, fn) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { pass++; })
    .catch((err) => {
      fail++;
      failures.push({ name, message: err && err.message ? err.message : String(err), stack: err && err.stack });
    });
}

function suite(label, tests) {
  return (async () => {
    // eslint-disable-next-line no-console
    console.log(`\n# ${label}`);
    for (const t of tests) await test(t.name, t.fn);
  })();
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fixtureProjects() {
  return {
    projects: [
      { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin',
        cmcId: '1', cmcSlug: 'bitcoin', identifiers: { coinmarketcap: '1' } },
      { id: 'conflict-coin', symbol: 'CCN', name: 'Conflict Coin',
        cmcId: '9999', cmcSlug: 'conflict-coin', identifiers: { coinmarketcap: '8888' } },
      { id: 'mystery-token', symbol: 'XYZ', name: 'Mystery' },
      { id: 'half-mapped', symbol: 'HMP', name: 'Half Mapped',
        cmcId: '42', cmcSlug: 'half-mapped', identifiers: {} },
    ],
  };
}

/** PRO_API shape: data keyed by CMC id, quote.USD object */
function fixtureProAPI(cmcId, overrides = {}) {
  return {
    data: {
      [String(cmcId)]: {
        id: Number(cmcId),
        name: 'Bitcoin', symbol: 'BTC', slug: 'bitcoin',
        cmc_rank: 1,
        circulating_supply: 19000000,
        total_supply: 21000000,
        max_supply: 21000000,
        quote: {
          USD: {
            price: 60000.42,
            market_cap: 1140000000000,
            fully_diluted_market_cap: 1260000000000,
            volume_24h: 30000000000,
            percent_change_1h: 0.1,
            percent_change_24h: -1.2,
            percent_change_7d: 3.5,
            percent_change_30d: 12.4,
            last_updated: '2026-01-01T00:00:00.000Z',
          },
        },
        ...(overrides.rawCoin || {}),
      },
    },
    ...(overrides.payload || {}),
  };
}

/** KEYLESS_PUBLIC shape: data is array, quote is array */
function fixtureKeyless(cmcId, overrides = {}) {
  return {
    data: [
      {
        id: Number(cmcId),
        name: 'Bitcoin', symbol: 'BTC', slug: 'bitcoin',
        cmc_rank: 1,
        circulating_supply: 19000000,
        total_supply: 21000000,
        max_supply: 21000000,
        quote: [
          {
            id: 2781, symbol: 'USD',
            price: 60000.42,
            market_cap: 1140000000000,
            fully_diluted_market_cap: 1260000000000,
            volume_24h: 30000000000,
            percent_change_1h: 0.1,
            percent_change_24h: -1.2,
            percent_change_7d: 3.5,
            percent_change_30d: 12.4,
            last_updated: '2026-01-01T00:00:00.000Z',
          },
        ],
        ...(overrides.rawCoin || {}),
      },
    ],
    status: { timestamp: '2026-01-01T00:00:00.000Z', error_code: '0', error_message: '', elapsed: 2, credit_count: 1 },
    ...(overrides.payload || {}),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

(async function main() {
  await suite('market_errors — status constants', [
    { name: 'STATUS.LIVE === "LIVE"',
      fn: () => assert.strictEqual(STATUS.LIVE, 'LIVE') },
    { name: 'STATUS.UNKNOWN_MAPPING === "UNKNOWN_MAPPING"',
      fn: () => assert.strictEqual(STATUS.UNKNOWN_MAPPING, 'UNKNOWN_MAPPING') },
    { name: 'All spec statuses present', fn: () => {
      const required = ['LIVE','PARTIAL','UNKNOWN_MAPPING','MAPPING_CONFLICT','PROVIDER_UNAVAILABLE','PROVIDER_ERROR','RATE_LIMITED','INVALID_RESPONSE'];
      for (const k of required) assert.ok(STATUS[k], `STATUS.${k} missing`);
    } },
    { name: 'InvalidIdError carries canonicalId + INVALID_ID status',
      fn: () => {
        const e = new InvalidIdError('zzz');
        assert.strictEqual(e.status, 'INVALID_ID');
        assert.strictEqual(e.canonicalId, 'zzz');
      } },
    { name: 'normalizeUnknownError converts AbortError → TimeoutError',
      fn: () => {
        const e = normalizeUnknownError({ name: 'AbortError', message: 'aborted' });
        assert.ok(e instanceof TimeoutError);
        assert.strictEqual(e.status, STATUS.PROVIDER_UNAVAILABLE);
      } },
  ]);

  await suite('market_normalizer — PRO_API shape (object data)', [
    { name: 'normalizes PRO_API response to LIVE',
      fn: () => {
        const ctx = { canonicalId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', expectedCmcId: '1' };
        const env = normalizer.normalizeCMCQuotes(fixtureProAPI('1'), ctx, new Date('2026-01-01T00:00:00Z'));
        assert.strictEqual(env.status, STATUS.LIVE);
        assert.strictEqual(env.canonical_id, 'bitcoin');
        assert.strictEqual(env.provider_id, '1');
        assert.strictEqual(env.provider_shape, 'PRO_API');
        assert.strictEqual(env.market.price_usd, 60000.42);
        assert.strictEqual(env.market.market_cap_rank, 1);
        assert.strictEqual(env.market.change_24h_pct, -1.2);
      } },
    { name: 'PRO_API: identity mismatch → throws WRONG_IDENTITY',
      fn: () => {
        const ctx = { canonicalId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', expectedCmcId: '999' };
        try {
          normalizer.normalizeCMCQuotes(fixtureProAPI('1'), ctx, new Date());
          assert.fail('expected throw');
        } catch (e) {
          assert.strictEqual(e.code, 'WRONG_IDENTITY');
        }
      } },
    { name: 'PRO_API: max_supply 0 → null (uncapped)',
      fn: () => {
        const raw = fixtureProAPI('2', { rawCoin: { symbol: 'X', max_supply: 0 } });
        const ctx = { canonicalId: 'x', symbol: 'X', name: 'X', expectedCmcId: '2' };
        const env = normalizer.normalizeCMCQuotes(raw, ctx, new Date());
        assert.strictEqual(env.market.max_supply, null);
      } },
  ]);

  await suite('market_normalizer — KEYLESS_PUBLIC shape (array data)', [
    { name: 'normalizes KEYLESS_PUBLIC response to LIVE',
      fn: () => {
        const ctx = { canonicalId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', expectedCmcId: '1' };
        const env = normalizer.normalizeCMCQuotes(fixtureKeyless('1'), ctx, new Date('2026-01-01T00:00:00Z'));
        assert.strictEqual(env.status, STATUS.LIVE);
        assert.strictEqual(env.provider_id, '1');
        assert.strictEqual(env.provider_shape, 'KEYLESS_PUBLIC');
        assert.strictEqual(env.market.price_usd, 60000.42);
        assert.strictEqual(env.market.market_cap_usd, 1140000000000);
        assert.strictEqual(env.market.change_7d_pct, 3.5);
      } },
    { name: 'KEYLESS: locateQuote picks USD entry from array quote',
      fn: () => {
        const raw = {
          data: [{
            id: 1, symbol: 'BTC',
            cmc_rank: 1, circulating_supply: 1, total_supply: 1, max_supply: null,
            quote: [
              { id: 2782, symbol: 'EUR', price: 50000 },     // wrong currency first
              { id: 2781, symbol: 'USD', price: 60000, market_cap: 1000,
                percent_change_1h: 0.1, percent_change_24h: -1.0,
                percent_change_7d: 2.0, percent_change_30d: 5.0,
                last_updated: '2026-01-01T00:00:00.000Z' },
            ],
          }],
        };
        const ctx = { canonicalId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', expectedCmcId: '1' };
        const env = normalizer.normalizeCMCQuotes(raw, ctx, new Date());
        assert.strictEqual(env.status, STATUS.LIVE);
        assert.strictEqual(env.market.price_usd, 60000);
        assert.strictEqual(env.market.market_cap_usd, 1000);
      } },
    { name: 'KEYLESS: identity mismatch → throws WRONG_IDENTITY',
      fn: () => {
        const ctx = { canonicalId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', expectedCmcId: '7777' };
        try {
          normalizer.normalizeCMCQuotes(fixtureKeyless('1'), ctx, new Date());
          assert.fail('expected throw');
        } catch (e) {
          assert.strictEqual(e.code, 'WRONG_IDENTITY');
        }
      } },
    { name: 'KEYLESS: price missing → BAD_PRICE',
      fn: () => {
        const raw = fixtureKeyless('1', { rawCoin: { quote: [{ id: 2781, symbol: 'USD', price: null, market_cap: 1000 }] } });
        const ctx = { canonicalId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', expectedCmcId: '1' };
        try {
          normalizer.normalizeCMCQuotes(raw, ctx, new Date());
          assert.fail('expected throw');
        } catch (e) {
          assert.strictEqual(e.code, 'BAD_PRICE');
        }
      } },
  ]);

  await suite('market_normalizer — shared edge cases', [
    { name: 'PARTIAL when change_7d_pct is missing but price is good',
      fn: () => {
        const raw = fixtureProAPI('1', { rawCoin: { quote: { USD: { price: 60000, market_cap: 100, volume_24h: 50, percent_change_1h: 0, percent_change_24h: 1, percent_change_7d: null, percent_change_30d: 5, last_updated: '2026-01-01T00:00:00.000Z' } } } });
        const ctx = { canonicalId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', expectedCmcId: '1' };
        const env = normalizer.normalizeCMCQuotes(raw, ctx, new Date());
        assert.strictEqual(env.status, STATUS.PARTIAL);
        assert.strictEqual(env.market.change_7d_pct, null);
      } },
    { name: 'unknownMappingEnvelope uses null market + correct status',
      fn: () => {
        const env = normalizer.unknownMappingEnvelope(
          { canonicalId: 'zcash', symbol: 'ZEC', name: 'Zcash' },
          new Date('2026-01-01T00:00:00Z')
        );
        assert.strictEqual(env.status, STATUS.UNKNOWN_MAPPING);
        assert.strictEqual(env.market, null);
      } },
    { name: 'invalidIdEnvelope is honest about canonical id',
      fn: () => {
        const env = normalizer.invalidIdEnvelope('doesnotexist', new Date());
        assert.strictEqual(env.status, STATUS.INVALID_ID);
      } },
    { name: 'null provider values stay null (no fake zeros)',
      fn: () => {
        const raw = {
          data: {
            '1': {
              id: 1, name: 'Bitcoin', symbol: 'BTC', slug: 'bitcoin',
              cmc_rank: 1, circulating_supply: 19000000, total_supply: 21000000, max_supply: null,
              quote: { USD: { price: 1, market_cap: null, fully_diluted_market_cap: null,
                volume_24h: null, percent_change_1h: null, percent_change_24h: null,
                percent_change_7d: null, percent_change_30d: null,
                last_updated: '2026-01-01T00:00:00.000Z' } },
            },
          },
        };
        const ctx = { canonicalId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', expectedCmcId: '1' };
        const env = normalizer.normalizeCMCQuotes(raw, ctx, new Date());
        assert.strictEqual(env.status, STATUS.PARTIAL);
        assert.strictEqual(env.market.market_cap_usd, null);
        assert.strictEqual(env.market.change_24h_pct, null);
      } },
  ]);

  await suite('market_cache — TTL + coalescing', [
    { name: 'returns null on miss, set+get works',
      fn: () => {
        const c = new MarketCache({ ttlMs: 1000, now: () => 1000 });
        assert.strictEqual(c.getSync('x'), null);
        c.set('x', { foo: 1 });
        assert.deepStrictEqual(c.getSync('x'), { foo: 1 });
      } },
    { name: 'expires after TTL',
      fn: () => {
        let t = 1000;
        const c = new MarketCache({ ttlMs: 60_000, now: () => t });
        c.set('x', { foo: 1 });
        t += 60_001;
        assert.strictEqual(c.getSync('x'), null);
      } },
    { name: 'coalesces concurrent identical fetches',
      fn: async () => {
        let calls = 0;
        const c = new MarketCache({ ttlMs: 60_000 });
        const loader = async () => { calls++; return { v: 42 }; };
        const [a, b, d] = await Promise.all([
          c.coalesce('bitcoin', loader),
          c.coalesce('bitcoin', loader),
          c.coalesce('bitcoin', loader),
        ]);
        assert.strictEqual(calls, 1);
        assert.strictEqual(a.v, 42);
      } },
    { name: 'different canonical ids do not share cache',
      fn: async () => {
        let calls = 0;
        const c = new MarketCache({ ttlMs: 60_000 });
        const loader = async () => { calls++; return { v: calls }; };
        const a = await c.coalesce('bitcoin', loader);
        const b = await c.coalesce('ethereum', loader);
        assert.strictEqual(a.v, 1);
        assert.strictEqual(b.v, 2);
      } },
  ]);

  await suite('market_resolver — identity resolution', [
    { name: 'mapped, consistent → ok',
      fn: () => {
        const r = new MarketResolver({ dataset: fixtureProjects() });
        const res = r.resolve('bitcoin');
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.context.cmcId, '1');
      } },
    { name: 'mapped but identifiers disagree → MAPPING_CONFLICT',
      fn: () => {
        const r = new MarketResolver({ dataset: fixtureProjects() });
        const res = r.resolve('conflict-coin');
        assert.ok(res.error instanceof MappingConflictError);
      } },
    { name: 'unmapped → UNKNOWN_MAPPING',
      fn: () => {
        const r = new MarketResolver({ dataset: fixtureProjects() });
        const res = r.resolve('mystery-token');
        assert.ok(res.error instanceof UnknownMappingError);
      } },
    { name: 'half-mapped (cmcId only) → ok',
      fn: () => {
        const r = new MarketResolver({ dataset: fixtureProjects() });
        const res = r.resolve('half-mapped');
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.context.cmcId, '42');
      } },
    { name: 'unknown id → INVALID_ID',
      fn: () => {
        const r = new MarketResolver({ dataset: fixtureProjects() });
        const res = r.resolve('totally-fake');
        assert.ok(res.error instanceof InvalidIdError);
      } },
    { name: 'empty / null input → INVALID_ID',
      fn: () => {
        const r = new MarketResolver({ dataset: fixtureProjects() });
        assert.strictEqual(r.resolve('').ok, false);
        assert.strictEqual(r.resolve(null).ok, false);
      } },
  ]);

  await suite('coinmarketcap_adapter — access mode + status mapping', [
    { name: 'no key → KEYLESS_PUBLIC mode automatically',
      fn: () => {
        const a = new CoinMarketCapAdapter({ apiKey: '', fetch: () => {} });
        assert.strictEqual(a.getAccessMode(), MODE_KEYLESS_PUBLIC);
        assert.strictEqual(a.isAuthAvailable(), true);
      } },
    { name: 'with key → PRO_API mode',
      fn: () => {
        const a = new CoinMarketCapAdapter({ apiKey: 'test-key', fetch: () => {} });
        assert.strictEqual(a.getAccessMode(), MODE_PRO_API);
      } },
    { name: 'forceKeyless overrides present key',
      fn: () => {
        const a = new CoinMarketCapAdapter({ apiKey: 'k', fetch: () => {}, forceKeyless: true });
        assert.strictEqual(a.getAccessMode(), MODE_KEYLESS_PUBLIC);
      } },
    { name: 'KEYLESS_PUBLIC URL has no auth header and /public-api/v3/ path',
      fn: async () => {
        let seen = null;
        const fetch = async (url, init) => {
          seen = { url, headers: init.headers };
          return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ data: [] }) };
        };
        const a = new CoinMarketCapAdapter({ apiKey: '', fetch, forceKeyless: true });
        await a.fetchQuoteById('1');
        assert.ok(/\/public-api\/v3\/cryptocurrency\/quotes\/latest/.test(seen.url), 'wrong url');
        assert.strictEqual(seen.headers['X-CMC_PRO_API_KEY'], undefined, 'no auth header in keyless mode');
        assert.strictEqual(seen.headers['Accept'], 'application/json');
      } },
    { name: 'PRO_API URL has auth header and /v1/ path',
      fn: async () => {
        let seen = null;
        const fetch = async (url, init) => {
          seen = { url, headers: init.headers };
          return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ data: [] }) };
        };
        const a = new CoinMarketCapAdapter({ apiKey: 'secret-key', fetch });
        await a.fetchQuoteById('1');
        assert.ok(/\/v1\/cryptocurrency\/quotes\/latest/.test(seen.url), 'wrong url');
        assert.strictEqual(seen.headers['X-CMC_PRO_API_KEY'], 'secret-key');
      } },
    { name: 'HTTP 429 → RateLimitedError',
      fn: async () => {
        const fetch = async () => ({
          status: 429, ok: false,
          headers: { get: (k) => (k === 'retry-after' ? '5' : null) },
          text: async () => '',
        });
        const a = new CoinMarketCapAdapter({ apiKey: '', fetch, forceKeyless: true });
        await assert.rejects(() => a.fetchQuoteById('1'),
          (e) => e instanceof RateLimitedError && e.retryAfterMs === 5000);
      } },
    { name: 'HTTP 401 → ProviderUnavailableError',
      fn: async () => {
        const fetch = async () => ({ status: 401, ok: false, headers: { get: () => null }, text: async () => '' });
        const a = new CoinMarketCapAdapter({ apiKey: 'k', fetch });
        await assert.rejects(() => a.fetchQuoteById('1'), (e) => e instanceof ProviderUnavailableError);
      } },
    { name: 'HTTP 500 → ProviderError',
      fn: async () => {
        const fetch = async () => ({ status: 500, ok: false, headers: { get: () => null }, text: async () => 'oops' });
        const a = new CoinMarketCapAdapter({ apiKey: 'k', fetch });
        await assert.rejects(() => a.fetchQuoteById('1'), (e) => e instanceof ProviderError);
      } },
    { name: 'AbortError → TimeoutError',
      fn: async () => {
        const fetch = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
        const a = new CoinMarketCapAdapter({ apiKey: 'k', fetch, timeoutMs: 100 });
        await assert.rejects(() => a.fetchQuoteById('1'), (e) => e instanceof TimeoutError);
      } },
    { name: 'malformed JSON → InvalidResponseError',
      fn: async () => {
        const fetch = async () => ({
          status: 200, ok: true,
          headers: { get: () => null },
          json: async () => { throw new Error('not json'); },
        });
        const a = new CoinMarketCapAdapter({ apiKey: 'k', fetch });
        await assert.rejects(() => a.fetchQuoteById('1'), (e) => e instanceof InvalidResponseError);
      } },
    { name: 'returns {payload, mode, rawStatus, rawUrl} on success',
      fn: async () => {
        const fetch = async () => ({
          status: 200, ok: true,
          headers: { get: () => null },
          json: async () => ({ data: [{ id: 1 }] }),
        });
        const a = new CoinMarketCapAdapter({ apiKey: '', fetch, forceKeyless: true });
        const result = await a.fetchQuoteById('1');
        assert.strictEqual(result.mode, MODE_KEYLESS_PUBLIC);
        assert.strictEqual(result.rawStatus, 200);
        assert.deepStrictEqual(result.payload, { data: [{ id: 1 }] });
        assert.ok(typeof result.rawUrl === 'string' && result.rawUrl.length > 0);
      } },
  ]);

  await suite('payd_market_service — end-to-end', [
    { name: 'PRO_API: valid mapped token, successful provider → LIVE',
      fn: async () => {
        const fetch = async () => ({
          status: 200, ok: true, headers: { get: () => null },
          json: async () => fixtureProAPI('1'),
        });
        const svc = createPaydMarketService({ dataset: fixtureProjects(), apiKey: 'k', fetch });
        const env = await svc.getMarket('bitcoin');
        assert.strictEqual(env.status, STATUS.LIVE);
        assert.strictEqual(env.market.price_usd, 60000.42);
        assert.strictEqual(env.access_mode, MODE_PRO_API);
      } },
    { name: 'KEYLESS: valid mapped token, successful provider → LIVE',
      fn: async () => {
        const fetch = async () => ({
          status: 200, ok: true, headers: { get: () => null },
          json: async () => fixtureKeyless('1'),
        });
        const svc = createPaydMarketService({
          dataset: fixtureProjects(), apiKey: '', fetch, forceKeyless: true,
        });
        const env = await svc.getMarket('bitcoin');
        assert.strictEqual(env.status, STATUS.LIVE);
        assert.strictEqual(env.market.price_usd, 60000.42);
        assert.strictEqual(env.access_mode, MODE_KEYLESS_PUBLIC);
        assert.strictEqual(env.provider_shape, 'KEYLESS_PUBLIC');
      } },
    { name: 'unknown canonical id → INVALID_ID',
      fn: async () => {
        const svc = createPaydMarketService({ dataset: fixtureProjects(), apiKey: 'k' });
        const env = await svc.getMarket('not-real');
        assert.strictEqual(env.status, STATUS.INVALID_ID);
      } },
    { name: 'unknown CMC mapping → UNKNOWN_MAPPING',
      fn: async () => {
        const svc = createPaydMarketService({ dataset: fixtureProjects(), apiKey: 'k' });
        const env = await svc.getMarket('mystery-token');
        assert.strictEqual(env.status, STATUS.UNKNOWN_MAPPING);
        assert.strictEqual(env.market, null);
      } },
    { name: 'mapping conflict → MAPPING_CONFLICT',
      fn: async () => {
        const svc = createPaydMarketService({ dataset: fixtureProjects(), apiKey: 'k' });
        const env = await svc.getMarket('conflict-coin');
        assert.strictEqual(env.status, STATUS.MAPPING_CONFLICT);
      } },
    { name: 'partial provider response → PARTIAL',
      fn: async () => {
        const raw = fixtureProAPI('1', { rawCoin: { quote: { USD: { price: 60000, market_cap: 100, volume_24h: 50, percent_change_1h: 0, percent_change_24h: 1, percent_change_7d: null, percent_change_30d: 5, last_updated: '2026-01-01T00:00:00.000Z' } } } });
        const fetch = async () => ({ status: 200, ok: true, headers: { get: () => null }, json: async () => raw });
        const svc = createPaydMarketService({ dataset: fixtureProjects(), apiKey: 'k', fetch });
        const env = await svc.getMarket('bitcoin');
        assert.strictEqual(env.status, STATUS.PARTIAL);
        assert.strictEqual(env.market.change_7d_pct, null);
      } },
    { name: 'provider 429 → RATE_LIMITED, NOT cached',
      fn: async () => {
        let n = 0;
        const fetch = async () => {
          n += 1;
          return { status: 429, ok: false, headers: { get: () => null }, text: async () => '' };
        };
        const svc = createPaydMarketService({ dataset: fixtureProjects(), apiKey: 'k', fetch, ttlMs: 60_000 });
        const a = await svc.getMarket('bitcoin');
        const b = await svc.getMarket('bitcoin');
        assert.strictEqual(a.status, STATUS.RATE_LIMITED);
        assert.strictEqual(b.status, STATUS.RATE_LIMITED);
        assert.strictEqual(n, 2);
      } },
    { name: 'provider timeout → PROVIDER_UNAVAILABLE',
      fn: async () => {
        const fetch = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
        const svc = createPaydMarketService({ dataset: fixtureProjects(), apiKey: 'k', fetch, timeoutMs: 50 });
        const env = await svc.getMarket('bitcoin');
        assert.strictEqual(env.status, STATUS.PROVIDER_UNAVAILABLE);
      } },
    { name: 'invalid provider identity → INVALID_RESPONSE',
      fn: async () => {
        const fetch = async () => ({
          status: 200, ok: true, headers: { get: () => null },
          json: async () => fixtureProAPI('7777'),
        });
        const svc = createPaydMarketService({ dataset: fixtureProjects(), apiKey: 'k', fetch });
        const env = await svc.getMarket('bitcoin');
        assert.strictEqual(env.status, STATUS.INVALID_RESPONSE);
        assert.strictEqual(env.market, null);
      } },
    { name: 'cache hit on second call → exactly one provider call',
      fn: async () => {
        let n = 0;
        const fetch = async () => {
          n += 1;
          return {
            status: 200, ok: true, headers: { get: () => null },
            json: async () => fixtureProAPI('1'),
          };
        };
        const svc = createPaydMarketService({ dataset: fixtureProjects(), apiKey: 'k', fetch, ttlMs: 60_000 });
        await svc.getMarket('bitcoin');
        await svc.getMarket('bitcoin');
        await svc.getMarket('bitcoin');
        assert.strictEqual(n, 1);
      } },
    { name: 'no CMC key + KEYLESS mode: fetch IS called (no auth block)',
      fn: async () => {
        let called = false;
        const fetch = async () => {
          called = true;
          return {
            status: 200, ok: true, headers: { get: () => null },
            json: async () => fixtureKeyless('1'),
          };
        };
        const svc = createPaydMarketService({ dataset: fixtureProjects(), apiKey: '', fetch, forceKeyless: true });
        const env = await svc.getMarket('bitcoin');
        assert.strictEqual(called, true, 'fetch must be called in keyless mode');
        assert.strictEqual(env.status, STATUS.LIVE);
      } },
  ]);

  // ── Report ────────────────────────────────────────────────────────────────
  // eslint-disable-next-line no-console
  console.log(`\n──────────── UNIT TESTS ────────────`);
  // eslint-disable-next-line no-console
  console.log(`PASS: ${pass}`);
  // eslint-disable-next-line no-console
  console.log(`FAIL: ${fail}`);
  if (fail > 0) {
    for (const f of failures) {
      // eslint-disable-next-line no-console
      console.error(`  ✗ ${f.name}: ${f.message}`);
    }
    process.exit(1);
  }
  process.exit(0);
})();
