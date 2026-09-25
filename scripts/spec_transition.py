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
import risk_model as rm
import spec_readiness as sr


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
    pattern = rf"^{re.escape(field)}:.*$"
    if not re.search(pattern, fm_block, flags=re.MULTILINE):
        if not add_if_missing:
            raise TransitionError(f"Spec frontmatter has no `{field}` field", "malformed")
        # Appended to the end of the block, which is where a reader looks for a field that was
        # added later anyway.
        eol = "\r\n" if "\r\n" in fm_block else "\n"
        return fm_block.rstrip("\r\n") + eol + f"{field}: {value}" + rest
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

    spec_path.write_text(updated, encoding="utf-8")
    return {"ok": True, "changed": True, "risk": new_tier, "lowered": lowering,
            "authorised_by": authorised_by.strip() if lowering else None,
            "message": f"Risk tier set to {new_tier}."
                       + (f", lowered from {current} on {authorised_by.strip()}'s authority." if lowering else "")}


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
    parser = argparse.ArgumentParser(description="The three spec transitions a person makes by hand")
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

    args = parser.parse_args()
    spec_path = Path(args.spec)

    try:
        if not spec_path.exists():
            raise TransitionError(f"Spec not found: {spec_path}", "not_found")
        if args.action == "ready":
            result = mark_ready(spec_path, resolve_roster(args))
        elif args.action == "defer":
            result = defer(spec_path, args.reason)
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
