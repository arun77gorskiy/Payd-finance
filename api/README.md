# PAYD Market Gateway — Vercel Serverless Functions

> Stage 5B production deployment target. Wraps the platform-independent
> `code/server/market/` core in Vercel Node.js serverless functions. The
> underlying service is identical to the standalone `server.js` — the only
> difference is the HTTP transport.

```
api/
├── _lib/
│   ├── runtime.js   # L1 singleton service factory (60s TTL cache)
│   ├── cors.js      # Allow-list CORS for PAYD Finance origins
│   └── respond.js   # Canonical JSON response helper (status mapping)
├── healthz.js                 # GET /api/healthz
├── intelligence/
│   └── market.js              # GET /api/intelligence/market?id=<id>
├── _test/
│   └── vercel_smoke.js        # Offline smoke test (12 assertions)
├── package.json               # Local package metadata (no deps)
└── README.md                  # This file
```

The root `vercel.json` declares the routes and per-function sizing.

---

## Public Contract

| Method | Path                                  | Purpose                  | Notes                  |
| ------ | ------------------------------------- | ------------------------ | ---------------------- |
| GET    | `/healthz`                            | Liveness + readiness     | rewritten → `/api/healthz` |
| GET    | `/api/intelligence/market?id=<id>`    | Canonical market envelope | LIVE/PARTIAL/etc.      |
| OPTIONS | both                                 | CORS preflight           | 204                    |

Status mapping (matches the standalone server.js contract):

| envelope.status           | HTTP | Cache-Control                        |
| ------------------------- | ---- | ------------------------------------ |
| `LIVE` / `PARTIAL`        | 200  | `public, s-maxage=60, max-age=0, swr=30` |
| `UNKNOWN_MAPPING`         | 200  | `no-store`                           |
| `MAPPING_CONFLICT`        | 200  | `no-store`                           |
| `PROVIDER_UNAVAILABLE`    | 200  | `no-store`                           |
| `RATE_LIMITED`            | 200  | `no-store`                           |
| `INVALID_ID`              | 404  | `no-store`                           |

---

## Environment variables

| Variable                 | Required | Default       | Notes                                            |
| ------------------------ | -------- | ------------- | ------------------------------------------------ |
| `CMC_API_KEY`            | for LIVE | —             | Server-side only. Set in Vercel project env.     |
| `CMC_BASE_URL`           | no       | `https://pro-api.coinmarketcap.com` | Override for proxies.        |
| `CMC_TIMEOUT_MS`         | no       | `4000`        | Provider timeout (3–5s per spec).                |
| `PAYD_PROJECTS_DATASET`  | no       | auto-resolved | Override dataset path (used by tests).           |
| `PAYD_ALLOWED_ORIGINS`   | no       | PAYD domains  | Comma-separated CORS allow-list.                 |

---

## Caching strategy

Two layers (per Stage 5B spec):

1. **L1 — in-process memory** (per Vercel isolate, 60s TTL)
   - `MarketCache` keyed by `payd-market:<canonical_id>`.
   - Survives warm invocations within the same isolate.
   - Cache-coalesced provider calls: concurrent requests for the same
     asset share a single in-flight CMC request.

2. **L2 — Vercel Edge Cache** (CDN, 60s shared, 30s swr)
   - Enforced via the `Cache-Control: public, s-maxage=60, max-age=0,
     stale-while-revalidate=30` response header on LIVE / PARTIAL
     envelopes.
   - Only `LIVE` and `PARTIAL` are eligible. All other statuses return
     `no-store` so the front-end always sees fresh error states.
   - The Edge Cache is global; the in-memory cache is per-isolate.

Transient failures (`PROVIDER_UNAVAILABLE`, `RATE_LIMITED`,
`INVALID_RESPONSE`) are **not** cached at either layer so the next caller
retries the provider immediately.

---

## Local development

```bash
# 1. Offline smoke test (no real CMC calls, ~1s):
node api/_test/vercel_smoke.js

# 2. Existing core unit tests (no network, ~1s):
node code/server/market/test/market_gateway.test.js

# 3. Vercel CLI (optional, requires vercel login):
vercel dev
```

---

## Deployment

The repository is wired for one-click Vercel deployment. The user only
needs to:

1. Import the GitHub repository into a Vercel project.
2. Set `CMC_API_KEY` in Project Settings → Environment Variables
   (Production, Preview, Development).
3. Deploy. No other configuration is required.

The detailed Vercel dashboard step-by-step is in
`docs/STAGE5B_VERCEL_DEPLOYMENT_REPORT.md`.

---

## Security

- `CMC_API_KEY` is read only from `process.env` (server-side).
- The handlers never write the key into a log, payload, or response
  header. The smoke test asserts this contract explicitly.
- CORS is enforced via a small explicit allow-list of PAYD Finance
  origins (configurable via `PAYD_ALLOWED_ORIGINS`).
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and a strict
  `Referrer-Policy` are set globally in `vercel.json` for `/api/*`.
- The endpoint never reflects request body or any user input.

---

## What this wrapper does NOT do

- It does not add any new business logic. The service is the
  `createPaydMarketService()` core from `code/server/market/`.
- It does not persist the cache across cold starts. Cold starts re-load
  the dataset from the bundled `token-index.json` and start with an
  empty L1 cache (the L2 Edge Cache still serves any cacheable
  envelope that was produced by a previous isolate within the last
  60 seconds).
- It does not fall back to CoinGecko for any failure mode. Unreachable
  CMC → `PROVIDER_UNAVAILABLE` envelope, surfaced faithfully to the
  front-end.
