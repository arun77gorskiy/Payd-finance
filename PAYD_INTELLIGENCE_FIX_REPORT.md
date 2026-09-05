# PAYD Intelligence V2 — Data Pipeline Repair
Date: 2026-09-05

## Root causes found

1. **Snapshot and frontend were disconnected in multiple places.**
   `projects_enriched.json` already contained real values for some projects, but runtime adapters/renderers converted missing fields to zero.

2. **Preloader indexed `projects_enriched.json` incorrectly.**
   Current schema is `{ "projects": [...] }`, while the preloader used `new Map(Object.entries(enriched))`, producing a single `projects` entry instead of an id-indexed map.

3. **Fake-zero conversion was present in the runtime model and renderer.**
   Examples included nodes, unlock %, GitHub fields, community fields, market cap/TVL category rendering and CSV export.

4. **Developer activity expression had an operator-precedence bug.**
   Valid `enriched.github.commits_30d` could still fall through to a different score field.

5. **Persistent update scripts use incompatible dataset schemas.**
   Legacy scripts expect an array or map-by-id while production files use `{ projects: [...] }`. This makes scheduled enrichment unreliable and risks overwriting the canonical file with another shape.

6. **Browser-side LocalJson persistence is not a server-side update mechanism.**
   A static browser cannot persist PUT writes into `/public/data/*.json`. The existing scheduler therefore cannot guarantee shared updates for all users.

7. **Production cache-buster versions were stale.**
   `index.html` referenced August query versions, so a deployment could continue serving cached pre-fix JS.

8. **Tracked universe contains duplicate identities.**
   364 project records contain 349 unique tickers and 339 unique preconfigured CoinGecko IDs. Several entries represent the same token in multiple sectors (AKT, FIL, TAO, POL, MINA, etc.). This is an identity-model issue, not a market API failure.

## Repairs implemented

### Frontend live market overlay
`public/js/intelligence/intelligence-data.js`

- Resolves missing CoinGecko IDs conservatively via `/coins/list`.
- Fetches the market universe in batches of up to 200 IDs.
- Up to 400 IDs require only two market requests.
- 5-minute local cache reduces rate-limit pressure.
- Live market values overlay the durable enriched snapshot in memory.
- If CoinGecko fails/rate-limits, the last valid snapshot remains the fallback.
- Market fields refreshed: price, market cap, FDV, volume, supply, 24h/7d/30d changes, ATH/ATL, rank, 24h high/low.
- Missing data remains `null`.

### Preloader schema fix
`public/js/intelligence/intelligence-data-preloader.js`

- Correctly indexes `{ projects: [...] }` by project id.
- Unknown GitHub stars remain null, not zero.

### Runtime null semantics
`public/js/intelligence/intelligence-data.js`

- Unknown GitHub/activity/community/network/unlock values stay null.
- Verified zero remains zero.
- Fixed developer-activity precedence bug.
- Investment rating is withheld when minimum data coverage is not met.

### Renderer null semantics
`public/js/intelligence/intelligence-render.js`

- Market cap, FDV, TVL, revenue, users, nodes and unlocks no longer convert missing values to zero.
- CSV export preserves missing values as empty instead of fabricated zeros.
- Sparse projects show `Insufficient Data` instead of an implied rating.

### Canonical persistent updater
`code/update_market_snapshot.js`

- Supports both array and `{ projects: [...] }` input formats.
- Reads the entire tracked universe.
- Resolves missing CoinGecko IDs conservatively.
- Fetches market data in batches.
- Preserves existing deep enrichment.
- Writes only canonical `{ projects: [...] }` output.
- Uses atomic temp-file replace.
- Records dataset version, generated time, provider and provenance.
- Never writes missing provider values as zero.

Run in MiniMax/deployment environment:

```bash
npm run update:intelligence-market
```

For persistent shared snapshots this command must be executed by the deployment/build environment on a schedule. Browser JavaScript cannot persist a shared static JSON file by itself.

### Cache invalidation
`public/index.html`

Updated Intelligence asset versions to `20260905-1` so deployment fetches new JS instead of stale cached versions.

## Validation performed

A simulated production load was run across all 364 project records using the actual loader code and mocked provider responses.

Result:
- 364/364 records received live market values in the control simulation.
- Missing CoinGecko IDs: 15 initially; resolver handled 15/15 in the control simulation.
- BTC: market cap / FDV / volume propagated to runtime.
- HNT: market cap / FDV / volume propagated; verified GitHub zero stayed zero rather than being treated as missing.
- RENDER: market cap / FDV / volume propagated.
- AKT: market cap / FDV / volume propagated.
- DePIN: zero fabricated market-cap cells after overlay = 0.
- JS syntax validation passed for all modified files.

The canonical persistent updater was separately tested against a copy of the dataset:
- 364 input records.
- 364 output records.
- 364 market records updated in the mocked control test.
- Existing deep HNT enrichment remained present after update.
- Output remained `{ projects: [...] }`.

## Important remaining work

Market data is now structurally solved for the whole universe on page load. Deep research data is a separate problem:
- GitHub activity
- protocol/chain fees and revenue
- DePIN network adoption
- users/addresses/transactions
- unlock schedules
- partnerships/funding

Those metrics cannot be obtained universally from CoinGecko. They need provider-specific enrichment and a real scheduled execution environment. The current patch deliberately prevents their absence from corrupting market data or appearing as fake zeros.
