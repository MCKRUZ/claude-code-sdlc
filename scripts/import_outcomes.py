"""Import Build-loop outcome events from the code host's history — the host-neutral `scorecard.py import`.

`scorecard.py` is protected and knows only GitHub, so this verb sits beside it rather than inside it:
  * GitHub (and `none`, which has always meant "try gh") → `scorecard.import_events(...)`, the frozen
    code path, called literally — no second implementation of the GitHub import exists.
  * Azure DevOps → `ado_outcomes.collect_report` → dedup on `gh_id` against `scorecard.load_events()`
    → `scorecard.append_events()`. Same ledger, same event shapes, `ado-*` ids that never collide.

Output phrasing is identical to `scorecard.py import` ("Imported: no data" / "Imported N event(s): …" /
"Error: …" exit 1). What Azure DevOps cannot record is SAID, never written as a zero: a review_wait
event with no request timestamp has no `wait_hours` key and is counted on its own line; a category
that could not be read ("deploys: not imported (…)") contributes nothing. Nothing is written until
every category has been read, so a failure leaves the ledger exactly as it was.

Usage:
  import_outcomes.py --since 2026-09-01 --state .sdlc/state.yaml [--host azure-devops] [--json]
  (Standalone: --repo <path> instead of --state; works with no .sdlc/ — the ledger is created.)
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import code_host  # noqa: E402
import github_import as gi  # noqa: E402
import scorecard  # noqa: E402

NO_REQUEST_TIME = "Azure DevOps records no request timestamp"
NO_APPROVAL_TIME = "no vote thread dates the approval; accepted-as-is left unknown"


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Import outcome events from the code host's history into the scorecard ledger")
    src = parser.add_mutually_exclusive_group()
    src.add_argument("--state", help="Path to .sdlc/state.yaml (workflow mode)")
    src.add_argument("--repo", default=".", help="Repo root containing .sdlc/ (standalone; default cwd)")
    parser.add_argument("--since", required=True, help="Only activity on/after this date (YYYY-MM-DD)")
    parser.add_argument("--host", choices=code_host.HOSTS, default=None,
                        help="Override code-host detection for this invocation (default: flag > env > .sdlc/code-host.yaml > origin)")
    parser.add_argument("--json", action="store_true", help="Emit exactly one JSON document (carries the top-level host block)")
    return parser.parse_args(argv)


def _counts(events: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for e in events:
        counts[e["type"]] = counts.get(e["type"], 0) + 1
    return counts


def import_ado(repo_root: Path, events_path: Path, since: str) -> tuple[list[dict], dict]:
    """The Azure DevOps twin of `scorecard.import_events`: (new events written, category notes)."""
    import ado_outcomes
    report = ado_outcomes.collect_report(str(repo_root), since)
    existing = {e["gh_id"] for e in scorecard.load_events(events_path) if "gh_id" in e}
    new_events = [e for e in report["events"] if e["gh_id"] not in existing]
    if new_events:
        scorecard.append_events(events_path, new_events)
    return new_events, report["notes"]


def note_lines(new_events: list[dict], notes: dict) -> list[str]:
    """One line per thing the numbers cannot show — printed after the summary, never folded into it."""
    lines = []
    undated = sum(1 for e in new_events if e["type"] == "review_wait" and "wait_hours" not in e)
    if undated:
        lines.append(f"review_wait: {undated} event(s) carry no wait time ({NO_REQUEST_TIME})")
    unknown = sum(1 for e in new_events if e["type"] == "spec_merged" and e.get("accepted_as_is") is None)
    if unknown:
        lines.append(f"spec_merged: {unknown} event(s) have no approval time ({NO_APPROVAL_TIME})")
    for category in ("deploys", "incidents"):
        if notes.get(category):
            lines.append(f"{category}: not imported ({notes[category]})")
    return lines


def run(args) -> int:
    try:
        date.fromisoformat(args.since)
    except ValueError:
        return _fail(args, None, f"--since must be YYYY-MM-DD (got {args.since!r})")
    if args.state and not Path(args.state).exists():
        return _fail(args, None, f"State file not found: {args.state}")
    metrics_dir = scorecard.resolve_metrics_dir(args)
    events_path = metrics_dir / "loop-events.jsonl"
    repo_root = metrics_dir.parent.parent

    try:
        detection = code_host.detect_host(repo_root, args.host)
    except ValueError as e:
        return _fail(args, None, str(e))
    host = code_host.host_block(detection)

    notes: dict = {}
    try:
        if detection.host == "azure-devops":
            new_events, notes = import_ado(repo_root, events_path, args.since)
            counts = _counts(new_events)
        else:
            new_events = []
            counts = scorecard.import_events(repo_root, events_path, args.since)
    except gi.GitHubImportError as e:  # AdoImportError is a subclass — one except covers both hosts
        return _fail(args, host, str(e))

    lines = note_lines(new_events, notes)
    if args.json:
        print(json.dumps({"host": host, "since": args.since, "events_path": str(events_path),
                          "imported": counts, "total": sum(counts.values()), "notes": lines, "error": None}, indent=2))
        return 0
    if not counts:
        print("Imported: no data")
    else:
        summary = ", ".join(f"{n} {t}" for t, n in sorted(counts.items()))
        print(f"Imported {sum(counts.values())} event(s): {summary}")
    for line in lines:
        print(line)
    return 0


def _fail(args, host: dict | None, message: str) -> int:
    if args.json:
        print(json.dumps({"host": host, "since": args.since, "imported": None, "total": None, "notes": [],
                          "error": message}, indent=2))
    else:
        print(f"Error: {message}")
    return 1


def main(argv=None) -> int:
    return run(parse_args(argv))


if __name__ == "__main__":
    sys.exit(main())
