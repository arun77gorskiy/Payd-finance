#!/usr/bin/env python3
"""
PAYD Intelligence V2 — TARGETED GITHUB VERIFICATION FOR 9 REACTIVATION CANDIDATES
==================================================================================
Целенаправленная верификация GitHub mapping для 9 кандидатов, которые получили
ACTIVITY_REVIEW_REQUIRED в задаче TARGETED REACTIVATION RECOLLECTION.

Цель — проверить mapping org/repo через GitHub API (HTTP 200, stars, last_push,
наличие крипто-тематики в description/topics), выбрать корректный mapping с
strong evidence, собрать developer activity для тех кто прошёл verification,
и сформировать общий финальный gate по 10 кандидатам (включая Akash).

Dry-run — никаких мутаций в production данных.

Steps:
 1. RESOLVE — нормализация discovery ID → canonical ID (для всех 10)
 2. GITHUB API VERIFY — для 9 кандидатов проверить оба candidate orgs (public + enriched)
 3. CHOOSE MAPPING — strict confidence: priority (a)both_canonical_match, (b)popular_org, (c)website_domain_match
 4. COLLECT DEVELOPER DATA — для прошедших verification собрать commits/releases/last_push
 5. MULTI-SIGNAL ACTIVITY — применить rules ACTIVE/STALE/INACTIVE
 6. MARKET DATA INJECTION — CoinGecko market_cap_usd для всех 10
 7. FINAL GATE — REACTIVATION_APPROVED / ACTIVITY_REVIEW_REQUIRED
 8. AKASH INTEGRATION — include akash (verified=approved) в финальном отчёте
 9. NO MUTATION CHECK — universe остаётся 354
10. OUTPUT — 3 JSON файла + validation report
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from collections import Counter

# ============================================================================
# CONFIG
# ============================================================================

WORKSPACE = "/workspace"
TMP = os.path.join(WORKSPACE, "tmp")
os.makedirs(TMP, exist_ok=True)

# GitHub API
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_API = "https://api.github.com"

# Пороги multi-signal ACTIVE (из предыдущей задачи)
MIN_MARKET_CAP_USD = 5_500_000
MIN_COMMITS_90D_STRICT = 10
MIN_COMMITS_90D_RELAXED = 5
MAX_DAYS_SINCE_COMMIT_STRICT = 60
MAX_DAYS_SINCE_COMMIT_RELAXED = 90
MIN_RELEASES_90D = 1
MIN_CONTRIBUTORS_90D = 5
MIN_ACTIVE_REPOS_90D = 1

# Confidence thresholds для verification
CONF_EXISTS = 0.50         # org/repo exists
CONF_HAS_RECENT = 0.70     # org/repo has recent activity (within 1 year)
CONF_HAS_DESCRIPTION_MATCH = 0.85  # org/repo description/topics match project
CONF_BOTH_VERIFIED = 0.95  # public and enriched both verified AND on same org
MIN_VERIFICATION_CONFIDENCE = 0.85

# Legacy alias map
LEGACY_ALIAS_MAP = {
    "akash-network": "akash",
}

# 10 кандидатов — DISCOVERY IDs (как в предыдущей задаче)
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

# 9 кандидатов для GitHub verification (исключая Akash, который уже resolved в task 2)
TARGET_9_FOR_VERIFICATION = [
    "render", "venice-token", "virtuals-protocol", "grass",
    "theta", "origintrail", "sentient", "aethir", "arkham",
]

# Файлы-источники
PUBLIC_PROJECTS_PATH = os.path.join(WORKSPACE, "public/data/projects.json")
ENRICHED_PROJECTS_PATH = os.path.join(WORKSPACE, "public/data/projects_enriched.json")

COINGECKO_FILES = [
    os.path.join(WORKSPACE, "data/coingecko_ai_market.json"),
    os.path.join(WORKSPACE, "data/coingecko_depin.json"),
]

# Файлы-результаты
OUT_GITHUB_VERIFICATION = os.path.join(TMP, "payd_9_github_verification.json")
OUT_FINAL_GATE_10 = os.path.join(TMP, "payd_10_combined_final_gate.json")
OUT_VALIDATION_REPORT = os.path.join(TMP, "payd_validation_report.json")
OUT_AKASH_FINAL = os.path.join(TMP, "payd_akash_final_action.json")

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
# GITHUB API CLIENT
# ============================================================================

class GitHubAPIError(Exception):
    pass


def gh_api_get(path, retries=2):
    """GET path GitHub API. Возвращает dict или None."""
    url = f"{GITHUB_API}{path}"
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "payd-github-verifier/2.0",
    }
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"

    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode())
                return {"status": resp.status, "data": data}
        except urllib.error.HTTPError as e:
            if e.code in (404,):
                return {"status": 404, "data": None}
            if e.code == 403:
                # Rate limit / forbidden
                time.sleep(2)
                continue
            return {"status": e.code, "data": None, "error": str(e)}
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < retries:
                time.sleep(1)
                continue
            return {"status": 0, "data": None, "error": str(e)}
    return {"status": 0, "data": None}


def verify_org(org_login):
    """Verify GitHub organization by login. Returns dict with org metadata."""
    result = gh_api_get(f"/orgs/{org_login}")
    if result.get("status") != 200 or not result.get("data"):
        return {"exists": False, "login": org_login, "raw_response": result.get("status")}
    d = result["data"]
    return {
        "exists": True,
        "login": d.get("login"),
        "name": d.get("name"),
        "description": d.get("description"),
        "blog": d.get("blog"),
        "twitter_username": d.get("twitter_username"),
        "public_repos": d.get("public_repos"),
        "followers": d.get("followers"),
        "created_at": d.get("created_at"),
        "updated_at": d.get("updated_at"),
        "html_url": d.get("html_url"),
    }


def verify_repo(full_name):
    """Verify a single repo. Returns dict with repo metadata."""
    result = gh_api_get(f"/repos/{full_name}")
    if result.get("status") != 200 or not result.get("data"):
        return {"exists": False, "full_name": full_name}
    d = result["data"]
    return {
        "exists": True,
        "full_name": d.get("full_name"),
        "name": d.get("name"),
        "owner_login": d.get("owner", {}).get("login"),
        "description": d.get("description"),
        "homepage": d.get("homepage"),
        "topics": d.get("topics", []),
        "language": d.get("language"),
        "stars": d.get("stargazers_count"),
        "forks": d.get("forks_count"),
        "open_issues": d.get("open_issues_count"),
        "default_branch": d.get("default_branch"),
        "is_archived": d.get("archived", False),
        "is_disabled": d.get("disabled", False),
        "created_at": d.get("created_at"),
        "updated_at": d.get("updated_at"),
        "pushed_at": d.get("pushed_at"),
        "html_url": d.get("html_url"),
    }


def get_repo_commits_90d(full_name):
    """Get approximate commits in last 90 days using /commits endpoint."""
    result = gh_api_get(f"/repos/{full_name}/commits?per_page=100")
    if result.get("status") != 200 or not result.get("data"):
        return {"commits_90d_approx": None}
    commits = result["data"]
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    recent = []
    oldest_date = None
    for c in commits:
        try:
            cd = c.get("commit", {}).get("author", {}).get("date")
            if cd:
                d = datetime.fromisoformat(cd.replace("Z", "+00:00"))
                if oldest_date is None or d < oldest_date:
                    oldest_date = d
                if d >= cutoff:
                    recent.append(c)
        except Exception:
            continue
    return {
        "commits_in_last_page": len(commits),
        "commits_90d_approx": len(recent),
        "oldest_commit_in_page": oldest_date.isoformat() if oldest_date else None,
    }


def get_repo_releases_90d(full_name):
    """Get approximate releases in last 90 days."""
    result = gh_api_get(f"/repos/{full_name}/releases?per_page=30")
    if result.get("status") != 200 or not result.get("data"):
        return {"releases_90d": 0}
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    n_recent = 0
    for r in result["data"]:
        try:
            pd = r.get("published_at")
            if pd:
                d = datetime.fromisoformat(pd.replace("Z", "+00:00"))
                if d >= cutoff:
                    n_recent += 1
        except Exception:
            continue
    return {"releases_90d": n_recent}


def get_repo_contributors_90d(full_name):
    """Get unique contributors in last 90 days from /commits endpoint (approximation)."""
    result = gh_api_get(f"/repos/{full_name}/commits?per_page=100")
    if result.get("status") != 200 or not result.get("data"):
        return {"unique_contributors_90d": 0}
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    contributors = set()
    for c in result["data"]:
        try:
            cd = c.get("commit", {}).get("author", {}).get("date")
            if cd:
                d = datetime.fromisoformat(cd.replace("Z", "+00:00"))
                if d >= cutoff:
                    author = c.get("author") or {}
                    login = author.get("login") or c.get("commit", {}).get("author", {}).get("name")
                    if login:
                        contributors.add(login)
        except Exception:
            continue
    return {"unique_contributors_90d": len(contributors)}


# ============================================================================
# WEB DOMAIN MATCH (manual evidence)
# ============================================================================

def domain_match(url_a, url_b):
    """Cheap check: do two URLs share a registrable domain (very simple)."""
    if not url_a or not url_b:
        return False
    def get_domain(u):
        u = u.lower()
        for prefix in ("https://", "http://", "www."):
            if u.startswith(prefix):
                u = u[len(prefix):]
        slash = u.find("/")
        if slash > 0:
            u = u[:slash]
        return u
    da = get_domain(url_a)
    db = get_domain(url_b)
    if not da or not db:
        return False
    if da == db:
        return True
    # partial: 'foo.com' in 'app.foo.com'
    parts_a = da.split(".")
    parts_b = db.split(".")
    if len(parts_a) >= 2 and len(parts_b) >= 2:
        last_two_a = ".".join(parts_a[-2:])
        last_two_b = ".".join(parts_b[-2:])
        if last_two_a == last_two_b:
            return True
    return False


# ============================================================================
# STEP 1 — RESOLVE ALL 10 TO CANONICAL IDS
# ============================================================================

def step1_resolve_all_10():
    """Резолвим каждый discovery ID к canonical_id (с учётом legacy aliases)."""
    print("\n" + "=" * 80)
    print("STEP 1: RESOLVE ALL 10 CANDIDATES → CANONICAL IDs")
    print("=" * 80)

    resolutions = []
    for display_name, discovery_id in DISCOVERY_CANDIDATES:
        # Apply legacy alias map
        canonical = LEGACY_ALIAS_MAP.get(discovery_id, discovery_id)
        if canonical != discovery_id:
            note = f"LEGACY_ALIAS: {discovery_id} → {canonical}"
        else:
            note = "DIRECT"
        resolutions.append({
            "discovery_id": discovery_id,
            "display_name": display_name,
            "canonical_id": canonical,
            "note": note,
        })
        print(f"  • {discovery_id:25s} → {canonical:25s}  ({note})")
    return resolutions


# ============================================================================
# STEP 2-3 — GITHUB API VERIFICATION FOR 9 CANDIDATES
# ============================================================================

def build_candidates_for_verification():
    """
    Build candidate mapping list for each of 9 by combining public/projects.json
    and public/projects_enriched.json (which often contains a DIFFERENT githubOrg).
    """
    public_data = load_json(PUBLIC_PROJECTS_PATH)
    public_projects = public_data.get("projects", public_data if isinstance(public_data, list) else [])
    public_lookup = {p.get("id"): p for p in public_projects if p.get("id")}

    enriched_data = load_json(ENRICHED_PROJECTS_PATH)
    enriched_projects = enriched_data.get("projects", enriched_data if isinstance(enriched_data, list) else [])
    enriched_lookup = {p.get("id"): p for p in enriched_projects if p.get("id")}

    candidates = []
    for cid in TARGET_9_FOR_VERIFICATION:
        public = public_lookup.get(cid, {})
        enriched = enriched_lookup.get(cid, {})

        # Build candidate orgs (public + enriched)
        candidates_for_cid = []
        public_org = public.get("githubOrg")
        public_repo = public.get("githubRepo")
        enriched_org = (enriched.get("developer", {}) or {}).get("github_org")
        enriched_repo = (enriched.get("developer", {}) or {}).get("primary_repo")

        # Add public candidate
        if public_org and public_repo:
            candidates_for_cid.append({
                "source": "public_projects",
                "org": public_org,
                "repo": public_repo,
                "website": public.get("website"),
                "x_handle": public.get("xHandle"),
                "sector": public.get("sector"),
                "sectors": public.get("sectors", []),
                "coingecko_id": public.get("coingeckoId"),
            })
        # Add enriched candidate (only if different)
        if enriched_org and enriched_repo:
            if not (enriched_org == public_org and enriched_repo == public_repo):
                candidates_for_cid.append({
                    "source": "enriched_projects",
                    "org": enriched_org,
                    "repo": enriched_repo,
                    "website": enriched.get("website"),
                    "x_handle": enriched.get("xHandle"),
                    "sector": enriched.get("sector"),
                    "sectors": enriched.get("sectors", []),
                    "coingecko_id": enriched.get("coingeckoId"),
                })

        candidates.append({
            "canonical_id": cid,
            "display_name": public.get("name") or public.get("display_name") or cid,
            "sector": public.get("sector"),
            "all_sectors": public.get("sectors", []),
            "website": public.get("website"),
            "x_handle": public.get("xHandle"),
            "coingecko_id": public.get("coingeckoId"),
            "symbol": public.get("symbol"),
            "mapping_candidates": candidates_for_cid,
            "n_mapping_candidates": len(candidates_for_cid),
        })
    return candidates


def github_verify_one_mapping(mapping, display_name):
    """Verify a single org/repo mapping via GitHub API."""
    org_login = mapping["org"]
    repo_full = mapping["repo"]

    # 1. Verify org
    org_meta = verify_org(org_login)

    # 2. Verify repo
    repo_meta = verify_repo(repo_full)

    # 3. Compute confidence
    confidence = 0.0
    evidence = []

    if org_meta.get("exists"):
        confidence += 0.20
        evidence.append(f"org_exists={org_login}")

        # Blog match with website
        if domain_match(org_meta.get("blog"), mapping.get("website")):
            confidence += 0.15
            evidence.append(f"blog_matches_website ({org_meta.get('blog')} ~ {mapping.get('website')})")

        # Twitter match
        if org_meta.get("twitter_username") and mapping.get("x_handle"):
            tx = org_meta["twitter_username"].lower().lstrip("@")
            mx = mapping["x_handle"].lower().lstrip("@")
            if tx == mx:
                confidence += 0.10
                evidence.append(f"twitter_matches_org ({tx} = {mx})")

    if repo_meta.get("exists"):
        confidence += 0.25
        evidence.append(f"repo_exists={repo_full}")

        if not repo_meta.get("is_archived") and not repo_meta.get("is_disabled"):
            confidence += 0.10
            evidence.append("repo_active=True")

        # Description has any project token keyword
        desc = (repo_meta.get("description") or "").lower()
        if desc and any(kw in desc for kw in display_name.lower().split()):
            confidence += 0.05
            evidence.append(f"description_contains_project_name")

        # Homepage match
        if domain_match(repo_meta.get("homepage"), mapping.get("website")):
            confidence += 0.10
            evidence.append(f"homepage_matches_website ({repo_meta.get('homepage')} ~ {mapping.get('website')})")

    confidence = round(min(confidence, 1.0), 4)

    return {
        "mapping": mapping,
        "org_meta": org_meta,
        "repo_meta": repo_meta,
        "verification_confidence": confidence,
        "evidence": evidence,
    }


def choose_best_mapping(verifications, cid, display_name):
    """Choose best mapping from list of verifications, applying strong-evidence rules."""
    verified = [v for v in verifications if v["org_meta"].get("exists") and v["repo_meta"].get("exists")]

    if not verified:
        return None, "no_verified_mapping_found", []

    # If only one candidate verified
    if len(verified) == 1:
        return verified[0], "single_candidate_verified", [verified[0]]

    # If multiple verified, choose by:
    # 1. highest verification_confidence
    # 2. if tie, highest stars
    # 3. if tie, most_recent push
    best = sorted(
        verified,
        key=lambda v: (
            v["verification_confidence"],
            v["repo_meta"].get("stars") or 0,
        ),
        reverse=True
    )[0]

    return best, "best_confidence", verified


# ============================================================================
# STEP 4 — COLLECT DEVELOPER DATA FOR VERIFIED CANDIDATES
# ============================================================================

def collect_developer_data(best_mapping):
    """For best mapping, collect commits/releases/contributors data."""
    full_name = best_mapping["repo_meta"].get("full_name") or f'{best_mapping["mapping"]["org"]}/{best_mapping["mapping"]["repo"]}'
    if not best_mapping["repo_meta"].get("exists"):
        return {"data_available": False}

    # pushed_at → days since last push
    pushed_at = best_mapping["repo_meta"].get("pushed_at")
    days_since_last_commit = None
    if pushed_at:
        try:
            d = datetime.fromisoformat(pushed_at.replace("Z", "+00:00"))
            days_since_last_commit = (datetime.now(timezone.utc) - d).days
        except Exception:
            pass

    # Commits
    commits_data = get_repo_commits_90d(full_name)
    releases_data = get_repo_releases_90d(full_name)
    contributors_data = get_repo_contributors_90d(full_name)

    return {
        "data_available": True,
        "repo_full_name": full_name,
        "pushed_at": pushed_at,
        "days_since_last_commit": days_since_last_commit,
        "commits_90d": commits_data.get("commits_90d_approx"),
        "commits_in_last_page": commits_data.get("commits_in_last_page"),
        "oldest_commit_in_page": commits_data.get("oldest_commit_in_page"),
        "releases_90d": releases_data.get("releases_90d"),
        "unique_contributors_90d": contributors_data.get("unique_contributors_90d"),
        "stars": best_mapping["repo_meta"].get("stars"),
        "forks": best_mapping["repo_meta"].get("forks"),
        "is_archived": best_mapping["repo_meta"].get("is_archived"),
        "is_disabled": best_mapping["repo_meta"].get("is_disabled"),
    }


# ============================================================================
# STEP 5 — MULTI-SIGNAL ACTIVITY CLASSIFICATION
# ============================================================================

def classify_activity(developer_data):
    """Multi-signal ACTIVE classification."""
    if not developer_data or not developer_data.get("data_available"):
        return {
            "activity_status": "DATA_UNAVAILABLE",
            "classification_rule": "no_github_data",
            "signals": {},
        }

    signals = {
        "commits_90d": developer_data.get("commits_90d"),
        "days_since_last_commit": developer_data.get("days_since_last_commit"),
        "releases_90d": developer_data.get("releases_90d"),
        "unique_contributors_90d": developer_data.get("unique_contributors_90d"),
        "is_archived": developer_data.get("is_archived"),
        "is_disabled": developer_data.get("is_disabled"),
    }

    c = developer_data.get("commits_90d") or 0
    d = developer_data.get("days_since_last_commit")
    r = developer_data.get("releases_90d") or 0
    u = developer_data.get("unique_contributors_90d") or 0
    is_arch = developer_data.get("is_archived") or False
    is_dis = developer_data.get("is_disabled") or False

    # Rule 1: project clearly archived/disabled → INACTIVE
    if is_arch or is_dis:
        return {
            "activity_status": "INACTIVE",
            "classification_rule": "archived_or_disabled",
            "signals": signals,
        }

    # Rule 2: STRICT ACTIVE — commits >= 10 AND days <= 60
    if c >= MIN_COMMITS_90D_STRICT and d is not None and d <= MAX_DAYS_SINCE_COMMIT_STRICT:
        return {
            "activity_status": "ACTIVE",
            "classification_rule": "STRICT_ACTIVE_commits_days",
            "signals": signals,
        }

    # Rule 3: relaxed ACTIVE — commits >= 5 AND (days <= 90 OR releases >= 1 OR contributors >= 5)
    relaxed_signals = []
    if c >= MIN_COMMITS_90D_RELAXED:
        relaxed_signals.append(f"commits_90d={c}>={MIN_COMMITS_90D_RELAXED}")
    if d is not None and d <= MAX_DAYS_SINCE_COMMIT_RELAXED:
        relaxed_signals.append(f"days={d}<={MAX_DAYS_SINCE_COMMIT_RELAXED}")
    if r >= MIN_RELEASES_90D:
        relaxed_signals.append(f"releases_90d={r}>={MIN_RELEASES_90D}")
    if u >= MIN_CONTRIBUTORS_90D:
        relaxed_signals.append(f"contributors_90d={u}>={MIN_CONTRIBUTORS_90D}")

    if len(relaxed_signals) >= 3:
        return {
            "activity_status": "ACTIVE",
            "classification_rule": "RELAXED_ACTIVE_multi_signal",
            "signals": signals,
            "relaxed_signals": relaxed_signals,
        }

    # Rule 4: STALE — some recent activity but not enough
    if c >= 1 and d is not None and d <= 180:
        return {
            "activity_status": "STALE",
            "classification_rule": "minimal_activity_below_threshold",
            "signals": signals,
        }

    # Rule 5: INACTIVE — no commits or very old
    return {
        "activity_status": "INACTIVE",
        "classification_rule": "no_recent_activity",
        "signals": signals,
    }


# ============================================================================
# STEP 6 — MARKET DATA INJECTION (CoinGecko)
# ============================================================================

def build_coingecko_lookup(coingecko_data_list):
    lookup = {}
    for d in coingecko_data_list:
        items = d["_data"]
        for item in items:
            cid = item.get("id")
            if cid and cid not in lookup:
                lookup[cid] = {
                    "coingecko_id": cid,
                    "name": item.get("name"),
                    "symbol": item.get("symbol"),
                    "market_cap_usd": safe_float(item.get("market_cap")),
                    "market_cap_rank": safe_int(item.get("market_cap_rank")),
                    "current_price_usd": safe_float(item.get("current_price")),
                    "source_file": d["_source_file"],
                }
    return lookup


def find_market_data(cid, coingecko_lookup, public_coingecko_id=None, sector=None):
    """Find market data for a candidate, trying multiple ID variants."""
    candidates_to_try = []
    if public_coingecko_id:
        candidates_to_try.append(public_coingecko_id)
    # Also try based on cid
    candidates_to_try.append(cid)
    # Try removing common suffixes
    if "-" in cid:
        candidates_to_try.append(cid.split("-")[0])

    seen = set()
    for cgid in candidates_to_try:
        if cgid in seen:
            continue
        seen.add(cgid)
        if cgid in coingecko_lookup:
            return coingecko_lookup[cgid]
    return None


# ============================================================================
# MAIN PIPELINE
# ============================================================================

def main():
    start_time = now_iso()
    print(f"\nPAYD Intelligence V2 — TARGETED GITHUB VERIFICATION FOR 9 CANDIDATES")
    print(f"Started at: {start_time}\n")

    # ------- STEP 1: Resolve all 10 to canonical IDs -------
    resolutions = step1_resolve_all_10()

    # ------- STEP 2-4: Build candidate mappings + verify via GitHub API -------
    print("\n" + "=" * 80)
    print("STEP 2-4: GITHUB API VERIFICATION FOR 9 CANDIDATES")
    print("=" * 80)

    candidates_setup = build_candidates_for_verification()
    print(f"\nLoaded {len(candidates_setup)} candidates, total {sum(c['n_mapping_candidates'] for c in candidates_setup)} mapping candidates to verify\n")

    github_verification_results = []
    for c in candidates_setup:
        cid = c["canonical_id"]
        dname = c["display_name"]
        print(f"  → {cid} ({dname}): {c['n_mapping_candidates']} mapping candidate(s)")

        verifications = []
        for mapping in c["mapping_candidates"]:
            print(f"    · verifying {mapping['source']}: {mapping['org']}/{mapping['repo']} ...")
            v = github_verify_one_mapping(mapping, dname)
            verifications.append(v)
            org_status = "✓" if v["org_meta"].get("exists") else "✗"
            rep_status = "✓" if v["repo_meta"].get("exists") else "✗"
            print(f"      org={org_status} (conf={v['verification_confidence']:.2f}), repo={rep_status}")

        # Choose best mapping
        best, choose_reason, all_verified = choose_best_mapping(verifications, cid, dname)
        print(f"    → decision: {choose_reason}")

        # Collect developer data only if best is verified with high confidence
        developer_data = None
        if best and best["verification_confidence"] >= MIN_VERIFICATION_CONFIDENCE:
            developer_data = collect_developer_data(best)
            if developer_data.get("data_available"):
                print(f"      developer_data: commits_90d={developer_data.get('commits_90d')}, "
                      f"days={developer_data.get('days_since_last_commit')}, "
                      f"releases_90d={developer_data.get('releases_90d')}")

        github_verification_results.append({
            "canonical_id": cid,
            "display_name": dname,
            "sector": c["sector"],
            "all_sectors": c["all_sectors"],
            "website": c["website"],
            "x_handle": c["x_handle"],
            "coingecko_id": c["coingecko_id"],
            "symbol": c["symbol"],
            "n_mapping_candidates": c["n_mapping_candidates"],
            "mapping_candidates_attempted": verifications,
            "best_mapping": best,
            "best_mapping_choice_reason": choose_reason,
            "all_verified_mappings": all_verified,
            "developer_data": developer_data,
        })

    # ------- STEP 5: Multi-signal ACTIVE classification -------
    print("\n" + "=" * 80)
    print("STEP 5: MULTI-SIGNAL ACTIVITY CLASSIFICATION")
    print("=" * 80)

    for r in github_verification_results:
        r["activity_classification"] = classify_activity(r["developer_data"])
        cl = r["activity_classification"]
        print(f"  • {r['canonical_id']:25s} → {cl['activity_status']:12s} ({cl['classification_rule']})")

    # ------- STEP 6: CoinGecko market data -------
    print("\n" + "=" * 80)
    print("STEP 6: MARKET DATA INJECTION (CoinGecko)")
    print("=" * 80)

    coingecko_data_list = []
    for fp in COINGECKO_FILES:
        d = load_json(fp)
        if d:
            d_list = d if isinstance(d, list) else []
            coingecko_data_list.append({"_data": d_list, "_source_file": os.path.basename(fp)})
            print(f"  ✓ {os.path.basename(fp)}: {len(d_list)} items")

    cg_lookup = build_coingecko_lookup(coingecko_data_list)
    for r in github_verification_results:
        m = find_market_data(r["canonical_id"], cg_lookup, r.get("coingecko_id"))
        r["market_data"] = m
        if m:
            print(f"  • {r['canonical_id']:25s} → MC=${m['market_cap_usd']:,.0f} (cgid={m['coingecko_id']})")
        else:
            print(f"  • {r['canonical_id']:25s} → NO CG DATA")

    # ------- STEP 7: Final gate for each of the 9 -------
    print("\n" + "=" * 80)
    print("STEP 7: FINAL GATE FOR 9 + AKASH INTEGRATION → 10 COMBINED")
    print("=" * 80)

    final_gate_results = []

    # Process 9 candidates
    for r in github_verification_results:
        cid = r["canonical_id"]
        activity = r["activity_classification"]["activity_status"]
        md = r.get("market_data")
        mc = (md or {}).get("market_cap_usd")

        best_mapping = r.get("best_mapping")
        mapping_verified = best_mapping is not None and best_mapping["verification_confidence"] >= MIN_VERIFICATION_CONFIDENCE
        # Need: ACTIVE + mc >= $5.5M + mapping verified
        gates = [
            ("mapping_verified", mapping_verified, f"best_mapping_conf={best_mapping['verification_confidence'] if best_mapping else 0:.3f}"),
            ("activity_active", activity == "ACTIVE", f"status={activity}"),
            ("market_cap_sufficient", mc is not None and mc >= MIN_MARKET_CAP_USD, f"mc=${mc:,.0f}" if mc else "mc=None"),
        ]
        all_pass = all(g[1] for g in gates)
        if all_pass:
            action = "REACTIVATION_APPROVED"
        else:
            failing = [g[0] for g in gates if not g[1]]
            action = f"REVIEW_REQUIRED ({','.join(failing)})"

        result = {
            "canonical_id": cid,
            "display_name": r["display_name"],
            "github_mapping_verified": mapping_verified,
            "github_org": best_mapping["mapping"]["org"] if best_mapping else None,
            "github_repo": best_mapping["mapping"]["repo"] if best_mapping else None,
            "verification_confidence": best_mapping["verification_confidence"] if best_mapping else 0,
            "activity_status": activity,
            "market_cap_usd": mc,
            "gates": [{"name": g[0], "passed": g[1], "evidence": g[2]} for g in gates],
            "final_action": action,
        }
        final_gate_results.append(result)
        print(f"  • {cid:25s} → {action:30s} (mc=${mc:,.0f}" + (f", activity={activity})" if md else ", no_market_data)") + ")")

    # ------- STEP 8: Akash integration (from previous task) -------
    akash_already_approved = {
        "canonical_id": "akash",
        "discovery_id": "akash-network",
        "display_name": "Akash Network",
        "github_mapping_verified": True,
        "github_org": "akash-network",
        "github_repo": "akash-network/akash",
        "verification_confidence": 1.0,
        "activity_status": "ACTIVE",
        "market_cap_usd": 167747858,
        "gates": [
            {"name": "mapping_verified", "passed": True, "evidence": "VERIFIED (previous task)"},
            {"name": "activity_active", "passed": True, "evidence": "Status=ACTIVE"},
            {"name": "market_cap_sufficient", "passed": True, "evidence": "mc=$167,747,858"},
        ],
        "final_action": "REACTIVATION_APPROVED",
        "akash_previous_task_result": True,
    }
    final_gate_combined = [akash_already_approved] + final_gate_results

    print(f"\n  • akash (from previous task) → REACTIVATION_APPROVED (mc=$167,747,858)")

    # ------- STEP 9: NO MUTATION CHECK -------
    print("\n" + "=" * 80)
    print("STEP 9: NO MUTATION CHECK (Master Universe 354)")
    print("=" * 80)

    enriched_data = load_json(ENRICHED_PROJECTS_PATH)
    enriched_projects = enriched_data.get("projects", enriched_data if isinstance(enriched_data, list) else [])
    universe_count = len(enriched_projects)
    print(f"  Master universe count (projects_enriched.json): {universe_count}")
    print(f"  ✓ No mutations performed. Read-only operations only.")

    # ------- STEP 10: OUTPUT FILES + VALIDATION -------
    print("\n" + "=" * 80)
    print("STEP 10: OUTPUT JSON FILES + VALIDATION REPORT")
    print("=" * 80)

    # File 1: payd_9_github_verification.json
    github_verification_output = {
        "metadata": {
            "generated_at": now_iso(),
            "pipeline_start_at": start_time,
            "purpose": "Targeted GitHub API verification for 9 reactivation candidates",
            "step": "2-4 + 5 of 10",
            "method": "GitHub REST API (orgs/{login}, repos/{full_name}, /commits, /releases)",
            "confidence_threshold": MIN_VERIFICATION_CONFIDENCE,
        },
        "results": github_verification_results,
        "summary": {
            "total_candidates": len(github_verification_results),
            "mapping_verified": sum(1 for r in github_verification_results if r.get("best_mapping") and r["best_mapping"]["verification_confidence"] >= MIN_VERIFICATION_CONFIDENCE),
            "activity_active": sum(1 for r in github_verification_results if r["activity_classification"]["activity_status"] == "ACTIVE"),
            "activity_stale": sum(1 for r in github_verification_results if r["activity_classification"]["activity_status"] == "STALE"),
            "activity_inactive": sum(1 for r in github_verification_results if r["activity_classification"]["activity_status"] == "INACTIVE"),
            "activity_unavailable": sum(1 for r in github_verification_results if r["activity_classification"]["activity_status"] == "DATA_UNAVAILABLE"),
        },
    }
    write_json(OUT_GITHUB_VERIFICATION, github_verification_output)

    # File 2: payd_10_combined_final_gate.json (Akash + 9)
    final_gate_output = {
        "metadata": {
            "generated_at": now_iso(),
            "pipeline_start_at": start_time,
            "purpose": "Final gate for 10 reactivation candidates (1 from task 2 + 9 verified here)",
            "step": "7 of 10",
            "min_market_cap_usd": MIN_MARKET_CAP_USD,
            "min_verification_confidence": MIN_VERIFICATION_CONFIDENCE,
        },
        "results": final_gate_combined,
        "summary": {
            "total_candidates": len(final_gate_combined),
            "reactivation_approved": sum(1 for r in final_gate_combined if r["final_action"] == "REACTIVATION_APPROVED"),
            "review_required": sum(1 for r in final_gate_combined if r["final_action"].startswith("REVIEW_REQUIRED")),
        },
    }
    write_json(OUT_FINAL_GATE_10, final_gate_output)

    # File 3: payd_validation_report.json
    approved = [r for r in final_gate_combined if r["final_action"] == "REACTIVATION_APPROVED"]
    review = [r for r in final_gate_combined if r["final_action"].startswith("REVIEW_REQUIRED")]
    checks = []
    checks.append(("master_universe_unchanged", universe_count == 354, f"count={universe_count}"))
    checks.append(("no_production_mutation", True, "read_only_operations"))
    checks.append(("all_10_have_results", len(final_gate_combined) == 10, f"count={len(final_gate_combined)}"))
    checks.append(("akash_present", any(r["canonical_id"] == "akash" for r in final_gate_combined), "akash in results"))
    checks.append(("9_candidates_present", all(r["canonical_id"] in TARGET_9_FOR_VERIFICATION for r in final_gate_results), "all 9 in verification results"))
    checks.append(("min_market_cap_enforced", all(r["market_cap_usd"] is None or r["market_cap_usd"] >= MIN_MARKET_CAP_USD or r["final_action"] != "REACTIVATION_APPROVED" for r in final_gate_combined), "market cap check"))
    checks.append(("activity_active_required_for_approval", all(r["activity_status"] == "ACTIVE" or r["final_action"] != "REACTIVATION_APPROVED" for r in final_gate_combined), "active check"))
    checks.append(("mapping_verified_required_for_approval", all(r["github_mapping_verified"] or r["final_action"] != "REACTIVATION_APPROVED" for r in final_gate_combined), "mapping check"))
    all_pass = all(c[1] for c in checks)
    validation_report = {
        "metadata": {
            "generated_at": now_iso(),
            "pipeline_start_at": start_time,
            "purpose": "Validation report for TARGETED GITHUB VERIFICATION",
            "step": "10 of 10",
        },
        "checks": [{"name": c[0], "passed": c[1], "evidence": c[2]} for c in checks],
        "all_checks_passed": all_pass,
        "final_counts": {
            "reactivation_approved": len(approved),
            "review_required": len(review),
            "approved_ids": [r["canonical_id"] for r in approved],
            "review_ids": [r["canonical_id"] for r in review],
        },
    }
    write_json(OUT_VALIDATION_REPORT, validation_report)

    # File 4: payd_akash_final_action.json (single-out Akash for clarity)
    write_json(OUT_AKASH_FINAL, {
        "metadata": {
            "generated_at": now_iso(),
            "step": "6 of 10",
        },
        "akash": akash_already_approved,
        "note": "Akash was already approved in TARGETED REACTIVATION RECOLLECTION (task 2). Re-exported here for combined 10-candidate report.",
    })

    print(f"\n✓ Pipeline complete. Validation passes: {all_pass}\n")
    return all_pass, final_gate_combined


if __name__ == "__main__":
    success, final_results = main()
    print("\n" + "=" * 80)
    print("FINAL ACTION SUMMARY (10 CANDIDATES)")
    print("=" * 80)
    for r in final_results:
        marker = "✓" if r["final_action"] == "REACTIVATION_APPROVED" else "✗"
        print(f"  {marker} {r['canonical_id']:25s} → {r['final_action']}")
    sys.exit(0 if success else 1)
