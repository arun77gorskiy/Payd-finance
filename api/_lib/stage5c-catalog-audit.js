'use strict';

// Explicit expanded catalog contract. The original Stage 5B validator retains
// its 323/31 contract unchanged; no legacy structural failures are ignored.
const { createHash } = require('node:crypto');
const catalogContract = require('../../reports/stage5c-catalog-contract-20261018.json');
const MANDATORY = ['bitcoin', 'ethereum', 'chainlink', 'ondo-finance', 'bittensor', 'aave', 'decentraland'];

function sameSet(left, right) {
  return left.length === right.length && new Set(left).size === left.length &&
    new Set(right).size === right.length && left.every(id => right.includes(id));
}

function structuralChecks(records, contract = catalogContract) {
  const mapped = records.filter(r => r.cmcId);
  const ids = records.map(r => r.id);
  const providerIds = mapped.map(r => String(r.cmcId));
  const failures = [];
  if (records.length !== contract.dataset_total) failures.push('DATASET_COUNT_MISMATCH');
  if (new Set(ids).size !== records.length) failures.push('DUPLICATE_CANONICAL_IDS');
  if (new Set(providerIds).size !== mapped.length) failures.push('DUPLICATE_CMC_IDS');
  if (mapped.length !== contract.mapped) failures.push('MAPPED_COUNT_MISMATCH');
  const approved = contract.original_mapped_canonical_ids.concat(contract.approved_additions.map(r => r.canonical_id));
  if (!sameSet(mapped.map(r => r.id), approved)) failures.push('MAPPED_COHORT_MISMATCH');
  const unmapped = records.filter(r => !r.cmcId).map(r => r.id);
  if (unmapped.length !== contract.unmapped || !sameSet(unmapped, contract.remaining_unmapped_canonical_ids)) {
    failures.push('UNMAPPED_COHORT_MISMATCH');
  }
  for (const addition of contract.approved_additions) {
    const record = records.find(r => r.id === addition.canonical_id);
    if (!record || record.symbol !== addition.symbol || String(record.cmcId) !== addition.cmc_id ||
        record.cmcSlug !== addition.cmc_slug) failures.push('APPROVED_ADDITION_MISMATCH:' + addition.canonical_id);
  }
  return failures;
}

function validNumber(value) {
  return (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
    Number.isFinite(Number(value));
}

function quoteChecks(asset) {
  const usd = asset?.quote?.USD;
  if (!usd || typeof usd !== 'object' || Array.isArray(usd)) return ['missing_quote_usd'];
  const failures = [];
  if (!validNumber(usd.price) || Number(usd.price) <= 0) failures.push('invalid_price');
  for (const key of ['market_cap', 'volume_24h', 'fully_diluted_market_cap',
    'percent_change_1h', 'percent_change_24h', 'percent_change_7d', 'percent_change_30d']) {
    const value = usd[key];
    if (value !== null && value !== undefined && !validNumber(value)) failures.push('invalid_' + key);
    if (['market_cap', 'volume_24h', 'fully_diluted_market_cap'].includes(key) &&
        value !== null && value !== undefined && validNumber(value) && Number(value) < 0) failures.push('negative_' + key);
  }
  // Raw optional supply/rank values may be unavailable. Preserve null vs zero;
  // parity does not independently certify their economic consistency.
  for (const key of ['cmc_rank', 'circulating_supply', 'total_supply', 'max_supply']) {
    const value = asset[key];
    if (value !== null && value !== undefined && (!validNumber(value) || Number(value) < 0)) failures.push('invalid_' + key);
  }
  return [...new Set(failures)];
}

async function runCatalogAudit(base) {
  const resolver = base._internals.resolver;
  const adapter = base._internals.adapter;
  if (adapter.getAccessMode() !== 'PRO_API') throw new Error('PRO_API_REQUIRED');
  const records = Array.isArray(resolver.dataset.records) ? resolver.dataset.records : [];
  const mapped = records.filter(r => r.cmcId);
  const structural = structuralChecks(records);
  if (structural.length) throw new Error('CATALOG_CONTRACT_MISMATCH');
  const batches = [];
  for (let i = 0; i < mapped.length; i += 90) batches.push(mapped.slice(i, i + 90));
  const payloads = await Promise.all(batches.map(async batch => {
    const fetched = await adapter.fetchQuoteById(batch.map(r => r.cmcId).join(','));
    if (!fetched.payload?.data || typeof fetched.payload.data !== 'object' || Array.isArray(fetched.payload.data)) {
      throw new Error('CATALOG_INVALID_PROVIDER_DATA');
    }
    return fetched.payload.data;
  }));
  const returned = new Map();
  const requested = new Set(mapped.map(r => String(r.cmcId)));
  for (const payload of payloads) {
    for (const [key, asset] of Object.entries(payload)) {
      if (!asset || typeof asset !== 'object') continue;
      if (!requested.has(key)) structural.push('UNREQUESTED_PROVIDER_ID:' + key);
      if (returned.has(key)) structural.push('DUPLICATE_RETURNED_PROVIDER_ID:' + key);
      returned.set(key, asset);
    }
  }
  const failures = [];
  const passes = [];
  for (const record of mapped) {
    const asset = returned.get(String(record.cmcId));
    const reasons = [];
    if (!asset) reasons.push('quote_not_returned');
    else {
      if (String(asset.id) !== String(record.cmcId)) reasons.push('provider_id_mismatch:' + asset.id);
      if (String(asset.symbol || '').toUpperCase() !== String(record.symbol).toUpperCase()) reasons.push('symbol_mismatch:' + asset.symbol);
      if (asset.slug !== record.cmcSlug) reasons.push('slug_mismatch:' + asset.slug);
      reasons.push(...quoteChecks(asset));
    }
    const row = { canonical_id: record.id, symbol: record.symbol,
      expected_cmc_id: String(record.cmcId), expected_cmc_slug: record.cmcSlug,
      returned_symbol: asset?.symbol || null, returned_slug: asset?.slug || null, reasons };
    (reasons.length ? failures : passes).push(row);
  }
  return {
    ok: !structural.length && !failures.length, audit: 'stage5c_expanded_catalog_strict',
    environment: process.env.VERCEL_ENV || null, git_commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    dataset_sha256: resolver.datasetSha256, access_mode: 'PRO_API',
    catalog_contract_version: catalogContract.version,
    catalog_contract_sha256: createHash('sha256').update(JSON.stringify(catalogContract)).digest('hex'),
    counts: { dataset_total: records.length, mapped_expected: catalogContract.mapped, mapped_checked: mapped.length,
      unmapped: records.length - mapped.length, returned_quotes: returned.size, pass: passes.length, fail: failures.length,
      duplicate_cmc_ids: 0, duplicate_canonical_ids: 0, batches: batches.length },
    mandatory: MANDATORY.map(id => ({ canonical_id: id,
      status: failures.some(r => r.canonical_id === id) ? 'FAIL' : passes.some(r => r.canonical_id === id) ? 'PASS' : 'NOT_FOUND' })),
    structural_failures: structural, failures,
    passed_canonical_ids: passes.map(r => r.canonical_id),
    unmapped_canonical_ids: records.filter(r => !r.cmcId).map(r => r.id), ts: new Date().toISOString(),
  };
}

module.exports = { runCatalogAudit, structuralChecks, quoteChecks, catalogContract, MANDATORY, sameSet };
