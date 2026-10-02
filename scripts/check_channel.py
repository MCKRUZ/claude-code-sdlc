"""Advisory channel-coverage lint for a Build-loop spec (specs/NNNN-name.md).

Runs BESIDE check_spec.py — never in place of it. When a spec sets `channel: X`, this
cross-checks channel X's acceptance_dimensions (from channels/<X>.yaml) against the spec's
existing `## Acceptance Checks`, and emits a SHOULD advisory for every dimension not yet
covered. It is *advisory by construction*: every finding is SHOULD and the process ALWAYS
exits 0. It can never change a spec's ready/not-ready verdict — check_spec.py owns that and is
byte-for-byte unmodified. The rigor still lands in the core: injected channel dimensions become
ordinary lines in ## Acceptance Checks, graded by the existing grader.

Standalone or Workflow (CLAUDE.md design rule):
  - Standalone: --spec specs/NNNN-name.md      (channels read from the plugin's channels/)
  - Workflow:   --spec ... --state .sdlc/state.yaml   (also logs to .sdlc/metrics/channel-log.jsonl)
"""

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_spec import extract_section, finding, list_items, parse_frontmatter

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CHANNELS_DIR = PLUGIN_ROOT / "channels"

# Values in `channel:` that mean "no channel bound / deliberately channel-agnostic".
NO_CHANNEL = {"", "-", "—", "–", "none", "n/a", "na", "channel-agnostic", "agnostic"}

# A "(channel: <tag>)" marker on an acceptance check line.
CHANNEL_TAG_RE = re.compile(r"channel:\s*([a-z0-9][a-z0-9 _-]*)", re.IGNORECASE)

# Small stopword set so intent-keyword fallback matching stays conservative.
_STOPWORDS = {
    "never", "always", "without", "before", "after", "each", "every", "this", "that",
    "with", "from", "into", "when", "which", "what", "they", "them", "their", "there",
    "then", "than", "only", "must", "should", "shall", "will", "does", "done", "over",
    "under", "about", "agent", "system", "user", "customer", "caller", "cannot", "since",
    "state", "action", "result", "value", "shown", "displayed", "response", "config",
}


def _keywords(text: str) -> set[str]:
    return {
        w for w in re.findall(r"[a-z]{4,}", text.lower())
        if w not in _STOPWORDS
    }


def dimension_covered(dim: dict, checks: list[str]) -> bool:
    """True if any acceptance-check line plausibly covers this channel dimension.

    Match on: (a) the dimension id as a substring, (b) a "(channel: <tag>)" marker whose tag
    matches the id or one of its hyphen parts, or (c) enough of the intent's keywords appearing
    in one check line (conservative fallback).
    """
    dim_id = str(dim.get("id", "")).strip().lower()
    id_parts = {p for p in dim_id.split("-") if p}
    intent_kw = _keywords(str(dim.get("intent", "")))

    for c in checks:
        cl = c.lower()
        # (a) direct id mention.
        if dim_id and dim_id in cl:
            return True
        # (b) an explicit channel tag.
        for tag in CHANNEL_TAG_RE.findall(cl):
            tag = tag.strip().lower()
            if not tag:
                continue
            if tag == dim_id or tag in id_parts or dim_id.startswith(tag) or (dim_id and tag in dim_id):
                return True
        # (c) intent keyword overlap (needs at least two distinct hits).
        if intent_kw and sum(1 for k in intent_kw if k in cl) >= 2:
            return True
    return False


def check_channel_coverage(fm: dict, body: str, channels_dir: Path) -> tuple[str | None, list[dict]]:
    """Return (channel_id_or_None, findings). All findings are SHOULD (advisory)."""
    channel = (fm.get("channel") or "").strip()
    if channel.lower() in NO_CHANNEL:
        return None, []

    descriptor_path = channels_dir / f"{channel}.yaml"
    if not descriptor_path.exists():
        return channel, [finding(
            "descriptor", False, "SHOULD",
            f"Channel '{channel}' has no descriptor at {descriptor_path} — cannot cross-check its "
            f"acceptance dimensions (add channels/{channel}.yaml or fix the spec's channel:)"
        )]

    try:
        descriptor = yaml.safe_load(descriptor_path.read_text(encoding="utf-8", errors="replace")) or {}
    except yaml.YAMLError as e:
        return channel, [finding("descriptor", False, "SHOULD",
                                 f"Channel '{channel}' descriptor could not be parsed: {e}")]

    dims = descriptor.get("acceptance_dimensions") or []
    if not isinstance(dims, list) or not dims:
        return channel, [finding("descriptor", False, "SHOULD",
                                 f"Channel '{channel}' descriptor lists no acceptance_dimensions to check")]

    acc = extract_section(body, "Acceptance Checks")
    findings: list[dict] = []
    if acc is None:
        findings.append(finding("acceptance-section", False, "SHOULD",
                                "Spec has no ## Acceptance Checks section — the channel dimensions have nowhere to land"))
        checks: list[str] = []
    else:
        checks = list_items(acc)

    for dim in dims:
        if not isinstance(dim, dict):
            continue
        dim_id = str(dim.get("id", "")).strip() or "?"
        if dimension_covered(dim, checks):
            findings.append(finding(dim_id, True, "SHOULD", f"{dim_id} — covered"))
        else:
            intent = str(dim.get("intent", "")).strip()
            example = str(dim.get("example_check", "")).strip()
            msg = f"{dim_id} — no acceptance check covers this {channel} dimension"
            if intent:
                msg += f": {intent}"
            if example:
                snippet = example if len(example) <= 90 else example[:87] + "..."
                msg += f' (e.g. "{snippet}")'
            findings.append(finding(dim_id, False, "SHOULD", msg))

    return channel, findings


# --- machine-readable report, and the interaction-spec check (spec 0021) -----------------------

# Findings that are about the descriptor or the section, not about one dimension.
_NON_DIMENSION_CHECKS = {"descriptor", "acceptance-section"}
_PLACEHOLDER_CELL_RE = re.compile(r"^\[.*\]$")


def spec_report(spec_path: Path, channel: str | None, findings: list[dict], notes: list[str] | None = None) -> dict:
    """The advisory check as data: one entry per dimension, and everything that is not about a
    single dimension (a missing descriptor, a missing section) as a note."""
    dimensions = [{"id": f["check"], "covered": f["passed"]} for f in findings if f["check"] not in _NON_DIMENSION_CHECKS]
    return {
        "spec": spec_path.name,
        "channel": channel,
        "bound": channel is not None,
        "source": "spec",
        "dimensions": dimensions,
        "uncovered": [d["id"] for d in dimensions if not d["covered"]],
        "advisory": True,
        "notes": (notes or []) + [f["message"] for f in findings if f["check"] in _NON_DIMENSION_CHECKS],
    }


def load_channel_descriptor(channel: str, channels_dir: Path) -> tuple[dict | None, str | None]:
    """(descriptor, note). A descriptor that is missing or unreadable is a note, never a crash."""
    path = channels_dir / f"{channel}.yaml"
    if not path.exists():
        return None, f"Channel '{channel}' has no descriptor at {path}"
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8", errors="replace")) or {}, None
    except yaml.YAMLError as e:
        return None, f"Channel '{channel}' descriptor could not be parsed: {e}"


def interaction_spec_channel(text: str) -> str | None:
    """The channel an interaction spec names on its `**Channel:**` line, or None when that line
    is still the template's `<channel>` placeholder."""
    m = re.search(r"^\*\*Channel:\*\*[ \t]*`?([^`\r\n]*)`?", text, re.MULTILINE)
    value = m.group(1).strip() if m else ""
    return None if not value or "<" in value or "[" in value else value


def _clean_cell(cell: str) -> str | None:
    """A table cell's text, or None when it is empty or still a `[template placeholder]`."""
    cell = cell.strip()
    if len(cell) >= 2 and cell[0] == cell[-1] == '"':
        cell = cell[1:-1].strip()
    return None if not cell or _PLACEHOLDER_CELL_RE.match(cell) else cell


def parse_interaction_rows(text: str) -> list[dict]:
    """The rows of the interaction spec's contract table (the one whose header names the
    "descriptor dimension"): dimension -> contract -> acceptance check. A cell that is empty or
    still a template placeholder is None, so an unfilled row never counts as coverage."""
    rows, header_seen = [], False
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped.startswith("|"):
            header_seen = False if not rows else header_seen
            if rows:
                break
            continue
        cells = [c.strip() for c in stripped.strip("|").split("|")]
        if not header_seen:
            header_seen = len(cells) >= 3 and "dimension" in cells[0].lower()
            continue
        if all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c):
            continue
        if len(cells) >= 3:
            rows.append({
                "dimension": cells[0].replace("`", "").strip().lower(),
                "contract": _clean_cell(cells[1]),
                "check": _clean_cell(cells[2]),
            })
    return rows


def find_interaction_row(dim_id: str, rows: list[dict]) -> dict | None:
    return next((r for r in rows if r["dimension"] and dim_id.lower() in r["dimension"]), None)


def interaction_report(path: Path, channel_arg: str | None, channels_dir: Path) -> dict:
    """Does this interaction spec have a real row for every dimension the channel lists?"""
    base = {"interaction_spec": path.name, "channel": None, "bound": False, "source": "interaction-spec",
            "dimensions": [], "uncovered": [], "advisory": True, "notes": []}
    if not path.exists():
        return {**base, "notes": [f"interaction spec not found: {path}"]}
    text = path.read_text(encoding="utf-8", errors="replace")
    channel = channel_arg or interaction_spec_channel(text)
    if not channel:
        return {**base, "notes": ["no channel: the document's **Channel:** line is still a placeholder; name one with --channel"]}
    descriptor, note = load_channel_descriptor(channel, channels_dir)
    if descriptor is None:
        return {**base, "channel": channel, "bound": True, "notes": [note]}

    rows = parse_interaction_rows(text)
    dimensions = []
    for dim in descriptor.get("acceptance_dimensions") or []:
        if not isinstance(dim, dict):
            continue
        dim_id = str(dim.get("id", "")).strip() or "?"
        row = find_interaction_row(dim_id, rows)
        covered = bool(row and row["contract"])
        dimensions.append({
            "id": dim_id, "covered": covered,
            "contract": row["contract"] if covered else None,
            "acceptance_check": row["check"] if covered else None,
        })
    return {**base, "channel": channel, "bound": True, "dimensions": dimensions,
            "uncovered": [d["id"] for d in dimensions if not d["covered"]]}


def format_interaction_report(report: dict) -> str:
    if not report["bound"] or not report["dimensions"]:
        return "\n".join([f"Interaction Spec Coverage — {report['interaction_spec']}", "=" * 50,
                          *(f"  NOTE    [SHOULD] {n}" for n in report["notes"]),
                          "=" * 50, "ADVISORY — nothing to assess (advisory check — never blocks)."])
    lines = [f"Interaction Spec Coverage — {report['interaction_spec']} (channel: {report['channel']})", "=" * 50]
    for d in report["dimensions"]:
        if d["covered"]:
            lines.append(f"  COVER   [SHOULD] {d['id']} — has a contract row")
        else:
            lines.append(f"  ADVISE  [SHOULD] {d['id']} — no contract row covers this {report['channel']} dimension")
    lines.append("=" * 50)
    lines.append(f"ADVISORY — {len(report['uncovered'])} of {len(report['dimensions'])} '{report['channel']}' "
                 f"dimension(s) have no contract row yet (SHOULD; never blocks).")
    return "\n".join(lines)


def log_channel_metrics(findings: list[dict], spec_path: Path, channel: str | None, sdlc_dir: Path) -> None:
    """Append a summary entry to .sdlc/metrics/channel-log.jsonl (mirrors check_spec.log_spec_metrics)."""
    metrics_dir = sdlc_dir / "metrics"
    metrics_dir.mkdir(parents=True, exist_ok=True)
    should_fail = [r for r in findings if not r["passed"]]
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "spec": spec_path.name,
        "channel": channel,
        "dimensions": len(findings),
        "covered": sum(1 for r in findings if r["passed"]),
        "uncovered": len(should_fail),
        "should_failed": len(should_fail),
    }
    if should_fail:
        entry["advisories"] = [{"check": r["check"], "message": r["message"]} for r in should_fail]
    with open(metrics_dir / "channel-log.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")


def format_results(findings: list[dict], spec_path: Path, channel: str | None) -> str:
    if channel is None:
        return "\n".join([
            f"Channel Coverage Check — {spec_path.name}",
            "=" * 50,
            "  NOTE    [SHOULD] No channel bound (channel: is blank or '—') — treating this spec as "
            "channel-agnostic; nothing to cross-check.",
            "=" * 50,
            "ADVISORY — no channel coverage to assess (advisory check — never blocks).",
        ])

    lines = [f"Channel Coverage Check — {spec_path.name} (channel: {channel})", "=" * 50]
    for r in findings:
        status = "COVER" if r["passed"] else "ADVISE"
        lines.append(f"  {status:<7} [{r['severity']}] {r['message']}")
    uncovered = [r for r in findings if not r["passed"]]
    total = len(findings)
    lines.append("=" * 50)
    if not findings:
        lines.append(f"ADVISORY — channel '{channel}' has no dimensions to check (advisory — never blocks).")
    elif uncovered:
        lines.append(f"ADVISORY — {len(uncovered)} of {total} '{channel}' dimension(s) not yet covered in "
                     f"## Acceptance Checks; add a check for each (SHOULD; never blocks).")
    else:
        lines.append(f"ADVISORY — all {total} '{channel}' dimension(s) covered (advisory check — never blocks).")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Advisory channel-coverage lint (runs beside check_spec.py; never blocks)"
    )
    parser.add_argument("--spec", default=None, help="Path to specs/NNNN-name.md")
    parser.add_argument("--channels-dir", default=str(DEFAULT_CHANNELS_DIR),
                        help="Directory of channel descriptors (default: the plugin's channels/)")
    parser.add_argument("--state", default=None, help="Path to .sdlc/state.yaml (enables metrics logging)")
    parser.add_argument("--interaction-spec", default=None, dest="interaction_spec",
                        help="Check that this channel-interaction-spec.md has a contract row for every "
                             "dimension of its channel (instead of checking a spec)")
    parser.add_argument("--channel", default=None,
                        help="With --interaction-spec: the channel, when the document does not name one")
    parser.add_argument("--json", action="store_true", help="Emit the result as one JSON document")
    args = parser.parse_args()

    if not args.spec and not args.interaction_spec:
        parser.error("give --spec (check a spec) or --interaction-spec (check an interaction spec)")

    if args.interaction_spec:
        report = interaction_report(Path(args.interaction_spec), args.channel, Path(args.channels_dir))
        print(json.dumps(report, indent=2) if args.json else format_interaction_report(report))
        sys.exit(0)

    spec_path = Path(args.spec)
    if not spec_path.exists():
        # Even a missing spec is non-fatal: this check can never block the loop.
        if args.json:
            print(json.dumps(spec_report(spec_path, None, [], [f"spec not found: {spec_path}"]), indent=2))
        else:
            print(f"ADVISORY — spec not found: {spec_path} (advisory check — never blocks).")
        sys.exit(0)

    fm, body = parse_frontmatter(spec_path.read_text(encoding="utf-8", errors="replace"))
    channel, findings = check_channel_coverage(fm, body, Path(args.channels_dir))
    print(json.dumps(spec_report(spec_path, channel, findings), indent=2) if args.json
          else format_results(findings, spec_path, channel))

    if args.state:
        state_path = Path(args.state)
        if state_path.exists():
            log_channel_metrics(findings, spec_path, channel, state_path.parent)

    # Advisory by construction — never a non-zero exit.
    sys.exit(0)


if __name__ == "__main__":
    main()
