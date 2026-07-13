"""Track the phase-spanning product decision-log (.sdlc/decision-log.md).

Product's decision-log captures cross-cutting decisions *before* specs exist — each with a named
owner and a 2-business-day clock — distinct from the per-spec Decision List (silent decisions
inside one spec). This tracker reads the markdown table, lists the OPEN decisions, and flags any
whose 2-business-day (weekend-aware) clock, counted from the `opened` date, has elapsed. It is
advisory: it ALWAYS exits 0. It mirrors track_specs.py — the log is the durable source of truth,
not a separate tracker that can drift.

The decision table columns are: id | decision | owner | opened | due | status
Dates are ISO (YYYY-MM-DD). A decision is OPEN unless its status is a closed word
(closed / resolved / decided / done / cancelled).

Standalone or Workflow:
  - Workflow:   --state .sdlc/state.yaml   (reads <state.parent>/decision-log.md)
  - Standalone: --repo <path>              (reads <repo>/.sdlc/decision-log.md, else <repo>/decision-log.md)
"""

import argparse
import json
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

DECISION_COLUMNS = ["id", "decision", "owner", "opened", "due", "status"]
CLOSED_STATUSES = {
    "closed", "resolved", "decided", "done", "complete", "completed", "cancelled", "canceled",
}
CLOCK_BUSINESS_DAYS = 2


# --- Business-day math (weekend-aware; Mon-Fri are business days) ---

def business_days_elapsed(start: date, end: date) -> int:
    """Count business days strictly after `start`, up to and including `end`. 0 if end <= start."""
    if end <= start:
        return 0
    count = 0
    d = start
    while d < end:
        d += timedelta(days=1)
        if d.weekday() < 5:  # Monday=0 .. Friday=4
            count += 1
    return count


def add_business_days(start: date, n: int) -> date:
    """The date `n` business days after `start` (skipping weekends)."""
    d = start
    added = 0
    while added < n:
        d += timedelta(days=1)
        if d.weekday() < 5:
            added += 1
    return d


def parse_iso_date(s: str) -> date | None:
    s = (s or "").strip()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


# --- Decision-log parsing ---

def _split_row(line: str) -> list[str]:
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.strip() for c in line.split("|")]


def _is_separator(cells: list[str]) -> bool:
    joined = "".join(cells)
    return bool(joined) and set(joined) <= set("-:| ")


def parse_decisions(path: Path) -> list[dict]:
    """Parse the decision table into row dicts keyed by DECISION_COLUMNS."""
    if not path.exists():
        return []

    table_rows: list[list[str]] = []
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line.startswith("|"):
            continue
        cells = _split_row(line)
        if _is_separator(cells):
            continue
        table_rows.append(cells)

    if not table_rows:
        return []

    # Locate a header row (has "id" and "status"/"decision"); parse rows after it.
    header: dict[str, int] | None = None
    start = 0
    for i, cells in enumerate(table_rows):
        lower = [c.lower() for c in cells]
        if "id" in lower and ("status" in lower or "decision" in lower):
            header = {name: lower.index(name) for name in DECISION_COLUMNS if name in lower}
            start = i + 1
            break

    decisions: list[dict] = []
    for cells in table_rows[start:]:
        def get(col: str, cells=cells) -> str:
            if header is not None and header.get(col) is not None and header[col] < len(cells):
                return cells[header[col]]
            pos = DECISION_COLUMNS.index(col)
            return cells[pos] if pos < len(cells) else ""

        row = {col: get(col) for col in DECISION_COLUMNS}
        if not any(row.values()):
            continue
        decisions.append(row)
    return decisions


def is_open(decision: dict) -> bool:
    return decision.get("status", "").strip().lower() not in CLOSED_STATUSES


def summarize(decisions: list[dict], today: date | None = None) -> dict:
    """Open decisions + overdue flags off the 2-business-day clock from `opened`."""
    today = today or date.today()
    open_decisions: list[dict] = []
    overdue: list[dict] = []

    for d in decisions:
        if not is_open(d):
            continue
        rec = dict(d)
        opened = parse_iso_date(d.get("opened", ""))
        if opened is None:
            rec["business_days_open"] = None
            rec["clock_due"] = None
            rec["overdue"] = False
            rec["opened_unparseable"] = True
        else:
            elapsed = business_days_elapsed(opened, today)
            rec["business_days_open"] = elapsed
            rec["clock_due"] = add_business_days(opened, CLOCK_BUSINESS_DAYS).isoformat()
            rec["overdue"] = elapsed > CLOCK_BUSINESS_DAYS
        open_decisions.append(rec)
        if rec["overdue"]:
            overdue.append(rec)

    return {
        "total": len(decisions),
        "open": len(open_decisions),
        "overdue": len(overdue),
        "clock_business_days": CLOCK_BUSINESS_DAYS,
        "open_decisions": open_decisions,
        "overdue_decisions": overdue,
    }


def resolve_log_path(args) -> Path:
    if args.state:
        state_path = Path(args.state)
        if not state_path.exists():
            print(f"Error: State file not found: {state_path}")
            sys.exit(1)
        return state_path.resolve().parent / "decision-log.md"
    repo = Path(args.repo).resolve()
    in_sdlc = repo / ".sdlc" / "decision-log.md"
    return in_sdlc if in_sdlc.exists() else repo / "decision-log.md"


def format_report(summary: dict, log_path: Path) -> str:
    lines = ["Decision Log", "=" * 44]
    if not log_path.exists():
        lines.append(f"No decision-log found at {log_path}.")
        lines.append("(advisory — nothing to track yet)")
        return "\n".join(lines)

    lines.append(f"Total decisions: {summary['total']}")
    lines.append(f"Open: {summary['open']}   Overdue (> {summary['clock_business_days']} business days): {summary['overdue']}")

    if summary["open_decisions"]:
        lines.append("")
        lines.append(f"Open decisions ({summary['clock_business_days']}-business-day clock from 'opened'):")
        for d in summary["open_decisions"]:
            flag = "  OVERDUE" if d.get("overdue") else ""
            bdo = d.get("business_days_open")
            age = "opened date unparseable" if bdo is None else f"{bdo} business day(s) open"
            owner = d.get("owner") or "(no owner)"
            due = d.get("clock_due") or d.get("due") or "?"
            lines.append(f"  {d.get('id') or '?'}  [{owner}]  opened {d.get('opened') or '?'}  "
                         f"due {due}  — {age}{flag}")
            if d.get("decision"):
                lines.append(f"       {d['decision']}")
    else:
        lines.append("")
        lines.append("No open decisions.")

    if summary["overdue_decisions"]:
        lines.append("")
        lines.append("WARNING: overdue decisions need an owner's call:")
        for d in summary["overdue_decisions"]:
            lines.append(f"  {d.get('id') or '?'} — {d.get('owner') or '(no owner)'} "
                         f"(open {d.get('business_days_open')} business days)")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Track the phase-spanning product decision-log (advisory)")
    src = parser.add_mutually_exclusive_group()
    src.add_argument("--state", help="Path to .sdlc/state.yaml (workflow mode)")
    src.add_argument("--repo", default=".", help="Target repo root (standalone mode; default: cwd)")
    parser.add_argument("--json", action="store_true", help="Emit the summary as JSON")
    args = parser.parse_args()

    log_path = resolve_log_path(args)
    decisions = parse_decisions(log_path)
    summary = summarize(decisions)

    if args.json:
        print(json.dumps({**summary, "log_path": str(log_path), "exists": log_path.exists()}, indent=2))
    else:
        print(format_report(summary, log_path))

    # Advisory tracker — always exit 0.
    sys.exit(0)


if __name__ == "__main__":
    main()
