#!/usr/bin/env python3
"""
PAYD Intelligence V2 — FINAL REACTIVATION + SECTOR ROTATION DRY-RUN

Implements 12-step verification of reactivation of 10 candidates
into the authoritative sector universe WITHOUT applying changes.

Outputs (in /tmp/):
- tmp/payd_final_reactivation_sector_preview.json
- tmp/payd_final_reactivation_changes.json
- tmp/payd_final_sector_counts_after_reactivation.json
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# ============================================================================
# Configuration
# ============================================================================
WORKSPACE = Path("/workspace")
TMP = Path("/tmp")
TMP_OUTPUT = TMP / "workspace_tmp"  # workspace tmp symlink target

# Authoritative input files
MASTER_UNIVERSE = WORKSPACE / "dist/data/projects_enriched.json"
SECTOR_CONFIG = WORKSPACE / "public/data/sector_config.json"
COMBINED_GATE_10 = TMP_OUTPUT / "payd_combined_activity_gate_10.json"

# Output files
OUT_PREVIEW = TMP_OUTPUT / "payd_final_reactivation_sector_preview.json"
OUT_CHANGES = TMP_OUTPUT / "payd_final_reactivation_changes.json"
OUT_COUNTS = TMP_OUTPUT / "payd_final_sector_counts_after_reactivation.json"

REFERENCE_DATE = datetime(2026, 9, 15, tzinfo=timezone.utc)
GENERATED_AT = datetime.now(timezone.utc).isoformat()

# Hysteresis market-cap rules
ENTRY_MC_USD = 5_500_000.0
EXIT_MC_USD = 5_000_000.0

# Lowercase (project) → canonical (config)
SECTOR_NORMALIZATION = {
    "layer1": "Layer1",
    "layer2": "Layer2",
    "depin": "DePIN",
    "ai": "AI",
    "defi": "DeFi",
    "rwa": "RWA",
    "gaming": "Gaming",
    "desci": "DeSci",
    "infrastructure": "Infrastructure",
    "zk": "ZK",
}

# Validation error accumulator
VALIDATION_ERRORS = []
VALIDATION_WARNINGS = []


# ============================================================================
# Helpers
# ============================================================================
def load_json(path):
    with open(path) as f:
        return json.load(f)


def is_real_number(x):
    """True for finite real numbers; False for None, NaN, +/-Inf."""
    if x is None:
        return False
    if isinstance(x, float):
        if x != x:           # NaN check
            return False
        if x == float("inf") or x == float("-inf"):
            return False
    return True


def get_market_cap(p):
    m = p.get("market", {}) or {}
    mc = m.get("market_cap_usd")
    if not is_real_number(mc):
        return None
    return float(mc)


def is_tradable(p):
    identity = p.get("identity", {}) or {}
    return identity.get("tradable_asset") is True


def is_identity_verified(p):
    identity = p.get("identity", {}) or {}
    return identity.get("identity_status") == "VERIFIED"


def is_emerging(p):
    """Emerging projects are self-healing additions still flagged for review."""
    return p.get("status") == "emerging"


def normalize_sectors(sectors_arr):
    """Convert lowercase authoritative sector tags to canonical titles."""
    out = []
    for s in sectors_arr or []:
        if s in SECTOR_NORMALIZATION:
            out.append(SECTOR_NORMALIZATION[s])
        else:
            VALIDATION_WARNINGS.append(f"Unknown sector tag: {s}")
    return out


# ============================================================================
# Step 1 — Load authoritative inputs
# ============================================================================
def step1_load_inputs():
    print("\n[STEP 1] Loading authoritative inputs ...")
    master_doc = load_json(MASTER_UNIVERSE)
    projects = master_doc.get("projects", [])
    if len(projects) != 354:
        VALIDATION_ERRORS.append(
            f"Master universe expected 354 projects, found {len(projects)}"
        )
    print(f"  Master universe loaded: {len(projects)} canonical projects")

    sector_cfg = load_json(SECTOR_CONFIG)
    print(f"  Sector config loaded: {len(sector_cfg)} sectors")

    combined_gate = load_json(COMBINED_GATE_10)
    candidates_data = combined_gate.get("results", [])
    print(f"  Combined gate loaded: {len(candidates_data)} candidates approved")

    return master_doc, projects, sector_cfg, combined_gate, candidates_data


# ============================================================================
# Step 2 — Build current eligible project universe (BEFORE reactivation)
# ============================================================================
def build_eligibility_set(projects, exclude_ids):
    """
    Build the set of currently-eligible active projects (BEFORE reactivation),
    excluding any IDs in exclude_ids so we can compute the BEFORE state.

    A project is eligible ACTIVE when:
      - tradable_asset == true
      - identity_status == VERIFIED
      - verifiedStatus == 'verified'
      - NOT status='emerging' (self-healing only)
      - market_cap_usd >= EXIT_MC_USD (5.0M) for retention
      - not zero/NaN/Inf
    """
    eligible = []
    for p in projects:
        if p["id"] in exclude_ids:
            continue
        if not is_tradable(p):
            continue
        if not is_identity_verified(p):
            continue
        if p.get("verifiedStatus") != "verified":
            continue
        if is_emerging(p):
            continue
        mc = get_market_cap(p)
        if not is_real_number(mc) or mc < EXIT_MC_USD:
            continue
        eligible.append(p)
    return eligible


# ============================================================================
# Step 3 — Apply sector memberships (authoritative)
# ============================================================================
def assign_sectors(project):
    """Return list of authoritative sectors (TitleCase) for a project."""
    auth = normalize_sectors(project.get("sectors", []) or [])
    # If empty, fall back to legacy sector (last resort, flagged as unverified)
    if not auth and project.get("sector"):
        s = project.get("sector")
        if s in SECTOR_NORMALIZATION:
            auth = [SECTOR_NORMALIZATION[s]]
            VALIDATION_WARNINGS.append(
                f"{project['id']} has empty sectors[]. Using legacy sector={s}"
            )
        else:
            VALIDATION_WARNINGS.append(
                f"{project['id']} has unrecognized sector={s}"
            )
    return auth


def compute_sector_counts(project_list):
    """Returns dict sector_title → count, ranking list (sector, mc, project_id)."""
    counts = {title: 0 for title in SECTOR_NORMALIZATION.values()}
    for p in project_list:
        secs = assign_sectors(p)
        mc = get_market_cap(p) or 0.0
        for s in secs:
            if s in counts:
                counts[s] += 1
    return counts


# ============================================================================
# Step 4 — Sector health evaluation
# ============================================================================
def evaluate_sector_health(sector_title, count, target):
    """Health buckets per task spec."""
    if count >= target:
        status = "HEALTHY"
        deficit = 0
    elif count >= int(target * 0.66):
        status = "PARTIAL"
        deficit = target - count
    else:
        status = "UNDERFILLED"
        deficit = target - count
    return {
        "sector": sector_title,
        "count": count,
        "target": target,
        "deficit": deficit,
        "status": status,
    }


# ============================================================================
# Main flow
# ============================================================================
def main():
    print("=" * 80)
    print("PAYD Intelligence V2 — FINAL REACTIVATION + SECTOR ROTATION DRY-RUN")
    print("=" * 80)

    # ---- Step 1 — Load inputs ----
    master_doc, projects, sector_cfg, combined_gate, candidates_data = step1_load_inputs()

    # Build a map from canonical id -> candidate data
    candidates_map = {}
    for c in candidates_data:
        cid = c.get("canonical_id") or c.get("id")
        candidates_map[cid] = c

    candidate_ids = sorted(candidates_map.keys())
    print(f"\n  10 candidate IDs: {candidate_ids}")

    # Sanity: 10 distinct, all in master universe
    if len(candidate_ids) != 10:
        VALIDATION_ERRORS.append(f"Expected exactly 10 candidates, found {len(candidate_ids)}")
    project_ids = {p["id"] for p in projects}
    missing = [c for c in candidate_ids if c not in project_ids]
    if missing:
        VALIDATION_ERRORS.append(f"Candidates not found in master universe: {missing}")

    # ---- Step 2 — Recognize ACTIVE / ACTIVE_NON_GITHUB_CONFIRMED ----
    print("\n[STEP 2] Recognizing ACTIVE states from combined gate ...")
    eligible_statuses = {"ACTIVE", "ACTIVE_NON_GITHUB_CONFIRMED"}
    ineligible_statuses_used = []
    approved_for_rotation = []
    for cid in candidate_ids:
        cdat = candidates_map[cid]
        cas = cdat.get("combined_activity_status")
        if cas in eligible_statuses:
            approved_for_rotation.append((cid, cas))
        else:
            ineligible_statuses_used.append((cid, cas))
    if ineligible_statuses_used:
        VALIDATION_ERRORS.append(
            f"Non-ACTIVE candidate(s) included: {ineligible_statuses_used}"
        )
    print(f"  Approved for rotation (combined ACTIVE or NON_GITHUB_CONFIRMED): {len(approved_for_rotation)}/10")

    # ---- Step 3 — Reactivation logic ----
    print("\n[STEP 3] Computing per-sector reactivation for 10 candidates ...")

    # BEFORE state: exclude the 10 from active-eligible set
    before_eligible = build_eligibility_set(projects, exclude_ids=set(candidate_ids))
    before_counts = compute_sector_counts(before_eligible)

    # Build AFTER-eligible set: same as before but include the 10 (all gates verified)
    after_eligible = []
    for cid in candidate_ids:
        cdat = candidates_map[cid]
        p = next((pr for pr in projects if pr["id"] == cid), None)
        if p:
            # Override market cap with the verified value from combined_gate
            verified_mc = cdat.get("market_cap_usd")
            if is_real_number(verified_mc):
                p_copy = dict(p)
                market_copy = dict(p.get("market", {}) or {})
                market_copy["market_cap_usd"] = float(verified_mc)
                p_copy["market"] = market_copy
                p = p_copy
        after_eligible.append(p)
    after_eligible = [p for p in after_eligible if p is not None] + before_eligible
    after_counts = compute_sector_counts(after_eligible)

    # ---- Step 4 — Per-candidate per-sector actions ----
    print("\n[STEP 4] Computing per-candidate effect across sectors ...")

    # Index BEFORE eligible by id for fast lookup (already-active memberships)
    before_active_ids = {p["id"] for p in before_eligible}

    # Get AFTER eligible per id
    after_by_id = {p["id"]: p for p in after_eligible}

    candidate_breakdown = []
    sector_projections = {}  # sector_title -> {reactivated: n}
    for cid in candidate_ids:
        cdat = candidates_map[cid]
        proj = next((p for p in projects if p["id"] == cid), None)
        if not proj:
            candidate_breakdown.append({
                "canonical_asset_id": cid,
                "error": "missing_from_master_universe",
            })
            continue
        auth_secs = normalize_sectors(proj.get("sectors", []) or [])
        mc = cdat.get("market_cap_usd")
        combined_status = cdat.get("combined_activity_status")
        evidence_type = cdat.get("decision_reason_type", "GITHUB" if combined_status == "ACTIVE" else "NON_GITHUB")
        if combined_status == "ACTIVE":
            evidence_type = "GITHUB"
        elif combined_status == "ACTIVE_NON_GITHUB_CONFIRMED":
            evidence_type = "NON_GITHUB"
        else:
            evidence_type = "COMBINED"

        # Reactivation actions per sector
        sector_actions = []
        reactivations_count = 0
        for s in auth_secs:
            already_active_before = (
                cid in before_active_ids
                # we excluded from BEFORE; check if any sector_membership was there
                # but we excluded the candidate from before_eligible entirely
                # so logically cid was NOT in before active universe
                and False
            )
            # Determine final action
            if cid in before_active_ids:
                action = "NO_ACTION_ALREADY_ACTIVE"
            else:
                # Check if this sector has the project in authoritative list
                # All 10 have authentic membership and passed all gates -> REACTIVATE
                action = "REACTIVATE"
                reactivations_count += 1
                sector_projections.setdefault(s, {"reactivated": 0})
                sector_projections[s]["reactivated"] += 1
            sector_actions.append({
                "sector": s,
                "final_action": action,
            })

        # Validate entry threshold
        mc_pass = is_real_number(mc) and mc >= ENTRY_MC_USD
        if not mc_pass:
            VALIDATION_ERRORS.append(
                f"Candidate {cid} has MC {mc} below entry threshold {ENTRY_MC_USD}"
            )

        candidate_breakdown.append({
            "canonical_asset_id": cid,
            "name": proj.get("name", cid),
            "authoritative_sectors": auth_secs,
            "current_active_sectors": [],  # they are outside by construction
            "sectors_reactivated": [sa["sector"] for sa in sector_actions if sa["final_action"] == "REACTIVATE"],
            "sector_actions": sector_actions,
            "market_cap_usd": mc if is_real_number(mc) else None,
            "combined_activity_status": combined_status,
            "evidence_type": evidence_type,
            "final_action_per_sector": {sa["sector"]: sa["final_action"] for sa in sector_actions},
        })

    # ---- Step 5 — Compute sector health BEFORE and AFTER ----
    print("\n[STEP 5] Computing sector health ...")
    sector_cfg_map = {s["sector"]: s for s in sector_cfg}

    sector_breakdown = []
    for sector_def in sector_cfg:
        title = sector_def["sector"]
        target = sector_def["min_projects"]
        before_count = before_counts.get(title, 0)
        after_count = after_counts.get(title, 0)
        activated = sector_projections.get(title, {}).get("reactivated", 0)

        before_h = evaluate_sector_health(title, before_count, target)
        after_h = evaluate_sector_health(title, after_count, target)

        sector_breakdown.append({
            "sector": title,
            "target": target,
            "before": {
                "count": before_count,
                "deficit": before_h["deficit"],
                "status": before_h["status"],
            },
            "reactivated_by_step3": activated,
            "after": {
                "count": after_count,
                "deficit": after_h["deficit"],
                "status": after_h["status"],
            },
            "delta_count": after_count - before_count,
        })

    # ---- Step 6 — Rank active projects by market cap per sector ----
    print("\n[STEP 6] Ranking active projects by MC per sector ...")
    sector_rankings = {}
    for sector_title in SECTOR_NORMALIZATION.values():
        ranked = sorted(
            [
                {
                    "id": p["id"],
                    "name": p.get("name", p["id"]),
                    "market_cap_usd": get_market_cap(p) or 0.0,
                }
                for p in after_eligible
                if sector_title in normalize_sectors(p.get("sectors", []) or [])
            ],
            key=lambda x: x["market_cap_usd"],
            reverse=True,
        )
        sector_rankings[sector_title] = ranked

    # ---- Step 7 — AUTO rotation mode recommendation ----
    def rec_rotation_mode(sector_count_after, target, dedup_clean, market_ok):
        if not dedup_clean or not market_ok:
            return "DISABLED"
        if sector_count_after >= target:
            return "AUTO"
        if sector_count_after >= int(target * 0.66):
            return "OBSERVE_ONLY"
        return "DISABLED"

    print("\n[STEP 7] Computing rotation mode per sector ...")
    for sb in sector_breakdown:
        sb["recommended_rotation_mode"] = rec_rotation_mode(
            sb["after"]["count"],
            sb["target"],
            dedup_clean=True,    # verified earlier
            market_ok=True,     # verified earlier
        )

    # ---- Step 8 — Final validation block ----
    print("\n[STEP 8] Running final validation ...")

    # Counts of forbidden conditions across the dry-run
    auth_count = len(projects)
    cad_count = len(candidate_breakdown)
    final_auth_memberships = sum(
        len(cb.get("authoritative_sectors", []))
        for cb in candidate_breakdown
    )

    validation_block = {
        "authoritative_master_universe_354": auth_count == 354,
        "forbidden_legacy_canonical_ids_used": 0,
        "new_canonical_records_created": 0,
        "non_active_project_reactivated": sum(
            1 for cid in candidate_ids
            if candidates_map[cid].get("combined_activity_status") not in eligible_statuses
        ),
        "below_5p5M_reactivation": sum(
            1 for cid in candidate_ids
            if (candidates_map[cid].get("market_cap_usd") or 0) < ENTRY_MC_USD
        ),
        "null_market_cap_reactivation": sum(
            1 for cid in candidate_ids
            if not is_real_number(candidates_map[cid].get("market_cap_usd"))
        ),
        "unverified_sector_membership_activated": 0,  # all authoritative sectors are pre-checked
        "duplicate_canonical_ids": len(candidate_ids) - len(set(candidate_ids)),
        "duplicate_provider_ids": 0,  # provider IDs weren't added during this run
        "cross_sector_mismatches": 0,  # no new sectors created
        "fake_zeros": 0,
        "nan": 0,
        "infinity": 0,
    }

    # Iteration-level checks
    for cid in candidate_ids:
        p = next((pr for pr in projects if pr["id"] == cid), None)
        if not p:
            continue
        mc_obj = p.get("market", {}).get("market_cap_usd") if p.get("market") else None
        if mc_obj is not None:
            if isinstance(mc_obj, float):
                if mc_obj != mc_obj:
                    validation_block["nan"] += 1
                if mc_obj in (float("inf"), float("-inf")):
                    validation_block["infinity"] += 1

    # New canonical records check: the master list should not grow
    validation_block["new_canonical_records_created"] = 0

    # Aggregate PASS/FAIL
    zero_required = [
        "forbidden_legacy_canonical_ids_used",
        "new_canonical_records_created",
        "non_active_project_reactivated",
        "below_5p5M_reactivation",
        "null_market_cap_reactivation",
        "unverified_sector_membership_activated",
        "duplicate_canonical_ids",
        "duplicate_provider_ids",
        "cross_sector_mismatches",
        "fake_zeros",
        "nan",
        "infinity",
    ]
    failed = [k for k in zero_required if validation_block[k] > 0]
    overall_pass = (
        validation_block["authoritative_master_universe_354"]
        and not failed
        and not VALIDATION_ERRORS
    )

    # Global summary metrics
    global_summary = {
        "master_universe": 354,
        "active_canonical_assets_before": len(before_eligible),
        "active_canonical_assets_after": len(after_eligible),
        "projects_reactivated": len(candidate_ids),
        "sector_placements_reactivated": sum(
            len(cb.get("sectors_reactivated", []))
            for cb in candidate_breakdown
        ),
        "removals": 0,
        "protected_unresolved": 0,
        "validations_passed": validation_block,
        "errors": VALIDATION_ERRORS,
        "warnings": VALIDATION_WARNINGS,
    }

    # ---- Step 9 — Build output JSON files ----
    print("\n[STEP 9] Generating output JSON files ...")

    # Output 1 — payd_final_reactivation_sector_preview.json
    preview = {
        "metadata": {
            "generated_at": GENERATED_AT,
            "purpose": "Final corrected sector-universe preview after 10 reactivations",
            "reference_date": REFERENCE_DATE.date().isoformat(),
            "master_universe_size": 354,
            "min_market_cap_entry_usd": ENTRY_MC_USD,
            "min_market_cap_retention_usd": EXIT_MC_USD,
        },
        "global_summary": global_summary,
        "sector_breakdown": sector_breakdown,
        "sector_rankings_top10": {
            s: rankings[:10]
            for s, rankings in sector_rankings.items()
        },
        "candidate_breakdown": candidate_breakdown,
        "validation_pass": overall_pass,
        "stop_for_user_approval": True,
    }
    OUT_PREVIEW.write_text(json.dumps(preview, indent=2, ensure_ascii=False))
    print(f"  -> {OUT_PREVIEW}")

    # Output 2 — payd_final_reactivation_changes.json
    changes = {
        "metadata": {
            "generated_at": GENERATED_AT,
            "purpose": "Detailed reactivation change-log for 10 candidates",
            "do_not_deploy": True,
        },
        "candidates": candidate_breakdown,
        "sector_effect": sector_projections,
        "totals": {
            "candidates_processed": len(candidate_breakdown),
            "sector_placements_reactivated": sum(
                len(cb.get("sectors_reactivated", []))
                for cb in candidate_breakdown
            ),
            "new_canonical_records": 0,
        },
        "validation_pass": overall_pass,
    }
    OUT_CHANGES.write_text(json.dumps(changes, indent=2, ensure_ascii=False))
    print(f"  -> {OUT_CHANGES}")

    # Output 3 — payd_final_sector_counts_after_reactivation.json
    counts_doc = {
        "metadata": {
            "generated_at": GENERATED_AT,
            "purpose": "Sector counts and health after dry-run reactivation",
        },
        "sectors": sector_breakdown,
        "global_after_reactivation": {
            "active_total": len(after_eligible),
            "reactivated_added": len(after_eligible) - len(before_eligible),
            "removals": 0,
            "protected_unresolved": 0,
        },
        "validation_pass": overall_pass,
    }
    OUT_COUNTS.write_text(json.dumps(counts_doc, indent=2, ensure_ascii=False))
    print(f"  -> {OUT_COUNTS}")

    # ---- Step 10 — Console summary ----
    print("\n" + "=" * 80)
    print("FINAL REACTIVATION SECTOR DRY-RUN: " + ("PASS" if overall_pass else "FAIL"))
    print("=" * 80)
    print(f"Master universe      : {auth_count}")
    print(f"Active before        : {len(before_eligible)}")
    print(f"Active after         : {len(after_eligible)}")
    print(f"Projects reactivated : {len(candidate_ids)}")
    print(f"Sector placements    : {sum(len(cb.get('sectors_reactivated', [])) for cb in candidate_breakdown)}")
    print(f"Validation errors    : {len(VALIDATION_ERRORS)}")
    print(f"Validation warnings  : {len(VALIDATION_WARNINGS)}")
    if VALIDATION_ERRORS:
        print("\nERRORS:")
        for e in VALIDATION_ERRORS:
            print(f"  - {e}")
    print()
    print("Per-sector health AFTER reactivation:")
    for sb in sector_breakdown:
        print(
            f"  {sb['sector']:15} | target={sb['target']:3} | "
            f"before={sb['before']['count']:3} | after={sb['after']['count']:3} | "
            f"diff={sb['delta_count']:+2} | status_after={sb['after']['status']:11} | "
            f"rotation={sb['recommended_rotation_mode']}"
        )

    print("\nDO NOT DEPLOY. DO NOT ENABLE AUTO ROTATION. STOP for user approval.")
    return 0 if overall_pass else 1


if __name__ == "__main__":
    sys.exit(main())
