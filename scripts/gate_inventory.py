"""Every gate a change must pass, in the order it meets them (spec 0013).

The gates are already described, once, in the rails operator's guide — a markdown table
giving each gate's file, what fires it, and whether it blocks or advises. This reads that
table and cross-references it against the pipeline files a project actually has.

WHAT THIS DELIBERATELY DOES NOT DO is describe the gates itself. A second description would
be a second source of truth, and the first time a gate changed, one of the two would start
lying — with no way for a reader to tell which. The guide is written for a person and kept
current because people read it; this turns it into data without becoming a rival copy.

Three answers, and the middle one is the point:

  installed    in the guide AND present in this project — a real gate on real changes
  missing      in the guide but NOT present here — the playbook ships it, this project does
               not run it. Spec 0013 asks for exactly this: a gate the playbook ships but
               this project does not have is absent, not listed as if it were protecting
               anybody.
  unexpected   present here but NOT in the guide — a gate this project added for itself.
               Shown rather than hidden: it gates real changes whether the playbook knows
               about it or not.

Read-only, always exits 0.

Standalone or Workflow:
  - Standalone: --repo <path>
  - Workflow:   --state <path>/.sdlc/state.yaml
"""

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
PLAYBOOK_GUIDE = PLUGIN_ROOT / "harness" / "workflows" / "RAILS.md"
INSTALLED_GUIDE = ".github/RAILS.md"
INSTALLED_WORKFLOWS = ".github/workflows"

# Ledgers that record a sanctioned way past a gate. Their EXISTENCE is what matters here —
# a gate with a recorded escape route is a different thing from one without, and a person
# reading this screen should know which they are looking at.
BYPASS_LEDGERS = {
    ".github/eval-bypasses.md": "eval gate",
    ".github/dependency-exceptions.md": "dependency scan",
}


def _split_row(line: str) -> list[str]:
    return [c.strip() for c in line.strip().strip("|").split("|")]


def _is_separator(cells: list[str]) -> bool:
    return bool(cells) and all(set(c) <= set("-: ") and c for c in cells)


def parse_gate_table(text: str) -> list[dict]:
    """The guide's gate table, as rows. Empty when the table is not found — which is reported
    as "could not read the guide", never as "this project has no gates"."""
    lines = text.splitlines()
    header_at = None
    for i, line in enumerate(lines):
        if not line.strip().startswith("|"):
            continue
        cells = [c.lower() for c in _split_row(line)]
        if "gate" in cells and "file" in cells:
            header_at = i
            columns = cells
            break
    if header_at is None:
        return []

    rows = []
    for line in lines[header_at + 1:]:
        if not line.strip().startswith("|"):
            break
        cells = _split_row(line)
        if _is_separator(cells):
            continue
        row = dict(zip(columns, cells))
        name = re.sub(r"[*_`]", "", row.get("gate", "")).strip()
        # "*(optional)*" and similar annotations live in the name cell; kept in `note` rather
        # than stripped away, because "optional" is information a reader needs.
        optional = "optional" in name.lower()
        name = re.sub(r"\(optional\)", "", name, flags=re.I).strip()
        if not name:
            continue
        rows.append({
            "gate": name,
            "file": re.sub(r"[`*]", "", row.get("file", "")).strip(),
            "fires_on": row.get("fires on", ""),
            "blocks": row.get("blocks or advises", ""),
            "optional": optional,
        })
    return rows


def _installed_workflow_files(repo_root: Path) -> list[str]:
    d = repo_root / INSTALLED_WORKFLOWS
    if not d.is_dir():
        return []
    # Both spellings. The code host runs `.yaml` exactly as it runs `.yml`, so globbing only
    # one made a real pipeline invisible to this report in both directions at once: absent from
    # what is installed, and absent from what is unexpected.
    return sorted(f.name for f in d.iterdir()
                  if f.is_file() and f.suffix in (".yml", ".yaml"))


def _disagreement(gate: dict, playbook: list[dict]) -> dict:
    """Where this project's description of a gate differs from the playbook's.

    Reported, never resolved. A project may legitimately have adapted a gate, and deciding
    which copy is right is not this script's to make — but a reader needs to know that the two
    documents do not say the same thing, because only one of them is the standard.
    """
    if not playbook:
        return {}
    match = next((p for p in playbook if p["gate"].lower() == gate["gate"].lower()), None)
    if match is None:
        return {"differs": "the playbook does not describe this gate at all"}

    differences = [
        f"{field}: this project says '{gate.get(field)}', the playbook says '{match.get(field)}'"
        for field in ("file", "fires_on", "blocks")
        if (gate.get(field) or "").strip().lower() != (match.get(field) or "").strip().lower()
    ]
    if gate.get("optional") != match.get("optional"):
        differences.append(
            f"optional: this project says {gate.get('optional')}, "
            f"the playbook says {match.get('optional')}")
    return {"differs": "; ".join(differences)} if differences else {}


def inventory(repo_root: Path) -> dict:
    """Which gates this project actually has, against what the guide describes."""
    # The project's OWN copy of the guide first: a project may have adapted it, and its copy
    # is what its own team reads. The playbook's copy is the fallback, labelled as such.
    project_guide = repo_root / INSTALLED_GUIDE
    if project_guide.exists():
        guide_text, guide_source = project_guide.read_text(encoding="utf-8"), INSTALLED_GUIDE
    elif PLAYBOOK_GUIDE.exists():
        guide_text, guide_source = PLAYBOOK_GUIDE.read_text(encoding="utf-8"), "the playbook's own copy"
    else:
        return {"ok": False, "guide_source": None, "gates": [], "unexpected": [],
                "bypass_ledgers": [],
                "error": "The rails guide could not be found, so there is nothing describing "
                         "what each gate does. This is not the same as having no gates."}

    # The playbook's own copy is read as well, whenever the project supplied its own. This
    # report is what somebody looks at to answer "is this project protected", and reading only
    # the project's copy answers a different question — "does this project SAY it is protected".
    # A repository supplies both halves of that comparison, so on its own it cannot be evidence.
    # Nothing is overruled here: a project may legitimately differ, and the difference is
    # reported rather than resolved, because which one is right is not this script's to decide.
    playbook_described = (
        parse_gate_table(PLAYBOOK_GUIDE.read_text(encoding="utf-8"))
        if guide_source == INSTALLED_GUIDE and PLAYBOOK_GUIDE.exists() else []
    )

    described = parse_gate_table(guide_text)
    if not described:
        return {"ok": False, "guide_source": guide_source, "gates": [], "unexpected": [],
                "bypass_ledgers": [],
                "error": f"No gate table found in {guide_source}, so the gates cannot be "
                         f"described. This is not the same as having no gates."}

    installed_files = _installed_workflow_files(repo_root)
    described_files = {g["file"] for g in described if g["file"].endswith((".yml", ".yaml"))}

    gates = []
    for g in described:
        # A gate whose file is not a pipeline (a local hook, say) is reported as described but
        # not verifiable from here, rather than silently called missing.
        if not g["file"].endswith((".yml", ".yaml")):
            gates.append({**g, "state": "not_a_pipeline",
                          "detail": "not a pipeline file — cannot be confirmed from the "
                                    "repository alone"})
            continue
        present = g["file"] in installed_files
        gates.append({**g, "state": "installed" if present else "missing",
                      "detail": g["file"] if present
                                else f"{g['file']} is not in {INSTALLED_WORKFLOWS}",
                      **_disagreement(g, playbook_described)})

    unexpected = [
        {"file": name,
         "detail": "this project has this pipeline; the guide does not describe it"}
        for name in installed_files if name not in described_files
    ]

    ledgers = [
        {"file": rel, "gate": gate, "present": (repo_root / rel).exists()}
        for rel, gate in BYPASS_LEDGERS.items()
    ]

    # The case that matters most, and the one reading only the project's copy could never
    # surface: a gate the standard expects, absent from this project's own list entirely. Such
    # a gate is not "missing" in the list above, because the list above is built from the
    # project's description — a gate dropped from that description simply stops being asked
    # about, and the report comes back clean.
    described_names = {g["gate"].lower() for g in described}
    dropped = [
        {"gate": p["gate"], "file": p["file"], "blocks": p["blocks"],
         "detail": "the playbook expects this gate; this project's own guide does not list it, "
                   "so nothing above checks for it"}
        for p in playbook_described
        if p["gate"].lower() not in described_names and not p.get("optional")
    ]

    return {"ok": True, "guide_source": guide_source, "gates": gates,
            "unexpected": unexpected, "not_in_project_guide": dropped,
            "compared_with_playbook": bool(playbook_described),
            "bypass_ledgers": ledgers, "error": None}


def format_report(result: dict) -> str:
    if not result["ok"]:
        return f"Error: {result['error']}"

    source = result["guide_source"]
    if source == INSTALLED_GUIDE:
        # Said plainly, because it is the difference between what this report can and cannot
        # be evidence of. A project supplies both its gate list and the files it names.
        source = f"{source} — this project's OWN copy, not the playbook's"
    lines = [f"Gates described in {source}:"]
    for g in result["gates"]:
        mark = {"installed": "  ", "missing": "  MISSING ", "not_a_pipeline": "  (local) "}[g["state"]]
        lines.append(f"{mark} {g['gate']:<22} {g['blocks']}")
        lines.append(f"           fires on: {g['fires_on']}")
        if g.get("differs"):
            lines.append(f"           DIFFERS FROM THE PLAYBOOK — {g['differs']}")

    if result.get("not_in_project_guide"):
        lines.append("")
        lines.append("The playbook expects these gates; this project's guide does not list them,")
        lines.append("so nothing above checked for them:")
        for d in result["not_in_project_guide"]:
            lines.append(f"   {d['gate']:<22} {d['blocks']}")

    if result["unexpected"]:
        lines.append("")
        lines.append("This project also has pipelines the guide does not describe:")
        for u in result["unexpected"]:
            lines.append(f"   {u['file']}")
    present_ledgers = [l for l in result["bypass_ledgers"] if l["present"]]
    if present_ledgers:
        lines.append("")
        lines.append("Recorded ways past a gate:")
        for l in present_ledgers:
            lines.append(f"   {l['gate']}: {l['file']}")
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
        description="Every gate a change must pass (read-only; always exits 0)")
    src = parser.add_mutually_exclusive_group()
    src.add_argument("--state", help="Path to .sdlc/state.yaml (workflow mode)")
    src.add_argument("--repo", default=".", help="Target repo root (standalone mode; default: cwd)")
    parser.add_argument("--json", action="store_true", help="Emit the inventory as JSON")
    args = parser.parse_args()

    result = inventory(resolve_repo_root(args))
    print(json.dumps(result, indent=2) if args.json else format_report(result))


if __name__ == "__main__":
    main()
