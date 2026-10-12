# PAYD Market Gateway

> Portable, platform-independent market data gateway that exposes a single
> canonical HTTP contract to PAYD Intelligence and resolves CoinMarketCap
> identities from the immutable `projects_enriched.json` dataset.

---

## Layout

```
code/server/market/
├── payd_market_service.js     # Core orchestrator (platform-independent)
├── coinmarketcap_adapter.js   # CMC I/O, auth, timeout, status mapping
├── market_normalizer.js       # Raw CMC → PAYD envelope
├── market_cache.js            # TTL cache + request coalescing
├── market_resolver.js         # canonical_id → CMC mapping validation
├── market_errors.js           # Error taxonomy and status constants
├── server.js                  # Thin portable HTTP server (Node/VPS)
├── README.md                  # This file
└── test/
    └── market_gateway.test.js # Pure unit tests, no network, ~1s
```

Optional Supabase wrapper (NOT required by the core):

```
supabase/functions/intelligence-market/
└── index.js                   # Thin Deno.serve() wrapper that imports
                               # the core service. No business logic here.
```

---

## Public Contract

```
GET /api/intelligence/market?id=<canonical-id>
GET /healthz
```

Examples:

```
/api/intelligence/market?id=bitcoin
/api/intelligence/market?id=chainlink
/api/intelligence/market?id=ondo-finance
```

Response envelope:

```json
{
  "ok": true,
  "envelope": {
    "canonical_id": "chainlink",
    "symbol": "LINK",
    "name": "Chainlink",
    "market": {
      "price_usd": 12.34,
      "market_cap_usd": 7400000000,
      "fdv_usd": 12340000000,
      "volume_24h_usd": 480000000,

      "change_1h_pct": 0.1,
      "change_24h_pct": -1.2,
      "change_7d_pct": 3.5,
      "change_30d_pct": 12.4,

      "market_cap_rank": 18,

      "circulating_supply": 600000000,
      "total_supply": 1000000000,
      "max_supply": null
    },
    "provider": "coinmarketcap",
    "provider_id": "1975",
    "provider_updated_at": "2026-01-01T00:00:00.000Z",
    "retrieved_at": "2026-01-01T00:00:00.123Z",
    "status": "LIVE"
  }
}
```

---

## Canonical ID → CMC ID resolution

The service reads `public/data/projects_enriched.json` once at startup and
builds an in-memory index keyed by `id`.

Resolution rules (locked by the STEP 2 spec):

1. The primary identifier is `cmcId` (numeric).
2. `cmcSlug` is metadata only; it is **never** used to address the provider.
3. If both `cmcId` and `identifiers.coinmarketcap` are present, they must
   agree. A disagreement → `MAPPING_CONFLICT`.
4. Missing `cmcId` → `UNKNOWN_MAPPING`. The 13 known unmapped tokens
   (concordium, cysic, humanity, midnight-3, movement, nexus-4,
   ozone-chain, pirate-chain, railgun, succinct, zcash, zencash,
   zerobase) all resolve to this status. No silent fallback, no CoinGecko.
5. Unknown canonical id → `INVALID_ID` (HTTP 404).

---

## Status model

| Status                | Meaning                                                   |
| --------------------- | --------------------------------------------------------- |
| `LIVE`                | Usable fresh CMC data received, all core fields present.  |
| `PARTIAL`             | Response valid, price > 0, but some other field is null. |
| `UNKNOWN_MAPPING`     | Canonical id has no verified CMC mapping.                 |
| `MAPPING_CONFLICT`    | Local CMC identity fields disagree.                       |
| `PROVIDER_UNAVAILABLE`| Provider cannot be reached or `CMC_API_KEY` missing.      |
| `PROVIDER_ERROR`      | Provider returned a non-429, non-auth failure.            |
| `RATE_LIMITED`        | Provider explicitly rate-limited (HTTP 429).              |
| `INVALID_RESPONSE`    | Provider response did not pass identity validation.       |
| `INVALID_ID`          | Canonical id is not present in the dataset.               |

---

## Environment variables

| Variable              | Required | Default       | Notes                                            |
| --------------------- | -------- | ------------- | ------------------------------------------------ |
| `CMC_API_KEY`         | for LIVE | —             | Server-side only. Never bundled with the client. |
| `CMC_BASE_URL`        | no       | `https://pro-api.coinmarketcap.com` | Override for tests / proxies.      |
| `CMC_TIMEOUT_MS`      | no       | `4000`        | Hard provider timeout. 3–5 seconds per spec.     |
| `PORT`                | no       | `8787`        | Standalone HTTP server port.                     |
| `PAYD_PROJECTS_DATASET` | no     | `public/data/projects_enriched.json` | Override dataset path for tests. |

---

## Security

- `CMC_API_KEY` is read **only** from `process.env` (server-side).
- The adapter never writes the key into a log, a payload, or HTML.
- The HTTP layer never reflects the key in headers or bodies.
- The core service has no client / browser code path; the key cannot
  leak to the front-end through this gateway.
- The optional Supabase Edge wrapper also reads the key from
  `Deno.env.get('CMC_API_KEY')` only.

A grep across `public/`, `code/`, and `dist/` is run before every release
to confirm no real key is committed. Current audit:

```
CMC_SECRET_EXPOSED = NO
```

---

## Caching

- TTL: **60 seconds** per canonical id, in-memory only.
- Key shape: `payd-market:<canonical_id>`.
- Cache does **not** cross assets.
- `PROVIDER_UNAVAILABLE` / `RATE_LIMITED` / `INVALID_RESPONSE` results are
  **not** cached — the next caller retries.
- `LIVE` and `PARTIAL` are cached.
- `UNKNOWN_MAPPING` and `MAPPING_CONFLICT` are cached (the dataset does
  not change in 60 seconds).
- Concurrent identical requests for the same canonical id share a single
  in-flight promise.

---

## Timeouts

- Default provider timeout: **4000 ms** (within the 3–5s spec window).
- The HTTP handler never blocks longer than the cache + provider call.
- A timeout is surfaced as `PROVIDER_UNAVAILABLE` (mapped from
  `AbortError`).

---

## Deployment

### Node / VPS

```bash
CMC_API_KEY=... \
PAYD_PROJECTS_DATASET=/abs/path/to/projects_enriched.json \
PORT=8787 \
node code/server/market/server.js
```

### Supabase Edge (optional)

```bash
supabase functions deploy intelligence-market \
  --project-ref <ref> \
  --no-verify-jwt
```

Environment on Supabase:

```
CMC_API_KEY=...           # server-side secret
PAYD_PROJECTS_DATASET=... # bundled or mounted at edge
```

The Supabase wrapper is **thin**: it parses the request URL and delegates
to `createPaydMarketService()` from `code/server/market/payd_market_service.js`.

### Other runtimes

The core (`payd_market_service.js`) is plain ES2020 JavaScript with no
runtime-specific APIs beyond `fetch` and `AbortController`, both of which
exist in modern Node, Deno, Bun, and Cloudflare Workers. The HTTP layer
(`server.js`) is Node-only; for Deno/Edge use `supabase/functions/intelligence-market/index.js`
or write your own adapter that delegates to `createPaydMarketService()`.

---

## Step 3 — Frontend integration contract

PAYD Intelligence will replace its current CoinGecko-based pipeline with a
single `fetch('/api/intelligence/market?id=<canonical-id>')` per asset.

The front-end MUST:

1. Call PAYD only — never call CoinMarketCap or CoinGecko directly.
2. Render `envelope.status` as the pill text:
   `LIVE`, `PARTIAL`, `UPDATING`, `UNKNOWN_MAPPING`, `MAPPING_CONFLICT`,
   `PROVIDER_UNAVAILABLE`, `PROVIDER_ERROR`, `RATE_LIMITED`,
   `INVALID_RESPONSE`, `INVALID_ID`.
3. Render `envelope.market.*` only when status is `LIVE` or `PARTIAL`.
4. When status is anything else, render `—` for every numeric field and a
   non-blocking "Market data temporarily unavailable" hint.
5. Never substitute CoinGecko, local JSON, or any other source for these
   values. Accuracy > display.

Step 3 of this work stream will provide the frontend client module.

---

## Running tests

```
node code/server/market/test/market_gateway.test.js
```

No network is touched. All tests pass in well under 1 second.

---

## What this gateway NEVER does

- It does not fall back to CoinGecko for live prices.
- It does not read price / market_cap / FDV / volume / performance from
  `projects_enriched.json` or any local JSON snapshot.
- It does not fabricate a CMC id when `cmcId` is missing.
- It does not silently swallow provider errors.
- It does not expose `CMC_API_KEY` to the browser.
- It does not bulk-fetch all 341 mapped tokens. The service is per-asset.
