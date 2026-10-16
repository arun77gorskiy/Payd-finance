# Stage 5C — CMC mapping repair

Status: **latest strict audit 261 PASS / 62 FAIL; FLUID/WCT/NEURON released; 82-release runtime diagnostic pending (656 field comparisons). Previous runtime evidence is 79/79 PASS, 632/632 fields.**

## Latest full audit

The user-supplied Preview health response confirms commit 3cec2fe7436c16a439c6853ac93394abb51ae41c and dataset SHA-256 a2fc5e2be61f246498ccaefd411bd699d4c28f8613324553fbe20e23ca7eb5d5 at 2026-10-16T18:01:43.685Z. The complete strict audit at 2026-10-16T18:02:03.345Z checks all 323 retained CMC IDs: 321 returned quotes, 261 PASS, 62 FAIL, zero duplicate CMC/canonical IDs, no structural failures and all seven mandatory tokens passing. Every failure expectation matches the tested table. The audit route does not embed a commit/hash; deployment attribution uses the paired user-supplied Health response and matching cohort results.

| Tested commit | PASS | FAIL | Result |
| --- | ---: | ---: | --- |
| d315f64 | 157 | 166 | Original full audit |
| 6ef72e3 | 179 | 144 | All 22 exact slug corrections passed |
| a389303 | 254 | 69 | All 75 first-cohort ID replacements passed |
| 7bae33a | 256 | 67 | BOB and GUN passed; MINT has invalid_price |
| 0838611 | 258 | 65 | QuickSwap New/SEED passed; Everclear/TBILL/USTB have invalid_price |
| 3cec2fe | 261 | 62 | FLUID/WCT/NEURON passed; CREDIT/PCN have invalid_price |

Latest raw evidence: reports/stage5c-issuer-quote-audit-20261016.json and reports/stage5c-issuer-healthz-20261016.json. Previous 258/65 evidence remains in reports/stage5c-third-id-audit-20261013.json and reports/stage5c-third-id-healthz-20261013.json. Previous additional-ID evidence remains in reports/stage5c-additional-id-audit-20261013.json and reports/stage5c-additional-id-healthz-20261013.json. The Markdown attachment contains complete JSON; no footer repair was needed. Its filename and SHA-256 are recorded in reports/stage5c-repair.json. Earlier audits remain in reports/stage5c-live-audit-20261012.json and reports/stage5c-id-audit-20261012.json.

## Quarantine and additional corrections

| Canonical ID | Symbol | Old CMC ID | Corrected CMC ID | Corrected slug | Latest decision |
| --- | --- | ---: | ---: | --- | --- |
| bob | BOB | 31962 | 38970 | bob-build-on-bitcoin | Strict PASS and runtime parity PASS; released |
| off-the-grid | GUN | 32200 | 36156 | gunz | Strict PASS and runtime parity PASS; released |
| mintchain | MINT | 31417 | 36005 | mint-blockchain | Exact identity; invalid_price, quarantine retained |

None of the 258 previously passing entries failed in the latest audit. BOB/GUN and QuickSwap New/SEED Photo release records retain the tested commit, dataset hash and audit timestamp. MINT's returned ID, symbol and slug match its corrected mapping, but the price fails validation; runtime market data stays unavailable. A strict PASS alone does not establish positive normalized price or numeric field parity: the runtime pipeline still applies its existing positive-price guard.

The canonical table retains 354 records, 323 distinct CMC IDs and 31 originally unmapped records. Runtime-eligible count is now 261; quarantine count is 62. All 88 ID corrections preserve old mappings and evidence: 82 passed strict quotes (79 also have prior numeric runtime parity), and six exact-identity mappings remain unavailable (MINT, Everclear, TBILL, USTB, CREDIT and PCN). No corrected IDs await their first full strict audit. FLUID/WCT/NEURON are newly released; numeric field parity for these three and the current deployment is pending. Permanent canonical IDs, names, sectors and snapshot market-cap values are unchanged. Three current-symbol corrections are explicitly reviewed and preserve previous_catalog_symbol: INST→FLUID (issuer rebrand), WC→WCT and NEURO→NEURON (catalog errors). Other symbols are unchanged; no resolver alias fallback or relaxed validator is introduced.

The latest complete strict audit reports 46 symbol mismatches, 14 invalid-price-only entries (including the six unavailable corrected IDs), and two absent quotes. Some symbol mismatches are rebrands; they are not automatically classified as wrong projects. Every quarantined or unmapped entry returns no market data and makes no provider call through the public service.

QuickSwap New selection is now metadata-confirmed using issuer utility/migration documentation and matching token contracts; the Old listing remains excluded. INST/FLUID is issuer/contract-reviewed and has now passed the strict quote audit; numeric runtime parity is pending. TON/GRAM, FXS/FRAX and IOTA/MIOTA remain under review. The 16-entry metadata review and live follow-up are in reports/stage5c-identity-review-20261013.json: three ID corrections, 13 held research leads, and two subsequent releases. Holds concern ticker differences, product/lifecycle or migration questions, and searches without a primary match; they are not final taxonomy. Toucan's issuer states that BCT admin control transferred to KlimaDAO and BCT is no longer its product. Missing quotes, preview listings, inaccessible websites and unsuccessful searches do not prove that no token exists.

## Runtime field parity

Preview-only GET /api/audit-stage5c-runtime?run=1 dynamically validates corrected mappings released after a live audit. It now selects all 82 corrected and released entries, including FLUID/WCT/NEURON, QuickSwap New and SEED Photo. MINT/CLEAR/TBILL/USTB/CREDIT/PCN and the other quarantined records are excluded. Expected verification is 82 PASS / 0 FAIL and 656/656 exact field comparisons from one provider batch; this expanded result has not yet been observed.

1. Fetch current authenticated CMC quotes through the existing adapter in one batch.
2. Pass the fresh payload through the existing resolver, service and normalizer using an isolated audit cache.
3. Require LIVE/PARTIAL status, exact identity and positive normalized price.
4. Compare eight fields exactly with the raw quote: price, 24h/7d/30d change, market cap, FDV, 24h volume and rank. Null and zero remain distinct.

The first runtime response matches commit 5d11b1f16fa420ce564090600e01bec6367857ce and dataset SHA-256 69866b22c711d6e64d376fd97c5c6ae5b5894a22d2d8660f6925065602a963b5: 75 LIVE, 75 PASS, zero FAIL and 600/600 exact comparisons. Each canonical/CMC ID matches the released table and every price is positive. Evidence: reports/stage5c-runtime-audit-20261013.json. Its final ts string was truncated after 2026-10-13T12:36:03; audit ts is null with the original prefix/recovery note preserved. Complete rows, counts and provider timestamps (2026-10-13T12:35:03.000Z) were not altered or invented.

The expanded authenticated response at 2026-10-13T16:42:12.997Z matches commit d12ab3133504b30fbe7ef30f9bf214e489c13881 and dataset SHA-256 4184694a8bc16d80c82a5279837679b7b803409f2d68e337a5cc28f502ba97a7. All 77 are LIVE with positive prices, 77 PASS / 0 FAIL and 616/616 exact comparisons; returned canonical/CMC IDs exactly match the release manifest. BOB/GUN are included and MINT is absent. The complete timestamp and results required no recovery. Evidence: reports/stage5c-runtime-77-audit-20261013.json. The diagnostic makes no mapping changes or quarantine releases. This result applies to the recorded tested version, before the five new metadata changes.

The diagnostic verifies the server data pipeline with fresh real quotes. It does not independently test the public market HTTP route, its cache or CORS, or the frontend. Public-route headers are covered by offline smoke tests. The diagnostic is unavailable in production. The strict Stage 5B audit remains byte-for-byte unchanged and still checks all 323 IDs, including all 62 quarantined failures.

## Validation and outstanding work

79 offline tests pass: 48 core, 15 Vercel smoke and 16 mapping/runtime audit tests. Validate dataset collisions, permanent-ID/name/sector/snapshot preservation, the three reviewed symbol changes and their archived prior values, complete audit coverage, release selection and quarantine consistency.

The complete runtime response at 2026-10-14T08:41:15.241Z matches commit 743e1f6050d1876dc0be88bcf3abd6046667ee80 and dataset SHA-256 6a0d3748fd3912040427cd48f4dc7751bd13fc7569d68f73f24b186729b0e311: all 79 LIVE/PASS, zero FAIL, 632/632 exact comparisons, all positive prices and exact canonical/CMC release identities. Evidence: reports/stage5c-runtime-79-audit-20261014.json; complete capture and timestamp, no recovery. Next, confirm the release commit and dataset SHA-256 5ab467cf9daee464c05f2e34624e0a4a93a0855fe6959b5fbfe7eca75e7b2b52 in /api/healthz and run /api/audit-stage5c-runtime?run=1 for all 82 releases. The 79-entry numeric evidence applies to the recorded tested version; those previously released records and the diagnostic implementation have not changed. Continue evidence-based identity/data and token/stablecoin-wrapped/project_without_token/unverified taxonomy review for the 62 quarantined and 31 originally unmapped entries. Stage 5C remains incomplete. This draft PR targets stage5b/vercel-deployment; production promotion is not performed here.

## Next metadata cohort, 2026-10-13

| Canonical ID | Symbol | Old CMC ID | Corrected CMC ID | Corrected slug |
| --- | --- | ---: | ---: | --- |
| quickswap | QUICK | 10366 | 19966 | quickswap-new |
| everclear | CLEAR | 29876 | 34512 | everclear |
| seed-photo | SEED | 10895 | 25490 | seed-photo |
| openeden | TBILL | 28143 | 25158 | openeden-tbill-vault |
| superstate | USTB | 32188 | 37086 | superstate-short-duration-us-government-securities-fund-ustb |

The full live audit and subsequent 79-entry numeric diagnostic confirm QuickSwap New and SEED Photo PASS; both are released and numerically verified. Everclear, OpenEden TBILL and Superstate USTB return the expected ID/symbol/slug but fail price validation, so remain quarantined. Preserve all canonical IDs, sectors, snapshot values, old mappings/reasons and collision protection. Symbol exceptions require the explicit manual issuer/contract review described below and preservation of the old catalog values. The source evidence, held research cases and live follow-up are in reports/stage5c-next-identity-review-20261013.json.

QuickSwap's issuer identifies New QUICK as the token with current utility and documents Ethereum/Polygon contracts plus the 1:1000 conversion from Old. The provider explorer target matches the documented New Ethereum contract. No stored price, supply or snapshot is multiplied by the conversion ratio. Everclear's issuer mainnet registry and provider target agree on CLEAR's contract; the unmapped connext record is not merged by alias.

SEED NFT Marketplace's provider listing explicitly links Seed.Photo and its BNB token contract. The issuer site timed out, so do not claim independent issuer-contract or complete sector confirmation. OpenEden TBILL and Superstate/Invesco USTB are distinct tokenized fund products. Issuer evidence identifies their symbols/contracts; the fund-manager transition preserves USTB's ticker and token address. Do not substitute EDEN, USDO or USCC, infer a fixed $1 market price, or invent market cap/FDV from issuer NAV. Their provider preview listings do not prove quote availability.

Held cases: Matrixdock STBT has issuer product/token evidence but no confirmed numeric provider ID from this search; Bullieverse's provider ticker $BULL differs from BULL; ROMCOIN does not establish the sparse canonical Gaming ROM identity; RWAX uses APP rather than canonical RWAX; Polynomial's preview symbol is a placeholder rather than POLY. These holds do not prove project_without_token and do not authorize automatic ticker changes.

## Previous five-entry strict quote decisions, 2026-10-13

| Canonical ID | CMC ID | Returned identity | Price decision | Runtime release |
| --- | ---: | --- | --- | --- |
| quickswap | 19966 | Strict PASS | Passed strict audit and exact runtime fields | Released |
| seed-photo | 25490 | Strict PASS | Passed strict audit and exact runtime fields | Released |
| everclear | 34512 | CLEAR / everclear match | invalid_price | Quarantined |
| openeden | 25158 | TBILL / openeden-tbill-vault match | invalid_price | Quarantined |
| superstate | 37086 | USTB / superstate-short-duration-us-government-securities-fund-ustb match | invalid_price | Quarantined |

The complete strict audit provides no raw numeric price for its failure rows; do not infer that an invalid price is specifically zero. Issuer fund NAV and supply evidence are not substituted for CMC market quotes. The backend still rejects non-positive normalized prices and preserves unavailable fields as unavailable. The recorded 79-entry runtime diagnostic confirms positive prices and exact eight-field normalization on fresh quotes for those releases; it does not complete the unresolved catalog taxonomy.

## Manual issuer/contract identity review, 2026-10-14

| Permanent canonical ID | Previous catalog symbol | Current symbol | Old CMC ID | Reviewed CMC ID | Decision |
| --- | --- | --- | ---: | ---: | --- |
| instadapp | INST | FLUID | 6363 | 10508 | Issuer-documented same-contract rebrand; strict PASS, released |
| walletconnect | WC | WCT | 27319 | 33152 | Catalog ticker correction; strict PASS, released |
| cerebrumdao | NEURO | NEURON | 25224 | 31961 | Catalog ticker correction; strict PASS, released |
| creditum | CREDIT | CREDIT | 8992 | 17132 | Exact-symbol provider correction; invalid_price, quarantined |
| pollen-mobile | PCN | PCN | 22614 | 20267 | Provider correction; invalid_price and external market validity unresolved |

This is an explicit source review, not an automatic ticker rewrite to fit a failed quote. Fluid issuer material preserves the token contract and a 1:1 unit relationship. WalletConnect's issuer announcement and deployment repository identify WCT at the provider-linked address. Cerebrum's NEURON page and linked Ethereum purchase token identify the same address as its provider listing. The permanent IDs remain stable; previous_catalog_symbol and symbol_repair distinguish historical INST from erroneous catalog WC/NEURO. Neither WC nor NEURO is invented as a formerly real token. Full evidence and contracts: reports/stage5c-issuer-identity-review-20261014.json.

The 2026-10-16 complete strict audit passes the three manually reviewed symbol/ID corrections: instadapp/FLUID 10508, walletconnect/WCT 33152 and cerebrumdao/NEURON 31961. These three are now mapping_status=verified with the exact tested commit/hash/timestamp retained. CREDIT 17132 and PCN 20267 return the expected symbol/slug but invalid_price; both remain unverified and make zero provider calls through the public service. A failure row does not reveal whether the raw price was zero, null or another invalid value. Runtime eligibility is 261, quarantine 62, retained provider IDs 323 and originally unmapped entries 31. Numeric runtime parity is pending for the three new releases; the 79 previously released identities are unchanged.

Creditum issuer documentation identifies the Fantom lending protocol and CREDIT, rather than similarly named consumer-credit businesses. Its historical documentation/provider preview do not establish current market availability. Pollen's issuer identifies PCN but describes its internal network denomination as non-cash value and explicitly excludes stablecoin status. The internal $0.10 number must not become a market price, market cap or FDV. PCN carries an additional external-market-validity release gate; a bare positive provider number is insufficient without establishing its market applicability.

Huddle01 remains held: issuer materials describe HUDL and testnet tHUDL rewards, but no numeric provider mapping/currently tradable HUDL asset was established. Reward-calculator $1/FDV examples are not price evidence. Inaccessible or missing listing pages do not prove token absence. Review-time source dates are recorded; market/lifecycle and full token/stablecoin-wrapped/project_without_token/unverified taxonomy remain incomplete.
