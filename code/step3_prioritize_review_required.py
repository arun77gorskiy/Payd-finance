#!/usr/bin/env python3
"""
STEP 3 — PRIORITIZE THE 144 REVIEW_REQUIRED PROJECTS
Classify each by:
P0 — ROTATION CRITICAL (Market Cap >= $5M + sector relevance)
P1 — MARKET-ELIGIBLE BUT NON-CRITICAL (Market Cap >= $5M, non-critical)
P2 — BELOW MARKET CAP THRESHOLD (Market Cap < $5M)
P3 — MARKET DATA UNAVAILABLE

Also report:
- canonical_asset_id
- display_name
- ticker
- sectors
- verified market_cap_usd
- market-cap source
- current sector membership
- whether currently visible in active sector tables
- sector market-cap rank
- GitHub review reason
"""
import json
import os
from datetime import datetime, timezone
from collections import defaultdict

REGISTRY_PATH = "/workspace/tmp/payd_github_identity_registry.json"
WHITELIST_PATH = "/workspace/tmp/payd_github_verified_whitelist_298.json"
PROJECTS_PATH = "/workspace/public/data/projects_enriched.json"
SECTOR_CONFIG_PATH = "/workspace/public/data/sector_config.json"
OUT_REVIEW_QUEUE = "/workspace/tmp/payd_github_rotation_critical_review.json"

with open(REGISTRY_PATH) as f:
    reg = json.load(f)
with open(WHITELIST_PATH) as f:
    wl = json.load(f)
with open(PROJECTS_PATH) as f:
    projects_data = json.load(f)
with open(SECTOR_CONFIG_PATH) as f:
    sector_config = json.load(f)

registry = reg['registry']
deferred_ids = (wl.get('deferred') or {}).get('review_required', [])
deferred_set = set(deferred_ids)

# Build map of canonical_id -> project
projects_list = projects_data['projects']
projects_by_id = {p['id']: p for p in projects_list}

# Build sector config
sector_cfg_by_name = {s['sector']: s for s in sector_config}

# For each project in deferred list, find market cap and sectors
# Also build sector-level rankings
sector_members = defaultdict(list)  # sector -> [(mcap, canonical_id, project)]
no_market_data = []

for pid in deferred_ids:
    p = projects_by_id.get(pid)
    if not p:
        no_market_data.append({'id': pid, 'reason': 'no_project_record'})
        continue
    mcap = p.get('market', {}).get('market_cap_usd')
    sectors = p.get('sectors', []) or ([p['sector']] if p.get('sector') else [])
    if mcap is None or mcap == 0:
        no_market_data.append({'id': pid, 'reason': 'no_market_cap', 'sectors': sectors})
        continue
    for s in sectors:
        sector_members[s].append({
            'canonical_id': pid,
            'display_name': p.get('name', pid),
            'ticker': p.get('symbol'),
            'market_cap_usd': mcap,
        })

# Sort each sector by market cap descending and assign rank
sector_rank = {}
for s, members in sector_members.items():
    members.sort(key=lambda x: -x['market_cap_usd'])
    for rank, m in enumerate(members, 1):
        sector_rank[(m['canonical_id'], s)] = rank

# Build the priority queue
priority_queue = []
p0_list = []
p1_list = []
p2_list = []
p3_list = []

for pid in deferred_ids:
    p = projects_by_id.get(pid)
    reg_entry = registry.get(pid, {})

    # Extract market data
    if p:
        display_name = p.get('name', pid)
        ticker = p.get('symbol')
        sectors = p.get('sectors', []) or ([p['sector']] if p.get('sector') else [])
        mcap = p.get('market', {}).get('market_cap_usd')
        mcap_source = 'CoinMarketCap' if p.get('cmcId') else ('CoinGecko' if p.get('coingeckoId') else None)
        tier = p.get('tier', 'unknown')
        verified_status = p.get('verifiedStatus', 'unknown')
    else:
        display_name = pid
        ticker = None
        sectors = []
        mcap = None
        mcap_source = None
        tier = None
        verified_status = None

    # Sector rank within each sector
    sector_ranks = {s: sector_rank.get((pid, s), None) for s in sectors}

    # GitHub review reason
    github_reason = reg_entry.get('github_mapping_notes', 'Unknown — needs review')

    # Current sector presence: is the project in sector_members?
    in_sector_active = any(s in sector_members for s in sectors)
    sector_max_rank = max([r for r in sector_ranks.values() if r is not None] or [None])

    # P3 if market data unavailable
    if mcap is None or mcap == 0:
        priority = 'P3'
        reason = 'MARKET_DATA_UNAVAILABLE'
        p3_list.append({
            'canonical_asset_id': pid,
            'display_name': display_name,
            'ticker': ticker,
            'sectors': sectors,
            'verified_market_cap_usd': mcap,
            'market_cap_source': mcap_source,
            'tier': tier,
            'verified_status': verified_status,
            'in_active_sector_tables': in_sector_active,
            'sector_market_cap_ranks': sector_ranks,
            'github_review_reason': github_reason[:200],
            'priority': priority,
            'priority_reason': reason,
        })
        continue

    # P2 if below $5M
    if mcap < 5_000_000:
        priority = 'P2'
        reason = 'BELOW_MARKET_CAP_THRESHOLD'
        p2_list.append({
            'canonical_asset_id': pid,
            'display_name': display_name,
            'ticker': ticker,
            'sectors': sectors,
            'verified_market_cap_usd': mcap,
            'market_cap_source': mcap_source,
            'tier': tier,
            'verified_status': verified_status,
            'in_active_sector_tables': in_sector_active,
            'sector_market_cap_ranks': sector_ranks,
            'github_review_reason': github_reason[:200],
            'priority': priority,
            'priority_reason': reason,
        })
        continue

    # P0 vs P1
    # P0 criteria:
    #   - market cap >= $5M
    #   - AND (in active sector position OR close to capacity OR replacement candidate OR strategically important)
    is_p0 = False
    p0_reason = []
    if in_sector_active:
        is_p0 = True
        p0_reason.append('currently_in_active_sector')
    if tier in ('tier1', 'tier2'):
        is_p0 = True
        p0_reason.append(f'tier={tier}')
    # Close to sector capacity: within min_projects of any sector
    for s in sectors:
        cfg = sector_cfg_by_name.get(s)
        if cfg:
            min_projects = cfg.get('min_projects', 30)
            current_count = len(sector_members.get(s, []))
            # If rank within 5 of capacity (i.e., rank <= current_count and rank >= current_count - 5)
            rank_in_sector = sector_ranks.get(s)
            if rank_in_sector and current_count - rank_in_sector <= 5:
                is_p0 = True
                p0_reason.append(f'near_capacity_in_{s}')

    if is_p0:
        priority = 'P0'
        reason = ' + '.join(p0_reason)
        p0_list.append({
            'canonical_asset_id': pid,
            'display_name': display_name,
            'ticker': ticker,
            'sectors': sectors,
            'verified_market_cap_usd': mcap,
            'market_cap_source': mcap_source,
            'tier': tier,
            'verified_status': verified_status,
            'in_active_sector_tables': in_sector_active,
            'sector_market_cap_ranks': sector_ranks,
            'github_review_reason': github_reason[:200],
            'priority': priority,
            'priority_reason': reason,
            'existing_candidate_github_mapping': reg_entry.get('github_repo'),
            'proposed_repo': None,  # to be filled in step 5
            'recommended_next_action': 'P0 GitHub repair — use official website/docs to find correct repo',
        })
    else:
        priority = 'P1'
        reason = 'MARKET_ELIGIBLE_BUT_NON_CRITICAL'
        p1_list.append({
            'canonical_asset_id': pid,
            'display_name': display_name,
            'ticker': ticker,
            'sectors': sectors,
            'verified_market_cap_usd': mcap,
            'market_cap_source': mcap_source,
            'tier': tier,
            'verified_status': verified_status,
            'in_active_sector_tables': in_sector_active,
            'sector_market_cap_ranks': sector_ranks,
            'github_review_reason': github_reason[:200],
            'priority': priority,
            'priority_reason': reason,
        })

# Sort P0 by: sector presence, market cap desc, sector membership count
def p0_sort_key(p):
    return (
        -int(p.get('in_active_sector_tables', False)),
        -p.get('verified_market_cap_usd', 0),
        -len(p.get('sectors', [])),
    )

p0_list.sort(key=p0_sort_key)

# Sort P1 by market cap desc
p1_list.sort(key=lambda p: -p.get('verified_market_cap_usd', 0))
p2_list.sort(key=lambda p: -p.get('verified_market_cap_usd', 0))

# Save atomic
def atomic_write(path, data):
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)

review_doc = {
    'metadata': {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'total_review_required': len(deferred_ids),
        'p0_count': len(p0_list),
        'p1_count': len(p1_list),
        'p2_count': len(p2_list),
        'p3_count': len(p3_list),
        'priority_definitions': {
            'P0': 'ROTATION CRITICAL: Market Cap >= $5M AND in active sector / tier1-2 / near capacity / replacement candidate',
            'P1': 'MARKET-ELIGIBLE BUT NON-CRITICAL: Market Cap >= $5M but not currently affecting active sectors',
            'P2': 'BELOW MARKET CAP THRESHOLD: Market Cap < $5M (fails economic eligibility gate)',
            'P3': 'MARKET DATA UNAVAILABLE: Cannot classify by market cap',
        },
        'note': 'P0 are sorted by (in_active_sector, market_cap desc, sector_membership_count). Use P0 only for targeted GitHub repair.',
    },
    'summary': {
        'P0': len(p0_list),
        'P1': len(p1_list),
        'P2': len(p2_list),
        'P3': len(p3_list),
    },
    'P0_rotation_critical': p0_list,
    'P1_market_eligible_non_critical': p1_list,
    'P2_below_market_cap': p2_list,
    'P3_market_data_unavailable': p3_list,
    'sector_membership_stats': {
        s: {
            'member_count': len(members),
            'min_projects': sector_cfg_by_name.get(s, {}).get('min_projects'),
            'top_5_by_market_cap': [
                {'canonical_id': m['canonical_id'], 'mcap': m['market_cap_usd']}
                for m in members[:5]
            ],
        }
        for s, members in sector_members.items()
    },
}

atomic_write(OUT_REVIEW_QUEUE, review_doc)

print(f"P0 (ROTATION CRITICAL):       {len(p0_list)}")
print(f"P1 (MARKET-ELIGIBLE, NON-CRITICAL): {len(p1_list)}")
print(f"P2 (BELOW MARKET CAP):        {len(p2_list)}")
print(f"P3 (MARKET DATA UNAVAILABLE): {len(p3_list)}")
print()
print("=== TOP 20 P0 (rotation critical) ===")
for p in p0_list[:20]:
    print(f"  {p['canonical_asset_id']:30s} ticker={p['ticker']:10s} mcap=${p['verified_market_cap_usd']/1e6:.1f}M sectors={p['sectors']}")
