"""Track artifact checksums for dirty-state detection across gate checks."""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import yaml

PLUGIN_ROOT = Path(__file__).resolve().parent.parent


def load_yaml(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def save_yaml(path: Path, data: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)


def get_phase_name(phase_id: int) -> str | None:
    registry_path = PLUGIN_ROOT / "phases" / "phase-registry.yaml"
    if not registry_path.exists():
        return None
    registry = load_yaml(registry_path)
    for p in registry.get("phases", []):
        if p["id"] == phase_id:
            return p["name"]
    return None


def compute_checksum(file_path: Path) -> str:
    """Compute SHA-256 hash of a file."""
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return f"sha256:{h.hexdigest()[:16]}"


def scan_artifacts(artifacts_dir: Path) -> dict[str, str]:
    """Walk an artifact directory and compute checksums for all files."""
    checksums = {}
    if not artifacts_dir.exists():
        return checksums
    for file_path in sorted(artifacts_dir.rglob("*")):
        if file_path.is_file():
            rel_path = str(file_path.relative_to(artifacts_dir)).replace("\\", "/")
            checksums[rel_path] = compute_checksum(file_path)
    return checksums


def diff_checksums(
    stored: dict[str, str], current: dict[str, str]
) -> dict[str, list[str]]:
    """Compare stored vs current checksums. Returns categorized file lists."""
    stored_files = set(stored.keys())
    current_files = set(current.keys())

    new = sorted(current_files - stored_files)
    deleted = sorted(stored_files - current_files)
    common = stored_files & current_files
    modified = sorted(f for f in common if stored[f] != current[f])
    unchanged = sorted(f for f in common if stored[f] == current[f])

    return {
        "new": new,
        "modified": modified,
        "unchanged": unchanged,
        "deleted": deleted,
    }


def track(state_path: Path, phase_id: int | None, snapshot: bool) -> int:
    """Track artifacts for a phase. Returns 0=ok, 1=changes found, 2=error."""
    if not state_path.exists():
        print(f"Error: State file not found: {state_path}", file=sys.stderr)
        return 2

    state = load_yaml(state_path)
    sdlc_dir = state_path.parent

    if phase_id is None:
        phase_id = state["current_phase"]

    phase_name = get_phase_name(phase_id)
    if not phase_name:
        print(f"Error: Phase {phase_id} not found in registry", file=sys.stderr)
        return 2

    artifacts_dir = sdlc_dir / "artifacts" / f"{phase_id:02d}-{phase_name}"
    current = scan_artifacts(artifacts_dir)

    # Load stored checksums
    phase_state = state.get("phases", {}).get(phase_id, {})
    stored = phase_state.get("artifact_checksums", {})

    # Compute diff
    diff = diff_checksums(stored, current)

    # Print report
    print(f"Artifact Tracking — Phase {phase_id} ({phase_name})")
    print("=" * 50)
    print(f"  New:       {len(diff['new'])} file(s)")
    print(f"  Modified:  {len(diff['modified'])} file(s)")
    print(f"  Unchanged: {len(diff['unchanged'])} file(s)")
    print(f"  Deleted:   {len(diff['deleted'])} file(s)")

    if diff["new"]:
        print("\n  New files:")
        for f in diff["new"]:
            print(f"    + {f}")
    if diff["modified"]:
        print("\n  Modified files:")
        for f in diff["modified"]:
            print(f"    ~ {f}")
    if diff["deleted"]:
        print("\n  Deleted files:")
        for f in diff["deleted"]:
            print(f"    - {f}")

    # Snapshot: save current checksums to state
    if snapshot:
        if phase_id not in state.get("phases", {}):
            print(f"Error: Phase {phase_id} not in state", file=sys.stderr)
            return 2
        state["phases"][phase_id]["artifact_checksums"] = current
        save_yaml(state_path, state)
        print(f"\n  [OK] Checksums saved to state.yaml ({len(current)} artifacts)")

    # Output JSON summary for programmatic use
    print(f"\n{json.dumps(diff, indent=2)}")

    has_changes = bool(diff["new"] or diff["modified"] or diff["deleted"])
    return 1 if has_changes else 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Track artifact checksums for dirty-state detection"
    )
    parser.add_argument("--state", required=True, help="Path to .sdlc/state.yaml")
    parser.add_argument(
        "--phase", type=int, default=None, help="Phase to track (default: current)"
    )
    parser.add_argument(
        "--snapshot",
        action="store_true",
        default=False,
        help="Save current checksums to state.yaml (baseline for future diffs)",
    )
    args = parser.parse_args()

    sys.exit(track(Path(args.state), args.phase, args.snapshot))


if __name__ == "__main__":
    main()
