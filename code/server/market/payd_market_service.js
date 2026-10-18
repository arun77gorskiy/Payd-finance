/**
 * PAYD Market Gateway — Core Service
 *
 * The platform-independent core. Has no HTTP, no Supabase, no Cloudflare.
 * Works under Node/VPS, Supabase Edge (with polyfills), or any other runtime.
 *
 * Responsibilities:
 *   - accept a canonical id
 *   - resolve it against the project dataset
 *   - decide between UNKNOWN_MAPPING / MAPPING_CONFLICT / cache hit /
 *     provider call
 *   - normalize the provider response (PRO_API and KEYLESS_PUBLIC shapes)
 *   - return a fully-populated PAYD envelope
 *
 * Public API:
 *   const svc = createPaydMarketService({ ... });
 *   await svc.getMarket('bitcoin');     // canonical id
 *
 * It NEVER:
 *   - reads price/market/FDV/volume/performance from a local JSON snapshot
 *   - falls back to CoinGecko or any other provider silently
 *   - fabricates a CMC id when one is missing
 */

'use strict';

const { MarketCache } = require('./market_cache');
const { CoinMarketCapAdapter, MODE_PRO_API, MODE_KEYLESS_PUBLIC } = require('./coinmarketcap_adapter');
const { MarketResolver } = require('./market_resolver');
const {
  normalizeCMCQuotes,
  unknownMappingEnvelope,
  mappingConflictEnvelope,
  invalidIdEnvelope,
} = require('./market_normalizer');
const {
  normalizeUnknownError,
  STATUS,
  InvalidIdError,
  UnknownMappingError,
  MappingConflictError,
} = require('./market_errors');

const CACHEABLE_STATUSES = new Set([
  STATUS.LIVE,
  STATUS.PARTIAL,
  STATUS.UNKNOWN_MAPPING,
  STATUS.MAPPING_CONFLICT,
]);

function createPaydMarketService({
  datasetPath,
  dataset,
  apiKey,
  baseUrl,
  timeoutMs,
  ttlMs,
  fetch: fetchImpl,
  forceKeyless,
  adapter,
  resolver,
  cache,
  now,
} = {}) {
  const resolvedResolver = resolver || new MarketResolver({ datasetPath, dataset });
  const resolvedAdapter = adapter || new CoinMarketCapAdapter({ apiKey, baseUrl, timeoutMs, fetch: fetchImpl, forceKeyless });
  const resolvedCache = cache || new MarketCache({ ttlMs, now });

  function _now() { return now ? now() : Date.now(); }

  function _invalidIdEnvelope(canonicalId) {
    return invalidIdEnvelope(String(canonicalId), new Date(_now()));
  }

  function _unknownEnvelope(ctx) {
    return unknownMappingEnvelope(
      { canonicalId: ctx.canonicalId, symbol: ctx.symbol, name: ctx.name },
      new Date(_now())
    );
  }

  function _conflictEnvelope(ctx, details) {
    return mappingConflictEnvelope(
      { canonicalId: ctx.canonicalId, symbol: ctx.symbol, name: ctx.name },
      new Date(_now()),
      details
    );
  }

  /**
   * Core entrypoint. Always resolves to a PAYD envelope, never throws
   * provider/network exceptions to the caller.
   *
   * @param {string} canonicalId
   * @returns {Promise<object>} PAYD envelope
   */
  async function getMarket(canonicalId) {
    if (canonicalId === undefined || canonicalId === null || canonicalId === '') {
      return _invalidIdEnvelope(String(canonicalId));
    }

    // Resolve identity
    const resolution = resolvedResolver.resolve(canonicalId);

    if (!resolution.ok) {
      const err = resolution.error;
      if (err instanceof InvalidIdError) {
        return _invalidIdEnvelope(err.canonicalId);
      }
      if (err instanceof UnknownMappingError) {
        const env = _unknownEnvelope(resolution.context || { canonicalId: err.canonicalId });
        resolvedCache.set(err.canonicalId, env);
        return env;
      }
      if (err instanceof MappingConflictError) {
        return _conflictEnvelope(
          resolution.context || { canonicalId: err.canonicalId },
          err.conflictDetails
        );
      }
      return _invalidIdEnvelope(String(canonicalId));
    }

    const ctx = resolution.context;
    // Resolve before cache reads so quarantined mappings cannot serve old LIVE data.
    const cached = resolvedCache.getSync(ctx.canonicalId);
    if (cached) return cached;
    const accessMode = resolvedAdapter.getAccessMode();

    // Cache-coalesced provider fetch
    return resolvedCache.coalesce(ctx.canonicalId, async () => {
      let envelope;
      try {
        const result = await resolvedAdapter.fetchQuoteById(ctx.cmcId);
        envelope = normalizeCMCQuotes(
          result.payload,
          {
            canonicalId: ctx.canonicalId,
            symbol: ctx.symbol,
            name: ctx.name,
            expectedCmcId: ctx.cmcId,
            cmcSlug: ctx.cmcSlug,
          },
          new Date(_now())
        );
        // Tag with access mode for diagnostics
        envelope.access_mode = result.mode;
        envelope.provider_url = result.rawUrl;
      } catch (err) {
        if (err && err.code && /WRONG_IDENTITY|INVALID_SHAPE|BAD_PRICE/.test(err.code)) {
          envelope = {
            canonical_id: ctx.canonicalId,
            symbol: ctx.symbol,
            name: ctx.name,
            market: null,
            provider: 'coinmarketcap',
            provider_id: ctx.cmcId,
            provider_updated_at: null,
            retrieved_at: new Date(_now()).toISOString(),
            status: STATUS.INVALID_RESPONSE,
            access_mode: accessMode,
          };
        } else {
          const norm = normalizeUnknownError(err);
          envelope = {
            canonical_id: ctx.canonicalId,
            symbol: ctx.symbol,
            name: ctx.name,
            market: null,
            provider: 'coinmarketcap',
            provider_id: ctx.cmcId,
            provider_updated_at: null,
            retrieved_at: new Date(_now()).toISOString(),
            status: norm.status,
            access_mode: accessMode,
            ...(norm.status === STATUS.RATE_LIMITED && norm.retryAfterMs
              ? { retry_after_ms: norm.retryAfterMs }
              : {}),
          };
        }
      }
      if (CACHEABLE_STATUSES.has(envelope.status)) {
        resolvedCache.set(ctx.canonicalId, envelope);
      }
      return envelope;
    });
  }

  function invalidate(canonicalId) {
    resolvedCache.invalidate(canonicalId);
  }

  function stats() {
    return {
      cache: resolvedCache.stats(),
      adapterAuthAvailable: resolvedAdapter.isAuthAvailable(),
      accessMode: resolvedAdapter.getAccessMode(),
      resolverSize: resolvedResolver.index.size,
    };
  }

  return {
    getMarket,
    invalidate,
    stats,
    _internals: {
      resolver: resolvedResolver,
      adapter: resolvedAdapter,
      cache: resolvedCache,
    },
  };
}

module.exports = {
  createPaydMarketService,
  MODE_PRO_API,
  MODE_KEYLESS_PUBLIC,
};
