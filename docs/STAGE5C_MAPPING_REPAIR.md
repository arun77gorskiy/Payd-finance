# Stage 5C — persistent CMC identity repair

Status: **75 ID corrections prepared; fresh authenticated quote audit still required**.

## Verified Preview result

The browser-fetched Stage 5B audit at 2026-10-12T11:27:51.478Z verified commit 6ef72e3 with dataset SHA-256 184d3bba63aecfca221dc1f278771d92096b211e997bba58c5fab4173aef3675. It returned 179 PASS / 144 FAIL for 323 mappings, with 318 quotes, zero duplicate IDs and all seven mandatory tokens passing. All 22 earlier slug corrections passed. No slug-only failures remained.

The 144 failures break down into 130 symbol mismatches, 5 missing quotes and 9 invalid-price-only records. Some symbol mismatches represent rebrands, so they are not automatically classified as wrong projects.

Full evidence: reports/stage5c-live-audit-20261012.json.

## New ID corrections

75 quarantined records now use CMC IDs checked against CoinMarketCap's own listing UCID, symbol and slug. Every change retains its canonical ID and symbol. Every change has a primary source URL and previous mapping in reports/stage5c-repair.json and the canonical record. Existing numeric IDs are never selected by ticker similarity alone.

QuickSwap is excluded from this batch: the suggested 8206 listing is explicitly QuickSwap [Old]. The New/Old token choice requires migration and chain/contract review.

**All 144 quarantine flags remain in force.** The 75 metadata-corrected records remain unavailable to runtime requests until fresh authenticated quotes validate the new IDs. Runtime-eligible count is still 179; 69 quarantined records still need identity or market-data review. The 31 originally unmapped records remain separately accounted for.

No new quote PASS count is claimed for this commit. The recorded 179 PASS refers to the previous commit, not the new table.

## Runtime safeguards

- The resolver blocks absent, unverified, quarantined and explicit project_without_token identities.
- The normalizer checks numeric ID, symbol and slug before returning any market data.
- Resolution precedes cache reads, preventing quarantined records from returning cached LIVE data.
- Health exposes the exact canonical SHA-256, commit and eligible/quarantine counts.
- api/audit-stage5b.js remains byte-for-byte unchanged and still audits all 323 retained numeric IDs.

## Verification and remaining work

72 offline tests pass: 48 core, 15 Vercel smoke, 9 regression tests. The canonical table preserves all 354 projects, 323 distinct CMC IDs and 31 originally unmapped records. There are no CMC-ID or canonical-ID collisions.

After this commit's Preview is READY:

1. Read /api/healthz and retain the exact git_commit and SHA-256.
2. Run /api/audit-stage5b?run=1 and retain the full result.
3. Release quarantine only for the repaired entries that pass the fresh exact-ID/symbol/slug audit and have a usable quote.
4. Verify the runtime market API for released entries. Failed mappings and missing/invalid quotes stay unavailable.
5. Review remaining rebrands/migrations (including TON/GRAM, INST/FLUID, IOTA/MIOTA, FXS/FRAX and QuickSwap Old/New) with explicit identity evidence. Do not silently change symbols.
6. Classify token, stablecoin/wrapped, project_without_token and unverified entries using verified project evidence. Missing quotes alone do not establish no-token.

Stage 5C remains incomplete while identity/taxonomy review is outstanding. The Vercel connector still has an account-scope HTTP 403, so live responses are supplied through the user's authenticated browser. Production promotion is not performed here.
