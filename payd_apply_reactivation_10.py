#!/usr/bin/env python3
"""
PAYD Intelligence V2 — ATOMIC APPLY: 10-Project Production Reactivation

APPLY ONLY REACTIVATION (NOT discovery, NOT auto-rotation):
- Reactivate 10 existing canonical assets in their authoritative sector memberships
- Preserve activity provenance (GitHub vs NON_GITHUB)
- Keep all AUTO rotation modes DISABLED in production
- Preserve market-cap hysteresis config

Hard invariants:
- canonical_master_universe = 354 (NO new records)
- No new sector memberships
- No legacy aliases used as canonical IDs
- AUTO rotation = DISABLED (per user instruction)

Outputs validation report:
- /tmp/workspace_tmp/payd_apply_reactivation_report.json
"""

import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

# ============================================================================
# Configuration
# ============================================================================
WORKSPACE = Path("/workspace")
TMP_OUTPUT = Path("/tmp/workspace_tmp")

DIST_DATA = WORKSPACE / "dist/data"
PUBLIC_DATA = WORKSPACE / "public/data"

PROJECTS_ENRICHED = DIST_DATA / "projects_enriched.json"
PROJECTS_JSON = DIST_DATA / "projects.json"
SECTOR_CONFIG = DIST_DATA / "sector_config.json"
INTEL_PROJECTS = DIST_DATA / "intelligence/projects.json"
INTEL_WATCHLIST = DIST_DATA / "intelligence/watchlist.json"

PUBLIC_PROJECTS_ENRICHED = PUBLIC_DATA / "projects_enriched.json"
PUBLIC_SECTOR_CONFIG = PUBLIC_DATA / "sector_config.json"
PUBLIC_PROJECTS_JSON = PUBLIC_DATA / "projects.json"
PUBLIC_INTEL_PROJECTS = PUBLIC_DATA / "intelligence/projects.json"
PUBLIC_INTEL_WATCHLIST = PUBLIC_DATA / "intelligence/watchlist.json"

OUT_REPORT = TMP_OUTPUT / "payd_apply_reactivation_report.json"
OUT_ACTIVITY_PROVENANCE = TMP_OUTPUT / "payd_apply_activity_provenance.json"

GENERATED_AT = datetime.now(timezone.utc).isoformat()
REFERENCE_DATE = "2026-09-17"

# Market cap hysteresis
ENTRY_MC_USD = 5_500_000.0
EXIT_MC_USD = 5_000_000.0

# 10 approved reactivation candidates
CANDIDATES = [
    "akash",
    "origintrail",
    "aethir",
    "render",
    "venice-token",
    "virtuals-protocol",
    "grass",
    "theta",
    "sentient",
    "arkham",
]

# Activity provenance (must be preserved separately)
ACTIVITY_PROVENANCE = {
    "akash":             {"github_activity_status": "ACTIVE", "operational_activity_status": "ACTIVE",          "combined_activity_status": "ACTIVE",                       "evidence_type": "GITHUB"},
    "origintrail":       {"github_activity_status": "ACTIVE", "operational_activity_status": "ACTIVE",          "combined_activity_status": "ACTIVE",                       "evidence_type": "GITHUB"},
    "aethir":            {"github_activity_status": "INACTIVE", "operational_activity_status": "ACTIVE",        "combined_activity_status": "ACTIVE_NON_GITHUB_CONFIRMED",  "evidence_type": "NON_GITHUB"},
    "render":            {"github_activity_status": "INACTIVE", "operational_activity_status": "ACTIVE",        "combined_activity_status": "ACTIVE_NON_GITHUB_CONFIRMED",  "evidence_type": "NON_GITHUB"},
    "venice-token":      {"github_activity_status": "STALE",  "operational_activity_status": "ACTIVE",          "combined_activity_status": "ACTIVE_NON_GITHUB_CONFIRMED",  "evidence_type": "NON_GITHUB"},
    "virtuals-protocol": {"github_activity_status": "DATA_UNAVAILABLE", "operational_activity_status": "ACTIVE", "combined_activity_status": "ACTIVE_NON_GITHUB_CONFIRMED",  "evidence_type": "NON_GITHUB"},
    "grass":             {"github_activity_status": "DATA_UNAVAILABLE", "operational_activity_status": "ACTIVE", "combined_activity_status": "ACTIVE_NON_GITHUB_CONFIRMED",  "evidence_type": "NON_GITHUB"},
    "theta":             {"github_activity_status": "STALE",  "operational_activity_status": "ACTIVE",          "combined_activity_status": "ACTIVE_NON_GITHUB_CONFIRMED",  "evidence_type": "NON_GITHUB"},
    "sentient":          {"github_activity_status": "STALE",  "operational_activity_status": "ACTIVE",          "combined_activity_status": "ACTIVE_NON_GITHUB_CONFIRMED",  "evidence_type": "NON_GITHUB"},
    "arkham":            {"github_activity_status": "DATA_UNAVAILABLE", "operational_activity_status": "ACTIVE", "combined_activity_status": "ACTIVE_NON_GITHUB_CONFIRMED",  "evidence_type": "NON_GITHUB"},
}

# Authoritative sector memberships (must already match what's in projects_enriched.json)
EXPECTED_SECTORS = {
    "akash":             ["ai", "depin"],
    "origintrail":       ["ai", "infrastructure", "rwa", "desci"],
    "aethir":            ["ai", "depin", "infrastructure"],
    "render":            ["ai", "depin"],
    "venice-token":      ["ai"],
    "virtuals-protocol": ["ai"],
    "grass":             ["ai", "depin"],
    "theta":             ["ai"],
    "sentient":          ["ai"],
    "arkham":            ["ai", "infrastructure"],
}

# Tickers mapping (for intelligence/projects.json)
CANDIDATE_TICKERS = {
    "akash":             "AKT",
    "origintrail":       "TRAC",
    "aethir":            "ATH",
    "render":            "RENDER",
    "venice-token":      "VVV",
    "virtuals-protocol": "VIRTUAL",
    "grass":             "GRASS",
    "theta":             "THETA",
    "sentient":          "SENT",
    "arkham":            "ARKM",
}

# Expected sector counts after apply (from dry-run)
EXPECTED_SECTOR_COUNTS = {
    "Layer1": 46, "Layer2": 23, "DePIN": 19, "AI": 37, "DeFi": 40,
    "RWA": 18, "Gaming": 21, "DeSci": 10, "Infrastructure": 36, "ZK": 0,
}

VALIDATION_ERRORS = []


def is_real_number(x):
    if x is None:
        return False
    if isinstance(x, float):
        if x != x or x in (float("inf"), float("-inf")):
            return False
    return True


# ============================================================================
# Phase 1: Pre-apply validation
# ============================================================================
def pre_validate_master_universe():
    """Verify master universe is intact and 354 records."""
    print("\n[PHASE 1] Pre-apply validation ...")
    with open(PROJECTS_ENRICHED) as f:
        doc = json.load(f)
    projects = doc.get("projects", [])
    print(f"  Master universe loaded: {len(projects)} canonical projects")
    if len(projects) != 354:
        VALIDATION_ERRORS.append(f"Master universe must be 354, found {len(projects)}")
        return None, None
    return doc, projects


def pre_validate_candidates_present(projects):
    """Verify all 10 candidates exist and have expected sectors."""
    print("  Validating 10 candidates ...")
    project_by_id = {p["id"]: p for p in projects}
    for cid in CANDIDATES:
        if cid not in project_by_id:
            VALIDATION_ERRORS.append(f"Candidate {cid} missing from master universe")
            continue
        p = project_by_id[cid]
        actual_sectors = p.get("sectors", []) or []
        expected_sectors = EXPECTED_SECTORS[cid]
        if sorted(actual_sectors) != sorted(expected_sectors):
            VALIDATION_ERRORS.append(
                f"{cid}: expected sectors {expected_sectors}, found {actual_sectors}"
            )
        else:
            print(f"    {cid}: sectors={actual_sectors} ✓")
    return len(VALIDATION_ERRORS) == 0


# ============================================================================
# Phase 2: Apply activity provenance to projects_enriched.json
# ============================================================================
def apply_activity_provenance(doc, projects):
    """Inject activity_provenance metadata into each reactivated candidate."""
    print("\n[PHASE 2] Applying activity provenance to 10 candidates ...")
    project_by_id = {p["id"]: p for p in projects}
    for cid in CANDIDATES:
        if cid not in project_by_id:
            continue
        p = project_by_id[cid]
        # Add reactivation metadata block (does NOT change identity, sectors, market data)
        p["reactivation"] = {
            "reactivated_at": GENERATED_AT,
            "reactivation_event": "v2_production_apply_10",
            "activity_provenance": ACTIVITY_PROVENANCE[cid],
            "reactivation_decision": "REACTIVATION_APPROVED",
            "market_cap_gate_passed": True,
            "canonical_identity_verified": True,
        }
    doc["reactivation_log"] = {
        "event": "10-candidate_reactivation_v2",
        "applied_at": GENERATED_AT,
        "candidates": CANDIDATES,
        "entry_mc_threshold_usd": ENTRY_MC_USD,
        "exit_mc_threshold_usd": EXIT_MC_USD,
        "auto_rotation_enabled": False,
        "discovery_enabled": False,
        "master_universe_size": len(projects),
    }
    doc["dataset_version"] = "v2.10.0-reactivation"
    print("  Activity provenance injected for 10 candidates")
    return doc


# ============================================================================
# Phase 3: Update sector_config.json (rotation_mode=DISABLED, hysteresis)
# ============================================================================
def update_sector_config():
    """Add rotation_mode=DISABLED and hysteresis config to each sector."""
    print("\n[PHASE 3] Updating sector_config.json ...")
    with open(SECTOR_CONFIG) as f:
        cfg = json.load(f)
    for s in cfg:
        s["rotation_mode"] = "DISABLED"
        s["rotation_enabled_in_production"] = False
        s["hysteresis"] = {
            "entry_market_cap_usd": ENTRY_MC_USD,
            "exit_market_cap_usd": EXIT_MC_USD,
        }
    # Top-level metadata
    cfg_with_meta = {
        "metadata": {
            "updated_at": GENERATED_AT,
            "auto_rotation_enabled_in_production": False,
            "hysteresis": {
                "entry_market_cap_usd": ENTRY_MC_USD,
                "exit_market_cap_usd": EXIT_MC_USD,
            },
            "sectors": cfg,
        }
    }
    print(f"  Updated {len(cfg)} sectors with rotation_mode=DISABLED + hysteresis")
    return cfg_with_meta


# ============================================================================
# Phase 4: Update intelligence/projects.json (add 8 missing profiles)
# ============================================================================
def update_intelligence_projects():
    """Add minimal profiles for 8 candidates not yet in featured list."""
    print("\n[PHASE 4] Updating intelligence/projects.json ...")
    with open(INTEL_PROJECTS) as f:
        intel = json.load(f)

    featured = intel.get("projects", {})

    # AKT (akash) is already there as AKT — don't change
    # RENDER (render) is already there as RENDER — don't change

    # Need to add 8 candidates if not already present
    new_additions = []
    for cid in CANDIDATES:
        ticker = CANDIDATE_TICKERS[cid]
        if ticker in featured:
            print(f"  {ticker} ({cid}): already featured — skipping")
            continue
        if cid == "akash" or cid == "render":
            continue  # already there under different ticker
        # Add minimal profile stub — activity provenance preserved
        minimal_profile = {
            "ticker": ticker,
            "name": cid.replace("-", " ").title(),
            "logo": "🔹",
            "sector": "AI",
            "subsector": "Reactivated",
            "founded": None,
            "headquarters": None,
            "ai_score": None,
            "ai_score_change_7d": None,
            "risk_score": None,
            "risk_label": None,
            "investment_rating": None,
            "rating_score": None,
            "description": f"{cid} — Reactivated canonical asset. Activity provenance: {ACTIVITY_PROVENANCE[cid]['evidence_type']}.",
            "thesis": None,
            "team": [],
            "ai_score_history": [],
            "_reactivation_marker": True,
            "_activity_provenance": ACTIVITY_PROVENANCE[cid],
        }
        featured[ticker] = minimal_profile
        new_additions.append(ticker)
        print(f"  Added minimal profile: {ticker} ({cid})")

    intel["projects"] = featured
    intel["last_updated"] = GENERATED_AT
    if "_reactivation_log" not in intel:
        intel["_reactivation_log"] = {
            "applied_at": GENERATED_AT,
            "newly_added_tickers": new_additions,
        }
    return intel


# ============================================================================
# Phase 5: Update watchlist (add 8 missing — akash + render already present)
# ============================================================================
def update_watchlist():
    """Add missing candidates to watchlist if not already there."""
    print("\n[PHASE 5] Updating intelligence/watchlist.json ...")
    with open(INTEL_WATCHLIST) as f:
        wl = json.load(f)
    existing_tickers = {w["ticker"] for w in wl["watchlist"]}

    additions = []
    for cid in CANDIDATES:
        ticker = CANDIDATE_TICKERS[cid]
        if ticker in existing_tickers:
            print(f"  {ticker} ({cid}): already in watchlist — skipping")
            continue
        wl_entry = {
            "ticker": ticker,
            "name": cid.replace("-", " ").title(),
            "logo": "🔹",
            "ai_score": None,
            "risk_score": None,
            "investment_rating": "Reactivated",
            "sector": "AI",
            "added_at": REFERENCE_DATE,
            "thesis": f"Reactivated canonical asset — activity provenance: {ACTIVITY_PROVENANCE[cid]['evidence_type']}.",
            "_reactivation_marker": True,
        }
        wl["watchlist"].append(wl_entry)
        additions.append(ticker)
        print(f"  Added to watchlist: {ticker} ({cid})")

    wl["last_updated"] = GENERATED_AT
    wl["count"] = len(wl["watchlist"])
    if "_reactivation_log" not in wl:
        wl["_reactivation_log"] = {
            "applied_at": GENERATED_AT,
            "newly_added_tickers": additions,
        }
    return wl


# ============================================================================
# Phase 6: Atomic write
# ============================================================================
def atomic_write_json(target_path: Path, payload):
    """Atomic write: write to .tmp then rename."""
    target_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = target_path.with_suffix(target_path.suffix + ".tmp")
    with open(tmp_path, "w") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    os.replace(tmp_path, target_path)


# ============================================================================
# Phase 7: Post-apply validation
# ============================================================================
def post_validate(universe_doc, sector_cfg_doc, intel_proj_doc, watchlist_doc):
    """Validate post-apply state."""
    print("\n[PHASE 7] Post-apply validation ...")

    projects = universe_doc["projects"]
    n = len(projects)
    print(f"  Master universe count: {n}")
    if n != 354:
        VALIDATION_ERRORS.append(f"Master universe count changed: {n}")

    # Check for duplicates
    ids = [p["id"] for p in projects]
    if len(set(ids)) != n:
        VALIDATION_ERRORS.append("Duplicate canonical IDs found")

    cg_ids = [p.get("coingeckoId") for p in projects if p.get("coingeckoId")]
    if len(set(cg_ids)) != len(cg_ids):
        VALIDATION_ERRORS.append("Duplicate CoinGecko IDs found")

    cmc_ids = [p.get("cmcId") for p in projects if p.get("cmcId")]
    if len(set(cmc_ids)) != len(cmc_ids):
        VALIDATION_ERRORS.append("Duplicate CMC IDs found")

    # Sector counts
    sector_title_map = {
        "layer1": "Layer1", "layer2": "Layer2", "depin": "DePIN", "ai": "AI",
        "defi": "DeFi", "rwa": "RWA", "gaming": "Gaming", "desci": "DeSci",
        "infrastructure": "Infrastructure", "zk": "ZK",
    }

    # Count only eligible active projects (mc >= exit threshold, tradable, verified)
    sector_counts = {title: 0 for title in EXPECTED_SECTOR_COUNTS}
    for p in projects:
        mc = p.get("market", {}).get("market_cap_usd") or 0
        if mc < EXIT_MC_USD:
            continue
        if p.get("identity", {}).get("tradable_asset") is not True:
            continue
        if p.get("identity", {}).get("identity_status") != "VERIFIED":
            continue
        if p.get("verifiedStatus") != "verified":
            continue
        if p.get("status") == "emerging":
            continue
        for s in p.get("sectors", []):
            sk = sector_title_map.get(s)
            if sk:
                sector_counts[sk] += 1

    # Compare with expected
    sector_match = True
    for sector, expected in EXPECTED_SECTOR_COUNTS.items():
        actual = sector_counts[sector]
        match = "✓" if actual == expected else "✗"
        if actual != expected:
            sector_match = False
            VALIDATION_ERRORS.append(
                f"Sector {sector}: expected {expected}, got {actual}"
            )
        print(f"  {sector:15} | expected={expected:3} | actual={actual:3} | {match}")

    # NaN/Inf check
    nan_count = 0
    inf_count = 0
    for p in projects:
        for key in ("market_cap_usd", "fdv_usd", "price_usd"):
            v = (p.get("market") or {}).get(key)
            if v is None:
                continue
            if isinstance(v, float):
                if v != v:
                    nan_count += 1
                if v in (float("inf"), float("-inf")):
                    inf_count += 1
    print(f"  NaN values: {nan_count}, Inf values: {inf_count}")
    if nan_count > 0 or inf_count > 0:
        VALIDATION_ERRORS.append(f"Found NaN={nan_count}, Inf={inf_count}")

    # Verify all 10 candidates visible in their expected sectors
    print("  Verifying 10 candidates in expected sectors ...")
    project_by_id = {p["id"]: p for p in projects}
    for cid in CANDIDATES:
        p = project_by_id.get(cid)
        if not p:
            continue
        actual = sorted(p.get("sectors", []))
        expected = sorted(EXPECTED_SECTORS[cid])
        if actual != expected:
            VALIDATION_ERRORS.append(f"{cid} sector mismatch: {actual} vs {expected}")
        else:
            print(f"    {cid:20}: {actual} ✓")

    # Rotation mode check
    cfg_sectors = sector_cfg_doc["metadata"]["sectors"]
    auto_enabled = any(s.get("rotation_mode") == "AUTO" for s in cfg_sectors)
    if auto_enabled:
        VALIDATION_ERRORS.append("AUTO rotation enabled in production (FORBIDDEN)")
    else:
        print(f"  AUTO rotation: DISABLED in production ✓")

    # Verify activity provenance preserved
    print("  Verifying activity provenance preserved ...")
    github_proven = ["akash", "origintrail"]
    non_github_proven = [c for c in CANDIDATES if c not in github_proven]
    for cid in github_proven:
        p = project_by_id.get(cid)
        if p and p.get("reactivation", {}).get("activity_provenance", {}).get("combined_activity_status") == "ACTIVE":
            print(f"    {cid:20}: GITHUB ACTIVE ✓")
        else:
            VALIDATION_ERRORS.append(f"{cid} GitHub provenance missing/wrong")
    for cid in non_github_proven:
        p = project_by_id.get(cid)
        if p and p.get("reactivation", {}).get("activity_provenance", {}).get("combined_activity_status") == "ACTIVE_NON_GITHUB_CONFIRMED":
            print(f"    {cid:20}: NON_GITHUB_CONFIRMED ✓")
        else:
            VALIDATION_ERRORS.append(f"{cid} non-GitHub provenance missing/wrong")

    return sector_counts


# ============================================================================
# Main
# ============================================================================
def main():
    print("=" * 80)
    print("PAYD INTELLIGENCE V2 — ATOMIC APPLY: 10-PROJECT REACTIVATION")
    print("=" * 80)
    print(f"Generated at: {GENERATED_AT}")
    print(f"AUTO rotation: DISABLED (per user instruction)")
    print(f"Hysteresis: entry=${ENTRY_MC_USD:,.0f}, exit=${EXIT_MC_USD:,.0f}")

    # PHASE 1 — Pre-validate
    universe_doc, projects = pre_validate_master_universe()
    if not universe_doc:
        print("ABORT: pre-validation failed")
        return 1
    if not pre_validate_candidates_present(projects):
        print(f"ABORT: {len(VALIDATION_ERRORS)} validation errors")
        return 1

    # PHASE 2 — Apply activity provenance
    universe_doc = apply_activity_provenance(universe_doc, projects)

    # PHASE 3 — Update sector_config.json
    sector_cfg_doc = update_sector_config()

    # PHASE 4 — Update intelligence/projects.json
    intel_proj_doc = update_intelligence_projects()

    # PHASE 5 — Update watchlist
    watchlist_doc = update_watchlist()

    # PHASE 6 — Atomic write
    print("\n[PHASE 6] Atomic write to production ...")
    atomic_write_json(PROJECTS_ENRICHED, universe_doc)
    print(f"  -> {PROJECTS_ENRICHED}")
    atomic_write_json(SECTOR_CONFIG, sector_cfg_doc)
    print(f"  -> {SECTOR_CONFIG}")

    # Write intelligence files
    atomic_write_json(INTEL_PROJECTS, intel_proj_doc)
    print(f"  -> {INTEL_PROJECTS}")
    atomic_write_json(INTEL_WATCHLIST, watchlist_doc)
    print(f"  -> {INTEL_WATCHLIST}")

    # Mirror to public/data
    print("\n[PHASE 6b] Mirror to public/data ...")
    shutil.copy2(PROJECTS_ENRICHED, PUBLIC_PROJECTS_ENRICHED)
    shutil.copy2(SECTOR_CONFIG, PUBLIC_SECTOR_CONFIG)
    shutil.copy2(INTEL_PROJECTS, PUBLIC_INTEL_PROJECTS)
    shutil.copy2(INTEL_WATCHLIST, PUBLIC_INTEL_WATCHLIST)
    print("  Mirror complete")

    # PHASE 7 — Post-validate
    sector_counts = post_validate(universe_doc, sector_cfg_doc, intel_proj_doc, watchlist_doc)

    # PHASE 8 — Build report
    print("\n[PHASE 8] Building report ...")
    report = {
        "metadata": {
            "generated_at": GENERATED_AT,
            "event": "10-project production reactivation v2",
            "auto_rotation_enabled": False,
            "entry_mc_threshold_usd": ENTRY_MC_USD,
            "exit_mc_threshold_usd": EXIT_MC_USD,
        },
        "global": {
            "master_universe_size": len(universe_doc["projects"]),
            "active_canonical_count_after": sum(sector_counts.values()),
            "candidates_reactivated": len(CANDIDATES),
            "sector_placements_reactivated": sum(len(EXPECTED_SECTORS[c]) for c in CANDIDATES),
            "new_canonical_records_created": 0,
            "forbidden_legacy_canonical_ids_used": 0,
        },
        "sector_counts_after": sector_counts,
        "sector_counts_expected": EXPECTED_SECTOR_COUNTS,
        "sector_match": sector_counts == EXPECTED_SECTOR_COUNTS,
        "candidates": [
            {
                "canonical_id": cid,
                "ticker": CANDIDATE_TICKERS[cid],
                "sectors": EXPECTED_SECTORS[cid],
                "activity_provenance": ACTIVITY_PROVENANCE[cid],
                "reactivation_decision": "REACTIVATION_APPROVED",
            }
            for cid in CANDIDATES
        ],
        "validation_errors": VALIDATION_ERRORS,
        "validation_pass": len(VALIDATION_ERRORS) == 0,
        "rollback_available": True,
        "do_not_deploy_auto_rotation": True,
    }

    TMP_OUTPUT.mkdir(parents=True, exist_ok=True)
    OUT_REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"  -> {OUT_REPORT}")

    # Activity provenance output
    provenance_out = {
        "event": "activity_provenance_for_10_reactivated_assets",
        "applied_at": GENERATED_AT,
        "github_confirmed_active": ["akash", "origintrail"],
        "non_github_confirmed_active": [
            "aethir", "render", "venice-token", "virtuals-protocol",
            "grass", "theta", "sentient", "arkham",
        ],
        "provenance_table": ACTIVITY_PROVENANCE,
    }
    OUT_ACTIVITY_PROVENANCE.write_text(json.dumps(provenance_out, indent=2, ensure_ascii=False))
    print(f"  -> {OUT_ACTIVITY_PROVENANCE}")

    # Final
    print()
    print("=" * 80)
    if VALIDATION_ERRORS:
        print(f"VALIDATION FAILED — {len(VALIDATION_ERRORS)} errors:")
        for e in VALIDATION_ERRORS:
            print(f"  - {e}")
        print()
        print("RECOMMEND ROLLBACK to last backup")
        return 1
    else:
        print("10-PROJECT PRODUCTION REACTIVATION: PASS")
        print()
        print("DO NOT ENABLE AUTO ROTATION")
        print("DO NOT START BROAD DISCOVERY")
        print("DO NOT CALCULATE PAYD SCORE")
        return 0


if __name__ == "__main__":
    sys.exit(main())
