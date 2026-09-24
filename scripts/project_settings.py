"""Every project setting, and the file that owns each one (spec 0012).

Four settings live in four different files, each owned by a different part of this system:
the roster, the per-team work-in-progress limits, the approval toggle, and the profile. A
settings screen needs all four, and reading them one call at a time is both slow and a place
for four slightly different opinions about "what if the file is missing" to accumulate.

So this composes, and decides nothing. Every value comes from the module that already owns
it — `validate_team`, `cadence_plan`, `approval_settings` — and each section carries the PATH
it came from, because spec 0012 asks every settings screen to say which file the setting is
stored in. A setting whose home is invisible is one nobody can correct outside the app.

Read-only, and always exits 0. Writing a setting is a separate, deliberate act with its own
rules, and it is not this script's job.

Missing is not broken. A project with no roster, no limits and no approval file is an
ordinary project that has not adopted those things — each section says so with `present:
false` rather than reporting an error, because "not configured" and "misconfigured" send a
person to two different places.

Standalone or Workflow:
  - Standalone: --repo <path>
  - Workflow:   --state <path>/.sdlc/state.yaml
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import approval_settings as aps
import cadence_plan as cp
import track_specs as ts
import validate_team as vt


def _rel(repo_root: Path, path: Path) -> str:
    try:
        return str(path.resolve().relative_to(repo_root.resolve())).replace("\\", "/")
    except ValueError:
        return str(path).replace("\\", "/")


def read_roster(repo_root: Path) -> dict:
    """People, teams, and who leads each — from the project's own roster file."""
    path = repo_root / ".sdlc" / "team.yaml"
    section = {"file": _rel(repo_root, path), "present": path.exists(),
               "teams": [], "people": [], "errors": []}
    if not path.exists():
        return section

    try:
        roster = vt.load_yaml(path)
    except Exception as e:  # noqa: BLE001 - a malformed roster is reported, never fatal
        section["errors"] = [str(e)]
        return section

    # The validator takes the schema it validates against — loaded from the module that
    # owns it, never re-described here.
    section["errors"] = vt.validate_team(roster, vt.load_yaml(vt.SCHEMA_PATH)) or []
    section["teams"] = roster.get("teams") or []
    section["people"] = roster.get("people") or []
    return section


def read_wip_limits(repo_root: Path) -> dict:
    """Each team's limit, alongside how many specs that team actually has in flight — the
    two numbers are only meaningful together, and a screen showing one without the other
    invites the reader to supply the missing half from memory."""
    path = cp.resolve_cadence_plan_path(repo_root)
    section = {"file": _rel(repo_root, path), "present": path.exists(),
               "teams": [], "errors": []}
    if not path.exists():
        return section

    limits, errors = cp.load_limits(repo_root)
    section["errors"] = errors or []

    specs_dir = repo_root / "specs"
    in_flight: dict[str, int] = {}
    if specs_dir.is_dir():
        summary = ts.summarize(ts.scan_specs(specs_dir))
        in_flight = ts.team_in_flight_counts(summary["in_flight"])

    section["teams"] = [
        {"team": team,
         "wip_limit": entry["wip_limit"],
         "in_flight": in_flight.get(team, 0),
         "at_limit": in_flight.get(team, 0) == entry["wip_limit"],
         "over_limit": in_flight.get(team, 0) > entry["wip_limit"],
         **{k: v for k, v in entry.items() if k != "wip_limit"}}
        for team, entry in sorted(limits.items())
    ]
    return section


def read_approval(repo_root: Path) -> dict:
    """Which stages need a named person's approval before a signed-off document changes."""
    path = repo_root / ".sdlc" / "approval-settings.yaml"
    section = {"file": _rel(repo_root, path), "present": path.exists(),
               "stages": [], "errors": []}
    if not path.exists():
        return section

    settings, errors = aps.parse_approval_settings(
        path.read_text(encoding="utf-8"),
        set(vt.people_handles(vt.load_yaml(repo_root / ".sdlc" / "team.yaml")))
        if (repo_root / ".sdlc" / "team.yaml").exists() else None,
    )
    section["errors"] = errors or []
    section["stages"] = [
        {"stage": stage, **entry} for stage, entry in sorted(settings.items())
    ]
    return section


# The rules a person cannot change here, stated so the screen can show them as fixed.
#
# Each one says plainly WHERE it is enforced, because spec 0012's own amendment makes the
# point: a settings screen listing an unenforced rule as a fact tells someone they are
# protected by something that is not there. Every entry below names real, checkable
# enforcement — and the risk-tier one is worded as what the system actually does (records
# who decided) rather than what an earlier draft wished it did (restricts who may decide).
FIXED_RULES = [
    {"rule": "Nobody checks their own work.",
     "enforced_by": "handoff.py refuses a developer who is also the spec's checker."},
    {"rule": "Lowering a risk tier is recorded against whoever decided it.",
     "enforced_by": "spec_transition.py refuses to lower a tier without a named person, "
                    "and writes that name into the spec."},
    {"rule": "A high-risk change needs a security pass and a named sign-off.",
     "enforced_by": "risk_model.py sets the checking ladder by tier; check_spec.py refuses a "
                    "spec whose Checking Plan is shallower than its tier requires."},
    {"rule": "A spec cannot be handed off until it is ready.",
     "enforced_by": "handoff.py runs the full Definition of Ready and refuses on any failure."},
]


def read_settings(repo_root: Path) -> dict:
    return {
        "ok": True,
        "repo": str(repo_root),
        "roster": read_roster(repo_root),
        "wip_limits": read_wip_limits(repo_root),
        "approval": read_approval(repo_root),
        "fixed_rules": FIXED_RULES,
    }


def format_report(result: dict) -> str:
    lines = []
    for key, title in (("roster", "People"), ("wip_limits", "Build limits"), ("approval", "Change approval")):
        section = result[key]
        lines.append(f"{title}  ({section['file']})")
        if not section["present"]:
            lines.append("  Not configured for this project.")
        for e in section["errors"]:
            lines.append(f"  ERROR {e}")
        if key == "roster" and section["present"]:
            lines.append(f"  {len(section['people'])} people across {len(section['teams'])} team(s)")
        if key == "wip_limits":
            for t in section["teams"]:
                mark = " OVER LIMIT" if t["over_limit"] else (" at limit" if t["at_limit"] else "")
                lines.append(f"  {t['team']:<16} {t['in_flight']} / {t['wip_limit']}{mark}")
        if key == "approval":
            for st in section["stages"]:
                lines.append(f"  {st['stage']:<16} {'required' if st.get('approval_required') else 'not required'}"
                             f"{' — ' + st['approver'] if st.get('approver') else ''}")
        lines.append("")
    lines.append("Fixed here (change these in the playbook, not the project):")
    for r in result["fixed_rules"]:
        lines.append(f"  - {r['rule']}")
    return "\n".join(lines)


def resolve_repo_root(args) -> Path:
    if args.state:
        state = Path(args.state)
        if not state.exists():
            print(f"Error: State file not found: {state}", file=sys.stderr)
            sys.exit(1)
        return state.resolve().parent.parent
    return Path(args.repo).resolve()


def main():
    parser = argparse.ArgumentParser(
        description="Every project setting and the file that owns it (read-only; always exits 0)")
    src = parser.add_mutually_exclusive_group()
    src.add_argument("--state", help="Path to .sdlc/state.yaml (workflow mode)")
    src.add_argument("--repo", default=".", help="Target repo root (standalone mode; default: cwd)")
    parser.add_argument("--json", action="store_true", help="Emit the settings as JSON")
    args = parser.parse_args()

    result = read_settings(resolve_repo_root(args))
    print(json.dumps(result, indent=2) if args.json else format_report(result))


if __name__ == "__main__":
    main()
