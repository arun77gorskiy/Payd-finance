#!/usr/bin/env python3
"""
Fix whitelist consistency:
- Ensure whitelist array contains only ACTIVE projects (no deferred ones)
- whitelist_meta should match whitelist
- Recompute the whitelist from the registry
"""
import json
import os
from datetime import datetime, timezone

WHITELIST_PATH = "/workspace/tmp/payd_github_verified_whitelist_298.json"
REGISTRY_PATH = "/workspace/tmp/payd_github_identity_registry.json"

with open(WHITELIST_PATH) as f:
    wl = json.load(f)
with open(REGISTRY_PATH) as f:
    reg = json.load(f)

registry = reg["registry"]
deferred = (wl.get("deferred") or {}).get("review_required", [])
deferred_set = set(deferred)

# Remove deferred from whitelist array
old_wl_count = len(wl["whitelist"])
wl["whitelist"] = [pid for pid in wl["whitelist"] if pid not in deferred_set]
new_wl_count = len(wl["whitelist"])

# Restore whitelist_meta entries for deferred (they were removed by previous script)
existing_meta_ids = set(e["canonical_id"] for e in wl["whitelist_meta"])

# Need to add meta entries for all deferred projects
# Use registry data to construct them
for pid in deferred:
    if pid in existing_meta_ids:
        continue
    reg_entry = registry.get(pid, {})
    meta = {
        "canonical_id": pid,
        "display_name": pid,
        "github_org": (reg_entry.get("github_repo") or "").split("/")[0] if reg_entry.get("github_repo") else "",
        "github_repo": reg_entry.get("github_repo", ""),
        "official_repositories": [reg_entry.get("github_repo")] if reg_entry.get("github_repo") else [],
        "repository_roles": {},
        "confidence": 0.0,
        "registry_mapping_status": "REVIEW_REQUIRED",
    }
    wl["whitelist_meta"].append(meta)

wl["metadata"]["whitelist_filtered_at"] = datetime.now(timezone.utc).isoformat()
wl["metadata"]["whitelist_active_count"] = new_wl_count
wl["metadata"]["whitelist_deferred_count"] = len(deferred_set)
wl["metadata"]["whitelist_total"] = new_wl_count + len(deferred_set)

# Atomic write
tmp_path = WHITELIST_PATH + ".tmp"
with open(tmp_path, "w") as f:
    json.dump(wl, f, ensure_ascii=False, indent=2)
    f.flush()
    os.fsync(f.fileno())
os.replace(tmp_path, WHITELIST_PATH)

print(f"Active whitelist: {new_wl_count}")
print(f"Deferred whitelist: {len(deferred_set)}")
print(f"Total: {new_wl_count + len(deferred_set)}")
print(f"whitelist_meta entries: {len(wl['whitelist_meta'])}")
