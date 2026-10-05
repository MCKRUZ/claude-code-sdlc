"""Parse the per-team WIP-limit and review-wait-alarm block from a project's cadence-plan.md.

Today's cap is a single bracketed number in prose (`**[2]**` under "The two numbers"), which
cannot express "team A's limit differs from team B's." This module reads an optional, additive
`## WIP Limits` table instead — the one proven convention this codebase already has for
structured data living inside an otherwise-prose markdown artifact: a heading followed by a
GitHub-flavored markdown table, the same shape `## Gate Results` uses in review reports (see
scripts/record_findings.py). Errors from this parser always name a line number, because that
table is hand-edited prose, not machine-generated.

No `## WIP Limits` heading at all is not an error — it means the project hasn't adopted per-team
limits, and every caller must behave exactly as it did before this module existed
(Standalone or Workflow; CLAUDE.md).

Both scripts/track_specs.py and scripts/scorecard.py call load_limits() as their single entry
point; neither re-parses the table itself.
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import validate_team as vt

DEFAULT_REVIEW_ALARM_HOURS = 24
DEFAULT_SECURITY_ALARM_HOURS = 48

REQUIRED_COLUMNS = ("team", "wip_limit")
OPTIONAL_COLUMNS = ("review_alarm_hours", "security_alarm_hours")
ALLOWED_COLUMNS = set(REQUIRED_COLUMNS) | set(OPTIONAL_COLUMNS)

_HEADING_RE = re.compile(r"^##\s+WIP Limits\s*$", re.IGNORECASE | re.MULTILINE)
_NEXT_HEADING_RE = re.compile(r"^##\s+", re.MULTILINE)
_SEPARATOR_CELL_RE = re.compile(r":?-{2,}:?")


def _is_separator_row(cells: list[str]) -> bool:
    return bool(cells) and all(_SEPARATOR_CELL_RE.fullmatch(c.strip() or "-") for c in cells)


def _positive_int(raw: str) -> int | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        value = int(raw)
    except ValueError:
        return None
    return value if value > 0 else None


def parse_limits_block(text: str, known_teams: set[str] | None = None) -> tuple[dict[str, dict], list[str]]:
    """Parse the `## WIP Limits` table. Returns (limits_by_team, errors).

    limits_by_team[team] = {
        "wip_limit": int,
        "review_alarm_hours": int, "review_alarm_default": bool,
        "security_alarm_hours": int, "security_alarm_default": bool,
    }

    `known_teams`, when given, flags a table row naming a team absent from it — the project
    roster from .sdlc/team.yaml (spec 0001). Every error names the offending line and parsing
    never raises; a malformed row is skipped, not fatal.
    """
    m = _HEADING_RE.search(text)
    if not m:
        return {}, []

    nxt = _NEXT_HEADING_RE.search(text, m.end())
    block = text[m.end(): nxt.start() if nxt else len(text)]
    block_start_line = text[: m.end()].count("\n") + 1

    limits: dict[str, dict] = {}
    errors: list[str] = []
    header: list[str] | None = None
    seen: dict[str, int] = {}

    for offset, raw_line in enumerate(block.splitlines()):
        line_no = block_start_line + offset
        line = raw_line.strip()
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if _is_separator_row(cells):
            continue

        if header is None:
            header = [c.lower() for c in cells]
            unknown = [c for c in header if c not in ALLOWED_COLUMNS]
            if unknown:
                errors.append(
                    f"line {line_no}: unknown column(s) {', '.join(unknown)} — "
                    f"allowed: {', '.join(sorted(ALLOWED_COLUMNS))}"
                )
            missing = [c for c in REQUIRED_COLUMNS if c not in header]
            if missing:
                errors.append(f"line {line_no}: missing required column(s) {', '.join(missing)}")
            continue

        row = dict(zip(header, cells))
        team = (row.get("team") or "").strip()
        if not team:
            errors.append(f"line {line_no}: row has no team name")
            continue
        if team in seen:
            errors.append(f"line {line_no}: duplicate team '{team}' (first seen at line {seen[team]})")
            continue
        seen[team] = line_no
        if known_teams is not None and team not in known_teams:
            errors.append(f"line {line_no}: team '{team}' is not in the project roster (.sdlc/team.yaml)")
            continue

        wip_raw = row.get("wip_limit", "")
        wip = _positive_int(wip_raw)
        if wip is None:
            errors.append(f"line {line_no}: wip_limit '{wip_raw}' is not a positive whole number")
            continue

        entry = {"wip_limit": wip}
        for key, default in (
            ("review_alarm_hours", DEFAULT_REVIEW_ALARM_HOURS),
            ("security_alarm_hours", DEFAULT_SECURITY_ALARM_HOURS),
        ):
            raw = (row.get(key) or "").strip()
            if not raw:
                entry[key] = default
                entry[f"{key}_default"] = True
                continue
            value = _positive_int(raw)
            if value is None:
                errors.append(f"line {line_no}: {key} '{raw}' is not a positive whole number")
                entry[key] = default
                entry[f"{key}_default"] = True
                continue
            entry[key] = value
            entry[f"{key}_default"] = False

        limits[team] = entry

    return limits, errors


def resolve_cadence_plan_path(repo_root: Path) -> Path:
    return repo_root / ".sdlc" / "artifacts" / "03-foundation" / "cadence-plan.md"


def known_teams(repo_root: Path) -> set[str]:
    """Team names from the project's .sdlc/team.yaml, if it has one. Empty set otherwise."""
    roster_path = repo_root / ".sdlc" / "team.yaml"
    if not roster_path.exists():
        return set()
    return vt.team_names(vt.load_yaml(roster_path))


def load_limits(repo_root: Path) -> tuple[dict[str, dict], list[str]]:
    """The one entry point track_specs.py and scorecard.py both call.

    No cadence-plan.md, or one with no `## WIP Limits` heading, returns ({}, []) — a project
    without this feature behaves exactly as it did before this module existed.
    """
    path = resolve_cadence_plan_path(repo_root)
    if not path.exists():
        return {}, []
    text = path.read_text(encoding="utf-8", errors="replace")
    teams = known_teams(repo_root)
    return parse_limits_block(text, teams or None)
