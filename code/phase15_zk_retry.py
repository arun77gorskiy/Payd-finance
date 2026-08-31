#!/usr/bin/env python3
"""
Retry ZK recovery for the 5 projects that hit rate limit.
Use longer delays and fetch via /coins/{id} for details.
"""
import json
import time
import urllib.request
import urllib.error
import re
from pathlib import Path

WORKSPACE = Path("/workspace")
CG_LIST_FILE = WORKSPACE / "tmp" / "phase15" / "coingecko_coins_list.json"
OUT_FILE = WORKSPACE / "tmp" / "phase15" / "zk_recovery.json"

FAILED_IDS = ["humanity", "zerobase", "zencash", "succinct", "mina-protocol"]


def fetch_coin_details(coin_id):
    url = f"https://api.coingecko.com/api/v3/coins/{coin_id}?localization=false&tickers=false&market_data=false&community_data=true&developer_data=true&sparkline=false"
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "PAYD-Audit/1.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 30 * (attempt + 1)
                print(f"    429 rate-limited (attempt {attempt+1}), waiting {wait}s...")
                time.sleep(wait)
            else:
                print(f"    HTTP {e.code}: {e.reason}")
                time.sleep(5)
        except Exception as e:
            print(f"    ERROR: {e}")
            time.sleep(5)
    return None


def extract_identifiers(detail):
    links = detail.get("links", {}) or {}
    repos = links.get("repos_url", {}) or {}
    github = None
    for url in (repos.get("github") or []):
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
        "description": (detail.get("description", {}) or {}).get("en", ""),
        "categories": detail.get("categories", []),
        "githubOrg": github,
        "xHandle": twitter,
        "website": homepage,
        "genesis_date": detail.get("genesis_date"),
        "coingecko_rank": detail.get("coingecko_rank"),
    }


def main():
    # Загружаем существующий recovery
    with open(OUT_FILE) as f:
        data = json.load(f)

    print(f"Retrying {len(FAILED_IDS)} projects with longer delays...")
    for cid in FAILED_IDS:
        print(f"\n--- {cid} ---")
        detail = fetch_coin_details(cid)
        if detail:
            ids = extract_identifiers(detail)
            print(f"  ✓ name={ids['name']} sym={ids['symbol']}")
            print(f"    web={ids['website']} x={ids['xHandle']} gh={ids['githubOrg']}")
            # Update recovery
            for r in data["recovery"]:
                if r["project_id"] == cid:
                    r["coingecko_status"] = "ok"
                    r["identifiers"] = ids
                    break
        else:
            print(f"  ✗ Still failed")
        time.sleep(3)

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\nSaved to: {OUT_FILE}")

    # Final summary
    print("\n=== FINAL ZK RECOVERY SUMMARY ===")
    for r in data["recovery"]:
        status = r.get("coingecko_status")
        pid = r["project_id"]
        if status == "ok" and r.get("identifiers"):
            ids = r["identifiers"]
            dup_n = len(r.get("duplicates", []))
            dup_str = f" [DUPS: {dup_n}]" if dup_n else ""
            print(f"  ✓ {pid:<28} → {ids['coingeckoId']:<25} sym:{ids['symbol']:<8}{dup_str}")
        else:
            print(f"  ✗ {pid:<28} → status={status}")


if __name__ == "__main__":
    main()
