'use strict';

/**
 * Temporary Stage 5B live audit endpoint.
 * Preview-only. Validates every canonical record with a CMC mapping against
 * CoinMarketCap's authenticated PRO API in a small number of batched calls.
 *
 * GET /api/audit-stage5b?run=1
 */

const dataset = require('../public/data/intelligence/token-index.json');

const BATCH_SIZE = 90;
const TIMEOUT_MS = 8000;
const EXPECTED_TOTAL = 354;
const EXPECTED_MAPPED = 323;
const EXPECTED_UNMAPPED = 31;

let cachedResult = null;
let cachedAt = 0;
let inflight = null;
const CACHE_MS = 10 * 60 * 1000;

function json(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function finiteOrNull(v) {
  return v === null || v === undefined || Number.isFinite(Number(v));
}

function marketChecks(asset) {
  const usd = asset && asset.quote && asset.quote.USD;
  if (!usd || typeof usd !== 'object') return ['missing_quote_usd'];

  const failures = [];
  const required = [
    ['price', usd.price],
    ['market_cap', usd.market_cap],
    ['volume_24h', usd.volume_24h],
    ['percent_change_1h', usd.percent_change_1h],
    ['percent_change_24h', usd.percent_change_24h],
    ['percent_change_7d', usd.percent_change_7d],
    ['percent_change_30d', usd.percent_change_30d],
  ];

  for (const [name, value] of required) {
    if (!finiteOrNull(value)) failures.push(`invalid_${name}`);
  }

  if (usd.price === null || usd.price === undefined || !Number.isFinite(Number(usd.price)) || Number(usd.price) < 0) {
    failures.push('invalid_price');
  }
  if (usd.market_cap !== null && usd.market_cap !== undefined && Number(usd.market_cap) < 0) {
    failures.push('negative_market_cap');
  }
  if (usd.volume_24h !== null && usd.volume_24h !== undefined && Number(usd.volume_24h) < 0) {
    failures.push('negative_volume_24h');
  }

  return [...new Set(failures)];
}

async function fetchBatch(records, apiKey) {
  const ids = records.map((r) => String(r.cmcId));
  const url = new URL('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest');
  url.searchParams.set('id', ids.join(','));
  url.searchParams.set('aux', 'num_market_pairs,cmc_rank,date_added,tags,platform,max_supply,circulating_supply,total_supply,is_active,is_fiat');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PAYD-Stage5B-Audit/1.0',
        'X-CMC_PRO_API_KEY': apiKey,
      },
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`CMC_HTTP_${response.status}${text ? `:${text.slice(0, 160)}` : ''}`);
  }

  const payload = await response.json();
  if (payload && payload.status && Number(payload.status.error_code || 0) !== 0) {
    throw new Error(`CMC_STATUS_${payload.status.error_code}:${payload.status.error_message || 'unknown'}`);
  }
  if (!payload || !payload.data || typeof payload.data !== 'object') {
    throw new Error('CMC_INVALID_DATA_SHAPE');
  }
  return payload.data;
}

async function runAudit() {
  const started = Date.now();
  const records = Array.isArray(dataset.records) ? dataset.records : [];
  const mapped = records.filter((r) => r && r.cmcId !== undefined && r.cmcId !== null && String(r.cmcId).trim() !== '');
  const unmapped = records.filter((r) => !r || r.cmcId === undefined || r.cmcId === null || String(r.cmcId).trim() === '');

  const canonicalIds = mapped.map((r) => String(r.id));
  const cmcIds = mapped.map((r) => String(r.cmcId));
  const duplicateCanonical = canonicalIds.filter((id, i) => canonicalIds.indexOf(id) !== i);
  const duplicateCmc = cmcIds.filter((id, i) => cmcIds.indexOf(id) !== i);

  const structuralFailures = [];
  if (records.length !== EXPECTED_TOTAL) structuralFailures.push(`total_expected_${EXPECTED_TOTAL}_got_${records.length}`);
  if (mapped.length !== EXPECTED_MAPPED) structuralFailures.push(`mapped_expected_${EXPECTED_MAPPED}_got_${mapped.length}`);
  if (unmapped.length !== EXPECTED_UNMAPPED) structuralFailures.push(`unmapped_expected_${EXPECTED_UNMAPPED}_got_${unmapped.length}`);
  if (duplicateCanonical.length) structuralFailures.push(`duplicate_canonical_ids:${[...new Set(duplicateCanonical)].join(',')}`);
  if (duplicateCmc.length) structuralFailures.push(`duplicate_cmc_ids:${[...new Set(duplicateCmc)].join(',')}`);

  const apiKey = String(process.env.CMC_API_KEY || '').trim();
  if (!apiKey) throw new Error('CMC_API_KEY_REQUIRED');
  if (String(process.env.CMC_FORCE_KEYLESS || '').toLowerCase() === 'true') throw new Error('CMC_FORCE_KEYLESS_NOT_ALLOWED');

  const batches = chunk(mapped, BATCH_SIZE);
  const payloads = await Promise.all(batches.map((batch) => fetchBatch(batch, apiKey)));

  const returned = new Map();
  for (const payload of payloads) {
    for (const [key, asset] of Object.entries(payload)) {
      if (!asset || typeof asset !== 'object') continue;
      returned.set(String(asset.id !== undefined ? asset.id : key), asset);
    }
  }

  const failures = [];
  const passes = [];

  for (const record of mapped) {
    const expectedId = String(record.cmcId);
    const asset = returned.get(expectedId);
    const reasons = [];

    if (!asset) {
      reasons.push('quote_not_returned');
    } else {
      if (String(asset.id) !== expectedId) reasons.push(`provider_id_mismatch:${asset.id}`);
      if (record.symbol && String(asset.symbol || '').toUpperCase() !== String(record.symbol).toUpperCase()) {
        reasons.push(`symbol_mismatch:${asset.symbol || 'null'}`);
      }
      if (record.cmcSlug && String(asset.slug || '') !== String(record.cmcSlug)) {
        reasons.push(`slug_mismatch:${asset.slug || 'null'}`);
      }
      reasons.push(...marketChecks(asset));
    }

    const row = {
      canonical_id: record.id,
      symbol: record.symbol,
      expected_cmc_id: expectedId,
      expected_cmc_slug: record.cmcSlug || null,
      returned_symbol: asset ? asset.symbol || null : null,
      returned_slug: asset ? asset.slug || null : null,
      reasons,
    };

    if (reasons.length) failures.push(row);
    else passes.push(row);
  }

  const mandatory = ['bitcoin', 'ethereum', 'chainlink', 'ondo-finance', 'bittensor', 'aave', 'decentraland'];
  const mandatoryResults = mandatory.map((id) => {
    const fail = failures.find((x) => x.canonical_id === id);
    const pass = passes.find((x) => x.canonical_id === id);
    return {
      canonical_id: id,
      status: fail ? 'FAIL' : pass ? 'PASS' : 'NOT_FOUND',
      reasons: fail ? fail.reasons : [],
    };
  });

  const ok = structuralFailures.length === 0 && failures.length === 0 && passes.length === EXPECTED_MAPPED;
  return {
    ok,
    audit: 'stage5b_cmc_full_mapping',
    environment: process.env.VERCEL_ENV || null,
    access_mode: process.env.CMC_ACCESS_MODE || null,
    counts: {
      dataset_total: records.length,
      mapped_expected: EXPECTED_MAPPED,
      mapped_checked: mapped.length,
      unmapped: unmapped.length,
      returned_quotes: returned.size,
      pass: passes.length,
      fail: failures.length,
      duplicate_cmc_ids: [...new Set(duplicateCmc)].length,
      duplicate_canonical_ids: [...new Set(duplicateCanonical)].length,
      batches: batches.length,
    },
    mandatory: mandatoryResults,
    structural_failures: structuralFailures,
    failures,
    unmapped_canonical_ids: unmapped.map((r) => r && r.id).filter(Boolean),
    elapsed_ms: Date.now() - started,
    ts: new Date().toISOString(),
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  // Temporary audit route must never run in production.
  if (process.env.VERCEL_ENV !== 'preview') {
    return json(res, 404, { ok: false, error: 'NOT_FOUND' });
  }

  if (!req.query || String(req.query.run || '') !== '1') {
    return json(res, 400, { ok: false, error: 'AUDIT_CONFIRMATION_REQUIRED', usage: '/api/audit-stage5b?run=1' });
  }

  try {
    if (cachedResult && Date.now() - cachedAt < CACHE_MS) {
      return json(res, cachedResult.ok ? 200 : 500, { ...cachedResult, cached: true });
    }
    if (!inflight) {
      inflight = runAudit().then((result) => {
        cachedResult = result;
        cachedAt = Date.now();
        return result;
      }).finally(() => {
        inflight = null;
      });
    }
    const result = await inflight;
    return json(res, result.ok ? 200 : 500, result);
  } catch (err) {
    return json(res, 500, {
      ok: false,
      audit: 'stage5b_cmc_full_mapping',
      error: err && err.name === 'AbortError' ? 'CMC_TIMEOUT' : (err && err.message ? err.message : 'AUDIT_FAILED'),
      ts: new Date().toISOString(),
    });
  }
};
