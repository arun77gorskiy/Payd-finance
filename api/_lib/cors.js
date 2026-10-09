/**
 * PAYD Market Gateway — Vercel CORS helper
 *
 * PAYD Intelligence is a public static site. The market endpoint is consumed
 * only by our own front-end, but we deliberately allow a small allow-list
 * of origins to keep the contract safe and explicit.
 *
 * The allow-list is configurable via PAYD_ALLOWED_ORIGINS (comma-separated).
 * When the variable is unset, we fall back to the production PAYD Finance
 * domain plus a couple of staging origins.
 *
 * SECURITY:
 *   - We never echo the request Origin back as Access-Control-Allow-Origin
 *     unless it is in the allow-list (no wildcard with credentials).
 *   - We do NOT set Access-Control-Allow-Credentials (the API is public).
 *   - Preflight (OPTIONS) responds with the methods the contract actually uses.
 */

'use strict';

const DEFAULT_ALLOWED = [
  'https://payd.finance',
  'https://www.payd.finance',
  'https://payd-finance.vercel.app',
  'https://payd-intelligence.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
];

function allowedOrigins() {
  if (process.env.PAYD_ALLOWED_ORIGINS) {
    return process.env.PAYD_ALLOWED_ORIGINS
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return DEFAULT_ALLOWED;
}

function originIsAllowed(origin) {
  if (!origin) return false;
  return allowedOrigins().includes(origin);
}

/**
 * Apply CORS headers to a Vercel response.
 * Returns true if the origin was allow-listed and headers were set,
 * false otherwise (the caller MUST still set a status, but no
 * permissive CORS headers are added).
 */
function applyCorsHeaders(res, req) {
  const origin = req.headers.origin || req.headers.Origin || null;
  if (origin && originIsAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.setHeader('Access-Control-Max-Age', '600');
    return true;
  }
  return false;
}

module.exports = {
  allowedOrigins,
  originIsAllowed,
  applyCorsHeaders,
};
