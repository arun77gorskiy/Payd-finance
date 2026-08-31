#!/usr/bin/env python3
"""
PAYD INTELLIGENCE V2 — Phase 1.5 Part 4: Identifier Registry Builder
======================================================================
Builds a centralized `identifiers` object for every project.

Schema:
{
  "identifiers": {
    "coingecko": "uniswap" | null,
    "coinmarketcap": "2392" | null,
    "defillama": "uniswap-v3" | null,
    "github": ["uniswap"] | [],
    "x": "Uniswap" | null,
    "website": "https://uniswap.org" | null
  }
}

Maintains backward compatibility with existing top-level fields.
"""

import json
from collections import defaultdict
from pathlib import Path

WORKSPACE = Path("/workspace")
PROJECTS_FILE = WORKSPACE / "public" / "data" / "projects.json"
MAPPING_FILE = WORKSPACE / "tmp" / "phase15" / "defillama_mapping_v3.json"
ZK_RECOVERY_FILE = WORKSPACE / "tmp" / "phase15" / "zk_recovery.json"
OUT_DIR = WORKSPACE / "tmp" / "phase15"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def build_identifier_registry():
    with open(PROJECTS_FILE) as f:
        projects = json.load(f)["projects"]
    with open(MAPPING_FILE) as f:
        mapping = json.load(f)
    with open(ZK_RECOVERY_FILE) as f:
        zk = json.load(f)

    # Индекс mapping по project_id
    mapping_by_pid = {r["project_id"]: r["defillama_mapping"] for r in mapping["results"]}
    # Индекс ZK recovery по project_id
    zk_by_pid = {r["project_id"]: r for r in zk["recovery"]}

    enriched = []
    for p in projects:
        pid = p.get("id")
        dl = mapping_by_pid.get(pid, {})
        zk_rec = zk_by_pid.get(pid, {})

        # Сбор идентификаторов
        coingecko = p.get("coingeckoId") or (zk_rec.get("identifiers", {}) or {}).get("coingeckoId")
        coinmarketcap = p.get("cmcId")
        defillama = None
        if dl.get("status") in ("MAPPED", "MAPPED_NEEDS_REVIEW"):
            defillama = dl.get("defillama_slug")

        # github
        github_list = []
        if p.get("githubOrg"):
            github_list.append(p["githubOrg"])
        elif (zk_rec.get("identifiers", {}) or {}).get("githubOrg"):
            github_list.append(zk_rec["identifiers"]["githubOrg"])

        x_handle = p.get("xHandle") or (zk_rec.get("identifiers", {}) or {}).get("xHandle")
        website = p.get("website") or (zk_rec.get("identifiers", {}) or {}).get("website")

        identifiers = {
            "coingecko": coingecko,
            "coinmarketcap": str(coinmarketcap) if coinmarketcap else None,
            "defillama": defillama,
            "github": github_list,
            "x": x_handle,
            "website": website,
        }

        # Доп. мета
        identifiers_meta = {
            "defillama_status": dl.get("status"),
            "defillama_confidence": dl.get("match_confidence"),
            "defillama_verified": dl.get("verified", False),
            "defillama_methods": dl.get("match_method", []),
            "defillama_tvl_usd": dl.get("candidate_tvl"),
            "defillama_category": dl.get("candidate_category"),
            "recovered_via": None,
        }
        if pid in zk_by_pid and zk_by_pid[pid].get("identifiers"):
            identifiers_meta["recovered_via"] = "coingecko_recovery_phase15"

        # Duplicate flag
        if zk_rec.get("duplicates"):
            identifiers_meta["duplicate_alerts"] = zk_rec["duplicates"]

        # Создаём enriched запись
        enriched_project = dict(p)  # copy existing fields for backward compat
        enriched_project["identifiers"] = identifiers
        enriched_project["identifier_metadata"] = identifiers_meta
        enriched.append(enriched_project)

    return enriched


def compute_coverage(enriched):
    total = len(enriched)
    coverage = {
        "coingecko": 0,
        "coinmarketcap": 0,
        "defillama": 0,
        "github": 0,
        "x": 0,
        "website": 0,
    }
    for p in enriched:
        ids = p["identifiers"]
        if ids["coingecko"]: coverage["coingecko"] += 1
        if ids["coinmarketcap"]: coverage["coinmarketcap"] += 1
        if ids["defillama"]: coverage["defillama"] += 1
        if ids["github"]: coverage["github"] += 1
        if ids["x"]: coverage["x"] += 1
        if ids["website"]: coverage["website"] += 1
    return total, {k: (v, round(v/total*100, 1) if total else 0) for k, v in coverage.items()}


def main():
    print("=" * 78)
    print("PAYD INTELLIGENCE V2 — Phase 1.5: Identifier Registry Builder")
    print("=" * 78)
    print()

    enriched = build_identifier_registry()
    total, coverage = compute_coverage(enriched)
    print(f"Всего проектов: {total}")
    print()
    print("--- ПОКРЫТИЕ ИДЕНТИФИКАТОРАМИ ---")
    for k, (n, pct) in coverage.items():
        bar = "█" * int(pct // 2)
        print(f"  {k:<14} {n:>4}/{total} ({pct:>5.1f}%) {bar}")
    print()

    # DefiLlama разбивка по статусам
    by_dl_status = defaultdict(int)
    for p in enriched:
        st = p["identifier_metadata"].get("defillama_status") or "NOT_MAPPED"
        by_dl_status[st] += 1
    print("--- DEFILLAMA MAPPING STATUS ---")
    for st, n in sorted(by_dl_status.items(), key=lambda x: -x[1]):
        print(f"  {st:<24} {n:>4} ({n/total*100:.1f}%)")
    print()

    # Сохранение
    out_path = OUT_DIR / "identifier_registry.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({
            "metadata": {
                "total_projects": total,
                "coverage": {k: {"count": v[0], "pct": v[1]} for k, v in coverage.items()},
                "defillama_status_breakdown": dict(by_dl_status),
            },
            "projects": enriched,
        }, f, ensure_ascii=False, indent=2)
    print(f"Сохранено: {out_path}")

    # Также сохраняем в public/data (для UI использования, но не заменяем projects.json)
    enriched_path = WORKSPACE / "public" / "data" / "projects_enriched.json"
    with open(enriched_path, "w", encoding="utf-8") as f:
        json.dump({"projects": enriched}, f, ensure_ascii=False, indent=2)
    print(f"Копия для UI: {enriched_path}")
    print()

    # Топ-10 проектов по полноте
    by_count = sorted(enriched, key=lambda p: -sum(1 for v in p["identifiers"].values() if v))
    print("--- ТОП-10 проектов по полноте identifiers ---")
    for p in by_count[:10]:
        ids = p["identifiers"]
        present = sum(1 for v in ids.values() if v)
        print(f"  {p['id']:<28} {p.get('symbol', '?'):<8} полнота={present}/6")
    print()

    # Bottom-10
    print("--- BOTTOM-10 проектов по полноте identifiers ---")
    for p in by_count[-10:]:
        ids = p["identifiers"]
        present = sum(1 for v in ids.values() if v)
        print(f"  {p['id']:<28} {p.get('symbol', '?'):<8} полнота={present}/6")


if __name__ == "__main__":
    main()
