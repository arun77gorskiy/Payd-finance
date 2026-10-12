'use strict';

/**
 * Temporary Preview-only Stage5B V4 discovery endpoint.
 *
 * Purpose:
 * - generate the strict V3 candidate in memory (does not modify token-index.json)
 * - identify only the V3 failures
 * - query CoinMarketCap /map one symbol at a time for those failures
 * - propose SAFE_REMAP only when identity is exact, symbol is unchanged,
 *   the CMC candidate is unique, and authenticated quotes have a valid price
 *
 * GET /api/reconcile-stage5b-v4-discovery?run=1
 */

const reconcileV3Handler = require('./reconcile-stage5b-v3.js');

const CMC_BASE = 'https://pro-api.coinmarketcap.com';
const BATCH_SIZE = 90;
const TIMEOUT_MS = 10000;
const SYMBOL_CONCURRENCY = 6;

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(`${JSON.stringify(body, null, 2)}\n`);
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function norm(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '');
}

function finitePrice(asset) {
  const price = asset?.quote?.USD?.price;
  return price !== null && price !== undefined && Number.isFinite(Number(price)) && Number(price) >= 0;
}

async function fetchJson(url, apiKey, userAgent) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': userAgent,
        'X-CMC_PRO_API_KEY': apiKey,
      },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`CMC_HTTP_${response.status}${text ? `:${text.slice(0, 160)}` : ''}`);
    }
    const payload = await response.json();
    if (payload?.status && Number(payload.status.error_code || 0) !== 0) {
      throw new Error(`CMC_STATUS_${payload.status.error_code}:${payload.status.error_message || 'unknown'}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function generateV3Candidate() {
  let body = '';
  const fakeRes = {
    statusCode: 200,
    setHeader() {},
    end(value) { body += value || ''; },
  };

  await reconcileV3Handler(
    { method: 'GET', query: { run: '1', format: 'index' } },
    fakeRes,
  );

  if (fakeRes.statusCode !== 200) {
    throw new Error(`RECONCILE_V3_FAILED:${fakeRes.statusCode}:${body.slice(0, 220)}`);
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error('RECONCILE_V3_INVALID_JSON');
  }
}

async function fetchQuotes(ids, apiKey) {
  const returned = new Map();
  const unique = [...new Set(ids.map(String).filter(Boolean))];
  for (const batch of chunk(unique, BATCH_SIZE)) {
    const url = new URL(`${CMC_BASE}/v1/cryptocurrency/quotes/latest`);
    url.searchParams.set('id', batch.join(','));
    url.searchParams.set('convert', 'USD');
    const payload = await fetchJson(url, apiKey, 'PAYD-Stage5B-V4-Discovery/1.0');
    for (const [key, asset] of Object.entries(payload?.data || {})) {
      if (!asset || typeof asset !== 'object') continue;
      returned.set(String(asset.id ?? key), asset);
    }
  }
  return returned;
}

async function fetchMapForSymbol(symbol, apiKey) {
  const url = new URL(`${CMC_BASE}/v1/cryptocurrency/map`);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('listing_status', 'active');
  const payload = await fetchJson(url, apiKey, 'PAYD-Stage5B-V4-Discovery/1.0');
  return Array.isArray(payload?.data) ? payload.data : [];
}

async function mapSymbols(symbols, apiKey) {
  const queue = [...symbols];
  const out = new Map();
  const errors = new Map();

  async function worker() {
    while (queue.length) {
      const symbol = queue.shift();
      try {
        out.set(symbol, await fetchMapForSymbol(symbol, apiKey));
      } catch (err) {
        errors.set(symbol, err?.message || 'MAP_FAILED');
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(SYMBOL_CONCURRENCY, queue.length || 1) }, () => worker()));
  return { out, errors };
}

function identityKeys(record) {
  return [...new Set([record.id, record.name, record.cmcSlug].map(norm).filter(Boolean))];
}

function exactIdentityCandidates(record, candidates) {
  const keys = identityKeys(record);
  const exact = candidates.filter((candidate) => {
    const ck = [norm(candidate?.slug), norm(candidate?.name)].filter(Boolean);
    return keys.some((key) => ck.includes(key));
  });
  const unique = new Map(exact.map((candidate) => [String(candidate.id), candidate]));
  return [...unique.values()];
}

async function runDiscovery() {
  const started = Date.now();
  const apiKey = String(process.env.CMC_API_KEY || '').trim();
  if (!apiKey) throw new Error('CMC_API_KEY_REQUIRED');
  if (String(process.env.CMC_FORCE_KEYLESS || '').toLowerCase() === 'true') {
    throw new Error('CMC_FORCE_KEYLESS_NOT_ALLOWED');
  }

  const candidate = await generateV3Candidate();
  const records = Array.isArray(candidate.records) ? candidate.records : [];
  const mapped = records.filter((r) => r && r.cmcId !== undefined && r.cmcId !== null && String(r.cmcId).trim() !== '');
  const quotes = await fetchQuotes(mapped.map((r) => r.cmcId), apiKey);

  const failures = [];
  for (const record of mapped) {
    const currentId = String(record.cmcId);
    const asset = quotes.get(currentId);
    const desiredSymbol = String(record.symbol || '').toUpperCase();
    const returnedSymbol = String(asset?.symbol || '').toUpperCase();
    const slugMismatch = Boolean(asset && record.cmcSlug && String(asset.slug || '') !== String(record.cmcSlug));
    const symbolMismatch = Boolean(asset && returnedSymbol !== desiredSymbol);
    const invalidPrice = Boolean(asset && !finitePrice(asset));
    const notReturned = !asset;

    if (notReturned || symbolMismatch || slugMismatch || invalidPrice) {
      failures.push({
        record,
        current: asset || null,
        reasons: [
          ...(notReturned ? ['quote_not_returned'] : []),
          ...(symbolMismatch ? [`symbol_mismatch:${asset?.symbol || 'null'}`] : []),
          ...(slugMismatch ? [`slug_mismatch:${asset?.slug || 'null'}`] : []),
          ...(invalidPrice ? ['invalid_price'] : []),
        ],
      });
    }
  }

  const symbols = [...new Set(failures.map((x) => String(x.record.symbol || '').toUpperCase()).filter(Boolean))];
  const { out: mapsBySymbol, errors: mapErrors } = await mapSymbols(symbols, apiKey);

  const tentative = [];
  const review = [];

  for (const failure of failures) {
    const record = failure.record;
    const symbol = String(record.symbol || '').toUpperCase();
    const candidates = mapsBySymbol.get(symbol) || [];
    const exact = exactIdentityCandidates(record, candidates);

    if (exact.length === 1) {
      const candidateRow = exact[0];
      tentative.push({
        record,
        current: failure.current,
        reasons: failure.reasons,
        candidate: candidateRow,
      });
      continue;
    }

    review.push({
      canonical_id: record.id,
      symbol: record.symbol || null,
      current_cmc_id: record.cmcId ?? null,
      current_cmc_slug: record.cmcSlug ?? null,
      returned_symbol: failure.current?.symbol || null,
      returned_slug: failure.current?.slug || null,
      current_reasons: failure.reasons,
      discovery: mapErrors.has(symbol)
        ? 'MAP_QUERY_FAILED'
        : exact.length > 1
          ? 'MULTIPLE_EXACT_IDENTITY_CANDIDATES'
          : candidates.length === 1
            ? 'SINGLE_SYMBOL_CANDIDATE_IDENTITY_NOT_EXACT'
            : candidates.length > 1
              ? 'MULTIPLE_SYMBOL_CANDIDATES_NO_EXACT_IDENTITY'
              : 'NO_ACTIVE_CMC_SYMBOL_CANDIDATE',
      candidates: candidates.slice(0, 12).map((c) => ({
        id: c.id,
        symbol: c.symbol,
        name: c.name,
        slug: c.slug,
        is_active: c.is_active,
        rank: c.rank ?? c.cmc_rank ?? null,
      })),
      map_error: mapErrors.get(symbol) || null,
    });
  }

  const proposedQuotes = await fetchQuotes(tentative.map((x) => x.candidate.id), apiKey);
  const safeRemaps = [];

  for (const item of tentative) {
    const q = proposedQuotes.get(String(item.candidate.id));
    const desiredSymbol = String(item.record.symbol || '').toUpperCase();
    const quoteSymbol = String(q?.symbol || '').toUpperCase();

    if (q && finitePrice(q) && quoteSymbol === desiredSymbol) {
      safeRemaps.push({
        canonical_id: item.record.id,
        symbol: item.record.symbol || null,
        before: {
          cmcId: String(item.record.cmcId),
          cmcSlug: item.record.cmcSlug || null,
          returned_symbol: item.current?.symbol || null,
          returned_slug: item.current?.slug || null,
          reasons: item.reasons,
        },
        after: {
          cmcId: String(item.candidate.id),
          cmcSlug: item.candidate.slug || null,
          symbol: item.record.symbol || null,
          quote_symbol: q.symbol || null,
          quote_slug: q.slug || null,
        },
        confidence: 'HIGH',
        rule: 'unique_exact_identity + same_symbol + valid_live_quote',
      });
    } else {
      review.push({
        canonical_id: item.record.id,
        symbol: item.record.symbol || null,
        current_cmc_id: item.record.cmcId ?? null,
        current_cmc_slug: item.record.cmcSlug ?? null,
        current_reasons: item.reasons,
        discovery: !q ? 'EXACT_CANDIDATE_QUOTE_NOT_RETURNED' : (!finitePrice(q) ? 'EXACT_CANDIDATE_INVALID_PRICE' : 'EXACT_CANDIDATE_SYMBOL_CHANGED'),
        candidate: {
          id: item.candidate.id,
          symbol: item.candidate.symbol,
          name: item.candidate.name,
          slug: item.candidate.slug,
          quote_symbol: q?.symbol || null,
          quote_slug: q?.slug || null,
          valid_price: Boolean(q && finitePrice(q)),
        },
      });
    }
  }

  const duplicateTargetIds = [...new Set(
    safeRemaps
      .map((x) => x.after.cmcId)
      .filter((id, i, arr) => arr.indexOf(id) !== i),
  )];

  return {
    ok: duplicateTargetIds.length === 0,
    audit: 'stage5b_v4_targeted_mapping_discovery',
    environment: process.env.VERCEL_ENV || null,
    access_mode: process.env.CMC_ACCESS_MODE === 'PRO_API' ? 'PRO_API' : 'INVALID',
    source_candidate: candidate.source || null,
    safeguards: {
      modifies_token_index: false,
      preserves_canonical_symbol: true,
      active_map_symbol_query: true,
      exact_identity_required: true,
      same_symbol_required: true,
      valid_live_quote_required: true,
    },
    counts: {
      v3_total: records.length,
      v3_mapped: mapped.length,
      v3_failures_detected: failures.length,
      unique_failure_symbols: symbols.length,
      symbol_map_queries_ok: symbols.length - mapErrors.size,
      symbol_map_queries_failed: mapErrors.size,
      safe_remaps: safeRemaps.length,
      needs_review: review.length,
      duplicate_target_ids: duplicateTargetIds.length,
    },
    safe_remaps: safeRemaps,
    needs_review: review,
    duplicate_target_ids: duplicateTargetIds,
    elapsed_ms: Date.now() - started,
    ts: new Date().toISOString(),
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  if (process.env.VERCEL_ENV !== 'preview') return sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });
  if (!req.query || String(req.query.run || '') !== '1') {
    return sendJson(res, 400, { ok: false, error: 'DISCOVERY_CONFIRMATION_REQUIRED' });
  }

  try {
    const result = await runDiscovery();
    return sendJson(res, result.ok ? 200 : 500, result);
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      audit: 'stage5b_v4_targeted_mapping_discovery',
      error: err?.name === 'AbortError' ? 'CMC_TIMEOUT' : (err?.message || 'DISCOVERY_FAILED'),
      ts: new Date().toISOString(),
    });
  }
};
