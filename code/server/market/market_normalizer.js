/**
 * PAYD Market Gateway — Normalizer
 *
 * Converts a raw CoinMarketCap quotes payload into the canonical PAYD
 * market envelope. Pure, no side effects, no I/O.
 *
 * Supports BOTH CoinMarketCap response shapes:
 *
 *   PRO_API  (/v1/...)
 *     data: { "<id>": { id, name, symbol, cmc_rank, circulating_supply,
 *                       total_supply, max_supply, quote: { USD: { price,
 *                       market_cap, fully_diluted_market_cap, volume_24h,
 *                       percent_change_1h, percent_change_24h, ...,
 *                       last_updated } } } }
 *
 *   KEYLESS_PUBLIC  (/public-api/v3/...)
 *     data: [ { id, name, symbol, slug, cmc_rank, circulating_supply,
 *               total_supply, max_supply, quote: [ { symbol: "USD",
 *               price, market_cap, fully_diluted_market_cap, volume_24h,
 *               percent_change_*, last_updated } ] } ]
 *
 * All numeric fields that may be missing from the provider are normalized
 * to `null` — NEVER `0`, `"$0"`, `"0%"` etc. — per the STEP 2 spec.
 */

'use strict';

const { STATUS, PROVIDER_NAME } = require('./market_errors');

/**
 * Read a nested path safely without throwing.
 */
function pick(obj, ...keys) {
  let cur = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}

/**
 * Coerce a numeric value to number or null.
 * Zero is a valid provider value (e.g. thin 24h volume) so we do NOT
 * coerce 0 → null here. Use nullableNum() when "0 = unset" semantics apply.
 */
function num(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * As num(), but coerces 0 → null when the field's zero means "no value".
 * Used for max_supply (CMC convention: 0 = uncapped).
 */
function nullableNum(value, { zeroIsNull = false } = {}) {
  const n = num(value);
  if (n === null) return null;
  if (zeroIsNull && n === 0) return null;
  return n;
}

/**
 * Detect which shape we got and locate the requested asset's quote.
 *
 * Returns the USD quote object for the asset matching `expectedCmcId`,
 * or { quote: null, rawCoin: null, shape: 'unknown' } when not found.
 */
function locateQuote(payload, expectedCmcId) {
  if (!payload || typeof payload !== 'object') return { quote: null, rawCoin: null, shape: 'unknown' };
  const data = payload.data;
  if (!data) return { quote: null, rawCoin: null, shape: 'unknown' };

  // PRO_API: data is an object keyed by CMC id
  if (!Array.isArray(data)) {
    const expected = expectedCmcId !== null && expectedCmcId !== undefined ? String(expectedCmcId) : null;
    if (expected && Object.prototype.hasOwnProperty.call(data, expected)) {
      const rawCoin = data[expected];
      const quote = pick(rawCoin, 'quote', 'USD');
      if (quote) return { quote, rawCoin, shape: 'PRO_API' };
    }
    // Fallback: search by id field
    if (expected) {
      for (const k of Object.keys(data)) {
        const cand = data[k];
        if (cand && String(cand.id) === expected) {
          const quote = pick(cand, 'quote', 'USD');
          if (quote) return { quote, rawCoin: cand, shape: 'PRO_API' };
        }
      }
    } else {
      // No expected id → take the only/first one
      const ids = Object.keys(data);
      if (ids.length === 1) {
        const cand = data[ids[0]];
        const quote = pick(cand, 'quote', 'USD');
        if (quote) return { quote, rawCoin: cand, shape: 'PRO_API' };
      }
    }
    return { quote: null, rawCoin: null, shape: 'PRO_API' };
  }

  // KEYLESS_PUBLIC: data is an array
  if (!expectedCmcId) {
    if (data.length === 1) {
      const rawCoin = data[0];
      const quote = (Array.isArray(rawCoin.quote) ? rawCoin.quote.find((q) => q && (q.symbol === 'USD' || q.id === 2781)) : null);
      return { quote, rawCoin, shape: 'KEYLESS_PUBLIC' };
    }
    return { quote: null, rawCoin: null, shape: 'KEYLESS_PUBLIC' };
  }
  const expected = String(expectedCmcId);
  for (const cand of data) {
    if (cand && String(cand.id) === expected) {
      const quote = Array.isArray(cand.quote)
        ? cand.quote.find((q) => q && (q.symbol === 'USD' || q.id === 2781))
        : null;
      return { quote, rawCoin: cand, shape: 'KEYLESS_PUBLIC' };
    }
  }
  return { quote: null, rawCoin: null, shape: 'KEYLESS_PUBLIC' };
}

/**
 * Extract the numeric provider id from a raw coin object.
 */
function extractReturnedId(rawCoin) {
  if (!rawCoin) return null;
  const id = rawCoin.id;
  if (id === undefined || id === null) return null;
  return String(id);
}

function looksLikeCMCQuotesPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const data = payload.data;
  if (!data) return false;
  if (Array.isArray(data)) return data.length > 0;
  if (typeof data === 'object') return Object.keys(data).length > 0;
  return false;
}

/**
 * Build the PAYD market object from a USD quote.
 */
function buildMarket(quote, rawCoin) {
  const pickFromQuote = (k) => quote ? quote[k] : undefined;
  return {
    price_usd: num(pickFromQuote('price')),
    market_cap_usd: num(pickFromQuote('market_cap')),
    fdv_usd: num(pickFromQuote('fully_diluted_market_cap')),
    volume_24h_usd: num(pickFromQuote('volume_24h')),

    change_1h_pct: num(pickFromQuote('percent_change_1h')),
    change_24h_pct: num(pickFromQuote('percent_change_24h')),
    change_7d_pct: num(pickFromQuote('percent_change_7d')),
    change_30d_pct: num(pickFromQuote('percent_change_30d')),

    market_cap_rank: num(rawCoin ? rawCoin.cmc_rank : undefined),

    circulating_supply: num(rawCoin ? rawCoin.circulating_supply : undefined),
    total_supply: num(rawCoin ? rawCoin.total_supply : undefined),
    // CMC: 0 in max_supply commonly means "uncapped" → null
    max_supply: rawCoin ? nullableNum(rawCoin.max_supply, { zeroIsNull: true }) : null,
  };
}

function isPartial(market) {
  if (market.price_usd === null || market.price_usd === undefined) return false;
  const identityCritical = [
    'market_cap_usd', 'change_24h_pct', 'change_7d_pct',
    'market_cap_rank', 'circulating_supply'
  ];
  return identityCritical.some((k) => market[k] === null || market[k] === undefined);
}

/**
 * Public normalizer. Returns the canonical PAYD envelope for a CMC response.
 * Throws errors with `code` set so the service can map them to
 * INVALID_RESPONSE.
 *
 * @param {object} payload       raw provider JSON
 * @param {object} context       { canonicalId, symbol, name, expectedCmcId, cmcSlug }
 * @param {Date}   retrievedAt   server-side timestamp
 */
function normalizeCMCQuotes(payload, context, retrievedAt) {
  if (!looksLikeCMCQuotesPayload(payload)) {
    const err = new Error('CMC payload missing data object');
    err.code = 'INVALID_SHAPE';
    throw err;
  }

  const expectedCmcId = context && context.expectedCmcId ? String(context.expectedCmcId) : null;
  const { quote, rawCoin, shape } = locateQuote(payload, expectedCmcId);

  if (!rawCoin) {
    const err = new Error(`CMC response did not include requested asset (cmcId=${expectedCmcId})`);
    err.code = 'WRONG_IDENTITY';
    throw err;
  }
  if (!quote) {
    const err = new Error(`CMC USD quote missing for asset (cmcId=${expectedCmcId})`);
    err.code = 'INVALID_SHAPE';
    throw err;
  }

  const returnedId = extractReturnedId(rawCoin);

  // Identity guard: never normalize a quote for the wrong asset
  if (expectedCmcId && String(returnedId) !== String(expectedCmcId)) {
    const err = new Error(
      `Identity mismatch: requested CMC ${expectedCmcId}, got ${returnedId}`
    );
    err.code = 'WRONG_IDENTITY';
    throw err;
  }

  if ((context.symbol && String(rawCoin.symbol || '').toUpperCase() !== String(context.symbol).toUpperCase()) ||
      (context.cmcSlug && String(rawCoin.slug || '') !== String(context.cmcSlug))) {
    const err = new Error('CMC symbol or slug does not match the resolved canonical mapping');
    err.code = 'WRONG_IDENTITY';
    throw err;
  }

  const market = buildMarket(quote, rawCoin);

  if (market.price_usd === null || market.price_usd === undefined || market.price_usd <= 0) {
    const err = new Error('CMC price_usd missing or non-positive');
    err.code = 'BAD_PRICE';
    throw err;
  }

  const status = isPartial(market) ? STATUS.PARTIAL : STATUS.LIVE;

  return {
    canonical_id: context.canonicalId,
    symbol: context.symbol || null,
    name: context.name || null,

    market,

    provider: PROVIDER_NAME,
    provider_id: returnedId,
    provider_shape: shape,
    provider_updated_at: pick(quote, 'last_updated') || null,
    retrieved_at: retrievedAt.toISOString(),
    status,
  };
}

function unknownMappingEnvelope(context, retrievedAt) {
  return {
    canonical_id: context.canonicalId,
    symbol: context.symbol || null,
    name: context.name || null,
    market: null,
    provider: PROVIDER_NAME,
    provider_id: null,
    provider_updated_at: null,
    retrieved_at: retrievedAt.toISOString(),
    status: STATUS.UNKNOWN_MAPPING,
  };
}

function mappingConflictEnvelope(context, retrievedAt, details) {
  return {
    canonical_id: context.canonicalId,
    symbol: context.symbol || null,
    name: context.name || null,
    market: null,
    provider: PROVIDER_NAME,
    provider_id: null,
    provider_updated_at: null,
    retrieved_at: retrievedAt.toISOString(),
    status: STATUS.MAPPING_CONFLICT,
    conflict_details: details || null,
  };
}

function invalidIdEnvelope(canonicalId, retrievedAt) {
  return {
    canonical_id: canonicalId,
    symbol: null,
    name: null,
    market: null,
    provider: PROVIDER_NAME,
    provider_id: null,
    provider_updated_at: null,
    retrieved_at: retrievedAt.toISOString(),
    status: STATUS.INVALID_ID,
  };
}

module.exports = {
  normalizeCMCQuotes,
  unknownMappingEnvelope,
  mappingConflictEnvelope,
  invalidIdEnvelope,
  _internals: {
    pick,
    num,
    nullableNum,
    isPartial,
    looksLikeCMCQuotesPayload,
    locateQuote,
    buildMarket,
  },
};
