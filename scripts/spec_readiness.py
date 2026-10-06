"""A spec's Definition-of-Ready findings, as JSON (spec 0011's spec editor).

`check_spec.py` already answers this question and answers it well. It is also PROTECTED
CORE — byte-for-byte unchanged is the rule — and it prints for a person, not for a program.
A graphical editor showing "here is what is still missing, item by item" needs the same
findings as data.

So this adds no judgement of its own. It calls `check_spec.check_spec_text`, the same pure
function the command uses, and serializes what comes back. Every check, every severity and
every message is the protected module's; if the two ever disagree, this file is wrong.

The one thing it adds is grouping — MUST-failures separated from advisory notes — because
the distinction is already in the data (`severity`) and every caller was re-deriving it.

Two additive keys/modes for the Tōgō command center (togo-command-center.md §2.5 row 8), both
still judgement-free:
  - `ladder` — the checking ladder the tier requires, straight from `risk_model.required_rungs`
    (the single source of truth), so a card can draw the rungs as data rather than re-derive
    them. `touches_gated_path` is read from a `gated_path:` frontmatter field and is `null` when
    the spec does not declare one — nothing detects gated paths today, and a card must say
    "not declared" rather than "no".
  - `--all` — every `NNNN-` spec in one process, for a board that would otherwise spawn once a row.

Always exits 0: this is a report about a spec, not a verdict on a run. `check_spec.py` keeps
its own exit codes for the pipeline, which is where a verdict belongs.

Standalone or Workflow:
  - Standalone: --spec path/to/specs/NNNN-name.md   |   --all --repo <path>
  - Workflow:   --spec ... --state .sdlc/state.yaml (roster cross-check included)   |   --all --state ...
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_spec as cs
import risk_model as rm
from new_spec import SPEC_FILE_RE


def declared_gated_path(fm: dict | None) -> bool | None:
    """`gated_path:` as the spec declares it — True, False, or None when it says nothing.

    Three values on purpose. The security pass fires on any gated path regardless of tier
    (the-rails.md §3), so "not declared" and "declared false" lead to the same rungs but are
    different claims, and only the second one may be shown as "no"."""
    raw = (fm.get("gated_path") if fm else None)
    if raw is None:
        return None
    value = str(raw).strip().lower()
    if value in ("true", "yes"):
        return True
    if value in ("false", "no"):
        return False
    return None


def ladder_for(fm: dict | None) -> dict:
    """`{tier, touches_gated_path, rungs}` from the frontmatter — `rungs` is empty for a tier
    that is not one, never a guessed default."""
    tier = rm.normalize_tier(fm.get("risk")) if fm else None
    gated = declared_gated_path(fm)
    return {
        "tier": tier or "",
        "touches_gated_path": gated,
        "rungs": rm.required_rungs(tier, bool(gated)) if tier else [],
    }


def readiness(spec_path: Path, roster_path: Path | None = None) -> dict:
    """Every Definition-of-Ready finding for one spec, grouped by what it means.

    `ready` is true only when no MUST check failed — the same rule check_spec.py applies,
    read from the same findings rather than recomputed, so the two cannot drift apart.
    """
    if not spec_path.exists():
        return {"ok": False, "error": f"Spec not found: {spec_path}", "ready": False,
                "blocking": [], "advisory": [], "passed": []}

    text = spec_path.read_text(encoding="utf-8")
    findings = cs.check_spec_text(text, roster_path)

    blocking = [f for f in findings if not f["passed"] and f["severity"] == "MUST"]
    advisory = [f for f in findings if not f["passed"] and f["severity"] != "MUST"]
    passed = [f for f in findings if f["passed"]]

    fm, _ = cs.parse_frontmatter(text)
    return {
        "ok": True,
        "spec": str(fm.get("spec", "")) if fm else "",
        "risk": (fm.get("risk") or "").strip() if fm else "",
        "status": (fm.get("status") or "").strip() if fm else "",
        # A spec is ready when nothing MUST-level is outstanding. Advisory notes — the
        # vague-acceptance-check lint among them — are shown and never block, which is
        # check_spec.py's own contract and not this file's choice to make.
        "ready": not blocking,
        "blocking": blocking,
        "advisory": advisory,
        "passed": passed,
        "ladder": ladder_for(fm),
    }


def readiness_all(repo_root: Path, roster_path: Path | None = None) -> dict:
    """One row per `NNNN-` spec file (the rule track_specs, sprint.py and spec_status share — the
    installed `spec-template.md` is not work), each row exactly what `--spec` would say plus the
    repo-relative `path` a board keys on."""
    specs_dir = repo_root / "specs"
    paths = sorted(p for p in specs_dir.glob("*.md") if SPEC_FILE_RE.match(p.name)) \
        if specs_dir.is_dir() else []
    rows = []
    for p in paths:
        row = readiness(p, roster_path)
        row["path"] = str(p.resolve().relative_to(repo_root.resolve())).replace("\\", "/")
        rows.append(row)
    return {"ok": True, "specs": rows}


def resolve_roster(args) -> Path | None:
    if args.state:
        state = Path(args.state)
        if state.exists():
            return state.parent / "team.yaml"
        return None
    if getattr(args, "all", False):
        candidate = Path(args.repo).resolve() / ".sdlc" / "team.yaml"
        return candidate if candidate.exists() else None
    # Standalone: look for a roster beside the spec's own repository, and shrug if absent —
    # the owner/team cross-check simply reports that it was skipped.
    spec = Path(args.spec).resolve()
    for parent in spec.parents:
        candidate = parent / ".sdlc" / "team.yaml"
        if candidate.exists():
            return candidate
    return None


def resolve_repo_root(args) -> Path:
    if args.state:
        return Path(args.state).resolve().parent.parent
    return Path(args.repo).resolve()


def format_report(result: dict) -> str:
    if not result["ok"]:
        return f"Error: {result['error']}"

    lines = [f"Spec {result['spec'] or '(unknown)'} — {'READY' if result['ready'] else 'NOT READY'}"]
    for f in result["blocking"]:
        lines.append(f"  BLOCKING  {f['check']}: {f['message']}")
    for f in result["advisory"]:
        lines.append(f"  advisory  {f['check']}: {f['message']}")
    if not result["blocking"] and not result["advisory"]:
        lines.append("  Nothing outstanding.")
    return "\n".join(lines)


def format_all_report(result: dict) -> str:
    rows = result["specs"]
    if not rows:
        return "No specs found (no specs/NNNN-*.md)."
    return "\n".join(format_report(row).splitlines()[0] for row in rows)


def main():
    parser = argparse.ArgumentParser(
        description="A spec's Definition-of-Ready findings as data (read-only; always exits 0)")
    what = parser.add_mutually_exclusive_group(required=True)
    what.add_argument("--spec", help="Path to specs/NNNN-name.md")
    what.add_argument("--all", action="store_true",
                      help="Every specs/NNNN-*.md in one run (for a board) — one row per spec")
    parser.add_argument("--state", help="Path to .sdlc/state.yaml (enables the roster cross-check)")
    parser.add_argument("--repo", default=".", help="Repo root for --all in standalone mode (default: cwd)")
    parser.add_argument("--json", action="store_true", help="Emit the findings as JSON")
    args = parser.parse_args()

    if getattr(args, "all", False):
        result = readiness_all(resolve_repo_root(args), resolve_roster(args))
        print(json.dumps(result, indent=2) if args.json else format_all_report(result))
        return

    result = readiness(Path(args.spec), resolve_roster(args))
    print(json.dumps(result, indent=2) if args.json else format_report(result))


if __name__ == "__main__":
    main()
