#!/usr/bin/env python
"""Regenerate the plugin's harness/ payload from the canonical kit.

The canonical, authored source of the delivery harness is `delivery-standard/kit/`. The plugin
bundles a GENERATED copy under `harness/` so it is self-contained when installed. Run this at
release time (or after any kit change) to keep them in lockstep — do NOT hand-edit `harness/`.

Usage (from the plugin repo, with delivery-standard as a sibling):
  uv run --project scripts scripts/sync_kit.py
  uv run --project scripts scripts/sync_kit.py --kit ../delivery-standard/kit --check
"""
from __future__ import annotations

import argparse
import filecmp
import shutil
import sys
from pathlib import Path

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_KIT = PLUGIN_ROOT.parent / "delivery-standard" / "kit"
PAYLOAD = PLUGIN_ROOT / "harness"


def _all_files(root: Path) -> set[str]:
    return {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()}


def check(kit: Path) -> int:
    if not kit.is_dir():
        print(f"ERROR: kit not found: {kit}", file=sys.stderr)
        return 2
    src, dst = _all_files(kit), _all_files(PAYLOAD) if PAYLOAD.exists() else set()
    missing, extra = sorted(src - dst), sorted(dst - src)
    changed = sorted(
        f for f in (src & dst)
        if not filecmp.cmp(kit / f, PAYLOAD / f, shallow=False)
    )
    if not (missing or extra or changed):
        print(f"IN SYNC: harness/ matches {kit} ({len(src)} files).")
        return 0
    for f in missing:
        print(f"MISSING  {f}  (in kit, not in harness/)")
    for f in extra:
        print(f"STALE    {f}  (in harness/, not in kit)")
    for f in changed:
        print(f"CHANGED  {f}")
    print(f"\nOUT OF SYNC: run without --check to regenerate.")
    return 1


def sync(kit: Path) -> int:
    if not kit.is_dir():
        print(f"ERROR: kit not found: {kit}", file=sys.stderr)
        return 2
    if PAYLOAD.exists():
        shutil.rmtree(PAYLOAD)
    shutil.copytree(kit, PAYLOAD)
    n = len(_all_files(PAYLOAD))
    print(f"Synced {n} files: {kit}  ->  {PAYLOAD}")
    print("harness/ is GENERATED — do not hand-edit; edit delivery-standard/kit and re-run.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Sync the plugin harness payload from the kit.")
    ap.add_argument("--kit", type=Path, default=DEFAULT_KIT, help="path to delivery-standard/kit")
    ap.add_argument("--check", action="store_true", help="report drift without writing")
    args = ap.parse_args()
    kit = args.kit.resolve()
    return check(kit) if args.check else sync(kit)


if __name__ == "__main__":
    raise SystemExit(main())
