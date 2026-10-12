/**
 * PAYD Market Gateway — Vercel serverless function:
 *   GET /api/intelligence/market?id=<canonical-id>
 *
 * The single canonical entrypoint used by the PAYD Intelligence front-end.
 * It does NO business logic of its own — it delegates to the platform-
 * independent core service and writes a normalised response envelope.
 *
 * Response status mapping (mirrors server.js):
 *   envelope.status === 'INVALID_ID'   -> HTTP 404
 *   everything else (LIVE/PARTIAL/errs) -> HTTP 200
 *
 * Cache-Control:
 *   LIVE / PARTIAL:    public, s-maxage=60, max-age=0, swr=30
 *   anything else:     no-store
 *
 * SECURITY:
 *   - CMC_API_KEY is read from process.env only (server-side).
 *   - The endpoint never reflects the request body or any user input.
 *   - The endpoint never writes the key into a log or payload.
 */

'use strict';

const { getService } = require('../_lib/runtime');
const { applyCorsHeaders } = require('../_lib/cors');
const { statusToHttpCode, sendJson } = require('../_lib/respond');

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

  // Parse the canonical id from either the Vercel URL object (req.url) or
  // the standard node http req.url string. Vercel sets req.url to the path
  // + query string. We tolerate both shapes.
  const id = _extractIdParam(req);

  if (!id) {
    return sendJson(res, {
      ok: false,
      envelope: {
        error: 'MISSING_PARAMETER',
        message: 'Required query parameter: id',
      },
      httpStatus: 400,
      cacheMode: 'no-store',
    });
  }

  let service;
  try {
    service = getService();
  } catch (err) {
    // Service init failure (dataset missing, malformed, etc.)
    return sendJson(res, {
      ok: false,
      envelope: {
        error: 'SERVICE_INIT_FAILED',
        message: err && err.message ? err.message : 'unknown',
      },
      httpStatus: 503,
      cacheMode: 'no-store',
    });
  }

  let envelope;
  try {
    envelope = await service.getMarket(id);
  } catch (err) {
    // Service.getMarket() is documented to never throw, but we guard the
    // public surface anyway. Never leak the key.
    return sendJson(res, {
      ok: false,
      envelope: {
        error: 'INTERNAL',
        message: err && err.message ? err.message : 'internal error',
      },
      httpStatus: 500,
      cacheMode: 'no-store',
    });
  }

  const httpStatus = statusToHttpCode(envelope.status);
  const elapsedMs = Date.now() - startedAt;
  const cacheMode = (envelope.status === 'LIVE' || envelope.status === 'PARTIAL')
    ? 'shared-60s'
    : 'no-store';

  return sendJson(res, {
    ok: true,
    envelope,
    elapsedMs,
    httpStatus,
    cacheMode,
  });
};

/**
 * Extract `?id=` from either a Vercel-style parsed URL or a raw req.url
 * string. Returns null when missing or empty.
 */
function _extractIdParam(req) {
  let raw = null;
  try {
    if (req.url) {
      raw = req.url;
    } else if (req.query && typeof req.query === 'object') {
      raw = '?' + new URLSearchParams(req.query).toString();
    }
  } catch (_) {
    raw = req.url || null;
  }
  if (!raw) return null;

  // Vercel parses the query string into req.query when the runtime is
  // configured with helpers. Prefer that when present.
  if (req.query && typeof req.query === 'object' && 'id' in req.query) {
    const v = req.query.id;
    if (Array.isArray(v)) return v[0] || null;
    return v || null;
  }

  let qs = raw;
  const qIdx = raw.indexOf('?');
  if (qIdx >= 0) qs = raw.slice(qIdx + 1);
  const params = new URLSearchParams(qs);
  const v = params.get('id');
  return v && v.trim() !== '' ? v.trim() : null;
}
