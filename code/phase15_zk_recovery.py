#!/usr/bin/env python3
"""
PAYD INTELLIGENCE V2 — Phase 1.5 Part 3: ZK Project Recovery
=============================================================
Recovers identifiers for the 15 ZK-sector projects using CoinGecko as source.
Also detects duplicate/alias records.

Sources:
  - CoinGecko /coins/list (local cache) — for id+symbol+name
  - CoinGecko /coins/{id} (per project) — for links, categories, description
  - Existing projects.json — for duplicate detection
"""

import json
import re
import time
import urllib.request
import urllib.error
from collections import defaultdict
from pathlib import Path

WORKSPACE = Path("/workspace")
PROJECTS_FILE = WORKSPACE / "public" / "data" / "projects.json"
CG_LIST_FILE = WORKSPACE / "tmp" / "phase15" / "coingecko_coins_list.json"
OUT_DIR = WORKSPACE / "tmp" / "phase15"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# 15 ZK projects to recover
ZK_PROJECT_IDS = [
    "zcash", "polygon-ecosystem-token", "midnight-3", "ozone-chain", "humanity",
    "zerobase", "railgun", "nexus-4", "zencash", "mina-protocol", "cysic",
    "concordium", "pirate-chain", "movement", "succinct",
]


def load_cg_list():
    with open(CG_LIST_FILE) as f:
        return json.load(f)


def find_in_cg_list(coin_id, coins_list):
    """Найти монету в CoinGecko списке по id или близкому имени."""
    exact = [c for c in coins_list if c.get("id") == coin_id]
    if exact:
        return exact[0], "exact_id"
    # пробуем нормализовать id (midnight-3 → midnight)
    norm = re.sub(r"-\d+$", "", coin_id)
    near = [c for c in coins_list if c.get("id") == norm]
    if near:
        return near[0], "normalized_id"
    return None, "not_found"


def fetch_coin_details(coin_id, retries=2):
    """Получить детальную информацию о монете из CoinGecko (с retry)."""
    url = f"https://api.coingecko.com/api/v3/coins/{coin_id}?localization=false&tickers=false&market_data=false&community_data=true&developer_data=true&sparkline=false"
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "PAYD-Audit/1.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print(f"    rate-limited, waiting 10s...")
                time.sleep(10)
            elif attempt < retries:
                time.sleep(2)
            else:
                return None
        except Exception as e:
            if attempt < retries:
                time.sleep(2)
            else:
                print(f"    ERROR: {e}")
                return None
    return None


def extract_identifiers(detail):
    """Извлечь нужные идентификаторы из детальной записи CoinGecko."""
    if not detail:
        return None
    links = detail.get("links", {}) or {}
    repos = links.get("repos_url", {}) or {}
    github = None
    for url in (repos.get("github") or []):
        # https://github.com/owner/repo → owner
        m = re.match(r"https?://github\.com/([^/]+)/?", url)
        if m:
            github = m.group(1)
            break
    twitter = None
    for url in (links.get("twitter_screen_name") or []):
        if isinstance(url, str) and url.strip():
            twitter = url.strip().lstrip("@")
            break

    homepage = None
    for h in (links.get("homepage") or []):
        if h and isinstance(h, str) and h.strip():
            homepage = h.strip()
            break

    return {
        "coingeckoId": detail.get("id"),
        "name": detail.get("name"),
        "symbol": (detail.get("symbol") or "").upper(),
        "cmcId": None,  # CoinGecko не возвращает cmcId в free API
        "description": (detail.get("description", {}) or {}).get("en", ""),
        "categories": detail.get("categories", []),
        "githubOrg": github,
        "xHandle": twitter,
        "website": homepage,
        "genesis_date": detail.get("genesis_date"),
        "coingecko_rank": detail.get("coingecko_rank"),
        "coingecko_score": detail.get("coingecko_score"),
    }


def detect_duplicates(zk_project, all_projects):
    """Найти дубликаты/alias-записи в общем списке."""
    matches = []
    zk_id = zk_project["id"]
    zk_symbol = (zk_project.get("symbol") or "").upper()
    zk_name_norm = re.sub(r"[^a-z0-9]", "", (zk_project.get("name") or "").lower())
    for p in all_projects:
        if p["id"] == zk_id:
            continue  # это сама запись
        # проверяем по символу и нормализованному имени
        p_symbol = (p.get("symbol") or "").upper()
        p_name_norm = re.sub(r"[^a-z0-9]", "", (p.get("name") or "").lower())
        if p_symbol and zk_symbol and p_symbol == zk_symbol:
            matches.append({
                "project_id": p["id"],
                "match_type": "symbol",
                "sector": p.get("sector"),
                "coingeckoId": p.get("coingeckoId"),
            })
        elif p_name_norm and zk_name_norm and (p_name_norm == zk_name_norm or
                                                p_name_norm.startswith(zk_name_norm) or
                                                zk_name_norm.startswith(p_name_norm)):
            if len(zk_name_norm) >= 4:
                matches.append({
                    "project_id": p["id"],
                    "match_type": "name",
                    "sector": p.get("sector"),
                    "coingeckoId": p.get("coingeckoId"),
                })
    return matches


def main():
    print("=" * 78)
    print("PAYD INTELLIGENCE V2 — Phase 1.5: ZK Project Recovery")
    print("=" * 78)
    print()

    with open(PROJECTS_FILE) as f:
        projects = json.load(f)["projects"]
    coins_list = load_cg_list()
    print(f"Всего проектов PAYD: {len(projects)}")
    print(f"CoinGecko монет в кэше: {len(coins_list)}")
    print()

    # Фокус на ZK проектах
    zk_projects = [p for p in projects if p["id"] in ZK_PROJECT_IDS]
    print(f"Найдено ZK проектов в PAYD: {len(zk_projects)}")
    print()

    recovery = []
    for zp in zk_projects:
        print(f"--- {zp['id']} ({zp.get('symbol')}) — {zp.get('name')} ---")
        print(f"  current sector: {zp.get('sector')}, sectors: {zp.get('sectors')}")
        print(f"  current coingeckoId: {zp.get('coingeckoId')}, cmcId: {zp.get('cmcId')}")

        # 1) Поиск в CoinGecko списке
        cg_match, match_type = find_in_cg_list(zp["id"], coins_list)
        if not cg_match:
            print(f"  ✗ Не найдено в CoinGecko по id={zp['id']}")
            recovery.append({
                "project_id": zp["id"],
                "current_name": zp.get("name"),
                "current_symbol": zp.get("symbol"),
                "coingecko_status": "not_found",
                "identifiers": None,
                "duplicates": [],
            })
            print()
            continue

        print(f"  ✓ CoinGecko: {cg_match['id']} ({cg_match['symbol']}) — {cg_match['name']} (match={match_type})")

        # 2) Запрос деталей
        detail = fetch_coin_details(cg_match["id"])
        time.sleep(0.5)  # polite delay

        if not detail:
            print(f"  ✗ Не удалось получить /coins/{cg_match['id']}")
            recovery.append({
                "project_id": zp["id"],
                "current_name": zp.get("name"),
                "current_symbol": zp.get("symbol"),
                "coingecko_status": "detail_fetch_failed",
                "cg_match_id": cg_match["id"],
                "identifiers": None,
                "duplicates": [],
            })
            print()
            continue

        ids = extract_identifiers(detail)
        print(f"  ✓ Identifiers: name={ids['name']}, sym={ids['symbol']}, "
              f"website={ids['website']}, x={ids['xHandle']}, github={ids['githubOrg']}")
        print(f"    rank={ids.get('coingecko_rank')}, categories={ids.get('categories', [])[:5]}")

        # 3) Поиск дубликатов
        duplicates = detect_duplicates(zp, projects)
        if duplicates:
            print(f"  ⚠ Найдены возможные дубликаты:")
            for d in duplicates:
                print(f"     - {d['project_id']} (match={d['match_type']}, sector={d['sector']}, "
                      f"coingeckoId={d.get('coingeckoId')})")
        else:
            print(f"  ✓ Дубликатов не найдено")

        recovery.append({
            "project_id": zp["id"],
            "current_name": zp.get("name"),
            "current_symbol": zp.get("symbol"),
            "current_sector": zp.get("sector"),
            "coingecko_status": "ok",
            "cg_match_id": cg_match["id"],
            "match_type": match_type,
            "identifiers": ids,
            "duplicates": duplicates,
        })
        print()

    # Сохраняем
    out_path = OUT_DIR / "zk_recovery.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({
            "metadata": {
                "total_zk_projects": len(zk_projects),
                "recovered": sum(1 for r in recovery if r.get("identifiers")),
                "duplicates_found": sum(1 for r in recovery if r.get("duplicates")),
            },
            "recovery": recovery,
        }, f, ensure_ascii=False, indent=2)
    print(f"Результаты сохранены: {out_path}")
    print()

    # Краткая сводка
    print("=" * 78)
    print("СВОДКА ZK RECOVERY")
    print("=" * 78)
    print()
    for r in recovery:
        status = r.get("coingecko_status")
        pid = r["project_id"]
        if status == "ok":
            ids = r["identifiers"]
            dup_n = len(r.get("duplicates", []))
            dup_str = f" [DUPS: {dup_n}]" if dup_n else ""
            print(f"  ✓ {pid:<28} → CG:{ids['coingeckoId']:<25} sym:{ids['symbol']:<8} "
                  f"web:{'yes' if ids['website'] else 'no':<3} gh:{'yes' if ids['githubOrg'] else 'no':<3} "
                  f"x:{'yes' if ids['xHandle'] else 'no':<3}{dup_str}")
        else:
            print(f"  ✗ {pid:<28} → status={status}")


if __name__ == "__main__":
    main()
