# Stage 5C — CMC mapping repair

Status: **254 strict CMC PASS; 69 remaining failures; 75/75 runtime field parity PASS (600/600 field comparisons)**.

## Verified live results

| Commit | PASS | FAIL | Meaning |
| --- | ---: | ---: | --- |
| d315f64 | 157 | 166 | Original full audit |
| 6ef72e3 | 179 | 144 | All 22 exact slug corrections passed |
| a389303 | 254 | 69 | All 75 CMC ID replacements passed |

The latest authenticated full audit at 2026-10-12T11:46:50.714Z covers all 323 retained CMC IDs. It returned 321 quotes, zero duplicate CMC/canonical IDs and all seven mandatory tokens passing. The user-supplied /api/healthz confirms the exact a389303 commit and SHA-256 ecd5469fe740e7b30c6e365947a2c971c7665aa1fec7a465c5dd3362beb541ef.

Full source responses are saved in reports/stage5c-live-audit-20261012.json (first repair) and reports/stage5c-id-audit-20261012.json (ID repair).

## Quarantine release

All 75 metadata-corrected IDs passed the fresh full audit. Their mapping_status is now verified and their release evidence records the audit timestamp and tested commit. Runtime-eligible count is 254; quarantine count is 69. The 31 originally unmapped entries remain separate.

Remaining failures: 58 symbol mismatches, 9 invalid-price-only entries, 2 absent quotes. Some symbol mismatches are rebrands, so they are not all classified as wrong projects.

QuickSwap is not repaired to the Old listing: selecting Old/New requires explicit migration and chain/contract review. Rebrands such as TON/GRAM, INST/FLUID, FXS/FRAX and IOTA/MIOTA remain quarantined until separately reviewed. Canonical symbols were not changed in this PR.

Every ID change preserves its before/after mapping and primary CoinMarketCap UCID/symbol/slug evidence in reports/stage5c-repair.json. Snapshot market-cap values and canonical IDs are preserved.

## Runtime field parity

Preview-only GET /api/audit-stage5c-runtime?run=1 validates the 75 newly released entries:

1. Fetch their current authenticated CMC quotes in one batch using the existing adapter.
2. Pass the fresh payload through the existing resolver, service and normalizer with a fresh isolate-local audit cache.
3. Require LIVE/PARTIAL status, exact identity and positive price.
4. Compare all eight requested market fields numerically against the raw quote: price, 24h/7d/30d change, market cap, FDV, 24h volume and rank. Null and zero remain distinct.

This route validates the server data pipeline using fresh real quotes. It does not reuse the public API cache, does not independently test the public market route's HTTP/CORS headers, and does not constitute frontend verification. The public route's header behavior is covered by offline Vercel smoke tests.

The diagnostic route is unavailable in production and never changes canonical mappings. The unchanged Stage 5B audit still checks all 323 IDs, including quarantined failures, so unresolved mappings cannot become artificial PASS entries.

## Validation and next steps

79 offline tests pass: 48 core, 15 Vercel smoke, 16 mapping/runtime audit tests. The canonical table contains 354 records, 323 distinct CMC IDs, 31 originally unmapped entries, 254 eligible entries and 69 quarantined mappings.

The user-supplied Preview response from 2026-10-13 matches commit 5d11b1f16fa420ce564090600e01bec6367857ce and dataset SHA-256 69866b22c711d6e64d376fd97c5c6ae5b5894a22d2d8660f6925065602a963b5. All 75 corrected entries are LIVE, with 75 PASS / 0 FAIL and all 600 exact_fields flags true. Each result matches the released canonical ID and CMC ID; every price is positive. Nulls and provider-reported zeroes are retained. Evidence: reports/stage5c-runtime-audit-20261013.json.

The pasted response has a complete results array but an incomplete final ts string (prefix 2026-10-13T12:36:03). Only that incomplete footer was discarded for parsing; audit ts is null and source_capture preserves the prefix, recovery note and SHA-256 of the original attachment. No timestamp completion, rows or counts were invented. All provider_updated_at fields are complete: 2026-10-13T12:35:03.000Z.

The remaining 69 identity/data cases and the 31 originally unmapped entries still need review and evidence-based token/stablecoin-wrapped/project_without_token/unverified taxonomy. Stage 5C is not complete while that review is outstanding. Production promotion is not performed here.

## Additional metadata review, 2026-10-13

Review 16 of the remaining 69 cases using provider/issuer sources. Correct three exact-symbol mappings, without releasing quarantine:

| Canonical ID | Symbol | Previous CMC ID | Corrected CMC ID | Corrected slug |
| --- | --- | ---: | ---: | --- |
| bob | BOB | 31962 | 38970 | bob-build-on-bitcoin |
| off-the-grid | GUN | 32200 | 36156 | gunz |
| mintchain | MINT | 31417 | 36005 | mint-blockchain |

Issuer evidence confirms the BOB ecosystem token, GUN's role in Off The Grid, and MINT's token and deployed contract. MINT's provider page is a preview listing; positive quote availability has not been established. All three corrections are pending a fresh strict full audit on this new dataset. The last complete audit remains 254 PASS / 69 FAIL; runtime-eligible count is still 254 and quarantine count is still 69. Retain old mappings and audit reasons as provenance.

The 13 held research leads are documented in reports/stage5c-identity-review-20261013.json. They include ticker differences, migration/lifecycle questions, and searches that did not establish a matching primary listing. In particular, Toucan's issuer says BCT admin control transferred to KlimaDAO and BCT is no longer its product. No final taxonomy is inferred from missing quotes, preview listings, inaccessible websites or unsuccessful searches. A further 53 of the original 69 cases and the 31 originally unmapped entries remain outside this review cohort.

The total ID corrections are now 78: 75 live-verified and 3 pending. The 75-entry runtime evidence above applies to the explicitly recorded 5d11b1f commit/dataset, before these three metadata changes. The runtime diagnostic's 75 released identities and its implementation have not changed. For the next live audit, first confirm the new commit/dataset fingerprint in /api/healthz, then retrieve /api/audit-stage5b?run=1. Do not release the three corrections merely because their Preview deployment is READY.
