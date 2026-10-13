# Stage 5C — CMC mapping repair

Status: **256 strict CMC PASS / 67 FAIL; 77 corrected mappings released; runtime parity verified for the first 75, with two new releases pending**.

## Latest full audit

The user-supplied Preview health response confirms commit 7bae33a583b3202599a75d1d56e279bd84ea1c22 and dataset SHA-256 aca53d7134395f404b65b0485b57e7d4672625126b2b95bc55d96c05d8e06da3 at 2026-10-13T12:59:28.861Z. The strict audit at 2026-10-13T12:59:43.236Z checks all 323 retained CMC IDs: 321 returned quotes, 256 PASS, 67 FAIL, zero duplicate CMC/canonical IDs, no structural failures and all seven mandatory tokens passing.

| Tested commit | PASS | FAIL | Result |
| --- | ---: | ---: | --- |
| d315f64 | 157 | 166 | Original full audit |
| 6ef72e3 | 179 | 144 | All 22 exact slug corrections passed |
| a389303 | 254 | 69 | All 75 first-cohort ID replacements passed |
| 7bae33a | 256 | 67 | BOB and GUN passed; MINT has invalid_price |

Latest raw evidence: reports/stage5c-additional-id-audit-20261013.json and reports/stage5c-additional-id-healthz-20261013.json. The Markdown attachment contains complete JSON; no footer repair was needed. Its filename and SHA-256 are recorded in reports/stage5c-repair.json. Earlier audits remain in reports/stage5c-live-audit-20261012.json and reports/stage5c-id-audit-20261012.json.

## Quarantine and additional corrections

| Canonical ID | Symbol | Old CMC ID | Corrected CMC ID | Corrected slug | Latest decision |
| --- | --- | ---: | ---: | --- | --- |
| bob | BOB | 31962 | 38970 | bob-build-on-bitcoin | Strict PASS; released, runtime parity pending |
| off-the-grid | GUN | 32200 | 36156 | gunz | Strict PASS; released, runtime parity pending |
| mintchain | MINT | 31417 | 36005 | mint-blockchain | Exact identity; invalid_price, quarantine retained |

None of the 254 previously passing entries failed. BOB/GUN release records retain the tested commit, dataset hash and audit timestamp. MINT's returned ID, symbol and slug match its corrected mapping, but the price fails validation; runtime market data stays unavailable. A strict PASS alone does not establish positive normalized price or numeric field parity: the runtime pipeline still applies its existing positive-price guard.

The canonical table retains 354 records, 323 distinct CMC IDs and 31 originally unmapped records. Runtime-eligible count is now 256; quarantine count is 67. All 78 ID corrections preserve old mappings and evidence: 77 passed strict quote validation and one (MINT) remains unavailable. Canonical IDs, symbols, sectors and snapshot market-cap values are unchanged.

Remaining failures: 55 symbol mismatches, 10 invalid-price-only entries (including MINT), and two absent quotes. Some symbol mismatches are rebrands; they are not automatically classified as wrong projects. Every quarantined or unmapped entry returns no market data and makes no provider call through the public service.

QuickSwap Old/New and explicit rebrands including TON/GRAM, INST/FLUID, FXS/FRAX and IOTA/MIOTA remain under review. The 16-entry metadata review and live follow-up are in reports/stage5c-identity-review-20261013.json: three ID corrections, 13 held research leads, and two subsequent releases. Holds concern ticker differences, product/lifecycle or migration questions, and searches without a primary match; they are not final taxonomy. Toucan's issuer states that BCT admin control transferred to KlimaDAO and BCT is no longer its product. Missing quotes, preview listings, inaccessible websites and unsuccessful searches do not prove that no token exists.

## Runtime field parity

Preview-only GET /api/audit-stage5c-runtime?run=1 dynamically validates corrected mappings released after a live audit. It now selects 77 entries, including BOB/GUN; quarantined MINT is excluded.

1. Fetch current authenticated CMC quotes through the existing adapter in one batch.
2. Pass the fresh payload through the existing resolver, service and normalizer using an isolated audit cache.
3. Require LIVE/PARTIAL status, exact identity and positive normalized price.
4. Compare eight fields exactly with the raw quote: price, 24h/7d/30d change, market cap, FDV, 24h volume and rank. Null and zero remain distinct.

The first runtime response matches commit 5d11b1f16fa420ce564090600e01bec6367857ce and dataset SHA-256 69866b22c711d6e64d376fd97c5c6ae5b5894a22d2d8660f6925065602a963b5: 75 LIVE, 75 PASS, zero FAIL and 600/600 exact comparisons. Each canonical/CMC ID matches the released table and every price is positive. Evidence: reports/stage5c-runtime-audit-20261013.json. Its final ts string was truncated after 2026-10-13T12:36:03; audit ts is null with the original prefix/recovery note preserved. Complete rows, counts and provider timestamps (2026-10-13T12:35:03.000Z) were not altered or invented.

That historical 75-entry result does not validate BOB/GUN numeric fields or the new deployment. The expanded diagnostic must report checked=77, pass=77, fail=0 and all 616 exact comparisons true, matching the new deployment commit/dataset fingerprint. It makes no mapping changes or quarantine releases.

The diagnostic verifies the server data pipeline with fresh real quotes. It does not independently test the public market HTTP route, its cache or CORS, or the frontend. Public-route headers are covered by offline smoke tests. The diagnostic is unavailable in production. The strict Stage 5B audit remains byte-for-byte unchanged and still checks all 323 IDs, including all 67 quarantined failures.

## Validation and outstanding work

79 offline tests pass: 48 core, 15 Vercel smoke and 16 mapping/runtime audit tests. Validate dataset collisions, unchanged canonical fields, complete audit coverage, release selection and quarantine consistency against the latest evidence.

Next, run the 77-entry runtime diagnostic on the new Preview and provide its JSON response. Continue evidence-based identity/data and token/stablecoin-wrapped/project_without_token/unverified taxonomy review for the 67 quarantined and 31 originally unmapped entries. Stage 5C remains incomplete. This draft PR targets stage5b/vercel-deployment; production promotion is not performed here.
