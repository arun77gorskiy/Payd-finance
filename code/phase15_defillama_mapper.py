#!/usr/bin/env python3
"""
PAYD INTELLIGENCE V2 — Phase 1.5: DefiLlama Mapping Engine
==========================================================
Multi-signal matching between PAYD projects and DefiLlama protocols.

Signals used (weighted):
  - name  (0.30)
  - symbol (0.20)
  - website domain (0.20)
  - coingecko id (0.15)
  - twitter (0.10)
  - category / sector (0.05)

Confidence thresholds:
  - >= 0.95 → MAPPED (auto-accept)
  - 0.80..0.94 → MAPPED_NEEDS_REVIEW
  - < 0.80 → not assigned
  - explicit sector exclusion → NOT_APPLICABLE
"""

import json
import re
import os
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse

WORKSPACE = Path("/workspace")
PROJECTS_FILE = WORKSPACE / "public" / "data" / "projects.json"
DEFILLAMA_FILE = WORKSPACE / "tmp" / "phase15" / "defillama_protocols.json"
OUT_DIR = WORKSPACE / "tmp" / "phase15"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Сектора, для которых DefiLlama по определению НЕ применим (эвристика)
NOT_APPLICABLE_SECTORS = {
    "ai",        # большинство AI-токенов не имеют on-chain TVL
    "desci",     # децентрализованная наука
    "rwa",       # RWA-обёртки/оракулы
    "ZK",        # privacy/ZK — часто без TVL
}

# --- Утилиты ---------------------------------------------------------------

def normalize_name(s):
    if not s:
        return ""
    s = s.lower().strip()
    for kw in ["protocol", "network", "labs", "finance", "swap", "exchange",
               "foundation", "io", "app", "dao", "v2", "v3", "v1"]:
        if s.endswith(" " + kw):
            s = s[: -(len(kw) + 1)]
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s

def normalize_symbol(s):
    if not s:
        return ""
    return s.upper().strip()

def domain_of(url):
    if not url:
        return ""
    try:
        netloc = urlparse(url).netloc.lower()
        if netloc.startswith("www."):
            netloc = netloc[4:]
        return netloc
    except Exception:
        return ""

# --- Основной mapping -------------------------------------------------------

def score_pair(project, dl, weights):
    matched = []
    score = 0.0

    # 1) Name
    p_name = normalize_name(project.get("name") or project.get("id"))
    dl_name = normalize_name(dl.get("name"))
    if p_name and dl_name and p_name == dl_name:
        score += weights["name"]
        matched.append("name")
    elif p_name and dl_name and (p_name in dl_name or dl_name in p_name):
        if min(len(p_name), len(dl_name)) >= 4:
            score += weights["name"] * 0.5
            matched.append("name_partial")

    # 2) Symbol
    p_sym = normalize_symbol(project.get("symbol"))
    dl_sym = normalize_symbol(dl.get("symbol"))
    if p_sym and dl_sym and p_sym == dl_sym:
        score += weights["symbol"]
        matched.append("symbol")

    # 3) Website domain
    p_dom = domain_of(project.get("website"))
    dl_dom = domain_of(dl.get("url"))
    if p_dom and dl_dom and p_dom == dl_dom:
        score += weights["website"]
        matched.append("website")
    elif p_dom and dl_dom and (p_dom.endswith("." + dl_dom) or dl_dom.endswith("." + p_dom)):
        score += weights["website"] * 0.6
        matched.append("website_subdomain")

    # 4) Coingecko id
    p_cg = (project.get("coingeckoId") or "").lower().strip()
    dl_cg = (dl.get("gecko_id") or "").lower().strip()
    if p_cg and dl_cg and p_cg == dl_cg:
        score += weights["coingecko"]
        matched.append("coingecko")

    # 5) Twitter
    p_tw = (project.get("xHandle") or "").lower().strip().lstrip("@")
    dl_tw = (dl.get("twitter") or "").lower().strip().lstrip("@")
    if p_tw and dl_tw and p_tw == dl_tw:
        score += weights["twitter"]
        matched.append("twitter")

    # 6) Category / sector bonus
    dl_cat = (dl.get("category") or "").lower()
    p_sector = (project.get("sector") or "").lower()
    sector_to_cat = {
        "defi": ["dexs", "lending", "yield", "liquid staking", "cdp", "bridge", "derivatives", "exchange"],
        "gaming": ["gaming"],
        "infrastructure": ["services", "oracle", "wallets"],
        "rwa": ["rwa"],
        "layer1": ["chain"],
        "layer2": ["chain", "rollup"],
        "depin": ["depin"],
    }
    if dl_cat and p_sector in sector_to_cat:
        if dl_cat in sector_to_cat[p_sector]:
            score += weights["category"]
            matched.append("category")

    return min(score, 1.0), matched


def build_protocol_index(dl_protocols):
    by_gecko = {}
    by_symbol = {}
    by_name = {}
    by_domain = {}
    by_twitter = {}

    for p in dl_protocols:
        if p.get("gecko_id"):
            by_gecko.setdefault(p["gecko_id"].lower(), []).append(p)
        if p.get("symbol"):
            by_symbol.setdefault(p["symbol"].upper(), []).append(p)
        nm = normalize_name(p.get("name"))
        if nm:
            by_name.setdefault(nm, []).append(p)
        d = domain_of(p.get("url"))
        if d:
            by_domain.setdefault(d, []).append(p)
        if p.get("twitter"):
            by_twitter.setdefault(p["twitter"].lower().lstrip("@"), []).append(p)

    return {
        "by_gecko": by_gecko,
        "by_symbol": by_symbol,
        "by_name": by_name,
        "by_domain": by_domain,
        "by_twitter": by_twitter,
        "all": dl_protocols,
    }


def find_candidates(project, index):
    candidates = []
    seen = set()

    def add(p):
        slug = p.get("slug") or p.get("name")
        if slug in seen:
            return
        seen.add(slug)
        candidates.append(p)

    cg = (project.get("coingeckoId") or "").lower()
    if cg and cg in index["by_gecko"]:
        for p in index["by_gecko"][cg]:
            add(p)

    sym = (project.get("symbol") or "").upper()
    if sym and sym in index["by_symbol"]:
        for p in index["by_symbol"][sym][:5]:
            add(p)

    nm = normalize_name(project.get("name") or project.get("id"))
    if nm and nm in index["by_name"]:
        for p in index["by_name"][nm]:
            add(p)

    dom = domain_of(project.get("website"))
    if dom and dom in index["by_domain"]:
        for p in index["by_domain"][dom]:
            add(p)

    tw = (project.get("xHandle") or "").lower().lstrip("@")
    if tw and tw in index["by_twitter"]:
        for p in index["by_twitter"][tw]:
            add(p)

    return candidates


def map_project(project, index, weights):
    p_sector = (project.get("sector") or "").lower()
    sectors_field = project.get("sectors") or []
    if isinstance(sectors_field, str):
        sectors_field = [sectors_field]
    all_sectors = {p_sector} | {s.lower() for s in sectors_field if s}

    # 1) NOT_APPLICABLE по sector
    if all_sectors & NOT_APPLICABLE_SECTORS:
        return {
            "status": "NOT_APPLICABLE",
            "defillama_slug": None,
            "defillama_name": None,
            "match_confidence": 0.0,
            "match_method": [],
            "verified": False,
            "reason": f"sector_excluded:{','.join(sorted(all_sectors & NOT_APPLICABLE_SECTORS))}",
        }

    # 2) Поиск кандидатов
    candidates = find_candidates(project, index)
    if not candidates:
        return {
            "status": "NOT_FOUND",
            "defillama_slug": None,
            "defillama_name": None,
            "match_confidence": 0.0,
            "match_method": [],
            "verified": False,
            "reason": "no_candidate_in_defillama_index",
        }

    # 3) Скоринг
    scored = []
    for cand in candidates:
        conf, methods = score_pair(project, cand, weights)
        if conf > 0.3:
            scored.append((conf, methods, cand))
    scored.sort(key=lambda x: -x[0])

    if not scored:
        return {
            "status": "NOT_FOUND",
            "defillama_slug": None,
            "defillama_name": None,
            "match_confidence": 0.0,
            "match_method": [],
            "verified": False,
            "reason": "all_candidates_below_0.3",
        }

    best_conf, best_methods, best_cand = scored[0]

    # 4) AMBIGUOUS detection
    if len(scored) >= 2:
        second_conf = scored[1][0]
        if second_conf >= 0.8 and (best_conf - second_conf) < 0.1:
            return {
                "status": "AMBIGUOUS",
                "defillama_slug": None,
                "defillama_name": None,
                "match_confidence": best_conf,
                "match_method": best_methods,
                "verified": False,
                "reason": f"top2_within_0.1:{best_cand.get('slug')}_{scored[1][2].get('slug')}",
                "alternatives": [
                    {
                        "slug": c[2].get("slug"),
                        "name": c[2].get("name"),
                        "confidence": c[0],
                        "methods": c[1],
                    }
                    for c in scored[:3]
                ],
            }

    # 5) Пороги
    if best_conf >= 0.95:
        status = "MAPPED"
    elif best_conf >= 0.80:
        status = "MAPPED_NEEDS_REVIEW"
    else:
        status = "NOT_FOUND"

    return {
        "status": status,
        "defillama_slug": best_cand.get("slug"),
        "defillama_name": best_cand.get("name"),
        "match_confidence": round(best_conf, 3),
        "match_method": best_methods,
        "verified": status == "MAPPED",
        "reason": "auto_match",
        "alternatives": [
            {
                "slug": c[2].get("slug"),
                "name": c[2].get("name"),
                "confidence": c[0],
                "methods": c[1],
            }
            for c in scored[:3]
        ] if status != "NOT_FOUND" else [],
    }


# --- MAIN ------------------------------------------------------------------

def main():
    print("=" * 78)
    print("PAYD INTELLIGENCE V2 — Phase 1.5: DefiLlama Mapping Engine")
    print("=" * 78)
    print()

    print(f"Загружаю projects: {PROJECTS_FILE}")
    with open(PROJECTS_FILE, "r", encoding="utf-8") as f:
        projects_data = json.load(f)
    projects = projects_data["projects"]
    print(f"Проектов: {len(projects)}")

    print(f"Загружаю DefiLlama protocols: {DEFILLAMA_FILE}")
    with open(DEFILLAMA_FILE, "r", encoding="utf-8") as f:
        dl_protocols = json.load(f)
    print(f"DefiLlama протоколов: {len(dl_protocols)}")
    print()

    weights = {
        "name":       0.30,
        "symbol":     0.20,
        "website":    0.20,
        "coingecko":  0.15,
        "twitter":    0.10,
        "category":   0.05,
    }

    index = build_protocol_index(dl_protocols)
    print(f"Индексы: gecko={len(index['by_gecko'])}, symbol={len(index['by_symbol'])}, "
          f"name={len(index['by_name'])}, domain={len(index['by_domain'])}, "
          f"twitter={len(index['by_twitter'])}")
    print()

    results = []
    for p in projects:
        mapping = map_project(p, index, weights)
        results.append({
            "project_id": p.get("id"),
            "symbol":     p.get("symbol"),
            "name":       p.get("name"),
            "sector":     p.get("sector"),
            "sectors":    p.get("sectors"),
            "defillama_mapping": mapping,
        })

    by_status = defaultdict(int)
    for r in results:
        by_status[r["defillama_mapping"]["status"]] += 1

    print("--- Распределение по статусам ---")
    for st, n in sorted(by_status.items(), key=lambda x: -x[1]):
        print(f"  {st:<24} {n:>4} ({n/len(results)*100:.1f}%)")
    print()

    sector_status = defaultdict(lambda: defaultdict(int))
    for r in results:
        sec = r.get("sector") or "unknown"
        st = r["defillama_mapping"]["status"]
        sector_status[sec][st] += 1

    print("--- DefiLlama mapping по секторам ---")
    print(f"  {'Сектор':<22} {'MAPPED':>8} {'NEEDS_REV':>10} {'NOT_APPL':>10} {'NOT_FOUND':>10} {'AMBIG':>8} {'TOTAL':>8}")
    print("  " + "-" * 80)
    for sec in sorted(sector_status.keys(), key=lambda x: -sum(sector_status[x].values())):
        d = sector_status[sec]
        total = sum(d.values())
        print(f"  {sec:<22} {d.get('MAPPED', 0):>8} {d.get('MAPPED_NEEDS_REVIEW', 0):>10} "
              f"{d.get('NOT_APPLICABLE', 0):>10} {d.get('NOT_FOUND', 0):>10} "
              f"{d.get('AMBIGUOUS', 0):>8} {total:>8}")
    print()

    needs_review = [r for r in results if r["defillama_mapping"]["status"] == "MAPPED_NEEDS_REVIEW"]
    print(f"--- NEEDS_REVIEW ({len(needs_review)} проектов) — первые 20 ---")
    for r in needs_review[:20]:
        m = r["defillama_mapping"]
        print(f"  {r['project_id']:<28} {r['symbol']:<8} → {m['defillama_slug']:<28} "
              f"conf={m['match_confidence']:.2f} via {','.join(m['match_method'])}")
    print()

    ambiguous = [r for r in results if r["defillama_mapping"]["status"] == "AMBIGUOUS"]
    print(f"--- AMBIGUOUS ({len(ambiguous)} проектов) — первые 10 ---")
    for r in ambiguous[:10]:
        m = r["defillama_mapping"]
        alts = ", ".join([f"{a['slug']}({a['confidence']:.2f})" for a in m.get("alternatives", [])])
        print(f"  {r['project_id']:<28} {r['symbol']:<8} alternatives: {alts}")
    print()

    not_found = [r for r in results if r["defillama_mapping"]["status"] == "NOT_FOUND"]
    print(f"--- NOT_FOUND ({len(not_found)} проектов) — первые 20 ---")
    for r in not_found[:20]:
        print(f"  {r['project_id']:<28} {r['symbol']:<8} sector={r['sector']}")
    print()

    out_path = OUT_DIR / "defillama_mapping.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({
            "metadata": {
                "total_projects": len(projects),
                "total_dl_protocols": len(dl_protocols),
                "weights": weights,
                "thresholds": {"auto": 0.95, "needs_review": 0.80, "reject": 0.80},
                "not_applicable_sectors": sorted(NOT_APPLICABLE_SECTORS),
            },
            "by_status": dict(by_status),
            "by_sector": {s: dict(d) for s, d in sector_status.items()},
            "results": results,
        }, f, ensure_ascii=False, indent=2)
    print(f"Полные результаты сохранены: {out_path}")
    print()

    print("=" * 78)
    print("Конец отчёта DefiLlama mapping")
    print("=" * 78)


if __name__ == "__main__":
    main()
