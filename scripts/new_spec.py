"""Scaffold a new Build-loop spec (specs/NNNN-name.md) from the template.

Specs are the durable per-change unit of the Build loop — one spec = one branch = one PR.
They live in the target repo's `specs/` directory (in the repo, not under .sdlc/), so the
agent and the grader read them from version control like any source file.

Two modes (Standalone or Workflow — see CLAUDE.md design rule):
  - Workflow:   --state .sdlc/state.yaml   (repo root = the directory containing .sdlc/)
  - Standalone: --repo <path>              (any repo; no .sdlc/ required)

The id (NNNN) is allocated by scanning the existing specs/ directory and taking max + 1,
so ids stay stable and gap-free even when specs are authored across many sessions.
"""

import argparse
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_PATH = PLUGIN_ROOT / "templates" / "phases" / "build" / "spec.md"

VALID_RISK = ("HIGH", "MEDIUM", "LOW")
SPEC_FILE_RE = re.compile(r"^(\d{4})-")
SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(name: str) -> str:
    """kebab-case slug for the filename and the `name` field."""
    return SLUG_RE.sub("-", name.strip().lower()).strip("-")


def next_spec_id(specs_dir: Path) -> str:
    """Lowest unused 4-digit id: max existing id + 1, or 0001 when none exist."""
    highest = 0
    if specs_dir.exists():
        for f in specs_dir.glob("*.md"):
            m = SPEC_FILE_RE.match(f.name)
            if m:
                highest = max(highest, int(m.group(1)))
    return f"{highest + 1:04d}"


def resolve_repo_root(args) -> Path:
    """Repo root from --state (.sdlc parent) or --repo. Errors if neither resolves."""
    if args.state:
        state_path = Path(args.state)
        if not state_path.exists():
            print(f"Error: State file not found: {state_path}")
            sys.exit(1)
        # state_path = <repo>/.sdlc/state.yaml -> repo root is two levels up
        return state_path.resolve().parent.parent
    return Path(args.repo).resolve()


def render_spec(template: str, spec_id: str, name: str, risk: str, source: str) -> str:
    """Fill the template's frontmatter placeholders. Body prompts are left for the author."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out = template
    out = out.replace('spec: "NNNN"', f'spec: "{spec_id}"')
    out = out.replace('name: "short-kebab-name"', f'name: "{name}"')
    out = re.sub(r"^risk: MEDIUM.*$", f"risk: {risk}", out, count=1, flags=re.MULTILINE)
    out = out.replace('source: "—"', f'source: "{source}"')
    out = out.replace('created: "YYYY-MM-DD"', f'created: "{today}"')
    out = out.replace("# Spec NNNN — <title>", f"# Spec {spec_id} — {name}")
    # Keep the Risk Tier section and the Checking Plan depth in sync with the chosen frontmatter
    # tier (check_spec enforces both agreements).
    out = out.replace("**Tier:** MEDIUM", f"**Tier:** {risk}")
    out = out.replace("**Ladder depth:** MEDIUM", f"**Ladder depth:** {risk}")
    return out


def create_spec(repo_root: Path, name: str, risk: str, source: str) -> Path:
    if not TEMPLATE_PATH.exists():
        print(f"Error: Spec template not found: {TEMPLATE_PATH}")
        sys.exit(1)

    slug = slugify(name)
    if not slug:
        print("Error: --name produced an empty slug. Use a descriptive name.")
        sys.exit(1)

    specs_dir = repo_root / "specs"
    specs_dir.mkdir(parents=True, exist_ok=True)
    spec_id = next_spec_id(specs_dir)

    out_path = specs_dir / f"{spec_id}-{slug}.md"
    if out_path.exists():
        print(f"Error: Spec already exists: {out_path}")
        sys.exit(1)

    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    out_path.write_text(render_spec(template, spec_id, slug, risk, source), encoding="utf-8")
    return out_path


def main():
    parser = argparse.ArgumentParser(description="Scaffold a new Build-loop spec from the template")
    src = parser.add_mutually_exclusive_group()
    src.add_argument("--state", help="Path to .sdlc/state.yaml (workflow mode; repo root = .sdlc parent)")
    src.add_argument("--repo", default=".", help="Target repo root (standalone mode; default: cwd)")
    parser.add_argument("--name", required=True, help="Short descriptive name (becomes the kebab-case slug)")
    parser.add_argument("--risk", default="MEDIUM", help="Risk tier: HIGH | MEDIUM | LOW (default: MEDIUM)")
    parser.add_argument("--source", default="—", help="Originating story / REQ-id (default: —)")
    args = parser.parse_args()

    risk = args.risk.strip().upper()
    if risk not in VALID_RISK:
        print(f"Error: --risk must be one of {', '.join(VALID_RISK)} (got '{args.risk}')")
        sys.exit(1)

    repo_root = resolve_repo_root(args)
    out_path = create_spec(repo_root, args.name, risk, args.source)

    print(f"Spec created: {out_path}")
    print(f"  Risk tier: {risk}")
    print("  Next: fill the body (Goal, Why, Scope, Acceptance Checks, plans), then validate:")
    print(f"    uv run scripts/check_spec.py --spec {out_path}")


if __name__ == "__main__":
    main()
