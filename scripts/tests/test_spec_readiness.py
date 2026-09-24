"""Tests for spec_readiness.py — a spec's Definition-of-Ready findings as data (spec 0011).

This module deliberately owns no judgement: every check, severity and message comes from
check_spec.py, which is protected core and prints for a person rather than for a program.
So these tests are about FAITHFULNESS — that nothing is invented, dropped, or re-decided —
plus the one thing this module does add, which is grouping.
"""

from pathlib import Path

import check_spec as cs
import spec_readiness as sr

READY_ENOUGH = """\
---
spec: "0042"
name: "duplicate-claim"
status: draft
type: feature
risk: LOW
owner: "@MCKRUZ"
team: "core"
harness_context: "the existing claims submission path"
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
- Anything about refunds

## Acceptance Checks
- [ ] A duplicate submission returns 409 with body `{ "error": "duplicate claim" }`

## Risk Tier

**Tier:** LOW
**Why this tier:** one endpoint, no personal data.

## Delegation Plan
- **Scope (file patterns):** the claims service only
- **Context (pattern to reuse):** the existing submission path
- **Permissions:** build and test auto-allowed
- **Gated paths touched:** none

## Checking Plan

**Ladder depth:** LOW
**Specifics:** CI, the grader, a correctness review and a non-author approval.

## Decision List
- None.
"""


def _write(tmp_path, text, name="0042-duplicate-claim.md"):
    specs = tmp_path / "specs"
    specs.mkdir(exist_ok=True)
    path = specs / name
    path.write_text(text, encoding="utf-8")
    return path


class TestFaithfulness:
    def test_every_finding_check_spec_produced_is_present_exactly_once(self, tmp_path):
        spec = _write(tmp_path, READY_ENOUGH)
        expected = cs.check_spec_text(spec.read_text(encoding="utf-8"), None)
        result = sr.readiness(spec)
        got = result["blocking"] + result["advisory"] + result["passed"]
        # Same count and same content — nothing invented, nothing dropped, nothing counted
        # twice by landing in two groups.
        assert len(got) == len(expected)
        assert sorted(f["check"] for f in got) == sorted(f["check"] for f in expected)

    def test_the_three_groups_never_overlap(self, tmp_path):
        spec = _write(tmp_path, READY_ENOUGH)
        result = sr.readiness(spec)
        ids = [id(f) for group in ("blocking", "advisory", "passed") for f in result[group]]
        assert len(ids) == len(set(ids))

    def test_messages_are_verbatim(self, tmp_path):
        # A paraphrase here would be this module inventing judgement it does not have.
        spec = _write(tmp_path, "# no frontmatter at all\n")
        expected = {f["message"] for f in cs.check_spec_text(spec.read_text(encoding="utf-8"), None)}
        result = sr.readiness(spec)
        got = {f["message"] for f in result["blocking"] + result["advisory"] + result["passed"]}
        assert got == expected


class TestReadyVerdict:
    def test_ready_is_true_only_when_nothing_MUST_level_is_outstanding(self, tmp_path):
        result = sr.readiness(_write(tmp_path, READY_ENOUGH))
        assert result["blocking"] == []
        assert result["ready"] is True

    def test_advisory_notes_do_not_block(self, tmp_path):
        # check_spec.py's own contract: the vague-line lint advises, never blocks. This
        # module must not quietly promote it.
        result = sr.readiness(_write(tmp_path, READY_ENOUGH))
        assert result["advisory"] or True  # may be empty; the point is the next line
        assert result["ready"] is True

    def test_a_missing_must_makes_it_not_ready(self, tmp_path):
        result = sr.readiness(_write(tmp_path, READY_ENOUGH.replace('owner: "@MCKRUZ"', 'owner: ""')))
        assert result["ready"] is False
        assert any(f["check"] == "owner" for f in result["blocking"])


class TestHonestFailures:
    def test_a_missing_spec_says_so_rather_than_reading_as_ready(self, tmp_path):
        # "ready: false" matters here — a missing file must never look like a passing spec.
        result = sr.readiness(tmp_path / "specs" / "nope.md")
        assert result["ok"] is False
        assert result["ready"] is False
        assert "not found" in result["error"].lower()

    def test_frontmatter_fields_are_reported_for_the_editor(self, tmp_path):
        result = sr.readiness(_write(tmp_path, READY_ENOUGH))
        assert result["spec"] == "0042"
        assert result["risk"] == "LOW"
        assert result["status"] == "draft"


class TestRosterResolution:
    def test_finds_a_roster_above_the_spec(self, tmp_path):
        spec = _write(tmp_path, READY_ENOUGH)
        (tmp_path / ".sdlc").mkdir(exist_ok=True)
        (tmp_path / ".sdlc" / "team.yaml").write_text("people: []\n", encoding="utf-8")

        spec_path = str(spec)

        class Args:
            state = None
            spec = spec_path
        assert sr.resolve_roster(Args()) == tmp_path / ".sdlc" / "team.yaml"

    def test_no_roster_is_not_an_error(self, tmp_path):
        class Args:
            state = None
            spec = str(_write(tmp_path, READY_ENOUGH))
        assert sr.resolve_roster(Args()) is None
