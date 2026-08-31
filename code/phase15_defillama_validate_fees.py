#!/usr/bin/env python3
"""
PAYD INTELLIGENCE V2 — Phase 1.5: DefiLlama Fees/Revenue Validation (v2)
========================================================================
Re-validates fees and revenue with correct handling of total24h field.
"""

import json
import time
import urllib.request
import urllib.error
from collections import defaultdict
from pathlib import Path

WORKSPACE = Path("/workspace")
MAPPING_FILE = WORKSPACE / "tmp" / "phase15" / "defillama_mapping_v3.json"
VALIDATION_FILE = WORKSPACE / "tmp" / "phase15" / "defillama_validation.json"
OUT_DIR = WORKSPACE / "tmp" / "phase15"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def fetch_json(url, timeout=12):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "PAYD-Audit/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def has_metric(slug, metric):
    """metric in ('fees', 'revenue')"""
    url = f"https://api.llama.fi/summary/{metric}/{slug}"
    d = fetch_json(url)
    if not d:
        return False, None
    total24h = d.get("total24h")
    if isinstance(total24h, (int, float)) and total24h > 0:
        return True, total24h
    return False, total24h


def main():
    with open(VALIDATION_FILE) as f:
        validation = json.load(f)
    results = validation["results"]

    print(f"Re-validating fees/revenue for {len(results)} protocols...")
    counters = defaultdict(int)
    updated = []
    for i, r in enumerate(results):
        slug = r["defillama_slug"]
        has_fees, fees_24h = has_metric(slug, "fees")
        time.sleep(0.3)
        has_revenue, rev_24h = has_metric(slug, "revenue")
        time.sleep(0.3)

        r["validation"]["has_fees"] = has_fees
        r["validation"]["fees_24h"] = fees_24h
        r["validation"]["has_revenue"] = has_revenue
        r["validation"]["revenue_24h"] = rev_24h

        if has_fees: counters["has_fees"] += 1
        if has_revenue: counters["has_revenue"] += 1
        updated.append(r)

        status_bits = []
        if r["validation"].get("has_tvl"): status_bits.append("tvl")
        if has_fees: status_bits.append(f"fees=${fees_24h:,.0f}" if fees_24h else "fees")
        if has_revenue: status_bits.append(f"rev=${rev_24h:,.0f}" if rev_24h else "rev")
        print(f"  [{i+1}/{len(results)}] {r['project_id']:<28} → {slug:<32} {' | '.join(status_bits)}")

    validation["results"] = updated
    validation["metadata"]["availability_counts"] = dict(counters)
    with open(VALIDATION_FILE, "w") as f:
        json.dump(validation, f, ensure_ascii=False, indent=2)
    print()
    print(f"--- ИТОГИ ---")
    for k, n in counters.items():
        print(f"  {k:<14} {n}/{len(results)} ({n/len(results)*100:.1f}%)")


if __name__ == "__main__":
    main()
