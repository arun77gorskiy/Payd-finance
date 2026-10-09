# PAYD Finance — CoinMarketCap Market Gateway (Stage 5B)

Backend-only Vercel Functions package for the existing PAYD Finance project. The main PAYD frontend remains hosted separately; this repository branch does not enable the frontend live endpoint.

## Endpoints

- `GET /healthz` (rewrite to `/api/healthz`): readiness, resolver counts, and CMC authentication presence flag (never the secret).
- `GET /api/intelligence/market?id=bitcoin`: canonical PAYD market envelope.

## Verified canonical mapping

`public/data/intelligence/token-index.json` is the unchanged Stage 4 export (SHA-256 `b6b994767738939affcea833973f3030d1ee81b12bb3a0276be992bd803fbc67`): 354 records, 323 unique CMC IDs, 31 unmapped. Never infer CMC IDs by symbol.

## Local checks

Requires Node.js 22. Run `npm test` (no dependencies, no live CMC requests). The tests cover 48 core cases and 15 offline Vercel cases.

## Deploying a separate Vercel backend

1. Create a **new** Vercel project named `payd-cmc-backend` from this GitHub repository. Do not reuse the unrelated `paydfinance-gemspace` project.
2. Deploy this Stage 5B branch for review. Configure the **server-side** environment variable `CMC_API_KEY` using Vercel's protected settings. Do not place it in source control.
3. Set `PAYD_ALLOWED_ORIGINS` to the exact production PAYD frontend origin (for example `https://payd.finance` if that is the current site URL). Do not use `*`.
4. Verify `/healthz` and live quote responses on the actual Vercel deployment. Complete the authenticated 323-project audit before merging or connecting the frontend.

Production and Vercel preview functions fail closed with HTTP 503 when `CMC_API_KEY` is missing or `CMC_FORCE_KEYLESS=true`.

**Status:** Local tests passed. No production deployment, authenticated quote verification, or 323-project live audit has been performed by this PR.

See `docs/STAGE5B_VERCEL_DEPLOYMENT_REPORT.md` for the deployment checklist.
