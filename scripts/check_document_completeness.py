"""Advisory: report which required fields a shaped document is missing (spec 0007).

This is NOT wired into check_gates.py — it is a new, separate, additive check. Whether it
ever blocks a gate is a later, deliberate decision; today it only ever exits 0. It closes a
real gap: today's completeness gate (check_gates.py's G2-completeness) passes a document
with a required SECTION deleted outright, because it never checks structure — only that
gate is protected and untouched; this ships beside it.

A required field is "absent or empty" — literally no content in its span — never a guess
about whether text still looks like a placeholder (see document_shape.py's docstring: type
is metadata for a UI, never something this library or check infers meaning from).

Standalone or Workflow:
  - Single document: --doc <path.md> --shape <path.shape.yaml>
  - Scan:            --repo <path>   (walks .sdlc/artifacts/**/*.md, matches each by stamp)
                      --state .sdlc/state.yaml
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import document_shape as ds
import yaml


def load_shape(shape_path: Path) -> dict:
    return yaml.safe_load(shape_path.read_text(encoding="utf-8"))


def check_document(doc_text: str, shape: dict) -> list[dict]:
    """[{section, field, reason}, ...] — empty means nothing to report. `reason` is
    'section not found' (the whole-document mismatch case) or 'absent or empty'."""
    result = ds.read_document(doc_text, shape)
    findings = []

    if not result["matched"]:
        for w in result["warnings"]:
            findings.append({"section": w, "field": None, "reason": "section not found"})
        return findings

    for block in result["blocks"]:
        if block["kind"] == "section":
            for label, field in block["fields"].items():
                if field is None or (field["required"] and field["empty"]):
                    findings.append({
                        "section": block["heading"], "field": label, "reason": "absent or empty",
                    })
        elif block["kind"] == "repeating_section":
            for instance in block["instances"]:
                for label, field in instance["fields"].items():
                    if field is None or (field["required"] and field["empty"]):
                        findings.append({
                            "section": f"{block['heading']} > {instance['heading_text']}",
                            "field": label, "reason": "absent or empty",
                        })
    return findings


def find_shape_for_template(templates_root: Path, template_id: str) -> Path | None:
    for shape_path in templates_root.rglob("*.shape.yaml"):
        shape = load_shape(shape_path)
        if shape.get("template") == template_id:
            return shape_path
    return None


def scan_repo(repo_root: Path, templates_root: Path) -> dict[str, list[dict]]:
    """{doc_relpath: findings} for every stamped document under .sdlc/artifacts whose
    template has a shape. An unstamped document, or a stamped one with no matching shape,
    is silently skipped — advisory, not an inventory audit."""
    artifacts_dir = repo_root / ".sdlc" / "artifacts"
    results: dict[str, list[dict]] = {}
    if not artifacts_dir.exists():
        return results
    for doc_path in sorted(artifacts_dir.rglob("*.md")):
        text = doc_path.read_text(encoding="utf-8", errors="replace")
        stamp = ds.read_stamp(text)
        if stamp is None:
            continue
        shape_path = find_shape_for_template(templates_root, stamp[0])
        if shape_path is None:
            continue
        findings = check_document(text, load_shape(shape_path))
        if findings:
            results[str(doc_path.relative_to(repo_root))] = findings
    return results


def format_findings(findings: list[dict]) -> str:
    if not findings:
        return "No missing required fields."
    lines = [f"{len(findings)} completeness finding(s):"]
    for f in findings:
        if f["field"] is None:
            lines.append(f"  - {f['section']}: {f['reason']}")
        else:
            lines.append(f"  - {f['section']} > {f['field']}: {f['reason']}")
    return "\n".join(lines)


def resolve_repo_root(args) -> Path:
    if args.state:
        state_path = Path(args.state)
        if not state_path.exists():
            print(f"Error: State file not found: {state_path}")
            sys.exit(1)
        return state_path.resolve().parent.parent
    return Path(args.repo).resolve()


def main():
    parser = argparse.ArgumentParser(
        description="Advisory: report missing required fields on a shaped document (never blocks)"
    )
    parser.add_argument("--doc", help="A single document to check (requires --shape)")
    parser.add_argument("--shape", help="The shape to check --doc against")
    src = parser.add_mutually_exclusive_group()
    src.add_argument("--state", help="Path to .sdlc/state.yaml (scan mode)")
    src.add_argument("--repo", help="Repo root containing .sdlc/artifacts (scan mode)")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    templates_root = Path(__file__).resolve().parent.parent / "templates"

    if args.doc:
        if not args.shape:
            print("Error: --doc requires --shape")
            sys.exit(0)  # advisory — never a hard exit-1 usage failure either
        doc_path, shape_path = Path(args.doc), Path(args.shape)
        if not doc_path.exists() or not shape_path.exists():
            print("Error: --doc or --shape path not found")
            sys.exit(0)
        findings = check_document(
            doc_path.read_text(encoding="utf-8", errors="replace"), load_shape(shape_path)
        )
        print(json.dumps(findings, indent=2) if args.json else format_findings(findings))
        sys.exit(0)

    repo_root = resolve_repo_root(args) if (args.state or args.repo) else Path(".").resolve()
    results = scan_repo(repo_root, templates_root)
    if args.json:
        print(json.dumps(results, indent=2))
    elif not results:
        print("No missing required fields across any shaped, stamped document.")
    else:
        for doc, findings in results.items():
            print(f"{doc}:")
            print("  " + format_findings(findings).replace("\n", "\n  "))
    sys.exit(0)


if __name__ == "__main__":
    main()
