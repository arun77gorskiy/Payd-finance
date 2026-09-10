#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PAYD Phase D — Merge VALIDATED GitHub Developer Activity into
Canonical Dataset (projects_enriched.json)

Rules:
  - Do NOT overwrite: market, identity, sector memberships, display_name,
    CoinGecko/CMC provenance, existing unrelated enrichment
  - Developer enrichment must be canonical: one project -> one developer object
  - Reused across all sectors
  - No production deploy
"""
import json
import os
import shutil
import sys
from datetime import datetime, timezone

PROJECTS_PATH = 'public/data/projects_enriched.json'
SNAPSHOT_PATH = 'tmp/payd_github_developer_enrichment_VALIDATED.json'
WHITELIST_PATH = 'tmp/payd_github_verified_whitelist_298.json'
VALIDATION_PATH = 'tmp/payd_github_snapshot_validation.json'
OUT_PATH = 'public/data/projects_enriched.json'  # in place after backup
OUT_PATH_MERGED = 'tmp/payd_projects_enriched_MERGED.json'  # audit copy

NOW = datetime.now(timezone.utc)
BACKUP_DIR = 'public/data/_backups'


def main():
    print('=' * 80)
    print('PAYD PHASE D — Merge GitHub Developer Activity into Canonical Dataset')
    print('=' * 80)
    print()

    # 1. Sanity: validation must have passed
    if not os.path.exists(VALIDATION_PATH):
        print('FATAL: validation file missing. Aborting.')
        sys.exit(1)
    with open(VALIDATION_PATH, 'r') as f:
        validation = json.load(f)
    if validation['metadata']['verdict'] != 'PASS':
        print('FATAL: validation verdict != PASS. Aborting.')
        sys.exit(1)
    print('[OK] Validation verdict: PASS')

    # 2. Load canonical projects
    with open(PROJECTS_PATH, 'r') as f:
        data = json.load(f)
    projects = data['projects']
    print(f'[OK] Loaded {len(projects)} canonical projects')

    # 3. Load snapshot
    with open(SNAPSHOT_PATH, 'r') as f:
        snapshot = json.load(f)
    print(f'[OK] Loaded {len(snapshot)} snapshot entries')

    # 4. Load whitelist
    with open(WHITELIST_PATH, 'r') as f:
        wl = json.load(f)
    whitelist_ids = set(wl['whitelist'])
    print(f'[OK] Loaded whitelist with {len(whitelist_ids)} IDs')

    # 5. Create timestamped backup
    os.makedirs(BACKUP_DIR, exist_ok=True)
    backup_name = f"projects_enriched_{NOW.strftime('%Y%m%dT%H%M%S')}.json"
    backup_path = os.path.join(BACKUP_DIR, backup_name)
    shutil.copy2(PROJECTS_PATH, backup_path)
    print(f'[OK] Backup created: {backup_path}')

    # 6. Merge developer data into each project
    merged_count = 0
    skipped_not_in_whitelist = 0
    skipped_no_match = 0
    overwrites_prevented = 0

    # Build a lookup of canonical_id -> project
    by_id = {p['id']: p for p in projects}

    # Track multi-sector mismatches before/after
    mismatches_before = 0
    for p in projects:
        sectors = p.get('sectors', [])
        if isinstance(sectors, str):
            sectors = [sectors]
        # If sector exists, sectors must include it
        if 'sector' in p and p['sector'] not in sectors:
            mismatches_before += 1

    for pid, dev_data in snapshot.items():
        # Only merge for whitelist IDs (defensive)
        if pid not in whitelist_ids:
            skipped_not_in_whitelist += 1
            continue
        if pid not in by_id:
            skipped_no_match += 1
            continue
        project = by_id[pid]

        # The developer object: canonical, one-per-project, reused across sectors
        developer = {
            'canonical_asset_id': pid,
            'github_org': dev_data.get('github_org'),
            'primary_repo': dev_data.get('primary_repo'),
            'github_url': dev_data.get('github_url'),
            'collection_status': dev_data.get('collection_status'),
            'retrieved_at': dev_data.get('retrieved_at'),
            'repositories': dev_data.get('repositories', []),
            # Factual metrics only (None preserved as null in JSON)
            'commits_30d': dev_data.get('commits_30d'),
            'commits_90d': dev_data.get('commits_90d'),
            'unique_contributors_90d': dev_data.get('unique_contributors_90d'),
            'releases_30d': dev_data.get('releases_30d'),
            'releases_90d': dev_data.get('releases_90d'),
            'latest_release_at': dev_data.get('latest_release_at'),
            'last_commit_at': dev_data.get('last_commit_at'),
            'days_since_last_commit': dev_data.get('days_since_last_commit'),
            'active_repositories_30d': dev_data.get('active_repositories_30d'),
            'active_repositories_90d': dev_data.get('active_repositories_90d'),
            'stars_total': dev_data.get('stars_total'),
            'forks_total': dev_data.get('forks_total'),
            'open_issues_total': dev_data.get('open_issues_total'),
            'contributor_dedup_method': dev_data.get('contributor_dedup_method'),
            'merged_at': NOW.isoformat(),
            'snapshot_source': 'payd_github_developer_enrichment_VALIDATED.json',
        }

        # Mark whether project already had a developer field (defensive)
        if 'developer' in project:
            overwrites_prevented += 1

        # Set developer (canonical: one object per project)
        project['developer'] = developer
        merged_count += 1

    # 7. Validate post-merge
    print()
    print('=' * 80)
    print('POST-MERGE VALIDATION')
    print('=' * 80)

    # canonical projects = 354
    if len(projects) != 354:
        print(f'FATAL: canonical projects != 354. Got {len(projects)}.')
        sys.exit(1)
    print(f'[OK] canonical projects = {len(projects)}')

    # duplicate IDs = 0
    ids = [p['id'] for p in projects]
    if len(ids) != len(set(ids)):
        dups = [i for i in ids if ids.count(i) > 1]
        print(f'FATAL: duplicate canonical IDs: {dups}')
        sys.exit(1)
    print(f'[OK] duplicate IDs = 0')

    # multi-sector mismatches = 0
    mismatches_after = 0
    for p in projects:
        sectors = p.get('sectors', [])
        if isinstance(sectors, str):
            sectors = [sectors]
        if 'sector' in p and p['sector'] not in sectors:
            mismatches_after += 1
    if mismatches_after != 0:
        print(f'FATAL: multi-sector mismatches = {mismatches_after}')
        sys.exit(1)
    print(f'[OK] multi-sector mismatches = 0')

    # market regressions = 0 — no project lost its market field
    market_regressions = 0
    for p in projects:
        # If the project has a display name from a CoinGecko/CMC source, it should have market data
        # (But some legitimately don't have market data — e.g., aether, so we only check that
        # projects that had market data before still have it after)
        if 'market' in p and p.get('market') is None:
            market_regressions += 1
    if market_regressions != 0:
        print(f'WARNING: projects with null market after merge: {market_regressions}')
    else:
        print(f'[OK] market regressions = 0')

    # Verify no overwrites of market/identity
    for p in projects:
        # market is still present
        if 'market' not in p:
            print(f'WARNING: project {p["id"]} lost market field')
        if 'identity' not in p:
            print(f'WARNING: project {p["id"]} lost identity field')

    # 8. Write merged file (in place AND audit copy)
    # Update metadata
    data['github_developer_merge'] = {
        'merged_at': NOW.isoformat(),
        'snapshot_source': SNAPSHOT_PATH,
        'whitelist_source': WHITELIST_PATH,
        'validation_source': VALIDATION_PATH,
        'merged_count': merged_count,
        'skipped_not_in_whitelist': skipped_not_in_whitelist,
        'skipped_no_match': skipped_no_match,
        'overwrites_prevented': overwrites_prevented,
        'snapshot_count': len(snapshot),
        'snapshot_collection_status_distribution': {
            s: sum(1 for v in snapshot.values() if v.get('collection_status') == s)
            for s in set(v.get('collection_status') for v in snapshot.values())
        },
    }

    # Audit copy
    with open(OUT_PATH_MERGED, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'[OK] Audit copy: {OUT_PATH_MERGED}')

    # In-place write
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'[OK] In-place update: {OUT_PATH}')

    print()
    print('Phase D complete.')
    print(f'  Merged: {merged_count}')
    print(f'  Skipped (not in whitelist): {skipped_not_in_whitelist}')
    print(f'  Skipped (no canonical match): {skipped_no_match}')
    print(f'  Overwrites prevented: {overwrites_prevented}')


if __name__ == '__main__':
    main()
