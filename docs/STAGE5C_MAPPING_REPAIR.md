# Stage 5C — CMC mapping repair

Status: **latest strict audit 266 PASS / 57 FAIL; GAFI/NB released; SPON/PORTX remain unavailable. Expanded 87-release runtime verification is pending (696 field comparisons); previous proof is 85/85 PASS, 680/680 fields.**

## Latest full audit

The user-supplied Preview health response confirms commit 38c3eb5f579c92fb4ade2cbd01b359c324b1be71 and dataset SHA-256 54f0ae2cf8f65482203fa69b3e63959f089657900882db336683c718a3566377 at 2026-10-16T20:33:27.042Z. The complete strict audit at 2026-10-16T20:33:41.731Z checks all 323 retained CMC IDs: 321 returned quotes, 266 PASS, 57 FAIL, zero duplicate CMC/canonical IDs, no structural failures and all seven mandatory tokens passing. Every failure expectation matches the tested table. The audit route does not embed a commit/hash; deployment attribution uses the paired user-supplied Health response and matching cohort results.

| Tested commit | PASS | FAIL | Result |
| --- | ---: | ---: | --- |
| d315f64 | 157 | 166 | Original full audit |
| 6ef72e3 | 179 | 144 | All 22 exact slug corrections passed |
| a389303 | 254 | 69 | All 75 first-cohort ID replacements passed |
| 7bae33a | 256 | 67 | BOB and GUN passed; MINT has invalid_price |
| 0838611 | 258 | 65 | QuickSwap New/SEED passed; Everclear/TBILL/USTB have invalid_price |
| 3cec2fe | 261 | 62 | FLUID/WCT/NEURON passed; CREDIT/PCN have invalid_price |
| d47234d | 264 | 59 | IOTA/P2P/FRAX passed with retained numeric IDs; all previous 261 PASS remain passing |
| 38c3eb5 | 266 | 57 | GAFI/NB passed; SPON/PORTX match identity but have invalid_price; no regressions |

Latest raw evidence: reports/stage5c-catalog-quote-audit-20261016.json and reports/stage5c-catalog-healthz-20261016.json. Previous 264/59 evidence remains in reports/stage5c-native-quote-audit-20261016.json and reports/stage5c-native-healthz-20261016.json. Previous 261/62 evidence remains in reports/stage5c-issuer-quote-audit-20261016.json and reports/stage5c-issuer-healthz-20261016.json. Previous 258/65 evidence remains in reports/stage5c-third-id-audit-20261013.json and reports/stage5c-third-id-healthz-20261013.json. Previous additional-ID evidence remains in reports/stage5c-additional-id-audit-20261013.json and reports/stage5c-additional-id-healthz-20261013.json. The Markdown attachment contains complete JSON; no footer repair was needed. Its filename and SHA-256 are recorded in reports/stage5c-repair.json. Earlier audits remain in reports/stage5c-live-audit-20261012.json and reports/stage5c-id-audit-20261012.json.

## Quarantine and additional corrections

| Canonical ID | Symbol | Old CMC ID | Corrected CMC ID | Corrected slug | Latest decision |
| --- | --- | ---: | ---: | --- | --- |
| bob | BOB | 31962 | 38970 | bob-build-on-bitcoin | Strict PASS and runtime parity PASS; released |
| off-the-grid | GUN | 32200 | 36156 | gunz | Strict PASS and runtime parity PASS; released |
| mintchain | MINT | 31417 | 36005 | mint-blockchain | Exact identity; invalid_price, quarantine retained |

None of the 264 previously passing entries failed in the latest audit. BOB/GUN and QuickSwap New/SEED Photo release records retain the tested commit, dataset hash and audit timestamp. MINT's returned ID, symbol and slug match its corrected mapping, but the price fails validation; runtime market data stays unavailable. A strict PASS alone does not establish positive normalized price or numeric field parity: the runtime pipeline still applies its existing positive-price guard.

The canonical table retains 354 records, 323 distinct CMC IDs and 31 originally unmapped records. Runtime eligibility is 266 and quarantine is 57. All 92 numeric-ID replacements retain old mappings and evidence: 84 passed strict quotes (82 also have prior numeric runtime evidence; GAFI/NB await the expanded diagnostic), and eight remain unavailable (MINT, CLEAR, TBILL, USTB, CREDIT, PCN, SPON and PORTX). No replacement awaits its first complete strict audit. Total corrected releases are 87: 84 replaced numeric IDs and three retained-ID symbol corrections. The latest numeric evidence verifies 85 releases on 00a1a12, before GAFI/NB release.

Permanent canonical IDs, names, sectors and snapshot values remain unchanged. Ten current-symbol corrections are explicitly reviewed with previous_catalog_symbol and symbol_repair provenance. The first six (INST→FLUID, WC→WCT, NEURO→NEURON, MIOTA→IOTA, DVPN→P2P and FXS→FRAX) passed strict quotes and numeric runtime fields. GFI→GAFI and NUB→NB now pass strict quotes and await numeric runtime verification; SPHN→SPON and PORT→PORTX match identity but lack valid prices. All 23 cumulative slug corrections have strict evidence, including frax→frax-share at UCID 6953. No resolver alias fallback or relaxed validator is introduced.

The latest complete strict audit reports 39 symbol mismatches, 16 invalid-price-only entries (including the eight unavailable corrected IDs), and two absent quotes. Some symbol mismatches are rebrands; they are not automatically classified as wrong projects. Every quarantined or unmapped entry returns no market data and makes no provider call through the public service.

QuickSwap New selection is now metadata-confirmed using issuer utility/migration documentation and matching token contracts; the Old listing remains excluded. INST/FLUID passed strict quotes and numeric runtime parity. FXS/FRAX, IOTA/MIOTA and DVPN/P2P have explicit issuer-lineage/provider review and strict PASS; TON/GRAM remains unresolved. The 16-entry metadata review and live follow-up are in reports/stage5c-identity-review-20261013.json: three ID corrections, 13 held research leads, and two subsequent releases. Holds concern ticker differences, product/lifecycle or migration questions, and searches without a primary match; they are not final taxonomy. Toucan's issuer states that BCT admin control transferred to KlimaDAO and BCT is no longer its product. Missing quotes, preview listings, inaccessible websites and unsuccessful searches do not prove that no token exists.

## Runtime field parity

Preview-only GET /api/audit-stage5c-runtime?run=1 dynamically validates corrected mappings released after a live audit. It now selects all 87 corrected and released entries, including newly released GAFI/NB, IOTA/P2P/FRAX, FLUID/WCT/NEURON, QuickSwap New and SEED Photo. MINT/CLEAR/TBILL/USTB/CREDIT/PCN/SPON/PORTX and the other quarantined records are excluded. Observed verification on c1f33ea is 82 LIVE/PASS, 0 FAIL and 656/656 exact field comparisons from one provider batch. The complete 00a1a12 response now verifies all 85 rows, including IOTA/P2P/FRAX, with 680/680 exact comparisons. The expanded 87-record diagnostic and 696 exact field comparisons are pending. The eight corrected IDs without valid prices remain excluded; prior 85-record evidence is not extended to GAFI/NB without a new response.

1. Fetch current authenticated CMC quotes through the existing adapter in one batch.
2. Pass the fresh payload through the existing resolver, service and normalizer using an isolated audit cache.
3. Require LIVE/PARTIAL status, exact identity and positive normalized price.
4. Compare eight fields exactly with the raw quote: price, 24h/7d/30d change, market cap, FDV, 24h volume and rank. Null and zero remain distinct.

The first runtime response matches commit 5d11b1f16fa420ce564090600e01bec6367857ce and dataset SHA-256 69866b22c711d6e64d376fd97c5c6ae5b5894a22d2d8660f6925065602a963b5: 75 LIVE, 75 PASS, zero FAIL and 600/600 exact comparisons. Each canonical/CMC ID matches the released table and every price is positive. Evidence: reports/stage5c-runtime-audit-20261013.json. Its final ts string was truncated after 2026-10-13T12:36:03; audit ts is null with the original prefix/recovery note preserved. Complete rows, counts and provider timestamps (2026-10-13T12:35:03.000Z) were not altered or invented.

The expanded authenticated response at 2026-10-13T16:42:12.997Z matches commit d12ab3133504b30fbe7ef30f9bf214e489c13881 and dataset SHA-256 4184694a8bc16d80c82a5279837679b7b803409f2d68e337a5cc28f502ba97a7. All 77 are LIVE with positive prices, 77 PASS / 0 FAIL and 616/616 exact comparisons; returned canonical/CMC IDs exactly match the release manifest. BOB/GUN are included and MINT is absent. The complete timestamp and results required no recovery. Evidence: reports/stage5c-runtime-77-audit-20261013.json. The diagnostic makes no mapping changes or quarantine releases. This result applies to the recorded tested version, before the five new metadata changes.

The diagnostic verifies the server data pipeline with fresh real quotes. It does not independently test the public market HTTP route, its cache or CORS, or the frontend. Public-route headers are covered by offline smoke tests. The diagnostic is unavailable in production. The strict Stage 5B audit remains byte-for-byte unchanged and still checks all 323 IDs, including all 57 quarantined failures.

## Validation and outstanding work

79 offline tests pass: 48 core, 15 Vercel smoke and 16 mapping/runtime audit tests. Validate dataset collisions, permanent-ID/name/sector/snapshot preservation, the 10 reviewed symbol changes and their archived prior values, complete audit coverage, release selection and quarantine consistency. An additional offline service check uses synthetic quotes to verify that both FRAX symbols resolve to their distinct canonical/provider IDs and preserve separate cached values; it is not live price evidence.

The complete runtime response at 2026-10-14T08:41:15.241Z matches commit 743e1f6050d1876dc0be88bcf3abd6046667ee80 and dataset SHA-256 6a0d3748fd3912040427cd48f4dc7751bd13fc7569d68f73f24b186729b0e311: all 79 LIVE/PASS, zero FAIL, 632/632 exact comparisons, all positive prices and exact canonical/CMC release identities. Evidence: reports/stage5c-runtime-79-audit-20261014.json; complete capture and timestamp, no recovery. The complete subsequent runtime response at 2026-10-16T18:20:29.592Z matches commit c1f33ea8874e3fbf92b5e0ba7e6c2210b4c60926 and dataset SHA-256 5ab467cf9daee464c05f2e34624e0a4a93a0855fe6959b5fbfe7eca75e7b2b52: 82 LIVE/PASS, zero FAIL, 656/656 exact comparisons, positive prices and exact canonical/CMC IDs. FLUID/WCT/NEURON are included and every quarantined row is absent. All provider timestamps are 2026-10-16T18:19:03.000Z. Evidence: reports/stage5c-runtime-82-audit-20261016.json and reports/stage5c-runtime-82-healthz-20261016.json; complete JSON/timestamps, no recovery. Provider-reported zero optional values remain distinct from null and do not establish independently known real-world zeros. The latest complete runtime response at 2026-10-16T19:02:13.002Z matches commit 00a1a12c57ae975eaac34e4750b90fb8bed3d613 and dataset SHA-256 c8d017822b567608f2670a86c797f4edb52e5c8d5c138fe3b8b78cc71c1f55b4: all 85 LIVE/PASS, zero FAIL, 680/680 exact comparisons, positive prices and exact canonical/provider IDs. All provider timestamps are 2026-10-16T19:01:05.000Z. Evidence: reports/stage5c-runtime-85-audit-20261016.json and reports/stage5c-runtime-85-healthz-20261016.json; complete JSON/timestamps, no recovery. Next, confirm the release commit and dataset SHA-256 6b935555baac280532325169f0916ef8a7c751bfab30b68e51bf4c62ed844da3 in /api/healthz and run /api/audit-stage5c-runtime?run=1 for all 87 corrected releases. Expected coverage is 87 rows, eight fields each and one provider batch; no 87-row live response has been observed yet. The 85-record numeric proof applies to 00a1a12; GAFI/NB require the expanded response. The diagnostic implementation is unchanged. Continue evidence-based identity/data and token/stablecoin-wrapped/project_without_token/unverified taxonomy review for the 57 quarantined and 31 originally unmapped entries. Stage 5C remains incomplete. This draft PR targets stage5b/vercel-deployment; production promotion is not performed here.

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

The 2026-10-16 complete strict audit passes the three manually reviewed symbol/ID corrections: instadapp/FLUID 10508, walletconnect/WCT 33152 and cerebrumdao/NEURON 31961. These three are now mapping_status=verified with the exact tested commit/hash/timestamp retained. CREDIT 17132 and PCN 20267 return the expected symbol/slug but invalid_price; both remain unverified and make zero provider calls through the public service. A failure row does not reveal whether the raw price was zero, null or another invalid value. After that 18:02 strict audit, runtime eligibility was 261 and quarantine 62; the later native-symbol release changes these to 264 and 59. Retained provider IDs remain 323 and originally unmapped entries 31. The subsequent c1f33ea runtime audit confirms all 82 releases, including these three, with 656/656 exact field comparisons; the previously released identities remain unchanged.

Creditum issuer documentation identifies the Fantom lending protocol and CREDIT, rather than similarly named consumer-credit businesses. Its historical documentation/provider preview do not establish current market availability. Pollen's issuer identifies PCN but describes its internal network denomination as non-cash value and explicitly excludes stablecoin status. The internal $0.10 number must not become a market price, market cap or FDV. PCN carries an additional external-market-validity release gate; a bare positive provider number is insufficient without establishing its market applicability.

Huddle01 remains held: issuer materials describe HUDL and testnet tHUDL rewards, but no numeric provider mapping/currently tradable HUDL asset was established. Reward-calculator $1/FDV examples are not price evidence. Inaccessible or missing listing pages do not prove token absence. Review-time source dates are recorded; market/lifecycle and full token/stablecoin-wrapped/project_without_token/unverified taxonomy remain incomplete.


## Native-asset symbol review, 2026-10-16

| Permanent canonical ID | Previous symbol | Reviewed current symbol | Retained CMC ID | Expected slug | Decision |
| --- | --- | --- | ---: | --- | --- |
| iota | MIOTA | IOTA | 1720 | iota | Explicit issuer unit-label change; strict PASS, released |
| sentinel | DVPN | P2P | 2643 | sentinel | Issuer native-coin ticker rebrand; strict PASS, released |
| frax | FXS | FRAX | 6953 | frax-share | Issuer-documented FXS-to-native-FRAX lineage; strict PASS, released |

The complete d47234d audit at 2026-10-16T18:52:11.100Z passes all three corrected identities, accounting for the increase from 261 to 264 PASS with no regressions. All three are now mapping_status=verified with exact audit commit/hash/time retained. Numeric IDs, symbols, names, sectors and snapshot values did not change during release. After that native-symbol release the totals were 264 eligible, 59 quarantined and 31 originally unmapped, with 43 symbol mismatches and 16 market-data failures (14 invalid-price-only plus two absent quotes). The later GAFI/NB release changes eligible/quarantined totals to 266/57. The subsequent 00a1a12 numeric response verifies all 85 releases including these three, with 680/680 exact comparisons. Review-time counts in the source report remain historical; its follow-up records the release.

IOTA's issuer states that one former MIOTA is one current IOTA, and one IOTA contains 1,000,000 micros. Its Rebased guide confirms native-asset continuity and links to the same provider listing/UCID 1720. The correction changes the catalog label only: no multiplication of prices, supply or snapshot values. Sources: https://blog.iota.org/stardust-upgrade-iota-tokenomics/ and https://blog.iota.org/rebased-mainnet-upgrade/.

Sentinel's current issuer documentation explicitly identifies P2P as formerly DVPN and as the Sentinel chain's native coin. Provider UCID 2643 has the same rebrand notice and issuer link. Native-chain lineage is the identity evidence; no ERC20-contract, on-chain denomination audit or IBC transaction is claimed. Sources: https://docs.sentinel.co/get-started and https://docs.sentinel.co/p2p-coin.

Frax issuer documentation records the enacted 1:1 upgrade from FXS to Fraxtal's native FRAX. The issuer registry identifies Ethereum FXS lineage 0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0 and distinguishes native FRAX/WFRAX. Provider UCID 6953 is explicitly Frax (prev. FXS), symbol FRAX, slug frax-share; its displayed contract prefix/suffix agrees. Fetching the provider explorer target failed, so full provider-contract retrieval/chain execution is not claimed. Sources: https://docs.frax.com/protocol/frax/overview and https://docs.frax.com/protocol/frax/addresses.

The separate canonical frax-finance record, UCID 6952/slug frax, remains byte-for-byte unchanged. Its Legacy Frax Dollar identity is distinct from former FXS despite the shared current FRAX ticker. No $1 market price, stablecoin classification for native FRAX, merging by symbol, migration transaction or financial-value scaling is introduced. The full source review and limits are in reports/stage5c-native-symbol-review-20261016.json. The canonical snapshots and legacy display names remain preserved; full catalog taxonomy remains incomplete.


## Token catalog correction review, 2026-10-16

| Permanent canonical ID | Previous catalog symbol | Reviewed current symbol | Old CMC ID | Reviewed CMC ID | Slug | Decision |
| --- | --- | --- | ---: | ---: | --- | --- |
| gamefi | GFI | GAFI | 18033 | 11783 | gamefi | Strict PASS; released; numeric runtime pending |
| spheron | SPHN | SPON | 24367 | 37537 | spheron-network | Exact returned symbol/slug; invalid_price; quarantined |
| nubila | NUB | NB | 29023 | 38816 | nubila-network | Strict PASS; released; numeric runtime pending |
| chainport | PORT | PORTX | 22633 | 17480 | chainport | Exact returned symbol/slug; invalid_price; raw supply gate retained |

The complete 38c3eb5 strict audit at 2026-10-16T20:33:41.731Z confirms GAFI and NB PASS; both are now mapping_status=verified with exact audit commit/hash/time retained. SPON and PORTX return their corrected expected ID/symbol/slug but fail price validation; both remain unverified and make zero runtime provider calls. Their failure rows do not expose raw price values, so zero/null or a specific numeric price is not inferred. Current totals: 266 eligible, 57 quarantined, 323 distinct retained CMC IDs and 31 originally unmapped. All 264 previously passing entries remain passing. Remaining failures are 39 symbol mismatches and 18 market-data failures (16 invalid-price-only plus two missing quotes). No symbol/name/sector/snapshot/provider-ID edits occur during this release. Review-time source counts remain historical; its follow-up records the two releases and two holds.

GameFi.org's current terms define GAFI as its token, and its homepage/staking page use GAFI. Provider UCID 11783 links that issuer and identifies GameFi.org/GAFI, slug gamefi. This corrects the catalog input GFI and the unrelated SOLI mapping; no historical GameFi GFI token or migration is invented. Sources: https://gamefi.org/terms-of-use and https://coinmarketcap.com/currencies/gamefi/.

Spheron's issuer-hosted whitepaper search extract identifies SPON for compute payments/staking/rewards. Provider UCID 37537 identifies Spheron Network/SPON with the matching issuer domain. Direct PDF retrieval failed, the commercial homepage does not mention SPON, and the provider listing is a preview; current lifecycle and live quote availability remain unverified. Sources: https://www.spheron.network/Spheron-Whitepaper.pdf and https://coinmarketcap.com/currencies/spheron-network/.

Nubila's current homepage links its GitBook; the tokenomics explicitly name NB and the BEP-20 standard. Provider UCID 38816 links the same issuer/docs and identifies Nubila Network/NB. Old presale NUBI wording is not evidence of an enacted migration, and NUB remains an archived catalog input. Sources: https://nubila.gitbook.io/nubila/nubila-network/usdnb-tokenomics and https://coinmarketcap.com/currencies/nubila-network/.

ChainPort publishes PORTX and Ethereum contract 0x104f3152d8ebfc3f679392977356962ff36566ac, agreeing with the provider's abbreviated contract at UCID 17480. The provider preview renders the unexplained total-supply text `679814605.44E PORTX`. This is an observed UI string, not a verified numeric supply or proof of a specific underlying fault. Keep RAW_SUPPLY_VALIDITY_REVIEW_REQUIRED as an additional manual release gate: inspect fresh raw supply/units and associated MC/FDV validity before any release even if the unchanged strict audit reports PASS. Never parse/scale that text into a substitute value. Sources: https://www.chainport.io/portx-token and https://coinmarketcap.com/currencies/chainport/.

Provider explorer fetches failed for all four; no independently fetched full provider-contract match is claimed. Full issuer contracts were not retrieved for GameFi, Spheron or Nubila. Identity evidence and precise limits are recorded in reports/stage5c-token-catalog-review-20261016.json. These are explicit manual catalog/provider identity corrections; sectors and all snapshot values remain unchanged, no migration or token quantity conversion is inferred, and full catalog taxonomy remains incomplete. PCN's independent external-market-validity gate is also retained.
