# Stage 5C — CMC mapping repair

Status: **258 strict PASS / 65 FAIL; 79 corrected mappings released; runtime parity verified for 77, with QuickSwap New/SEED Photo pending numeric validation**.

## Latest full audit

The user-supplied Preview health response confirms commit 083861149fadfbdb4489fad294670d65509148d2 and dataset SHA-256 02e2faaa0c512cac6eccebb78bb43b4ca75ed4aa0e538bff5468e0b121ae1d97 at 2026-10-13T18:38:39.980Z. The strict audit at 2026-10-13T18:38:55.920Z checks all 323 retained CMC IDs: 321 returned quotes, 258 PASS, 65 FAIL, zero duplicate CMC/canonical IDs, no structural failures and all seven mandatory tokens passing.

| Tested commit | PASS | FAIL | Result |
| --- | ---: | ---: | --- |
| d315f64 | 157 | 166 | Original full audit |
| 6ef72e3 | 179 | 144 | All 22 exact slug corrections passed |
| a389303 | 254 | 69 | All 75 first-cohort ID replacements passed |
| 7bae33a | 256 | 67 | BOB and GUN passed; MINT has invalid_price |
| 0838611 | 258 | 65 | QuickSwap New/SEED passed; Everclear/TBILL/USTB have invalid_price |

Latest raw evidence: reports/stage5c-third-id-audit-20261013.json and reports/stage5c-third-id-healthz-20261013.json. Previous additional-ID evidence remains in reports/stage5c-additional-id-audit-20261013.json and reports/stage5c-additional-id-healthz-20261013.json. The Markdown attachment contains complete JSON; no footer repair was needed. Its filename and SHA-256 are recorded in reports/stage5c-repair.json. Earlier audits remain in reports/stage5c-live-audit-20261012.json and reports/stage5c-id-audit-20261012.json.

## Quarantine and additional corrections

| Canonical ID | Symbol | Old CMC ID | Corrected CMC ID | Corrected slug | Latest decision |
| --- | --- | ---: | ---: | --- | --- |
| bob | BOB | 31962 | 38970 | bob-build-on-bitcoin | Strict PASS and runtime parity PASS; released |
| off-the-grid | GUN | 32200 | 36156 | gunz | Strict PASS and runtime parity PASS; released |
| mintchain | MINT | 31417 | 36005 | mint-blockchain | Exact identity; invalid_price, quarantine retained |

None of the 256 previously passing entries failed. BOB/GUN and QuickSwap New/SEED Photo release records retain the tested commit, dataset hash and audit timestamp. MINT's returned ID, symbol and slug match its corrected mapping, but the price fails validation; runtime market data stays unavailable. A strict PASS alone does not establish positive normalized price or numeric field parity: the runtime pipeline still applies its existing positive-price guard.

The canonical table retains 354 records, 323 distinct CMC IDs and 31 originally unmapped records. Runtime-eligible count is now 258; quarantine count is 65. All 83 ID corrections preserve old mappings and evidence: 79 passed strict quotes (77 have numeric runtime proof, two await it), and four exact-identity mappings remain unavailable: MINT, Everclear, TBILL and USTB. All metadata corrections have now received a full strict live reaudit. Canonical IDs, symbols, sectors and snapshot market-cap values are unchanged.

The latest complete strict audit reports 51 symbol mismatches, 12 invalid-price-only entries (including the four unavailable corrected IDs), and two absent quotes. Some symbol mismatches are rebrands; they are not automatically classified as wrong projects. Every quarantined or unmapped entry returns no market data and makes no provider call through the public service.

QuickSwap New selection is now metadata-confirmed using issuer utility/migration documentation and matching token contracts; the Old listing remains excluded. Explicit rebrands including TON/GRAM, INST/FLUID, FXS/FRAX and IOTA/MIOTA remain under review. The 16-entry metadata review and live follow-up are in reports/stage5c-identity-review-20261013.json: three ID corrections, 13 held research leads, and two subsequent releases. Holds concern ticker differences, product/lifecycle or migration questions, and searches without a primary match; they are not final taxonomy. Toucan's issuer states that BCT admin control transferred to KlimaDAO and BCT is no longer its product. Missing quotes, preview listings, inaccessible websites and unsuccessful searches do not prove that no token exists.

## Runtime field parity

Preview-only GET /api/audit-stage5c-runtime?run=1 dynamically validates corrected mappings released after a live audit. It now selects 79 released entries, including QuickSwap New and SEED Photo. MINT, Everclear, TBILL and USTB remain quarantined and are excluded.

1. Fetch current authenticated CMC quotes through the existing adapter in one batch.
2. Pass the fresh payload through the existing resolver, service and normalizer using an isolated audit cache.
3. Require LIVE/PARTIAL status, exact identity and positive normalized price.
4. Compare eight fields exactly with the raw quote: price, 24h/7d/30d change, market cap, FDV, 24h volume and rank. Null and zero remain distinct.

The first runtime response matches commit 5d11b1f16fa420ce564090600e01bec6367857ce and dataset SHA-256 69866b22c711d6e64d376fd97c5c6ae5b5894a22d2d8660f6925065602a963b5: 75 LIVE, 75 PASS, zero FAIL and 600/600 exact comparisons. Each canonical/CMC ID matches the released table and every price is positive. Evidence: reports/stage5c-runtime-audit-20261013.json. Its final ts string was truncated after 2026-10-13T12:36:03; audit ts is null with the original prefix/recovery note preserved. Complete rows, counts and provider timestamps (2026-10-13T12:35:03.000Z) were not altered or invented.

The expanded authenticated response at 2026-10-13T16:42:12.997Z matches commit d12ab3133504b30fbe7ef30f9bf214e489c13881 and dataset SHA-256 4184694a8bc16d80c82a5279837679b7b803409f2d68e337a5cc28f502ba97a7. All 77 are LIVE with positive prices, 77 PASS / 0 FAIL and 616/616 exact comparisons; returned canonical/CMC IDs exactly match the release manifest. BOB/GUN are included and MINT is absent. The complete timestamp and results required no recovery. Evidence: reports/stage5c-runtime-77-audit-20261013.json. The diagnostic makes no mapping changes or quarantine releases. This result applies to the recorded tested version, before the five new metadata changes.

The diagnostic verifies the server data pipeline with fresh real quotes. It does not independently test the public market HTTP route, its cache or CORS, or the frontend. Public-route headers are covered by offline smoke tests. The diagnostic is unavailable in production. The strict Stage 5B audit remains byte-for-byte unchanged and still checks all 323 IDs, including all 65 quarantined failures.

## Validation and outstanding work

79 offline tests pass: 48 core, 15 Vercel smoke and 16 mapping/runtime audit tests. Validate dataset collisions, unchanged canonical fields, complete audit coverage, release selection and quarantine consistency against the latest evidence.

Next, retrieve /api/audit-stage5c-runtime?run=1 on the new Preview. Require its new commit/dataset fingerprint, checked=79, pass=79, fail=0 and all 632 exact field comparisons true. The prior 77-entry evidence remains valid for the recorded d12ab31 version, but it does not validate the two new releases or this deployment. Continue evidence-based identity/data and token/stablecoin-wrapped/project_without_token/unverified taxonomy review for the 65 quarantined and 31 originally unmapped entries. Stage 5C remains incomplete. This draft PR targets stage5b/vercel-deployment; production promotion is not performed here.

## Next metadata cohort, 2026-10-13

| Canonical ID | Symbol | Old CMC ID | Corrected CMC ID | Corrected slug |
| --- | --- | ---: | ---: | --- |
| quickswap | QUICK | 10366 | 19966 | quickswap-new |
| everclear | CLEAR | 29876 | 34512 | everclear |
| seed-photo | SEED | 10895 | 25490 | seed-photo |
| openeden | TBILL | 28143 | 25158 | openeden-tbill-vault |
| superstate | USTB | 32188 | 37086 | superstate-short-duration-us-government-securities-fund-ustb |

The full live audit confirms QuickSwap New and SEED Photo PASS; these two are released with numeric runtime validation pending. Everclear, OpenEden TBILL and Superstate USTB return the expected ID/symbol/slug but fail price validation, so remain quarantined. Preserve all canonical IDs, symbols, sectors and snapshot values, old mappings/reasons and collision protection. The source evidence, held research cases and live follow-up are in reports/stage5c-next-identity-review-20261013.json.

QuickSwap's issuer identifies New QUICK as the token with current utility and documents Ethereum/Polygon contracts plus the 1:1000 conversion from Old. The provider explorer target matches the documented New Ethereum contract. No stored price, supply or snapshot is multiplied by the conversion ratio. Everclear's issuer mainnet registry and provider target agree on CLEAR's contract; the unmapped connext record is not merged by alias.

SEED NFT Marketplace's provider listing explicitly links Seed.Photo and its BNB token contract. The issuer site timed out, so do not claim independent issuer-contract or complete sector confirmation. OpenEden TBILL and Superstate/Invesco USTB are distinct tokenized fund products. Issuer evidence identifies their symbols/contracts; the fund-manager transition preserves USTB's ticker and token address. Do not substitute EDEN, USDO or USCC, infer a fixed $1 market price, or invent market cap/FDV from issuer NAV. Their provider preview listings do not prove quote availability.

Held cases: Matrixdock STBT has issuer product/token evidence but no confirmed numeric provider ID from this search; Bullieverse's provider ticker $BULL differs from BULL; ROMCOIN does not establish the sparse canonical Gaming ROM identity; RWAX uses APP rather than canonical RWAX; Polynomial's preview symbol is a placeholder rather than POLY. These holds do not prove project_without_token and do not authorize automatic ticker changes.

## Latest five-entry strict quote decisions

| Canonical ID | CMC ID | Returned identity | Price decision | Runtime release |
| --- | ---: | --- | --- | --- |
| quickswap | 19966 | Strict PASS | Passed strict audit; numeric runtime test pending | Released |
| seed-photo | 25490 | Strict PASS | Passed strict audit; numeric runtime test pending | Released |
| everclear | 34512 | CLEAR / everclear match | invalid_price | Quarantined |
| openeden | 25158 | TBILL / openeden-tbill-vault match | invalid_price | Quarantined |
| superstate | 37086 | USTB / superstate-short-duration-us-government-securities-fund-ustb match | invalid_price | Quarantined |

The complete strict audit provides no raw numeric price for its failure rows; do not infer that an invalid price is specifically zero. Issuer fund NAV and supply evidence are not substituted for CMC market quotes. The backend still rejects non-positive normalized prices and preserves unavailable fields as unavailable. The 79-entry runtime diagnostic checks positive prices and exact eight-field normalization on fresh quotes before numerical verification is considered complete.
