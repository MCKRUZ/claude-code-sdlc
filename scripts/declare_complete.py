"""Can Build be declared finished — and if not, exactly why (spec 0014).

A declaration is the one moment in this system where somebody says "we are done" out loud, in
writing, with their name on it. Everything below exists so that sentence is true when it is
said.

Three refusals, and each names what is outstanding rather than just saying no. A refusal a
person cannot act on is a wall; a refusal that lists the four specs and who is building each is
a to-do list.

  unfinished specs      Every spec must be merged or deferred. One that is neither is work
                        somebody still intends to do, and declaring over it means the
                        declaration is false the moment it is made.
  unconfirmed teams     Each team with a spec in the list confirms its own. The project owner
                        declares; the leads confirm what they are confirming. One person
                        asserting on behalf of four teams is a signature, not a check.
  no declaring person   A declaration with no name on it is an announcement nobody made.

WHY THE PLUGIN AND NOT THE SCREEN: the same reason every other rule in this system lives here.
A declaration refused only by an application is refused only until somebody edits the state
file, and this is the single most consequential write in the product.

What this does NOT decide is which specs "should" have been finished. It reports what the
backlog says. A spec deferred with a reason is a decision somebody made and recorded; this
counts it as decided, and does not second-guess it.

`check` is read-only and always exits 0. `declare` is the write, and it refuses before writing.

Standalone or Workflow:
  - Standalone: --repo <path>
  - Workflow:   --state <path>/.sdlc/state.yaml
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import track_specs as ts

# A spec in one of these has been decided: built, or deliberately not built with a reason.
DECIDED = ("merged", "deferred")

# What track_specs.py calls a spec with no team. It is NOT a team — nobody leads it, so nobody
# can confirm its list, and treating it as one would produce a confirmation request addressed to
# nobody. Caught while running this rather than reading it.
NO_TEAM = "unassigned"


class DeclarationError(Exception):
    def __init__(self, message: str, kind: str = "other"):
        super().__init__(message)
        self.kind = kind


def _specs(repo_root: Path) -> tuple[list[dict], list[str], bool]:
    """The specs, the spec FILES that could not be read, and whether specs/ was readable at all.

    The middle value is the whole point. `scan_specs` silently skips a file whose frontmatter is
    missing or unclosed — right for a tracker, and wrong here: a skipped spec appears in neither
    the unfinished list nor the team list, so it raises no blocker and requests no confirmation,
    and the declaration goes through as if it did not exist. Unreadable is not finished, and an
    empty answer from a directory that could not be read is not "nothing left to build".
    """
    specs_dir = repo_root / "specs"
    if not specs_dir.is_dir():
        return [], [], False
    files = sorted(p.name for p in specs_dir.glob("*.md") if p.name.lower() != "readme.md")
    specs = ts.scan_specs(specs_dir)
    # scan_specs does not say WHICH files it dropped, so the difference is taken by name — each
    # record carries the path it was read from.
    seen = {Path(str(s.get("path", ""))).name for s in specs}
    unreadable = [f for f in files if f not in seen]
    return specs, unreadable, True


def assess(repo_root: Path, confirmed_teams: dict[str, str] | None = None) -> dict:
    """Everything standing between this project and a declaration.

    Read-only. Returns the whole picture rather than the first problem, because a person about
    to end a phase wants the list, not a game of whack-a-mole.
    """
    confirmed_teams = confirmed_teams or {}
    specs, unreadable, specs_dir_ok = _specs(repo_root)

    unfinished = [
        {"spec": s.get("id", "????"), "name": s.get("name", ""), "status": s.get("status", ""),
         "team": s.get("team", ""), "developer": s.get("developer", "") or None,
         "risk": s.get("risk", "")}
        for s in specs if (s.get("status") or "").strip() not in DECIDED
    ]

    deferred = [
        {"spec": s.get("id", "????"), "name": s.get("name", ""), "team": s.get("team", ""),
         "reason": (s.get("deferred_reason") or "").strip()}
        for s in specs if (s.get("status") or "").strip() == "deferred"
    ]

    # Every team with a spec in the list — including one whose specs are all deferred, because
    # a lead confirming "none of mine were built, and here is why" is exactly the confirmation
    # worth having.
    teams_in_list = sorted({
        (s.get("team") or "").strip() for s in specs
        if (s.get("team") or "").strip() and (s.get("team") or "").strip() != NO_TEAM
    })
    unconfirmed = [t for t in teams_in_list if t not in confirmed_teams]

    # A spec with no team has no lead, so no confirmation can ever arrive for it. Reported as
    # its own blocker rather than folded into the team list, where it would have produced a
    # request addressed to nobody.
    teamless = [
        {"spec": s.get("id", "????"), "name": s.get("name", ""), "status": s.get("status", "")}
        for s in specs if (s.get("team") or "").strip() in ("", NO_TEAM)
    ]

    # A deferral whose reason went missing is reported separately from an unfinished spec: the
    # decision was made, the record of WHY was lost, and those need different fixes.
    deferred_without_reason = [d for d in deferred if not d["reason"]]

    blockers = []
    # These two go FIRST, and they are the only blockers here that are not about the work — they
    # are about whether the answer can be trusted at all. Every other check below reasons over
    # the specs that were read; if some could not be read, that reasoning is over a subset and
    # an empty result means "nothing was seen", which is not the same as "nothing is left".
    if not specs_dir_ok:
        blockers.append({
            "kind": "no_specs_directory",
            "count": 1,
            "message": "specs/ could not be read, so what Build contains is unknown — which is "
                       "not the same as Build containing nothing. Check the folder exists and "
                       "is readable before declaring anything about what is in it.",
        })
    if unreadable:
        blockers.append({
            "kind": "unreadable_specs",
            "count": len(unreadable),
            "message": f"{len(unreadable)} spec file(s) could not be read — their frontmatter is "
                       f"missing or not closed. A spec whose status cannot be determined is not "
                       f"evidence that it is finished, so it is counted as outstanding: "
                       f"{', '.join(unreadable)}.",
            "specs": [{"spec": "????", "name": f, "status": "unreadable"} for f in unreadable],
        })
    if unfinished:
        blockers.append({
            "kind": "unfinished_specs",
            "count": len(unfinished),
            "message": f"{len(unfinished)} spec(s) are neither merged nor deferred. Each one is "
                       f"work somebody still intends to do — finish it, or defer it with a reason.",
            "specs": unfinished,
        })
    if deferred_without_reason:
        blockers.append({
            "kind": "deferred_without_reason",
            "count": len(deferred_without_reason),
            "message": f"{len(deferred_without_reason)} deferred spec(s) have no reason recorded. "
                       f"A deferral without a reason cannot be told apart from an oversight.",
            "specs": deferred_without_reason,
        })
    if teamless:
        blockers.append({
            "kind": "specs_with_no_team",
            "count": len(teamless),
            "message": f"{len(teamless)} spec(s) belong to no team, so no lead can confirm them. "
                       f"Give each one a team, or the confirmation this declaration needs has "
                       f"nobody to come from.",
            "specs": teamless,
        })
    if unconfirmed:
        blockers.append({
            "kind": "unconfirmed_teams",
            "count": len(unconfirmed),
            "message": f"{len(unconfirmed)} team(s) have not confirmed their own list: "
                       f"{', '.join(unconfirmed)}. The owner declares; each lead confirms what "
                       f"they are confirming.",
            "teams": unconfirmed,
        })

    return {
        "ok": True,
        "can_declare": not blockers,
        "blockers": blockers,
        "unfinished": unfinished,
        "deferred": deferred,
        "teamless": teamless,
        "teams_in_list": teams_in_list,
        "confirmed_teams": confirmed_teams,
        "unreadable": unreadable,
        "totals": {"specs": len(specs), "unfinished": len(unfinished), "deferred": len(deferred),
                   "unreadable": len(unreadable)},
    }


def declare(repo_root: Path, declared_by: str, confirmed_teams: dict[str, str]) -> dict:
    """Refuse, or report that a declaration is permitted.

    Deliberately does NOT advance the phase itself. advance_phase.py is protected core and
    already owns that transition, including its own gate checks and sign-off recording —
    wrapping it here would put a second opinion about when a phase may end next to the one
    that already exists. This answers "may Build be declared complete", and the caller runs
    the advance.
    """
    declared_by = (declared_by or "").strip()
    if not declared_by:
        raise DeclarationError(
            "A declaration needs the name of the person making it. An unnamed declaration is "
            "an announcement nobody made.", "no_declaring_person")

    result = assess(repo_root, confirmed_teams)
    if not result["can_declare"]:
        detail = " ".join(b["message"] for b in result["blockers"])
        raise DeclarationError(detail, result["blockers"][0]["kind"])

    return {
        "ok": True,
        "declared_by": declared_by,
        "confirmed_teams": confirmed_teams,
        "deferred": result["deferred"],
        "message": f"Build may be declared complete by {declared_by}.",
        "next_step": "Run advance_phase.py --confirmed --signed-by to move the project on; this "
                     "command does not advance it, because that transition already has an owner.",
    }


def _parse_confirmations(values: list[str] | None) -> dict[str, str]:
    """`team=@handle` pairs. A confirmation without a handle is refused rather than accepted as
    an anonymous yes — the point of a confirmation is whose it is."""
    out: dict[str, str] = {}
    for raw in values or []:
        if "=" not in raw:
            raise DeclarationError(
                f"'{raw}' is not a confirmation — expected team=@handle, so the confirmation "
                f"has a name attached to it.", "bad_confirmation")
        team, handle = raw.split("=", 1)
        team, handle = team.strip(), handle.strip()
        if not team or not handle:
            raise DeclarationError(
                f"'{raw}' is missing a team or a handle. A confirmation nobody is named for is "
                f"not a confirmation.", "bad_confirmation")
        out[team] = handle
    return out


def format_report(result: dict) -> str:
    if result["can_declare"]:
        lines = ["Build may be declared complete.", ""]
    else:
        lines = ["Build cannot be declared complete yet.", ""]
    for b in result["blockers"]:
        lines.append(f"  {b['message']}")
        for s in b.get("specs", []):
            who = s.get("developer") or "nobody assigned"
            lines.append(f"     {s['spec']} {s.get('name', '')} [{s.get('status', '')}] — {who}")
        lines.append("")
    if result["deferred"]:
        lines.append("Deferred, with reasons:")
        for d in result["deferred"]:
            lines.append(f"  {d['spec']} {d['name']}: {d['reason'] or '(no reason recorded)'}")
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
    parser = argparse.ArgumentParser(description="Can Build be declared finished, and if not why")
    src = parser.add_mutually_exclusive_group()
    src.add_argument("--state", help="Path to .sdlc/state.yaml (workflow mode)")
    src.add_argument("--repo", default=".", help="Target repo root (standalone mode; default: cwd)")
    parser.add_argument("--json", action="store_true", help="Emit the outcome as JSON")
    sub = parser.add_subparsers(dest="action", required=True)

    check = sub.add_parser("check", help="What stands between this project and a declaration")
    check.add_argument("--confirmed", action="append", metavar="TEAM=@HANDLE",
                       help="A team lead's confirmation of their own list (repeatable)")

    do = sub.add_parser("declare", help="Refuse, or report that a declaration is permitted")
    do.add_argument("--declared-by", required=True, metavar="NAME")
    do.add_argument("--confirmed", action="append", metavar="TEAM=@HANDLE",
                    help="A team lead's confirmation of their own list (repeatable)")

    args = parser.parse_args()
    repo_root = resolve_repo_root(args)

    try:
        confirmations = _parse_confirmations(args.confirmed)
        if args.action == "check":
            result = assess(repo_root, confirmations)
            print(json.dumps(result, indent=2) if args.json else format_report(result))
            return
        result = declare(repo_root, args.declared_by, confirmations)
    except DeclarationError as e:
        if args.json:
            print(json.dumps({"ok": False, "refusal": {"kind": e.kind, "message": str(e)}}, indent=2))
        else:
            print(f"Refused: {e}")
        sys.exit(1)

    print(json.dumps(result, indent=2) if args.json else
          f"{result['message']}\n  {result['next_step']}")


if __name__ == "__main__":
    main()
