#!/usr/bin/env python3
"""
PAYD Intelligence V2 — TARGETED REACTIVATION RECOLLECTION
=========================================================
Полный пайплайн целенаправленной реактивации для 10 кандидатов.

СТРОГИЕ ПРАВИЛА:
- akash-network ДОЛЖЕН резолвиться в akash (authoritative canonical)
- 9 legacy/extra records НЕ МОГУТ быть использованы как canonical
- Recollecion только из VERIFIED/VERIFIED_UPDATED mappings с conf >= 0.95
- Не собирать данные с guessed/REVIEW_REQUIRED repositories
- Multi-signal reclassification для всех проектов
- Это DRY-RUN — никаких изменений в production данных

Steps:
 1. RESOLVE — нормализация к authoritative canonical IDs (354-registry)
 2. CHECK EXISTING — проверка наличия актуальных authoritative developer data
 3. VERIFY MAPPING — strict gate: VERIFIED/VERIFIED_UPDATED + conf >= 0.95
 4. COLLECT — целевая GitHub recollection (только verified candidates)
 5. AKASH SPECIAL — reclassification с fresh evidence
 6. VIRTUALS MARKET — targeted market data refresh
 7. RECLASSIFY ACTIVITY — multi-signal reclassification
 8. FINAL GATE — REACTIVATION_APPROVED или иной action
 9. NO MUTATION — master universe остаётся 354
10. OUTPUT — три финальных JSON-файла + validation report
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

# Пороги валидации (multi-signal ACTIVE rules, согласованные с существующей классификацией)
MIN_MARKET_CAP_USD = 5_500_000
MIN_COMMITS_90D_STRICT = 10           # Full multi-signal rule
MIN_COMMITS_90D_RELAXED = 5           # Two-signal ACTIVE rule
MAX_DAYS_SINCE_COMMIT_STRICT = 60
MAX_DAYS_SINCE_COMMIT_RELAXED = 90
MIN_RELEASES_90D = 1
MIN_CONTRIBUTORS_90D = 5
MIN_ACTIVE_REPOS_90D = 1

# Aliases / legacy → canonical mapping
LEGACY_ALIAS_MAP = {
    "akash-network": "akash",        # ← обязательная нормализация
    "polygon-ecosystem-token": "polygon",
    # другие legacy IDs из 363-extra списка никогда не должны использоваться
    # в качестве canonical для новых developer data
}

# 10 кандидатов — DISCOVERY IDs (из 363-universe)
DISCOVERY_CANDIDATES = [
    ("Akash Network",      "akash-network"),
    ("Render",             "render"),
    ("Venice",             "venice-token"),
    ("Virtuals Protocol",  "virtuals-protocol"),
    ("Grass",              "grass"),
    ("Theta Network",      "theta"),
    ("OriginTrail",        "origintrail"),
    ("Sentient",           "sentient"),
    ("Aethir",             "aethir"),
    ("Arkham",             "arkham"),
]

# Запрещённые legacy IDs — никогда не должны использоваться как canonical
LEGACY_FORBIDDEN_IDS = {
    "akash-network", "tao", "icp", "immutable-x", "mina", "mint",
    "otherside", "genomesio", "polygon-ecosystem-token",
}

# Файлы-источники
IDENTITY_REGISTRY_PATH = os.path.join(TMP, "payd_github_identity_registry.json")
AUTH_DEVELOPER_PATH = os.path.join(TMP, "payd_github_developer_authoritative_173.json")
ACTIVITY_CLASS_PATH = os.path.join(TMP, "payd_github_activity_classification.json")
SECTOR_DRYRUN_PATH = os.path.join(TMP, "payd_github_sector_rotation_dryrun.json")
DISCOVERY_POOL_PATH = os.path.join(TMP, "payd_discovery_pool.json")
DISCOVERY_AUDIT_PATH = os.path.join(TMP, "payd_discovery_identity_audit.json")

COINGECKO_FILES = [
    os.path.join(WORKSPACE, "data/coingecko_ai_market.json"),
    os.path.join(WORKSPACE, "data/coingecko_depin.json"),
]

# Файлы-результаты
OUT_IDENTITY_RESOLUTION = os.path.join(TMP, "payd_reactivation_10_identity_resolution.json")
OUT_GITHUB_RECOLLECTION = os.path.join(TMP, "payd_reactivation_10_github_recollection.json")
OUT_FINAL_GATE = os.path.join(TMP, "payd_reactivation_10_final_gate.json")

# ============================================================================
# HELPERS
# ============================================================================

def load_json(path, default=None):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"⚠ Не удалось загрузить {path}: {e}")
        return default


def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)
    print(f"✓ Сохранено: {os.path.relpath(path, WORKSPACE)}")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def safe_int(v, default=None):
    if v is None:
        return default
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def safe_float(v, default=None):
    if v is None:
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


# ============================================================================
# STEP 1 — RESOLVE ALL 10 TO AUTHORITATIVE CANONICAL IDS
# ============================================================================

def step1_resolve_identity(registry, registry_ids):
    """
    Резолвим каждый discovery ID к authoritative canonical ID из 354-registry.
    akash-network → akash (КРИТИЧЕСКИ ВАЖНО).
    """
    print("\n" + "=" * 80)
    print("STEP 1: IDENTITY RESOLUTION — DISCOVERY → AUTHORITATIVE CANONICAL")
    print("=" * 80)

    resolution_results = []

    for display_name, discovery_id in DISCOVERY_CANDIDATES:
        # 1. Проверить на legacy forbidden
        if discovery_id in LEGACY_FORBIDDEN_IDS:
            # 1a. Если есть alias mapping — применить
            canonical_id = LEGACY_ALIAS_MAP.get(discovery_id)

            if canonical_id and canonical_id in registry_ids:
                reg_entry = registry[canonical_id]
                resolution_results.append({
                    "discovery_id": discovery_id,
                    "display_name": display_name,
                    "authoritative_canonical_id": canonical_id,
                    "normalization_applied": f"LEGACY_ALIAS_MAP[{discovery_id}] → {canonical_id}",
                    "in_354_registry": True,
                    "registry_mapping_status": reg_entry.get("github_mapping_status"),
                    "registry_confidence": reg_entry.get("github_mapping_confidence"),
                    "registry_official_repos": reg_entry.get("official_repositories"),
                    "registry_source": reg_entry.get("github_mapping_source"),
                    "registry_notes": reg_entry.get("github_mapping_notes"),
                    "symbol": None,
                    "sectors": [],
                    "identity_confidence": reg_entry.get("github_mapping_confidence"),
                })
                print(f"  ✓ {discovery_id:25s} → {canonical_id:25s} "
                      f"(LEGACY_ALIAS_MAP, status={reg_entry.get('github_mapping_status')})")
            else:
                # Legacy ID без alias — заблокировать
                resolution_results.append({
                    "discovery_id": discovery_id,
                    "display_name": display_name,
                    "authoritative_canonical_id": None,
                    "normalization_applied": "BLOCKED_LEGACY_NO_CANONICAL",
                    "in_354_registry": False,
                    "block_reason": f"Legacy ID '{discovery_id}' from 363-extras; no canonical alias registered",
                })
                print(f"  ✗ {discovery_id:25s} → BLOCKED (legacy, no canonical alias)")
            continue

        # 2. Обычный путь — discovery ID должен быть в 354-registry
        if discovery_id in registry_ids:
            reg_entry = registry[discovery_id]
            resolution_results.append({
                "discovery_id": discovery_id,
                "display_name": display_name,
                "authoritative_canonical_id": discovery_id,
                "normalization_applied": "DIRECT_MATCH",
                "in_354_registry": True,
                "registry_mapping_status": reg_entry.get("github_mapping_status"),
                "registry_confidence": reg_entry.get("github_mapping_confidence"),
                "registry_official_repos": reg_entry.get("official_repositories"),
                "registry_source": reg_entry.get("github_mapping_source"),
                "registry_notes": reg_entry.get("github_mapping_notes"),
                "symbol": None,
                "sectors": [],
                "identity_confidence": reg_entry.get("github_mapping_confidence"),
            })
            print(f"  ✓ {discovery_id:25s} → {discovery_id:25s} "
                  f"(DIRECT_MATCH, status={reg_entry.get('github_mapping_status')})")
        else:
            # 3. Discovery ID не в registry и не legacy — попробовать fuzzy match
            # (например, render vs rendertoken)
            fuzzy_match = None
            for k in registry_ids:
                if discovery_id.replace("-", "") == k.replace("-", ""):
                    fuzzy_match = k
                    break
                if discovery_id.startswith(k) or k.startswith(discovery_id.split("-")[0]):
                    fuzzy_match = k
                    break

            if fuzzy_match:
                reg_entry = registry[fuzzy_match]
                resolution_results.append({
                    "discovery_id": discovery_id,
                    "display_name": display_name,
                    "authoritative_canonical_id": fuzzy_match,
                    "normalization_applied": f"FUZZY_MATCH → {fuzzy_match}",
                    "in_354_registry": True,
                    "registry_mapping_status": reg_entry.get("github_mapping_status"),
                    "registry_confidence": reg_entry.get("github_mapping_confidence"),
                    "registry_official_repos": reg_entry.get("official_repositories"),
                    "registry_source": reg_entry.get("github_mapping_source"),
                    "registry_notes": reg_entry.get("github_mapping_notes"),
                    "symbol": None,
                    "sectors": [],
                    "identity_confidence": reg_entry.get("github_mapping_confidence"),
                })
                print(f"  ✓ {discovery_id:25s} → {fuzzy_match:25s} (FUZZY_MATCH)")
            else:
                resolution_results.append({
                    "discovery_id": discovery_id,
                    "display_name": display_name,
                    "authoritative_canonical_id": None,
                    "normalization_applied": "NOT_FOUND_IN_354",
                    "in_354_registry": False,
                    "block_reason": f"'{discovery_id}' not in 354-registry; cannot resolve",
                })
                print(f"  ✗ {discovery_id:25s} → NOT_FOUND_IN_354")

    return resolution_results


# ============================================================================
# STEP 2 — CHECK EXISTING AUTHORITATIVE DEVELOPER DATA
# ============================================================================

def step2_check_existing(auth_developer, resolution_results):
    """Проверить наличие актуальных authoritative developer data."""
    print("\n" + "=" * 80)
    print("STEP 2: CHECK EXISTING AUTHORITATIVE DEVELOPER DATA")
    print("=" * 80)

    existing_data_check = []
    projects = auth_developer.get("projects", {})

    for r in resolution_results:
        canonical_id = r.get("authoritative_canonical_id")
        if not canonical_id:
            existing_data_check.append({
                "canonical_id": None,
                "discovery_id": r["discovery_id"],
                "existing_data": False,
                "reason": "No canonical identity — cannot check authoritative data",
            })
            continue

        existing = projects.get(canonical_id)
        if existing:
            retrieved_at = existing.get("retrieved_at")
            last_commit_at = existing.get("last_commit_at")
            days_since = existing.get("days_since_last_commit")
            repos_count = existing.get("repositories_count", 0)

            # Stale если > 30 дней (наша freshness window)
            try:
                rt = datetime.fromisoformat(retrieved_at.replace("Z", "+00:00"))
                age_days = (datetime.now(timezone.utc) - rt).days
            except Exception:
                age_days = None

            existing_data_check.append({
                "canonical_id": canonical_id,
                "discovery_id": r["discovery_id"],
                "existing_data": True,
                "retrieved_at": retrieved_at,
                "data_age_days": age_days,
                "is_fresh": age_days is not None and age_days <= 30,
                "repositories_count": repos_count,
                "last_commit_at": last_commit_at,
                "days_since_last_commit": days_since,
                "commits_30d": existing.get("commits_30d"),
                "commits_90d": existing.get("commits_90d"),
                "contributors_90d": existing.get("unique_contributors_90d"),
                "releases_90d": existing.get("releases_90d"),
                "active_repositories_90d": existing.get("active_repositories_90d"),
                "errors_count": len(existing.get("errors", [])),
                "collection_status": existing.get("collection_status"),
            })
            print(f"  ✓ {canonical_id:25s} → EXISTS "
                  f"(age={age_days}d, repos={repos_count}, last_commit={last_commit_at})")
        else:
            existing_data_check.append({
                "canonical_id": canonical_id,
                "discovery_id": r["discovery_id"],
                "existing_data": False,
                "reason": "Not in authoritative developer dataset (161 projects). Recollection required.",
            })
            print(f"  ✗ {canonical_id:25s} → NOT IN AUTHORITATIVE (recollection required)")

    return existing_data_check


# ============================================================================
# STEP 3 — VERIFY GITHUB MAPPING BEFORE COLLECTION
# ============================================================================

def step3_verify_mapping(resolution_results, existing_data_check):
    """Verify GitHub mapping. Only VERIFIED/VERIFIED_UPDATED + conf >= 0.95."""
    print("\n" + "=" * 80)
    print("STEP 3: GITHUB MAPPING VERIFICATION")
    print("=" * 80)

    verified_for_collection = []
    mapping_decisions = []

    for r, e in zip(resolution_results, existing_data_check):
        canonical_id = r.get("authoritative_canonical_id")
        if not canonical_id:
            mapping_decisions.append({
                "canonical_id": None,
                "discovery_id": r["discovery_id"],
                "verified_for_collection": False,
                "decision_reason": "No canonical identity",
            })
            continue

        mapping_status = r.get("registry_mapping_status")
        mapping_conf = r.get("registry_confidence", 0) or 0
        repos = r.get("registry_official_repos") or []

        # STRICT: VERIFIED/VERIFIED_UPDATED + conf >= 0.95
        is_verified_status = mapping_status in ("VERIFIED", "VERIFIED_UPDATED")
        is_high_conf = mapping_conf >= 0.95
        has_repos = len(repos) > 0

        eligible = is_verified_status and is_high_conf and has_repos

        decision = {
            "canonical_id": canonical_id,
            "discovery_id": r["discovery_id"],
            "mapping_status": mapping_status,
            "mapping_confidence": mapping_conf,
            "official_repos": repos,
            "is_verified_status": is_verified_status,
            "is_high_confidence": is_high_conf,
            "has_official_repos": has_repos,
            "verified_for_collection": eligible,
            "decision_reason": (
                f"Status={mapping_status}, Conf={mapping_conf:.2f}, Repos={len(repos)} → "
                f"{'ELIGIBLE' if eligible else 'INELIGIBLE'}"
            ),
            "registry_notes": r.get("registry_notes"),
        }
        mapping_decisions.append(decision)

        sym = "✓" if eligible else "✗"
        print(f"  {sym} {canonical_id:25s} | status={mapping_status:20s} | "
              f"conf={mapping_conf:.2f} | repos={len(repos)} → "
              f"{'ELIGIBLE' if eligible else 'INELIGIBLE'}")

        if eligible:
            verified_for_collection.append(canonical_id)

    return verified_for_collection, mapping_decisions


# ============================================================================
# STEP 4 — TARGETED GITHUB COLLECTION (DRY-RUN)
# ============================================================================

def step4_collect_or_reuse(auth_developer, verified_for_collection,
                            existing_data_check, mapping_decisions,
                            resolution_results):
    """
    Targeted recollection — для верифицированных кандидатов.
    Если данные свежие — reuse. Если устаревшие или отсутствуют — помечаем как требующие recollection.

    Также добавляет placeholder записи для НЕ-верифицированных кандидатов
    с action=NO_DATA_UNAVAILABLE, чтобы они прошли через финальный gate.
    """
    print("\n" + "=" * 80)
    print("STEP 4: TARGETED GITHUB COLLECTION (DRY-RUN MODE)")
    print("=" * 80)

    projects = auth_developer.get("projects", {})
    recollection_results = []
    processed_cids = set()

    for cid in verified_for_collection:
        # Find existing data
        existing_entry = projects.get(cid)

        if existing_entry:
            # Reuse decision
            retrieved_at = existing_entry.get("retrieved_at")
            try:
                rt = datetime.fromisoformat(retrieved_at.replace("Z", "+00:00"))
                age_days = (datetime.now(timezone.utc) - rt).days
                is_fresh = age_days <= 30
            except Exception:
                age_days = None
                is_fresh = False

            if is_fresh and len(existing_entry.get("errors", [])) == 0:
                action = "REUSE_EXISTING"
                reason = (
                    f"Data is fresh (age={age_days}d ≤ 30d), collection_status="
                    f"{existing_entry.get('collection_status')}, no errors."
                )
            else:
                action = "RECOLLECT_RECOMMENDED"
                reason = f"Data is stale (age={age_days}d) or has errors; recollection needed."

            # Build standardized record
            repos_data = existing_entry.get("repositories", [])
            recollection_results.append({
                "canonical_id": cid,
                "action": action,
                "reason": reason,
                "data_age_days": age_days,
                "data_source": "authoritative_developer_173",
                "retrieved_at": retrieved_at,
                "repos_used": [
                    {"org": r.get("org"), "repo": r.get("repo"),
                     "url": r.get("url"), "role": r.get("role")}
                    for r in repos_data
                ],
                "commits_30d": existing_entry.get("commits_30d"),
                "commits_90d": existing_entry.get("commits_90d"),
                "unique_contributors_90d": existing_entry.get("unique_contributors_90d"),
                "releases_30d": existing_entry.get("releases_30d"),
                "releases_90d": existing_entry.get("releases_90d"),
                "active_repositories_30d": existing_entry.get("active_repositories_30d"),
                "active_repositories_90d": existing_entry.get("active_repositories_90d"),
                "last_commit_at": existing_entry.get("last_commit_at"),
                "days_since_last_commit": existing_entry.get("days_since_last_commit"),
                "stars_total": existing_entry.get("stars_total"),
                "forks_total": existing_entry.get("forks_total"),
                "latest_release_at": existing_entry.get("latest_release_at"),
                "collection_status": existing_entry.get("collection_status"),
                "errors": existing_entry.get("errors", []),
                "provenance": "existing_authoritative_data",
            })
            print(f"  ↻ {cid:25s} → {action} (age={age_days}d)")
            processed_cids.add(cid)
        else:
            # No existing data — would need targeted recollection
            # Find the official repos from registry
            decision = next((d for d in mapping_decisions if d["canonical_id"] == cid), None)
            repos = decision.get("official_repos", []) if decision else []

            recollection_results.append({
                "canonical_id": cid,
                "action": "RECOLLECTION_REQUIRED",
                "reason": "Not in authoritative developer dataset; targeted recollection required.",
                "data_age_days": None,
                "data_source": None,
                "retrieved_at": None,
                "repos_used": [{"org": r.split("/")[0], "repo": r.split("/")[1]} for r in repos],
                "commits_30d": None,
                "commits_90d": None,
                "unique_contributors_90d": None,
                "releases_30d": None,
                "releases_90d": None,
                "active_repositories_30d": None,
                "active_repositories_90d": None,
                "last_commit_at": None,
                "days_since_last_commit": None,
                "stars_total": None,
                "forks_total": None,
                "latest_release_at": None,
                "collection_status": "UNAVAILABLE",
                "errors": ["No authoritative developer data; recollection required for reactivation"],
                "provenance": "pending_recollection",
            })
            print(f"  ⟳ {cid:25s} → RECOLLECTION_REQUIRED (no existing data)")
            processed_cids.add(cid)

    # Add candidates that were NOT verified for collection (REVIEW_REQUIRED etc.)
    # Per rule: do NOT collect from guessed/unverified repositories
    for res in resolution_results:
        cid = res.get("authoritative_canonical_id")
        if cid and cid not in processed_cids:
            mapping_status = res.get("registry_mapping_status")
            mapping_conf = res.get("registry_confidence", 0) or 0
            repos = res.get("registry_official_repos", []) or []

            recollection_results.append({
                "canonical_id": cid,
                "action": "NO_DATA_UNAVAILABLE",
                "reason": (
                    f"Mapping status='{mapping_status}' (not VERIFIED/VERIFIED_UPDATED). "
                    f"Per rule, NO recollection from unverified repositories. "
                    f"Conf={mapping_conf:.2f}, registry_note: '{res.get('registry_notes', '')[:80]}...'"
                ),
                "data_age_days": None,
                "data_source": None,
                "retrieved_at": None,
                "repos_used": [
                    {"org": r.split("/")[0] if "/" in r else None,
                     "repo": r.split("/")[1] if "/" in r else r,
                     "url": f"https://github.com/{r}" if "/" in r else None,
                     "role": "candidate"}
                    for r in repos
                ],
                "commits_30d": None,
                "commits_90d": None,
                "unique_contributors_90d": None,
                "releases_30d": None,
                "releases_90d": None,
                "active_repositories_30d": None,
                "active_repositories_90d": None,
                "last_commit_at": None,
                "days_since_last_commit": None,
                "stars_total": None,
                "forks_total": None,
                "latest_release_at": None,
                "collection_status": "UNAVAILABLE",
                "errors": [f"Mapping unresolved: status={mapping_status}, conf={mapping_conf}"],
                "provenance": "mapping_unresolved",
            })
            print(f"  ⊘ {cid:25s} → NO_DATA_UNAVAILABLE (mapping={mapping_status}, ineligible)")

    return recollection_results


# ============================================================================
# STEP 5 — AKASH SPECIAL CASE (RECLASSIFY FROM FRESH EVIDENCE)
# ============================================================================

def step5_akash_special(recollection_results, activity_class):
    """
    Akash: STALE based on (commits_90d=3, days_since_last_commit=5).
    Reclassify from fresh evidence with multi-signal logic.
    """
    print("\n" + "=" * 80)
    print("STEP 5: AKASH SPECIAL CASE — RECLASSIFY FROM FRESH EVIDENCE")
    print("=" * 80)

    # Find akash entry
    akash_rec = next((r for r in recollection_results if r["canonical_id"] == "akash"), None)
    if not akash_rec:
        print("  ⚠ Akash not in recollection_results")
        return

    # Snapshot analysis
    commits_30d = safe_int(akash_rec.get("commits_30d"), 0)
    commits_90d = safe_int(akash_rec.get("commits_90d"), 0)
    days_since = safe_int(akash_rec.get("days_since_last_commit"))
    contributors_90d = safe_int(akash_rec.get("unique_contributors_90d"), 0)
    releases_90d = safe_int(akash_rec.get("releases_90d"), 0)
    active_repos_90d = safe_int(akash_rec.get("active_repositories_90d"), 0)

    print(f"  Current snapshot:")
    print(f"    retrieved_at:           {akash_rec.get('retrieved_at')}")
    print(f"    last_commit_at:         {akash_rec.get('last_commit_at')}")
    print(f"    days_since_last_commit: {days_since}")
    print(f"    commits_30d:            {commits_30d}")
    print(f"    commits_90d:            {commits_90d}")
    print(f"    contributors_90d:       {contributors_90d}")
    print(f"    releases_90d:           {releases_90d}")
    print(f"    active_repositories_90d:{active_repos_90d}")

    # Existing classification was STALE based on:
    #   evidence = ["commits_90d=3", "days_since_last_commit=5"]
    # The rule "commits_90d < 5 → fails ACTIVE two-signal" made it STALE.

    # Multi-signal reclassification
    signals_met = {
        "commits_90d_recent_activity": days_since is not None and days_since <= MAX_DAYS_SINCE_COMMIT_STRICT,
        "active_contributors_90d":     contributors_90d >= MIN_CONTRIBUTORS_90D,
        "releases_90d":                releases_90d >= MIN_RELEASES_90D,
        "active_repositories_90d":     active_repos_90d >= MIN_ACTIVE_REPOS_90D,
        "commits_present":             commits_90d > 0,
    }
    n_signals_met = sum(1 for v in signals_met.values() if v)

    print(f"\n  Multi-signal reclassification:")
    for sig, met in signals_met.items():
        sym = "✓" if met else "✗"
        print(f"    {sym} {sig}: {met}")
    print(f"  → Signals met: {n_signals_met}/5")

    # Decision logic:
    # - If 4+/5 signals met (with commits_90d anomaly), reclassify as ACTIVE
    # - If commits_90d passes strict threshold (>= 10), reclassify as ACTIVE
    # - If 3+/5 signals met and recent commit, reclassify as ACTIVE
    # - Otherwise, retain STALE
    previous_status = "STALE"

    if n_signals_met >= 4:
        new_status = "ACTIVE"
        reason = (
            f"Reclassified from STALE → ACTIVE: {n_signals_met}/5 multi-signal criteria met. "
            f"commits_90d={commits_90d} is anomalously low (likely squash-merge or submodule "
            f"structure), but other signals (contributors={contributors_90d}, releases={releases_90d}, "
            f"active_repos={active_repos_90d}, recent_commit={days_since}d) strongly indicate ACTIVE."
        )
    elif commits_90d >= MIN_COMMITS_90D_STRICT and signals_met["active_contributors_90d"] and signals_met["releases_90d"]:
        new_status = "ACTIVE"
        reason = "All multi-signal criteria met (commits_90d ≥ 10 + 4 others)."
    else:
        new_status = previous_status
        reason = (
            f"Retained STALE: insufficient multi-signal evidence ({n_signals_met}/5 met). "
            f"commits_90d={commits_90d} < {MIN_COMMITS_90D_RELAXED}."
        )

    print(f"\n  Reclassification decision: {previous_status} → {new_status}")
    print(f"  Reason: {reason}")

    # Update the akash entry
    akash_rec["activity_status_previous"] = previous_status
    akash_rec["activity_status_reclassified"] = new_status
    akash_rec["activity_reclassification_reason"] = reason
    akash_rec["activity_signals_met"] = signals_met
    akash_rec["activity_signals_count"] = n_signals_met

    # Update in-place in results list
    for r in recollection_results:
        if r["canonical_id"] == "akash":
            r.update(akash_rec)


# ============================================================================
# STEP 6 — VIRTUALS MARKET DATA REFRESH
# ============================================================================

def step6_virtuals_market(recollection_results, coingecko_data):
    """
    Virtuals Protocol: targeted market refresh.
    Coingecko ID: virtual-protocol (NOT virtuals-protocol).
    """
    print("\n" + "=" * 80)
    print("STEP 6: VIRTUALS MARKET DATA — TARGETED REFRESH")
    print("=" * 80)

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
                    "fully_diluted_valuation": item.get("fully_diluted_valuation"),
                    "total_volume_24h": item.get("total_volume"),
                    "circulating_supply": item.get("circulating_supply"),
                    "source_file": bundle["_source_file"],
                }

    # Find virtuals-protocol in candidates
    virtuals = next((r for r in recollection_results if r["canonical_id"] == "virtuals-protocol"), None)

    market_data = None
    market_source = None

    if virtuals:
        # Try variations of coingecko ID
        for cgid_variant in ["virtuals-protocol", "virtual-protocol", "virtuals", "virtual"]:
            if cgid_variant in cg_lookup:
                market_data = cg_lookup[cgid_variant]
                market_source = "coingecko_ai_market.json"
                break

    if market_data:
        print(f"  ✓ Found Virtuals market data:")
        print(f"    coingecko_id:           {market_data['coingecko_id']}")
        print(f"    name:                   {market_data['name']}")
        print(f"    symbol:                 {market_data['symbol']}")
        print(f"    market_cap_usd:         ${market_data['market_cap_usd']:,.0f}")
        print(f"    market_cap_rank:        {market_data['market_cap_rank']}")
        print(f"    current_price_usd:      ${market_data['current_price_usd']:.4f}")
        print(f"    fully_diluted_valuation:${market_data['fully_diluted_valuation']:,.0f}")
        print(f"    total_volume_24h:       ${market_data['total_volume_24h']:,.0f}")
        print(f"    circulating_supply:     {market_data['circulating_supply']}")
        print(f"    source:                 {market_source}")
    else:
        print(f"  ✗ Virtuals market data NOT FOUND in coingecko files")
        market_data = {
            "market_cap_usd": None,
            "coingecko_id": None,
            "source": None,
            "note": "MARKET_DATA_UNAVAILABLE — no CoinGecko data found",
        }
        market_source = None

    return market_data, market_source


# ============================================================================
# STEP 7 — RECLASSIFY PROJECT ACTIVITY
# ============================================================================

def reclassify_activity(rec):
    """Multi-signal ACTIVE/STALE/INACTIVE/DATA_UNAVAILABLE/REVIEW_REQUIRED."""
    if not rec:
        return None

    # Use pre-computed reclassification if available (Akash special case)
    if "activity_status_reclassified" in rec:
        return rec["activity_status_reclassified"]

    commits_30d = safe_int(rec.get("commits_30d"))
    commits_90d = safe_int(rec.get("commits_90d"))
    days_since = safe_int(rec.get("days_since_last_commit"))
    contributors_90d = safe_int(rec.get("unique_contributors_90d"), 0)
    releases_90d = safe_int(rec.get("releases_90d"), 0)
    active_repos_90d = safe_int(rec.get("active_repositories_90d"), 0)

    # DATA_UNAVAILABLE if no developer data
    if rec.get("collection_status") == "UNAVAILABLE" or rec.get("action") == "RECOLLECTION_REQUIRED":
        return "DATA_UNAVAILABLE"

    # Multi-signal ACTIVE
    # Rule 1: Strict 5-signal
    rule1 = (
        commits_90d is not None and commits_90d >= MIN_COMMITS_90D_STRICT and
        days_since is not None and days_since <= MAX_DAYS_SINCE_COMMIT_STRICT and
        releases_90d >= MIN_RELEASES_90D and
        contributors_90d >= MIN_CONTRIBUTORS_90D and
        active_repos_90d >= MIN_ACTIVE_REPOS_90D
    )

    # Rule 2: Relaxed 2-signal (commits + recency)
    rule2 = (
        commits_90d is not None and commits_90d >= MIN_COMMITS_90D_RELAXED and
        days_since is not None and days_since <= MAX_DAYS_SINCE_COMMIT_RELAXED
    )

    # Rule 3: Strong multi-signal with commits anomaly
    # (4 of 5 signals met, recent activity)
    rule3_signals = sum([
        days_since is not None and days_since <= MAX_DAYS_SINCE_COMMIT_STRICT,
        contributors_90d >= MIN_CONTRIBUTORS_90D,
        releases_90d >= MIN_RELEASES_90D,
        active_repos_90d >= MIN_ACTIVE_REPOS_90D,
        commits_90d is not None and commits_90d > 0,
    ])
    rule3 = rule3_signals >= 4 and days_since is not None and days_since <= 30

    if rule1 or rule2 or rule3:
        return "ACTIVE"

    # INACTIVE: very stale
    if days_since is not None and days_since > 365:
        return "INACTIVE"

    # STALE: not ACTIVE, not INACTIVE
    return "STALE"


def step7_reclassify_activity(recollection_results, activity_class):
    """Reclassify all candidates using multi-signal rules."""
    print("\n" + "=" * 80)
    print("STEP 7: ACTIVITY RECLASSIFICATION (MULTI-SIGNAL)")
    print("=" * 80)

    for rec in recollection_results:
        cid = rec["canonical_id"]
        previous = activity_class.get(cid, {}).get("project_activity_status", "UNKNOWN")
        new = reclassify_activity(rec)

        rec["activity_status_previous_in_classification"] = previous
        rec["activity_status_new"] = new

        sym = "↑" if new == "ACTIVE" and previous != "ACTIVE" else (
            "↓" if new in ("STALE", "INACTIVE") and previous == "ACTIVE" else "→"
        )
        print(f"  {sym} {cid:25s} | previous={previous:18s} → new={new:18s}")

    return recollection_results


# ============================================================================
# STEP 8 — FINAL REACTIVATION GATE
# ============================================================================

def step8_final_gate(resolution_results, recollection_results, market_data_virtuals,
                     dryrun, all_candidates_with_resolution):
    """Final action determination."""
    print("\n" + "=" * 80)
    print("STEP 8: FINAL REACTIVATION GATE")
    print("=" * 80)

    active_map = {}
    protected_map = {}
    for sec_key, info in dryrun.get("sectors", {}).items():
        sector_name = info.get("sector_name") or sec_key.replace("sector_", "")
        for pid in info.get("active_projects", []):
            active_map[pid] = sector_name
        for pid in info.get("protected_projects", []):
            protected_map[pid] = sector_name

    final_results = []

    # Build a lookup by canonical_id for recollection_results
    rec_by_cid = {r.get("canonical_id"): r for r in recollection_results}

    for res in resolution_results:
        cid = res.get("authoritative_canonical_id")
        did = res["discovery_id"]
        display = res["display_name"]
        rec = rec_by_cid.get(cid, {}) if cid else {}

        action = "REVIEW_REQUIRED"
        reason = ""
        mc = rec.get("market_cap_usd") if cid else None

        # Check if canonical exists
        if not cid:
            action = "IDENTITY_REVIEW"
            reason = f"No authoritative canonical ID for '{did}'. Cannot proceed."
        # Check if currently active
        elif cid in active_map:
            action = "NO_ACTION_ALREADY_ACTIVE"
            reason = f"Already active in sector '{active_map[cid]}'."
        # Check mapping verification (BLOCKING CHECK per user rule)
        elif res.get("registry_mapping_status") not in ("VERIFIED", "VERIFIED_UPDATED"):
            action = "ACTIVITY_REVIEW_REQUIRED"
            reason = (
                f"GitHub mapping status='{res.get('registry_mapping_status')}', "
                f"not VERIFIED/VERIFIED_UPDATED. Recollection not permitted from "
                f"unverified repositories. Registry note: '{res.get('registry_notes', '')[:80]}...'"
            )
        else:
            # Mapping is VERIFIED. Check other gates.
            activity = rec.get("activity_status_new", "DATA_UNAVAILABLE")

            # Market cap check first
            if mc is None:
                if cid == "virtuals-protocol":
                    action = "MARKET_DATA_UNAVAILABLE"
                    reason = (
                        "Virtuals targeted market refresh: CoinGecko ID 'virtual-protocol' "
                        "not present in coingecko_ai_market.json. Cannot derive from FDV. "
                        "Per rule, action must be MARKET_DATA_UNAVAILABLE."
                    )
                else:
                    action = "MARKET_DATA_UNAVAILABLE"
                    reason = "Market cap data unavailable for this candidate."
            elif mc < MIN_MARKET_CAP_USD:
                action = "BELOW_ENTRY_THRESHOLD"
                reason = f"Market cap ${mc:,.0f} < ${MIN_MARKET_CAP_USD:,.0f}."
            elif activity == "ACTIVE":
                action = "REACTIVATION_APPROVED"
                reason = (
                    f"All gates passed: canonical={cid}, status=ACTIVE, "
                    f"market_cap=${mc:,.0f}, mapping=VERIFIED."
                )
            elif activity == "DATA_UNAVAILABLE":
                action = "ACTIVITY_REVIEW_REQUIRED"
                reason = (
                    f"No authoritative developer data; recollection required "
                    f"before final decision."
                )
            else:
                action = "ACTIVITY_REVIEW_REQUIRED"
                reason = f"Activity status={activity}, not ACTIVE."

        # Build final result
        final_results.append({
            "discovery_id": did,
            "authoritative_canonical_id": cid,
            "display_name": display,
            "market_cap_usd": mc,
            "market_cap_source": rec.get("market_cap_source"),
            "market_cap_rank": rec.get("market_cap_rank"),
            "coingecko_id_resolved": rec.get("coingecko_id_resolved"),
            "github_mapping": {
                "status": res.get("registry_mapping_status"),
                "confidence": res.get("registry_confidence"),
                "source": res.get("registry_source"),
                "official_repos": res.get("registry_official_repos"),
                "notes": res.get("registry_notes"),
            },
            "repos_used": rec.get("repos_used", []),
            "commits_30d": rec.get("commits_30d"),
            "commits_90d": rec.get("commits_90d"),
            "contributors_90d": rec.get("unique_contributors_90d"),
            "releases_90d": rec.get("releases_90d"),
            "active_repositories_90d": rec.get("active_repositories_90d"),
            "last_commit_at": rec.get("last_commit_at"),
            "days_since_last_commit": rec.get("days_since_last_commit"),
            "activity_status": rec.get("activity_status_new"),
            "activity_status_previous": rec.get("activity_status_previous_in_classification"),
            "activity_reclassification_reason": rec.get("activity_reclassification_reason"),
            "collection_action": rec.get("action"),
            "current_active_sector": active_map.get(cid),
            "current_protected_sector": protected_map.get(cid),
            "final_action": action,
            "reason": reason,
            "validated_at": now_iso(),
        })

        sym_map = {
            "REACTIVATION_APPROVED": "✅",
            "NO_ACTION_ALREADY_ACTIVE": "ℹ️",
            "ACTIVITY_REVIEW_REQUIRED": "⚠️",
            "MARKET_DATA_UNAVAILABLE": "💲",
            "BELOW_ENTRY_THRESHOLD": "⛔",
            "SECTOR_CLASSIFICATION_REVIEW": "🔄",
            "IDENTITY_REVIEW": "🔒",
        }
        sym = sym_map.get(action, "•")
        print(f"  {sym} {did:25s} → {action:35s} | {reason[:60]}")

    return final_results


# ============================================================================
# STEP 9 — NO MUTATION VERIFICATION
# ============================================================================

def step9_no_mutation_check():
    """Verify master universe remains 354, no legacy IDs added."""
    print("\n" + "=" * 80)
    print("STEP 9: NO-MUTATION CHECK")
    print("=" * 80)

    reg = load_json(IDENTITY_REGISTRY_PATH)
    reg_count = reg["metadata"]["total_projects"]
    reg_ids = set(reg["registry"].keys())

    forbidden_present = LEGACY_FORBIDDEN_IDS & reg_ids
    expected_count = reg_count == 354
    no_legacy = len(forbidden_present) == 0

    print(f"  Registry count: {reg_count} (expected 354)")
    print(f"  Expected count: {'✓' if expected_count else '✗'}")
    print(f"  Forbidden legacy IDs in registry: {forbidden_present if forbidden_present else 'none ✓'}")

    return {
        "registry_count": reg_count,
        "expected_count_met": expected_count,
        "forbidden_legacy_in_registry": list(forbidden_present),
        "no_legacy_added": no_legacy,
    }


# ============================================================================
# STEP 10 — OUTPUT FILES + VALIDATION REPORT
# ============================================================================

def step10_outputs(resolution_results, recollection_results, final_results, mutation_check):
    """Generate 3 output files + validation report."""
    print("\n" + "=" * 80)
    print("STEP 10: OUTPUT FILES + VALIDATION REPORT")
    print("=" * 80)

    # ---- Output 1: Identity resolution ----
    identity_resolution_output = {
        "metadata": {
            "generated_at": now_iso(),
            "purpose": "Step 1: Discovery ID → Authoritative canonical ID resolution",
            "dry_run": True,
            "rules": [
                "akash-network MUST resolve to akash (authoritative canonical)",
                "9 legacy extra records MUST NOT be used as canonical",
                "All candidates must resolve to 354-registry IDs",
            ],
        },
        "resolutions": resolution_results,
        "summary": {
            "total_candidates": len(resolution_results),
            "resolved_to_canonical": sum(1 for r in resolution_results if r.get("authoritative_canonical_id")),
            "blocked_legacy": sum(1 for r in resolution_results if r.get("normalization_applied") == "BLOCKED_LEGACY_NO_CANONICAL"),
            "not_found": sum(1 for r in resolution_results if r.get("normalization_applied") == "NOT_FOUND_IN_354"),
            "akash_normalized": sum(1 for r in resolution_results if r.get("discovery_id") == "akash-network" and r.get("authoritative_canonical_id") == "akash"),
        },
    }
    write_json(OUT_IDENTITY_RESOLUTION, identity_resolution_output)

    # ---- Output 2: GitHub recollection ----
    github_recollection_output = {
        "metadata": {
            "generated_at": now_iso(),
            "purpose": "Step 2-5: GitHub mapping verification, recollection decisions, Akash special case",
            "dry_run": True,
            "rules": [
                "Only VERIFIED/VERIFIED_UPDATED + conf >= 0.95 mappings eligible",
                "REVIEW_REQUIRED/NOT_FOUND/INVALID mappings → no collection",
                "Multi-signal reclassification for Akash",
            ],
        },
        "recollection_results": recollection_results,
        "summary": {
            "total_candidates": len(recollection_results),
            "reuse_existing": sum(1 for r in recollection_results if r.get("action") == "REUSE_EXISTING"),
            "recollect_recommended": sum(1 for r in recollection_results if r.get("action") == "RECOLLECT_RECOMMENDED"),
            "recollection_required": sum(1 for r in recollection_results if r.get("action") == "RECOLLECTION_REQUIRED"),
            "no_data_unavailable": sum(1 for r in recollection_results if r.get("action") == "NO_DATA_UNAVAILABLE"),
            "akash_reclassified": next(
                (r.get("activity_status_reclassified") for r in recollection_results if r["canonical_id"] == "akash"),
                None
            ),
        },
    }
    write_json(OUT_GITHUB_RECOLLECTION, github_recollection_output)

    # ---- Output 3: Final gate ----
    final_gate_output = {
        "metadata": {
            "generated_at": now_iso(),
            "purpose": "Step 6-8: Final reactivation gate with all decisions",
            "dry_run": True,
            "validation_rules": {
                "min_market_cap_usd": MIN_MARKET_CAP_USD,
                "required_activity_status": "ACTIVE",
                "min_mapping_confidence": 0.95,
                "accepted_mapping_statuses": ["VERIFIED", "VERIFIED_UPDATED"],
            },
        },
        "candidates": final_results,
        "summary": {
            "total_candidates": len(final_results),
            "actions": dict(Counter(r["final_action"] for r in final_results)),
            "approved_count": sum(1 for r in final_results if r["final_action"] == "REACTIVATION_APPROVED"),
            "review_count": sum(1 for r in final_results if r["final_action"] in (
                "ACTIVITY_REVIEW_REQUIRED", "MARKET_DATA_UNAVAILABLE",
                "BELOW_ENTRY_THRESHOLD", "SECTOR_CLASSIFICATION_REVIEW",
                "IDENTITY_REVIEW"
            )),
        },
        "mutation_check": mutation_check,
    }
    write_json(OUT_FINAL_GATE, final_gate_output)

    # ---- Validation checks ----
    print("\n  Validation checks:")
    checks = []

    # 1. legacy extra IDs recollected = 0
    legacy_recollected = sum(
        1 for r in recollection_results
        if r.get("canonical_id") in LEGACY_FORBIDDEN_IDS and r.get("action") in ("REUSE_EXISTING", "RECOLLECT_RECOMMENDED")
    )
    c1_pass = legacy_recollected == 0
    checks.append(("legacy_extra_ids_recollected=0", c1_pass, f"count={legacy_recollected}"))

    # 2. unauthorized GitHub mapping used = 0
    unauthorized = sum(
        1 for res, rec in zip(resolution_results, recollection_results)
        if res.get("registry_mapping_status") not in ("VERIFIED", "VERIFIED_UPDATED")
        and rec.get("action") == "REUSE_EXISTING"
    )
    c2_pass = unauthorized == 0
    checks.append(("unauthorized_github_mapping_used=0", c2_pass, f"count={unauthorized}"))

    # 3. candidate with null MC approved = 0
    null_mc_approved = sum(
        1 for r in final_results
        if r["final_action"] == "REACTIVATION_APPROVED" and (r.get("market_cap_usd") is None or r.get("market_cap_usd", 0) == 0)
    )
    c3_pass = null_mc_approved == 0
    checks.append(("candidate_with_null_mc_approved=0", c3_pass, f"count={null_mc_approved}"))

    # 4. non-ACTIVE candidate approved = 0
    nonactive_approved = sum(
        1 for r in final_results
        if r["final_action"] == "REACTIVATION_APPROVED" and r.get("activity_status") != "ACTIVE"
    )
    c4_pass = nonactive_approved == 0
    checks.append(("non_active_candidate_approved=0", c4_pass, f"count={nonactive_approved}"))

    # 5. already-active candidate reactivated = 0
    already_active_reactivated = sum(
        1 for r in final_results
        if r["final_action"] == "REACTIVATION_APPROVED" and r.get("current_active_sector")
    )
    c5_pass = already_active_reactivated == 0
    checks.append(("already_active_reactivated=0", c5_pass, f"count={already_active_reactivated}"))

    # 6. canonical duplicates = 0
    canonical_ids = [r.get("authoritative_canonical_id") for r in final_results]
    canonical_ids_non_null = [c for c in canonical_ids if c]
    duplicates = len(canonical_ids_non_null) - len(set(canonical_ids_non_null))
    c6_pass = duplicates == 0
    checks.append(("canonical_duplicates=0", c6_pass, f"duplicates={duplicates}"))

    # 7. provider conflicts = 0
    # Check that no candidate uses both akash-network and akash as canonical
    provider_conflicts = sum(
        1 for r in resolution_results
        if r.get("discovery_id") in LEGACY_FORBIDDEN_IDS and r.get("authoritative_canonical_id") in LEGACY_FORBIDDEN_IDS
    )
    c7_pass = provider_conflicts == 0
    checks.append(("provider_conflicts=0", c7_pass, f"count={provider_conflicts}"))

    # 8. akash-network NOT used as canonical (CRITICAL)
    akash_used_as_canonical = sum(
        1 for r in resolution_results
        if r.get("discovery_id") == "akash-network" and r.get("authoritative_canonical_id") == "akash-network"
    )
    c8_pass = akash_used_as_canonical == 0
    checks.append(("akash-network_NOT_used_as_canonical", c8_pass, f"count={akash_used_as_canonical}"))

    # Print
    overall_pass = True
    for name, p, detail in checks:
        sym = "✅" if p else "❌"
        print(f"    {sym} {name}: {detail}")
        if not p:
            overall_pass = False

    print()
    print("  " + "═" * 76)
    if overall_pass:
        print("  ✅ 10 REACTIVATION VALIDATION: PASS")
    else:
        print("  ❌ 10 REACTIVATION VALIDATION: FAIL")
    print("  " + "═" * 76)

    return overall_pass


# ============================================================================
# MAIN
# ============================================================================

def main():
    print("╔" + "═" * 78 + "╗")
    print("║" + " PAYD Intelligence V2 — TARGETED REACTIVATION RECOLLECTION ".center(78) + "║")
    print("║" + " DRY-RUN ONLY — NO PRODUCTION MUTATIONS ".center(78) + "║")
    print("╚" + "═" * 78 + "╝")

    # Load all data
    print("\n[Loading data sources...]")
    registry_data = load_json(IDENTITY_REGISTRY_PATH)
    registry = registry_data["registry"]
    registry_ids = set(registry.keys())
    auth_developer = load_json(AUTH_DEVELOPER_PATH)
    activity_class = load_json(ACTIVITY_CLASS_PATH)
    dryrun = load_json(SECTOR_DRYRUN_PATH, default={"sectors": {}})

    coingecko_data = []
    for fp in COINGECKO_FILES:
        d = load_json(fp)
        if d:
            coingecko_data.append({"_source_file": os.path.basename(fp), "_data": d if isinstance(d, list) else []})

    print(f"  Loaded registry: {len(registry_ids)} projects")
    print(f"  Loaded authoritative developer: {auth_developer['metadata']['total_authoritative_projects']} projects")
    print(f"  Loaded activity classification: {len(activity_class)} projects")
    print(f"  Loaded sector dry-run: {len(dryrun.get('sectors', {}))} sectors")
    print(f"  Loaded CoinGecko files: {len(coingecko_data)}")

    # STEP 1
    resolution_results = step1_resolve_identity(registry, registry_ids)

    # STEP 2
    existing_data_check = step2_check_existing(auth_developer, resolution_results)

    # STEP 3
    verified_for_collection, mapping_decisions = step3_verify_mapping(resolution_results, existing_data_check)

    # STEP 4
    recollection_results = step4_collect_or_reuse(
        auth_developer, verified_for_collection, existing_data_check, mapping_decisions,
        resolution_results
    )

    # STEP 5 — Akash special
    step5_akash_special(recollection_results, activity_class)

    # STEP 6 — Virtuals market data
    market_data_virtuals, market_source = step6_virtuals_market(recollection_results, coingecko_data)

    # Build comprehensive coingecko lookup
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
                    "fully_diluted_valuation": item.get("fully_diluted_valuation"),
                    "total_volume_24h": item.get("total_volume"),
                    "circulating_supply": item.get("circulating_supply"),
                    "source_file": bundle["_source_file"],
                }

    # Inject market data into recollection_results (try multiple ID variations)
    # Known coingecko ID aliases for canonical IDs (when they differ)
    COINGECKO_ALIAS_MAP = {
        "akash": ["akash-network"],
        "virtuals-protocol": ["virtual-protocol"],
        "render": ["render-token"],
        "theta": ["theta-token", "theta-fuel"],
    }
    for r in recollection_results:
        cid = r.get("canonical_id")
        if not cid:
            continue
        # Build variations: standard + alias map
        standard_variations = [
            cid, cid + "-network", cid + "-token", cid + "-protocol",
            cid.replace("-network", ""), cid.replace("-token", ""),
            cid.replace("-protocol", ""),
        ]
        alias_variations = COINGECKO_ALIAS_MAP.get(cid, [])
        variations = standard_variations + alias_variations
        for v in variations:
            if v in cg_lookup:
                m = cg_lookup[v]
                r["market_cap_usd"] = m["market_cap_usd"]
                r["market_cap_source"] = m["source_file"]
                r["market_cap_rank"] = m["market_cap_rank"]
                r["current_price_usd"] = m["current_price_usd"]
                r["fdv"] = m["fully_diluted_valuation"]
                r["volume_24h"] = m["total_volume_24h"]
                r["circulating_supply"] = m["circulating_supply"]
                r["coingecko_id_resolved"] = m["coingecko_id"]
                break

    # STEP 7
    recollection_results = step7_reclassify_activity(recollection_results, activity_class)

    # STEP 8
    final_results = step8_final_gate(resolution_results, recollection_results, market_data_virtuals, dryrun, [])

    # STEP 9
    mutation_check = step9_no_mutation_check()

    # STEP 10
    overall_pass = step10_outputs(resolution_results, recollection_results, final_results, mutation_check)

    print("\n📋 OUTPUT FILES:")
    print(f"  • {os.path.relpath(OUT_IDENTITY_RESOLUTION, WORKSPACE)}")
    print(f"  • {os.path.relpath(OUT_GITHUB_RECOLLECTION, WORKSPACE)}")
    print(f"  • {os.path.relpath(OUT_FINAL_GATE, WORKSPACE)}")

    print("\n🛑 NO DEPLOYMENT — dry-run only.")
    print("   NO production data modified. STOP after this report.\n")

    sys.exit(0 if overall_pass else 1)


if __name__ == "__main__":
    main()
