#!/usr/bin/env python
"""Install the delivery harness (the kit) from the plugin's bundled payload into a target repo.

Called by /sdlc-setup after .sdlc/ is initialized. Idempotent: existing files are left in place
and reported as SKIPPED unless --force is given. The payload is the plugin's `harness/` directory,
a generated copy of delivery-standard/kit (see scripts/sync_kit.py).

Usage:
  uv run --project <plugin-root>/scripts <plugin-root>/scripts/install_harness.py \
    --payload <plugin-root>/harness --target . [--force]
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

# (source-relative-to-payload, dest-relative-to-repo). Directories end with "/".
# Mirrors kit/README.md "Install map (authoritative)".
FILE_MAP: list[tuple[str, str]] = [
    ("CLAUDE.md.template", "CLAUDE.md"),            # governance base; SDLC section appended by setup
    ("spec-template.md", "specs/spec-template.md"),
    ("settings.json", ".claude/settings.json"),
]
DIR_MAP: list[tuple[str, str]] = [
    ("hooks/", ".claude/hooks/"),
    ("agents/", ".claude/agents/"),
    ("skills/", ".claude/skills/"),
    ("workflows/", ".github/workflows/"),           # RAILS.md/README.md ride along; harmless
    ("profile/rubrics/", ".github/profile/rubrics/"),
    ("profile/rulesets/", ".github/rulesets/"),
    ("profile/scripts/", "scripts/rails/"),
    ("eval-datasets/", "eval-datasets/"),
    ("prompts/", "prompts/"),
    ("infra/", "infra/"),
]
# Single files that live at a repo path different from their payload dir.
EXTRA_FILES: list[tuple[str, str]] = [
    ("workflows/RAILS.md", ".github/RAILS.md"),
    ("profile/eval-bypasses.md", ".github/eval-bypasses.md"),
    ("profile/CODEOWNERS", ".github/CODEOWNERS"),
]
GITIGNORE_LINES = [".claude/.review-receipts/", ".claude/settings.local.json"]


def _copy(src: Path, dest: Path, force: bool, log: list[str]) -> None:
    rel = str(dest)
    existed = dest.exists()
    if existed and not force:
        log.append(f"SKIP    {rel}  (exists)")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    log.append(f"{'FORCE ' if existed else 'WRITE '}  {rel}")


def install(payload: Path, target: Path, force: bool) -> int:
    if not payload.is_dir():
        print(f"ERROR: payload not found: {payload}", file=sys.stderr)
        return 2
    log: list[str] = []

    for src_rel, dest_rel in FILE_MAP + EXTRA_FILES:
        src = payload / src_rel
        if not src.is_file():
            log.append(f"MISS    {src_rel}  (not in payload)")
            continue
        _copy(src, target / dest_rel, force, log)

    # RAILS.md is remapped by EXTRA_FILES; don't also copy it via the workflows dir.
    remapped = {"workflows/RAILS.md"}
    for src_rel, dest_rel in DIR_MAP:
        src_dir = payload / src_rel
        if not src_dir.is_dir():
            log.append(f"MISS    {src_rel}  (not in payload)")
            continue
        for src in sorted(p for p in src_dir.rglob("*") if p.is_file()):
            key = src.relative_to(payload).as_posix()
            if key in remapped:
                continue
            dest = target / dest_rel / src.relative_to(src_dir)
            _copy(src, dest, force, log)

    _ensure_gitignore(target, log)

    written = sum(1 for line in log if line.startswith(("WRITE", "FORCE")))
    skipped = sum(1 for line in log if line.startswith("SKIP"))
    print("\n".join(log))
    print(f"\nHarness install: {written} written, {skipped} skipped (use --force to overwrite).")
    print("NEXT: review CLAUDE.md placeholders, then prove the rails "
          "(.github/RAILS.md shakedown drills) before trusting them.")
    return 0


def _ensure_gitignore(target: Path, log: list[str]) -> None:
    gi = target / ".gitignore"
    existing = gi.read_text(encoding="utf-8").splitlines() if gi.exists() else []
    missing = [ln for ln in GITIGNORE_LINES if ln not in existing]
    if not missing:
        return
    with gi.open("a", encoding="utf-8") as fh:
        if existing and existing[-1].strip():
            fh.write("\n")
        fh.write("# delivery harness\n" + "\n".join(missing) + "\n")
    log.append(f"WRITE   .gitignore  (+{len(missing)} lines)")


def main() -> int:
    ap = argparse.ArgumentParser(description="Install the delivery harness into a repo.")
    ap.add_argument("--payload", required=True, type=Path, help="plugin harness/ directory")
    ap.add_argument("--target", default=Path("."), type=Path, help="target repo root")
    ap.add_argument("--force", action="store_true", help="overwrite existing files")
    args = ap.parse_args()
    return install(args.payload.resolve(), args.target.resolve(), args.force)


if __name__ == "__main__":
    raise SystemExit(main())
