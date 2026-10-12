# Stage 5C — persistent CMC mapping repair and quarantine

Status: **partial; live re-audit and remaining identity repairs are outstanding**.

The Stage 5B branch still uses the October 1 canonical dataset with five V7 remaps already persisted in commit d315f64. The v3 reconciliation and v7 collision-guard endpoints build their candidate changes in memory and explicitly do not write token-index.json; persisting five V7 remaps did not apply the full v3 candidate. The saved v3 export differs from the October 12 full audit for 98 failing records, including all 22 slug-only failures. Its metadata also disagrees with its own records in 163 places. It is a candidate export, not an authoritative verified replacement.

## Implemented

- Persist all 22 exact slug corrections observed in the October 12 audit. Preserve CMC IDs, canonical IDs, symbols, sectors and existing market snapshot values.
- Quarantine 144 records: 130 symbol mismatches, 5 absent quotes and 9 invalid prices. Retain their old IDs for traceability; the resolver returns UNKNOWN_MAPPING with market=null and never fetches them.
- Treat explicitly classified project_without_token/unverified records as unavailable even if an old CMC ID exists. This supports later taxonomy work without assuming every missing quote is a non-token.
- Check CMC symbol and slug in the runtime normalizer, as well as the numeric ID. A matching ID can still identify the wrong canonical project.
- Resolve before reading the memory cache, so quarantined mappings cannot return an old LIVE result.
- Expose canonical dataset SHA-256, Vercel commit, quarantine count and runtime eligible count in health responses.
- Align legacy classification metadata for corrected/quarantined records.
- Keep api/audit-stage5b.js byte-for-byte unchanged. It still checks all 323 retained mappings, including quarantined failures; quarantine does not manufacture a PASS.

The 354 records contain 323 retained CMC IDs, 31 originally unmapped records, 144 quarantined mappings and **179 runtime-eligible mappings**. These are configuration counts, not a new live result. The historical 157/323 PASS rate was **48.61%**, not 51%.

## Validation

72 offline tests pass: 48 core, 15 Vercel smoke and 9 mapping regression tests. These cover all 144 quarantined and all 31 unmapped records without provider calls, same-ID wrong-symbol/wrong-slug responses, stale LIVE cache quarantine and dataset fingerprinting.

No fresh authenticated CMC re-audit was performed. Vercel deployment inspection returned HTTP 403 for the existing realstrades-8509s-projects team and payd-cmc-backend project; there is no authenticated Vercel CLI in this environment.

## Required next work

1. Deploy this reviewed commit to the existing backend Preview environment using the user's authorized Vercel account.
2. Confirm /healthz canonical_dataset.sha256 matches the committed canonical file, and canonical_dataset.git_commit matches the tested commit.
3. Run the unchanged /api/audit-stage5b?run=1 and retain the full response. Its strict failures remain visible even for quarantined entries.
4. Repair every remaining identity using CMC metadata plus primary project evidence (official site and chain/contract where available). Same-symbol/name similarity and automatic symbol changes are insufficient.
5. Specifically review rebrands/migrations such as TON/GRAM, IOTA/MIOTA, FXS/FRAX and duplicate project aliases such as lyra/lyra-finance. Do not send a token to an already-owned CMC ID.
6. Verify the 31 originally unmapped entries individually; some may be real tokens, others companies/protocols. Finish token, stablecoin/wrapped, project_without_token and unverified taxonomy only with evidence.
7. Lift quarantine only after exact numeric ID/symbol/slug identity and usable quote validation pass. Verify the runtime API, not only the audit handler, for every changed identity.
8. Require zero proven wrong-asset mappings, zero ID collisions, all seven mandatory assets passing, and full accounting of every explicit no-token/no-quote/unverified entry. Stage 5C remains incomplete while tradable identities are unresolved.

The production frontend, market-snapshot.json and Scanner have no changes in this patch.
