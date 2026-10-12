/**
 * PAYD Market Gateway — Vercel Runtime Bootstrap
 *
 * Lazy-initialised service factory used by all Vercel serverless functions
 * under /api. Each cold start re-uses the same `service` instance for the
 * lifetime of the Vercel isolate, which is what gives us the "L1 memory"
 * cache layer described in the Stage 5B spec (MarketCache, TTL 60s).
 *
 * The dataset (`token-index.json`) is loaded from the public bundle that
 * ships with the deployment (resolved at runtime relative to the repo
 * root by walking up from /var/task/api/_lib/runtime.js). If the file is
 * missing we surface a clear PROVIDER_UNAVAILABLE-style envelope rather
 * than crashing the function.
 *
 * SECURITY:
 *   - CMC_API_KEY is read from process.env only (server-side).
 *   - The factory never logs the key (it only logs its presence flag).
 *   - No code path here exposes the key to the client.
 */

'use strict';

const path = require('path');
const fs = require('fs');

const { createPaydMarketService } = require('../../code/server/market/payd_market_service');

/**
 * Resolve the absolute path to the bundled token-index.json dataset.
 *
 * Vercel serverless functions run from /var/task/<file> on AWS Lambda.
 * The dataset lives in the repo at /public/data/intelligence/token-index.json,
 * so we walk up from /var/task/api/_lib/runtime.js to /var/task/ and append
 * the known relative path. This works in production (Vercel bundles the
 * whole repo into /var/task) and locally (Vercel dev, `vercel build`).
 */
function resolveDatasetPath() {
  if (process.env.PAYD_PROJECTS_DATASET) {
    return process.env.PAYD_PROJECTS_DATASET;
  }
  const candidates = [
    // Production: repo bundled into /var/task
    '/var/task/public/data/intelligence/token-index.json',
    // Local vercel dev: process.cwd() is usually the project root
    path.resolve(process.cwd(), 'public/data/intelligence/token-index.json'),
    // Legacy: from inside the api/_lib file
    path.resolve(__dirname, '..', '..', 'public', 'data', 'intelligence', 'token-index.json'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // Return the canonical default so the resolver can throw a meaningful error
  return '/var/task/public/data/intelligence/token-index.json';
}

/**
 * L1 service singleton for the lifetime of the Vercel isolate.
 * `globalThis` is intentional — Vercel re-uses isolates across requests
 * and `globalThis` is the canonical pattern to survive warm invocations.
 */
function getService() {
  // Production/preview deployments must NEVER silently fall back to the
  // unauthenticated CMC endpoint. Fail closed until the server-side secret
  // is configured; local offline tests remain possible without Vercel env.
  if (process.env.VERCEL === '1' || process.env.VERCEL_ENV) {
    if (!process.env.CMC_API_KEY || !process.env.CMC_API_KEY.trim()) {
      throw new Error('CMC_API_KEY_REQUIRED');
    }
    if (String(process.env.CMC_FORCE_KEYLESS || '').toLowerCase() === 'true') {
      throw new Error('CMC_FORCE_KEYLESS_NOT_ALLOWED');
    }
  }
  if (!globalThis.__PAYD_MARKET_SERVICE__) {
    const datasetPath = resolveDatasetPath();
    globalThis.__PAYD_MARKET_SERVICE__ = createPaydMarketService({
      datasetPath,
      // ttlMs omitted: defaults to 60_000 in MarketCache
      // timeoutMs omitted: defaults to 4000 in CoinMarketCapAdapter
      // apiKey omitted: reads from process.env.CMC_API_KEY
    });
  }
  return globalThis.__PAYD_MARKET_SERVICE__;
}

/**
 * Lightweight sanity check used by /api/healthz. Pure read-only.
 */
function getHealthSnapshot() {
  const service = getService();
  const records = [...service._internals.resolver.index.values()];
  const cmcMapped = records.filter((r) => r.cmcId !== undefined && r.cmcId !== null && String(r.cmcId).trim() !== '').length;
  return {
    stats: service.stats(),
    resolver: {
      total: records.length,
      cmc_mapped: cmcMapped,
      no_cmc_mapping: records.length - cmcMapped,
    },
    uptime_seconds: Math.round(process.uptime()),
    node_version: process.version,
    vercel_region: process.env.VERCEL_REGION || 'local',
    vercel_env: process.env.VERCEL_ENV || 'development',
    cmc_api_key_present: Boolean(process.env.CMC_API_KEY),
    ts: new Date().toISOString(),
  };
}

module.exports = {
  getService,
  getHealthSnapshot,
  resolveDatasetPath,
};
