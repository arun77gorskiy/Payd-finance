'use strict';

const datasetTemplate = require('../public/data/intelligence/token-index.json');

const PUBLIC_API = 'https://pro-api.coinmarketcap.com/public-api';
const QUOTE_BATCH = 90;
const SYMBOL_BATCH = 45;
const TIMEOUT_MS = 8000;
const EXPECTED_TOTAL = 354;
const EXPECTED_MAPPED = 323;
const EXPECTED_UNMAPPED = 31;

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function norm(value) {
  return String(value ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');
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

function nameScore(record, candidate) {
  const rid = norm(record.id);
  const rname = norm(record.name);
  const rslug = norm(record.cmcSlug);
  const cslug = norm(candidate.slug);
  const cname = norm(candidate.name);
  let score = 0;

  for (const [a, b, pts] of [
    [rid, cslug, 120],
    [rname, cslug, 110],
    [rid, cname, 105],
    [rname, cname, 100],
    [rslug, cslug, 95],
  ]) {
    if (a && b && a === b) score = Math.max(score, pts);
  }

  for (const [a, b] of [[rid, cslug], [rname, cslug], [rid, cname], [rname, cname]]) {
    if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) score = Math.max(score, 72);
  }

  const overlap = Math.max(
    tokenOverlap(record.id, candidate.slug),
    tokenOverlap(record.name, candidate.name),
    tokenOverlap(record.name, candidate.slug),
  );
  if (overlap >= 1) score = Math.max(score, 90);
  else if (overlap >= 0.67) score = Math.max(score, 70);
  else if (overlap >= 0.5) score = Math.max(score, 55);

  if (Number(candidate.is_active) === 1) score += 20;
  if (candidate.status === 'active') score += 10;
  const rank = Number(candidate.rank ?? candidate.cmc_rank);
  if (Number.isFinite(rank) && rank > 0) {
    if (rank <= 500) score += 10;
    else if (rank <= 2000) score += 5;
  }
  return score;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'PAYD-Stage5B-Reconcile/1.0' },
    });
    if (!res.ok) throw new Error(`HTTP_${res.status}:${(await res.text()).slice(0, 160)}`);
    const body = await res.json();
    if (body?.status && Number(body.status.error_code || 0) !== 0) {
      throw new Error(`CMC_${body.status.error_code}:${body.status.error_message || 'unknown'}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchQuotesByIds(ids) {
  const returned = new Map();
  for (const batch of chunk([...new Set(ids.map(String))], QUOTE_BATCH)) {
    if (!batch.length) continue;
    const url = new URL(`${PUBLIC_API}/v3/cryptocurrency/quotes/latest`);
    url.searchParams.set('id', batch.join(','));
    url.searchParams.set('convert', 'USD');
    const payload = await fetchJson(url);
    for (const [key, raw] of Object.entries(payload?.data || {})) {
      for (const asset of (Array.isArray(raw) ? raw : [raw])) {
        if (!asset || typeof asset !== 'object') continue;
        returned.set(String(asset.id ?? key), asset);
      }
    }
  }
  return returned;
}

async function fetchMapBySymbols(symbols) {
  const bySymbol = new Map();
  const unique = [...new Set(symbols.map((s) => String(s || '').toUpperCase()).filter(Boolean))];
  for (const batch of chunk(unique, SYMBOL_BATCH)) {
    if (!batch.length) continue;
    const url = new URL(`${PUBLIC_API}/v1/cryptocurrency/map`);
    url.searchParams.set('symbol', batch.join(','));
    url.searchParams.set('aux', 'is_active,status,first_historical_data,last_historical_data');
    const payload = await fetchJson(url);
    for (const asset of payload?.data || []) {
      if (!asset || typeof asset !== 'object') continue;
      const symbol = String(asset.symbol || '').toUpperCase();
      if (!symbol) continue;
      if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
      bySymbol.get(symbol).push(asset);
    }
  }
  return bySymbol;
}

function chooseCandidate(record, candidates) {
  const desired = String(record.symbol || '').toUpperCase();
  const pool = candidates.filter((c) => String(c.symbol || '').toUpperCase() === desired);
  const scored = pool
    .map((candidate) => ({ candidate, score: nameScore(record, candidate) }))
    .sort((a, b) => b.score - a.score || Number(a.candidate.rank ?? 1e9) - Number(b.candidate.rank ?? 1e9));
  const best = scored[0];
  const second = scored[1];
  if (!best) return { status: 'NO_CANDIDATE', scored: [] };
  const active = Number(best.candidate.is_active) === 1 || best.candidate.status === 'active';
  const margin = second ? best.score - second.score : 999;
  return {
    status: active && best.score >= 95 && margin >= 15 ? 'HIGH_CONFIDENCE' : 'AMBIGUOUS',
    best,
    second: second || null,
    scored: scored.slice(0, 5),
  };
}

async function reconcile() {
  const dataset = JSON.parse(JSON.stringify(datasetTemplate));
  const records = Array.isArray(dataset.records) ? dataset.records : [];
  const mapped = records.filter((r) => r && r.cmcId !== undefined && r.cmcId !== null && String(r.cmcId).trim() !== '');
  const unmapped = records.filter((r) => !r || r.cmcId === undefined || r.cmcId === null || String(r.cmcId).trim() === '');

  if (records.length !== EXPECTED_TOTAL || mapped.length !== EXPECTED_MAPPED || unmapped.length !== EXPECTED_UNMAPPED) {
    throw new Error(`BASELINE_MISMATCH:${records.length}/${mapped.length}/${unmapped.length}`);
  }

  const existingQuotes = await fetchQuotesByIds(mapped.map((r) => r.cmcId));
  const changes = [];
  const unresolved = [];
  const invalidExisting = [];
  const needsCandidate = [];

  for (const record of mapped) {
    const current = existingQuotes.get(String(record.cmcId));
    if (!current) {
      needsCandidate.push({ record, reason: 'EXISTING_ID_NOT_RETURNED' });
      continue;
    }
    const sameSymbol = String(current.symbol || '').toUpperCase() === String(record.symbol || '').toUpperCase();
    const exactStoredSlug = Boolean(record.cmcSlug) && String(current.slug || '') === String(record.cmcSlug);

    if (sameSymbol || exactStoredSlug) {
      const before = { cmcId: String(record.cmcId), cmcSlug: record.cmcSlug || null, symbol: record.symbol || null };
      const after = { cmcId: String(current.id), cmcSlug: current.slug || null, symbol: current.symbol || record.symbol || null };
      if (before.cmcSlug !== after.cmcSlug || before.symbol !== after.symbol) {
        record.cmcSlug = after.cmcSlug;
        record.symbol = after.symbol;
        changes.push({ canonical_id: record.id, type: sameSymbol ? 'REFRESH_SLUG' : 'CONFIRMED_REBRAND', before, after });
      }
      if (!finitePrice(current)) invalidExisting.push({ canonical_id: record.id, cmcId: String(record.cmcId), symbol: record.symbol, slug: record.cmcSlug });
      continue;
    }

    needsCandidate.push({ record, reason: 'EXISTING_ID_IDENTITY_MISMATCH', returned: { id: current.id, symbol: current.symbol, slug: current.slug } });
  }

  const candidateMap = await fetchMapBySymbols(needsCandidate.map((x) => x.record.symbol));
  const proposed = [];

  for (const item of needsCandidate) {
    const record = item.record;
    const candidates = candidateMap.get(String(record.symbol || '').toUpperCase()) || [];
    const selection = chooseCandidate(record, candidates);
    if (selection.status !== 'HIGH_CONFIDENCE') {
      unresolved.push({
        canonical_id: record.id,
        symbol: record.symbol,
        current_cmc_id: record.cmcId ?? null,
        current_cmc_slug: record.cmcSlug ?? null,
        reason: item.reason,
        returned: item.returned || null,
        candidates: selection.scored.map((x) => ({ id: x.candidate.id, symbol: x.candidate.symbol, slug: x.candidate.slug, name: x.candidate.name, is_active: x.candidate.is_active, status: x.candidate.status, rank: x.candidate.rank, score: x.score })),
      });
      continue;
    }
    proposed.push({ record, candidate: selection.best.candidate, score: selection.best.score, reason: item.reason });
  }

  const proposedQuotes = await fetchQuotesByIds(proposed.map((x) => x.candidate.id));
  for (const item of proposed) {
    const { record, candidate, score, reason } = item;
    const quote = proposedQuotes.get(String(candidate.id));
    if (!quote || !finitePrice(quote)) {
      unresolved.push({
        canonical_id: record.id,
        symbol: record.symbol,
        current_cmc_id: record.cmcId ?? null,
        current_cmc_slug: record.cmcSlug ?? null,
        reason: quote ? 'PROPOSED_ID_INVALID_PRICE' : 'PROPOSED_ID_NO_QUOTE',
        proposed: { id: candidate.id, symbol: candidate.symbol, slug: candidate.slug, name: candidate.name, score },
      });
      continue;
    }
    const before = { cmcId: String(record.cmcId), cmcSlug: record.cmcSlug || null, symbol: record.symbol || null };
    const after = { cmcId: String(candidate.id), cmcSlug: candidate.slug || null, symbol: candidate.symbol || record.symbol || null };
    record.cmcId = after.cmcId;
    record.cmcSlug = after.cmcSlug;
    record.symbol = after.symbol;
    changes.push({ canonical_id: record.id, type: 'REMAP_HIGH_CONFIDENCE', reason, score, before, after });
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
  dataset.source = 'PAYD canonical + CoinMarketCap high-confidence Stage5B reconciliation';

  return {
    dataset,
    report: {
      ok: true,
      mode: 'high_confidence_only',
      counts: {
        total: records.length,
        mapped_before: mapped.length,
        mapped_after: mappedAfter.length,
        changed: changes.length,
        unresolved: unresolved.length,
        invalid_existing_price: invalidExisting.length,
        duplicate_cmc_ids: duplicateIds.length,
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
