"""The spec transitions a person makes by hand, each carrying its own rule (specs 0011, 0014).

Both of these change a spec's frontmatter, which nothing outside `handoff.py` could do — so
without this, an application wanting to offer either would have to edit the file itself, and
the rule would then live in that application. A rule enforced only in an app is one that
anyone editing the file directly walks straight around.

Deliberately NOT a generic "set any frontmatter field" command. Every other write in this
system carries a rule with it: handoff refuses a spec that is not ready, spec_status writes
`merged` only once a pull request actually merged. A generic setter would be the one write
path with no rule attached, and it would quietly become how everything gets changed.

  ready   Refuses unless the Definition of Ready passes — the same check, from the same
          module, that handoff.py uses. This is the acceptance check "a spec cannot be
          marked ready until every readiness item passes", enforced rather than displayed.

  risk    A tier may always be RAISED. LOWERING one requires --authorised-by, and that name
          is written into the spec beside the tier. There is no list of who may authorise a
          downgrade, and this does not invent one: the rule is that a downgrade is
          attributable, not that it is permitted only to certain people. Making it a matter
          of record is what this system can honestly enforce.

  defer   Requires a reason, in the person's own words, and refuses a token one — "later" and
          "n/a" pass a non-empty check while answering nothing. A deferred spec with no real
          reason cannot be told apart from one somebody forgot, and the difference matters
          most when a stakeholder asks why something they expected is not there. A merged spec
          cannot be deferred: it was built, and recording otherwise makes the backlog a worse
          record than none.

  confirm-tier   The agent proposes a tier; a PERSON confirms it (CLAUDE.md: "The agent proposes
          the risk tier; a human confirms it"). Until now a tier left as proposed was unrecorded —
          only a CHANGE was. This writes `risk_confirmed_by:` with the confirmer's name
          (`add_if_missing`, the `deferred_reason` precedent, because the protected spec template
          can never carry the key: "unconfirmed" means the key is absent or empty). Refuses an AI
          name — the same regex the findings ledger uses to stop an AI signing off its own work.
          Idempotent. `risk` CLEARS the confirmation whenever the tier changes: a confirmation of
          HIGH says nothing about MEDIUM.

  assign  Set `developer:` and/or `checker:` without starting a build. Refuses a handle the
          roster does not list (when there is a roster), the developer being their own checker
          (the hand-off rule, one constant shared with handoff.py), and a developer change on a
          spec already in flight or merged — the branch names who is building it, not this file.
          A checker may always change. Needs `--by`, a named human, for the record.

Writes the file in place and nothing else — no commit, no branch, no push. Saving belongs to
whoever called this, which for Studio is spec 0009's save.

Standalone or Workflow:
  - Standalone: --spec path/to/specs/NNNN-name.md
  - Workflow:   --spec ... --state .sdlc/state.yaml (roster cross-check in the ready check)
"""

import argparse
import json
import re
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_spec as cs
import findings_model as fmodel
import risk_model as rm
import spec_readiness as sr
import validate_team as vt
from handoff import SELF_CHECK_MESSAGE

CONFIRMED_BY_FIELD = "risk_confirmed_by"


class TransitionError(Exception):
    """A refusal. Raised before the file is touched, so a refused transition leaves the
    spec exactly as it was."""

    def __init__(self, message: str, kind: str = "other"):
        super().__init__(message)
        self.kind = kind


def _split_frontmatter(text: str) -> tuple[str, str]:
    """The frontmatter block and everything after it — so a body line that happens to start
    with `risk:` is never mistaken for the field."""
    if not text.startswith("---"):
        raise TransitionError("Spec has no frontmatter block", "malformed")
    end = text.find("\n---", 3)
    if end == -1:
        raise TransitionError("Spec frontmatter block is not closed", "malformed")
    return text[:end], text[end:]


def _yaml_scalar(value: str) -> str:
    """Quote a value the way YAML says to, rather than by wrapping it in `"` and hoping.

    Hand-quoting is how a reason containing a quote character produced a file that no longer
    parsed as what its author wrote. This asks the serializer instead.

    Always quoted, even where YAML would allow a bare scalar: the shipped spec template writes
    `deferred_reason: ""`, so a real reason keeps the shape of the empty one it replaces, and a
    bare scalar that happens to read as a number, a date or `no` would come back as that type
    rather than as the sentence somebody typed.

    WHICH quote is chosen per value, and that is not fussiness. The plugin's own frontmatter
    reader (`check_spec.parse_frontmatter`) strips the surrounding quotes but does not process
    escapes, so whichever character the serializer had to escape shows up as a backslash in
    every place the reason is later displayed. Single-quoted YAML has no backslash escapes at
    all, so it is the faithful choice for the common case — somebody quoting a client, or
    pasting a Windows path. Double quotes are used only when the value itself contains a single
    quote, where single-quoting would be the lossy one. A value containing both is written
    correctly and displays one escape; there is no style that avoids that, and correct YAML is
    the half worth keeping.
    """
    style = '"' if ("'" in value and '"' not in value) else "'"
    rendered = yaml.safe_dump(
        value, default_flow_style=True, allow_unicode=True, default_style=style).strip()
    if rendered.endswith("..."):
        rendered = rendered[:-3].strip()
    return rendered


def set_frontmatter_field(text: str, field: str, value: str, add_if_missing: bool = False) -> str:
    """Replace one frontmatter field, leaving every other byte alone.

    `add_if_missing` exists for a real case rather than a hypothetical one: a spec written
    before a field was added to the template, or written by hand, simply does not have it.
    Refusing to defer such a spec would be the tool being brittle about its own schema — the
    person is trying to record why something was not built, and "your file predates a field I
    want" is not a reason to stop them. Fields that MUST already exist (status, risk) keep the
    refusal, because their absence means the frontmatter is genuinely malformed.
    """
    # One field is one line. A value carrying a line break would not be "a long value" — the
    # frontmatter parser is line-based and last-key-wins, so the second line lands as a SEPARATE
    # FIELD. That is how a deferral reason typed into a text box silently rewrites `risk` and
    # `status`, walking straight around the authorisation rule this module exists to enforce.
    # Refused rather than escaped: a reason with a newline in it is a person misusing a
    # one-line field, and telling them so is better than quietly reshaping what they wrote.
    if any(c in str(value) for c in "\r\n"):
        raise TransitionError(
            f"A `{field}` value cannot contain a line break — one field is one line, and a "
            f"second line would be read as a different field entirely.", "bad_value")

    fm_block, rest = _split_frontmatter(text)
    # `[^\r\n]*`, not `.*$`: in a CRLF file `.` also matches the "\r", so the old pattern swallowed
    # it and left a bare LF in the middle of an otherwise-CRLF file.
    pattern = rf"^{re.escape(field)}:[^\r\n]*"
    if not re.search(pattern, fm_block, flags=re.MULTILINE):
        if not add_if_missing:
            raise TransitionError(f"Spec frontmatter has no `{field}` field", "malformed")
        # Appended to the end of the block, which is where a reader looks for a field that was
        # added later anyway.
        eol = "\r\n" if "\r\n" in fm_block else "\n"
        # `rest` starts at the closing fence's "\n"; in a CRLF file the "\r" before it belongs to
        # the line just appended, or that line would end in a bare LF.
        return fm_block.rstrip("\r\n") + eol + f"{field}: {value}" + ("\r" if eol == "\r\n" else "") + rest
    # A LAMBDA replacement, not a template string: re.sub expands `\n`, `\1` and friends inside
    # a replacement template, so a literal backslash in a value would become something else
    # entirely (and `\` at the end raises). A callable returns the string as written.
    return re.sub(pattern, lambda _m: f"{field}: {value}", fm_block, count=1,
                  flags=re.MULTILINE) + rest


def mark_ready(spec_path: Path, roster_path: Path | None = None) -> dict:
    """Set `status: ready`, but only if the spec actually is."""
    text = spec_path.read_text(encoding="utf-8")
    fm, _ = cs.parse_frontmatter(text)
    current = (fm.get("status") or "").strip() if fm else ""

    if current == "ready":
        return {"ok": True, "changed": False, "status": "ready",
                "message": "Already ready. Nothing changed."}
    if current in ("in-flight", "merged"):
        raise TransitionError(
            f"This spec is already {current} — going back to ready is not a transition this "
            f"makes. Raise a new spec instead.", "already_past_ready")

    readiness = sr.readiness(spec_path, roster_path)
    if not readiness["ok"]:
        raise TransitionError(readiness["error"], "unreadable")
    if not readiness["ready"]:
        detail = "; ".join(f["message"] for f in readiness["blocking"])
        raise TransitionError(
            f"Not ready ({len(readiness['blocking'])} blocking issue(s)): {detail}", "not_ready")

    spec_path.write_text(set_frontmatter_field(text, "status", "ready"), encoding="utf-8")
    return {"ok": True, "changed": True, "status": "ready",
            "message": "Marked ready.", "advisory_count": len(readiness["advisory"])}


def defer(spec_path: Path, reason: str) -> dict:
    """Set `status: deferred` with a reason, for a spec Build is ending without.

    The reason is the whole point, and it is required. A deferred spec with no reason is
    indistinguishable from one somebody forgot about — and the difference matters most later,
    when a stakeholder asks why something they expected is not there. `check_spec.py` already
    treats a missing reason as a blocking failure; refusing here means the file never reaches
    that state rather than being written and then reported as broken.

    A merged spec cannot be deferred: it is already built, and recording otherwise would make
    the backlog a worse record than no record.
    """
    reason = (reason or "").strip()
    # Checked on what the PERSON typed, before the serializer gets it. The serializer would
    # escape a line break into a visible `\n` rather than let it through, so this is not the
    # safety guard — `set_frontmatter_field` is. It is here so the answer is "a reason is one
    # line, say it in one" instead of a reason that silently comes back looking mangled.
    if any(c in reason for c in "\r\n"):
        raise TransitionError(
            "A reason is one line. Yours has a line break in it — say it in a single sentence "
            "so it reads the same everywhere it is shown.", "reason_multiline")
    if not reason:
        raise TransitionError(
            "Deferring a spec needs a reason in your own words. A deferred spec with no reason "
            "cannot be told apart from one somebody forgot, and the difference matters when "
            "someone asks why this was not built.", "reason_required")
    if len(reason) < 10:
        # Not a style rule. "later", "n/a" and "no time" all pass a non-empty check and none of
        # them answers the question a reader will actually have.
        raise TransitionError(
            f"'{reason}' is too short to be a reason. Say what made this not worth building "
            f"now, so the answer survives without you in the room.", "reason_too_short")

    text = spec_path.read_text(encoding="utf-8")
    fm, _ = cs.parse_frontmatter(text)
    current = (fm.get("status") or "").strip() if fm else ""

    if current == "merged":
        raise TransitionError(
            "This spec is already merged — it was built. Deferring it would make the backlog a "
            "worse record than none.", "already_merged")
    if current == "deferred":
        return {"ok": True, "changed": False, "status": "deferred",
                "message": "Already deferred. Nothing changed."}

    updated = set_frontmatter_field(text, "status", "deferred")
    updated = set_frontmatter_field(updated, "deferred_reason", _yaml_scalar(reason),
                                    add_if_missing=True)
    spec_path.write_text(updated, encoding="utf-8")

    return {"ok": True, "changed": True, "status": "deferred", "reason": reason,
            "message": f"Deferred: {reason}",
            "note": "A deferred spec no longer counts towards its team's work in progress."}


def _tier_rank(tier: str) -> int:
    """How much risk a tier represents — HIGHER number means MORE risk.

    risk_model.RISK_TIERS is ordered ("HIGH", "MEDIUM", "LOW"), i.e. most-risky FIRST, so a
    plain index() ranks them backwards. Reading the index as severity is exactly the mistake
    that let a HIGH-to-LOW downgrade through with no name attached the first time this ran,
    which is why the direction is spelled out here instead of inferred."""
    return len(rm.RISK_TIERS) - 1 - list(rm.RISK_TIERS).index(tier)


def set_risk(spec_path: Path, new_tier: str, authorised_by: str | None = None) -> dict:
    """Change the risk tier. Raising is free; lowering must be attributable."""
    new_tier = new_tier.upper().strip()
    if new_tier not in rm.RISK_TIERS:
        raise TransitionError(
            f"'{new_tier}' is not a risk tier — expected one of {', '.join(rm.RISK_TIERS)}",
            "unknown_tier")

    text = spec_path.read_text(encoding="utf-8")
    fm, _ = cs.parse_frontmatter(text)
    current = (fm.get("risk") or "").strip().upper() if fm else ""

    if current == new_tier:
        return {"ok": True, "changed": False, "risk": new_tier,
                "message": f"Already {new_tier}. Nothing changed."}

    lowering = current in rm.RISK_TIERS and _tier_rank(new_tier) < _tier_rank(current)
    if lowering and not (authorised_by or "").strip():
        raise TransitionError(
            f"Lowering the risk tier from {current} to {new_tier} needs a named person. A tier "
            f"may always be raised; lowering one changes how hard this change is checked, so "
            f"it is recorded against whoever decided it. Use --authorised-by \"<name>\".",
            "lowering_needs_authorisation")

    updated = set_frontmatter_field(text, "risk", new_tier)
    if lowering:
        # Written into the BODY, beside the reasoning, because that is where a person reading
        # the spec will look for why the tier is what it is — not into frontmatter, where it
        # would be a field nothing else knows about.
        updated = _note_downgrade(updated, current, new_tier, authorised_by.strip())

    # A confirmation names a TIER. Once the tier is different the confirmation is of something
    # that no longer stands, so it is cleared (set to the template's empty shape, not deleted)
    # and the caller is told — a card that showed "confirmed by Priya" must stop showing it.
    confirmed_by = (fm.get(CONFIRMED_BY_FIELD) or "").strip() if fm else ""
    if confirmed_by:
        updated = set_frontmatter_field(updated, CONFIRMED_BY_FIELD, '""')

    spec_path.write_text(updated, encoding="utf-8")
    return {"ok": True, "changed": True, "risk": new_tier, "lowered": lowering,
            "authorised_by": authorised_by.strip() if lowering else None,
            "confirmation_cleared": bool(confirmed_by),
            "message": f"Risk tier set to {new_tier}."
                       + (f", lowered from {current} on {authorised_by.strip()}'s authority." if lowering else "")
                       + (f" The {current} confirmation by {confirmed_by} no longer applies and was cleared."
                          if confirmed_by else "")}


def _require_person(name: str | None, flag: str) -> str:
    """A named human, or a refusal. The AI regex is the findings ledger's (`findings_model`), so
    the same name is refused at a sign-off and at a tier confirmation. Labelling, not a lock:
    it cannot verify identity, only refuse the obvious."""
    clean = (name or "").strip()
    if not clean:
        raise TransitionError(f"{flag} is required — a named human, not a role or a blank", "not_a_person")
    if fmodel.is_ai_actor(clean):
        raise TransitionError(
            f"{flag} '{clean}' reads as an AI/automation, not a named human. A person confirms a tier "
            f"or assigns a role; an agent may not be that name.", "not_a_person")
    return clean


def confirm_tier(spec_path: Path, by: str | None) -> dict:
    """Record that a PERSON confirmed the tier as written. Idempotent; never changes the tier."""
    by = _require_person(by, "--by")
    text = spec_path.read_text(encoding="utf-8")
    fm, _ = cs.parse_frontmatter(text)
    if not fm:
        raise TransitionError("Spec has no parseable frontmatter", "malformed")
    tier = rm.normalize_tier(fm.get("risk"))
    if tier is None:
        raise TransitionError(
            f"'{(fm.get('risk') or '').strip()}' is not a risk tier — nothing to confirm. "
            f"Expected one of {', '.join(rm.RISK_TIERS)}", "unknown_tier")

    existing = (fm.get(CONFIRMED_BY_FIELD) or "").strip()
    if existing:
        return {"ok": True, "changed": False, "risk": tier, "confirmed_by": existing,
                "message": f"{tier} was already confirmed by {existing}. Nothing changed."}

    updated = set_frontmatter_field(text, CONFIRMED_BY_FIELD, _yaml_scalar(by), add_if_missing=True)
    spec_path.write_text(updated, encoding="utf-8")
    return {"ok": True, "changed": True, "risk": tier, "confirmed_by": by,
            "message": f"{tier} tier confirmed by {by}."}


def _handle_value(handle: str, flag: str) -> str:
    """A roster handle as a one-line, double-quoted frontmatter value — the shape handoff.py
    writes for `developer`, so the two writers leave the same bytes."""
    clean = (handle or "").strip()
    if not clean:
        raise TransitionError(f"{flag} needs a handle, e.g. @sam-k", "bad_value")
    if '"' in clean or any(c in clean for c in "\r\n#"):
        raise TransitionError(f"{flag} '{clean}' is not a handle — no quotes, hashes or line breaks", "bad_value")
    return clean


def assign(spec_path: Path, developer: str | None = None, checker: str | None = None,
           roster_path: Path | None = None) -> dict:
    """Set `developer` and/or `checker` on a spec, under the hand-off's own rules."""
    if developer is None and checker is None:
        raise TransitionError("assign needs --developer and/or --checker", "nothing_to_assign")
    new_dev = _handle_value(developer, "--developer") if developer is not None else None
    new_chk = _handle_value(checker, "--checker") if checker is not None else None

    text = spec_path.read_text(encoding="utf-8")
    fm, _ = cs.parse_frontmatter(text)
    if not fm:
        raise TransitionError("Spec has no parseable frontmatter", "malformed")
    status = (fm.get("status") or "").strip()
    cur_dev = (fm.get("developer") or "").strip()
    cur_chk = (fm.get("checker") or "").strip()

    if roster_path is not None and roster_path.exists():
        handles = vt.people_handles(vt.load_yaml(roster_path))
        for handle, kind in ((new_dev, "unknown_developer"), (new_chk, "unknown_checker")):
            if handle is not None and handle not in handles:
                raise TransitionError(f"'{handle}' is not listed in the roster ({roster_path})", kind)

    final_dev = new_dev if new_dev is not None else cur_dev
    final_chk = new_chk if new_chk is not None else cur_chk
    if final_dev and final_dev == final_chk:
        raise TransitionError(SELF_CHECK_MESSAGE.format(developer=final_dev), "developer_is_checker")
    if new_dev is not None and new_dev != cur_dev and status in ("in-flight", "merged"):
        raise TransitionError(
            f"This spec is {status} — its branch names who is building it, and this file cannot "
            f"change that. A new developer is a new hand-off.", "already_in_flight")

    if final_dev == cur_dev and final_chk == cur_chk:
        return {"ok": True, "changed": False, "developer": cur_dev, "checker": cur_chk,
                "message": "Already assigned as asked. Nothing changed."}

    updated = text
    if new_dev is not None and new_dev != cur_dev:
        updated = set_frontmatter_field(updated, "developer", f'"{new_dev}"', add_if_missing=True)
    if new_chk is not None and new_chk != cur_chk:
        updated = set_frontmatter_field(updated, "checker", f'"{new_chk}"', add_if_missing=True)
    spec_path.write_text(updated, encoding="utf-8")
    parts = ([f"developer {final_dev}"] if new_dev is not None and new_dev != cur_dev else []) + \
            ([f"checker {final_chk}"] if new_chk is not None and new_chk != cur_chk else [])
    return {"ok": True, "changed": True, "developer": final_dev, "checker": final_chk,
            "message": "Assigned " + " and ".join(parts) + "."}


def _note_downgrade(text: str, was: str, now: str, who: str) -> str:
    note = (f"\n**Tier lowered from {was} to {now}, authorised by {who}.** "
            f"A lower tier means fewer checks; this records who decided that.\n")
    marker = "**Why this tier:**"
    idx = text.find(marker)
    if idx == -1:
        return text + note
    line_end = text.find("\n", idx)
    if line_end == -1:
        return text + note
    return text[:line_end + 1] + note + text[line_end + 1:]


def resolve_roster(args) -> Path | None:
    if args.state:
        state = Path(args.state)
        return state.parent / "team.yaml" if state.exists() else None
    for parent in Path(args.spec).resolve().parents:
        candidate = parent / ".sdlc" / "team.yaml"
        if candidate.exists():
            return candidate
    return None


def main():
    parser = argparse.ArgumentParser(description="The spec transitions a person makes by hand")
    parser.add_argument("--spec", required=True, help="Path to specs/NNNN-name.md")
    parser.add_argument("--state", help="Path to .sdlc/state.yaml (enables the roster cross-check)")
    parser.add_argument("--json", action="store_true", help="Emit the outcome as JSON")
    sub = parser.add_subparsers(dest="action", required=True)

    sub.add_parser("ready", help="Mark the spec ready — refused unless it actually is")

    risk = sub.add_parser("risk", help="Change the risk tier — lowering one needs a named person")
    risk.add_argument("tier", help=f"One of {', '.join(rm.RISK_TIERS)}")
    risk.add_argument("--authorised-by", default=None, metavar="NAME",
                      help="Required to LOWER a tier; written into the spec beside the reasoning")

    deferred = sub.add_parser("defer", help="Defer a spec Build is ending without — needs a reason")
    deferred.add_argument("--reason", required=True,
                          help="Why this was not built, in your own words — it outlives you being asked")

    confirm = sub.add_parser("confirm-tier",
                             help="A person confirms the risk tier as written (writes risk_confirmed_by)")
    confirm.add_argument("--by", required=True, metavar="NAME",
                         help="The named human confirming the tier — an AI name is refused")

    assigned = sub.add_parser("assign", help="Set developer and/or checker without starting a build")
    assigned.add_argument("--developer", default=None, metavar="HANDLE", help="Roster handle, e.g. @sam-k")
    assigned.add_argument("--checker", default=None, metavar="HANDLE",
                          help="Roster handle; may not be the developer")
    assigned.add_argument("--by", required=True, metavar="NAME", help="The named human making the assignment")

    args = parser.parse_args()
    spec_path = Path(args.spec)

    try:
        if not spec_path.exists():
            raise TransitionError(f"Spec not found: {spec_path}", "not_found")
        if args.action == "ready":
            result = mark_ready(spec_path, resolve_roster(args))
        elif args.action == "defer":
            result = defer(spec_path, args.reason)
        elif args.action == "confirm-tier":
            result = confirm_tier(spec_path, args.by)
        elif args.action == "assign":
            _require_person(args.by, "--by")
            result = assign(spec_path, args.developer, args.checker, resolve_roster(args))
        else:
            result = set_risk(spec_path, args.tier, args.authorised_by)
    except TransitionError as e:
        if args.json:
            print(json.dumps({"ok": False, "refusal": {"kind": e.kind, "message": str(e)}}, indent=2))
        else:
            print(f"Refused: {e}")
        sys.exit(1)

    print(json.dumps(result, indent=2) if args.json else result["message"])


if __name__ == "__main__":
    main()
