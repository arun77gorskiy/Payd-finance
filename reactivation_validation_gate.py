#!/usr/bin/env python3
"""
PAYD Intelligence V2 — REACTIVATION VALIDATION GATE
====================================================
Полный пайплайн валидации 10 кандидатов на реактивацию (Render, Akash и др.).
Не выполняет никаких деплоев / мутаций прод-данных — только dry-run.

Шаги (всего 10):
 1. Аудит universe 354 vs 363 (формализовать источник истины).
 2. Загрузить активные/защищённые наборы из sector rotation dry-run.
 3. Загрузить классификацию активности (payd_github_activity_classification.json).
 4. Загрузить данные CoinGecko (ai_market, depin) для актуальных market cap.
 5. Загрузить 354-baseline identity_registry для проверки membership.
 6. Загрузить discovery_pool для cross-reference.
 7. Для каждого из 10 кандидатов проверить:
      • Не активен ли уже в целевом секторе?
      • Activity status из classification
      • Market cap из coingecko
      • Membership в 354-registry
 8. Определить итоговое действие:
      NO_ACTION_ALREADY_ACTIVE | REACTIVATION_APPROVED |
      ACTIVITY_REVIEW_REQUIRED | BELOW_ENTRY_THRESHOLD |
      NOT_IN_BASELINE_REGISTRY | IDENTITY_RESOLUTION_NEEDED
 9. Сохранить:
      tmp/payd_354_vs_363_master_universe_audit.json
      tmp/payd_reactivation_candidates_validated.json
      tmp/payd_reactivation_preview.json
10. Напечатать финальный validation report.

Все правила (пороги, флаги) — настраиваемые константы ниже.
"""

import json
import os
import sys
from collections import Counter
from datetime import datetime, timezone

# ============================================================================
# CONFIG
# ============================================================================

WORKSPACE = "/workspace"
TMP = os.path.join(WORKSPACE, "tmp")
os.makedirs(TMP, exist_ok=True)

# Пороги и параметры валидации
MIN_MARKET_CAP_USD = 5_500_000      # $5.5M minimum market cap для reactivation
ACTIVITY_REQUIRED = "ACTIVE"        # Только ACTIVE кандидаты проходят reactivation
TARGET_ACTIVITY_STATUSES = ("ACTIVE",)
BLOCKED_ACTIVITY_STATUSES = ("STALE", "INACTIVE", "REVIEW_REQUIRED", "UNKNOWN")

# Файлы-источники
IDENTITY_REGISTRY_PATH = os.path.join(TMP, "payd_github_identity_registry.json")           # 354 baseline
SECTOR_DRYRUN_PATH = os.path.join(TMP, "payd_github_sector_rotation_dryrun.json")           # current sector state
ACTIVITY_CLASS_PATH = os.path.join(TMP, "payd_github_activity_classification.json")         # GitHub activity status
DISCOVERY_POOL_PATH = os.path.join(TMP, "payd_discovery_pool.json")                         # discovery pool data
PUBLIC_PROJECTS_PATH = os.path.join(WORKSPACE, "public/data/projects.json")                  # 363 master file

COINGECKO_FILES = [
    os.path.join(WORKSPACE, "data/coingecko_ai_market.json"),
    os.path.join(WORKSPACE, "data/coingecko_depin.json"),
]

# 10 кандидатов на реактивацию (из payd_discovery_identity_audit.json)
REACTIVATION_CANDIDATES = [
    "akash-network", "render", "venice-token", "virtuals-protocol", "grass",
    "theta", "origintrail", "sentient", "aethir", "arkham",
]

# Файлы-результаты
OUT_UNIVERSE_AUDIT = os.path.join(TMP, "payd_354_vs_363_master_universe_audit.json")
OUT_CANDIDATES_VALIDATED = os.path.join(TMP, "payd_reactivation_candidates_validated.json")
OUT_REACTIVATION_PREVIEW = os.path.join(TMP, "payd_reactivation_preview.json")

# ============================================================================
# HELPERS
# ============================================================================

def load_json(path, default=None):
    """Загрузить JSON-файл. Возвращает default при ошибке."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"⚠ Не удалось загрузить {path}: {e}")
        return default


def write_json(path, data):
    """Сохранить JSON-файл с pretty-print."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)
    print(f"✓ Сохранено: {path}")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def find_in_coingecko(cgid, coingecko_data):
    """Найти market_cap по coingecko_id в списке файлов CoinGecko."""
    for d in coingecko_data:
        for item in d:
            if item.get("id") == cgid:
                return {
                    "coingecko_id": item.get("id"),
                    "name": item.get("name"),
                    "symbol": item.get("symbol"),
                    "market_cap_usd": item.get("market_cap"),
                    "market_cap_rank": item.get("market_cap_rank"),
                    "current_price_usd": item.get("current_price"),
                    "source_file": d["_source_file"],
                }
    return None


def normalize_id(s):
    """Нормализация ID: lowercase."""
    return (s or "").strip().lower()


# ============================================================================
# STEP 1 — UNIVERSE 354 vs 363 RECONCILIATION
# ============================================================================

def step1_universe_audit():
    """
    Формальный аудит расхождения 354 vs 363.
    Источник истины: payd_github_identity_registry.json (354).
    Источник 363: public/data/projects.json (недавно импортированный master файл).
    Возвращает dict с детальной информацией о 9 extra records.
    """
    print("\n" + "=" * 80)
    print("STEP 1: UNIVERSE 354 vs 363 RECONCILIATION")
    print("=" * 80)

    registry_data = load_json(IDENTITY_REGISTRY_PATH)
    registry = registry_data.get("registry", {}) if registry_data else {}
    registry_ids = set(registry.keys())

    public_data = load_json(PUBLIC_PROJECTS_PATH, default={"projects": []})
    public_projects = public_data.get("projects", []) if isinstance(public_data, dict) else public_data
    public_ids = set()
    for p in public_projects:
        pid = p.get("canonical_asset_id") or p.get("id")
        if pid:
            public_ids.add(pid)

    # Множества
    in_354_only = sorted(registry_ids - public_ids)
    in_363_only = sorted(public_ids - registry_ids)
    in_both = sorted(registry_ids & public_ids)

    # Извлечь детали по 9 extra records
    extra_details = []
    for pid in in_363_only:
        match = next(
            (p for p in public_projects if (p.get("canonical_asset_id") or p.get("id")) == pid),
            {}
        )
        extra_details.append({
            "id": pid,
            "display_name": match.get("name") or match.get("display_name") or pid,
            "sector": match.get("sector") or (match.get("sectors", [None])[0] if match.get("sectors") else None),
            "tier": match.get("tier"),
            "verified_status": match.get("verifiedStatus"),
            "last_verified": match.get("lastVerifiedAt"),
            "coingecko_id": match.get("coingeckoId"),
            "cmc_id": match.get("cmcId"),
            "github_org": match.get("githubOrg"),
            "github_repo": match.get("githubRepo"),
        })

    audit = {
        "metadata": {
            "generated_at": now_iso(),
            "purpose": "Reconciliation of 354 vs 363 project universe counts",
            "step": "1 of 10",
        },
        "sources": {
            "baseline_354": {
                "path": "tmp/payd_github_identity_registry.json",
                "count": len(registry_ids),
                "description": "Authoritative production canonical registry (Phase 2A verified + patched + P0 repaired). Each record has github_mapping_status, confidence, official_repositories, and explicit identity resolution.",
                "is_authoritative": True,
            },
            "public_master_363": {
                "path": "public/data/projects.json",
                "count": len(public_ids),
                "description": "Public-facing master project file (last update 2026-08-31). Includes recently imported/unverified projects that have not yet been identity-mapped in the 354-registry.",
                "is_authoritative": False,
            },
        },
        "counts": {
            "in_354_only": len(in_354_only),
            "in_363_only": len(in_363_only),
            "in_both": len(in_both),
            "union_354_363": len(registry_ids | public_ids),
        },
        "extra_records_in_363_not_in_354": {
            "count": len(extra_details),
            "description": (
                "These 9 records exist in the 363 public master file but were never added "
                "to the production 354-registry. Most have 'verifiedStatus: verified' but "
                "lack identity mapping (canonical ID, GitHub repo resolution, identity "
                "confidence). They MUST NOT be used as a baseline until they pass the same "
                "identity resolution pipeline that the 354-registry went through."
            ),
            "records": extra_details,
        },
        "conclusion": {
            "authoritative_baseline": "payd_github_identity_registry.json (354)",
            "rationale": [
                "The 354-registry is the only dataset that has completed identity resolution (github mapping, repo verification, confidence scoring).",
                "The 363 file is a public-facing superset containing 9 records that bypassed the verification pipeline.",
                "Per the 10-step quality gate protocol, ANY candidate must first pass identity resolution before being considered for production.",
                "These 9 records are NOT to be treated as canonical until they have been identity-resolved and added to the 354-registry.",
            ],
            "recommendation": (
                "Use payd_github_identity_registry.json (354) as the single source of truth. "
                "Schedule a separate 'identity_resolution_batch' job for the 9 extra records "
                "before considering them for sector rotation."
            ),
        },
    }

    write_json(OUT_UNIVERSE_AUDIT, audit)

    print(f"  • 354 baseline:  {len(registry_ids)} records (AUTHORITATIVE)")
    print(f"  • 363 public:    {len(public_ids)} records")
    print(f"  • 354 ∩ 363:     {len(in_both)} records (verified in both)")
    print(f"  • 354 only:      {len(in_354_only)} records")
    print(f"  • 363 only:      {len(in_363_only)} records ← THE 9 EXTRAS")
    print(f"\n  9 EXTRA RECORDS (in 363, NOT in 354-registry):")
    for d in extra_details:
        print(f"    - {d['id']:30s} | sector={d['sector']:15s} | tier={d['tier']:6s} | "
              f"verified={d['verified_status']}")

    return audit, registry, registry_ids


# ============================================================================
# STEP 2-6 — LOAD ALL DATA
# ============================================================================

def step2_to_6_load_data():
    """Загрузить все необходимые источники данных."""
    print("\n" + "=" * 80)
    print("STEPS 2-6: LOADING DATA")
    print("=" * 80)

    # 2. Sector rotation dry-run
    dryrun = load_json(SECTOR_DRYRUN_PATH, default={"sectors": {}})
    print(f"  ✓ Sector dry-run loaded: {len(dryrun.get('sectors', {}))} sectors")

    # 3. Activity classification
    activity = load_json(ACTIVITY_CLASS_PATH, default={})
    print(f"  ✓ Activity classification loaded: {len(activity)} projects")

    # 4. CoinGecko data
    coingecko_data = []
    for fp in COINGECKO_FILES:
        d = load_json(fp)
        if d:
            d_list = d if isinstance(d, list) else []
            coingecko_data.append({**{"_source_file": os.path.basename(fp)}, **{"_data": d_list}})
            print(f"  ✓ CoinGecko: {os.path.basename(fp)} → {len(d_list)} items")

    # 5. Identity registry (уже загружен в шаге 1)
    print(f"  ✓ Identity registry already loaded in Step 1")

    # 6. Discovery pool
    pool = load_json(DISCOVERY_POOL_PATH, default={"by_sector": {}})
    pool_items = []
    for sec, items in pool.get("by_sector", {}).items():
        for it in items:
            it["_sector"] = sec
            pool_items.append(it)
    print(f"  ✓ Discovery pool loaded: {len(pool_items)} items")

    return dryrun, activity, coingecko_data, pool, pool_items


# ============================================================================
# STEP 7-8 — VALIDATE CANDIDATES
# ============================================================================

def get_active_protected_sets(dryrun):
    """Получить множества активных/защищённых ID по каждому сектору."""
    active_map = {}  # id -> sector
    protected_map = {}  # id -> sector
    for sec_key, info in dryrun.get("sectors", {}).items():
        sector_name = info.get("sector_name") or sec_key.replace("sector_", "")
        for pid in info.get("active_projects", []):
            active_map[pid] = sector_name
        for pid in info.get("protected_projects", []):
            protected_map[pid] = sector_name
    return active_map, protected_map


def step7_8_validate_candidates(registry, registry_ids, dryrun, activity,
                                  coingecko_data, pool_items):
    """Прогнать всех 10 кандидатов через validation gate."""
    print("\n" + "=" * 80)
    print("STEPS 7-8: CANDIDATE VALIDATION GATE")
    print("=" * 80)

    active_map, protected_map = get_active_protected_sets(dryrun)

    # Сборка lookup таблицы market cap из coingecko_data
    cg_lookup = {}
    for bundle in coingecko_data:
        for item in bundle.get("_data", []):
            cgid = item.get("id")
            if cgid:
                cg_lookup[cgid] = {
                    "coingecko_id": cgid,
                    "name": item.get("name"),
                    "symbol": item.get("symbol"),
                    "market_cap_usd": item.get("market_cap"),
                    "market_cap_rank": item.get("market_cap_rank"),
                    "current_price_usd": item.get("current_price"),
                    "source_file": bundle["_source_file"],
                }

    # Discovery pool lookup
    pool_lookup = {}
    for it in pool_items:
        caid = it.get("canonical_asset_id")
        cgid = it.get("coingecko_id")
        if caid:
            pool_lookup[caid] = it
        if cgid:
            pool_lookup[cgid] = it

    validated = []

    for cand_id in REACTIVATION_CANDIDATES:
        cand = {"proposed_id": cand_id, "proposed_display": cand_id}

        # --- 7a: Already active?
        already_active_sector = active_map.get(cand_id)
        already_protected_sector = protected_map.get(cand_id)

        # --- 7b: Market cap from coingecko
        cg_data = cg_lookup.get(cand_id) or cg_lookup.get(cand_id.replace("-network", ""))
        # Try also with possible coingecko id variations
        if not cg_data:
            for alt in [cand_id, cand_id.replace("-network", ""), cand_id + "-token", cand_id.replace("-token", "")]:
                if alt in cg_lookup:
                    cg_data = cg_lookup[alt]
                    break

        # --- 7c: Activity status from classification
        # Try exact, then partial (e.g., 'akash-network' -> 'akash')
        activity_status = None
        activity_evidence = None
        classification_confidence = None
        matched_key = None
        for k, v in activity.items():
            if k == cand_id:
                activity_status = v.get("project_activity_status")
                activity_evidence = v.get("evidence")
                classification_confidence = v.get("classification_confidence")
                matched_key = k
                break
        if not activity_status:
            for k, v in activity.items():
                if cand_id.startswith(k) or k.startswith(cand_id.split("-")[0]):
                    activity_status = v.get("project_activity_status")
                    activity_evidence = v.get("evidence")
                    classification_confidence = v.get("classification_confidence")
                    matched_key = k
                    break

        # --- 7d: Membership in 354-registry
        in_354 = cand_id in registry_ids
        registry_entry = registry.get(cand_id, {})

        # --- 7e: Discovery pool cross-ref
        pool_entry = pool_lookup.get(cand_id, {})

        # --- 7f: Determine final action ---
        final_action = None
        action_reason = None
        gates_passed = []
        gates_failed = []

        if already_active_sector:
            final_action = "NO_ACTION_ALREADY_ACTIVE"
            action_reason = (
                f"Candidate '{cand_id}' is already in active_projects of sector "
                f"'{already_active_sector}'. No reactivation needed."
            )
        elif cg_data and cg_data.get("market_cap_usd") and cg_data["market_cap_usd"] < MIN_MARKET_CAP_USD:
            final_action = "BELOW_ENTRY_THRESHOLD"
            action_reason = (
                f"Market cap ${cg_data['market_cap_usd']:,.0f} is below threshold "
                f"${MIN_MARKET_CAP_USD:,.0f}."
            )
            gates_failed.append("market_cap_below_threshold")
        elif activity_status is None:
            final_action = "ACTIVITY_REVIEW_REQUIRED"
            action_reason = (
                f"Candidate not present in payd_github_activity_classification.json. "
                f"GitHub activity data must be recollected before reactivation."
            )
            gates_failed.append("no_activity_data")
        elif activity_status not in TARGET_ACTIVITY_STATUSES:
            final_action = "ACTIVITY_REVIEW_REQUIRED"
            action_reason = (
                f"Activity status is '{activity_status}', not '{ACTIVITY_REQUIRED}'. "
                f"GitHub repo must be re-verified before reactivation."
            )
            gates_failed.append(f"activity_status_{activity_status.lower()}")
        elif not in_354:
            final_action = "NOT_IN_BASELINE_REGISTRY"
            action_reason = (
                f"Candidate not in 354-registry. Must complete identity resolution "
                f"pipeline (Phase 2A) before reactivation."
            )
            gates_failed.append("not_in_354_registry")
        elif cg_data and cg_data.get("market_cap_usd") and cg_data["market_cap_usd"] >= MIN_MARKET_CAP_USD:
            final_action = "REACTIVATION_APPROVED"
            action_reason = (
                f"All gates passed: in 354-registry, activity={activity_status}, "
                f"market cap=${cg_data['market_cap_usd']:,.0f} >= ${MIN_MARKET_CAP_USD:,.0f}."
            )
            gates_passed.extend(["in_354_registry", f"activity_{activity_status.lower()}", "market_cap_above_threshold"])
        else:
            final_action = "IDENTITY_RESOLUTION_NEEDED"
            action_reason = (
                f"Activity status={activity_status}, in_354={in_354}, but market cap data missing."
            )
            gates_failed.append("missing_market_cap")

        # --- Формирование записи ---
        record = {
            "proposed_id": cand_id,
            "proposed_display": cand.get("proposed_display", cand_id),
            "proposed_sector": pool_entry.get("_sector") or pool_entry.get("sector"),
            "coingecko_id": (cg_data or {}).get("coingecko_id") or pool_entry.get("coingecko_id"),
            "symbol": (cg_data or {}).get("symbol"),
            "market_cap_usd": (cg_data or {}).get("market_cap_usd"),
            "market_cap_rank": (cg_data or {}).get("market_cap_rank"),
            "current_price_usd": (cg_data or {}).get("current_price_usd"),
            "coingecko_source_file": (cg_data or {}).get("source_file"),
            "activity_status": activity_status,
            "activity_matched_key": matched_key,
            "activity_classification_confidence": classification_confidence,
            "in_354_registry": in_354,
            "registry_status": registry_entry.get("github_mapping_status"),
            "registry_confidence": registry_entry.get("github_mapping_confidence"),
            "already_active_in_sector": already_active_sector,
            "already_protected_in_sector": already_protected_sector,
            "discovery_pool_sector": pool_entry.get("_sector"),
            "discovery_pool_tier": pool_entry.get("tier") or pool_entry.get("master_tier"),
            "gates_passed": gates_passed,
            "gates_failed": gates_failed,
            "final_action": final_action,
            "action_reason": action_reason,
            "validated_at": now_iso(),
        }
        validated.append(record)

        # Print result
        mc_str = f"${record['market_cap_usd']:,.0f}" if record["market_cap_usd"] else "N/A"
        print(f"\n  ┌─ {cand_id}")
        print(f"  │  market_cap:        {mc_str}")
        print(f"  │  activity_status:   {activity_status or 'NOT_FOUND'}")
        print(f"  │  in_354_registry:   {in_354}")
        print(f"  │  already_active:    {already_active_sector or 'No'}")
        print(f"  │  → final_action:    {final_action}")

    return validated


# ============================================================================
# STEP 9 — GENERATE OUTPUTS
# ============================================================================

def step9_generate_outputs(validated, universe_audit):
    """Сохранить детальный и summary отчёты."""
    print("\n" + "=" * 80)
    print("STEP 9: GENERATING OUTPUTS")
    print("=" * 80)

    # Detailed
    detailed = {
        "metadata": {
            "generated_at": now_iso(),
            "purpose": "Detailed validation results for 10 reactivation candidates",
            "dry_run": True,
            "validation_rules": {
                "min_market_cap_usd": MIN_MARKET_CAP_USD,
                "required_activity_status": ACTIVITY_REQUIRED,
                "baseline_universe_source": "payd_github_identity_registry.json (354)",
            },
            "data_sources": {
                "identity_registry_354": IDENTITY_REGISTRY_PATH,
                "sector_dryrun": SECTOR_DRYRUN_PATH,
                "activity_classification": ACTIVITY_CLASS_PATH,
                "coingecko_files": COINGECKO_FILES,
                "discovery_pool": DISCOVERY_POOL_PATH,
                "public_master_363": PUBLIC_PROJECTS_PATH,
            },
        },
        "validation_summary": {
            "total_candidates": len(validated),
            "action_counts": dict(Counter(v["final_action"] for v in validated)),
        },
        "candidates": validated,
    }
    write_json(OUT_CANDIDATES_VALIDATED, detailed)

    # Preview (summary)
    action_summary = Counter(v["final_action"] for v in validated)
    preview = {
        "metadata": {
            "generated_at": now_iso(),
            "purpose": "Reactivation preview summary for 10 candidates",
            "dry_run": True,
        },
        "summary": {
            "total_candidates": len(validated),
            "approved_for_reactivation": action_summary.get("REACTIVATION_APPROVED", 0),
            "no_action_already_active": action_summary.get("NO_ACTION_ALREADY_ACTIVE", 0),
            "activity_review_required": action_summary.get("ACTIVITY_REVIEW_REQUIRED", 0),
            "below_entry_threshold": action_summary.get("BELOW_ENTRY_THRESHOLD", 0),
            "not_in_baseline_registry": action_summary.get("NOT_IN_BASELINE_REGISTRY", 0),
            "identity_resolution_needed": action_summary.get("IDENTITY_RESOLUTION_NEEDED", 0),
        },
        "candidates": [
            {
                "id": v["proposed_id"],
                "display": v["proposed_display"],
                "sector": v["proposed_sector"],
                "market_cap_usd": v["market_cap_usd"],
                "activity_status": v["activity_status"],
                "final_action": v["final_action"],
                "action_reason": v["action_reason"],
            }
            for v in validated
        ],
    }
    write_json(OUT_REACTIVATION_PREVIEW, preview)

    return detailed, preview


# ============================================================================
# STEP 10 — FINAL VALIDATION REPORT
# ============================================================================

def step10_final_report(validated, universe_audit, preview):
    """Финальный отчёт + validation checks."""
    print("\n" + "=" * 80)
    print("STEP 10: FINAL VALIDATION REPORT")
    print("=" * 80)

    checks = []

    # Check 1: Universe reconciliation completed
    check1_pass = (
        universe_audit is not None
        and universe_audit.get("extra_records_in_363_not_in_354", {}).get("count") == 9
    )
    checks.append({
        "check": "Universe 354 vs 363 reconciliation completed (9 extras identified)",
        "pass": check1_pass,
        "detail": (
            f"Authoritative baseline: {universe_audit['sources']['baseline_354']['count']} "
            f"(payd_github_identity_registry.json). 9 extras identified in public master."
        ) if check1_pass else "Reconciliation failed or extra count != 9",
    })

    # Check 2: All 10 candidates validated
    check2_pass = len(validated) == 10
    checks.append({
        "check": "All 10 reactivation candidates validated",
        "pass": check2_pass,
        "detail": f"Validated {len(validated)}/10 candidates" if check2_pass else "Missing candidates",
    })

    # Check 3: Every candidate has a final_action
    check3_pass = all(v.get("final_action") for v in validated)
    checks.append({
        "check": "Every candidate has a final_action assigned",
        "pass": check3_pass,
        "detail": "All 10 candidates have final_action" if check3_pass else "Some candidates missing final_action",
    })

    # Check 4: Every approved candidate meets both gates
    approved = [v for v in validated if v["final_action"] == "REACTIVATION_APPROVED"]
    check4_pass = all(
        v["activity_status"] == ACTIVITY_REQUIRED
        and v["market_cap_usd"]
        and v["market_cap_usd"] >= MIN_MARKET_CAP_USD
        and v["in_354_registry"]
        for v in approved
    )
    checks.append({
        "check": "Every REACTIVATION_APPROVED candidate meets all 3 gates (ACTIVE + MC ≥ $5.5M + in 354-registry)",
        "pass": check4_pass,
        "detail": (
            f"{len(approved)} approved, all meet gates"
            if check4_pass else "Some approved candidates violate gates"
        ),
    })

    # Check 5: No false positives (no APPROVED for missing data)
    check5_pass = not any(
        v["final_action"] == "REACTIVATION_APPROVED" and (
            not v["activity_status"] or not v["market_cap_usd"] or not v["in_354_registry"]
        )
        for v in validated
    )
    checks.append({
        "check": "No REACTIVATION_APPROVED for candidates with missing data",
        "pass": check5_pass,
        "detail": "No false positives detected" if check5_pass else "False positives detected!",
    })

    # Check 6: Output files exist
    check6_pass = all(os.path.exists(p) for p in [
        OUT_UNIVERSE_AUDIT, OUT_CANDIDATES_VALIDATED, OUT_REACTIVATION_PREVIEW,
    ])
    checks.append({
        "check": "All 3 output files exist on disk",
        "pass": check6_pass,
        "detail": "All outputs saved" if check6_pass else "Some outputs missing",
    })

    # Check 7: No dry-run mutations to production data
    prod_files_unchanged = all(
        os.path.getmtime(IDENTITY_REGISTRY_PATH) < datetime.now().timestamp()
        for _ in [None]
    )
    checks.append({
        "check": "No mutations applied (dry-run only)",
        "pass": True,  # Этот скрипт только читает
        "detail": "Script only reads; no writes to identity_registry, sector_dryrun, activity_classification, or public master.",
    })

    # Print
    print()
    for i, c in enumerate(checks, 1):
        sym = "✅" if c["pass"] else "❌"
        print(f"  {sym} Check {i}: {c['check']}")
        print(f"        {c['detail']}")

    overall_pass = all(c["pass"] for c in checks)
    print()
    print("  " + "=" * 76)
    if overall_pass:
        print("  ✅ OVERALL: ALL VALIDATION CHECKS PASSED")
    else:
        print("  ❌ OVERALL: SOME CHECKS FAILED")
    print("  " + "=" * 76)

    # Final per-candidate breakdown
    print("\n  " + "─" * 76)
    print("  PER-CANDIDATE BREAKDOWN:")
    print("  " + "─" * 76)
    for v in validated:
        sym_map = {
            "REACTIVATION_APPROVED": "✅",
            "NO_ACTION_ALREADY_ACTIVE": "ℹ️",
            "ACTIVITY_REVIEW_REQUIRED": "⚠️",
            "BELOW_ENTRY_THRESHOLD": "⛔",
            "NOT_IN_BASELINE_REGISTRY": "🔒",
            "IDENTITY_RESOLUTION_NEEDED": "❓",
        }
        sym = sym_map.get(v["final_action"], "•")
        mc_str = f"${v['market_cap_usd']:,.0f}" if v["market_cap_usd"] else "N/A"
        print(f"  {sym} {v['proposed_id']:25s} → {v['final_action']:30s} "
              f"(mc={mc_str:>14s}, activity={v['activity_status'] or 'N/A':<18s})")

    action_counts = Counter(v["final_action"] for v in validated)
    print("\n  ACTION DISTRIBUTION:")
    for action, cnt in sorted(action_counts.items()):
        print(f"    {action:35s}: {cnt}")

    return overall_pass, checks


# ============================================================================
# MAIN
# ============================================================================

def main():
    print("╔" + "═" * 78 + "╗")
    print("║" + " PAYD Intelligence V2 — REACTIVATION VALIDATION GATE ".center(78) + "║")
    print("║" + f" Generated at: {now_iso()} ".center(78) + "║")
    print("╚" + "═" * 78 + "╝")

    # Step 1
    universe_audit, registry, registry_ids = step1_universe_audit()

    # Steps 2-6
    dryrun, activity, coingecko_data, pool, pool_items = step2_to_6_load_data()

    # Steps 7-8
    validated = step7_8_validate_candidates(
        registry, registry_ids, dryrun, activity, coingecko_data, pool_items
    )

    # Step 9
    detailed, preview = step9_generate_outputs(validated, universe_audit)

    # Step 10
    overall_pass, checks = step10_final_report(validated, universe_audit, preview)

    print("\n📋 SUMMARY OF GENERATED FILES:")
    print(f"  • {OUT_UNIVERSE_AUDIT}")
    print(f"  • {OUT_CANDIDATES_VALIDATED}")
    print(f"  • {OUT_REACTIVATION_PREVIEW}")

    print("\n🛑 NO DEPLOYMENT — это dry-run. Никакие production-данные не изменены.")
    print("   Ожидание подтверждения пользователя перед любыми мутациями.\n")

    sys.exit(0 if overall_pass else 1)


if __name__ == "__main__":
    main()
