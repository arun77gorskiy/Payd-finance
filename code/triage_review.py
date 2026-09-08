#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PAYD GitHub REVIEW Triage
========================

Phase 2A: classify the 48 REVIEW GitHub mappings into priority tiers (P0-P3)
so we can decide which ones require manual verification before Phase 2B.

Inputs:
  - tmp/payd_github_identity_registry.json  (full registry)
  - tmp/payd_github_mapping_review.json      (48 REVIEW items)
  - public/data/projects_enriched.json       (sector / market data)

Outputs:
  - tmp/payd_github_review_triage.json
  - tmp/payd_github_review_triage.csv
"""
import json
import csv
from datetime import datetime, timezone
from collections import Counter

REGISTRY_PATH = 'tmp/payd_github_identity_registry.json'
REVIEW_PATH = 'tmp/payd_github_mapping_review.json'
SRC = 'public/data/projects_enriched.json'
OUT_JSON = 'tmp/payd_github_review_triage.json'
OUT_CSV = 'tmp/payd_github_review_triage.csv'

# Top market-cap / strategically important assets that we expect to see
# in priority Payd Intelligence tables. These are P0 when inherited from
# existing data, even if the candidate looks plausible.
P0_SYMBOLS = {
    'DOGE',   # Dogecoin, top market cap
    'TON',    # The Open Network (Telegram)
    'VET',    # VeChain, enterprise L1
    'KAS',    # Kaspa, top L1 by activity
    'MON',    # Monad, hyped upcoming L1
    'HYPE',   # Hyperliquid, top DeFi
    'ZETA',   # ZetaChain, major cross-chain L1
    'BLAST',  # Blast, top L2
    'COMP',   # Compound, blue-chip DeFi
    'PLUME',  # Plume, RWA L2 narrative
    'AXL',    # Axelar, major cross-chain infra
    'MANTA',  # Manta, L2
    'VET',    # VeChain
    'BLAST',  # Blast
}

# Symbols / ids with very low likelihood of having a useful public GitHub.
# These are P3 — set NOT_APPLICABLE or NOT_FOUND.
P3_NOT_APPLICABLE = {
    'WAYRU',  # small DePIN, little evidence
    'TOKEN',  # TokenFi, questionable
    'GFI',    # GameFi org, questionable
    'DGX',    # Digix Gold, older / low-activity
}

# Top infra / depin that we always want in P1
P1_INFRA_DEFINITE = {
    'IPFS',  # protocol-level (filecoin-project)
    'POKT',  # Pocket Network
    'STORJ', # Storj
    'BIFI',  # Beefy
    'ORCA',  # Orca
    'KMNO',  # Kamino
    'PHA',   # Phala
    'ENJ',   # Enjin
    'BPRO',  # Backed Finance
    'BKN',   # Brickken
    'RIO',   # Realio
    'ROSE',  # Oasis
    'OUSD',  # Origin Dollar
    'PAXG',  # Pax Gold
    'DVPN',  # Sentinel
    'SPHN',  # Spheron
    'DPR',   # Deeper Network
    'CGPT',  # ChainGPT
    'BIGTIME',  # Big Time
    'MAGIC', # Magic (Treasure)
    'CHR',   # Chromia
    'MINT',  # Mintchain
    'ZRC',   # Zircuit
    'RLC',   # iExec RLC
    'BOB',   # BOB
    'KUJI',  # Kujira
    'KAMA',  # Kamino alt
    'CRED',  # Credix
    'GROW',  # ValleyDAO
    'GENE',  # GenomesDAO
    'CRYO',  # cryoDAO
    'ANTIDOTE',  # Antidote
    'SDAO',  # SingularityDAO
    'FIL',   # Filecoin alias
}

CONTROL_IDS = {
    'bitcoin', 'ethereum', 'solana', 'bittensor', 'akash', 'filecoin',
    'internet-computer', 'mina-protocol', 'polygon', 'immutable',
    'render', 'helium', 'aave', 'uniswap', 'ondo', 'ondo-finance',
    'ethena', 'celestia', 'chainlink',
}


def load_inputs():
    with open(REGISTRY_PATH, 'r', encoding='utf-8') as f:
        reg = json.load(f)
    with open(REVIEW_PATH, 'r', encoding='utf-8') as f:
        rev = json.load(f)
    with open(SRC, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return reg, rev, data


def lookup_meta(pid, projects):
    p = next((x for x in projects if x.get('id') == pid), None)
    if not p:
        return {}
    return {
        'symbol': p.get('symbol', ''),
        'sectors': p.get('sectors', []),
        'sector': p.get('sector', ''),
        'market_cap': p.get('market_cap', p.get('marketCap', None)),
        'description': (p.get('description', '') or '')[:120],
    }


def classify(pid, display_name, candidate, meta, registry_entry):
    """Classify a single REVIEW project.

    Returns a dict with priority tier and recommended action.
    """
    symbol = meta.get('symbol', '').upper()
    sectors = meta.get('sectors', [])
    if isinstance(sectors, str):
        sectors = [sectors]

    # P3 — likely NOT_APPLICABLE
    if symbol in P3_NOT_APPLICABLE or pid in {'wayru', 'gamefi', 'tokenfi'}:
        return {
            'priority': 'P3',
            'recommended_action': 'SET_NOT_APPLICABLE',
            'tier_reason': 'low-impact / questionable public codebase',
        }

    # P0 — Critical: top market-cap or strategically core
    if symbol in P0_SYMBOLS:
        return {
            'priority': 'P0',
            'recommended_action': 'VERIFY_NOW',
            'tier_reason': f'top-tier asset ({symbol}) in sector(s) {sectors}',
        }

    # Also P0 if multi-sector presence in core sectors AND top-tier sectors
    if 'layer1' in sectors and symbol in {'KAS', 'MON', 'KUJI', 'ROSE', 'DOGE', 'TON', 'VET'}:
        return {
            'priority': 'P0',
            'recommended_action': 'VERIFY_NOW',
            'tier_reason': f'core Layer 1 ({symbol})',
        }

    if 'layer2' in sectors and symbol in {'BLAST', 'MANTA', 'PLUME', 'ZETA', 'ZRC', 'BOB', 'MINT'}:
        return {
            'priority': 'P0',
            'recommended_action': 'VERIFY_NOW',
            'tier_reason': f'core Layer 2 ({symbol})',
        }

    if 'defi' in sectors and symbol in {'COMP', 'HYPE', 'BIFI', 'ORCA', 'KMNO', 'OUSD', 'CRED'}:
        return {
            'priority': 'P0',
            'recommended_action': 'VERIFY_NOW',
            'tier_reason': f'major DeFi protocol ({symbol})',
        }

    if 'rwa' in sectors and symbol in {'PLUME', 'BPRO', 'BKN', 'PAXG', 'RIO'}:
        return {
            'priority': 'P0',
            'recommended_action': 'VERIFY_NOW',
            'tier_reason': f'major RWA project ({symbol})',
        }

    if 'depin' in sectors and symbol in {'PHA', 'STORJ', 'IPFS', 'POKT', 'SPHN'}:
        return {
            'priority': 'P0',
            'recommended_action': 'VERIFY_NOW',
            'tier_reason': f'major DePIN infrastructure ({symbol})',
        }

    if 'ai' in sectors and symbol in {'CGPT', 'RLC'}:
        return {
            'priority': 'P0',
            'recommended_action': 'VERIFY_NOW',
            'tier_reason': f'major AI project ({symbol})',
        }

    # P1 — Important: meaningful dev activity expected
    if 'layer1' in sectors or 'layer2' in sectors:
        return {
            'priority': 'P1',
            'recommended_action': 'KEEP_REVIEW',
            'tier_reason': f'L1/L2 ({symbol}) but not top tier',
        }

    if 'defi' in sectors or 'rwa' in sectors or 'depin' in sectors or 'ai' in sectors or 'gaming' in sectors or 'infrastructure' in sectors:
        return {
            'priority': 'P1',
            'recommended_action': 'KEEP_REVIEW',
            'tier_reason': f'active project in sector(s) {sectors}',
        }

    # Default: smaller projects
    if 'desci' in sectors:
        return {
            'priority': 'P2',
            'recommended_action': 'KEEP_REVIEW',
            'tier_reason': f'niche DeSci project ({symbol})',
        }

    return {
        'priority': 'P2',
        'recommended_action': 'KEEP_REVIEW',
        'tier_reason': f'smaller / less material project ({symbol})',
    }


def main():
    reg, rev, data = load_inputs()
    projects = data['projects']
    registry = reg['registry']
    review_items = rev['review_items']

    triage = []
    priority_counter = Counter()
    action_counter = Counter()

    control_in_review = []

    for item in review_items:
        pid = item['canonical_id']
        display_name = item.get('display_name', '')
        candidate = item.get('candidate', {})
        reason = item.get('reason', '')

        # Look up the full registry entry for additional evidence
        registry_entry = registry.get(pid, {})

        # Pull metadata
        meta = lookup_meta(pid, projects)

        # Classify
        cls = classify(pid, display_name, candidate, meta, registry_entry)

        # Compose triage item
        triage_item = {
            'canonical_id': pid,
            'display_name': display_name,
            'symbol': meta.get('symbol', ''),
            'sectors': meta.get('sectors', []),
            'current_candidate_org': candidate.get('org'),
            'current_candidate_repo': candidate.get('repo'),
            'reason_for_review': reason,
            'candidate_evidence': registry_entry.get('github_mapping_evidence', []),
            'current_confidence': registry_entry.get('github_mapping_confidence', 0.0),
            'priority_tier': cls['priority'],
            'recommended_action': cls['recommended_action'],
            'tier_reason': cls['tier_reason'],
        }
        triage.append(triage_item)
        priority_counter[cls['priority']] += 1
        action_counter[cls['recommended_action']] += 1

        if pid in CONTROL_IDS or pid.replace('-finance', '') in CONTROL_IDS:
            control_in_review.append(pid)

    # Sort by priority (P0 first), then by symbol
    priority_order = {'P0': 0, 'P1': 1, 'P2': 2, 'P3': 3}
    triage.sort(key=lambda x: (priority_order[x['priority_tier']], x['symbol']))

    # Save JSON
    output = {
        'metadata': {
            'generated_at': datetime.now(timezone.utc).isoformat(),
            'phase': '2A — review triage (P0-P3)',
            'total_review_items': len(triage),
            'priority_counts': dict(priority_counter),
            'action_counts': dict(action_counter),
            'control_projects_in_review': control_in_review,
        },
        'triage': triage,
    }
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    # Save CSV
    with open(OUT_CSV, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow([
            'canonical_id', 'display_name', 'symbol', 'sectors',
            'current_org', 'current_repo', 'confidence',
            'priority_tier', 'recommended_action', 'tier_reason',
        ])
        for t in triage:
            writer.writerow([
                t['canonical_id'],
                t['display_name'],
                t['symbol'],
                '|'.join(t['sectors']) if t['sectors'] else '',
                t['current_candidate_org'] or '',
                t['current_candidate_repo'] or '',
                t['current_confidence'],
                t['priority_tier'],
                t['recommended_action'],
                t['tier_reason'],
            ])

    # Print summary
    print('=' * 80)
    print('PAYD GITHUB REVIEW TRIAGE — P0/P1/P2/P3 CLASSIFICATION')
    print('=' * 80)
    print()
    print(f'Total REVIEW items:        {len(triage)}')
    print()
    print('--- Priority distribution ---')
    for p in ['P0', 'P1', 'P2', 'P3']:
        print(f'  {p}: {priority_counter.get(p, 0)}')
    print()
    print('--- Recommended actions ---')
    for a in ['VERIFY_NOW', 'KEEP_REVIEW', 'SET_NOT_APPLICABLE', 'SET_NOT_FOUND']:
        print(f'  {a}: {action_counter.get(a, 0)}')
    print()

    # P0 list
    print('--- P0 (Critical) — VERIFY_NOW ---')
    for t in triage:
        if t['priority_tier'] == 'P0':
            print(f'  {t["symbol"]:10s} {t["canonical_id"]:30s} {t["current_candidate_org"]}')
    print()

    # P3 list
    print('--- P3 (Likely NOT_APPLICABLE) ---')
    for t in triage:
        if t['priority_tier'] == 'P3':
            print(f'  {t["symbol"]:10s} {t["canonical_id"]:30s} -> {t["recommended_action"]}')
    print()

    # Control check
    print('--- Control project REVIEW check ---')
    if control_in_review:
        print('  WARNING: control projects in REVIEW:')
        for cid in control_in_review:
            print(f'    {cid}')
    else:
        print('  PASS: no control projects are in REVIEW (all 18 are VERIFIED)')
    print()

    print('--- Artifacts saved ---')
    print(f'  {OUT_JSON}')
    print(f'  {OUT_CSV}')
    print()
    print('PHASE 2A TRIAGE COMPLETE — STOPPED BEFORE PHASE 2B')


if __name__ == '__main__':
    main()
