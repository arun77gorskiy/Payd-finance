#!/usr/bin/env python3
"""
Update whitelist_meta with the patched registry URLs.
For REVIEW_REQUIRED projects, move them to a 'deferred' section.
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

updated = []
deferred = []
unchanged = []

new_whitelist_meta = []
for meta in wl["whitelist_meta"]:
    pid = meta["canonical_id"]
    reg_entry = registry.get(pid)
    if not reg_entry:
        new_whitelist_meta.append(meta)
        unchanged.append(pid)
        continue
    status = reg_entry.get("github_mapping_status", "VERIFIED")
    if status == "REVIEW_REQUIRED":
        deferred.append(pid)
        continue
    new_repo = reg_entry.get("github_repo")
    old_repo = meta.get("github_repo")
    if new_repo and new_repo != old_repo:
        # parse owner/repo from new_repo
        parts = new_repo.split("/", 1)
        new_org = parts[0] if len(parts) > 0 else meta.get("github_org")
        new_repo_name = parts[1] if len(parts) > 1 else None
        meta = dict(meta)
        meta["github_org"] = new_org
        meta["github_repo"] = new_repo
        meta["official_repositories"] = [new_repo]
        meta["registry_mapping_status"] = status
        if new_repo_name:
            # Split github_repo as "owner/repo" - the whitelist_meta has it as the full string
            # The collector handles it as f"{org}/{repo}" so we need it as the full string in github_repo
            pass
        updated.append({"id": pid, "old": old_repo, "new": new_repo, "status": status})
    new_whitelist_meta.append(meta)

# Save
wl["whitelist_meta"] = new_whitelist_meta
wl["metadata"]["whitelist_meta_updated_at"] = datetime.now(timezone.utc).isoformat()
wl["metadata"]["whitelist_meta_update_stats"] = {
    "updated": len(updated),
    "deferred_review_required": len(deferred),
    "unchanged": len(unchanged),
    "active_count": len(new_whitelist_meta),
}
wl.setdefault("deferred", {})
wl["deferred"]["review_required"] = sorted(deferred)
wl["deferred"]["deferred_count"] = len(deferred)

# Atomic write
tmp_path = WHITELIST_PATH + ".tmp"
with open(tmp_path, "w") as f:
    json.dump(wl, f, ensure_ascii=False, indent=2)
os.replace(tmp_path, WHITELIST_PATH)

print(f"Updated whitelist_meta: {len(updated)}")
print(f"Deferred (REVIEW_REQUIRED): {len(deferred)}")
print(f"Unchanged: {len(unchanged)}")
print(f"Total active whitelist: {len(new_whitelist_meta)}")
print()
print("Updated (first 10):")
for u in updated[:10]:
    print(f"  {u['id']}: {u['old']} -> {u['new']} [{u['status']}]")
