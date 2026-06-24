"""Draft the final handoff report from the engagement's own records.

Phase C (Close & Transfer), Step 4: "Hand over the record." The standard says to draft the
final handoff report from the engagement's records, not from memory. This script is the
deterministic first pass — it assembles every mechanical section from real data and leaves the
genuinely narrative judgments (outcomes against the Phase 0 statement, "who they call now") as
clearly-marked slots for the human/agent to fill. It writes the existing
`final-handoff-report.md` template structure; it does not invent a new one.

What it fills from records:
  - Phase report index  — every phase's gate report, present or missing      (phase_model + reports/)
  - Engagement record   — per-phase gate status, completed date, approver    (state.yaml phases[])
  - Metrics history     — accepted-as-is, review wait, DORA four, escaped     (scorecard.py)
  - Spec backlog        — merged / total, by risk tier                        (track_specs.py)

What it leaves as slots (judgment, not data): outcomes vs the Phase 0 statement, the debt log
narrative, the open-items table, the dashboard handover. Honest by design: missing data reads
"no data" / "not recorded", never a fabricated zero.

Standalone or Workflow:
  - Workflow:   generate_handoff_report.py --state .sdlc/state.yaml
  - Standalone: generate_handoff_report.py --repo <path>   (degrades: no history, notes it in header)
Refuses to overwrite a human-edited report without --force.
"""

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
import phase_model as pm
import scorecard
import track_specs


def load_state(state_path: Path) -> dict:
    with open(state_path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _fmt_ts(raw) -> str:
    """A timestamp as a plain YYYY-MM-DD, or the raw string, or '—'."""
    if not raw:
        return "—"
    s = str(raw)
    return s[:10] if len(s) >= 10 and s[4] == "-" else s


def engagement_window(state: dict) -> tuple[str, str]:
    """(start, end) for the report header, from created_at and the latest recorded timestamp."""
    start = state.get("created_at")
    stamps = [start] if start else []
    for entry in state.get("history", []):
        stamps.append(entry.get("at") or entry.get("timestamp") or entry.get("date"))
    for ph in state.get("phases", {}).values():
        if isinstance(ph, dict):
            stamps.extend([ph.get("entered_at"), ph.get("completed_at")])
    stamps = [s for s in stamps if s]
    end = max(stamps) if stamps else None
    return _fmt_ts(start), _fmt_ts(end)


# ── Section builders (each returns a markdown block) ────────────────────────────

def phase_report_index(reports_dir: Path) -> str:
    """A row per phase linking its gate report, marked present/missing."""
    rows = ["| Phase | Gate report | Status |", "|-------|-------------|--------|"]
    for p in pm.all_phases():
        slug = p["slug"]
        display = p.get("display", slug)
        fname = f"{slug}-report.html"
        present = (reports_dir / fname).exists()
        link = f"[{fname}](reports/{fname})" if present else f"`{fname}`"
        mark = "delivered" if present else "**missing**"
        rows.append(f"| {display} | {link} | {mark} |")
    return "\n".join(rows)


def engagement_record(state: dict) -> str:
    """Per-phase gate status, completion date, and named approver from state.yaml."""
    phases = state.get("phases", {})
    if not phases:
        return "_No phase state recorded (standalone run — no `.sdlc/state.yaml`)._"
    rows = ["| Phase | Gate | Completed | Signed off by |",
            "|-------|------|-----------|---------------|"]
    for p in pm.all_phases():
        pid = p["id"] if isinstance(p["id"], str) else str(p["id"])
        ph = phases.get(pid) or phases.get(p.get("slug")) or {}
        status = ph.get("status", "pending")
        gate = "passed" if status == "completed" else status
        completed = _fmt_ts(ph.get("completed_at"))
        gr = ph.get("gate_results") or {}
        approver = gr.get("approved_by") or gr.get("signed_off_by") or gr.get("approver") or "—"
        rows.append(f"| {p.get('display', pid)} | {gate} | {completed} | {approver} |")
    return "\n".join(rows)


def metrics_history(metrics_dir: Path) -> str:
    """The steering numbers, sourced from scorecard's own computation (no fabricated zeros)."""
    sc = scorecard.compute_scorecard(scorecard.load_events(metrics_dir / "loop-events.jsonl"))
    d = sc["dora"]
    lines = [
        "| Metric | Value |",
        "|--------|-------|",
        f"| Accepted-as-is rate | {scorecard._pct(sc['accepted_as_is_rate'])} |",
        f"| Rework / revert rate | {scorecard._pct(sc['rework_revert_rate'])} |",
        f"| Bounce-back (unclear) | {scorecard._pct(sc['bounce_back_rate'])} |",
        f"| Review wait (median) | {scorecard._hrs(sc['review_wait_median_hours'])} |",
        f"| Security-review wait (median) | {scorecard._hrs(sc['security_review_wait_median_hours'])} |",
        f"| Deploys | {d['deploy_count']} |",
        f"| Lead time (median) | {scorecard._hrs(d['lead_time_median_hours'])} |",
        f"| Change-fail rate | {scorecard._pct(d['change_fail_rate'])} |",
        f"| Time-to-recover (median) | {scorecard._hrs(d['time_to_recover_median_hours'])} |",
        f"| Escaped bugs | {len(sc['escaped_bugs'])} |",
    ]
    lines.append("")
    lines.append("_Outcomes only — no activity metrics (velocity, story points, PR count, LOC)._")
    return "\n".join(lines)


def spec_backlog(specs_dir: Path) -> str:
    """Merged / total and the risk-tier split, from the specs themselves."""
    summary = track_specs.summarize(track_specs.scan_specs(specs_dir))
    if summary["total"] == 0:
        return "_No specs found._"
    merged = summary["by_status"].get("merged", 0)
    by_risk = ", ".join(f"{t} {n}" for t, n in summary["by_risk"].items() if n)
    return (f"- **Specs merged:** {merged} of {summary['total']}\n"
            f"- **By risk tier:** {by_risk or '—'}")


# ── Report assembly ─────────────────────────────────────────────────────────────

SLOT = "> _[Fill: {what}]_"


def build_report(
    project_name: str,
    window: tuple[str, str],
    sources_present: bool,
    phase_index: str,
    record: str,
    metrics: str,
    backlog: str,
    generated_at: str,
) -> str:
    start, end = window
    context_note = (
        ""
        if sources_present
        else "\n> **Standalone draft** — generated without `.sdlc/` engagement context. "
        "The engagement record, metrics, and phase history below are partial or absent; "
        "fill them from the engagement's records before delivery.\n"
    )
    return f"""# Final Handoff Report
<!-- Phase C — Close & Transfer | Required artifact -->
<!-- Drafted by generate_handoff_report.py on {generated_at}. Mechanical sections are filled from
     the engagement's records; slots marked "[Fill: ...]" need human/agent judgment. -->

> The engagement's closing record. Assembled from the gate reports of every phase. The client keeps
> this.
{context_note}
**Project:** {project_name}    **Engagement window:** {start} – {end}

## Outcomes (against the Phase 0 statement)
{SLOT.format(what="each Phase 0 outcome (business / software / capability) → its result with caveats, read from problem-statement.md and success-criteria.md")}
- Business outcome: [stated] → [result, with caveats]
- Software outcome: [stated] → [result]
- Capability outcome: [stated] → [result — see close-gate-evidence.md]
- **The success metric:** [baseline] → [first production read, caveats stated]

## Phase report index
{phase_index}

## Engagement record
Every phase gate and its named sign-off, in one place.

{record}

## Metrics history
{metrics}

## Spec backlog
{backlog}

## Technical debt log
{SLOT.format(what="the debt log handed to the client with owners and dates — see project-retrospective.md")}

## Open items at close
{SLOT.format(what="every open item with a client owner and a due date")}

| Item | Owner (client) | Due |
|------|----------------|-----|

## Outcomes dashboard
{SLOT.format(what="handed over (yes/no) and the quarter-read date on the client's calendar — see outcomes-dashboard-handover.md")}
- Handed over and re-pointed to the client: [yes/no]
- Quarter-read date on the client's calendar: [date]

## Who they call now
{SLOT.format(what="the client's own team, and what a future engagement would look like (a new Phase 0)")}
"""


# ── Path resolution (dual-mode, mirrors scorecard.py / track_specs.py) ──────────

def resolve_paths(args):
    """Returns (repo_root, state_or_None). Workflow: --state. Standalone: --repo."""
    if args.state:
        state_path = Path(args.state)
        if not state_path.exists():
            print(f"Error: state file not found: {state_path}", file=sys.stderr)
            sys.exit(1)
        return state_path.resolve().parent.parent, load_state(state_path)
    return Path(args.repo).resolve(), None


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Draft the Phase C final handoff report from the engagement's records"
    )
    src = parser.add_mutually_exclusive_group()
    src.add_argument("--state", help="Path to .sdlc/state.yaml (workflow mode)")
    src.add_argument("--repo", default=".", help="Repo root containing .sdlc/ (standalone; default cwd)")
    parser.add_argument("--output", type=Path, help="Output path (default: .sdlc/artifacts/close/final-handoff-report.md)")
    parser.add_argument("--force", action="store_true", help="Overwrite an existing report")
    args = parser.parse_args()

    repo_root, state = resolve_paths(args)
    sdlc = repo_root / ".sdlc"
    reports_dir = sdlc / "reports"
    metrics_dir = sdlc / "metrics"
    specs_dir = repo_root / "specs"

    state = state or {}
    sources_present = bool(state)
    project_name = state.get("project_name") or repo_root.name
    window = engagement_window(state)
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    report = build_report(
        project_name=project_name,
        window=window,
        sources_present=sources_present,
        phase_index=phase_report_index(reports_dir),
        record=engagement_record(state),
        metrics=metrics_history(metrics_dir),
        backlog=spec_backlog(specs_dir),
        generated_at=generated_at,
    )

    output = args.output or (sdlc / "artifacts" / "close" / "final-handoff-report.md")
    if output.exists() and not args.force:
        print(f"Refusing to overwrite existing report: {output}\n"
              f"Re-run with --force to regenerate, or pass --output to write elsewhere.", file=sys.stderr)
        return 1

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(report, encoding="utf-8")
    print(f"Drafted final handoff report -> {output}")
    if not sources_present:
        print("  (standalone draft — no .sdlc/state.yaml; engagement context noted in the report header)")
    print("  Mechanical sections filled from records; fill the [Fill: ...] slots before delivery.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
