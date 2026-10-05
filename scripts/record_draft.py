"""Record what happened to an AI-drafted field, to an append-only ledger (spec 0010).

Spec 0010's Decision List, resolved 2026-09-24: **a discarded draft is still recorded.** Every
time Claude is asked to draft a field, the offer and its outcome go in the ledger — so "how much
of this document was AI-drafted, including what we turned down" is answerable later.

The ledger is its OWN file, `.sdlc/metrics/draft-log.jsonl`, deliberately separate from the
document's version history (`.sdlc/metrics/artifact-log.jsonl`). The version history is a record
of what the document ACTUALLY SAYS; filling it with entries for text that was rejected — and so
is not in the document — would make the thing people read to understand how the content evolved
much harder to read, for no gain. Two ledgers, two questions, each answerable cleanly.

Same shape as record_findings.py: append-only JSONL, dual --repo/--state, one entry per call.

Usage:
  record_draft.py record --artifact <path> --field <label> --outcome <accepted|edited|discarded>
                         --actor <name> [--section <heading>] [--instance <id>]
                         [--chars-offered N] [--chars-kept N] [--repo P | --state P]
  record_draft.py report [--repo P | --state P] [--json]

`report` is read-only and always exits 0 — it answers "how much of this project's document text
was AI-drafted, and how much of what was offered did people actually keep?" Never ranks by actor:
the question is about the tool's usefulness, not about who used it, and the plugin's other
ledgers (see retro_report.py) hold that line deliberately.
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

OUTCOMES = ("accepted", "edited", "discarded")
LEDGER_NAME = "draft-log.jsonl"


def resolve_base_and_metrics(args) -> tuple[Path, Path]:
    """(repo_base_dir, metrics_dir) from --state (the .sdlc beside it) or --repo (<repo>/.sdlc)."""
    if getattr(args, "state", None):
        state_path = Path(args.state)
        if not state_path.exists():
            print(f"Error: State file not found: {state_path}")
            sys.exit(1)
        sdlc = state_path.resolve().parent
        return sdlc.parent, sdlc / "metrics"
    repo = Path(args.repo).resolve()
    return repo, repo / ".sdlc" / "metrics"


def normalize_artifact(artifact: str, base_dir: Path) -> str:
    """Repo-relative, forward-slashed — so the same document reads the same in the ledger
    whichever machine and working directory it was recorded from."""
    p = Path(artifact)
    try:
        rel = p.resolve().relative_to(base_dir.resolve())
    except (ValueError, OSError):
        return str(artifact).replace("\\", "/")
    return str(rel).replace("\\", "/")


def build_entry(args, base_dir: Path, ts: str) -> dict:
    entry = {
        "ts": ts,
        "artifact": normalize_artifact(args.artifact, base_dir),
        "field": args.field,
        "outcome": args.outcome,
        "actor": args.actor,
    }
    for key, value in (
        ("section", getattr(args, "section", None)),
        ("instance", getattr(args, "instance", None)),
    ):
        if value:
            entry[key] = value
    for key, value in (
        ("chars_offered", getattr(args, "chars_offered", None)),
        ("chars_kept", getattr(args, "chars_kept", None)),
    ):
        if value is not None:
            entry[key] = value
    return entry


def load_ledger(ledger_path: Path) -> list[dict]:
    if not ledger_path.exists():
        return []
    entries = []
    for line in ledger_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            continue  # a torn line never takes the whole report down
    return entries


def summarize(ledger: list[dict]) -> dict:
    """Counts per outcome, plus how much of what was offered was kept. Honest about absence:
    a project where nobody used drafting reads as no data, never as a zero acceptance rate."""
    by_outcome = {o: 0 for o in OUTCOMES}
    for e in ledger:
        o = e.get("outcome")
        if o in by_outcome:
            by_outcome[o] += 1
    total = sum(by_outcome.values())
    offered = sum(e.get("chars_offered", 0) or 0 for e in ledger)
    kept = sum(e.get("chars_kept", 0) or 0 for e in ledger)
    return {
        "drafts": total,
        "by_outcome": by_outcome,
        "chars_offered": offered,
        "chars_kept": kept,
        "kept_share": (kept / offered) if offered else None,
    }


def format_report(summary: dict) -> str:
    if summary["drafts"] == 0:
        return "AI drafts\n" + "=" * 44 + "\n\n  no data — nothing has been drafted in this project yet."
    lines = ["AI drafts", "=" * 44, "", f"  {summary['drafts']} draft(s) offered"]
    for outcome in OUTCOMES:
        lines.append(f"    {outcome:9} {summary['by_outcome'][outcome]}")
    share = summary["kept_share"]
    lines.append("")
    if share is None:
        lines.append("  Text kept: no data (no draft recorded its size).")
    else:
        lines.append(f"  Text kept: {summary['chars_kept']} of {summary['chars_offered']} characters offered ({share:.0%}).")
    return "\n".join(lines)


def cmd_record(args) -> int:
    if args.outcome not in OUTCOMES:
        print(f"Error: --outcome must be one of {', '.join(OUTCOMES)} (got {args.outcome!r})")
        return 1
    if not (args.actor or "").strip():
        print("Error: --actor is required — a draft belongs to the person who asked for it")
        return 1

    base_dir, metrics_dir = resolve_base_and_metrics(args)
    metrics_dir.mkdir(parents=True, exist_ok=True)
    ledger_path = metrics_dir / LEDGER_NAME
    entry = build_entry(args, base_dir, datetime.now(timezone.utc).isoformat())
    with open(ledger_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")
    print(f"Recorded {entry['outcome']} draft of '{entry['field']}' in {entry['artifact']} by {entry['actor']}.")
    return 0


def cmd_report(args) -> int:
    _, metrics_dir = resolve_base_and_metrics(args)
    summary = summarize(load_ledger(metrics_dir / LEDGER_NAME))
    print(json.dumps(summary, indent=2) if args.json else format_report(summary))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Record and report what happened to AI-drafted fields")
    sub = parser.add_subparsers(dest="command", required=True)

    common = argparse.ArgumentParser(add_help=False)
    src = common.add_mutually_exclusive_group()
    src.add_argument("--state", help="Path to .sdlc/state.yaml (workflow mode)")
    src.add_argument("--repo", default=".", help="Target repo root (standalone mode; default: cwd)")

    p_rec = sub.add_parser("record", parents=[common], help="Record one draft and its outcome")
    p_rec.add_argument("--artifact", required=True, help="The document the field belongs to")
    p_rec.add_argument("--field", required=True, help="The field's label")
    p_rec.add_argument("--outcome", required=True, help=f"One of: {', '.join(OUTCOMES)}")
    p_rec.add_argument("--actor", required=True, help="The person who asked for the draft")
    p_rec.add_argument("--section", help="The section heading the field sits in")
    p_rec.add_argument("--instance", help="The repeating-block id, e.g. FR-003")
    p_rec.add_argument("--chars-offered", type=int, help="Size of what Claude offered")
    p_rec.add_argument("--chars-kept", type=int, help="Size of what was kept (0 when discarded)")

    p_rep = sub.add_parser("report", parents=[common], help="How much was drafted, and how much kept")
    p_rep.add_argument("--json", action="store_true")

    args = parser.parse_args()
    return cmd_record(args) if args.command == "record" else cmd_report(args)


if __name__ == "__main__":
    sys.exit(main())
