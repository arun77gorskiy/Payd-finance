'use strict';

const datasetTemplate = require('../public/data/intelligence/token-index.json');

const CMC_BASE = 'https://pro-api.coinmarketcap.com';
const QUOTE_BATCH = 90;
const MAP_PAGE = 5000;
const MAX_MAP_PAGES = 4;
const TIMEOUT_MS = 10000;
const EXPECTED_TOTAL = 354;
const EXPECTED_MAPPED = 323;
const EXPECTED_UNMAPPED = 31;

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

function tokenOverlap(a, b) {
  const aa = String(a ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const bb = String(b ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (!aa.length || !bb.length) return 0;
  const A = new Set(aa);
  const B = new Set(bb);
  let common = 0;
  for (const x of A) if (B.has(x)) common += 1;
  return common / Math.max(A.size, B.size);
}

async function fetchJson(url, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PAYD-Stage5B-Reconcile/2.0',
        'X-CMC_PRO_API_KEY': apiKey,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP_${res.status}${text ? `:${text.slice(0, 180)}` : ''}`);
    }
    const body = await res.json();
    if (body?.status && Number(body.status.error_code || 0) !== 0) {
      throw new Error(`CMC_${body.status.error_code}:${body.status.error_message || 'unknown'}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchQuotesByIds(ids, apiKey) {
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

function buildIndexes(assets) {
  const bySymbol = new Map();
  const byIdentity = new Map();

  function addIdentity(key, asset) {
    if (!key) return;
    if (!byIdentity.has(key)) byIdentity.set(key, []);
    byIdentity.get(key).push(asset);
  }

  for (const asset of assets) {
    if (!asset || typeof asset !== 'object') continue;
    const symbol = String(asset.symbol || '').toUpperCase();
    if (symbol) {
      if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
      bySymbol.get(symbol).push(asset);
    }
    addIdentity(norm(asset.slug), asset);
    addIdentity(norm(asset.name), asset);
  }
  return { bySymbol, byIdentity };
}

function scoreCandidate(record, candidate) {
  const rid = norm(record.id);
  const rname = norm(record.name);
  const rslug = norm(record.cmcSlug);
  const rsym = String(record.symbol || '').toUpperCase();
  const cslug = norm(candidate.slug);
  const cname = norm(candidate.name);
  const csym = String(candidate.symbol || '').toUpperCase();

  let score = 0;
  const exactIdentity = [rid, rname, rslug].filter(Boolean).some((x) => x === cslug || x === cname);
  if (exactIdentity) score += 140;
  if (rsym && csym && rsym === csym) score += 70;

  const overlap = Math.max(
    tokenOverlap(record.id, candidate.slug),
    tokenOverlap(record.name, candidate.name),
    tokenOverlap(record.name, candidate.slug),
    tokenOverlap(record.cmcSlug, candidate.slug),
  );
  if (overlap >= 1) score += 60;
  else if (overlap >= 0.67) score += 35;
  else if (overlap >= 0.5) score += 20;

  if (Number(candidate.is_active) === 1 || candidate.status === 'active') score += 20;
  const rank = Number(candidate.rank ?? candidate.cmc_rank);
  if (Number.isFinite(rank) && rank > 0) {
    if (rank <= 500) score += 10;
    else if (rank <= 2000) score += 5;
  }

  return { score, exactIdentity, sameSymbol: Boolean(rsym && csym && rsym === csym) };
}

function chooseCandidate(record, indexes) {
  const poolMap = new Map();
  const keys = [norm(record.id), norm(record.name), norm(record.cmcSlug)].filter(Boolean);
  for (const key of keys) {
    for (const asset of indexes.byIdentity.get(key) || []) poolMap.set(String(asset.id), asset);
  }
  for (const asset of indexes.bySymbol.get(String(record.symbol || '').toUpperCase()) || []) {
    poolMap.set(String(asset.id), asset);
  }

  const scored = [...poolMap.values()]
    .map((candidate) => ({ candidate, ...scoreCandidate(record, candidate) }))
    .sort((a, b) => b.score - a.score || Number(a.candidate.rank ?? 1e9) - Number(b.candidate.rank ?? 1e9));

  const best = scored[0] || null;
  const second = scored[1] || null;
  if (!best) return { status: 'NO_CANDIDATE', scored: [] };

  const margin = second ? best.score - second.score : 999;
  const highConfidence =
    (best.exactIdentity && best.score >= 160 && margin >= 20) ||
    (best.sameSymbol && best.score >= 150 && margin >= 25);

  return {
    status: highConfidence ? 'HIGH_CONFIDENCE' : 'AMBIGUOUS',
    best,
    second,
    scored: scored.slice(0, 5),
  };
}

async function reconcile() {
  const apiKey = String(process.env.CMC_API_KEY || '').trim();
  if (!apiKey) throw new Error('CMC_API_KEY_REQUIRED');
  if (String(process.env.CMC_FORCE_KEYLESS || '').toLowerCase() === 'true') {
    throw new Error('CMC_FORCE_KEYLESS_NOT_ALLOWED');
  }

  const dataset = JSON.parse(JSON.stringify(datasetTemplate));
  const records = Array.isArray(dataset.records) ? dataset.records : [];
  const mapped = records.filter((r) => r && r.cmcId !== undefined && r.cmcId !== null && String(r.cmcId).trim() !== '');
  const unmapped = records.filter((r) => !r || r.cmcId === undefined || r.cmcId === null || String(r.cmcId).trim() === '');

  if (records.length !== EXPECTED_TOTAL || mapped.length !== EXPECTED_MAPPED || unmapped.length !== EXPECTED_UNMAPPED) {
    throw new Error(`BASELINE_MISMATCH:${records.length}/${mapped.length}/${unmapped.length}`);
  }

  const [existingQuotes, activeMap] = await Promise.all([
    fetchQuotesByIds(mapped.map((r) => r.cmcId), apiKey),
    fetchActiveMap(apiKey),
  ]);
  const indexes = buildIndexes(activeMap);
  const reservedIds = new Map(mapped.map((r) => [String(r.cmcId), r.id]));

  const changes = [];
  const unresolved = [];
  const invalidExisting = [];
  const proposed = [];

  for (const record of mapped) {
    const current = existingQuotes.get(String(record.cmcId));
    const desiredSymbol = String(record.symbol || '').toUpperCase();

    if (current) {
      const currentSymbol = String(current.symbol || '').toUpperCase();
      const sameSymbol = desiredSymbol && currentSymbol === desiredSymbol;
      const exactStoredSlug = Boolean(record.cmcSlug) && String(current.slug || '') === String(record.cmcSlug);
      const identityMatchesCanonical = [norm(record.id), norm(record.name), norm(record.cmcSlug)]
        .filter(Boolean)
        .some((x) => x === norm(current.slug) || x === norm(current.name));

      if ((sameSymbol || exactStoredSlug || identityMatchesCanonical) && finitePrice(current)) {
        const before = { cmcId: String(record.cmcId), cmcSlug: record.cmcSlug || null, symbol: record.symbol || null };
        const after = { cmcId: String(current.id), cmcSlug: current.slug || null, symbol: current.symbol || record.symbol || null };
        if (before.cmcSlug !== after.cmcSlug || before.symbol !== after.symbol) {
          record.cmcSlug = after.cmcSlug;
          record.symbol = after.symbol;
          changes.push({ canonical_id: record.id, type: sameSymbol ? 'REFRESH_METADATA' : 'CONFIRMED_REBRAND', before, after });
        }
        continue;
      }

      if (!finitePrice(current) && (sameSymbol || exactStoredSlug || identityMatchesCanonical)) {
        invalidExisting.push({ canonical_id: record.id, cmcId: String(record.cmcId), symbol: record.symbol, slug: record.cmcSlug || null });
      }
    }

    const selection = chooseCandidate(record, indexes);
    if (selection.status !== 'HIGH_CONFIDENCE') {
      unresolved.push({
        canonical_id: record.id,
        symbol: record.symbol,
        current_cmc_id: record.cmcId ?? null,
        current_cmc_slug: record.cmcSlug ?? null,
        reason: current ? 'IDENTITY_OR_PRICE_MISMATCH' : 'EXISTING_ID_NOT_RETURNED',
        returned: current ? { id: current.id, symbol: current.symbol, slug: current.slug, has_valid_price: finitePrice(current) } : null,
        candidates: selection.scored.map((x) => ({
          id: x.candidate.id,
          symbol: x.candidate.symbol,
          slug: x.candidate.slug,
          name: x.candidate.name,
          is_active: x.candidate.is_active,
          status: x.candidate.status,
          rank: x.candidate.rank ?? x.candidate.cmc_rank ?? null,
          score: x.score,
          exact_identity: x.exactIdentity,
          same_symbol: x.sameSymbol,
        })),
      });
      continue;
    }

    const candidate = selection.best.candidate;
    const candidateId = String(candidate.id);
    const owner = reservedIds.get(candidateId);
    if (owner && owner !== record.id) {
      unresolved.push({
        canonical_id: record.id,
        symbol: record.symbol,
        current_cmc_id: record.cmcId ?? null,
        reason: 'CANDIDATE_ID_ALREADY_RESERVED',
        candidate: { id: candidate.id, symbol: candidate.symbol, slug: candidate.slug, name: candidate.name, owner },
      });
      continue;
    }

    proposed.push({ record, candidate, score: selection.best.score });
  }

  const proposedQuotes = await fetchQuotesByIds(proposed.map((x) => x.candidate.id), apiKey);
  for (const item of proposed) {
    const { record, candidate, score } = item;
    const quote = proposedQuotes.get(String(candidate.id));
    if (!quote || !finitePrice(quote)) {
      unresolved.push({
        canonical_id: record.id,
        symbol: record.symbol,
        current_cmc_id: record.cmcId ?? null,
        reason: quote ? 'PROPOSED_ID_INVALID_PRICE' : 'PROPOSED_ID_NO_QUOTE',
        proposed: { id: candidate.id, symbol: candidate.symbol, slug: candidate.slug, name: candidate.name, score },
      });
      continue;
    }

    const beforeId = String(record.cmcId);
    const before = { cmcId: beforeId, cmcSlug: record.cmcSlug || null, symbol: record.symbol || null };
    const after = { cmcId: String(candidate.id), cmcSlug: candidate.slug || null, symbol: candidate.symbol || record.symbol || null };

    if (beforeId !== after.cmcId) reservedIds.delete(beforeId);
    reservedIds.set(after.cmcId, record.id);
    record.cmcId = after.cmcId;
    record.cmcSlug = after.cmcSlug;
    record.symbol = after.symbol;
    changes.push({ canonical_id: record.id, type: 'REMAP_HIGH_CONFIDENCE', score, before, after });
  }

  const ipfs = records.find((r) => r?.id === 'ipfs');
  if (ipfs) {
    delete ipfs.cmcId;
    delete ipfs.cmcSlug;
  }

  const mappedAfter = records.filter((r) => r && r.cmcId !== undefined && r.cmcId !== null && String(r.cmcId).trim() !== '');
  const cmcIds = mappedAfter.map((r) => String(r.cmcId));
  const duplicateIds = [...new Set(cmcIds.filter((id, i) => cmcIds.indexOf(id) !== i))];
  if (records.length !== EXPECTED_TOTAL || mappedAfter.length !== EXPECTED_MAPPED || duplicateIds.length) {
    throw new Error(`OUTPUT_INVARIANT_FAILED:${records.length}/${mappedAfter.length}/dup=${duplicateIds.join(',')}`);
  }

  dataset.generated_at = new Date().toISOString();
  dataset.source = 'PAYD canonical + CoinMarketCap high-confidence Stage5B reconciliation v2';

  return {
    dataset,
    report: {
      ok: true,
      mode: 'high_confidence_only_v2',
      counts: {
        total: records.length,
        mapped_before: mapped.length,
        mapped_after: mappedAfter.length,
        changed: changes.length,
        unresolved: unresolved.length,
        invalid_existing_price: invalidExisting.length,
        duplicate_cmc_ids: duplicateIds.length,
        active_map_loaded: activeMap.length,
      },
      changes,
      unresolved,
      invalid_existing_price: invalidExisting,
      ts: new Date().toISOString(),
    },
  };
}

function sendJson(res, status, body, attachmentName) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (attachmentName) res.setHeader('Content-Disposition', `attachment; filename="${attachmentName}"`);
  res.end(`${JSON.stringify(body, null, 2)}\n`);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  if (process.env.VERCEL_ENV !== 'preview') return sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });
  if (!req.query || String(req.query.run || '') !== '1') {
    return sendJson(res, 400, { ok: false, error: 'RECONCILE_CONFIRMATION_REQUIRED' });
  }

  try {
    const result = await reconcile();
    const format = String(req.query.format || 'report');
    if (format === 'index') return sendJson(res, 200, result.dataset, 'token-index-reconciled.json');
    return sendJson(res, 200, result.report);
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      error: err && err.name === 'AbortError' ? 'CMC_TIMEOUT' : (err?.message || 'RECONCILE_FAILED'),
      ts: new Date().toISOString(),
    });
  }
};
