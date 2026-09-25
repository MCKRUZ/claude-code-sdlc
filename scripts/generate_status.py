"""Generate a status dashboard from .sdlc/state.yaml.

`--json` (spec 0008) emits the same data as structured JSON instead of the markdown
dashboard — this is Studio's ONLY way to read a project's stage state; it never re-derives
phase order or status from state.yaml/phase-registry.yaml itself. Adding it changes nothing
about the default (markdown) output.
"""

import argparse
import json
import sys
from pathlib import Path

import yaml

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).parent))
import phase_model as pm


def load_yaml(path: Path) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


STATUS_ICONS = {
    "completed": "[x]",
    "active": "[>]",
    "pending": "[ ]",
    "skipped": "[-]",
}


def count_artifacts(artifacts_dir: Path, phase_dir: str) -> int:
    d = artifacts_dir / phase_dir
    if not d.exists():
        return 0
    count = 0
    for item in d.rglob("*"):
        if item.is_file():
            count += 1
    return count


def generate_dashboard(state: dict, sdlc_dir: Path) -> str:
    lines = []
    project = state.get("project_name", "Unknown")
    profile = state.get("profile_id", "Unknown")
    current = pm.normalize_id(state.get("current_phase", 0))
    current_def = pm.get_phase(current)
    current_label = current_def["display"] if current_def else "Unknown"

    lines.append(f"# SDLC Status Dashboard")
    lines.append(f"**Project:** {project}")
    lines.append(f"**Profile:** {profile}")
    lines.append(f"**Current Phase:** {current} — {current_label}")
    lines.append("")

    # Progress bar
    completed = sum(
        1 for p in state.get("phases", {}).values()
        if isinstance(p, dict) and p.get("status") == "completed"
    )
    total = pm.phase_count()
    pct = int((completed / total) * 100)
    bar_filled = int(pct / 5)
    bar = "#" * bar_filled + "-" * (20 - bar_filled)
    lines.append(f"**Progress:** [{bar}] {pct}% ({completed}/{total} phases)")
    lines.append("")

    # Phase table
    lines.append("## Phases")
    lines.append("")
    lines.append("| # | Phase | Status | Artifacts | Entered | Completed |")
    lines.append("|---|-------|--------|-----------|---------|-----------|")

    artifacts_dir = sdlc_dir / "artifacts"
    phases = state.get("phases", {})

    for p in pm.all_phases():
        phase_id = pm.normalize_id(p["id"])
        phase_data = phases.get(phase_id, {})
        if not isinstance(phase_data, dict):
            phase_data = {}

        name = p["name"].title()
        status = phase_data.get("status", "pending")
        icon = STATUS_ICONS.get(status, "[ ]")
        phase_dir = p["slug"]
        artifact_count = count_artifacts(artifacts_dir, phase_dir)
        entered = phase_data.get("entered_at", "—")
        completed_at = phase_data.get("completed_at", "—")

        if entered and entered != "—" and len(entered) > 10:
            entered = entered[:10]
        if completed_at and completed_at != "—" and completed_at != "null" and len(str(completed_at)) > 10:
            completed_at = str(completed_at)[:10]
        if completed_at == "null" or completed_at is None:
            completed_at = "—"

        lines.append(f"| {phase_id} | {icon} {name} | {status} | {artifact_count} files | {entered} | {completed_at} |")

    # History
    history = state.get("history", [])
    if history:
        lines.append("")
        lines.append("## Transition History")
        lines.append("")
        lines.append("| From | To | Timestamp |")
        lines.append("|------|----|-----------|")
        for entry in history[-10:]:  # Last 10 transitions
            lines.append(f"| Phase {entry.get('from', '?')} | Phase {entry.get('to', '?')} | {entry.get('at', '—')} |")

    return "\n".join(lines)


def _signed_off_by(phase_data: dict):
    """The name advance_phase.py recorded for this stage, or None.

    It writes the name as a scalar INSIDE `gate_results`, beside the gate entries, which is why
    this looks there rather than at a top-level key. Anything that is not a non-empty string is
    reported as None: "not recorded" and "recorded as nobody" would look identical otherwise,
    and only one of them is true.
    """
    gate_results = phase_data.get("gate_results")
    if not isinstance(gate_results, dict):
        return None
    name = gate_results.get("signed_off_by")
    return name.strip() if isinstance(name, str) and name.strip() else None


def status_json(state: dict, sdlc_dir: Path) -> dict:
    """Structured project/stage state for Studio's header + stage navigation. `stage_state`
    is exactly the three values Studio's frame needs: 'current', 'signed_off' (status was
    'completed'), or 'later' (anything else — pending, skipped, or not yet reached)."""
    current = pm.normalize_id(state.get("current_phase", 0))
    current_def = pm.get_phase(current)
    artifacts_dir = sdlc_dir / "artifacts"
    phases_state = state.get("phases", {})

    stages = []
    for p in pm.all_phases():
        phase_id = pm.normalize_id(p["id"])
        phase_data = phases_state.get(phase_id, {})
        if not isinstance(phase_data, dict):
            phase_data = {}
        status = phase_data.get("status", "pending")

        if phase_id == current:
            stage_state = "current"
        elif status == "completed":
            stage_state = "signed_off"
        else:
            stage_state = "later"

        stages.append({
            "id": phase_id,
            "name": p["name"],
            "display": p["display"],
            "status": status,
            "stage_state": stage_state,
            "artifact_count": count_artifacts(artifacts_dir, p["slug"]),
            "entered_at": phase_data.get("entered_at"),
            "completed_at": phase_data.get("completed_at"),
            # Who signed this stage off, as advance_phase.py recorded it. Additive, and null
            # whenever nothing was recorded — a stage advanced before sign-offs existed, or
            # advanced without a name, reads as "not recorded" rather than as nobody.
            #
            # It is here because a screen showing "signed off" without the name can only get it
            # by parsing state.yaml itself, and a second reader of that file is a second thing
            # to keep in step with this one.
            "signed_off_by": _signed_off_by(phase_data),
        })

    return {
        "project_name": state.get("project_name", "Unknown"),
        "profile_id": state.get("profile_id", "Unknown"),
        "current_phase": {
            "id": current,
            "display": current_def["display"] if current_def else "Unknown",
        },
        "stages": stages,
    }


def main():
    parser = argparse.ArgumentParser(description="Generate SDLC status dashboard")
    parser.add_argument("--state", required=True, help="Path to .sdlc/state.yaml")
    parser.add_argument("--output", default=None, help="Output file (default: stdout)")
    parser.add_argument("--json", action="store_true", help="Emit structured JSON instead of markdown")
    args = parser.parse_args()

    state_path = Path(args.state)
    if not state_path.exists():
        print(f"Error: State file not found: {state_path}")
        sys.exit(1)

    state = load_yaml(state_path)
    sdlc_dir = state_path.parent

    if args.json:
        output = json.dumps(status_json(state, sdlc_dir), indent=2)
    else:
        output = generate_dashboard(state, sdlc_dir)

    if args.output:
        Path(args.output).write_text(output)
        print(f"Dashboard written to {args.output}")
    else:
        print(output)


if __name__ == "__main__":
    main()
