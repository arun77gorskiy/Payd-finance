#!/usr/bin/env python3
"""
Apply P0 repair results to the registry.
For each VERIFIED_UPDATED entry:
- Update registry entry's github_repo and github_url
- Update whitelist_meta entry
- Mark as VERIFIED_UPDATED

Then collect fresh GitHub metrics for the 19 repaired projects.
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

REGISTRY_PATH = "/workspace/tmp/payd_github_identity_registry.json"
WHITELIST_PATH = "/workspace/tmp/payd_github_verified_whitelist_298.json"
REPAIR_PATH = "/workspace/tmp/payd_github_p0_repair_results.json"

# Load
with open(REGISTRY_PATH) as f:
    reg = json.load(f)
with open(WHITELIST_PATH) as f:
    wl = json.load(f)
with open(REPAIR_PATH) as f:
    repair = json.load(f)

registry = reg['registry']
meta = {e['canonical_id']: e for e in wl['whitelist_meta']}
deferred = set((wl.get('deferred') or {}).get('review_required', []))

# Process VERIFIED_UPDATED entries
verified_updated = [r for r in repair['repair_results'] if r['outcome'] == 'VERIFIED_UPDATED']
print(f"VERIFIED_UPDATED to apply: {len(verified_updated)}")

applied = []
for r in verified_updated:
    pid = r['canonical_asset_id']
    new_repo = r['new_repo']
    if pid in registry:
        entry = registry[pid]
        entry['github_repo'] = new_repo
        entry['github_url'] = f"https://github.com/{new_repo}"
        entry['github_mapping_status'] = 'VERIFIED_UPDATED'
        entry['github_mapping_checked_at'] = datetime.now(timezone.utc).isoformat()
        entry['github_mapping_notes'] = f"P0 repair: {r['old_repo']} -> {new_repo} ({r['confidence']})"
        applied.append({'pid': pid, 'new_repo': new_repo})
    if pid in meta:
        m = meta[pid]
        new_org = new_repo.split('/', 1)[0]
        m['github_org'] = new_org
        m['github_repo'] = new_repo
        m['official_repositories'] = [new_repo]
        m['registry_mapping_status'] = 'VERIFIED_UPDATED'
    # Remove from deferred list if present
    if pid in deferred:
        deferred.discard(pid)
        # Add back to whitelist
        if pid not in wl['whitelist']:
            wl['whitelist'].append(pid)

# Update whitelist deferred list
wl['deferred']['review_required'] = sorted(deferred)
wl['deferred']['deferred_count'] = len(deferred)
wl['metadata']['whitelist_active_count'] = len(wl['whitelist'])
wl['metadata']['whitelist_deferred_count'] = len(deferred)
wl['metadata']['whitelist_total'] = len(wl['whitelist']) + len(deferred)
wl['metadata']['p0_repair_at'] = datetime.now(timezone.utc).isoformat()
wl['metadata']['p0_repair_count'] = len(verified_updated)

reg['metadata']['p0_repair_at'] = datetime.now(timezone.utc).isoformat()
reg['metadata']['p0_repair_count'] = len(verified_updated)

# Atomic write
def atomic_write(path, data):
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)

atomic_write(REGISTRY_PATH, reg)
atomic_write(WHITELIST_PATH, wl)

print(f"Updated registry: {len(applied)} entries")
print(f"Updated whitelist: {len(wl['whitelist'])} active, {len(deferred)} deferred")

# Save the list of P0-repaired projects to recollect
recollect_list = [r['canonical_asset_id'] for r in verified_updated]
with open('/workspace/tmp/payd_github_p0_repair_recollect_queue.json', 'w') as f:
    json.dump({
        'metadata': {
            'generated_at': datetime.now(timezone.utc).isoformat(),
            'purpose': 'Recollect fresh GitHub metrics for 19 P0 projects after mapping repair',
            'count': len(recollect_list),
        },
        'queue': recollect_list,
    }, f, ensure_ascii=False, indent=2)
print(f"Recollect queue: {len(recollect_list)} projects")
print()
print("First 10 repaired projects:")
for r in verified_updated[:10]:
    print(f"  {r['canonical_asset_id']:30s} -> {r['new_repo']}")
