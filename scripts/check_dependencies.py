"""Validate the section dependency graph for a /deep-plan design (Phase 2 design aid).

Scope note: this is a PHASE-2 DESIGN tool. In the delivery-standard model the Build loop is
spec-driven (one spec = one branch = one PR; progress tracked by scripts/track_specs.py from the
specs themselves), so section-plan dependency ordering is NOT enforced in the Build loop. This
script validates the SECTION-NNN DAG that /deep-plan produces during design: it detects cycles
and computes a valid topological order. It no longer reads Build-loop progress.
"""

import argparse
import re
import sys
from pathlib import Path

import yaml

PLUGIN_ROOT = Path(__file__).resolve().parent.parent


def load_yaml(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def parse_section_dependencies(section_plans_dir: Path) -> dict[str, list[str]]:
    """Parse Dependencies field from each SECTION-NNN.md file.

    Returns: { "SECTION-001": ["SECTION-002", ...], ... }
    """
    deps = {}
    if not section_plans_dir.exists():
        return deps

    for plan_file in sorted(section_plans_dir.glob("SECTION-*.md")):
        section_id = plan_file.stem  # e.g., "SECTION-001"
        content = plan_file.read_text(encoding="utf-8", errors="replace")

        # Find Dependencies section — look for "## Dependencies" or "Dependencies:"
        dep_match = re.search(
            r"(?:^##\s*Dependencies|^Dependencies:)\s*\n(.*?)(?=\n##|\n[A-Z]|\Z)",
            content,
            re.MULTILINE | re.DOTALL,
        )

        section_deps = []
        if dep_match:
            dep_text = dep_match.group(1)
            # Extract SECTION-NNN references
            section_refs = re.findall(r"SECTION-\d+", dep_text)
            section_deps = sorted(set(section_refs))

        deps[section_id] = section_deps

    return deps


def detect_cycles(graph: dict[str, list[str]]) -> list[list[str]]:
    """Detect circular dependencies using DFS. Returns list of cycles."""
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {node: WHITE for node in graph}
    cycles = []
    path = []

    def dfs(node: str) -> None:
        color[node] = GRAY
        path.append(node)
        for neighbor in graph.get(node, []):
            if neighbor not in color:
                continue  # Unknown node, skip
            if color[neighbor] == GRAY:
                # Found cycle
                cycle_start = path.index(neighbor)
                cycles.append(path[cycle_start:] + [neighbor])
            elif color[neighbor] == WHITE:
                dfs(neighbor)
        path.pop()
        color[node] = BLACK

    for node in graph:
        if color[node] == WHITE:
            dfs(node)

    return cycles


def topological_sort(graph: dict[str, list[str]]) -> list[str] | None:
    """Kahn's algorithm. Returns sorted order or None if cycle exists."""
    # Build reverse graph: dep → [nodes that depend on dep]
    # And in-degree: how many dependencies each node has
    reverse_graph: dict[str, list[str]] = {node: [] for node in graph}
    in_deg = {node: 0 for node in graph}
    for node, deps in graph.items():
        for dep in deps:
            if dep in reverse_graph:
                reverse_graph[dep].append(node)
                in_deg[node] += 1

    queue = sorted(node for node, deg in in_deg.items() if deg == 0)
    result = []

    while queue:
        node = queue.pop(0)
        result.append(node)
        for neighbor in sorted(reverse_graph.get(node, [])):
            in_deg[neighbor] -= 1
            if in_deg[neighbor] == 0:
                queue.append(neighbor)

    if len(result) != len(graph):
        return None  # Cycle detected
    return result


def check(state_path: Path) -> int:
    """Validate dependency graph. Returns 0=valid, 1=violations, 2=error."""
    if not state_path.exists():
        print(f"Error: State file not found: {state_path}", file=sys.stderr)
        return 2

    state = load_yaml(state_path)
    sdlc_dir = state_path.parent

    # Find section plans (produced in Foundation)
    section_plans_dir = sdlc_dir / "artifacts" / "03-foundation" / "section-plans"
    if not section_plans_dir.exists():
        print("No section plans found at .sdlc/artifacts/03-foundation/section-plans/")
        print("Dependency check skipped — run after Phase 3 (Foundation) completes.")
        return 0

    # Parse dependencies
    graph = parse_section_dependencies(section_plans_dir)
    if not graph:
        print("No SECTION-*.md files found in section-plans/")
        return 0

    print(f"Dependency Graph — {len(graph)} sections")
    print("=" * 50)

    # Show graph
    for section, deps in sorted(graph.items()):
        dep_str = ", ".join(deps) if deps else "(no dependencies)"
        print(f"  {section} → {dep_str}")

    # Detect cycles
    cycles = detect_cycles(graph)
    if cycles:
        print(f"\n  [FAIL] Circular dependencies detected:")
        for cycle in cycles:
            print(f"    {' → '.join(cycle)}")
        return 1

    # Compute valid order
    order = topological_sort(graph)
    if order is None:
        print("\n  [FAIL] Could not compute valid order (cycle exists)")
        return 1

    print(f"\n  Valid section order (design-time guidance for /deep-plan):")
    for i, section in enumerate(order, 1):
        print(f"    {i}. {section}")

    print(f"\n  [OK] No circular dependencies; a valid order exists")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate section dependency graph and implementation order"
    )
    parser.add_argument("--state", required=True, help="Path to .sdlc/state.yaml")
    args = parser.parse_args()

    sys.exit(check(Path(args.state)))


if __name__ == "__main__":
    main()
