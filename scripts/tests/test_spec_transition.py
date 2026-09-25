"""Tests for spec_transition.py — the two spec transitions a person makes by hand (0011).

Both change frontmatter, and both carry a rule. The rules are the point: without them these
would be a generic "set any field" command, which would be the one write path in this system
with no rule attached and would quietly become how everything gets changed.
"""

from pathlib import Path

import pytest

import check_spec as cs
import risk_model as rm
import spec_transition as st

READY_SPEC = """\
---
spec: "0042"
name: "duplicate-claim"
status: draft
type: feature
risk: HIGH
owner: "@MCKRUZ"
team: "core"
harness_context: "the existing submission path"
created: "2026-09-24"
---

# Spec 0042 — Reject a duplicate claim

## Goal
Stop paying the same claim twice.

## Why
It has happened.

## Scope

### In scope
- The submission endpoint

### Out of scope
- Refunds

## Acceptance Checks
- [ ] A duplicate submission returns 409 with body `{ "error": "duplicate claim" }`

## Risk Tier

**Tier:** HIGH
**Why this tier:** it touches money movement.

## Delegation Plan
- **Scope (file patterns):** the claims service only
- **Context (pattern to reuse):** the existing submission path
- **Permissions:** build and test auto-allowed
- **Gated paths touched:** none

## Checking Plan

**Ladder depth:** HIGH
**Specifics:** the full ladder, with a named sign-off.

## Decision List
- None.
"""


def _spec(tmp_path, text=READY_SPEC):
    specs = tmp_path / "specs"
    specs.mkdir(exist_ok=True)
    path = specs / "0042-duplicate-claim.md"
    path.write_text(text, encoding="utf-8")
    return path


class TestTierRank:
    """The bug this class exists for: RISK_TIERS is ordered ("HIGH", "MEDIUM", "LOW") —
    most-risky FIRST — so reading a plain index() as severity ranks them backwards. The first
    run of this command let a HIGH-to-LOW downgrade through with nobody's name on it."""

    def test_high_outranks_medium_outranks_low(self):
        assert st._tier_rank("HIGH") > st._tier_rank("MEDIUM") > st._tier_rank("LOW")

    def test_matches_the_declared_order_whichever_way_it_is_written(self):
        # Derived from risk_model's own tuple, so reordering it there cannot silently invert
        # this without the test noticing.
        ranked = sorted(rm.RISK_TIERS, key=st._tier_rank)
        assert ranked[0] == "LOW" and ranked[-1] == "HIGH"


class TestSetRisk:
    def test_raising_needs_nobody(self, tmp_path):
        spec = _spec(tmp_path, READY_SPEC.replace("risk: HIGH", "risk: LOW"))
        result = st.set_risk(spec, "HIGH")
        assert result["ok"] and result["changed"] and result["lowered"] is False
        assert "risk: HIGH" in spec.read_text(encoding="utf-8")

    def test_LOWERING_without_a_name_is_REFUSED(self, tmp_path):
        spec = _spec(tmp_path)
        before = spec.read_text(encoding="utf-8")
        with pytest.raises(st.TransitionError) as e:
            st.set_risk(spec, "LOW")
        assert e.value.kind == "lowering_needs_authorisation"
        # Refused before the file is touched — a refused transition changes nothing.
        assert spec.read_text(encoding="utf-8") == before

    def test_lowering_one_step_is_still_lowering(self, tmp_path):
        spec = _spec(tmp_path)
        with pytest.raises(st.TransitionError):
            st.set_risk(spec, "MEDIUM")

    def test_lowering_with_a_name_is_allowed_and_recorded_in_the_body(self, tmp_path):
        spec = _spec(tmp_path)
        result = st.set_risk(spec, "LOW", "Matt K")
        text = spec.read_text(encoding="utf-8")
        assert result["lowered"] is True and result["authorised_by"] == "Matt K"
        assert "risk: LOW" in text
        # Beside the reasoning, where a person looks for why the tier is what it is.
        assert "Tier lowered from HIGH to LOW, authorised by Matt K" in text
        assert text.index("**Why this tier:**") < text.index("Tier lowered from HIGH")

    def test_a_whitespace_only_name_does_not_count(self, tmp_path):
        with pytest.raises(st.TransitionError):
            st.set_risk(_spec(tmp_path), "LOW", "   ")

    def test_the_same_tier_changes_nothing(self, tmp_path):
        spec = _spec(tmp_path)
        before = spec.read_text(encoding="utf-8")
        result = st.set_risk(spec, "HIGH")
        assert result["changed"] is False
        assert spec.read_text(encoding="utf-8") == before

    def test_an_unknown_tier_is_refused(self, tmp_path):
        with pytest.raises(st.TransitionError) as e:
            st.set_risk(_spec(tmp_path), "CRITICAL")
        assert e.value.kind == "unknown_tier"


class TestMarkReady:
    def test_a_ready_spec_becomes_ready(self, tmp_path):
        spec = _spec(tmp_path)
        result = st.mark_ready(spec)
        assert result["ok"] and result["changed"]
        assert "status: ready" in spec.read_text(encoding="utf-8")

    def test_an_unready_spec_is_REFUSED_and_untouched(self, tmp_path):
        spec = _spec(tmp_path, READY_SPEC.replace('owner: "@MCKRUZ"', 'owner: ""'))
        before = spec.read_text(encoding="utf-8")
        with pytest.raises(st.TransitionError) as e:
            st.mark_ready(spec)
        assert e.value.kind == "not_ready"
        assert "owner" in str(e.value)
        assert spec.read_text(encoding="utf-8") == before

    def test_already_ready_is_not_an_error(self, tmp_path):
        spec = _spec(tmp_path, READY_SPEC.replace("status: draft", "status: ready"))
        result = st.mark_ready(spec)
        assert result["ok"] and result["changed"] is False

    def test_going_BACKWARDS_from_in_flight_is_refused(self, tmp_path):
        # A spec someone is already building does not return to ready; that would silently
        # detach the work in progress from the thing that authorised it.
        spec = _spec(tmp_path, READY_SPEC.replace("status: draft", "status: in-flight"))
        with pytest.raises(st.TransitionError) as e:
            st.mark_ready(spec)
        assert e.value.kind == "already_past_ready"


class TestFrontmatterSafety:
    def test_only_the_frontmatter_block_is_touched(self, tmp_path):
        # A body line starting with the field name must never be mistaken for the field.
        text = READY_SPEC.replace("## Goal\nStop paying", "## Goal\nstatus: this is prose\nStop paying")
        spec = _spec(tmp_path, text)
        st.mark_ready(spec)
        after = spec.read_text(encoding="utf-8")
        assert "status: ready" in after.split("\n---", 1)[0]
        assert "status: this is prose" in after

    def test_a_spec_with_no_frontmatter_is_refused(self, tmp_path):
        spec = _spec(tmp_path, "# Just a heading\n")
        with pytest.raises(st.TransitionError) as e:
            st.set_risk(spec, "LOW", "Matt K")
        assert e.value.kind == "malformed"


class TestDefer:
    """Deferring a spec Build is ending without (spec 0014).

    The reason is the whole point. A deferred spec with no reason cannot be told apart from one
    somebody forgot about, and the difference matters most later — when a stakeholder asks why
    something they expected is not there and the only answer available is a shrug.
    """

    def test_a_real_reason_is_written_to_the_spec(self, tmp_path):
        spec = _spec(tmp_path)
        reason = "the upstream API it needs is not live until Q2"
        result = st.defer(spec, reason)
        text = spec.read_text(encoding="utf-8")
        assert result["ok"] and result["changed"]
        assert "status: deferred" in text
        assert cs.parse_frontmatter(text)[0]["deferred_reason"] == reason

    def test_no_reason_is_refused_and_the_spec_is_untouched(self, tmp_path):
        spec = _spec(tmp_path)
        before = spec.read_text(encoding="utf-8")
        for empty in ("", "   ", None):
            with pytest.raises(st.TransitionError) as e:
                st.defer(spec, empty)
            assert e.value.kind == "reason_required"
        assert spec.read_text(encoding="utf-8") == before

    def test_a_TOKEN_reason_is_refused(self, tmp_path):
        # Not a style rule. "later", "n/a" and "no time" all pass a non-empty check and none of
        # them answers the question a reader will actually have.
        for token in ("later", "n/a", "no time", "TBD"):
            with pytest.raises(st.TransitionError) as e:
                st.defer(_spec(tmp_path), token)
            assert e.value.kind == "reason_too_short", token

    def test_a_merged_spec_cannot_be_deferred(self, tmp_path):
        # It was built. Recording otherwise makes the backlog a worse record than none.
        spec = _spec(tmp_path, READY_SPEC.replace("status: draft", "status: merged"))
        with pytest.raises(st.TransitionError) as e:
            st.defer(spec, "we changed our minds about this one entirely")
        assert e.value.kind == "already_merged"

    def test_an_in_flight_spec_CAN_be_deferred(self, tmp_path):
        # Spec 0014 says every spec that is not merged is either finished first or deferred —
        # work already in progress is exactly the interesting case.
        spec = _spec(tmp_path, READY_SPEC.replace("status: draft", "status: in-flight"))
        assert st.defer(spec, "the team was pulled onto the incident and this can wait")["ok"]

    def test_deferring_twice_changes_nothing_the_second_time(self, tmp_path):
        spec = _spec(tmp_path)
        st.defer(spec, "the upstream API it needs is not live until Q2")
        again = st.defer(spec, "a different reason entirely, also long enough")
        assert again["ok"] and again["changed"] is False

    def test_the_result_says_it_leaves_work_in_progress(self, tmp_path):
        # True by construction — the tracker counts only in-flight — but a person making this
        # choice deserves to be told, since it is the practical consequence.
        result = st.defer(_spec(tmp_path), "the upstream API it needs is not live until Q2")
        assert "work in progress" in result["note"]

    def test_a_spec_with_NO_deferred_reason_field_still_defers(self, tmp_path):
        # A real case, not a hypothetical: a spec written before the field existed, or written
        # by hand, simply lacks it. Refusing would be the tool being brittle about its own
        # schema while somebody is trying to record why something was not built.
        assert "deferred_reason" not in READY_SPEC
        spec = _spec(tmp_path)
        reason = "the upstream API it needs is not live until Q2"
        st.defer(spec, reason)
        text = spec.read_text(encoding="utf-8")
        assert "status: deferred" in text
        # Asserted through the parser rather than as a literal string: the value is serialized,
        # so which quote character it wears is the serializer's business, and pinning the
        # rendered bytes here would be a test of formatting rather than of the record.
        assert cs.parse_frontmatter(text)[0]["deferred_reason"] == reason

    def test_a_MALFORMED_frontmatter_is_still_refused(self, tmp_path):
        # Adding a missing optional field is tolerance; inventing a whole frontmatter block is
        # not. status must already be there, or the file is genuinely malformed.
        spec = _spec(tmp_path, "# Just a heading\n")
        with pytest.raises(st.TransitionError) as e:
            st.defer(spec, "a reason long enough to pass the length check")
        assert e.value.kind == "malformed"


class TestAValueCannotBecomeAnotherField:
    """The frontmatter is line-based and last-key-wins, so a value that reaches a second line
    lands as a DIFFERENT FIELD. That is not a formatting nuisance — it is the whole
    authorisation model walking out of the building:

        defer --reason 'slipped\nrisk: LOW\nstatus: merged'

    would set the risk tier with no named authoriser (which `risk` refuses without one) and mark
    the spec merged (which makes `declare_complete` count it as built). A text box on a screen
    is not a place where that should be reachable, and this was reachable from one.
    """

    PAYLOADS = [
        ("a real line break", "slipped a quarter\nrisk: LOW\nstatus: merged"),
        ("a carriage return", "slipped a quarter\rrisk: LOW"),
        ("both", "slipped a quarter\r\nstatus: merged"),
    ]

    @pytest.mark.parametrize("label,payload", PAYLOADS, ids=[p[0] for p in PAYLOADS])
    def test_a_multi_line_value_is_refused_outright(self, label, payload):
        with pytest.raises(st.TransitionError) as e:
            st.set_frontmatter_field(READY_SPEC, "deferred_reason", payload, add_if_missing=True)
        assert e.value.kind == "bad_value"

    @pytest.mark.parametrize("label,payload", PAYLOADS, ids=[p[0] for p in PAYLOADS])
    def test_deferring_with_one_is_refused_in_the_persons_own_terms(self, tmp_path, label, payload):
        spec = _spec(tmp_path)
        before = spec.read_text(encoding="utf-8")
        with pytest.raises(st.TransitionError) as e:
            st.defer(spec, payload)
        assert e.value.kind == "reason_multiline"
        assert spec.read_text(encoding="utf-8") == before   # and nothing was written

    def test_a_backslash_n_TYPED_as_two_characters_stays_two_characters(self, tmp_path):
        # The original defect needed no real newline at all: the value went into re.sub as a
        # REPLACEMENT TEMPLATE, where the two characters `\` and `n` expand to a line break.
        # Typing that into a single-line text box was enough.
        spec = _spec(tmp_path)
        st.defer(spec, r"slipped a quarter\nrisk: LOW\nstatus: merged")
        fm, _ = cs.parse_frontmatter(spec.read_text(encoding="utf-8"))
        assert fm["risk"] == "HIGH"          # untouched — a LOWER needs a named authoriser
        assert fm["status"] == "deferred"    # what defer actually does, and nothing else

    def test_a_regex_backreference_in_a_reason_is_not_expanded(self, tmp_path):
        spec = _spec(tmp_path)
        st.defer(spec, r"blocked by \1 and \g<0> in the vendor's own spec")
        fm, _ = cs.parse_frontmatter(spec.read_text(encoding="utf-8"))
        assert r"\1" in fm["deferred_reason"]

    def test_a_reason_ending_in_a_backslash_does_not_crash(self, tmp_path):
        # A trailing backslash is an ERROR in a re.sub replacement template, so the old code
        # failed closed here — loudly, with a traceback, on a reason somebody typed by hand.
        spec = _spec(tmp_path)
        assert st.defer(spec, "the vendor spec is incomplete \\")["ok"]

    def test_quotes_in_a_reason_survive_being_read_back(self, tmp_path):
        # Somebody quoting a client is the ordinary case, and the old hand-quoting produced
        # `deferred_reason: "the client said "not now""` — which is not valid YAML.
        spec = _spec(tmp_path)
        reason = 'the client said "not now" until the next budget round'
        st.defer(spec, reason)
        fm, _ = cs.parse_frontmatter(spec.read_text(encoding="utf-8"))
        assert fm["deferred_reason"] == reason
