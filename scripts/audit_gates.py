"""Analyze gate effectiveness across completed SDLC phases."""

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

import yaml

# Below this many completed phases the script itself warns that results may not be
# representative.
MIN_PHASES = 3


def load_yaml(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def extract_gate_history(state: dict) -> list[dict]:
    """Extract all gate results from completed phases."""
    results = []
    phases = state.get("phases", {})

    for phase_key, phase_data in phases.items():
        if not isinstance(phase_data, dict):
            continue
        gate_results = phase_data.get("gate_results", {})
        if not gate_results:
            continue

        if isinstance(gate_results, list):
            for gr in gate_results:
                results.append({**gr, "phase": phase_key})
        elif isinstance(gate_results, dict):
            for gate_name, gate_data in gate_results.items():
                if isinstance(gate_data, dict):
                    results.append({**gate_data, "gate": gate_name, "phase": phase_key})
                elif isinstance(gate_data, list):
                    for item in gate_data:
                        if isinstance(item, dict):
                            results.append({**item, "phase": phase_key})

    return results


def analyze_gates(results: list[dict]) -> dict:
    """Compute gate effectiveness metrics."""
    gate_stats = defaultdict(lambda: {
        "total": 0, "passed": 0, "failed": 0, "manual": 0,
        "phases_seen": set(), "overrides": [],
    })

    for r in results:
        gate = r.get("gate", "unknown")
        stats = gate_stats[gate]
        stats["total"] += 1
        stats["phases_seen"].add(str(r.get("phase", "?")))

        passed = r.get("passed")
        if passed is True:
            stats["passed"] += 1
        elif passed is False:
            stats["failed"] += 1
        else:
            stats["manual"] += 1

        if r.get("override"):
            stats["overrides"].append({
                "phase": r.get("phase"),
                "justification": r.get("justification", "none provided"),
            })

    return dict(gate_stats)


def completed_phases(state: dict) -> int:
    return sum(
        1 for p in state.get("phases", {}).values()
        if isinstance(p, dict) and p.get("status") == "completed"
    )


def sort_gates(gate_stats: dict) -> list:
    return sorted(gate_stats.items(), key=lambda x: x[1]["total"], reverse=True)


def always_pass_gates(sorted_gates: list) -> list:
    return [
        (g, s) for g, s in sorted_gates
        if s["failed"] == 0 and s["total"] > 0 and s["manual"] == 0
    ]


def high_fail_gates(sorted_gates: list) -> list:
    return [
        (g, s) for g, s in sorted_gates
        if s["total"] > 0 and (s["failed"] / s["total"]) > 0.5
    ]


def all_overrides(sorted_gates: list) -> list:
    return [{"gate": gate, **ov} for gate, stats in sorted_gates for ov in stats["overrides"]]


def recommendations(always_pass: list, high_fail: list, overrides: list) -> list[str]:
    recs = []
    if always_pass:
        recs.append(
            f"{len(always_pass)} gate(s) never failed. "
            "Consider whether they add value or can be tightened."
        )
    if high_fail:
        recs.append(
            f"{len(high_fail)} gate(s) fail more than half the time. "
            "Review whether thresholds are realistic or the process needs adjustment."
        )
    if overrides:
        recs.append(
            f"{len(overrides)} override(s) recorded. "
            "Review whether overridden gates should be relaxed or better enforced."
        )
    if not always_pass and not high_fail and not overrides:
        recs.append("No immediate concerns. Gate configuration appears well-calibrated.")
    return recs


def build_json(gate_stats: dict, state: dict) -> dict:
    """The audit as data. `enough_data` is false below the script's own MIN_PHASES threshold and
    whenever there are no gate results at all, which also leaves `gates` empty, never zero rows."""
    completed = completed_phases(state)
    sorted_gates = sort_gates(gate_stats)
    always_pass = always_pass_gates(sorted_gates)
    high_fail = high_fail_gates(sorted_gates)
    overrides = all_overrides(sorted_gates)
    always_names = {g for g, _ in always_pass}
    high_names = {g for g, _ in high_fail}
    gates = [{
        "name": gate,
        "runs": stats["total"],
        "passes": stats["passed"],
        "fails": stats["failed"],
        "manual": stats["manual"],
        "fail_rate": round(stats["failed"] / stats["total"], 4) if stats["total"] else None,
        "always_passes": gate in always_names,
        "high_fail": gate in high_names,
        "phases": sorted(stats["phases_seen"]),
        "overrides": stats["overrides"],
    } for gate, stats in sorted_gates]
    return {
        "project_name": state.get("project_name"),
        "profile_id": state.get("profile_id"),
        "phases_completed": completed,
        "enough_data": completed >= MIN_PHASES and bool(gates),
        "gates": gates,
        "recommendations": recommendations(always_pass, high_fail, overrides) if gates else [],
    }


def format_report(gate_stats: dict, state: dict) -> str:
    """Format the audit report."""
    lines = [
        "Gate Effectiveness Audit",
        "=" * 40,
        "",
        f"Project: {state.get('project_name', 'Unknown')}",
        f"Profile: {state.get('profile_id', 'Unknown')}",
        "",
    ]

    completed = completed_phases(state)
    lines.append(f"Completed phases: {completed}")

    if completed < MIN_PHASES:
        lines.append("")
        lines.append(
            "WARNING: Fewer than 3 phases completed. "
            "Audit results may not be representative."
        )

    lines.append("")

    if not gate_stats:
        lines.append("No gate results found in state.yaml.")
        return "\n".join(lines)

    # Summary table
    lines.append("## Gate Summary")
    lines.append("")
    lines.append("| Gate | Runs | Passed | Failed | Manual | Fail Rate |")
    lines.append("|------|------|--------|--------|--------|-----------|")

    sorted_gates = sort_gates(gate_stats)
    for gate, stats in sorted_gates:
        total = stats["total"]
        fail_rate = f"{(stats['failed'] / total * 100):.0f}%" if total > 0 else "—"
        lines.append(
            f"| {gate} | {total} | {stats['passed']} | "
            f"{stats['failed']} | {stats['manual']} | {fail_rate} |"
        )

    # Always-pass gates
    always_pass = always_pass_gates(sorted_gates)
    if always_pass:
        lines.append("")
        lines.append("## Always-Pass Gates (candidates for tightening or removal)")
        lines.append("")
        for gate, stats in always_pass:
            phases = ", ".join(sorted(stats["phases_seen"]))
            lines.append(f"  - {gate}: passed {stats['total']}x across phases [{phases}]")

    # High-fail gates
    high_fail = high_fail_gates(sorted_gates)
    if high_fail:
        lines.append("")
        lines.append("## High-Fail Gates (>50% failure rate — possible process issues)")
        lines.append("")
        for gate, stats in high_fail:
            lines.append(
                f"  - {gate}: failed {stats['failed']}/{stats['total']} "
                f"({stats['failed'] / stats['total'] * 100:.0f}%)"
            )

    # Overrides
    overrides = all_overrides(sorted_gates)

    if overrides:
        lines.append("")
        lines.append("## Override History")
        lines.append("")
        lines.append("| Gate | Phase | Justification |")
        lines.append("|------|-------|---------------|")
        for ov in overrides:
            lines.append(
                f"| {ov['gate']} | {ov['phase']} | {ov['justification']} |"
            )

    # Recommendations
    lines.append("")
    lines.append("## Recommendations")
    lines.append("")

    for rec in recommendations(always_pass, high_fail, overrides):
        lines.append(f"- {rec}")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Audit SDLC gate effectiveness")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--state", help="Path to .sdlc/state.yaml")
    source.add_argument("--repo", help="Project root; the state is read from .sdlc/state.yaml")
    parser.add_argument(
        "--compare", default=None,
        help="Path to another state.yaml — prints a second report for manual comparison",
    )
    parser.add_argument(
        "--json", action="store_true",
        help="print the audit as one JSON document instead of the text report",
    )
    args = parser.parse_args()
    if args.json and args.compare:
        parser.error("--compare cannot be combined with --json: a comparison is two reports, "
                     "not one document; run --json once per state file")

    state_path = Path(args.state) if args.state else Path(args.repo) / ".sdlc" / "state.yaml"
    if not state_path.exists():
        message = f"State file not found: {state_path}"
        if args.json:
            print(json.dumps({"error": message}, indent=2))
        else:
            print(f"Error: {message}")
        sys.exit(1)

    state = load_yaml(state_path)
    results = extract_gate_history(state)
    gate_stats = analyze_gates(results)
    if args.json:
        print(json.dumps(build_json(gate_stats, state), indent=2))
        return
    report = format_report(gate_stats, state)
    print(report)

    if args.compare:
        compare_path = Path(args.compare)
        if not compare_path.exists():
            print(f"\nError: Comparison state file not found: {compare_path}")
            sys.exit(1)
        compare_state = load_yaml(compare_path)
        compare_results = extract_gate_history(compare_state)
        compare_stats = analyze_gates(compare_results)
        print("\n" + "=" * 40)
        print(format_report(compare_stats, compare_state))


if __name__ == "__main__":
    main()
