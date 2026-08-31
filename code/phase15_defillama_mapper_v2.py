#!/usr/bin/env python3
"""
PAYD INTELLIGENCE V2 — Phase 1.5: DefiLlama Mapping Engine (v2)
================================================================
Improvements over v1:
  1. Strong gecko_id match → use that exact entry (the version DefiLlama tagged with gecko_id)
  2. When multiple version candidates exist for symbol/name, prefer the one with highest TVL
     OR the one explicitly tagged with project's gecko_id
  3. Better AMBIGUOUS detection (only if both candidates >=0.80 AND no TVL tiebreaker)
  4. Adds candidate TVL and category to evidence
"""

import json
import re
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse

WORKSPACE = Path("/workspace")
PROJECTS_FILE = WORKSPACE / "public" / "data" / "projects.json"
DEFILLAMA_FILE = WORKSPACE / "tmp" / "phase15" / "defillama_protocols.json"
OUT_DIR = WORKSPACE / "tmp" / "phase15"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Эвристика NOT_APPLICABLE по sector
NOT_APPLICABLE_SECTORS = {
    "ai", "desci", "rwa", "ZK",
}

def normalize_name(s):
    if not s:
        return ""
    s = s.lower().strip()
    for kw in ["protocol", "network", "labs", "finance", "swap", "exchange",
               "foundation", "io", "app", "dao", "v2", "v3", "v1", "v4", "v5"]:
        if s.endswith(" " + kw):
            s = s[: -(len(kw) + 1)]
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s

def normalize_symbol(s):
    return (s or "").upper().strip()

def domain_of(url):
    if not url:
        return ""
    try:
        n = urlparse(url).netloc.lower()
        if n.startswith("www."):
            n = n[4:]
        return n
    except Exception:
        return ""

def score_pair(project, dl, weights):
    matched = []
    score = 0.0

    p_name = normalize_name(project.get("name") or project.get("id"))
    dl_name = normalize_name(dl.get("name"))
    if p_name and dl_name and p_name == dl_name:
        score += weights["name"]; matched.append("name")
    elif p_name and dl_name and (p_name in dl_name or dl_name in p_name):
        if min(len(p_name), len(dl_name)) >= 4:
            score += weights["name"] * 0.5; matched.append("name_partial")

    p_sym = normalize_symbol(project.get("symbol"))
    dl_sym = normalize_symbol(dl.get("symbol"))
    if p_sym and dl_sym and p_sym == dl_sym:
        score += weights["symbol"]; matched.append("symbol")

    p_dom = domain_of(project.get("website"))
    dl_dom = domain_of(dl.get("url"))
    if p_dom and dl_dom and p_dom == dl_dom:
        score += weights["website"]; matched.append("website")
    elif p_dom and dl_dom and (p_dom.endswith("." + dl_dom) or dl_dom.endswith("." + p_dom)):
        score += weights["website"] * 0.6; matched.append("website_subdomain")

    p_cg = (project.get("coingeckoId") or "").lower().strip()
    dl_cg = (dl.get("gecko_id") or "").lower().strip()
    if p_cg and dl_cg and p_cg == dl_cg:
        score += weights["coingecko"]; matched.append("coingecko")

    p_tw = (project.get("xHandle") or "").lower().strip().lstrip("@")
    dl_tw = (dl.get("twitter") or "").lower().strip().lstrip("@")
    if p_tw and dl_tw and p_tw == dl_tw:
        score += weights["twitter"]; matched.append("twitter")

    dl_cat = (dl.get("category") or "").lower()
    p_sector = (project.get("sector") or "").lower()
    sector_to_cat = {
        "defi": ["dexs", "lending", "yield", "liquid staking", "cdp", "bridge", "derivatives", "exchange", "dex aggregator"],
        "gaming": ["gaming"],
        "infrastructure": ["services", "oracle", "wallets"],
        "rwa": ["rwa"],
        "layer1": ["chain"],
        "layer2": ["chain", "rollup"],
        "depin": ["depin"],
    }
    if dl_cat and p_sector in sector_to_cat and dl_cat in sector_to_cat[p_sector]:
        score += weights["category"]; matched.append("category")

    return min(score, 1.0), matched


def build_index(dl):
    by_gecko = defaultdict(list)
    by_symbol = defaultdict(list)
    by_name = defaultdict(list)
    by_domain = defaultdict(list)
    by_twitter = defaultdict(list)
    for p in dl:
        if p.get("gecko_id"):
            by_gecko[p["gecko_id"].lower()].append(p)
        if p.get("symbol"):
            by_symbol[p["symbol"].upper()].append(p)
        nm = normalize_name(p.get("name"))
        if nm:
            by_name[nm].append(p)
        d = domain_of(p.get("url"))
        if d:
            by_domain[d].append(p)
        if p.get("twitter"):
            by_twitter[p["twitter"].lower().lstrip("@")].append(p)
    return by_gecko, by_symbol, by_name, by_domain, by_twitter


def find_candidates(project, idx):
    by_gecko, by_symbol, by_name, by_domain, by_twitter = idx
    candidates = []
    seen = set()

    def add(p):
        key = p.get("slug") or p.get("id")
        if key in seen: return
        seen.add(key); candidates.append(p)

    cg = (project.get("coingeckoId") or "").lower()
    if cg in by_gecko:
        for p in by_gecko[cg]: add(p)

    sym = normalize_symbol(project.get("symbol"))
    if sym in by_symbol:
        # сортируем по TVL убыванию, чтобы предпочесть main-версию
        for p in sorted(by_symbol[sym], key=lambda x: -(x.get("tvl") or 0))[:5]:
            add(p)

    nm = normalize_name(project.get("name") or project.get("id"))
    if nm in by_name:
        for p in sorted(by_name[nm], key=lambda x: -(x.get("tvl") or 0))[:3]:
            add(p)

    dom = domain_of(project.get("website"))
    if dom in by_domain:
        for p in by_domain[dom]: add(p)

    tw = (project.get("xHandle") or "").lower().lstrip("@")
    if tw in by_twitter:
        for p in by_twitter[tw]: add(p)

    return candidates


def map_project(project, idx, weights):
    p_sector = (project.get("sector") or "").lower()
    sectors_field = project.get("sectors") or []
    if isinstance(sectors_field, str): sectors_field = [sectors_field]
    all_sectors = {p_sector} | {s.lower() for s in sectors_field if s}

    if all_sectors & NOT_APPLICABLE_SECTORS:
        return {
            "status": "NOT_APPLICABLE",
            "defillama_slug": None, "defillama_name": None,
            "match_confidence": 0.0, "match_method": [], "verified": False,
            "reason": f"sector_excluded:{','.join(sorted(all_sectors & NOT_APPLICABLE_SECTORS))}",
        }

    candidates = find_candidates(project, idx)
    if not candidates:
        return {
            "status": "NOT_FOUND",
            "defillama_slug": None, "defillama_name": None,
            "match_confidence": 0.0, "match_method": [], "verified": False,
            "reason": "no_candidate_in_defillama_index",
        }

    # Скоринг всех кандидатов
    scored = []
    for cand in candidates:
        conf, methods = score_pair(project, cand, weights)
        if conf > 0.3:
            scored.append((conf, methods, cand))
    scored.sort(key=lambda x: -x[0])

    if not scored:
        return {
            "status": "NOT_FOUND",
            "defillama_slug": None, "defillama_name": None,
            "match_confidence": 0.0, "match_method": [], "verified": False,
            "reason": "all_candidates_below_0.3",
        }

    best_conf, best_methods, best_cand = scored[0]

    # AMBIGUOUS: если есть coingecko_id match — это почти всегда однозначно
    has_gecko_match = "coingecko" in best_methods

    # TVL-based disambiguation: если 2+ кандидата близки по score и у одного TVL >> 0, а у других = 0,
    # выбираем того, у кого есть TVL
    if len(scored) >= 2 and not has_gecko_match:
        # Если у best TVL > 0, а у второго TVL = 0 и score в пределах 0.15, выбираем best
        best_tvl = best_cand.get("tvl") or 0
        for sc_conf, sc_methods, sc_cand in scored[1:]:
            if sc_cand.get("tvl") and sc_cand.get("tvl") > 0 and best_tvl == 0 and (sc_conf - best_conf) < 0.15:
                # Меняем местами: TVL-positive получает приоритет
                scored[0], scored[1] = (sc_conf, sc_methods, sc_cand), (best_conf, best_methods, best_cand)
                best_conf, best_methods, best_cand = scored[0]
                break

    # Жёсткая AMBIGUOUS: только если нет coingecko/twitter, и 2 кандидата с близким score
    if len(scored) >= 2 and not has_gecko_match and "twitter" not in best_methods:
        second = scored[1]
        if second[0] >= 0.80 and (best_conf - second[0]) < 0.05:
            return {
                "status": "AMBIGUOUS",
                "defillama_slug": None, "defillama_name": None,
                "match_confidence": best_conf, "match_method": best_methods,
                "verified": False,
                "reason": f"top2_within_0.05:{best_cand.get('slug')}_{second[2].get('slug')}",
                "alternatives": [
                    {"slug": c[2].get("slug"), "name": c[2].get("name"),
                     "confidence": c[0], "methods": c[1], "tvl": c[2].get("tvl", 0)}
                    for c in scored[:4]
                ],
            }

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
        "candidate_tvl": best_cand.get("tvl", 0),
        "candidate_category": best_cand.get("category"),
        "alternatives": [
            {"slug": c[2].get("slug"), "name": c[2].get("name"),
             "confidence": c[0], "methods": c[1], "tvl": c[2].get("tvl", 0)}
            for c in scored[:3]
        ] if status != "NOT_FOUND" else [],
    }


def main():
    print("=" * 78)
    print("PAYD INTELLIGENCE V2 — Phase 1.5: DefiLlama Mapping (v2)")
    print("=" * 78)
    print()

    with open(PROJECTS_FILE, "r", encoding="utf-8") as f:
        projects = json.load(f)["projects"]
    with open(DEFILLAMA_FILE, "r", encoding="utf-8") as f:
        dl_protocols = json.load(f)

    print(f"Проектов PAYD: {len(projects)}; DefiLlama протоколов: {len(dl_protocols)}")
    print()

    weights = {
        "name": 0.30, "symbol": 0.20, "website": 0.20,
        "coingecko": 0.15, "twitter": 0.10, "category": 0.05,
    }

    idx = build_index(dl_protocols)
    print(f"Индексы: gecko={len(idx[0])}, symbol={len(idx[1])}, "
          f"name={len(idx[2])}, domain={len(idx[3])}, twitter={len(idx[4])}")
    print()

    results = []
    for p in projects:
        mapping = map_project(p, idx, weights)
        results.append({
            "project_id": p.get("id"),
            "symbol": p.get("symbol"),
            "name": p.get("name"),
            "sector": p.get("sector"),
            "sectors": p.get("sectors"),
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
        sector_status[sec][r["defillama_mapping"]["status"]] += 1

    print("--- DefiLlama mapping по секторам ---")
    print(f"  {'Сектор':<22} {'MAPPED':>7} {'NEEDS_REV':>10} {'NOT_APPL':>9} {'NOT_FOUND':>10} {'AMBIG':>6} {'TOTAL':>6}")
    print("  " + "-" * 74)
    for sec in sorted(sector_status.keys(), key=lambda x: -sum(sector_status[x].values())):
        d = sector_status[sec]
        total = sum(d.values())
        print(f"  {sec:<22} {d.get('MAPPED',0):>7} {d.get('MAPPED_NEEDS_REVIEW',0):>10} "
              f"{d.get('NOT_APPLICABLE',0):>9} {d.get('NOT_FOUND',0):>10} "
              f"{d.get('AMBIGUOUS',0):>6} {total:>6}")
    print()

    # NEEDS_REVIEW
    nr = [r for r in results if r["defillama_mapping"]["status"] == "MAPPED_NEEDS_REVIEW"]
    def fmt_tvl(v):
        if v is None: return "           n/a"
        return f"${v:>14,.0f}"

    print(f"--- NEEDS_REVIEW ({len(nr)}) — все ---")
    for r in sorted(nr, key=lambda x: -x["defillama_mapping"]["match_confidence"]):
        m = r["defillama_mapping"]
        print(f"  {r['project_id']:<28} {r['symbol']:<8} → {m['defillama_slug']:<32} "
              f"conf={m['match_confidence']:.2f} tvl={fmt_tvl(m.get('candidate_tvl'))} via {','.join(m['match_method'])}")
    print()

    # MAPPED
    mp = [r for r in results if r["defillama_mapping"]["status"] == "MAPPED"]
    print(f"--- MAPPED ({len(mp)}) — все ---")
    for r in sorted(mp, key=lambda x: -(x["defillama_mapping"].get("candidate_tvl") or 0)):
        m = r["defillama_mapping"]
        print(f"  {r['project_id']:<28} {r['symbol']:<8} → {m['defillama_slug']:<32} "
              f"tvl={fmt_tvl(m.get('candidate_tvl'))} via {','.join(m['match_method'])}")
    print()

    # AMBIGUOUS
    am = [r for r in results if r["defillama_mapping"]["status"] == "AMBIGUOUS"]
    print(f"--- AMBIGUOUS ({len(am)}) — все ---")
    for r in am:
        m = r["defillama_mapping"]
        alts = " | ".join([f"{a['slug']}(c={a['confidence']:.2f},tvl={fmt_tvl(a.get('tvl'))})" for a in m.get("alternatives", [])])
        print(f"  {r['project_id']:<28} {r['symbol']:<8} {alts}")
    print()

    # NOT_FOUND
    nf = [r for r in results if r["defillama_mapping"]["status"] == "NOT_FOUND"]
    print(f"--- NOT_FOUND ({len(nf)}) — все ---")
    for r in sorted(nf, key=lambda x: x.get("sector") or ""):
        print(f"  {r['project_id']:<28} {r['symbol']:<8} sector={r['sector']}")
    print()

    out_path = OUT_DIR / "defillama_mapping_v2.json"
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
    print("Конец отчёта DefiLlama mapping v2")
    print("=" * 78)


if __name__ == "__main__":
    main()
