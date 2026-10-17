'use strict';

// Preview-only numeric validation of the released mappings. Uses authenticated
// batches of up to 90 quotes through the existing adapter, then the real resolver,
// service and normalizer. Does not modify the dataset or production cache.
const { getService } = require('./_lib/runtime');
const { createPaydMarketService } = require('../code/server/market/payd_market_service');

const FIELDS = [
  ['price_usd', 'price'], ['change_24h_pct', 'percent_change_24h'],
  ['change_7d_pct', 'percent_change_7d'], ['change_30d_pct', 'percent_change_30d'],
  ['market_cap_usd', 'market_cap'], ['fdv_usd', 'fully_diluted_market_cap'],
  ['volume_24h_usd', 'volume_24h'], ['market_cap_rank', 'cmc_rank'],
];

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

function numeric(value) {
  if (value === null || value === undefined) return null;
  if ((typeof value !== 'number' && typeof value !== 'string') ||
      (typeof value === 'string' && !value.trim()) || !Number.isFinite(Number(value))) {
    throw new Error('INVALID_RAW_NUMBER');
  }
  return Number(value);
}

async function runAudit(base) {
  const resolver = base._internals.resolver;
  const adapter = base._internals.adapter;
  if (adapter.getAccessMode() !== 'PRO_API') throw new Error('PRO_API_REQUIRED');
  const records = [...resolver.index.values()].filter(r =>
    r.mapping_status === 'verified' && r.identity_review?.status === 'LIVE_AUDIT_VERIFIED'
  );
  if (!records.length || records.length !== resolver.dataset._mapping_repair?.released_after_live_audit) {
    throw new Error('RELEASE_MANIFEST_MISMATCH');
  }
  const results = [];
  // A new isolate-local cache avoids returning stale results from the public API.
  // Prefetched quotes still pass through the normal service identity validation.
  for (let offset = 0; offset < records.length; offset += 90) {
    const batch = records.slice(offset, offset + 90);
    const fetched = await adapter.fetchQuoteById(batch.map(r => r.cmcId).join(','));
    const service = createPaydMarketService({
      resolver,
      adapter: {
        getAccessMode: () => 'PRO_API',
        isAuthAvailable: () => true,
        fetchQuoteById: async () => fetched,
      },
    });
    for (const record of batch) {
      const envelope = await service.getMarket(record.id);
      const raw = fetched.payload?.data?.[record.cmcId];
      const reasons = [];
      if (!['LIVE', 'PARTIAL'].includes(envelope.status)) reasons.push(envelope.status);
      if (envelope.canonical_id !== record.id || envelope.provider_id !== record.cmcId ||
          envelope.symbol !== record.symbol) reasons.push('IDENTITY_MISMATCH');
      if (!Number.isFinite(envelope.market?.price_usd) || envelope.market.price_usd <= 0) {
        reasons.push('INVALID_RUNTIME_PRICE');
      }
      const checks = {};
      for (const [marketKey, rawKey] of FIELDS) {
        const value = rawKey === 'cmc_rank' ? raw?.cmc_rank : raw?.quote?.USD?.[rawKey];
        let expected;
        try { expected = numeric(value); }
        catch (_) { reasons.push('INVALID_RAW_FIELD:' + rawKey); checks[marketKey] = false; continue; }
        checks[marketKey] = !!envelope.market && envelope.market[marketKey] === expected;
        if (!checks[marketKey]) reasons.push('FIELD_VALUE_MISMATCH:' + marketKey);
      }
      results.push({
        canonical_id: record.id, cmc_id: record.cmcId, status: envelope.status,
        provider_updated_at: envelope.provider_updated_at,
        exact_fields: checks, market: envelope.market, reasons: [...new Set(reasons)],
      });
    }
  }
  const failures = results.filter(row => row.reasons.length);
  return {
    ok: failures.length === 0, audit: 'stage5c_runtime_field_parity',
    environment: process.env.VERCEL_ENV || null,
    git_commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    dataset_sha256: resolver.datasetSha256, access_mode: 'PRO_API',
    counts: { checked: results.length, pass: results.length - failures.length, fail: failures.length,
      fields_per_record: FIELDS.length, provider_batches: Math.ceil(records.length / 90) },
    results, ts: new Date().toISOString(),
  };
}

module.exports = async function handler(req, res) {
  if (process.env.VERCEL_ENV !== 'preview') return send(res, 404, { ok: false, error: 'NOT_FOUND' });
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  if (String(req.query?.run || '') !== '1') {
    return send(res, 400, { ok: false, error: 'AUDIT_CONFIRMATION_REQUIRED' });
  }
  try {
    const result = await runAudit(getService());
    return send(res, result.ok ? 200 : 500, result);
  } catch (_) {
    // Generic errors keep provider text and credentials out of the response.
    return send(res, 500, { ok: false, audit: 'stage5c_runtime_field_parity', error: 'RUNTIME_AUDIT_FAILED' });
  }
};

module.exports.runAudit = runAudit;
