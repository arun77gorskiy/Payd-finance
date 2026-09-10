#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PAYD Sector Rotation Engine V3 (PHASE G)
=========================================

Implements the FULL spec from the user:
  - Two-gate eligibility (market cap + activity)
  - Phase H: Discovery / Replacement Pool
  - Phase I: New Dry-Run Report (per-sector)
  - Phase J: Sanity Controls (flag major projects for REVIEW)

This version runs in DRY-RUN mode (no production writes).
"""
import json
import os
import sys
from datetime import datetime, timezone
from collections import defaultdict, Counter

from activity_status_classifier_v2 import (
    ActivityClassifierV2,
    ACTIVITY_STATES,
    REASON,
    HARD_DEAD_DAYS,
    MIN_RECENT_COMMITS_90D,
    MIN_CONTRIBUTORS_FOR_ACTIVE,
)

MIN_MARKET_CAP_USD = 5_000_000

ALL_SECTORS = [
    'Layer1', 'Layer2', 'DeFi', 'DePIN', 'AI',
    'RWA', 'DeSci', 'Gaming', 'Infrastructure', 'ZK',
]
SECTOR_NORMALIZE = {
    'layer1': 'Layer1', 'l1': 'Layer1',
    'layer2': 'Layer2', 'l2': 'Layer2',
    'defi': 'DeFi',
    'depin': 'DePIN',
    'ai': 'AI', 'artificial-intelligence': 'AI',
    'rwa': 'RWA',
    'desci': 'DeSci',
    'gaming': 'Gaming', 'game': 'Gaming',
    'infrastructure': 'Infrastructure', 'infra': 'Infrastructure',
    'zk': 'ZK', 'zero-knowledge': 'ZK',
}

PROJECTS_FILE = 'public/data/projects_enriched.json'
SECTOR_CONFIG_FILE = 'public/data/sector_config.json'
REGISTRY_FILE = 'tmp/payd_github_identity_registry.json'
SNAPSHOT_FILE = 'tmp/payd_github_developer_enrichment_VALIDATED.json'
ACTIVITY_RESULTS_FILE = 'tmp/payd_project_activity_status_v2.json'
VALIDATION_FILE = 'tmp/payd_github_snapshot_validation.json'

# Outputs
OUT_ACTIVE_UNIVERSE = 'tmp/payd_v3_active_sector_universe.json'
OUT_REMOVALS = 'tmp/payd_v3_sector_rotation_removals.json'
OUT_ADDITIONS = 'tmp/payd_v3_sector_rotation_additions.json'
OUT_CANDIDATES = 'tmp/payd_v3_discovery_candidate_pool.json'
OUT_REPORT_MD = 'tmp/payd_v3_sector_rotation_dryrun_report.md'
OUT_REPORT_JSON = 'tmp/payd_v3_sector_rotation_dryrun_report.json'
OUT_SANITY = 'tmp/payd_v3_sanity_controls.json'

NOW = datetime.now(timezone.utc)

# Major projects that must not become INACTIVE due to mapping/API artifacts
# (Phase J explicit review)
MAJOR_PROJECTS = [
    'bitcoin', 'ethereum', 'solana', 'bnb', 'binancecoin', 'cardano', 'avalanche',
    'bittensor', 'akash', 'filecoin', 'chainlink', 'aave', 'uniswap', 'render',
    'helium', 'ondo', 'ondo-finance', 'monad', 'sui', 'aptos', 'arbitrum', 'optimism',
    'polygon', 'cosmos', 'near', 'cosmos-hub', 'fantom', 'tron', 'stellar',
]


def normalize_sector(s):
    if not s:
        return None
    return SECTOR_NORMALIZE.get(s.lower(), s if s in ALL_SECTORS else None)


def get_market_cap(project):
    market = project.get('market') or {}
    if isinstance(market, dict):
        v = market.get('market_cap_usd')
        if v is not None:
            try:
                val = float(v)
                if val > 0:
                    return val
            except (ValueError, TypeError):
                pass
    for key in ['market_cap_usd', 'marketCap', 'market_cap', 'mc_usd']:
        v = project.get(key)
        if v is not None:
            try:
                val = float(v)
                if val > 0:
                    return val
            except (ValueError, TypeError):
                pass
    return None


def get_mc_source(project):
    """Return the market data source for provenance."""
    prov = project.get('market_provenance', {})
    if isinstance(prov, dict):
        return prov.get('source') or prov.get('provider') or 'UNKNOWN'
    return 'UNKNOWN'


def is_identity_verified(pid, registry):
    if not isinstance(registry, dict):
        return False
    entry = registry.get(pid)
    if not entry:
        return False
    status = entry.get('github_mapping_status') or entry.get('identity_status')
    return status in ('VERIFIED', 'NOT_APPLICABLE')


def is_tradable(project):
    """Whether the asset is tradable."""
    # Most projects are tradable unless explicitly marked otherwise
    return project.get('tradable', True)


def main():
    print('=' * 80)
    print('PAYD SECTOR ROTATION ENGINE V3 — DRY-RUN')
    print('=' * 80)
    print()

    # Sanity: validation must have passed
    if not os.path.exists(VALIDATION_FILE):
        print('FATAL: validation file missing')
        sys.exit(1)
    with open(VALIDATION_FILE, 'r') as f:
        validation = json.load(f)
    if validation['metadata']['verdict'] != 'PASS':
        print('FATAL: validation verdict != PASS')
        sys.exit(1)

    with open(PROJECTS_FILE, 'r') as f:
        projects_data = json.load(f)
    projects = projects_data['projects']

    with open(REGISTRY_FILE, 'r') as f:
        reg = json.load(f)
    registry = reg['registry']

    with open(SNAPSHOT_FILE, 'r') as f:
        snapshot = json.load(f)

    with open(ACTIVITY_RESULTS_FILE, 'r') as f:
        activity_results = json.load(f)

    print(f'Projects: {len(projects)}')
    print(f'Snapshot: {len(snapshot)}')
    print(f'GitHub snapshot validated: True')
    print()

    # Group projects by sector
    by_sector = defaultdict(list)
    for p in projects:
        sectors_field = p.get('sectors') or p.get('sector') or []
        if isinstance(sectors_field, str):
            sectors_field = [sectors_field]
        for s in sectors_field:
            normalized = normalize_sector(s)
            if normalized and normalized in ALL_SECTORS:
                by_sector[normalized].append(p)

    # Sanity: ensure 354 total
    total_seen = set()
    for s, lst in by_sector.items():
        for p in lst:
            total_seen.add(p['id'])
    print(f'Total unique projects across sectors: {len(total_seen)}')
    if len(total_seen) != 354:
        print(f'WARNING: Expected 354 unique projects, got {len(total_seen)}')

    # ====== Build per-sector evaluation ======
    sector_results = {}
    all_removals = []
    all_additions = []
    all_candidates_pool = []
    sanity_findings = []

    for sector in ALL_SECTORS:
        candidates = by_sector.get(sector, [])
        enriched_list = []
        for p in candidates:
            pid = p['id']
            activity = activity_results.get(pid, {})
            activity_status = activity.get('project_activity_status', 'DATA_UNAVAILABLE')
            market_cap = get_market_cap(p)
            mc_source = get_mc_source(p)
            tradable = is_tradable(p)
            identity_ok = is_identity_verified(pid, registry)
            delisted = bool(p.get('delisted') or p.get('is_inactive'))

            market_cap_pass = market_cap is not None and market_cap >= MIN_MARKET_CAP_USD
            activity_pass = activity_status == 'ACTIVE'
            tradable_pass = tradable
            identity_pass = identity_ok
            delisted_pass = not delisted

            active_eligible = (
                market_cap_pass and activity_pass
                and tradable_pass and identity_pass and delisted_pass
            )

            # Get dev metrics from snapshot
            dev = snapshot.get(pid, {})
            last_commit = dev.get('last_commit_at')
            contributors_90d = dev.get('unique_contributors_90d')
            commits_30d = dev.get('commits_30d')
            commits_90d = dev.get('commits_90d')
            days_since_last = dev.get('days_since_last_commit')

            enriched = {
                'canonical_asset_id': pid,
                'display_name': p.get('display_name') or p.get('name', ''),
                'symbol': p.get('symbol', ''),
                'sector': sector,
                'market_cap_usd': market_cap,
                'mc_source': mc_source,
                'project_activity_status': activity_status,
                'activity_reason': activity.get('activity_status_reason'),
                'tradable': tradable,
                'identity_verified': identity_ok,
                'delisted': delisted,
                'gate_market_cap': market_cap_pass,
                'gate_activity': activity_pass,
                'gate_tradable': tradable_pass,
                'gate_identity': identity_pass,
                'gate_delisted': delisted_pass,
                'ACTIVE_ELIGIBLE': active_eligible,
                'commits_30d': commits_30d,
                'commits_90d': commits_90d,
                'contributors_90d': contributors_90d,
                'last_commit_at': last_commit,
                'days_since_last_commit': days_since_last,
            }
            enriched_list.append(enriched)

        # Sort by market_cap DESC (None last)
        enriched_list.sort(
            key=lambda x: (x['market_cap_usd'] if x['market_cap_usd'] is not None else -1),
            reverse=True,
        )

        # Identify active-eligible (would-be ACTIVE) — these are also candidates
        active_eligible_list = [x for x in enriched_list if x['ACTIVE_ELIGIBLE']]

        # Identify removals: items NOT eligible with reasons
        sector_removals = []
        for x in enriched_list:
            if x['ACTIVE_ELIGIBLE']:
                continue
            reasons = []
            if not x['gate_market_cap']:
                if x['market_cap_usd'] is None:
                    reasons.append('NULL_MARKET_CAP')
                else:
                    reasons.append('BELOW_MARKET_CAP_THRESHOLD')
            if not x['gate_activity']:
                if x['project_activity_status'] == 'INACTIVE':
                    reasons.append('INACTIVE')
                elif x['project_activity_status'] == 'STALE':
                    reasons.append('STALE')
                elif x['project_activity_status'] == 'DATA_UNAVAILABLE':
                    reasons.append('DATA_UNAVAILABLE')
                elif x['project_activity_status'] == 'NOT_APPLICABLE':
                    reasons.append('NOT_APPLICABLE')
                elif x['project_activity_status'] == 'REVIEW_REQUIRED':
                    reasons.append('REVIEW_REQUIRED')
            if x['delisted']:
                reasons.append('DELISTED')
            if not x['gate_tradable']:
                reasons.append('NOT_TRADABLE')
            if not x['gate_identity']:
                reasons.append('IDENTITY_UNVERIFIED')

            # Apply CRITICAL DATA-UNAVAILABLE RULES
            # 1. If activity data cannot be retrieved -> DO NOT REMOVE
            if 'DATA_UNAVAILABLE' in reasons and len(reasons) == 1:
                continue
            # 2. If market cap cannot be retrieved -> DO NOT REMOVE
            #    (even if other reasons are present)
            if x['market_cap_usd'] is None:
                continue
            # 3. If only soft reasons remain, skip
            if all(r in ('DATA_UNAVAILABLE', 'NULL_MARKET_CAP', 'NOT_APPLICABLE') for r in reasons):
                continue

            removal_record = {
                'display_name': x['display_name'],
                'ticker': x['symbol'],
                'canonical_asset_id': x['canonical_asset_id'],
                'sector': x['sector'],
                'market_cap_usd': x['market_cap_usd'],
                'mc_source': x['mc_source'],
                'commits_30d': x['commits_30d'],
                'commits_90d': x['commits_90d'],
                'contributors_90d': x['contributors_90d'],
                'last_commit_at': x['last_commit_at'],
                'project_activity_status': x['project_activity_status'],
                'removal_reasons': reasons,
                'removal_reason': ' | '.join(reasons),
            }
            sector_removals.append(removal_record)
            all_removals.append(removal_record)

        # Replacement candidates: items that ARE ACTIVE_ELIGIBLE
        # but may not be in the current universe (DRY-RUN adds them all)
        sector_additions = []
        for x in active_eligible_list:
            addition_record = {
                'display_name': x['display_name'],
                'ticker': x['symbol'],
                'canonical_asset_id': x['canonical_asset_id'],
                'sector': x['sector'],
                'market_cap_usd': x['market_cap_usd'],
                'mc_source': x['mc_source'],
                'sector_market_cap_rank': active_eligible_list.index(x) + 1,
                'discovery_source': 'validated_canonical',
                'commits_30d': x['commits_30d'],
                'commits_90d': x['commits_90d'],
                'contributors_90d': x['contributors_90d'],
                'last_commit_at': x['last_commit_at'],
                'project_activity_status': x['project_activity_status'],
            }
            sector_additions.append(addition_record)
            all_additions.append(addition_record)

        # Discovery pool: items that PASS market cap and identity gates
        # but may fail activity gate
        for x in enriched_list:
            if x['market_cap_usd'] is None or x['market_cap_usd'] < MIN_MARKET_CAP_USD:
                continue
            if not x['gate_identity']:
                continue
            # Eligible for pool if it could become ACTIVE
            all_candidates_pool.append({
                'display_name': x['display_name'],
                'ticker': x['symbol'],
                'canonical_asset_id': x['canonical_asset_id'],
                'sector': x['sector'],
                'market_cap_usd': x['market_cap_usd'],
                'project_activity_status': x['project_activity_status'],
                'is_active_eligible': x['ACTIVE_ELIGIBLE'],
                'is_in_current_universe': False,  # DRY-RUN: nothing is "current" yet
            })

        # Stats
        status_dist = Counter(x['project_activity_status'] for x in enriched_list)
        both_gates = sum(1 for x in enriched_list if x['gate_market_cap'] and x['gate_activity'])
        below_5m = sum(1 for x in enriched_list
                       if x['market_cap_usd'] is not None and x['market_cap_usd'] < MIN_MARKET_CAP_USD)
        null_mc = sum(1 for x in enriched_list if x['market_cap_usd'] is None)

        sector_results[sector] = {
            'total_master_projects': len(candidates),
            'enriched_projects': len(enriched_list),
            'mc_eligible': sum(1 for x in enriched_list if x['gate_market_cap']),
            'active_status_count': status_dist.get('ACTIVE', 0),
            'stale_status_count': status_dist.get('STALE', 0),
            'inactive_status_count': status_dist.get('INACTIVE', 0),
            'data_unavailable_count': status_dist.get('DATA_UNAVAILABLE', 0),
            'review_required_count': status_dist.get('REVIEW_REQUIRED', 0),
            'not_applicable_count': status_dist.get('NOT_APPLICABLE', 0),
            'both_gates_passed': both_gates,
            'below_5m': below_5m,
            'null_market_cap': null_mc,
            'replacement_candidates': len(sector_additions),
            'proposed_removals': len(sector_removals),
            'proposed_additions': len(sector_additions),
            'status_distribution': dict(status_dist),
        }

    # ====== Phase J: Sanity controls ======
    for pid in MAJOR_PROJECTS:
        if pid not in activity_results:
            continue
        ar = activity_results[pid]
        status = ar.get('project_activity_status')
        # Find the project
        project = next((p for p in projects if p['id'] == pid), None)
        if not project:
            continue
        ev = ar.get('evidence', {})
        c30 = ev.get('commits_30d')
        c90 = ev.get('commits_90d')
        dlc = ev.get('days_since_last_commit')
        cs = ev.get('collection_status')

        # Flag major projects with unexpected classifications
        if status in ('DATA_UNAVAILABLE', 'REVIEW_REQUIRED'):
            sanity_findings.append({
                'canonical_asset_id': pid,
                'display_name': project.get('display_name'),
                'symbol': project.get('symbol'),
                'activity_status': status,
                'reason': (
                    f'Major project {project.get("display_name")} ({project.get("symbol")}) '
                    f'has classification {status} (not ACTIVE). '
                    f'Likely due to GitHub mapping issue (collection_status={cs}, '
                    f'commits_30d={c30}, commits_90d={c90}, days_since={dlc}). '
                    f'DO NOT auto-rotate; flag for human REVIEW.'
                ),
                'evidence': ev,
                'requires_human_review': True,
            })
        if status == 'INACTIVE':
            sanity_findings.append({
                'canonical_asset_id': pid,
                'display_name': project.get('display_name'),
                'symbol': project.get('symbol'),
                'activity_status': status,
                'reason': f'Major project classified as INACTIVE — REQUIRES MANUAL REVIEW',
                'evidence': ev,
                'requires_human_review': True,
            })

    # ====== Write outputs ======
    with open(OUT_ACTIVE_UNIVERSE, 'w') as f:
        json.dump(sector_results, f, ensure_ascii=False, indent=2)
    with open(OUT_REMOVALS, 'w') as f:
        json.dump(all_removals, f, ensure_ascii=False, indent=2)
    with open(OUT_ADDITIONS, 'w') as f:
        json.dump(all_additions, f, ensure_ascii=False, indent=2)
    with open(OUT_CANDIDATES, 'w') as f:
        json.dump(all_candidates_pool, f, ensure_ascii=False, indent=2)
    with open(OUT_SANITY, 'w') as f:
        json.dump({
            'metadata': {
                'generated_at': NOW.isoformat(),
                'major_projects_checked': len(MAJOR_PROJECTS),
                'findings': len(sanity_findings),
            },
            'findings': sanity_findings,
        }, f, ensure_ascii=False, indent=2)

    # ====== Generate Markdown report ======
    md = []
    md.append('# PAYD Sector Rotation Engine v3 — DRY-RUN Report')
    md.append(f'**Generated:** {NOW.isoformat()}')
    md.append('**Engine version:** v3 (two-gate eligibility + validated GitHub snapshot)')
    md.append('**Mode:** DRY-RUN')
    md.append('**GitHub snapshot validated:** True')
    md.append('**Phase E classifier:** v2 (strict None vs 0 separation)')
    md.append('')
    md.append('## Two-Gate Eligibility Model')
    md.append('A project is **ACTIVE_ELIGIBLE** iff ALL of:')
    md.append('1. `market_cap_usd >= 5_000_000`')
    md.append('2. `project_activity_status == ACTIVE`')
    md.append('3. `tradable_asset == true`')
    md.append('4. Identity sufficiently verified')
    md.append('5. Not delisted/inactive')
    md.append('')
    md.append('**CRITICAL DATA-UNAVAILABLE RULE:**')
    md.append('Projects with null market cap or DATA_UNAVAILABLE activity are **NOT** removed.')
    md.append('Removals only happen for confirmed failures of an eligibility gate.')
    md.append('')

    # Activity status distribution
    all_statuses = Counter()
    for s, r in sector_results.items():
        for k, v in r.get('status_distribution', {}).items():
            all_statuses[k] += v
    md.append('## Activity Status Distribution (across all sectors)')
    md.append('| Status | Count |')
    md.append('|---|---|')
    for s in sorted(ACTIVITY_STATES):
        md.append(f'| {s} | {all_statuses.get(s, 0)} |')
    md.append('')

    # Per-sector summary
    md.append('## Per-Sector Eligibility Summary')
    md.append('| Sector | Total | MC OK | ACTIVE | STALE | INACTIVE | DATA_UNAV | REVIEW | BOTH gates | <$5M | NULL MC | Replacements |')
    md.append('|---|---|---|---|---|---|---|---|---|---|---|---|')
    for sector in ALL_SECTORS:
        r = sector_results.get(sector, {})
        md.append(
            f"| {sector} | {r.get('total_master_projects', 0)} | "
            f"{r.get('mc_eligible', 0)} | {r.get('active_status_count', 0)} | "
            f"{r.get('stale_status_count', 0)} | {r.get('inactive_status_count', 0)} | "
            f"{r.get('data_unavailable_count', 0)} | {r.get('review_required_count', 0)} | "
            f"{r.get('both_gates_passed', 0)} | {r.get('below_5m', 0)} | "
            f"{r.get('null_market_cap', 0)} | {r.get('replacement_candidates', 0)} |"
        )
    md.append('')

    # Proposed removals
    md.append(f'## Proposed Removals (DRY-RUN) — {len(all_removals)} total')
    md.append('| Display Name | Ticker | Sector | Market Cap | MC Source | c30 | c90 | contribs | Last Commit | Activity | Removal Reason |')
    md.append('|---|---|---|---|---|---|---|---|---|---|---|')
    for r in all_removals[:100]:  # First 100 for readability
        mc_str = f"${r['market_cap_usd']:,.0f}" if r['market_cap_usd'] is not None else 'N/A'
        md.append(
            f"| {r['display_name']} | {r['ticker']} | {r['sector']} | "
            f"{mc_str} | {r['mc_source']} | {r['commits_30d']} | "
            f"{r['commits_90d']} | {r['contributors_90d']} | "
            f"{r['last_commit_at']} | {r['project_activity_status']} | "
            f"{r['removal_reason']} |"
        )
    if len(all_removals) > 100:
        md.append(f'\\* ({len(all_removals) - 100} more rows in JSON)')
    md.append('')

    # Proposed additions
    md.append(f'## Replacement / Addition Candidates (DRY-RUN) — {len(all_additions)} total')
    md.append('| Display Name | Ticker | Sector | Market Cap | MC Source | Sector MC Rank | Discovery Source |')
    md.append('|---|---|---|---|---|---|---|')
    for a in all_additions[:50]:
        mc_str = f"${a['market_cap_usd']:,.0f}" if a['market_cap_usd'] is not None else 'N/A'
        md.append(
            f"| {a['display_name']} | {a['ticker']} | {a['sector']} | "
            f"{mc_str} | {a['mc_source']} | {a['sector_market_cap_rank']} | "
            f"{a['discovery_source']} |"
        )
    if len(all_additions) > 50:
        md.append(f'\\* ({len(all_additions) - 50} more rows in JSON)')
    md.append('')

    # Sanity findings
    md.append(f'## Phase J — Sanity Control Findings — {len(sanity_findings)} flags')
    if sanity_findings:
        md.append('| Project | Ticker | Classification | Reason |')
        md.append('|---|---|---|---|')
        for s in sanity_findings:
            md.append(
                f"| {s['display_name']} | {s['symbol']} | "
                f"{s['activity_status']} | {s['reason']} |"
            )
    else:
        md.append('_No major project flagged for manual review._')
    md.append('')

    md.append('## Artifacts')
    md.append(f'- `{OUT_ACTIVE_UNIVERSE}`')
    md.append(f'- `{OUT_REMOVALS}`')
    md.append(f'- `{OUT_ADDITIONS}`')
    md.append(f'- `{OUT_CANDIDATES}`')
    md.append(f'- `{OUT_SANITY}`')
    md.append(f'- `{OUT_REPORT_JSON}`')

    with open(OUT_REPORT_MD, 'w') as f:
        f.write('\n'.join(md))

    # JSON report
    json_report = {
        'metadata': {
            'generated_at': NOW.isoformat(),
            'engine_version': 'v3',
            'mode': 'DRY_RUN',
            'github_snapshot_validated': True,
            'phase_e_classifier': 'v2 (strict None vs 0)',
            'min_market_cap_usd': MIN_MARKET_CAP_USD,
            'major_projects_reviewed': MAJOR_PROJECTS,
        },
        'activity_status_distribution': dict(all_statuses),
        'per_sector': sector_results,
        'removals_count': len(all_removals),
        'additions_count': len(all_additions),
        'discovery_pool_count': len(all_candidates_pool),
        'sanity_findings_count': len(sanity_findings),
    }
    with open(OUT_REPORT_JSON, 'w') as f:
        json.dump(json_report, f, ensure_ascii=False, indent=2)

    print()
    print('=' * 80)
    print('SUMMARY')
    print('=' * 80)
    print(f'Total projects:  {len(projects)}')
    print(f'Total unique across sectors: {len(total_seen)}')
    print()
    print('Activity status distribution:')
    for s in sorted(ACTIVITY_STATES):
        print(f'  {s:18s}: {all_statuses.get(s, 0):4d}')
    print()
    print(f'Proposed removals: {len(all_removals)}')
    print(f'Proposed additions: {len(all_additions)}')
    print(f'Discovery pool: {len(all_candidates_pool)}')
    print(f'Sanity findings: {len(sanity_findings)}')
    print()
    print('Per-sector:')
    for sector in ALL_SECTORS:
        r = sector_results.get(sector, {})
        print(
            f"  {sector:18s}: {r.get('both_gates_passed', 0):3d} both / "
            f"{r.get('total_master_projects', 0):3d} total / "
            f"{r.get('replacement_candidates', 0):3d} replacements"
        )
    print()
    print('Output files:')
    print(f'  {OUT_ACTIVE_UNIVERSE}')
    print(f'  {OUT_REMOVALS}')
    print(f'  {OUT_ADDITIONS}')
    print(f'  {OUT_CANDIDATES}')
    print(f'  {OUT_REPORT_MD}')
    print(f'  {OUT_REPORT_JSON}')
    print(f'  {OUT_SANITY}')


if __name__ == '__main__':
    main()
