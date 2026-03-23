"""Synthesize Phase 1 SDLC artifacts into a single spec file for /deep-plan."""

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml


def load_yaml(path: Path) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def read_artifact(path: Path) -> str:
    """Read an artifact file, returning empty string if missing."""
    if path.exists():
        return path.read_text(encoding="utf-8", errors="replace").strip()
    return ""


def synthesize(artifacts_base: Path, output: Path) -> None:
    """Combine Phase 0-1 artifacts into a single /deep-plan spec file."""
    discovery_dir = artifacts_base / "00-discovery"
    requirements_dir = artifacts_base / "01-requirements"

    # Phase 0 inputs (optional enrichment)
    problem_statement = read_artifact(discovery_dir / "problem-statement.md")
    constraints = read_artifact(discovery_dir / "constraints.md")
    success_criteria = read_artifact(discovery_dir / "success-criteria.md")

    # Phase 1 inputs (primary)
    requirements = read_artifact(requirements_dir / "requirements.md")
    nfrs = read_artifact(requirements_dir / "non-functional-requirements.md")
    epics = read_artifact(requirements_dir / "epics.md")
    handoff = read_artifact(requirements_dir / "phase2-handoff.md")

    if not requirements:
        print("Error: requirements.md not found or empty in 01-requirements/")
        sys.exit(1)

    sections = []
    sections.append(f"# Project Specification")
    sections.append(f"<!-- Synthesized from SDLC Phase 0-1 artifacts on "
                    f"{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} -->")
    sections.append(f"<!-- Source: {artifacts_base} -->")
    sections.append("")

    if problem_statement:
        sections.append("## Problem Statement")
        sections.append(problem_statement)
        sections.append("")

    if success_criteria:
        sections.append("## Success Criteria")
        sections.append(success_criteria)
        sections.append("")

    sections.append("## Functional Requirements")
    sections.append(requirements)
    sections.append("")

    if nfrs:
        sections.append("## Non-Functional Requirements")
        sections.append(nfrs)
        sections.append("")

    if epics:
        sections.append("## Epics and User Stories")
        sections.append(epics)
        sections.append("")

    if constraints:
        sections.append("## Constraints")
        sections.append(constraints)
        sections.append("")

    if handoff:
        sections.append("## Open Design Questions")
        sections.append("<!-- From Phase 1 handoff — these should be resolved during /deep-plan's interview step -->")
        sections.append(handoff)
        sections.append("")

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(sections), encoding="utf-8")
    print(f"Spec synthesized: {output}")
    print(f"  Sources: {sum(1 for s in [problem_statement, constraints, success_criteria, requirements, nfrs, epics, handoff] if s)} artifact(s)")


def main():
    parser = argparse.ArgumentParser(
        description="Synthesize Phase 0-1 artifacts into a /deep-plan spec file"
    )
    parser.add_argument(
        "--state", required=True, help="Path to .sdlc/state.yaml"
    )
    parser.add_argument(
        "--output", required=True, help="Output path for synthesized spec (e.g., planning/spec.md)"
    )
    args = parser.parse_args()

    state_path = Path(args.state)
    if not state_path.exists():
        print(f"Error: State file not found: {state_path}")
        sys.exit(1)

    sdlc_dir = state_path.parent
    artifacts_base = sdlc_dir / "artifacts"

    if not artifacts_base.exists():
        print(f"Error: Artifacts directory not found: {artifacts_base}")
        sys.exit(1)

    output = Path(args.output)
    synthesize(artifacts_base, output)


if __name__ == "__main__":
    main()
