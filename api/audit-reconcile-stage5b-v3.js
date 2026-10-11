'use strict';

/**
 * Temporary Preview-only audit for the in-memory output of reconcile-stage5b-v3.
 * It does NOT replace token-index.json. It generates the V3 candidate, then
 * validates every mapped CMC ID against authenticated CoinMarketCap PRO quotes.
 *
 * GET /api/audit-reconcile-stage5b-v3?run=1
 */

const reconcileV3Handler = require('./reconcile-stage5b-v3.js');

const BATCH_SIZE = 90;
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

function finitePrice(asset) {
  const price = asset?.quote?.USD?.price;
  return price !== null && price !== undefined && Number.isFinite(Number(price)) && Number(price) >= 0;
}

async function generateCandidate() {
  let body = '';
  const headers = {};
  const fakeRes = {
    statusCode: 200,
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; },
    end(value) { body += value || ''; },
  };

  await reconcileV3Handler(
    { method: 'GET', query: { run: '1', format: 'index' } },
    fakeRes,
  );

  if (fakeRes.statusCode !== 200) {
    throw new Error(`RECONCILE_V3_FAILED:${fakeRes.statusCode}:${body.slice(0, 240)}`);
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error('RECONCILE_V3_INVALID_JSON');
  }
}

async function fetchQuoteBatch(ids, apiKey) {
  const url = new URL('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest');
  url.searchParams.set('id', ids.join(','));
  url.searchParams.set('convert', 'USD');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PAYD-Stage5B-V3-Candidate-Audit/1.0',
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
    return payload?.data || {};
  } finally {
    clearTimeout(timer);
  }
}

async function runAudit() {
  const started = Date.now();
  const apiKey = String(process.env.CMC_API_KEY || '').trim();
  if (!apiKey) throw new Error('CMC_API_KEY_REQUIRED');
  if (String(process.env.CMC_FORCE_KEYLESS || '').toLowerCase() === 'true') {
    throw new Error('CMC_FORCE_KEYLESS_NOT_ALLOWED');
  }

  const candidate = await generateCandidate();
  const records = Array.isArray(candidate.records) ? candidate.records : [];
  const mapped = records.filter((r) => r && r.cmcId !== undefined && r.cmcId !== null && String(r.cmcId).trim() !== '');
  const unmapped = records.filter((r) => !r || r.cmcId === undefined || r.cmcId === null || String(r.cmcId).trim() === '');

  const canonicalIds = records.map((r) => String(r?.id || ''));
  const cmcIds = mapped.map((r) => String(r.cmcId));
  const duplicateCanonical = [...new Set(canonicalIds.filter((id, i) => id && canonicalIds.indexOf(id) !== i))];
  const duplicateCmc = [...new Set(cmcIds.filter((id, i) => cmcIds.indexOf(id) !== i))];

  const structuralFailures = [];
  if (records.length !== EXPECTED_TOTAL) structuralFailures.push(`total_expected_${EXPECTED_TOTAL}_got_${records.length}`);
  if (mapped.length !== EXPECTED_MAPPED) structuralFailures.push(`mapped_expected_${EXPECTED_MAPPED}_got_${mapped.length}`);
  if (unmapped.length !== EXPECTED_UNMAPPED) structuralFailures.push(`unmapped_expected_${EXPECTED_UNMAPPED}_got_${unmapped.length}`);
  if (duplicateCanonical.length) structuralFailures.push(`duplicate_canonical_ids:${duplicateCanonical.join(',')}`);
  if (duplicateCmc.length) structuralFailures.push(`duplicate_cmc_ids:${duplicateCmc.join(',')}`);

  const returned = new Map();
  for (const batch of chunk(cmcIds, BATCH_SIZE)) {
    const payload = await fetchQuoteBatch(batch, apiKey);
    for (const [key, asset] of Object.entries(payload)) {
      if (!asset || typeof asset !== 'object') continue;
      returned.set(String(asset.id ?? key), asset);
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
      if (String(asset.symbol || '').toUpperCase() !== String(record.symbol || '').toUpperCase()) {
        reasons.push(`symbol_mismatch:${asset.symbol || 'null'}`);
      }
      if (record.cmcSlug && String(asset.slug || '') !== String(record.cmcSlug)) {
        reasons.push(`slug_mismatch:${asset.slug || 'null'}`);
      }
      if (!finitePrice(asset)) reasons.push('invalid_price');
    }

    const row = {
      canonical_id: record.id,
      symbol: record.symbol || null,
      expected_cmc_id: expectedId,
      expected_cmc_slug: record.cmcSlug || null,
      returned_symbol: asset?.symbol || null,
      returned_slug: asset?.slug || null,
      reasons,
    };
    if (reasons.length) failures.push(row); else passes.push(row);
  }

  const mandatoryIds = ['bitcoin', 'ethereum', 'chainlink', 'ondo-finance', 'bittensor', 'aave', 'decentraland'];
  const mandatory = mandatoryIds.map((id) => {
    const fail = failures.find((x) => x.canonical_id === id);
    const pass = passes.find((x) => x.canonical_id === id);
    return { canonical_id: id, status: fail ? 'FAIL' : pass ? 'PASS' : 'NOT_FOUND', reasons: fail?.reasons || [] };
  });

  const ok = structuralFailures.length === 0 && failures.length === 0 && passes.length === EXPECTED_MAPPED;
  return {
    ok,
    audit: 'stage5b_reconcile_v3_candidate',
    environment: process.env.VERCEL_ENV || null,
    access_mode: process.env.CMC_ACCESS_MODE === 'PRO_API' ? 'PRO_API' : 'INVALID',
    candidate_source: candidate.source || null,
    counts: {
      dataset_total: records.length,
      mapped_checked: mapped.length,
      unmapped: unmapped.length,
      returned_quotes: returned.size,
      pass: passes.length,
      fail: failures.length,
      duplicate_cmc_ids: duplicateCmc.length,
      duplicate_canonical_ids: duplicateCanonical.length,
      batches: Math.ceil(cmcIds.length / BATCH_SIZE),
    },
    mandatory,
    structural_failures: structuralFailures,
    failures,
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
    return sendJson(res, 400, { ok: false, error: 'AUDIT_CONFIRMATION_REQUIRED' });
  }

  try {
    const result = await runAudit();
    return sendJson(res, result.ok ? 200 : 500, result);
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      audit: 'stage5b_reconcile_v3_candidate',
      error: err?.name === 'AbortError' ? 'CMC_TIMEOUT' : (err?.message || 'AUDIT_FAILED'),
      ts: new Date().toISOString(),
    });
  }
};
