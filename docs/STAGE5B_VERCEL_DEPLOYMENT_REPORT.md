# Stage 5B — Vercel backend deployment checklist

## Current status

- **Local package:** Prepared from MiniMax's Stage 5B archive plus the original Stage 4 `token-index.json` export.
- **GitHub PR:** Review-only, based on `main`; no changes to the PAYD production frontend.
- **Local verification:** 48/48 core tests and 15/15 offline Vercel tests passed.
- **Production deployment:** Not performed. **Production authenticated CMC tests:** Not performed.
- **Live audit of all 323 mapped projects:** Not performed.

## Integrity

- `public/data/intelligence/token-index.json` SHA-256: `b6b994767738939affcea833973f3030d1ee81b12bb3a0276be992bd803fbc67`.
- Total: 354. CMC mapped: 323. No CMC mapping: 31. CMC ID duplicates: 0.
- `api/healthz.js` returns these counts in `resolver` when the service starts.
- No API keys, personal access tokens, `.env` files, or frontend files are included.

## Security safeguards added during review

- Vercel production and preview fail closed if `CMC_API_KEY` is missing or `CMC_FORCE_KEYLESS=true`.
- Both serverless functions explicitly include the canonical JSON dataset via `functions.*.includeFiles`.
- Vercel project name is not hardcoded in `vercel.json`; use `payd-cmc-backend` as a separate project.
- Node.js 22 runtime selected; local offline tests cover authentication failure.
- `CMC_API_KEY` must be configured only in Vercel's protected environment variables.

## Deployment procedure

1. Review the Stage 5B PR, then use Vercel to import `arun77gorskiy/Payd-finance` as a **new project**, named `payd-cmc-backend`. Do not modify the existing main PAYD frontend hosting or the unrelated GemSpace Vercel project.
2. Set the GitHub branch for the test/preview deployment to `stage5b/vercel-deployment` and root directory to `./`. Framework preset: Other. No custom build/output command is needed.
3. Configure `CMC_API_KEY` in Vercel Environment Variables for the deployment environment. Do not paste the secret in GitHub or ChatGPT. Set `PAYD_ALLOWED_ORIGINS` to the actual production frontend origin.
4. Deploy and verify `GET /healthz`: HTTP 200, `status: UP`, `cmc_api_key_present: true`, `stats.accessMode: PRO_API`, `resolver.total: 354`, `resolver.cmc_mapped: 323`, `resolver.no_cmc_mapping: 31`.
5. Verify `GET /api/intelligence/market?id=bitcoin`, `ethereum`, `chainlink`, `ondo-finance`, `bittensor`, `aave`, and `decentraland`: correct canonical ID, CMC ID, symbol, provider, LIVE/PARTIAL status where CMC has valid data, and the eight market fields.
6. Compare ETH's eight fields with authenticated raw CMC. Audit all 323 mapped IDs, including the previous 145 rate-limited and 28 invalid-data cases. Report missing/invalid data explicitly; never fabricate zeros.
7. Test cache isolation, 60-second shared cache, CORS allow-list, cold start, missing-key failure, and CMC 401/403/429/500/timeout handling.
8. **Do not enable the frontend LIVE endpoint or modify `market-snapshot.json` in Stage 5B.** Do not merge to `main` until review and production verification are complete.

## Required final production result

Mark Stage 5B **COMPLETE** only after deployment and all authenticated production checks pass. Local green tests alone do not establish production readiness.
