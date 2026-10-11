'use strict';

/**
 * Temporary Preview-only Stage5B V7 collision guard.
 *
 * Builds on V6 accepted anchor remaps, but rejects any remap whose target
 * CMC ID is already owned by another canonical PAYD record, or is targeted
 * by more than one remap. The surviving remaps are applied only in memory
 * and the full mapped set is re-audited against live CoinMarketCap quotes.
 *
 * This endpoint never modifies token-index.json.
 *
 * GET /api/reconcile-stage5b-v7-collision-guard?run=1
 */

const reconcileV3Handler = require('./reconcile-stage5b-v3.js');
const v6Handler = require('./reconcile-stage5b-v6-anchor-audit.js');

const CMC_BASE = 'https://pro-api.coinmarketcap.com';
const QUOTE_BATCH = 90;
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

function failureReasons(record, asset) {
  if (!asset) return ['quote_not_returned'];
  const reasons = [];
  if (String(asset.symbol || '').toUpperCase() !== String(record.symbol || '').toUpperCase()) {
    reasons.push(`symbol_mismatch:${asset.symbol || 'null'}`);
  }
  if (record.cmcSlug && String(asset.slug || '') !== String(record.cmcSlug)) {
    reasons.push(`slug_mismatch:${asset.slug || 'null'}`);
  }
  if (!finitePrice(asset)) reasons.push('invalid_price');
  return reasons;
}

async function fetchJson(url, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PAYD-Stage5B-V7-Collision-Guard/1.0',
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

async function invoke(handler, query) {
  let body = '';
  const fakeRes = {
    statusCode: 200,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    end(value) { body += value || ''; },
  };
  await handler({ method: 'GET', query }, fakeRes);
  let parsed;
  try { parsed = JSON.parse(body); } catch { throw new Error(`INTERNAL_HANDLER_INVALID_JSON:${body.slice(0, 220)}`); }
  return { statusCode: fakeRes.statusCode, body: parsed };
}

async function generateV3Candidate() {
  const result = await invoke(reconcileV3Handler, { run: '1', format: 'index' });
  if (result.statusCode !== 200) {
    throw new Error(`RECONCILE_V3_FAILED:${result.statusCode}:${JSON.stringify(result.body).slice(0, 220)}`);
  }
  return result.body;
}

async function runGuard() {
  const started = Date.now();
  const apiKey = String(process.env.CMC_API_KEY || '').trim();
  if (!apiKey) throw new Error('CMC_API_KEY_REQUIRED');
  if (String(process.env.CMC_FORCE_KEYLESS || '').toLowerCase() === 'true') throw new Error('CMC_FORCE_KEYLESS_NOT_ALLOWED');

  const [candidate, v6Result] = await Promise.all([
    generateV3Candidate(),
    invoke(v6Handler, { run: '1' }),
  ]);

  const records = Array.isArray(candidate.records) ? candidate.records : [];
  const mapped = records.filter((r) => r && r.cmcId !== undefined && r.cmcId !== null && String(r.cmcId).trim() !== '');
  const unmapped = records.length - mapped.length;
  if (records.length !== EXPECTED_TOTAL || mapped.length !== EXPECTED_MAPPED || unmapped !== EXPECTED_UNMAPPED) {
    throw new Error(`BASELINE_MISMATCH:${records.length}/${mapped.length}/${unmapped}`);
  }

  const v6 = v6Result.body || {};
  const proposed = Array.isArray(v6.accepted_anchor_remaps) ? v6.accepted_anchor_remaps : [];

  const ownersById = new Map();
  for (const record of mapped) {
    const id = String(record.cmcId);
    if (!ownersById.has(id)) ownersById.set(id, []);
    ownersById.get(id).push(record.id);
  }

  const targetUse = new Map();
  for (const remap of proposed) {
    const target = String(remap?.after?.cmcId || '');
    if (!targetUse.has(target)) targetUse.set(target, []);
    targetUse.get(target).push(remap.canonical_id);
  }

  const safe = [];
  const collisionRejected = [];

  for (const remap of proposed) {
    const canonicalId = remap.canonical_id;
    const target = String(remap?.after?.cmcId || '');
    const baselineOwners = (ownersById.get(target) || []).filter((id) => id !== canonicalId);
    const competingRemaps = (targetUse.get(target) || []).filter((id) => id !== canonicalId);

    if (!target || baselineOwners.length || competingRemaps.length) {
      collisionRejected.push({
        canonical_id: canonicalId,
        symbol: remap.symbol || null,
        attempted_target_cmc_id: target || null,
        attempted_target_cmc_slug: remap?.after?.cmcSlug || null,
        baseline_owners: baselineOwners,
        competing_remaps: competingRemaps,
        reason: baselineOwners.length
          ? 'TARGET_CMC_ID_ALREADY_OWNED'
          : competingRemaps.length
            ? 'TARGET_CMC_ID_SELECTED_BY_MULTIPLE_REMAPS'
            : 'INVALID_TARGET_CMC_ID',
      });
      continue;
    }
    safe.push(remap);
  }

  const safeByCanonical = new Map(safe.map((x) => [x.canonical_id, x]));
  for (const record of mapped) {
    const remap = safeByCanonical.get(record.id);
    if (!remap) continue;
    record.cmcId = String(remap.after.cmcId);
    record.cmcSlug = remap.after.cmcSlug || null;
  }

  const finalIds = mapped.map((r) => String(r.cmcId));
  const duplicateIds = [...new Set(finalIds.filter((id, i) => finalIds.indexOf(id) !== i))];
  const finalQuotes = await fetchQuotes(finalIds, apiKey);
  const failures = [];
  const passes = [];

  for (const record of mapped) {
    const asset = finalQuotes.get(String(record.cmcId)) || null;
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
    if (reasons.length) failures.push(row); else passes.push(row);
  }

  const mandatoryIds = ['bitcoin', 'ethereum', 'chainlink', 'ondo-finance', 'bittensor', 'aave', 'decentraland'];
  const mandatory = mandatoryIds.map((id) => {
    const fail = failures.find((x) => x.canonical_id === id);
    const pass = passes.find((x) => x.canonical_id === id);
    return { canonical_id: id, status: fail ? 'FAIL' : pass ? 'PASS' : 'NOT_FOUND', reasons: fail?.reasons || [] };
  });

  return {
    ok: duplicateIds.length === 0,
    audit: 'stage5b_v7_collision_guard',
    environment: process.env.VERCEL_ENV || null,
    access_mode: process.env.CMC_ACCESS_MODE === 'PRO_API' ? 'PRO_API' : 'INVALID',
    safeguards: {
      modifies_token_index: false,
      source_v6: 'stage5b_v6_canonical_anchor_audit',
      rejects_existing_cmc_id_owners: true,
      rejects_duplicate_remap_targets: true,
      preserves_canonical_symbol: true,
      full_live_reaudit_after_filter: true,
    },
    counts: {
      dataset_total: records.length,
      mapped: mapped.length,
      unmapped,
      v6_anchor_remaps_proposed: proposed.length,
      collision_rejected: collisionRejected.length,
      safe_remaps_after_collision_guard: safe.length,
      pass_after: passes.length,
      fail_after: failures.length,
      duplicate_cmc_ids_after_guard: duplicateIds.length,
    },
    safe_remaps_after_collision_guard: safe,
    collision_rejected: collisionRejected,
    duplicate_cmc_ids_after_guard: duplicateIds,
    mandatory,
    failures_after: failures,
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
    return sendJson(res, 400, { ok: false, error: 'COLLISION_GUARD_CONFIRMATION_REQUIRED' });
  }

  try {
    const result = await runGuard();
    return sendJson(res, result.ok ? 200 : 500, result);
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      audit: 'stage5b_v7_collision_guard',
      error: err?.name === 'AbortError' ? 'CMC_TIMEOUT' : (err?.message || 'COLLISION_GUARD_FAILED'),
      ts: new Date().toISOString(),
    });
  }
};
