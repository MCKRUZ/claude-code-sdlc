"""Validate a team roster YAML against the roster schema.

Mirrors validate_channel.py: a hand-rolled validator that loads templates/team/_schema.yaml
only to read its `required` list and hardcodes the rest of the rules. A roster maps the
people who may hold a role on a spec (owner, developer, checker, lead, security) to their
code-host handles and teams. It is read by check_spec.py — advisory-when-absent, blocking
when present, see that script — and by Studio's people screen (spec 0012). It never decides
WHO may approve a change; that stays with branch protection on the code host.

Usage:
  uv run scripts/validate_team.py .sdlc/team.yaml [<roster.yaml> ...]

Underscore-prefixed files (_schema, _template) are skipped. Exit 1 on any validation error.
"""

import sys
from pathlib import Path

import yaml

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "templates" / "team" / "_schema.yaml"

ROLES = ["owner", "developer", "checker", "lead", "security"]


def load_yaml(path: Path) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def _nonempty_str(value) -> bool:
    return isinstance(value, str) and value.strip() != ""


def people_handles(roster: dict) -> set[str]:
    """Every handle in the roster's people list. Empty set if the roster is malformed."""
    people = roster.get("people") if isinstance(roster, dict) else None
    if not isinstance(people, list):
        return set()
    return {p["handle"] for p in people if isinstance(p, dict) and _nonempty_str(p.get("handle"))}


def team_names(roster: dict) -> set[str]:
    """Every team name in the roster. Empty set if the roster is malformed."""
    teams = roster.get("teams") if isinstance(roster, dict) else None
    if not isinstance(teams, list):
        return set()
    return {t["name"] for t in teams if isinstance(t, dict) and _nonempty_str(t.get("name"))}


def validate_team(roster: dict, schema: dict) -> list[str]:
    errors: list[str] = []

    if not isinstance(roster, dict):
        return ["Root: roster must be a YAML mapping"]

    # Required top-level fields (the ONLY thing consulted from the schema).
    for field in schema.get("required", []):
        if field not in roster:
            errors.append(f"Root: missing required field '{field}'")

    people = roster.get("people")
    teams = roster.get("teams")

    # --- people: shape, valid roles, duplicate handles ---
    seen_handles: dict[str, int] = {}
    if isinstance(people, list):
        for i, person in enumerate(people):
            ctx = f"people[{i}]"
            if not isinstance(person, dict):
                errors.append(f"{ctx}: expected object")
                continue

            handle = person.get("handle")
            if not _nonempty_str(handle):
                errors.append(f"{ctx}.handle: missing or empty")
            elif handle in seen_handles:
                errors.append(f"{ctx}: duplicate handle '{handle}' (first seen at people[{seen_handles[handle]}])")
            else:
                seen_handles[handle] = i

            if not _nonempty_str(person.get("name")):
                errors.append(f"{ctx}.name: missing or empty")
            if not _nonempty_str(person.get("team")):
                errors.append(f"{ctx}.team: missing or empty")

            roles = person.get("roles")
            if not isinstance(roles, list) or not roles:
                errors.append(f"{ctx}.roles: must be a non-empty array")
            else:
                for role in roles:
                    if role not in ROLES:
                        errors.append(f"{ctx}.roles: '{role}' is not a valid role ({', '.join(ROLES)})")
    elif people is not None:
        errors.append("people: expected array")

    # --- teams: shape, and every team must resolve to a real lead ---
    if isinstance(teams, list):
        for i, team in enumerate(teams):
            ctx = f"teams[{i}]"
            if not isinstance(team, dict):
                errors.append(f"{ctx}: expected object")
                continue

            name = team.get("name")
            if not _nonempty_str(name):
                errors.append(f"{ctx}.name: missing or empty")

            lead = team.get("lead")
            if not _nonempty_str(lead):
                errors.append(f"{ctx}: team '{name}' has no lead")
            elif isinstance(people, list):
                leads = [
                    p for p in people
                    if isinstance(p, dict)
                    and p.get("handle") == lead
                    and p.get("team") == name
                    and isinstance(p.get("roles"), list)
                    and "lead" in p["roles"]
                ]
                if not leads:
                    errors.append(
                        f"{ctx}: lead '{lead}' is not a person on team '{name}' with the 'lead' role"
                    )
    elif teams is not None:
        errors.append("teams: expected array")

    return errors


def main():
    paths = sys.argv[1:]
    if not paths:
        print("Usage: validate_team.py <team.yaml> [<team.yaml> ...]")
        sys.exit(1)

    schema = load_yaml(SCHEMA_PATH)
    had_error = False

    for arg in paths:
        roster_path = Path(arg)
        if not roster_path.exists():
            print(f"FAIL — {roster_path}: not found")
            had_error = True
            continue
        if roster_path.stem.startswith("_"):
            print(f"SKIP — {roster_path.name} (underscore-prefixed; not a roster)")
            continue

        roster = load_yaml(roster_path)
        errors = validate_team(roster, schema)

        if errors:
            had_error = True
            print(f"FAIL — {roster_path.name}: {len(errors)} validation error(s):")
            for e in errors:
                print(f"  - {e}")
        else:
            print(f"PASS — {roster_path.name} is valid")

    sys.exit(1 if had_error else 0)


if __name__ == "__main__":
    main()
