#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test the GitHub activity collector on 5 control projects first."""
import sys
sys.path.insert(0, 'code')
from collect_github_activity import (
    collect_repo_metrics, aggregate_metrics, NOW, OUT_SNAPSHOT, REGISTRY_V2
)
import json
import time

# Load registry
with open(REGISTRY_V2, 'r') as f:
    reg = json.load(f)
registry = reg['registry']

TEST_IDS = ['bitcoin', 'ethereum', 'solana', 'aave', 'uniswap']

print(f"Testing on {len(TEST_IDS)} control projects")
print('=' * 80)

snapshot = {}
for pid in TEST_IDS:
    entry = registry[pid]
    repos = entry.get('official_repositories', [])
    role_map = entry.get('repository_roles') or {}

    print(f"\n{pid}: {entry.get('display_name')} ({len(repos)} repos)")
    per_repo = []
    for full_repo in repos:
        org, repo = full_repo.split('/', 1)
        print(f"  collecting {full_repo}...", end=' ', flush=True)
        rm = collect_repo_metrics(org, repo)
        per_repo.append(rm)
        print(f"{rm['collection_status']} (commits_30d={rm.get('commits_30d')}, contribs={rm.get('contributors_90d')}, stars={rm.get('stars')})")
        time.sleep(0.2)

    canonical = aggregate_metrics(per_repo, pid, role_map)
    canonical['github_org'] = entry.get('github_org')
    canonical['primary_repo'] = entry.get('github_repo')
    canonical['github_url'] = entry.get('github_url')
    snapshot[pid] = canonical
    print(f"  AGG: commits_30d={canonical['commits_30d']} commits_90d={canonical['commits_90d']} unique_contributors={canonical['unique_contributors_90d']} releases_90d={canonical['releases_90d']}")

# Save test
import os
os.makedirs('tmp', exist_ok=True)
with open('tmp/payd_github_developer_test.json', 'w') as f:
    json.dump(snapshot, f, ensure_ascii=False, indent=2)

print()
print('Test snapshot saved to tmp/payd_github_developer_test.json')
