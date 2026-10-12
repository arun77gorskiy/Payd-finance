/**
 * PAYD Market Gateway — Portable HTTP Server
 *
 * A thin, dependency-free HTTP wrapper that exposes the canonical contract:
 *
 *   GET /api/intelligence/market?id=<canonical-id>
 *   GET /healthz
 *
 * Runs under:
 *   - `node code/server/market/server.js`  (VPS / standalone)
 *   - imported as a request handler by a Supabase Edge wrapper
 *   - imported by any other HTTP framework
 *
 * It never reads CMC_API_KEY from anywhere except process.env.
 * It never logs the API key.
 */

'use strict';

const http = require('http');
const { URL } = require('url');
const path = require('path');
const { createPaydMarketService } = require('./payd_market_service');

const DEFAULT_PORT = Number(process.env.PORT || 8787);
// Stage 4 source of truth for CMC identity: public/data/intelligence/token-index.json
// Override at runtime with the PAYD_PROJECTS_DATASET environment variable.
const DEFAULT_DATASET = path.resolve(
  process.env.PAYD_PROJECTS_DATASET || path.join(__dirname, '..', '..', '..', 'public', 'data', 'intelligence', 'token-index.json')
);

/**
 * Build the request handler. Pure: no listening, no side effects on import.
 *
 * @param {object} deps
 * @param {ReturnType<typeof createPaydMarketService>} deps.service
 */
function createRequestHandler({ service }) {
  return async function handler(req, res) {
    const startedAt = Date.now();
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

      if (req.method === 'GET' && url.pathname === '/healthz') {
        return _writeJson(res, 200, {
          ok: true,
          status: 'UP',
          stats: service.stats(),
          uptime_seconds: Math.round(process.uptime()),
          ts: new Date().toISOString(),
        });
      }

      if (req.method !== 'GET' || url.pathname !== '/api/intelligence/market') {
        return _writeJson(res, 404, {
          ok: false,
          error: 'NOT_FOUND',
          message: 'Use GET /api/intelligence/market?id=<canonical-id>',
        });
      }

      const id = url.searchParams.get('id');
      if (!id) {
        return _writeJson(res, 400, {
          ok: false,
          error: 'MISSING_PARAMETER',
          message: 'Required query parameter: id',
        });
      }

      const envelope = await service.getMarket(id);

      // Choose HTTP status by PAYD status (most are 200 per spec)
      const httpStatus = envelope.status === 'INVALID_ID' ? 404 : 200;
      const elapsed = Date.now() - startedAt;
      res.setHeader('x-payd-elapsed-ms', String(elapsed));
      return _writeJson(res, httpStatus, {
        ok: true,
        envelope,
      });
    } catch (err) {
      // Defensive — the service should never throw, but if it does we
      // log without leaking secrets and return a generic envelope.
      return _writeJson(res, 500, {
        ok: false,
        error: 'INTERNAL',
        message: err && err.message ? err.message : 'Internal error',
      });
    }
  };
}

function _writeJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Start a standalone HTTP server. Used for Node/VPS deployment.
 * Supabase Edge does NOT call this — it imports createRequestHandler().
 */
function startStandaloneServer({
  port = DEFAULT_PORT,
  datasetPath = DEFAULT_DATASET,
  serviceOptions = {},
} = {}) {
  const service = createPaydMarketService({ datasetPath, ...serviceOptions });
  const handler = createRequestHandler({ service });
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch(() => {
      try { res.destroy(); } catch { /* ignore */ }
    });
  });
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[PAYD Market Gateway] listening on http://127.0.0.1:${port}`);
    // eslint-disable-next-line no-console
    console.log(`[PAYD Market Gateway] dataset: ${datasetPath}`);
    // eslint-disable-next-line no-console
    console.log(`[PAYD Market Gateway] CMC_API_KEY configured: ${Boolean(process.env.CMC_API_KEY)}`);
  });
  return { server, service };
}

module.exports = {
  createRequestHandler,
  startStandaloneServer,
  DEFAULT_PORT,
  DEFAULT_DATASET,
};

// Auto-start when invoked directly: `node code/server/market/server.js`
if (require.main === module) {
  startStandaloneServer();
}
