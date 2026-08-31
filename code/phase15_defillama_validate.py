#!/usr/bin/env python3
"""
PAYD INTELLIGENCE V2 — Phase 1.5 Part 2: DefiLlama Data Validation
=================================================================
For each MAPPED project, test which DefiLlama metrics are actually available.
Sets per-protocol availability flags:
  - has_tvl
  - has_fees
  - has_revenue
  - has_volume
"""

import json
import time
import urllib.request
import urllib.error
from collections import defaultdict
from pathlib import Path

WORKSPACE = Path("/workspace")
MAPPING_FILE = WORKSPACE / "tmp" / "phase15" / "defillama_mapping_v3.json"
OUT_DIR = WORKSPACE / "tmp" / "phase15"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def fetch_json(url, timeout=15):
    for attempt in range(2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "PAYD-Audit/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code == 429:
                time.sleep(5)
            else:
                return None
        except Exception:
            return None
    return None


def validate_protocol(slug):
    """Validate which metrics are available for a given DefiLlama protocol."""
    flags = {
        "has_tvl": False,
        "has_fees": False,
        "has_revenue": False,
        "has_volume": False,
        "tvl_value": None,
        "chains": [],
        "category": None,
    }

    # 1) TVL (protocol info)
    data = fetch_json(f"https://api.llama.fi/protocol/{slug}")
    if data:
        tvl_raw = data.get("tvl")
        if isinstance(tvl_raw, (int, float)):
            tvl = float(tvl_raw)
        elif isinstance(tvl_raw, list) and tvl_raw:
            last = tvl_raw[-1]
            if isinstance(last, dict):
                tvl = float(last.get("totalLiquidityUSD", 0))
            elif isinstance(last, (list, tuple)) and len(last) > 1:
                tvl = float(last[1])
            else:
                tvl = 0.0
        else:
            tvl = 0.0
        flags["has_tvl"] = bool(tvl and tvl > 0) or bool(data.get("currentChainTvls"))
        flags["tvl_value"] = tvl
        flags["chains"] = list((data.get("chains") or []))[:10]
        flags["category"] = data.get("category")
        if not flags["has_tvl"] and "currentChainTvls" in data:
            flags["has_tvl"] = True
        if not flags["has_tvl"] and "currentChainTvls" in data:
            flags["has_tvl"] = True

    time.sleep(0.3)

    # 2) Fees
    fees_data = fetch_json(f"https://api.llama.fi/summary/fees/{slug}?dataType=daily")
    if fees_data:
        total = fees_data.get("totalDataChart") or fees_data.get("total24h")
        if total is not None:
            if isinstance(total, list) and len(total) > 0:
                # last point
                last = total[-1] if isinstance(total[-1], (int, float)) else (total[-1][1] if len(total[-1]) > 1 else 0)
                flags["has_fees"] = bool(last and last > 0) or len(total) > 0
            elif isinstance(total, (int, float)):
                flags["has_fees"] = total > 0

    time.sleep(0.3)

    # 3) Revenue
    rev_data = fetch_json(f"https://api.llama.fi/summary/revenue/{slug}?dataType=daily")
    if rev_data:
        total = rev_data.get("totalDataChart") or rev_data.get("total24h")
        if total is not None:
            if isinstance(total, list) and len(total) > 0:
                last = total[-1] if isinstance(total[-1], (int, float)) else (total[-1][1] if len(total[-1]) > 1 else 0)
                flags["has_revenue"] = bool(last and last > 0) or len(total) > 0
            elif isinstance(total, (int, float)):
                flags["has_revenue"] = total > 0

    time.sleep(0.3)

    # 4) Volume (only for DEX) — use /dex/: doesn't exist, but volume is in protocol data
    if data and data.get("volume") is not None and (data.get("volume", 0) or 0) > 0:
        flags["has_volume"] = True

    return flags


def main():
    print("=" * 78)
    print("PAYD INTELLIGENCE V2 — Phase 1.5: DefiLlama Data Validation")
    print("=" * 78)

    with open(MAPPING_FILE) as f:
        mapping = json.load(f)

    # Берём только MAPPED и NEEDS_REVIEW
    to_validate = [r for r in mapping["results"]
                   if r["defillama_mapping"]["status"] in ("MAPPED", "MAPPED_NEEDS_REVIEW")]

    print(f"Протоколов для валидации: {len(to_validate)}")
    print()

    validated = []
    counters = defaultdict(int)
    for i, r in enumerate(to_validate):
        m = r["defillama_mapping"]
        slug = m["defillama_slug"]
        print(f"  [{i+1}/{len(to_validate)}] {r['project_id']:<28} → {slug:<32} ", end="", flush=True)
        flags = validate_protocol(slug)
        for k in ("has_tvl", "has_fees", "has_revenue", "has_volume"):
            if flags[k]: counters[k] += 1
        validated.append({
            "project_id": r["project_id"],
            "symbol": r["symbol"],
            "sector": r["sector"],
            "defillama_slug": slug,
            "defillama_name": m.get("defillama_name"),
            "match_confidence": m["match_confidence"],
            "validation": flags,
        })
        bits = []
        if flags["has_tvl"]: bits.append(f"tvl=${flags['tvl_value']:>14,.0f}" if flags['tvl_value'] else "tvl=yes")
        if flags["has_fees"]: bits.append("fees")
        if flags["has_revenue"]: bits.append("revenue")
        if flags["has_volume"]: bits.append("volume")
        print(" | ".join(bits) if bits else "(no metrics)")
        time.sleep(0.5)

    out_path = OUT_DIR / "defillama_validation.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({
            "metadata": {
                "total_validated": len(validated),
                "availability_counts": dict(counters),
            },
            "results": validated,
        }, f, ensure_ascii=False, indent=2)
    print()
    print(f"Сохранено: {out_path}")
    print()
    print("--- ИТОГОВАЯ ДОСТУПНОСТЬ МЕТРИК ---")
    for k, n in counters.items():
        pct = n / len(validated) * 100 if validated else 0
        print(f"  {k:<12} {n:>4}/{len(validated)} ({pct:.1f}%)")


if __name__ == "__main__":
    main()
