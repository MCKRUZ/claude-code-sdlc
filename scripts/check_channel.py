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
    parser.add_argument("--spec", required=True, help="Path to specs/NNNN-name.md")
    parser.add_argument("--channels-dir", default=str(DEFAULT_CHANNELS_DIR),
                        help="Directory of channel descriptors (default: the plugin's channels/)")
    parser.add_argument("--state", default=None, help="Path to .sdlc/state.yaml (enables metrics logging)")
    args = parser.parse_args()

    spec_path = Path(args.spec)
    if not spec_path.exists():
        # Even a missing spec is non-fatal: this check can never block the loop.
        print(f"ADVISORY — spec not found: {spec_path} (advisory check — never blocks).")
        sys.exit(0)

    fm, body = parse_frontmatter(spec_path.read_text(encoding="utf-8", errors="replace"))
    channel, findings = check_channel_coverage(fm, body, Path(args.channels_dir))
    print(format_results(findings, spec_path, channel))

    if args.state:
        state_path = Path(args.state)
        if state_path.exists():
            log_channel_metrics(findings, spec_path, channel, state_path.parent)

    # Advisory by construction — never a non-zero exit.
    sys.exit(0)


if __name__ == "__main__":
    main()
