#!/usr/bin/env python3
"""
For the 19 P0-repaired projects:
1. Remove from completed set
2. Remove from enrichment (so fresh data is collected)
3. Run collector on them
"""
import json
import os
import subprocess
from datetime import datetime, timezone

CHECKPOINT_PATH = "/workspace/tmp/payd_github_developer_checkpoint_VALIDATED.json"
ENRICHMENT_PATH = "/workspace/tmp/payd_github_developer_enrichment_VALIDATED.json"
RECOLLECT_PATH = "/workspace/tmp/payd_github_p0_repair_recollect_queue.json"
WHITELIST_PATH = "/workspace/tmp/payd_github_verified_whitelist_298.json"

with open(CHECKPOINT_PATH) as f:
    state = json.load(f)
with open(ENRICHMENT_PATH) as f:
    enrich = json.load(f)
with open(RECOLLECT_PATH) as f:
    rq = json.load(f)
with open(WHITELIST_PATH) as f:
    wl = json.load(f)

# 19 P0-repaired projects
p0_repaired_ids = rq['queue']
print(f"P0-repaired projects: {len(p0_repaired_ids)}")

# Find positions in active whitelist
deferred = set((wl.get('deferred') or {}).get('review_required', []))
active_sorted = sorted([pid for pid in wl['whitelist'] if pid not in deferred])

# Remove from completed set
completed_before = set(state.get('completed', []))
removed = [pid for pid in p0_repaired_ids if pid in completed_before]
state['completed'] = sorted(completed_before - set(p0_repaired_ids))
state['p0_repair_recollect_at'] = datetime.now(timezone.utc).isoformat()
state['p0_repair_recollect_count'] = len(p0_repaired_ids)

# Remove from enrichment
enrich_removed = []
for pid in p0_repaired_ids:
    if pid in enrich:
        del enrich[pid]
        enrich_removed.append(pid)

# Atomic write
def atomic_write(path, data):
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)

atomic_write(CHECKPOINT_PATH, state)
atomic_write(ENRICHMENT_PATH, enrich)

print(f"Removed from completed: {len(removed)}")
print(f"Removed from enrichment: {len(enrich_removed)}")
print(f"Completed after: {len(state['completed'])}")

# Now find positions of these 19 in active list and run collector
positions = []
for i, pid in enumerate(active_sorted):
    if pid in set(p0_repaired_ids):
        positions.append(i)

if positions:
    # Group into single batch
    offset = positions[0]
    limit = positions[-1] - offset + 1
    print(f"\nRunning collector: --offset {offset} --limit {limit}")
    result = subprocess.run(
        ['python3', '-u', 'code/collect_github_activity_298.py', '--offset', str(offset), '--limit', str(limit)],
        capture_output=True, text=True, timeout=600
    )
    print(result.stdout[-2000:])
    if result.returncode != 0:
        print(f"STDERR: {result.stderr[-500:]}")
