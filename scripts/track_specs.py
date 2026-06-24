"""Track the Build-loop spec backlog from the specs themselves.

In the delivery-standard Build loop, the spec IS the unit of work (one spec = one branch =
one PR) and the durable source of truth. So backlog progress is derived from the spec files'
frontmatter `status` — never from a separate hand-maintained tracker that can drift from reality.
This replaces the section-plan progress model (`sections-progress.json`) in the Build loop.

Statuses (spec template frontmatter): draft -> ready -> in-flight -> merged.

Standalone or Workflow:
  - Standalone: --repo <path>
  - Workflow:   --state .sdlc/state.yaml   (repo root = the directory containing .sdlc/)
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import risk_model as rm
from check_spec import parse_frontmatter

STATUS_ORDER = ["draft", "ready", "in-flight", "merged"]


def scan_specs(specs_dir: Path) -> list[dict]:
    """Parse every specs/*.md into {id, name, status, risk, path}, ordered by id."""
    specs = []
    if not specs_dir.exists():
        return specs
    for f in sorted(specs_dir.glob("*.md")):
        fm, _ = parse_frontmatter(f.read_text(encoding="utf-8", errors="replace"))
        if not fm:
            continue
        specs.append({
            "id": fm.get("spec", "????"),
            "name": fm.get("name", f.stem),
            "status": (fm.get("status") or "draft").strip().lower(),
            "risk": rm.normalize_tier(fm.get("risk")) or "?",
            "path": str(f),
        })
    return specs


def summarize(specs: list[dict]) -> dict:
    """Backlog summary: totals, status breakdown, risk breakdown, the in-flight list."""
    by_status = {s: 0 for s in STATUS_ORDER}
    by_risk = {t: 0 for t in rm.RISK_TIERS}
    in_flight = []
    for spec in specs:
        by_status[spec["status"]] = by_status.get(spec["status"], 0) + 1
        if spec["risk"] in by_risk:
            by_risk[spec["risk"]] += 1
        if spec["status"] == "in-flight":
            in_flight.append(spec)
    return {
        "total": len(specs),
        "by_status": by_status,
        "by_risk": by_risk,
        "in_flight": in_flight,
    }


def wip_warnings(summary: dict, wip_cap: int | None) -> list[str]:
    """Flag WIP-cap breaches. The cap itself lives in cadence-plan.md; this enforces it."""
    warnings = []
    n = len(summary["in_flight"])
    if wip_cap is not None and n > wip_cap:
        warnings.append(f"WIP cap breached: {n} specs in-flight, cap is {wip_cap}. "
                        f"Finish in-flight work before starting new specs.")
    return warnings


def resolve_specs_dir(args) -> Path:
    if args.state:
        state_path = Path(args.state)
        if not state_path.exists():
            print(f"Error: State file not found: {state_path}")
            sys.exit(1)
        return state_path.resolve().parent.parent / "specs"
    return Path(args.repo).resolve() / "specs"


def format_report(summary: dict, warnings: list[str]) -> str:
    lines = ["Spec Backlog", "=" * 40, f"Total specs: {summary['total']}"]
    lines.append("")
    lines.append("By status:")
    for s in STATUS_ORDER:
        lines.append(f"  {s:<10} {summary['by_status'].get(s, 0)}")
    lines.append("")
    lines.append("By risk tier:")
    for t in rm.RISK_TIERS:
        lines.append(f"  {t:<8} {summary['by_risk'].get(t, 0)}")
    if summary["in_flight"]:
        lines.append("")
        lines.append("In flight (one spec = one branch = one PR):")
        for spec in summary["in_flight"]:
            lines.append(f"  {spec['id']} {spec['name']} [{spec['risk']}]")
    if warnings:
        lines.append("")
        for w in warnings:
            lines.append(f"  WARNING: {w}")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Track the Build-loop spec backlog from spec frontmatter")
    src = parser.add_mutually_exclusive_group()
    src.add_argument("--state", help="Path to .sdlc/state.yaml (workflow mode)")
    src.add_argument("--repo", default=".", help="Target repo root (standalone mode; default: cwd)")
    parser.add_argument("--wip-cap", type=int, default=None, help="Flag when more than N specs are in-flight")
    parser.add_argument("--json", action="store_true", help="Emit the summary as JSON")
    args = parser.parse_args()

    specs_dir = resolve_specs_dir(args)
    specs = scan_specs(specs_dir)
    summary = summarize(specs)
    warnings = wip_warnings(summary, args.wip_cap)

    if args.json:
        print(json.dumps({**summary, "warnings": warnings}, indent=2))
    else:
        print(format_report(summary, warnings))

    sys.exit(1 if warnings else 0)


if __name__ == "__main__":
    main()
