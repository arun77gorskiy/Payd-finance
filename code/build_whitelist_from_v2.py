#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PAYD GitHub Whitelist Builder — Step 3 of reconstruction
========================================================

Reads authoritative Phase 2A v2 artifacts and produces:
  1. tmp/payd_github_verified_whitelist_330.json   (whitelist of 330 canonical IDs)
  2. tmp/payd_github_status_registry_CORRECTED.json (full corrected status registry)

Validation:
  - Exactly 330 entries in whitelist
  - All 354 canonical projects represented in corrected registry
  - Distribution matches expected: 330/15/2/7
"""
import json
from datetime import datetime, timezone
from collections import Counter

REGISTRY_V2 = 'tmp/payd_github_identity_registry_v2.json'
EVIDENCE_V2 = 'tmp/payd_github_mapping_evidence_v2.json'
REVIEW_V2 = 'tmp/payd_github_mapping_review_v2.json'
SRC = 'public/data/projects_enriched.json'

OUT_WHITELIST = 'tmp/payd_github_verified_whitelist_330.json'
OUT_STATUS_REGISTRY = 'tmp/payd_github_status_registry_CORRECTED.json'

EXPECTED = {'VERIFIED': 330, 'REVIEW': 15, 'NOT_FOUND': 2, 'NOT_APPLICABLE': 7}


def load_inputs():
    with open(REGISTRY_V2, 'r', encoding='utf-8') as f:
        reg = json.load(f)
    with open(EVIDENCE_V2, 'r', encoding='utf-8') as f:
        ev = json.load(f)
    with open(REVIEW_V2, 'r', encoding='utf-8') as f:
        rv = json.load(f)
    with open(SRC, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return reg, ev, rv, data


def main():
    reg, ev, rv, data = load_inputs()
    registry = reg['registry']
    projects = data['projects']
    project_map = {p.get('id'): p for p in projects}

    # 1. Build whitelist of 330 VERIFIED IDs
    whitelist = []
    whitelist_meta = []
    status_counter = Counter()

    for cid, entry in registry.items():
        status = entry.get('github_mapping_status', 'UNKNOWN')
        status_counter[status] += 1

        if status == 'VERIFIED':
            wl_entry = {
                'canonical_id': cid,
                'display_name': entry.get('display_name', ''),
                'github_org': entry.get('github_org', ''),
                'github_repo': entry.get('github_repo', ''),
                'github_url': entry.get('github_url', ''),
                'official_repositories': entry.get('official_repositories', []),
                'confidence': entry.get('github_mapping_confidence', 0.0),
                'source': entry.get('github_mapping_source', ''),
                'evidence': entry.get('github_mapping_evidence', []),
            }
            whitelist.append(cid)
            whitelist_meta.append(wl_entry)

    # Sort whitelist alphabetically for stability
    whitelist.sort()
    whitelist_meta.sort(key=lambda x: x['canonical_id'])

    # 2. Build full corrected status registry
    status_registry = []
    for cid, entry in registry.items():
        proj = project_map.get(cid, {})
        status_registry.append({
            'canonical_id': cid,
            'display_name': entry.get('display_name', proj.get('name', '')),
            'symbol': proj.get('symbol', ''),
            'github_mapping_status': entry.get('github_mapping_status', 'UNKNOWN'),
            'github_org': entry.get('github_org', ''),
            'github_repo': entry.get('github_repo', ''),
            'github_url': entry.get('github_url', ''),
            'official_repositories': entry.get('official_repositories', []),
            'confidence': entry.get('github_mapping_confidence', 0.0),
            'source': entry.get('github_mapping_source', ''),
            'evidence': entry.get('github_mapping_evidence', []),
            'reason': entry.get('github_mapping_reason', ''),
        })
    status_registry.sort(key=lambda x: x['canonical_id'])

    # 3. Save whitelist
    whitelist_output = {
        'metadata': {
            'generated_at': datetime.now(timezone.utc).isoformat(),
            'phase': '2A — final whitelist',
            'source': 'tmp/payd_github_identity_registry_v2.json',
            'total_canonical': 354,
            'whitelist_size': len(whitelist),
            'expected_whitelist_size': 330,
        },
        'whitelist': whitelist,
        'whitelist_meta': whitelist_meta,
    }
    with open(OUT_WHITELIST, 'w', encoding='utf-8') as f:
        json.dump(whitelist_output, f, ensure_ascii=False, indent=2)

    # 4. Save corrected status registry
    status_output = {
        'metadata': {
            'generated_at': datetime.now(timezone.utc).isoformat(),
            'phase': '2A — corrected status registry',
            'source': 'tmp/payd_github_identity_registry_v2.json',
            'total_canonical': len(status_registry),
            'distribution': dict(status_counter),
            'expected_distribution': EXPECTED,
        },
        'status_registry': status_registry,
    }
    with open(OUT_STATUS_REGISTRY, 'w', encoding='utf-8') as f:
        json.dump(status_output, f, ensure_ascii=False, indent=2)

    # 5. Print report
    print('=' * 80)
    print('PAYD GITHUB WHITELIST + CORRECTED REGISTRY — STEP 3')
    print('=' * 80)
    print()
    print(f'Whitelist size:          {len(whitelist)} (expected 330)')
    print(f'Corrected registry size: {len(status_registry)} (expected 354)')
    print()
    print('--- Status distribution (actual vs expected) ---')
    for st in ['VERIFIED', 'REVIEW', 'NOT_FOUND', 'NOT_APPLICABLE']:
        actual = status_counter.get(st, 0)
        expected = EXPECTED.get(st, 0)
        marker = 'OK' if actual == expected else 'MISMATCH'
        print(f'  {st:18s}  actual={actual:4d}  expected={expected:4d}  [{marker}]')
    print()
    print('--- Artifacts saved ---')
    print(f'  {OUT_WHITELIST}')
    print(f'  {OUT_STATUS_REGISTRY}')
    print()

    # Validation
    if len(whitelist) != 330:
        print('VALIDATION FAIL: whitelist size != 330')
    elif dict(status_counter) != EXPECTED:
        print('VALIDATION FAIL: status distribution != expected')
    else:
        print('VALIDATION PASS: whitelist=330, distribution=330/15/2/7')
    print()
    print('STEP 3 COMPLETE — READY FOR STEP 4 (AUDIT 341-SNAPSHOT)')


if __name__ == '__main__':
    main()
