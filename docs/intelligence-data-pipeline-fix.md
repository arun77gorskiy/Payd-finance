# PAYD Intelligence data pipeline fix

## Canonical runtime flow

1. `/data/projects.json` — identity universe.
2. `/data/projects_enriched.json` — durable deep-research snapshot.
3. `intelligence-data.js` loads both.
4. A client-side CoinGecko batch overlay refreshes market data for the full universe (up to 400 IDs in two requests) with a 5-minute cache.
5. If CoinGecko fails or rate-limits, the durable snapshot remains the fallback.
6. Missing values stay `null`; only provider-confirmed zero values render as `0`/`$0`.

## Persistent refresh

The browser cannot persist changes back into static `/public/data/*.json`. `LocalJsonDataProvider` PUT writes are best-effort only and are not a server-side scheduler.

Use the canonical server/build updater:

```bash
npm run update:intelligence-market
```

It reads both supported project schemas, refreshes CoinGecko market data in batches, preserves deep enrichment, writes the canonical `{ projects: [...] }` schema atomically, and records provenance/version metadata.

For true unattended updates, run this command in the deployment environment / scheduled build three times per week (or more frequently if desired). The frontend live overlay means visitors still see current market values between persistent snapshot runs.
