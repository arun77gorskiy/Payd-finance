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

async function fetchJson(url, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PAYD-Stage5B-Reconcile/3.0',
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

function identityKeys(record) {
  return [...new Set([record.id, record.name, record.cmcSlug].map(norm).filter(Boolean))];
}

function buildIndexes(assets) {
  const bySymbol = new Map();
  for (const asset of assets) {
    if (!asset || typeof asset !== 'object') continue;
    const symbol = String(asset.symbol || '').toUpperCase();
    if (!symbol) continue;
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
    bySymbol.get(symbol).push(asset);
  }
  return { bySymbol };
}

function exactIdentityMatch(record, candidate) {
  const keys = identityKeys(record);
  const candidateKeys = [norm(candidate.slug), norm(candidate.name)].filter(Boolean);
  return keys.some((k) => candidateKeys.includes(k));
}

function chooseStrictCandidate(record, indexes) {
  const desiredSymbol = String(record.symbol || '').toUpperCase();
  const candidates = (indexes.bySymbol.get(desiredSymbol) || [])
    .filter((asset) => Number(asset.is_active) === 1 || asset.status === 'active')
    .filter((asset) => exactIdentityMatch(record, asset));

  const unique = new Map(candidates.map((asset) => [String(asset.id), asset]));
  const rows = [...unique.values()]
    .sort((a, b) => Number(a.rank ?? a.cmc_rank ?? 1e9) - Number(b.rank ?? b.cmc_rank ?? 1e9));

  if (rows.length === 1) return { status: 'STRICT_MATCH', candidate: rows[0], candidates: rows };
  if (rows.length > 1) return { status: 'AMBIGUOUS_STRICT_MATCH', candidate: null, candidates: rows };
  return { status: 'NO_STRICT_MATCH', candidate: null, candidates: [] };
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
  const proposed = [];

  for (const record of mapped) {
    const currentId = String(record.cmcId);
    const current = existingQuotes.get(currentId);
    const desiredSymbol = String(record.symbol || '').toUpperCase();

    if (current) {
      const currentSymbol = String(current.symbol || '').toUpperCase();
      const sameSymbol = Boolean(desiredSymbol && currentSymbol === desiredSymbol);
      if (sameSymbol && finitePrice(current)) {
        const beforeSlug = record.cmcSlug || null;
        const afterSlug = current.slug || null;
        if (beforeSlug !== afterSlug) {
          record.cmcSlug = afterSlug;
          changes.push({
            canonical_id: record.id,
            type: 'REFRESH_SLUG_ONLY',
            before: { cmcId: currentId, cmcSlug: beforeSlug, symbol: record.symbol || null },
            after: { cmcId: currentId, cmcSlug: afterSlug, symbol: record.symbol || null },
          });
        }
        continue;
      }

      if (currentSymbol !== desiredSymbol && finitePrice(current)) {
        // Never auto-accept a symbol-changing rebrand. Canonical identity needs explicit review.
      }
    }

    const selection = chooseStrictCandidate(record, indexes);
    if (selection.status !== 'STRICT_MATCH') {
      unresolved.push({
        canonical_id: record.id,
        symbol: record.symbol,
        current_cmc_id: record.cmcId ?? null,
        current_cmc_slug: record.cmcSlug ?? null,
        reason: current
          ? (!finitePrice(current) ? 'CURRENT_INVALID_PRICE_NO_UNIQUE_STRICT_REMAP' : 'CURRENT_IDENTITY_MISMATCH_NO_UNIQUE_STRICT_REMAP')
          : 'CURRENT_ID_NOT_RETURNED_NO_UNIQUE_STRICT_REMAP',
        returned: current ? {
          id: current.id,
          symbol: current.symbol,
          slug: current.slug,
          has_valid_price: finitePrice(current),
        } : null,
        strict_candidates: selection.candidates.map((asset) => ({
          id: asset.id,
          symbol: asset.symbol,
          slug: asset.slug,
          name: asset.name,
          rank: asset.rank ?? asset.cmc_rank ?? null,
        })),
      });
      continue;
    }

    const candidate = selection.candidate;
    const candidateId = String(candidate.id);
    const owner = reservedIds.get(candidateId);
    if (owner && owner !== record.id) {
      unresolved.push({
        canonical_id: record.id,
        symbol: record.symbol,
        current_cmc_id: record.cmcId ?? null,
        reason: 'STRICT_CANDIDATE_ID_ALREADY_RESERVED',
        strict_candidate: { id: candidate.id, symbol: candidate.symbol, slug: candidate.slug, name: candidate.name, owner },
      });
      continue;
    }

    proposed.push({ record, candidate });
  }

  const proposedQuotes = await fetchQuotesByIds(proposed.map((x) => x.candidate.id), apiKey);
  for (const { record, candidate } of proposed) {
    const quote = proposedQuotes.get(String(candidate.id));
    const desiredSymbol = String(record.symbol || '').toUpperCase();
    const quoteSymbol = String(quote?.symbol || '').toUpperCase();

    if (!quote || !finitePrice(quote) || quoteSymbol !== desiredSymbol) {
      unresolved.push({
        canonical_id: record.id,
        symbol: record.symbol,
        current_cmc_id: record.cmcId ?? null,
        reason: !quote ? 'STRICT_CANDIDATE_NO_QUOTE' : (!finitePrice(quote) ? 'STRICT_CANDIDATE_INVALID_PRICE' : 'STRICT_CANDIDATE_SYMBOL_CHANGED'),
        strict_candidate: { id: candidate.id, symbol: candidate.symbol, slug: candidate.slug, name: candidate.name },
      });
      continue;
    }

    const beforeId = String(record.cmcId);
    const before = { cmcId: beforeId, cmcSlug: record.cmcSlug || null, symbol: record.symbol || null };
    const after = { cmcId: String(candidate.id), cmcSlug: candidate.slug || null, symbol: record.symbol || null };

    if (beforeId !== after.cmcId) reservedIds.delete(beforeId);
    reservedIds.set(after.cmcId, record.id);
    record.cmcId = after.cmcId;
    record.cmcSlug = after.cmcSlug;
    // Canonical symbol is intentionally preserved.
    changes.push({ canonical_id: record.id, type: 'STRICT_REMAP_SAME_SYMBOL', before, after });
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
  dataset.source = 'PAYD canonical + CoinMarketCap strict same-symbol Stage5B reconciliation v3';

  return {
    dataset,
    report: {
      ok: true,
      mode: 'strict_same_symbol_v3',
      safeguards: {
        preserve_canonical_symbol: true,
        auto_rebrand: false,
        require_unique_exact_identity: true,
        require_same_symbol: true,
        require_valid_price: true,
      },
      counts: {
        total: records.length,
        mapped_before: mapped.length,
        mapped_after: mappedAfter.length,
        changed: changes.length,
        unresolved: unresolved.length,
        duplicate_cmc_ids: duplicateIds.length,
        active_map_loaded: activeMap.length,
      },
      changes,
      unresolved,
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
    if (format === 'index') return sendJson(res, 200, result.dataset, 'token-index-reconciled-v3.json');
    return sendJson(res, 200, result.report);
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      error: err && err.name === 'AbortError' ? 'CMC_TIMEOUT' : (err?.message || 'RECONCILE_FAILED'),
      ts: new Date().toISOString(),
    });
  }
};
