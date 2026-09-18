#!/usr/bin/env python3
"""
STEP 4.17: Rollback integrity test.
Проверяет, что backup из tmp/step4_backup/ совпадает с SHA256 в manifest.
Также создаёт changed_files.json.
"""

import hashlib
import json
import shutil
import subprocess
from pathlib import Path
from datetime import datetime

WORKSPACE = Path("/workspace")
BACKUP_DIR = WORKSPACE / "tmp" / "step4_backup"
MANIFEST_PATH = WORKSPACE / "tmp" / "step4_backup_manifest.json"
CHANGED_FILES_PATH = WORKSPACE / "tmp" / "payd_v2_step4_changed_files.json"
ROLLBACK_REPORT_PATH = WORKSPACE / "tmp" / "payd_v2_step4_rollback_report.json"


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    # 1. Загрузить manifest
    with open(MANIFEST_PATH) as f:
        manifest = json.load(f)

    # 2. Проверить SHA256 backup файлов vs manifest
    integrity_report = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "backup_dir": str(BACKUP_DIR),
        "files_checked": 0,
        "files_match": 0,
        "files_mismatch": 0,
        "details": [],
    }

    for entry in manifest["files"]:
        backup_file = BACKUP_DIR / entry["backup_path"]
        if not backup_file.exists():
            integrity_report["details"].append({
                "file": entry["backup_path"],
                "status": "MISSING",
            })
            continue
        actual_sha = sha256_of(backup_file)
        expected_sha = entry["sha256"]
        match = actual_sha == expected_sha
        integrity_report["files_checked"] += 1
        if match:
            integrity_report["files_match"] += 1
        else:
            integrity_report["files_mismatch"] += 1
        integrity_report["details"].append({
            "file": entry["backup_path"],
            "expected_sha256": expected_sha,
            "actual_sha256": actual_sha,
            "match": match,
        })

    integrity_report["all_match"] = integrity_report["files_mismatch"] == 0

    # 3. Генерация changed_files.json — что было изменено
    changed_files = []
    for entry in manifest["files"]:
        current_path = WORKSPACE / entry["source_path"]
        if not current_path.exists():
            changed_files.append({
                "file": entry["source_path"],
                "status": "MISSING_IN_CURRENT",
                "backup_sha256": entry["sha256"],
            })
            continue
        current_sha = sha256_of(current_path)
        if current_sha != entry["sha256"]:
            changed_files.append({
                "file": entry["source_path"],
                "status": "MODIFIED",
                "backup_sha256": entry["sha256"],
                "current_sha256": current_sha,
                "backup_size": entry["size_bytes"],
                "current_size": current_path.stat().st_size,
            })
        else:
            changed_files.append({
                "file": entry["source_path"],
                "status": "UNCHANGED",
                "backup_sha256": entry["sha256"],
                "current_sha256": current_sha,
            })

    with open(CHANGED_FILES_PATH, "w") as f:
        json.dump({
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "total_files": len(changed_files),
            "modified_count": sum(1 for c in changed_files if c["status"] == "MODIFIED"),
            "unchanged_count": sum(1 for c in changed_files if c["status"] == "UNCHANGED"),
            "files": changed_files,
        }, f, indent=2)

    # 4. Rollback test: симулировать откат (не делая реальный откат)
    # Просто проверяем, что если мы скопируем backup обратно, всё совпадёт
    rollback_simulation = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "would_restore": len(manifest["files"]),
        "files": [],
    }

    for entry in manifest["files"]:
        backup_file = BACKUP_DIR / entry["backup_path"]
        rollback_simulation["files"].append({
            "source_path": entry["source_path"],
            "backup_path": entry["backup_path"],
            "sha256_will_match": entry["sha256"] == sha256_of(backup_file) if backup_file.exists() else False,
        })

    rollback_simulation["rollback_viable"] = all(
        f["sha256_will_match"] for f in rollback_simulation["files"]
    )

    # Save rollback report
    with open(ROLLBACK_REPORT_PATH, "w") as f:
        json.dump({
            "integrity": integrity_report,
            "rollback_simulation": rollback_simulation,
        }, f, indent=2)

    # Output summary
    print("=== ROLLBACK INTEGRITY REPORT ===")
    print(f"Files in backup: {len(manifest['files'])}")
    print(f"Integrity: {integrity_report['files_match']}/{integrity_report['files_checked']} match")
    print(f"All match: {integrity_report['all_match']}")
    print(f"\nRollback viable: {rollback_simulation['rollback_viable']}")
    print(f"\n=== Changed files saved to {CHANGED_FILES_PATH} ===")
    print(f"Modified: {sum(1 for c in changed_files if c['status'] == 'MODIFIED')}")
    print(f"Unchanged: {sum(1 for c in changed_files if c['status'] == 'UNCHANGED')}")
    for c in changed_files:
        if c["status"] == "MODIFIED":
            print(f"  MODIFIED: {c['file']}")
            print(f"    backup: {c['backup_sha256'][:16]}...")
            print(f"    current: {c['current_sha256'][:16]}...")


if __name__ == "__main__":
    main()
