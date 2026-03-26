"""Check exit criteria (gates) for a given SDLC phase."""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import yaml

PLUGIN_ROOT = Path(__file__).resolve().parent.parent


def load_yaml(path: Path) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def get_phase_registry() -> dict:
    return load_yaml(PLUGIN_ROOT / "phases" / "phase-registry.yaml")


def get_compliance_gates(profile: dict) -> list[dict]:
    """Load compliance gates for the profile's frameworks."""
    gates = []
    frameworks = profile.get("compliance", {}).get("frameworks", [])
    profile_id = profile["company"]["profile_id"]
    profile_dir = PLUGIN_ROOT / "profiles" / profile_id / "compliance"

    for fw in frameworks:
        gate_file = profile_dir / f"{fw}-gates.yaml"
        if gate_file.exists():
            data = load_yaml(gate_file)
            gates.extend(data.get("gates", []))
    return gates


def check_artifact_exists(artifacts_dir: Path, artifact: str) -> tuple[bool, str]:
    path = artifacts_dir / artifact
    if path.exists():
        if path.is_dir():
            children = list(path.iterdir())
            if children:
                return True, f"Directory '{artifact}' exists with {len(children)} item(s)"
            return False, f"Directory '{artifact}' exists but is empty"
        return True, f"File '{artifact}' exists"
    return False, f"Missing: '{artifact}'"


def check_artifact_not_empty(artifacts_dir: Path, artifact: str) -> tuple[bool, str]:
    path = artifacts_dir / artifact
    if not path.exists():
        return False, f"Missing: '{artifact}'"
    if path.is_dir():
        return bool(list(path.iterdir())), f"Directory '{artifact}' emptiness check"
    content = path.read_text(encoding="utf-8", errors="replace").strip()
    if not content:
        return False, f"File '{artifact}' is empty"
    return True, f"File '{artifact}' has content ({len(content)} chars)"


def check_artifact_complete(artifacts_dir: Path, artifact: str) -> tuple[bool, str]:
    """Check artifact exists, is non-empty, and has no placeholder content."""
    exists, msg = check_artifact_not_empty(artifacts_dir, artifact)
    if not exists:
        return False, msg

    path = artifacts_dir / artifact
    if path.is_dir():
        return True, msg

    content = path.read_text(encoding="utf-8", errors="replace")
    placeholders = ["TODO", "TBD", "${", "PLACEHOLDER", "[INSERT", "<!-- REQUIRED:"]
    found = [p for p in placeholders if p in content]
    if found:
        return False, f"File '{artifact}' contains placeholder content: {found}"
    return True, f"File '{artifact}' is complete"


def check_cross_references(artifacts_dir: Path) -> list[dict]:
    """Check that file references within artifacts resolve to existing files."""
    import re

    results = []
    if not artifacts_dir.exists():
        return results

    # Collect all artifact filenames in the sdlc directory tree
    sdlc_dir = artifacts_dir.parent
    existing_files = set()
    for fp in sdlc_dir.rglob("*"):
        if fp.is_file():
            existing_files.add(fp.name)
            existing_files.add(str(fp.relative_to(sdlc_dir)).replace("\\", "/"))

    # Scan each markdown artifact for file references
    for artifact_path in sorted(artifacts_dir.rglob("*.md")):
        content = artifact_path.read_text(encoding="utf-8", errors="replace")
        artifact_name = artifact_path.name

        # Find markdown-style references and backtick references to .md/.yaml/.json files
        refs = re.findall(
            r'(?:`([^`]+\.(?:md|yaml|json|html))`'
            r'|\[[^\]]*\]\(([^)]+\.(?:md|yaml|json|html))\))',
            content,
        )
        for groups in refs:
            ref = groups[0] or groups[1]
            # Strip leading paths like .sdlc/ or artifacts/
            ref_name = ref.split("/")[-1] if "/" in ref else ref
            if ref_name not in existing_files and ref not in existing_files:
                # Skip known external/template refs
                if ref.startswith("http") or "${" in ref or ref.startswith("<"):
                    continue
                results.append({
                    "gate": "cross-reference",
                    "passed": False,
                    "message": f"'{artifact_name}' references '{ref}' which was not found in .sdlc/",
                    "severity": "SHOULD",
                })

    return results


def compute_checksum(file_path: Path) -> str:
    """Compute SHA-256 hash of a file (first 16 hex chars)."""
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return f"sha256:{h.hexdigest()[:16]}"


def get_dirty_artifacts(
    phase_id: int, state: dict, artifacts_dir: Path
) -> dict[str, list[str]]:
    """Compare stored checksums to current files. Returns categorized lists."""
    stored = state.get("phases", {}).get(phase_id, {}).get("artifact_checksums", {})
    if not stored or not artifacts_dir.exists():
        return {"new": [], "modified": [], "unchanged": [], "deleted": []}

    current = {}
    for fp in sorted(artifacts_dir.rglob("*")):
        if fp.is_file():
            rel = str(fp.relative_to(artifacts_dir)).replace("\\", "/")
            current[rel] = compute_checksum(fp)

    stored_files = set(stored.keys())
    current_files = set(current.keys())
    common = stored_files & current_files

    return {
        "new": sorted(current_files - stored_files),
        "modified": sorted(f for f in common if stored[f] != current[f]),
        "unchanged": sorted(f for f in common if stored[f] == current[f]),
        "deleted": sorted(stored_files - current_files),
    }


def check_phase_gates(
    phase_id: int,
    state: dict,
    profile: dict,
    artifacts_base: Path,
) -> list[dict]:
    """Run all gate checks for a phase. Returns list of results."""
    registry = get_phase_registry()
    results = []

    # Find phase definition in registry
    phase_def = None
    for p in registry["phases"]:
        if p["id"] == phase_id:
            phase_def = p
            break

    if not phase_def:
        return [{"gate": "registry", "passed": False, "message": f"Phase {phase_id} not found in registry"}]

    artifacts_dir = artifacts_base / f"{phase_id:02d}-{phase_def['name']}"

    # Dirty tracking — identify changed artifacts for incremental validation
    dirty = get_dirty_artifacts(phase_id, state, artifacts_dir)
    unchanged_set = set(dirty["unchanged"])
    has_baseline = bool(
        state.get("phases", {}).get(phase_id, {}).get("artifact_checksums")
    )

    if has_baseline:
        n_new = len(dirty["new"])
        n_mod = len(dirty["modified"])
        n_unch = len(dirty["unchanged"])
        results.append({
            "gate": "dirty-tracking",
            "passed": True,
            "message": f"Artifacts: {n_new} new, {n_mod} modified, {n_unch} unchanged (skipping unchanged)",
            "severity": "INFO",
        })

    # Gate 1: Artifact Integrity — required artifacts exist
    for artifact in phase_def.get("artifacts", {}).get("required", []):
        passed, message = check_artifact_exists(artifacts_dir, artifact)
        results.append({
            "gate": "G1-integrity",
            "artifact": artifact,
            "passed": passed,
            "message": message,
            "severity": "MUST",
        })

    # Gate 2: Completeness — required artifacts are complete
    for artifact in phase_def.get("artifacts", {}).get("required", []):
        if has_baseline and artifact in unchanged_set:
            results.append({
                "gate": "G2-completeness",
                "artifact": artifact,
                "passed": True,
                "message": f"File '{artifact}' unchanged since last check (skipped)",
                "severity": "MUST",
            })
            continue
        passed, message = check_artifact_complete(artifacts_dir, artifact)
        results.append({
            "gate": "G2-completeness",
            "artifact": artifact,
            "passed": passed,
            "message": message,
            "severity": "MUST",
        })

    # Cross-artifact reference validation
    xref_results = check_cross_references(artifacts_dir)
    results.extend(xref_results)

    # Phase 4 optional: sections-progress.json consistency check
    if phase_id == 4:
        progress_path = artifacts_dir / "sections-progress.json"
        if progress_path.exists():
            try:
                with open(progress_path) as f:
                    progress = json.load(f)
                total = progress.get("total_sections", 0)
                completed = progress.get("completed_sections", 0)
                sections = progress.get("sections", [])
                actual_complete = sum(
                    1 for s in sections if s.get("status") == "complete"
                )
                if actual_complete != completed:
                    results.append({
                        "gate": "G2-completeness",
                        "artifact": "sections-progress.json",
                        "passed": False,
                        "message": f"sections-progress.json: completed_sections ({completed}) does not match actual complete count ({actual_complete})",
                        "severity": "SHOULD",
                    })
                else:
                    results.append({
                        "gate": "G2-completeness",
                        "artifact": "sections-progress.json",
                        "passed": True,
                        "message": f"sections-progress.json: {actual_complete}/{total} sections complete, counts consistent",
                        "severity": "SHOULD",
                    })
                incomplete = [
                    s.get("id", f"<index-{i}>")
                    for i, s in enumerate(sections)
                    if s.get("status") != "complete"
                ]
                if incomplete:
                    results.append({
                        "gate": "G2-completeness",
                        "artifact": "sections-progress.json",
                        "passed": False,
                        "message": f"sections-progress.json: {len(incomplete)} section(s) not complete: {incomplete[:5]}",
                        "severity": "SHOULD",
                    })
            except (json.JSONDecodeError, KeyError) as e:
                results.append({
                    "gate": "G2-completeness",
                    "artifact": "sections-progress.json",
                    "passed": False,
                    "message": f"sections-progress.json: parse error — {e}",
                    "severity": "SHOULD",
                })

    # Gate 3: Metrics — check profile quality thresholds (phases 5, 6)
    if phase_id in [5, 6]:
        quality = profile.get("quality", {})
        results.append({
            "gate": "G3-metrics",
            "check": "coverage_minimum",
            "passed": None,  # Requires external tool execution
            "message": f"Coverage must be >= {quality.get('coverage_minimum', 80)}% (requires test execution)",
            "severity": "MUST",
        })

    # Gate 4: Classification — compliance gates
    compliance_gates = get_compliance_gates(profile)
    phase_compliance = [g for g in compliance_gates if g["phase"] == phase_id]
    for gate in phase_compliance:
        if gate["check_type"] == "artifact_exists":
            passed, message = check_artifact_exists(artifacts_dir, gate["artifact"])
        elif gate["check_type"] == "artifact_content":
            passed, message = check_artifact_complete(artifacts_dir, gate.get("artifact", ""))
            # Additional content checks
            if passed and "required_content" in gate:
                path = artifacts_dir / gate["artifact"]
                if path.exists() and path.is_file():
                    content = path.read_text(encoding="utf-8", errors="replace").lower()
                    missing = [kw for kw in gate["required_content"] if kw.lower() not in content]
                    if missing:
                        passed = False
                        message = f"Missing required content in '{gate['artifact']}': {missing}"
        elif gate["check_type"] == "manual":
            passed = None
            message = f"Manual check required: {gate.get('description', gate['name'])}"
        elif gate["check_type"] == "metric":
            passed = None
            message = f"Metric check: {gate.get('metric', 'unknown')} (requires execution)"
        else:
            passed = None
            message = f"Unknown check type: {gate['check_type']}"

        results.append({
            "gate": f"G4-compliance-{gate['id']}",
            "name": gate["name"],
            "passed": passed,
            "message": message,
            "severity": gate.get("severity", "MUST"),
        })

    # Gate: Dependency order (Phase 4 only)
    if phase_id == 4:
        sdlc_dir_dep = artifacts_base.parent
        section_plans = sdlc_dir_dep / "artifacts" / "03-planning" / "section-plans"
        if section_plans.exists():
            try:
                sys.path.insert(0, str(Path(__file__).parent))
                from check_dependencies import (
                    parse_section_dependencies,
                    detect_cycles,
                    topological_sort,
                    check_implementation_order,
                )

                graph = parse_section_dependencies(section_plans)
                cycles = detect_cycles(graph)
                if cycles:
                    cycle_strs = [" → ".join(c) for c in cycles]
                    results.append({
                        "gate": "dependency-order",
                        "passed": False,
                        "message": f"Circular dependencies: {cycle_strs[0]}",
                        "severity": "MUST",
                    })
                else:
                    order = topological_sort(graph)
                    if order:
                        progress_path = artifacts_dir / "sections-progress.json"
                        violations = check_implementation_order(order, progress_path)
                        if violations:
                            results.append({
                                "gate": "dependency-order",
                                "passed": False,
                                "message": f"Order violations: {violations[:3]}",
                                "severity": "SHOULD",
                            })
                        else:
                            results.append({
                                "gate": "dependency-order",
                                "passed": True,
                                "message": f"Dependency order valid ({len(graph)} sections)",
                                "severity": "SHOULD",
                            })
            except ImportError:
                pass  # check_dependencies.py not available

    # Gate 5: Cross-phase consistency
    sdlc_dir = artifacts_base.parent
    consistency_results = check_cross_phase_consistency(phase_id, sdlc_dir)
    results.extend(consistency_results)

    return results


def check_cross_phase_consistency(
    phase_id: int,
    sdlc_dir: Path,
) -> list[dict]:
    """G5: Check locked metrics against frozen layers from prior phases."""
    results = []
    layers_dir = sdlc_dir / "context" / "layers"

    if not layers_dir.exists() or phase_id < 1:
        return results  # No prior phases to check

    # Collect frozen layer content for prior phases
    prior_layers = {}
    for layer_file in sorted(layers_dir.glob("phase*.md")):
        try:
            layer_phase = int(layer_file.stem.split("-")[0].replace("phase", ""))
        except (ValueError, IndexError):
            continue
        if layer_phase < phase_id:
            prior_layers[layer_phase] = layer_file.read_text(
                encoding="utf-8", errors="replace"
            )

    if not prior_layers:
        return results

    # Check for locked metrics or constraints in frozen layers
    locked_metrics_found = False
    for content in prior_layers.values():
        if "## Locked Metrics" in content or "## Constraints Carried Forward" in content:
            locked_metrics_found = True
            break

    if not locked_metrics_found:
        return results

    # Check for decision log in current phase
    registry = get_phase_registry()
    current_phase_def = None
    for p in registry["phases"]:
        if p["id"] == phase_id:
            current_phase_def = p
            break

    if not current_phase_def:
        return results

    current_artifacts_dir = sdlc_dir / "artifacts" / f"{phase_id:02d}-{current_phase_def['name']}"
    decision_log = current_artifacts_dir / "decision-log.md"

    results.append({
        "gate": "G5-consistency",
        "passed": None,  # Manual check — Claude should compare values
        "message": (
            f"Cross-phase consistency: {len(prior_layers)} frozen layer(s) "
            f"contain locked metrics. Verify current phase artifacts are "
            f"consistent with prior constraints. "
            f"Decision log {'exists' if decision_log.exists() else 'NOT FOUND — create one if any locked metrics changed'} "
            f"at {decision_log.relative_to(sdlc_dir)}"
        ),
        "severity": "SHOULD",
    })

    return results


def format_results(results: list[dict], phase_id: int) -> str:
    lines = [f"Gate Check Results — Phase {phase_id}", "=" * 40]
    passed = sum(1 for r in results if r["passed"] is True)
    failed = sum(1 for r in results if r["passed"] is False)
    manual = sum(1 for r in results if r["passed"] is None)
    total = len(results)

    for r in results:
        icon = "PASS" if r["passed"] is True else "FAIL" if r["passed"] is False else "MANUAL"
        sev = r.get("severity", "")
        lines.append(f"  [{icon}] [{sev}] {r['gate']}: {r['message']}")

    lines.append("")
    lines.append(f"Summary: {passed} passed, {failed} failed, {manual} manual — {total} total")

    if failed > 0:
        lines.append("BLOCKED — fix failures before advancing to next phase")
    elif manual > 0:
        lines.append("REVIEW — manual checks require human verification")
    else:
        lines.append("ALL GATES PASSED — ready to advance")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Check SDLC phase exit gates")
    parser.add_argument("--state", required=True, help="Path to .sdlc/state.yaml")
    parser.add_argument("--phase", type=int, default=None, help="Phase to check (default: current)")
    args = parser.parse_args()

    state_path = Path(args.state)
    if not state_path.exists():
        print(f"Error: State file not found: {state_path}")
        sys.exit(1)

    state = load_yaml(state_path)
    sdlc_dir = state_path.parent
    profile_path = sdlc_dir / "profile.yaml"

    if not profile_path.exists():
        print(f"Error: Profile not found: {profile_path}")
        sys.exit(1)

    profile = load_yaml(profile_path)
    phase_id = args.phase if args.phase is not None else state["current_phase"]
    artifacts_base = sdlc_dir / "artifacts"

    results = check_phase_gates(phase_id, state, profile, artifacts_base)
    output = format_results(results, phase_id)
    print(output)

    # Exit with error if any MUST gates failed
    must_failures = [r for r in results if r["passed"] is False and r.get("severity") == "MUST"]
    sys.exit(1 if must_failures else 0)


if __name__ == "__main__":
    main()
