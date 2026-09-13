#!/usr/bin/env python3
"""
Apply PATCH to the identity registry.
- For 34 patches with proposed_repo: replace github_repo and github_url
- For 144 patches without proposed_repo: keep URL, mark REVIEW_REQUIRED
"""
import json
import os
from datetime import datetime, timezone

REGISTRY_PATH = "/workspace/tmp/payd_github_identity_registry.json"
PATCH_PATH = "/workspace/tmp/payd_github_mapping_registry_PATCH.json"

with open(REGISTRY_PATH) as f:
    reg = json.load(f)
with open(PATCH_PATH) as f:
    patch = json.load(f)

registry = reg["registry"]
patches = patch["patches"]
applied = []
marked_review = []
unchanged = []

for p in patches:
    cid = p["canonical_asset_id"]
    if cid not in registry:
        unchanged.append({"id": cid, "reason": "not_in_registry"})
        continue
    entry = registry[cid]
    if p.get("proposed_repo"):
        old_repo = entry.get("github_repo")
        new_repo = p["proposed_repo"]
        if new_repo != old_repo:
            entry["github_repo"] = new_repo
            entry["github_url"] = f"https://github.com/{new_repo}"
            # Update official_repositories if present
            if "official_repositories" in entry and isinstance(entry["official_repositories"], list):
                if new_repo not in entry["official_repositories"]:
                    entry["official_repositories"].insert(0, new_repo)
            # Update mapping metadata
            entry["github_mapping_status"] = "VERIFIED_UPDATED"
            entry["github_mapping_checked_at"] = datetime.now(timezone.utc).isoformat()
            entry["github_mapping_notes"] = (
                f"Patched from audit: {old_repo} -> {new_repo} "
                f"(confidence={p.get('confidence')}, reason={p.get('repair_reason','')[:80]})"
            )
            applied.append({
                "canonical_asset_id": cid,
                "old_repo": old_repo,
                "new_repo": new_repo,
                "confidence": p.get("confidence")
            })
        else:
            unchanged.append({"id": cid, "reason": "same_repo"})
    else:
        # Mark as REVIEW_REQUIRED but keep current URL
        entry["github_mapping_status"] = "REVIEW_REQUIRED"
        entry["github_mapping_checked_at"] = datetime.now(timezone.utc).isoformat()
        entry["github_mapping_notes"] = (
            f"Review required: {p.get('repair_reason','')[:120]}"
        )
        marked_review.append(cid)

reg["metadata"]["patch_applied_at"] = datetime.now(timezone.utc).isoformat()
reg["metadata"]["patch_stats"] = {
    "total_patches": len(patches),
    "applied": len(applied),
    "marked_review": len(marked_review),
    "unchanged": len(unchanged),
}

# Atomic write
tmp_path = REGISTRY_PATH + ".tmp"
with open(tmp_path, "w") as f:
    json.dump(reg, f, ensure_ascii=False, indent=2)
os.replace(tmp_path, REGISTRY_PATH)

print(f"Applied: {len(applied)}")
print(f"Marked REVIEW_REQUIRED: {len(marked_review)}")
print(f"Unchanged: {len(unchanged)}")
print()
print("Applied patches (first 10):")
for a in applied[:10]:
    print(f"  {a['canonical_asset_id']}: {a['old_repo']} -> {a['new_repo']} [{a['confidence']}]")
