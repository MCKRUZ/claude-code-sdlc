#!/usr/bin/env python
"""Scaffold a new Build-loop spike (spikes/NNNN-name.md) from the template.

A spike is the loop's SECOND delegation mode. It runs when a story cannot clear the Definition
of Ready because nobody knows the answer yet — the integration's real behavior, whether the
assumption the design rests on holds. Writing a confident spec about an unknown is the expensive
mistake: it reads as ready, the grader grades it against fiction, and the pod finds out at merge.

A spike is bounded, its code is throwaway, and the WRITTEN FINDING is the deliverable. Spike code
cannot reach the default branch: the `spike-guard` CI check fails any PR opened from a `spike/`
branch, with no label escape.

Spikes live in the target repo's `spikes/` directory (in version control, not under .sdlc/), for
the same reason specs do — the finding outlives the session that produced it.

Two modes (Standalone or Workflow — see CLAUDE.md design rule):
  - Workflow:   --state .sdlc/state.yaml   (repo root = the directory containing .sdlc/)
  - Standalone: --repo <path>              (any repo; no .sdlc/ required)

The id (NNNN) is allocated by scanning the existing spikes/ directory and taking max + 1, so
ids stay stable and gap-free across sessions. Spike ids are independent of spec ids.
"""

import argparse
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# Shared with new_spec.py — imported rather than copied so the two cannot drift apart.
from new_spec import next_spec_id as next_id
from new_spec import resolve_repo_root, slugify

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_PATH = PLUGIN_ROOT / "templates" / "phases" / "build" / "spike.md"

VALID_STATUS = ("open", "closed")


def render_spike(template: str, spike_id: str, name: str, box: str, opened_by: str, unblocks: str) -> str:
    """Fill the template's frontmatter placeholders. Body prompts are left for the author."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out = template
    out = out.replace('spike: "NNNN"', f'spike: "{spike_id}"')
    out = out.replace('name: "short-kebab-name"', f'name: "{name}"')
    out = re.sub(r'^box: "—".*$', f'box: "{box}"', out, count=1, flags=re.MULTILINE)
    out = re.sub(r'^opened_by: "—".*$', f'opened_by: "{opened_by}"', out, count=1, flags=re.MULTILINE)
    out = re.sub(r'^unblocks: "—".*$', f'unblocks: "{unblocks}"', out, count=1, flags=re.MULTILINE)
    out = out.replace('created: "YYYY-MM-DD"', f'created: "{today}"')
    out = out.replace("# Spike NNNN — <the question, phrased as a question>", f"# Spike {spike_id} — {name}")
    return out


def create_spike(repo_root: Path, name: str, box: str, opened_by: str, unblocks: str) -> Path:
    """Write spikes/NNNN-slug.md into repo_root and return the path."""
    slug = slugify(name)
    if not slug:
        print("Error: --name produced an empty slug. Use a descriptive name.")
        sys.exit(1)

    spikes_dir = repo_root / "spikes"
    spikes_dir.mkdir(parents=True, exist_ok=True)
    spike_id = next_id(spikes_dir)

    out_path = spikes_dir / f"{spike_id}-{slug}.md"
    if out_path.exists():
        print(f"Error: Spike already exists: {out_path}")
        sys.exit(1)

    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    out_path.write_text(
        render_spike(template, spike_id, slug, box, opened_by, unblocks), encoding="utf-8"
    )
    return out_path


def main():
    parser = argparse.ArgumentParser(description="Scaffold a new Build-loop spike from the template")
    src = parser.add_mutually_exclusive_group()
    src.add_argument("--state", help="Path to .sdlc/state.yaml (workflow mode; repo root = .sdlc parent)")
    src.add_argument("--repo", default=".", help="Target repo root (standalone mode; default: cwd)")
    parser.add_argument("--name", required=True, help="Short descriptive name (becomes the kebab-case slug)")
    parser.add_argument(
        "--box", required=True,
        help='The agreed time or token box, e.g. "1 working day". A spike with no box is unsupervised building.',
    )
    parser.add_argument(
        "--opened-by", required=True, dest="opened_by",
        help="The named human who opened the spike (Pod Lead at triage, or the Architect)",
    )
    parser.add_argument(
        "--unblocks", default="—",
        help="What this unblocks: decision-list item id, the story that can't be made ready, or ADR-NNNN",
    )
    args = parser.parse_args()

    box = args.box.strip()
    if not box:
        print("Error: --box must not be empty. A spike is bounded or it is unsupervised building.")
        sys.exit(1)

    opened_by = args.opened_by.strip()
    if not opened_by:
        print("Error: --opened-by must name a human. Claude does not decide to spike.")
        sys.exit(1)

    repo_root = resolve_repo_root(args)
    out_path = create_spike(repo_root, args.name, box, opened_by, args.unblocks)

    print(f"Spike created: {out_path}")
    print(f"  Box: {box}   Opened by: {opened_by}")
    print(f"  Branch: spike/{out_path.stem}   (spike-guard blocks any PR from it — by design)")
    print("  Next: state the unknown, run the experiment, then WRITE THE FINDING.")
    print("  The code is deleted; this file is the deliverable.")


if __name__ == "__main__":
    main()
