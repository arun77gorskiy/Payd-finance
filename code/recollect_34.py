#!/usr/bin/env python3
"""
Re-collect the 34 projects whose mapping was patched.
Removes them from completed set, then runs collector (will re-process them with new repos).
"""
import json
import os
from datetime import datetime, timezone

CHECKPOINT_PATH = "/workspace/tmp/payd_github_developer_checkpoint_VALIDATED.json"
RECOLLECT_PATH = "/workspace/tmp/payd_github_recollect_queue.json"
ENRICHMENT_PATH = "/workspace/tmp/payd_github_developer_enrichment_VALIDATED.json"

with open(CHECKPOINT_PATH) as f:
    state = json.load(f)
with open(RECOLLECT_PATH) as f:
    rq = json.load(f)
with open(ENRICHMENT_PATH) as f:
    enrich = json.load(f)

# Get the 34 IDs to recollect
recollect_ids = sorted([q['canonical_asset_id'] for q in rq['recollect_queue']])
print(f"Projects to recollect: {len(recollect_ids)}")

# Remove from completed
completed_before = set(state.get('completed', []))
removed = [pid for pid in recollect_ids if pid in completed_before]
print(f"Removing {len(removed)} from completed set")
state['completed'] = sorted(completed_before - set(recollect_ids))
state['last_recollect_at'] = datetime.now(timezone.utc).isoformat()
state['last_recollect_count'] = len(recollect_ids)
state['recollect_history'] = state.get('recollect_history', [])
state['recollect_history'].append({
    "at": datetime.now(timezone.utc).isoformat(),
    "count": len(recollect_ids),
    "ids": recollect_ids,
    "reason": "registry_patch_applied"
})

# Atomic write checkpoint
tmp = CHECKPOINT_PATH + '.tmp'
with open(tmp, 'w') as f:
    json.dump(state, f, ensure_ascii=False, indent=2)
    f.flush()
    os.fsync(f.fileno())
os.replace(tmp, CHECKPOINT_PATH)

# Also clear old enrichment entries (so new data is fresh)
removed_entries = 0
for pid in recollect_ids:
    if pid in enrich:
        del enrich[pid]
        removed_entries += 1
print(f"Removed {removed_entries} stale enrichment entries")

# Atomic write enrichment
tmp = ENRICHMENT_PATH + '.tmp'
with open(tmp, 'w') as f:
    json.dump(enrich, f, ensure_ascii=False, indent=2)
    f.flush()
    os.fsync(f.fileno())
os.replace(tmp, ENRICHMENT_PATH)

# Verify
with open(CHECKPOINT_PATH) as f:
    state2 = json.load(f)
print(f"\nCheckpoint after recollect-prep:")
print(f"  completed: {len(state2['completed'])}")
print(f"  recollect_history entries: {len(state2['recollect_history'])}")
