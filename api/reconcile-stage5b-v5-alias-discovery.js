'use strict';

/**
 * Temporary Preview-only Stage5B V5 discovery endpoint.
 *
 * Generates the V3 candidate in memory, then uses the full active CMC map to
 * propose only conservative alias-aware remaps. It never modifies token-index.json.
 *
 * GET /api/reconcile-stage5b-v5-alias-discovery?run=1
 */

const reconcileV3Handler = require('./reconcile-stage5b-v3.js');

const CMC_BASE = 'https://pro-api.coinmarketcap.com';
const QUOTE_BATCH = 90;
const MAP_PAGE = 5000;
const MAX_MAP_PAGES = 4;
const TIMEOUT_MS = 10000;

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

function words(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

const GENERIC = new Set([
  'protocol', 'network', 'finance', 'dao', 'token', 'coin', 'chain', 'blockchain',
  'labs', 'lab', 'foundation', 'ecosystem', 'project', 'app', 'xyz', 'official',
]);

function core(value) {
  return words(value).filter((x) => !GENERIC.has(x)).join('');
}

function finitePrice(asset) {
  const price = asset?.quote?.USD?.price;
  return price !== null && price !== undefined && Number.isFinite(Number(price)) && Number(price) >= 0;
}

async function fetchJson(url, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PAYD-Stage5B-V5-Alias-Discovery/1.0',
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
  await reconcileV3Handler({ method: 'GET', query: { run: '1', format: 'index' } }, fakeRes);
  if (fakeRes.statusCode !== 200) throw new Error(`RECONCILE_V3_FAILED:${fakeRes.statusCode}:${body.slice(0, 220)}`);
  try { return JSON.parse(body); } catch { throw new Error('RECONCILE_V3_INVALID_JSON'); }
}

async function fetchQuotes(ids, apiKey) {
  const returned = new Map();
  const unique = [...new Set(ids.map(String).filter(Boolean))];
  for (const batch of chunk(unique, QUOTE_BATCH)) {
    const url = new URL(`${CMC_BASE}/v1/cryptocurrency/quotes/latest`);
    url.searchParams.set('id', batch.join(','));
    url.searchParams.set('convert', 'USD');
    const payload = await fetchJson(url, apiKey);
    for (const [key, asset] of Object.entries(payload?.data || {})) {
      if (!asset || typeof asset !== 'object') continue;
      returned.set(String(asset.id ?? key), asset);
    }
  }
  return returned;
}

async function fetchActiveMap(apiKey) {
  const assets = [];
  let start = 1;
  for (let page = 0; page < MAX_MAP_PAGES; page += 1) {
    const url = new URL(`${CMC_BASE}/v1/cryptocurrency/map`);
    url.searchParams.set('listing_status', 'active');
    url.searchParams.set('start', String(start));
    url.searchParams.set('limit', String(MAP_PAGE));
    const payload = await fetchJson(url, apiKey);
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    assets.push(...rows);
    if (rows.length < MAP_PAGE) break;
    start += MAP_PAGE;
  }
  return assets;
}

function recordForms(record) {
  const raw = [record.id, record.name, record.cmcSlug].filter(Boolean);
  return {
    full: [...new Set(raw.map(norm).filter(Boolean))],
    core: [...new Set(raw.map(core).filter((x) => x.length >= 4))],
  };
}

function candidateForms(candidate) {
  const raw = [candidate.slug, candidate.name].filter(Boolean);
  return {
    full: [...new Set(raw.map(norm).filter(Boolean))],
    core: [...new Set(raw.map(core).filter((x) => x.length >= 4))],
  };
}

function aliasScore(record, candidate) {
  const a = recordForms(record);
  const b = candidateForms(candidate);

  if (a.full.some((x) => b.full.includes(x))) return { score: 100, rule: 'exact_normalized_identity' };
  if (a.core.some((x) => b.core.includes(x))) return { score: 95, rule: 'exact_core_identity' };

  let best = 0;
  for (const x of [...a.full, ...a.core]) {
    for (const y of [...b.full, ...b.core]) {
      const short = x.length <= y.length ? x : y;
      const long = x.length > y.length ? x : y;
      if (short.length >= 5 && long.includes(short)) best = Math.max(best, 85);
    }
  }
  return best ? { score: best, rule: 'strong_containment_alias' } : { score: 0, rule: 'no_identity_match' };
}

async function runDiscovery() {
  const started = Date.now();
  const apiKey = String(process.env.CMC_API_KEY || '').trim();
  if (!apiKey) throw new Error('CMC_API_KEY_REQUIRED');
  if (String(process.env.CMC_FORCE_KEYLESS || '').toLowerCase() === 'true') throw new Error('CMC_FORCE_KEYLESS_NOT_ALLOWED');

  const [candidate, activeMap] = await Promise.all([generateV3Candidate(), fetchActiveMap(apiKey)]);
  const records = Array.isArray(candidate.records) ? candidate.records : [];
  const mapped = records.filter((r) => r && r.cmcId !== undefined && r.cmcId !== null && String(r.cmcId).trim() !== '');
  const existingQuotes = await fetchQuotes(mapped.map((r) => r.cmcId), apiKey);

  const bySymbol = new Map();
  for (const asset of activeMap) {
    if (!asset || Number(asset.is_active) !== 1) continue;
    const s = String(asset.symbol || '').toUpperCase();
    if (!s) continue;
    if (!bySymbol.has(s)) bySymbol.set(s, []);
    bySymbol.get(s).push(asset);
  }

  const failures = [];
  for (const record of mapped) {
    const q = existingQuotes.get(String(record.cmcId));
    const desired = String(record.symbol || '').toUpperCase();
    const returned = String(q?.symbol || '').toUpperCase();
    const reasons = [];
    if (!q) reasons.push('quote_not_returned');
    else {
      if (returned !== desired) reasons.push(`symbol_mismatch:${q.symbol || 'null'}`);
      if (record.cmcSlug && String(q.slug || '') !== String(record.cmcSlug)) reasons.push(`slug_mismatch:${q.slug || 'null'}`);
      if (!finitePrice(q)) reasons.push('invalid_price');
    }
    if (reasons.length) failures.push({ record, current: q || null, reasons });
  }

  const tentative = [];
  const review = [];

  for (const failure of failures) {
    const record = failure.record;
    const symbol = String(record.symbol || '').toUpperCase();
    const candidates = (bySymbol.get(symbol) || []).map((c) => ({ candidate: c, ...aliasScore(record, c) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || Number(a.candidate.rank ?? 1e9) - Number(b.candidate.rank ?? 1e9));

    const top = candidates[0] || null;
    const second = candidates[1] || null;
    const uniqueStrong = Boolean(top && top.score >= 85 && (!second || top.score - second.score >= 10));

    if (uniqueStrong) {
      tentative.push({ failure, top, candidateCount: (bySymbol.get(symbol) || []).length });
    } else {
      review.push({
        canonical_id: record.id,
        symbol: record.symbol || null,
        current_cmc_id: record.cmcId ?? null,
        current_cmc_slug: record.cmcSlug ?? null,
        current_reasons: failure.reasons,
        discovery: !top ? 'NO_ALIAS_IDENTITY_MATCH' : 'AMBIGUOUS_ALIAS_IDENTITY',
        scored_candidates: candidates.slice(0, 8).map((x) => ({
          id: x.candidate.id,
          symbol: x.candidate.symbol,
          name: x.candidate.name,
          slug: x.candidate.slug,
          rank: x.candidate.rank ?? x.candidate.cmc_rank ?? null,
          score: x.score,
          rule: x.rule,
        })),
      });
    }
  }

  const proposedQuotes = await fetchQuotes(tentative.map((x) => x.top.candidate.id), apiKey);
  const safeAliasRemaps = [];

  for (const item of tentative) {
    const record = item.failure.record;
    const c = item.top.candidate;
    const q = proposedQuotes.get(String(c.id));
    const desired = String(record.symbol || '').toUpperCase();
    const qSymbol = String(q?.symbol || '').toUpperCase();

    if (q && finitePrice(q) && qSymbol === desired) {
      safeAliasRemaps.push({
        canonical_id: record.id,
        symbol: record.symbol || null,
        before: {
          cmcId: String(record.cmcId),
          cmcSlug: record.cmcSlug || null,
          returned_symbol: item.failure.current?.symbol || null,
          returned_slug: item.failure.current?.slug || null,
          reasons: item.failure.reasons,
        },
        after: {
          cmcId: String(c.id),
          cmcSlug: c.slug || null,
          symbol: record.symbol || null,
          quote_symbol: q.symbol || null,
          quote_slug: q.slug || null,
        },
        confidence: 'HIGH',
        score: item.top.score,
        rule: item.top.rule,
        same_symbol_active_candidates: item.candidateCount,
      });
    } else {
      review.push({
        canonical_id: record.id,
        symbol: record.symbol || null,
        current_cmc_id: record.cmcId ?? null,
        current_cmc_slug: record.cmcSlug ?? null,
        current_reasons: item.failure.reasons,
        discovery: !q ? 'ALIAS_CANDIDATE_QUOTE_NOT_RETURNED' : (!finitePrice(q) ? 'ALIAS_CANDIDATE_INVALID_PRICE' : 'ALIAS_CANDIDATE_SYMBOL_CHANGED'),
        candidate: {
          id: c.id,
          symbol: c.symbol,
          name: c.name,
          slug: c.slug,
          score: item.top.score,
          rule: item.top.rule,
          quote_symbol: q?.symbol || null,
          quote_slug: q?.slug || null,
          valid_price: Boolean(q && finitePrice(q)),
        },
      });
    }
  }

  const targetIds = safeAliasRemaps.map((x) => x.after.cmcId);
  const duplicateTargetIds = [...new Set(targetIds.filter((id, i) => targetIds.indexOf(id) !== i))];

  return {
    ok: duplicateTargetIds.length === 0,
    audit: 'stage5b_v5_alias_mapping_discovery',
    environment: process.env.VERCEL_ENV || null,
    access_mode: process.env.CMC_ACCESS_MODE === 'PRO_API' ? 'PRO_API' : 'INVALID',
    source_candidate: candidate.source || null,
    safeguards: {
      modifies_token_index: false,
      preserves_canonical_symbol: true,
      active_map_only: true,
      same_symbol_required: true,
      valid_live_quote_required: true,
      minimum_alias_score: 85,
      minimum_margin: 10,
    },
    counts: {
      v3_total: records.length,
      v3_mapped: mapped.length,
      v3_failures_detected: failures.length,
      active_map_loaded: activeMap.length,
      safe_alias_remaps: safeAliasRemaps.length,
      needs_review: review.length,
      duplicate_target_ids: duplicateTargetIds.length,
    },
    safe_alias_remaps: safeAliasRemaps,
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
  if (!req.query || String(req.query.run || '') !== '1') return sendJson(res, 400, { ok: false, error: 'DISCOVERY_CONFIRMATION_REQUIRED' });

  try {
    const result = await runDiscovery();
    return sendJson(res, result.ok ? 200 : 500, result);
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      audit: 'stage5b_v5_alias_mapping_discovery',
      error: err?.name === 'AbortError' ? 'CMC_TIMEOUT' : (err?.message || 'DISCOVERY_FAILED'),
      ts: new Date().toISOString(),
    });
  }
};
