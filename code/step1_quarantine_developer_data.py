#!/usr/bin/env python3
"""
STEP 1 — QUARANTINE NON-VERIFIED DEVELOPER DATA
Build authoritative developer snapshot of 154 VERIFIED/VERIFIED_UPDATED projects.
Mark the 20 deferred-but-previously-collected entries as NON_AUTHORITATIVE_MAPPING.
"""
import json
import os
from datetime import datetime, timezone

REGISTRY_PATH = "/workspace/tmp/payd_github_identity_registry.json"
ENRICHMENT_PATH = "/workspace/tmp/payd_github_developer_enrichment_VALIDATED.json"
CHECKPOINT_PATH = "/workspace/tmp/payd_github_developer_checkpoint_VALIDATED.json"
WHITELIST_PATH = "/workspace/tmp/payd_github_verified_whitelist_298.json"
OUT_AUTHORITATIVE = "/workspace/tmp/payd_github_developer_authoritative_154.json"
OUT_QUARANTINED = "/workspace/tmp/payd_github_developer_quarantined_20.json"

with open(REGISTRY_PATH) as f:
    reg = json.load(f)
with open(ENRICHMENT_PATH) as f:
    enrich = json.load(f)
with open(CHECKPOINT_PATH) as f:
    state = json.load(f)
with open(WHITELIST_PATH) as f:
    wl = json.load(f)

registry = reg['registry']
deferred = set((wl.get('deferred') or {}).get('review_required', []))
active_whitelist = set(wl['whitelist'])
completed = set(state.get('completed', []))

# Build authoritative snapshot: only projects with VERIFIED or VERIFIED_UPDATED
authoritative = {}
quarantined = {}

for pid, data in enrich.items():
    # Look up mapping status from registry
    reg_entry = registry.get(pid, {})
    mapping_status = reg_entry.get('github_mapping_status', 'UNKNOWN')

    if mapping_status in ('VERIFIED', 'VERIFIED_UPDATED'):
        # Authoritative
        data_copy = dict(data)
        data_copy['_governance'] = {
            'mapping_status': mapping_status,
            'authoritative': True,
            'added_to_authoritative_at': datetime.now(timezone.utc).isoformat(),
        }
        authoritative[pid] = data_copy
    else:
        # Non-authoritative
        data_copy = dict(data)
        data_copy['_governance'] = {
            'mapping_status': mapping_status,
            'authoritative': False,
            'quarantine_reason': 'NON_AUTHORITATIVE_MAPPING',
            'note': 'Mapping is REVIEW_REQUIRED. Developer metrics preserved for audit but MUST NOT be used for activity classification, sector rotation, Developer Score, or Payd Score.',
            'quarantined_at': datetime.now(timezone.utc).isoformat(),
        }
        quarantined[pid] = data_copy

# Validation
unique_ids = set(authoritative.keys())
expected = 154
all_verified = all(
    registry[pid].get('github_mapping_status') in ('VERIFIED', 'VERIFIED_UPDATED')
    for pid in authoritative
)
no_review = all(
    registry.get(pid, {}).get('github_mapping_status') != 'REVIEW_REQUIRED'
    for pid in authoritative
)

print(f"Authoritative count: {len(authoritative)}")
print(f"Unique canonical IDs: {len(unique_ids)}")
print(f"All mapping_status in (VERIFIED, VERIFIED_UPDATED): {all_verified}")
print(f"REVIEW_REQUIRED in authoritative: {not no_review}")
print(f"Quarantined count: {len(quarantined)}")

# Save atomic
def atomic_write(path, data):
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)

atomic_write(OUT_AUTHORITATIVE, {
    'metadata': {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'total_authoritative_projects': len(authoritative),
        'mapping_statuses_allowed': ['VERIFIED', 'VERIFIED_UPDATED'],
        'note': 'Authoritative developer metrics. Only VERIFIED/VERIFIED_UPDATED projects.',
    },
    'projects': authoritative,
})

atomic_write(OUT_QUARANTINED, {
    'metadata': {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'total_quarantined': len(quarantined),
        'quarantine_reason': 'NON_AUTHORITATIVE_MAPPING',
        'note': 'Quarantined developer metrics. Mapping is REVIEW_REQUIRED. Preserved for audit, NOT for activity classification.',
    },
    'projects': quarantined,
})

# Validate
assert len(unique_ids) >= 154, f"Expected at least 154 unique IDs, got {len(unique_ids)}"
assert all_verified, "Not all authoritative projects are VERIFIED/VERIFIED_UPDATED"
assert no_review, "REVIEW_REQUIRED found in authoritative snapshot"
assert len(quarantined) >= 19, f"Expected at least 19 quarantined (20 before - 1 promoted to authoritative), got {len(quarantined)}"

print("\n=== Validation PASSED ===")
print(f"Authoritative file: {OUT_AUTHORITATIVE}")
print(f"Quarantined file:   {OUT_QUARANTINED}")
