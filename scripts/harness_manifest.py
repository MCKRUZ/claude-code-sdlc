"""Read/build/write the install manifest (.claude/harness-manifest.json).

The manifest records the composed PRISTINE state of a harness install: for every dest a run
touched (wrote, overlaid, forced, merged, spliced), the sha256 of its final on-disk content.
That gives upgrade_harness.py the three-way baseline (manifest oldP / new pristine newP /
current cur) it needs to classify local adaptation vs. upstream change without guessing.
SKIPPED pre-existing files are never recorded; the manifest never lists itself.

Shared by install_harness.py (writes it at the end of every successful run) and
upgrade_harness.py (reads the target's manifest and the pristine compose's manifest).
This module stays dependency-free on the installer: failures surface as OSError/ValueError
and the caller wraps them in its own error type.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

MANIFEST_VERSION = 1
MANIFEST_REL = ".claude/harness-manifest.json"


def file_digest(path: Path) -> str:
    """Content hash in the manifest's storage format: 'sha256:<hex>'."""
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def plugin_version(payload: Path) -> str:
    """The plugin's version from <plugin-root>/.claude-plugin/plugin.json — the payload is the
    plugin's harness/ directory, so the plugin root is its parent. 'unknown' when the metadata
    is absent or unreadable (a synthetic payload, a stripped checkout): version is best-effort
    provenance, never a reason to fail an install."""
    meta = payload.parent / ".claude-plugin" / "plugin.json"
    try:
        version = json.loads(meta.read_text(encoding="utf-8")).get("version")
    except (OSError, json.JSONDecodeError):
        return "unknown"
    return version if isinstance(version, str) else "unknown"


def load_manifest(target: Path) -> dict | None:
    """The target's parsed manifest, or None when it has none (a fresh or legacy install).
    A manifest that exists but cannot be parsed is real breakage, not 'legacy': ValueError."""
    path = target / MANIFEST_REL
    if not path.is_file():
        return None
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"unreadable manifest {path}: {exc}") from exc
    if not isinstance(manifest, dict) or not isinstance(manifest.get("files"), dict):
        raise ValueError(f"manifest {path} is not a JSON object with a 'files' map")
    return manifest


def build_manifest(payload: Path, profile_id: str | None, packs: list[str],
                   files: dict[str, str]) -> dict:
    """Assemble a manifest document. `files` maps repo-relative POSIX paths to file_digest()
    values; entries are emitted sorted so re-runs produce stable diffs."""
    return {
        "manifest_version": MANIFEST_VERSION,
        "plugin_version": plugin_version(payload),
        "installed_at": datetime.now(timezone.utc).isoformat(),
        "profile_id": profile_id,
        "packs": list(packs),
        "files": {rel: files[rel] for rel in sorted(files)},
    }


def write_manifest(target: Path, manifest: dict) -> None:
    path = target / MANIFEST_REL
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
