"""The steering scorecard — the numbers that steer the Build loop, baseline-and-trend.

The delivery-standard steers on OUTCOMES, not activity. This tool records loop outcome events
to `.sdlc/metrics/loop-events.jsonl` and reports the scorecard from them. It is deliberately
separate from `gate-log.jsonl` (gate-calibration data) and `spec-log.jsonl` (DoR data): those
measure the harness; this measures delivery.

The metrics (build-loop.md §8 / the-rails.md §9):
  - Accepted-as-is rate   — agent work merged without rework (the trust signal)
  - Review wait (median)  — the real bottleneck; security-review wait on its own line
  - Rework / revert rate  — and bounce-back-for-unclear — intent-quality signals
  - Escaped bugs          — each answered with "which check should have caught it?"
  - The DORA four         — deploy frequency, lead time, change-fail rate, time-to-recover

NEVER tracked, by design (this tool refuses to record them): velocity, story points, PR count,
lines of code. Agents inflate every one, and the published research is blunt that measured teams
have doubled PR volume while actual delivery stayed flat.

Usage:
  scorecard.py record --state .sdlc/state.yaml --type spec_merged --field accepted_as_is=true --field risk=HIGH
  scorecard.py report --state .sdlc/state.yaml [--window-days 14] [--json]
  (Standalone: pass --repo <path> instead of --state.)
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# Recognized outcome events and their meaningful fields (documentation + light validation).
EVENT_TYPES = {
    "spec_merged": "a spec PR merged (fields: accepted_as_is=bool, risk=HIGH|MEDIUM|LOW)",
    "spec_reverted": "a merged change was reverted (field: spec)",
    "spec_bounced": "a spec bounced back at triage/review as unbuildable/unclear (field: spec)",
    "escaped_bug": "a bug escaped to a later stage (field: which_check='the check that should have caught it')",
    "deploy": "a deploy ran (fields: env, succeeded=bool, lead_time_hours=num, caused_failure=bool)",
    "incident": "a production incident (field: ttr_hours=num — time to recover)",
    "review_wait": "a review-wait sample (fields: wait_hours=num, security=bool)",
}

# The activity metrics the standard forbids in steering materials. Recording these is refused.
FORBIDDEN_TYPES = {
    "velocity", "story_points", "storypoints", "pr_count", "prcount",
    "lines_of_code", "loc", "commits",
}


def parse_field(token: str):
    """'key=value' -> (key, typed_value). Bools, ints, floats are coerced; else string."""
    if "=" not in token:
        raise ValueError(f"--field must be key=value (got '{token}')")
    key, _, raw = token.partition("=")
    key = key.strip()
    val = raw.strip()
    low = val.lower()
    if low in ("true", "false"):
        return key, low == "true"
    try:
        return key, int(val)
    except ValueError:
        pass
    try:
        return key, float(val)
    except ValueError:
        pass
    return key, val


def record_event(events_path: Path, event_type: str, fields: dict, timestamp: str) -> dict:
    """Append one outcome event to the JSONL log. Returns the written entry."""
    entry = {"timestamp": timestamp, "type": event_type, **fields}
    events_path.parent.mkdir(parents=True, exist_ok=True)
    with open(events_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")
    return entry


def load_events(events_path: Path) -> list[dict]:
    if not events_path.exists():
        return []
    events = []
    for line in events_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return events


def _median(nums: list[float]):
    if not nums:
        return None
    s = sorted(nums)
    n = len(s)
    mid = n // 2
    return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2


def _rate(numerator: int, denominator: int):
    """Returns a 0..1 rate, or None when there's no denominator (no data — don't fabricate)."""
    return (numerator / denominator) if denominator else None


def compute_scorecard(events: list[dict]) -> dict:
    """Compute the steering metrics from outcome events. None = no data yet (never a guessed 0)."""
    def of(t):
        return [e for e in events if e.get("type") == t]

    merges = of("spec_merged")
    accepted = sum(1 for e in merges if e.get("accepted_as_is") is True)
    reverts = of("spec_reverted")
    bounces = of("spec_bounced")
    escaped = of("escaped_bug")
    deploys = of("deploy")
    incidents = of("incident")
    waits = of("review_wait")

    review_waits = [e["wait_hours"] for e in waits if not e.get("security") and "wait_hours" in e]
    sec_waits = [e["wait_hours"] for e in waits if e.get("security") and "wait_hours" in e]
    lead_times = [e["lead_time_hours"] for e in deploys if "lead_time_hours" in e]
    ttrs = [e["ttr_hours"] for e in incidents if "ttr_hours" in e]
    failed_deploys = sum(1 for e in deploys if e.get("caused_failure") is True)

    return {
        "accepted_as_is_rate": _rate(accepted, len(merges)),
        "review_wait_median_hours": _median(review_waits),
        "security_review_wait_median_hours": _median(sec_waits),
        "rework_revert_rate": _rate(len(reverts), len(merges)),
        "bounce_back_rate": _rate(len(bounces), len(merges) + len(bounces)),
        "escaped_bugs": [
            {"which_check": e.get("which_check", "(unanswered — answer at Retro+)"), "spec": e.get("spec")}
            for e in escaped
        ],
        "dora": {
            "deploy_count": len(deploys),
            "lead_time_median_hours": _median(lead_times),
            "change_fail_rate": _rate(failed_deploys, len(deploys)),
            "time_to_recover_median_hours": _median(ttrs),
        },
        "totals": {"merges": len(merges), "reverts": len(reverts), "bounces": len(bounces)},
    }


def _pct(rate):
    return "no data" if rate is None else f"{rate * 100:.0f}%"


def _hrs(v):
    return "no data" if v is None else f"{v:.1f}h"


def format_report(sc: dict, window_days: int | None) -> str:
    window = f" (last {window_days} days)" if window_days else ""
    lines = [f"Steering Scorecard{window}", "=" * 44, "", "Trust & intent:"]
    lines.append(f"  Accepted-as-is rate     {_pct(sc['accepted_as_is_rate'])}")
    lines.append(f"  Rework / revert rate    {_pct(sc['rework_revert_rate'])}")
    lines.append(f"  Bounce-back (unclear)   {_pct(sc['bounce_back_rate'])}")
    lines.append("")
    lines.append("Bottleneck:")
    lines.append(f"  Review wait (median)    {_hrs(sc['review_wait_median_hours'])}")
    lines.append(f"  Security-review wait    {_hrs(sc['security_review_wait_median_hours'])}  (own line)")
    lines.append("")
    d = sc["dora"]
    lines.append("DORA four:")
    lines.append(f"  Deploys                 {d['deploy_count']}")
    lines.append(f"  Lead time (median)      {_hrs(d['lead_time_median_hours'])}")
    lines.append(f"  Change-fail rate        {_pct(d['change_fail_rate'])}")
    lines.append(f"  Time-to-recover (med)   {_hrs(d['time_to_recover_median_hours'])}")
    lines.append("")
    bugs = sc["escaped_bugs"]
    lines.append(f"Escaped bugs: {len(bugs)}")
    for b in bugs:
        lines.append(f"  - {b['which_check']}" + (f" (spec {b['spec']})" if b.get("spec") else ""))
    lines.append("")
    lines.append("Never tracked: velocity, story points, PR count, lines of code.")
    return "\n".join(lines)


def resolve_metrics_dir(args) -> Path:
    """.sdlc/metrics dir from --state (the .sdlc beside it) or --repo (<repo>/.sdlc)."""
    if args.state:
        state_path = Path(args.state)
        if not state_path.exists():
            print(f"Error: State file not found: {state_path}")
            sys.exit(1)
        return state_path.resolve().parent / "metrics"
    return Path(args.repo).resolve() / ".sdlc" / "metrics"


def main():
    parser = argparse.ArgumentParser(description="Record and report the Build-loop steering scorecard")
    sub = parser.add_subparsers(dest="command", required=True)

    common = argparse.ArgumentParser(add_help=False)
    src = common.add_mutually_exclusive_group()
    src.add_argument("--state", help="Path to .sdlc/state.yaml (workflow mode)")
    src.add_argument("--repo", default=".", help="Repo root containing .sdlc/ (standalone; default cwd)")

    p_rec = sub.add_parser("record", parents=[common], help="Append an outcome event")
    p_rec.add_argument("--type", required=True, help=f"Event type: {', '.join(EVENT_TYPES)}")
    p_rec.add_argument("--field", action="append", default=[], help="key=value (repeatable)")

    p_rep = sub.add_parser("report", parents=[common], help="Print the scorecard")
    p_rep.add_argument("--window-days", type=int, default=None, help="Label only (filtering by date is the caller's job)")
    p_rep.add_argument("--json", action="store_true", help="Emit the scorecard as JSON")

    args = parser.parse_args()
    events_path = resolve_metrics_dir(args) / "loop-events.jsonl"

    if args.command == "record":
        event_type = args.type.strip().lower()
        if event_type in FORBIDDEN_TYPES:
            print(f"Refused: '{event_type}' is an activity metric the standard never tracks "
                  f"(velocity, story points, PR count, lines of code). Steering is on outcomes.")
            sys.exit(2)
        if event_type not in EVENT_TYPES:
            print(f"Error: unknown event type '{event_type}'. Known: {', '.join(EVENT_TYPES)}")
            sys.exit(1)
        try:
            fields = dict(parse_field(t) for t in args.field)
        except ValueError as e:
            print(f"Error: {e}")
            sys.exit(1)
        entry = record_event(events_path, event_type, fields, datetime.now(timezone.utc).isoformat())
        print(f"Recorded {event_type}: {json.dumps(entry)}")
        return

    # report
    sc = compute_scorecard(load_events(events_path))
    if args.json:
        print(json.dumps(sc, indent=2))
    else:
        print(format_report(sc, args.window_days))


if __name__ == "__main__":
    main()
