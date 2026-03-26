"""Analyze gate effectiveness across completed SDLC phases."""

import argparse
import sys
from collections import defaultdict
from pathlib import Path

import yaml


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

    completed = sum(
        1 for p in state.get("phases", {}).values()
        if isinstance(p, dict) and p.get("status") == "completed"
    )
    lines.append(f"Completed phases: {completed}")

    if completed < 3:
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

    sorted_gates = sorted(gate_stats.items(), key=lambda x: x[1]["total"], reverse=True)
    for gate, stats in sorted_gates:
        total = stats["total"]
        fail_rate = f"{(stats['failed'] / total * 100):.0f}%" if total > 0 else "—"
        lines.append(
            f"| {gate} | {total} | {stats['passed']} | "
            f"{stats['failed']} | {stats['manual']} | {fail_rate} |"
        )

    # Always-pass gates
    always_pass = [
        (g, s) for g, s in sorted_gates
        if s["failed"] == 0 and s["total"] > 0 and s["manual"] == 0
    ]
    if always_pass:
        lines.append("")
        lines.append("## Always-Pass Gates (candidates for tightening or removal)")
        lines.append("")
        for gate, stats in always_pass:
            phases = ", ".join(sorted(stats["phases_seen"]))
            lines.append(f"  - {gate}: passed {stats['total']}x across phases [{phases}]")

    # High-fail gates
    high_fail = [
        (g, s) for g, s in sorted_gates
        if s["total"] > 0 and (s["failed"] / s["total"]) > 0.5
    ]
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
    all_overrides = []
    for gate, stats in sorted_gates:
        for ov in stats["overrides"]:
            all_overrides.append({"gate": gate, **ov})

    if all_overrides:
        lines.append("")
        lines.append("## Override History")
        lines.append("")
        lines.append("| Gate | Phase | Justification |")
        lines.append("|------|-------|---------------|")
        for ov in all_overrides:
            lines.append(
                f"| {ov['gate']} | {ov['phase']} | {ov['justification']} |"
            )

    # Recommendations
    lines.append("")
    lines.append("## Recommendations")
    lines.append("")

    if always_pass:
        lines.append(
            f"- {len(always_pass)} gate(s) never failed. "
            "Consider whether they add value or can be tightened."
        )
    if high_fail:
        lines.append(
            f"- {len(high_fail)} gate(s) fail more than half the time. "
            "Review whether thresholds are realistic or the process needs adjustment."
        )
    if all_overrides:
        lines.append(
            f"- {len(all_overrides)} override(s) recorded. "
            "Review whether overridden gates should be relaxed or better enforced."
        )
    if not always_pass and not high_fail and not all_overrides:
        lines.append("- No immediate concerns. Gate configuration appears well-calibrated.")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Audit SDLC gate effectiveness")
    parser.add_argument("--state", required=True, help="Path to .sdlc/state.yaml")
    parser.add_argument(
        "--compare", default=None,
        help="Path to another state.yaml — prints a second report for manual comparison",
    )
    args = parser.parse_args()

    state_path = Path(args.state)
    if not state_path.exists():
        print(f"Error: State file not found: {state_path}")
        sys.exit(1)

    state = load_yaml(state_path)
    results = extract_gate_history(state)
    gate_stats = analyze_gates(results)
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
