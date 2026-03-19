"""Generate a status dashboard from .sdlc/state.yaml."""

import argparse
import sys
from pathlib import Path

import yaml


def load_yaml(path: Path) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


PHASE_NAMES = {
    0: "Discovery",
    1: "Requirements",
    2: "Design",
    3: "Planning",
    4: "Implementation",
    5: "Quality",
    6: "Testing",
    7: "Documentation",
    8: "Deployment",
    9: "Monitoring",
}

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
    current = state.get("current_phase", 0)

    lines.append(f"# SDLC Status Dashboard")
    lines.append(f"**Project:** {project}")
    lines.append(f"**Profile:** {profile}")
    lines.append(f"**Current Phase:** {current} — {PHASE_NAMES.get(current, 'Unknown')}")
    lines.append("")

    # Progress bar
    completed = sum(
        1 for p in state.get("phases", {}).values()
        if isinstance(p, dict) and p.get("status") == "completed"
    )
    total = len(PHASE_NAMES)
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

    for phase_id in range(10):
        phase_key = str(phase_id) if str(phase_id) in phases else phase_id
        phase_data = phases.get(phase_key, phases.get(phase_id, {}))
        if not isinstance(phase_data, dict):
            phase_data = {}

        name = PHASE_NAMES.get(phase_id, "Unknown")
        status = phase_data.get("status", "pending")
        icon = STATUS_ICONS.get(status, "[ ]")
        phase_dir = f"{phase_id:02d}-{name.lower()}"
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


def main():
    parser = argparse.ArgumentParser(description="Generate SDLC status dashboard")
    parser.add_argument("--state", required=True, help="Path to .sdlc/state.yaml")
    parser.add_argument("--output", default=None, help="Output file (default: stdout)")
    args = parser.parse_args()

    state_path = Path(args.state)
    if not state_path.exists():
        print(f"Error: State file not found: {state_path}")
        sys.exit(1)

    state = load_yaml(state_path)
    sdlc_dir = state_path.parent
    dashboard = generate_dashboard(state, sdlc_dir)

    if args.output:
        Path(args.output).write_text(dashboard)
        print(f"Dashboard written to {args.output}")
    else:
        print(dashboard)


if __name__ == "__main__":
    main()
