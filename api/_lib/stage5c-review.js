'use strict';

// One read-only Preview capture: explicit expanded catalog, released runtime
// parity and isolated candidate diagnostics. Candidate expectations never enter
// the public resolver or its cache, and a diagnostic PASS is not a release.
const { createHash } = require('node:crypto');
const { runCatalogAudit, catalogContract, structuralChecks } = require('./stage5c-catalog-audit');
const { runAudit } = require('../audit-stage5c-runtime');
const { getService, getHealthSnapshot } = require('./runtime');
const { createPaydMarketService } = require('../../code/server/market/payd_market_service');
const candidateManifest = require('../../reports/stage5c-candidates-20261018.json');

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

function candidateRecords(base, manifest) {
  if (manifest.diagnostic_only !== true || manifest.automatic_release !== false ||
      !Array.isArray(manifest.candidates) || manifest.candidates.length !== 10 ||
      manifest.published_count !== 7 || manifest.pending_count !== 3) {
    throw new Error('CANDIDATE_MANIFEST_INVALID');
  }
  const index = base._internals.resolver.index;
  const occupied = new Set([...index.values()].filter(r => r.cmcId).map(r => String(r.cmcId)));
  const ids = new Set();
  const providers = new Set();
  const published = manifest.candidates.filter(c => c.applied_to_canonical_dataset === true);
  if (published.length !== 7 || published.some(c => {
    const r = index.get(c.canonical_id);
    return !r || r.cmcId !== c.cmc_id || r.cmcSlug !== c.cmc_slug || r.symbol !== c.symbol;
  })) throw new Error('PUBLISHED_CANDIDATE_MANIFEST_MISMATCH');
  const pending = manifest.candidates.filter(c => c.applied_to_canonical_dataset === false);
  if (pending.length !== 3) throw new Error('CANDIDATE_MANIFEST_INVALID');
  return pending.map(c => {
    const original = index.get(c.canonical_id);
    if (!original || original.cmcId || !/^\d+$/.test(c.cmc_id) || !c.symbol || !c.cmc_slug ||
        c.applied_to_canonical_dataset !== false || c.release_authorized !== false ||
        occupied.has(c.cmc_id) || ids.has(c.canonical_id) || providers.has(c.cmc_id)) {
      throw new Error('CANDIDATE_IDENTITY_COLLISION');
    }
    ids.add(c.canonical_id);
    providers.add(c.cmc_id);
    // These flags select expectations for runAudit in this isolated fixture.
    // They do not describe the real catalog, which remains unmapped/blocked.
    return { id: c.canonical_id, name: original.name, symbol: c.symbol,
      cmcId: c.cmc_id, cmcSlug: c.cmc_slug, mapping_status: 'verified',
      identity_review: { status: 'LIVE_AUDIT_VERIFIED' } };
  });
}

async function runCandidates(base, manifest = candidateManifest) {
  const records = candidateRecords(base, manifest);
  const isolated = createPaydMarketService({
    dataset: { records, _mapping_repair: { released_after_live_audit: records.length } },
    adapter: base._internals.adapter,
  });
  const result = await runAudit(isolated);
  delete result.dataset_sha256;
  result.audit = 'stage5c_isolated_candidate_diagnostic';
  result.manifest_sha256 = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  result.manifest_hash_encoding = 'SHA256 of JSON.stringify(parsed manifest)';
  result.public_mapping_changes = 0;
  result.automatic_release = false;
  for (const row of result.results) {
    row.identity_research_gate = manifest.candidates.find(c => c.canonical_id === row.canonical_id).identity_gate;
    row.release_authorized = false;
  }
  return result;
}

function assessCatalog(base, strict) {
  const records = [...base._internals.resolver.index.values()];
  const mapped = records.filter(r => r.cmcId);
  const blocked = new Set(records.filter(r => r.mapping_status === 'unverified' ||
    r.mapping_status === 'quarantined').map(r => r.id));
  const counts = strict.counts;
  const failures = Array.isArray(strict.failures) ? strict.failures : [];
  const byId = new Map(mapped.map(r => [r.id, r]));
  const unique = new Set(failures.map(r => r.canonical_id));
  const attributed = failures.every(row => {
    const record = byId.get(row.canonical_id);
    return record && row.expected_cmc_id === String(record.cmcId) &&
      row.expected_cmc_slug === record.cmcSlug && row.symbol === record.symbol &&
      Array.isArray(row.reasons) && row.reasons.length > 0;
  });
  const mandatory = ['bitcoin', 'ethereum', 'chainlink', 'ondo-finance', 'bittensor', 'aave', 'decentraland'];
  const complete = structuralChecks(records).length === 0 &&
    records.length === catalogContract.dataset_total && mapped.length === catalogContract.mapped &&
    counts?.dataset_total === catalogContract.dataset_total && counts?.mapped_expected === catalogContract.mapped &&
    counts?.mapped_checked === catalogContract.mapped && counts?.unmapped === catalogContract.unmapped &&
    counts?.pass + counts?.fail === catalogContract.mapped && counts?.fail === failures.length &&
    counts?.duplicate_cmc_ids === 0 && counts?.duplicate_canonical_ids === 0 &&
    Array.isArray(strict.structural_failures) && strict.structural_failures.length === 0 &&
    unique.size === failures.length && attributed &&
    Array.isArray(strict.mandatory) && strict.mandatory.length === mandatory.length &&
    mandatory.every(id => strict.mandatory.filter(r => r.canonical_id === id && r.status === 'PASS').length === 1);
  return {
    complete, expected_quarantined_count: blocked.size,
    unexpected_failures: failures.filter(row => !blocked.has(row.canonical_id)),
    passing_quarantines: complete ? [...blocked].filter(id => !unique.has(id)) : [],
    note: 'Expected quarantines remain visible in the expanded strict audit. A passing quarantine still needs its release gates reviewed.',
  };
}

async function runReview(base, operations = {}) {
  const started = Date.now();
  const resolver = base._internals.resolver;
  if (base._internals.adapter.getAccessMode() !== 'PRO_API') throw new Error('PRO_API_REQUIRED');
  // Independent sections run together; errors do not erase successful evidence.
  const names = ['catalog_strict', 'released_runtime', 'candidate_diagnostic'];
  const settled = await Promise.allSettled([
    (operations.catalog || runCatalogAudit)(base),
    (operations.runtime || runAudit)(base),
    (operations.candidates || runCandidates)(base),
  ]);
  const sections = {};
  for (let i = 0; i < names.length; i++) {
    sections[names[i]] = settled[i].status === 'fulfilled' ? settled[i].value :
      { ok: false, error: names[i].toUpperCase() + '_FAILED' };
  }
  const strict = sections.catalog_strict;
  const assessment = strict.counts ? assessCatalog(base, strict) :
    { complete: false, unexpected_failures: [], passing_quarantines: [] };
  const runtime = sections.released_runtime;
  const candidates = sections.candidate_diagnostic;
  const completed = assessment.complete &&
    runtime.counts?.checked === resolver.dataset._mapping_repair.released_after_live_audit &&
    candidates.counts?.checked === candidateManifest.pending_count;
  return {
    ok: completed && assessment.unexpected_failures.length === 0 && runtime.ok === true,
    audit: 'stage5c_consolidated_review', audit_completed: completed,
    stage_complete: false, release_authorized: false,
    environment: process.env.VERCEL_ENV || null,
    git_commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    dataset_sha256: resolver.datasetSha256,
    note: 'ok means all review sections completed, existing eligible mappings have no new strict failures and released runtime parity passed. It does not mean every candidate passed or Stage 5C is complete.',
    catalog_assessment: assessment,
    legacy_validator: { unchanged: true, original_mapped: 323, original_unmapped: 31,
      note: 'The historical Stage 5B endpoint retains its 323/31 count contract; this expanded catalog uses its own explicit 330/24 contract and strict identity/positive-price validation.' },
    ...sections,
    elapsed_ms: Date.now() - started, ts: new Date().toISOString(),
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
    const base = getService();
    const health = getHealthSnapshot();
    const result = await runReview(base);
    return send(res, result.ok ? 200 : 500, { ...result, health });
  } catch (_) {
    return send(res, 500, { ok: false, error: 'REVIEW_AUDIT_FAILED' });
  }
};

module.exports.runReview = runReview;
module.exports.runCandidates = runCandidates;
module.exports.assessCatalog = assessCatalog;
