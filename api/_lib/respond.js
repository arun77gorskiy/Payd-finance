/**
 * PAYD Market Gateway — Vercel response helper
 *
 * Single source of truth for serialising JSON responses, attaching the
 * x-payd-* diagnostic headers, and choosing the HTTP status code based
 * on the envelope status.
 *
 * Status mapping (mirrors the standalone server.js contract):
 *   INVALID_ID                                -> 404
 *   everything else (LIVE, PARTIAL, errors)   -> 200
 *
 * SECURITY: this helper never reflects the request body or any user
 * input in the response payload. Only the canonical envelope.
 */

'use strict';

function statusToHttpCode(envelopeStatus) {
  return envelopeStatus === 'INVALID_ID' ? 404 : 200;
}

/**
 * Serialise and write a JSON response with the standard diagnostic
 * headers. Adds Cache-Control:
 *   - LIVE / PARTIAL envelopes: 60s shared (s-maxage) + 0s browser
 *   - everything else:          no-store
 */
function sendJson(res, { ok, envelope, elapsedMs, httpStatus, cacheMode }) {
  const payload = ok ? { ok: true, envelope } : { ok: false, ...envelope };
  const body = JSON.stringify(payload);

  res.statusCode = httpStatus;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  if (elapsedMs !== undefined) {
    res.setHeader('x-payd-elapsed-ms', String(elapsedMs));
  }

  if (cacheMode === 'shared-60s') {
    // Browser: 0s, CDN/edge: 60s. Mark public so Vercel Edge Cache can serve.
    res.setHeader('Cache-Control', 'public, s-maxage=60, max-age=0, stale-while-revalidate=30');
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }

  res.end(body);
}

module.exports = {
  statusToHttpCode,
  sendJson,
};
