'use strict';

/**
 * Temporary Preview-only Stage5B V6 audit.
 *
 * Tightens V5 by using only canonical id + intended cmcSlug as identity anchors.
 * record.name is deliberately excluded because some records contain ticker-like
 * names that can create false positives (for example BENJI).
 *
 * The endpoint generates the V3 candidate in memory, discovers conservative
 * same-symbol remaps, applies them only in memory, then re-audits all mappings.
 * It never modifies token-index.json.
 *
 * GET /api/reconcile-stage5b-v6-anchor-audit?run=1
 */

const reconcileV3Handler = require('./reconcile-stage5b-v3.js');

const CMC_BASE = 'https://pro-api.coinmarketcap.com';
const QUOTE_BATCH = 90;
const MAP_PAGE = 5000;
const MAX_MAP_PAGES = 4;
const TIMEOUT_MS = 10000;
const EXPECTED_TOTAL = 354;
const EXPECTED_MAPPED = 323;
const EXPECTED_UNMAPPED = 31;

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
        'User-Agent': 'PAYD-Stage5B-V6-Anchor-Audit/1.0',
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

function anchorForms(record) {
  const raw = [record.id, record.cmcSlug].filter(Boolean);
  return {
    full: [...new Set(raw.map(norm).filter((x) => x.length >= 4))],
    core: [...new Set(raw.map(core).filter((x) => x.length >= 4))],
  };
}

function candidateForms(candidate) {
  const raw = [candidate.slug, candidate.name].filter(Boolean);
  return {
    full: [...new Set(raw.map(norm).filter((x) => x.length >= 4))],
    core: [...new Set(raw.map(core).filter((x) => x.length >= 4))],
  };
}

function anchorScore(record, candidate) {
  const a = anchorForms(record);
  const b = candidateForms(candidate);

  if (a.full.some((x) => b.full.includes(x))) return { score: 100, rule: 'exact_canonical_anchor' };
  if (a.core.some((x) => b.core.includes(x))) return { score: 95, rule: 'exact_canonical_core' };

  let best = 0;
  for (const x of [...a.full, ...a.core]) {
    for (const y of [...b.full, ...b.core]) {
      const short = x.length <= y.length ? x : y;
      const long = x.length > y.length ? x : y;
      if (short.length >= 5 && long.includes(short)) best = Math.max(best, 85);
    }
  }
  return best ? { score: best, rule: 'canonical_anchor_containment' } : { score: 0, rule: 'no_anchor_match' };
}

function failureReasons(record, asset) {
  const reasons = [];
  if (!asset) return ['quote_not_returned'];
  if (String(asset.symbol || '').toUpperCase() !== String(record.symbol || '').toUpperCase()) {
    reasons.push(`symbol_mismatch:${asset.symbol || 'null'}`);
  }
  if (record.cmcSlug && String(asset.slug || '') !== String(record.cmcSlug)) {
    reasons.push(`slug_mismatch:${asset.slug || 'null'}`);
  }
  if (!finitePrice(asset)) reasons.push('invalid_price');
  return reasons;
}

async function runAudit() {
  const started = Date.now();
  const apiKey = String(process.env.CMC_API_KEY || '').trim();
  if (!apiKey) throw new Error('CMC_API_KEY_REQUIRED');
  if (String(process.env.CMC_FORCE_KEYLESS || '').toLowerCase() === 'true') throw new Error('CMC_FORCE_KEYLESS_NOT_ALLOWED');

  const [candidate, activeMap] = await Promise.all([generateV3Candidate(), fetchActiveMap(apiKey)]);
  const records = Array.isArray(candidate.records) ? candidate.records : [];
  const mapped = records.filter((r) => r && r.cmcId !== undefined && r.cmcId !== null && String(r.cmcId).trim() !== '');
  const unmapped = records.filter((r) => !r || r.cmcId === undefined || r.cmcId === null || String(r.cmcId).trim() === '');

  if (records.length !== EXPECTED_TOTAL || mapped.length !== EXPECTED_MAPPED || unmapped.length !== EXPECTED_UNMAPPED) {
    throw new Error(`BASELINE_MISMATCH:${records.length}/${mapped.length}/${unmapped.length}`);
  }

  const bySymbol = new Map();
  for (const asset of activeMap) {
    if (!asset || Number(asset.is_active) !== 1) continue;
    const symbol = String(asset.symbol || '').toUpperCase();
    if (!symbol) continue;
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
    bySymbol.get(symbol).push(asset);
  }

  const beforeQuotes = await fetchQuotes(mapped.map((r) => r.cmcId), apiKey);
  const failures = mapped
    .map((record) => ({ record, asset: beforeQuotes.get(String(record.cmcId)) || null }))
    .map((x) => ({ ...x, reasons: failureReasons(x.record, x.asset) }))
    .filter((x) => x.reasons.length);

  const tentative = [];
  const rejected = [];

  for (const failure of failures) {
    const record = failure.record;
    const symbol = String(record.symbol || '').toUpperCase();
    const scored = (bySymbol.get(symbol) || [])
      .map((c) => ({ candidate: c, ...anchorScore(record, c) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || Number(a.candidate.rank ?? 1e9) - Number(b.candidate.rank ?? 1e9));

    const top = scored[0] || null;
    const second = scored[1] || null;
    const uniqueStrong = Boolean(top && top.score >= 85 && (!second || top.score - second.score >= 10));

    if (uniqueStrong) {
      tentative.push({ failure, top, sameSymbolCount: (bySymbol.get(symbol) || []).length });
    } else {
      rejected.push({
        canonical_id: record.id,
        symbol: record.symbol || null,
        current_cmc_id: record.cmcId ?? null,
        reasons: failure.reasons,
        reason: !top ? 'NO_CANONICAL_ANCHOR_MATCH' : 'AMBIGUOUS_CANONICAL_ANCHOR_MATCH',
        candidates: scored.slice(0, 6).map((x) => ({
          id: x.candidate.id,
          symbol: x.candidate.symbol,
          name: x.candidate.name,
          slug: x.candidate.slug,
          score: x.score,
          rule: x.rule,
        })),
      });
    }
  }

  const candidateQuotes = await fetchQuotes(tentative.map((x) => x.top.candidate.id), apiKey);
  const accepted = [];

  for (const item of tentative) {
    const record = item.failure.record;
    const c = item.top.candidate;
    const q = candidateQuotes.get(String(c.id));
    const sameSymbol = String(q?.symbol || '').toUpperCase() === String(record.symbol || '').toUpperCase();
    if (!q || !finitePrice(q) || !sameSymbol) {
      rejected.push({
        canonical_id: record.id,
        symbol: record.symbol || null,
        current_cmc_id: record.cmcId ?? null,
        reasons: item.failure.reasons,
        reason: !q ? 'CANDIDATE_QUOTE_NOT_RETURNED' : (!finitePrice(q) ? 'CANDIDATE_INVALID_PRICE' : 'CANDIDATE_SYMBOL_CHANGED'),
        candidate: { id: c.id, symbol: c.symbol, name: c.name, slug: c.slug, score: item.top.score, rule: item.top.rule },
      });
      continue;
    }

    accepted.push({
      canonical_id: record.id,
      symbol: record.symbol || null,
      before: { cmcId: String(record.cmcId), cmcSlug: record.cmcSlug || null },
      after: { cmcId: String(c.id), cmcSlug: c.slug || null },
      score: item.top.score,
      rule: item.top.rule,
      same_symbol_active_candidates: item.sameSymbolCount,
    });
  }

  // Apply accepted remaps only to this in-memory candidate.
  const acceptedById = new Map(accepted.map((x) => [x.canonical_id, x]));
  for (const record of mapped) {
    const remap = acceptedById.get(record.id);
    if (!remap) continue;
    record.cmcId = remap.after.cmcId;
    record.cmcSlug = remap.after.cmcSlug;
  }

  const postMapped = records.filter((r) => r && r.cmcId !== undefined && r.cmcId !== null && String(r.cmcId).trim() !== '');
  const cmcIds = postMapped.map((r) => String(r.cmcId));
  const duplicateCmc = [...new Set(cmcIds.filter((id, i) => cmcIds.indexOf(id) !== i))];
  const postQuotes = await fetchQuotes(cmcIds, apiKey);
  const postFailures = [];
  const postPasses = [];

  for (const record of postMapped) {
    const asset = postQuotes.get(String(record.cmcId)) || null;
    const reasons = failureReasons(record, asset);
    const row = {
      canonical_id: record.id,
      symbol: record.symbol || null,
      expected_cmc_id: String(record.cmcId),
      expected_cmc_slug: record.cmcSlug || null,
      returned_symbol: asset?.symbol || null,
      returned_slug: asset?.slug || null,
      reasons,
    };
    if (reasons.length) postFailures.push(row); else postPasses.push(row);
  }

  const mandatoryIds = ['bitcoin', 'ethereum', 'chainlink', 'ondo-finance', 'bittensor', 'aave', 'decentraland'];
  const mandatory = mandatoryIds.map((id) => {
    const fail = postFailures.find((x) => x.canonical_id === id);
    const pass = postPasses.find((x) => x.canonical_id === id);
    return { canonical_id: id, status: fail ? 'FAIL' : pass ? 'PASS' : 'NOT_FOUND', reasons: fail?.reasons || [] };
  });

  return {
    ok: duplicateCmc.length === 0,
    audit: 'stage5b_v6_canonical_anchor_audit',
    environment: process.env.VERCEL_ENV || null,
    access_mode: process.env.CMC_ACCESS_MODE === 'PRO_API' ? 'PRO_API' : 'INVALID',
    safeguards: {
      modifies_token_index: false,
      canonical_anchor_fields: ['id', 'cmcSlug'],
      record_name_excluded: true,
      canonical_symbol_preserved: true,
      same_symbol_required: true,
      active_map_only: true,
      valid_live_quote_required: true,
      minimum_score: 85,
      minimum_margin: 10,
    },
    counts: {
      dataset_total: records.length,
      mapped: postMapped.length,
      unmapped: records.length - postMapped.length,
      v3_failures_before: failures.length,
      accepted_anchor_remaps: accepted.length,
      rejected_or_unresolved: rejected.length,
      pass_after: postPasses.length,
      fail_after: postFailures.length,
      duplicate_cmc_ids: duplicateCmc.length,
      active_map_loaded: activeMap.length,
    },
    accepted_anchor_remaps: accepted,
    mandatory,
    failures_after: postFailures,
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
  if (!req.query || String(req.query.run || '') !== '1') return sendJson(res, 400, { ok: false, error: 'AUDIT_CONFIRMATION_REQUIRED' });

  try {
    const result = await runAudit();
    return sendJson(res, result.ok ? 200 : 500, result);
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      audit: 'stage5b_v6_canonical_anchor_audit',
      error: err?.name === 'AbortError' ? 'CMC_TIMEOUT' : (err?.message || 'AUDIT_FAILED'),
      ts: new Date().toISOString(),
    });
  }
};
