"""What Foundation handed to Build, read from the documents themselves (spec 0013).

Spec 0013 asks for a list of what Foundation delivered where each item names the document it
came from and where that document lives — and, explicitly, where the list is READ FROM THOSE
DOCUMENTS rather than written into the application. That last clause is the whole design.

A hardcoded list would be a second description of Foundation's output. It would look right on
the day it was written and quietly stop matching the moment a template changed, with the screen
showing a confident summary of something no longer true. Reading the documents means the screen
can only ever say what they actually say.

Which documents count as Foundation's output is the phase registry's answer, not this file's.
What each contains is read with the shape library's own heading parser, so there is no second
piece of markdown-reading logic to keep in step with the first.

A document that does not exist yet says so. That is useful — a Build that opened without a risk
tier map is a real situation, and a list that quietly omitted it would hide exactly the thing
worth noticing.

Read-only, always exits 0.

Standalone or Workflow:
  - Standalone: --repo <path>
  - Workflow:   --state <path>/.sdlc/state.yaml
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import document_shape as ds
import phase_model as pm

FOUNDATION_PHASE = "3"


def _headings(text: str) -> list[str]:
    """The document's top-level sections, using the shape library's own parser."""
    return [
        heading.strip()
        for heading, _, _, _ in ds.find_heading_spans(ds.HEADING2_RE, text)
        if heading.strip()
    ]


def summarize(repo_root: Path) -> dict:
    try:
        phase = pm.get_phase(FOUNDATION_PHASE)
    except Exception as e:  # noqa: BLE001 — a registry problem is reported, never fatal
        return {"ok": False, "error": f"The phase registry could not be read: {e}",
                "stage": None, "documents": []}

    if phase is None:
        return {"ok": False, "error": "Foundation is not in the phase registry.",
                "stage": None, "documents": []}

    # Resolved exactly as stage_readiness.py resolves them — an artifact may live at the
    # repository root rather than under the phase directory, and re-deriving that rule here
    # would be a second copy of it waiting to disagree.
    phase_dir = repo_root / ".sdlc" / "artifacts" / (phase.get("slug") or "")

    documents = []
    for art in pm.required_artifacts(phase):
        full = art.base_dir(phase_dir, repo_root) / art.name
        rel = (str(full.relative_to(repo_root)).replace("\\", "/")
               if full.is_relative_to(repo_root) else art.name)

        if not full.exists():
            documents.append({
                "name": art.name, "path": rel, "exists": False, "sections": [],
                # Said plainly rather than omitted: a Build that opened without one of these
                # is a real situation, and hiding it hides the thing worth noticing.
                "note": "Foundation did not produce this, or it has not been written yet.",
            })
            continue
        try:
            text = full.read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            documents.append({"name": art.name, "path": rel, "exists": True, "sections": [],
                              "note": f"could not be read: {e}"})
            continue
        documents.append({"name": art.name, "path": rel, "exists": True,
                          "sections": _headings(text), "note": None})

    return {
        "ok": True,
        "error": None,
        "stage": {"id": str(phase.get("id")), "display": phase.get("display"),
                  "description": phase.get("description")},
        "documents": documents,
    }


def format_report(result: dict) -> str:
    if not result["ok"]:
        return f"Error: {result['error']}"
    lines = [result["stage"]["display"], ""]
    for doc in result["documents"]:
        mark = "  " if doc["exists"] else "  MISSING "
        lines.append(f"{mark}{doc['name']}")
        lines.append(f"           {doc['path']}")
        if doc["note"]:
            lines.append(f"           {doc['note']}")
        for section in doc["sections"]:
            lines.append(f"             - {section}")
    return "\n".join(lines)


def resolve_repo_root(args) -> Path:
    if args.state:
        state = Path(args.state)
        if not state.exists():
            print(f"Error: State file not found: {state}", file=sys.stderr)
            sys.exit(1)
        return state.resolve().parent.parent
    return Path(args.repo).resolve()


def main():
    parser = argparse.ArgumentParser(
        description="What Foundation handed to Build (read-only; always exits 0)")
    src = parser.add_mutually_exclusive_group()
    src.add_argument("--state", help="Path to .sdlc/state.yaml (workflow mode)")
    src.add_argument("--repo", default=".", help="Target repo root (standalone mode; default: cwd)")
    parser.add_argument("--json", action="store_true", help="Emit the summary as JSON")
    args = parser.parse_args()

    result = summarize(resolve_repo_root(args))
    print(json.dumps(result, indent=2) if args.json else format_report(result))


if __name__ == "__main__":
    main()
