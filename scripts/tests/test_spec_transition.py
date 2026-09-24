"""Tests for spec_transition.py — the two spec transitions a person makes by hand (0011).

Both change frontmatter, and both carry a rule. The rules are the point: without them these
would be a generic "set any field" command, which would be the one write path in this system
with no rule attached and would quietly become how everything gets changed.
"""

from pathlib import Path

import pytest

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
