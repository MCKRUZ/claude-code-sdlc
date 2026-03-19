"""
advance_phase.py — Advance the SDLC state to the next phase.

Runs all exit gate checks for the current phase. If all MUST gates pass
AND manual approval has been given (--confirmed flag), advances state.yaml
to the next phase and records the transition in history.

Usage:
    uv run advance_phase.py --state .sdlc/state.yaml --confirmed
    uv run advance_phase.py --state .sdlc/state.yaml           # dry-run: checks gates, does not advance

The --confirmed flag represents explicit human sign-off. /sdlc-next must
present the gate results to the user and require approval before passing
--confirmed to this script.
"""

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml

# Re-use gate checking logic from check_gates.py
PLUGIN_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).parent))
from check_gates import check_phase_gates, format_results


def load_yaml(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def save_yaml(path: Path, data: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)


def get_phase_registry() -> list[dict]:
    registry_path = PLUGIN_ROOT / "phases" / "phase-registry.yaml"
    data = load_yaml(registry_path)
    return data["phases"]


def get_phase_def(phase_id: int) -> dict | None:
    for p in get_phase_registry():
        if p["id"] == phase_id:
            return p
    return None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def advance(state_path: Path, confirmed: bool) -> int:
    """
    Returns 0 on success, 1 on gate failure, 2 on other errors.
    """
    state = load_yaml(state_path)
    sdlc_dir = state_path.parent
    profile_path = sdlc_dir / "profile.yaml"

    if not profile_path.exists():
        print(f"Error: Profile not found: {profile_path}", file=sys.stderr)
        return 2

    profile = load_yaml(profile_path)
    current_phase_id = state["current_phase"]
    artifacts_base = sdlc_dir / "artifacts"

    # Check we're not already at the end
    if current_phase_id >= 9:
        print("Project is at Phase 9 (Monitoring) — already complete.")
        return 0

    # --- Run gate checks ---
    results = check_phase_gates(current_phase_id, state, profile, artifacts_base)
    print(format_results(results, current_phase_id))
    print()

    # Check for MUST failures
    must_failures = [r for r in results if r["passed"] is False and r.get("severity") == "MUST"]
    if must_failures:
        print(f"BLOCKED — {len(must_failures)} MUST gate(s) failed. Fix before advancing.")
        return 1

    # Check for manual gates
    manual_gates = [r for r in results if r["passed"] is None]
    if manual_gates and not confirmed:
        print(f"REVIEW REQUIRED — {len(manual_gates)} manual gate(s) need human sign-off:")
        for g in manual_gates:
            print(f"  -{g['message']}")
        print()
        print("Have the stakeholder review the artifacts, then re-run with --confirmed to advance.")
        return 1

    if not confirmed:
        print("Dry run complete — all automated gates passed.")
        print("Re-run with --confirmed after human review to advance.")
        return 0

    # --- Advance state ---
    next_phase_id = current_phase_id + 1
    current_def = get_phase_def(current_phase_id)
    next_def = get_phase_def(next_phase_id)

    if not next_def:
        print(f"Error: No definition found for Phase {next_phase_id}", file=sys.stderr)
        return 2

    timestamp = now_iso()

    # Gate result summary for history
    gate_summary = {
        "passed": sum(1 for r in results if r["passed"] is True),
        "failed": sum(1 for r in results if r["passed"] is False),
        "manual": sum(1 for r in results if r["passed"] is None),
    }

    # Update phases
    state["phases"][current_phase_id]["status"] = "completed"
    state["phases"][current_phase_id]["completed_at"] = timestamp
    state["phases"][current_phase_id]["gate_results"] = gate_summary

    state["phases"][next_phase_id]["status"] = "active"
    state["phases"][next_phase_id]["entered_at"] = timestamp

    # Update top-level current phase
    state["current_phase"] = next_phase_id
    state["phase_name"] = next_def["name"]

    # Append to history
    if "history" not in state:
        state["history"] = []
    state["history"].append({
        "from": current_phase_id,
        "to": next_phase_id,
        "at": timestamp,
        "gate_results": gate_summary,
    })

    save_yaml(state_path, state)

    # --- Print next phase guidance ---
    print(f"[OK] Advanced: Phase {current_phase_id} ({current_def['name']}) -> Phase {next_phase_id} ({next_def['name']})")
    print()
    print(f"{'=' * 50}")
    print(f"Now entering: {next_def['display']}")
    print(f"{'=' * 50}")
    print(f"{next_def['description']}")
    print()

    skills = next_def.get("skills", {})
    primary = skills.get("primary", [])
    secondary = skills.get("secondary", [])
    if primary:
        print(f"Primary skills:   {', '.join(primary)}")
    if secondary:
        print(f"Secondary skills: {', '.join(secondary)}")

    artifacts = next_def.get("artifacts", {})
    required = artifacts.get("required", [])
    optional = artifacts.get("optional", [])
    if required:
        print()
        print("Required artifacts:")
        for a in required:
            print(f"  -{a}")
    if optional:
        print("Optional artifacts:")
        for a in optional:
            print(f"  -{a}")

    print()
    print(f"Artifact directory: .sdlc/artifacts/phase{next_phase_id:02d}/")
    print(f"Phase definition:   {next_def['definition']}")
    print()
    print("Run /sdlc to see full phase guidance.")

    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Advance SDLC to next phase")
    parser.add_argument("--state", required=True, help="Path to .sdlc/state.yaml")
    parser.add_argument(
        "--confirmed",
        action="store_true",
        default=False,
        help="Human has reviewed artifacts and approved phase transition. Required to actually advance.",
    )
    args = parser.parse_args()

    state_path = Path(args.state)
    if not state_path.exists():
        print(f"Error: State file not found: {state_path}", file=sys.stderr)
        sys.exit(2)

    sys.exit(advance(state_path, args.confirmed))


if __name__ == "__main__":
    main()
