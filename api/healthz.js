/**
 * PAYD Market Gateway — Vercel serverless function: GET /api/healthz
 *
 * Liveness + readiness endpoint. Exposes:
 *   - service stats (cache size, resolver size, access mode)
 *   - CMC_API_KEY presence flag (NEVER the key itself)
 *   - Vercel region / env metadata
 *   - process uptime
 *
 * Always 200 unless the service failed to initialise at all.
 */

'use strict';

const { getHealthSnapshot } = require('./_lib/runtime');
const { applyCorsHeaders } = require('./_lib/cors');

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  applyCorsHeaders(res, req);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Cache-Control', 'no-store');
    return res.end();
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }));
  }

  try {
    const snap = getHealthSnapshot();
    const body = {
      ok: true,
      status: 'UP',
      ...snap,
      elapsed_ms: Date.now() - startedAt,
    };
    const payload = JSON.stringify(body);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', Buffer.byteLength(payload));
    return res.end(payload);
  } catch (err) {
    // Service failed to initialise (e.g. dataset missing). Surface 503 so
    // the dashboard can flag it explicitly.
    const body = {
      ok: false,
      status: 'DOWN',
      error: 'SERVICE_INIT_FAILED',
      message: err && err.message ? err.message : 'unknown',
      ts: new Date().toISOString(),
    };
    const payload = JSON.stringify(body);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', Buffer.byteLength(payload));
    return res.end(payload);
  }
};
