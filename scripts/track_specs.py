"""Track the Build-loop spec backlog from the specs themselves.

In the delivery-standard Build loop, the spec IS the unit of work (one spec = one branch =
one PR) and the durable source of truth. So backlog progress is derived from the spec files'
frontmatter `status` — never from a separate hand-maintained tracker that can drift from reality.
This replaces the section-plan progress model (`sections-progress.json`) in the Build loop.

Statuses (spec template frontmatter): draft -> ready -> in-flight -> merged.

Sprint layer (additive, optional): a spec may carry `sprint: "SNN"` (written by `sprint.py slate`,
never by hand) and `next_owner`. Both are passed through by `scan_specs` (default ""), `summarize`
adds a `by_sprint` bucket map, and `--sprint SNN` narrows the report to one sprint's slate. The
"By sprint" text block renders only when at least one spec carries a sprint, so the legacy output
is byte-identical for backlogs that never used sprints.

Files whose frontmatter `spec:` id is not numeric (the installed `specs/spec-template.md` carries
`spec: "NNNN"`) are not specs and are skipped, so the template is never counted as a phantom draft.

Standalone or Workflow:
  - Standalone: --repo <path>
  - Workflow:   --state .sdlc/state.yaml   (repo root = the directory containing .sdlc/)
"""

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import risk_model as rm
from check_spec import parse_frontmatter

STATUS_ORDER = ["draft", "ready", "in-flight", "merged"]

# by_sprint buckets for specs with no sprint value. Disjoint: a merged spec that never had a sprint
# was delivered before the sprint layer existed ("pre-sprint"); any other sprint-less spec is
# backlog still to be slated ("unassigned"). Together with the SNN buckets they partition the specs.
UNASSIGNED_BUCKET = "unassigned"
PRE_SPRINT_BUCKET = "pre-sprint"

_SPRINT_NUM_RE = re.compile(r"^S(\d+)$")


def is_spec_id(value) -> bool:
    """True for a real spec id (all digits, e.g. "0007"). The template's "NNNN" is not one."""
    return value is not None and str(value).strip().isdigit()


def scan_specs(specs_dir: Path) -> list[dict]:
    """Parse every specs/*.md into {id, name, status, risk, channel, sprint, next_owner, path},
    ordered by id. Files with a non-numeric frontmatter `spec:` id (the installed template) are
    skipped; files with no `spec:` key at all keep the legacy "????" placeholder id."""
    specs = []
    if not specs_dir.exists():
        return specs
    for f in sorted(specs_dir.glob("*.md")):
        fm, _ = parse_frontmatter(f.read_text(encoding="utf-8", errors="replace"))
        if not fm:
            continue
        raw_id = fm.get("spec")
        if raw_id is not None and str(raw_id).strip() and not is_spec_id(raw_id):
            continue  # e.g. specs/spec-template.md with spec: "NNNN" — a template, not a spec
        channel = fm.get("channel") or "unassigned"
        if channel == "—":
            channel = "channel-agnostic"
        specs.append({
            "id": fm.get("spec", "????"),
            "name": fm.get("name", f.stem),
            "status": (fm.get("status") or "draft").strip().lower(),
            "risk": rm.normalize_tier(fm.get("risk")) or "?",
            "channel": channel,
            "sprint": (fm.get("sprint") or "").strip(),
            "next_owner": (fm.get("next_owner") or "").strip(),
            "path": str(f),
        })
    return specs


def sprint_bucket(spec: dict) -> str:
    """The by_sprint bucket a spec falls in: its SNN, else pre-sprint (merged) or unassigned."""
    sprint = (spec.get("sprint") or "").strip()
    if sprint:
        return sprint
    if spec.get("status") == "merged":
        return PRE_SPRINT_BUCKET
    return UNASSIGNED_BUCKET


def filter_by_sprint(specs: list[dict], sprint_id: str) -> list[dict]:
    """Only the specs slated into `sprint_id` (exact match on the frontmatter value)."""
    return [s for s in specs if (s.get("sprint") or "").strip() == sprint_id]


def sprint_ids(summary_or_by_sprint: dict) -> list[str]:
    """The SNN keys of a by_sprint map (or a summary carrying one), in sprint-number order."""
    by_sprint = summary_or_by_sprint.get("by_sprint", summary_or_by_sprint)
    ids = [k for k in by_sprint if k not in (UNASSIGNED_BUCKET, PRE_SPRINT_BUCKET)]
    return sorted(ids, key=_sprint_sort_key)


def _sprint_sort_key(sprint_id: str):
    m = _SPRINT_NUM_RE.match(sprint_id)
    return (0, int(m.group(1)), sprint_id) if m else (1, 0, sprint_id)


def summarize(specs: list[dict]) -> dict:
    """Backlog summary: totals, status breakdown, risk breakdown, channel and sprint buckets, the
    in-flight list."""
    by_status = {s: 0 for s in STATUS_ORDER}
    by_risk = {t: 0 for t in rm.RISK_TIERS}
    by_channel: dict[str, int] = {}
    by_sprint: dict[str, int] = {}
    in_flight = []
    for spec in specs:
        by_status[spec["status"]] = by_status.get(spec["status"], 0) + 1
        if spec["risk"] in by_risk:
            by_risk[spec["risk"]] += 1
        by_channel[spec["channel"]] = by_channel.get(spec["channel"], 0) + 1
        bucket = sprint_bucket(spec)
        by_sprint[bucket] = by_sprint.get(bucket, 0) + 1
        if spec["status"] == "in-flight":
            in_flight.append(spec)
    return {
        "total": len(specs),
        "by_status": by_status,
        "by_risk": by_risk,
        "by_channel": by_channel,
        "by_sprint": by_sprint,
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


def format_report(summary: dict, warnings: list[str], sprint_filter: str | None = None) -> str:
    title = "Spec Backlog" if not sprint_filter else f"Spec Backlog — sprint {sprint_filter}"
    lines = [title, "=" * 40, f"Total specs: {summary['total']}"]
    lines.append("")
    lines.append("By status:")
    for s in STATUS_ORDER:
        lines.append(f"  {s:<10} {summary['by_status'].get(s, 0)}")
    lines.append("")
    lines.append("By risk tier:")
    for t in rm.RISK_TIERS:
        lines.append(f"  {t:<8} {summary['by_risk'].get(t, 0)}")
    lines.append("")
    lines.append("By channel:")
    for c in sorted(summary["by_channel"]):
        lines.append(f"  {c:<16} {summary['by_channel'][c]}")
    by_sprint = summary.get("by_sprint") or {}
    sprints = sprint_ids(by_sprint)
    if sprints:  # only when at least one spec carries a sprint — legacy output stays byte-identical
        lines.append("")
        lines.append("By sprint:")
        for bucket in sprints + [b for b in (UNASSIGNED_BUCKET, PRE_SPRINT_BUCKET) if b in by_sprint]:
            lines.append(f"  {bucket:<12} {by_sprint[bucket]}")
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
    parser.add_argument("--sprint", default=None, metavar="SNN",
                        help="Only the specs slated into this sprint (frontmatter sprint: SNN)")
    parser.add_argument("--json", action="store_true", help="Emit the summary as JSON")
    args = parser.parse_args()

    specs_dir = resolve_specs_dir(args)
    specs = scan_specs(specs_dir)
    if args.sprint:
        specs = filter_by_sprint(specs, args.sprint)
    summary = summarize(specs)
    warnings = wip_warnings(summary, args.wip_cap)

    if args.json:
        print(json.dumps({**summary, "sprint_filter": args.sprint, "warnings": warnings}, indent=2))
    else:
        print(format_report(summary, warnings, args.sprint))

    sys.exit(1 if warnings else 0)


if __name__ == "__main__":
    main()
