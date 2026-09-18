#!/usr/bin/env python3
"""
STEP 4.1 — Backup script.
Создаёт tmp/step4_backup/ с копиями production файлов и генерирует manifest с SHA256.
"""

import hashlib
import json
import shutil
from pathlib import Path
from datetime import datetime

WORKSPACE = Path("/workspace")
BACKUP_DIR = WORKSPACE / "tmp" / "step4_backup"
MANIFEST_PATH = WORKSPACE / "tmp" / "step4_backup_manifest.json"

# Список файлов, которые будут модифицированы в STEP 4
FILES_TO_BACKUP = [
    "dist/intelligence-v2.html",
    "dist/js/intelligence/intelligence-v2-bundle.js",
    "dist/js/intelligence/intelligence-v2-render.js",
    "dist/js/intelligence/intelligence-v2-pipeline-ui.js",
    "dist/js/intelligence/intelligence-data-preloader.js",
    "dist/js/intelligence/canonical-normalizer.js",
    "dist/js/intelligence/intelligence-services-init.js",
    "dist/js/intelligence/intelligence-data.js",
    "dist/js/intelligence/intelligence-main.js",
    "dist/js/intelligence/intelligence-render.js",
]


def sha256_of(path: Path) -> str:
    """SHA256 хеш файла."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    manifest = {
        "backup_timestamp": datetime.utcnow().isoformat() + "Z",
        "workspace": str(WORKSPACE),
        "backup_dir": str(BACKUP_DIR),
        "total_files": len(FILES_TO_BACKUP),
        "files": [],
        "errors": [],
    }

    for rel in FILES_TO_BACKUP:
        src = WORKSPACE / rel
        dst = BACKUP_DIR / rel
        dst.parent.mkdir(parents=True, exist_ok=True)

        if not src.exists():
            manifest["errors"].append({
                "source": str(src),
                "error": "source file not found",
            })
            continue

        # Копируем
        shutil.copy2(src, dst)

        # Собираем метаданные
        sha256 = sha256_of(src)
        size = src.stat().st_size
        mtime = src.stat().st_mtime

        manifest["files"].append({
            "source_path": str(src.relative_to(WORKSPACE)),
            "backup_path": str(dst.relative_to(WORKSPACE)),
            "sha256": sha256,
            "size_bytes": size,
            "size_kb": round(size / 1024, 2),
            "modification_timestamp": datetime.utcfromtimestamp(mtime).isoformat() + "Z",
        })

    # Сохраняем manifest
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"Backup completed: {len(manifest['files'])} files")
    print(f"Errors: {len(manifest['errors'])}")
    print(f"Manifest: {MANIFEST_PATH}")
    print(f"Backup dir: {BACKUP_DIR}")

    # Печатаем summary
    for f in manifest["files"]:
        print(f"  - {f['source_path']}: {f['size_kb']} KB, sha256={f['sha256'][:16]}...")

    return len(manifest["errors"]) == 0


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
