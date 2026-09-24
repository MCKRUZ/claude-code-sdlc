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

Always exits 0: this is a report about a spec, not a verdict on a run. `check_spec.py` keeps
its own exit codes for the pipeline, which is where a verdict belongs.

Standalone or Workflow:
  - Standalone: --spec path/to/specs/NNNN-name.md
  - Workflow:   --spec ... --state .sdlc/state.yaml (roster cross-check included)
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_spec as cs


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
    }


def resolve_roster(args) -> Path | None:
    if args.state:
        state = Path(args.state)
        if state.exists():
            return state.parent / "team.yaml"
        return None
    # Standalone: look for a roster beside the spec's own repository, and shrug if absent —
    # the owner/team cross-check simply reports that it was skipped.
    spec = Path(args.spec).resolve()
    for parent in spec.parents:
        candidate = parent / ".sdlc" / "team.yaml"
        if candidate.exists():
            return candidate
    return None


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


def main():
    parser = argparse.ArgumentParser(
        description="A spec's Definition-of-Ready findings as data (read-only; always exits 0)")
    parser.add_argument("--spec", required=True, help="Path to specs/NNNN-name.md")
    parser.add_argument("--state", help="Path to .sdlc/state.yaml (enables the roster cross-check)")
    parser.add_argument("--json", action="store_true", help="Emit the findings as JSON")
    args = parser.parse_args()

    result = readiness(Path(args.spec), resolve_roster(args))
    print(json.dumps(result, indent=2) if args.json else format_report(result))


if __name__ == "__main__":
    main()
