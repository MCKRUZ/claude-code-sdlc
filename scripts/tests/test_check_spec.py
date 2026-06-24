"""Tests for check_spec.py — Definition-of-Ready enforcement and the vague-line lint."""

import pytest

from check_spec import (
    check_spec_text,
    extract_section,
    list_items,
    log_spec_metrics,
    parse_frontmatter,
)

READY_SPEC = """---
spec: "0001"
name: "duplicate-claim-409"
status: ready
risk: HIGH
source: "REQ-12"
harness_context: "the existing ClaimsController validation filter"
created: "2026-06-24"
---

# Spec 0001 — duplicate-claim-409

## Goal
A duplicate claim submission is rejected instead of double-processed.

## Why
Double-processed claims cause duplicate payouts and reconciliation work.

## Scope

### In scope
- `src/Claims/ClaimsController.cs`
- `src/Claims/DuplicateGuard.cs`

### Out of scope
- The payout pipeline under `src/Payments/**` — must not change.

## Acceptance Checks
- [ ] A duplicate submission returns 409 with body `{ "error": "duplicate claim" }`
- [ ] The first submission of an id returns 201 and persists one row
- [ ] Two concurrent submissions of the same id persist exactly 1 row

## Risk Tier
**Tier:** HIGH
**Why this tier:** touches client claim data and the persistence path.

## Delegation Plan
- **Scope (file patterns):** `src/Claims/**`
- **Context (pattern to reuse):** the ClaimsController validation filter
- **Permissions:** build/test/lint auto; migrations confirm-required
- **Gated paths touched:** none

## Checking Plan
**Ladder depth:** HIGH
**Specifics:** grader + correctness + security pass + named sign-off in the PR.

## Decision List
- none
"""


def mutate(spec: str, old: str, new: str) -> str:
    assert old in spec, f"fixture missing: {old!r}"
    return spec.replace(old, new)


def must_failures(results):
    return [r for r in results if not r["passed"] and r["severity"] == "MUST"]


def checks_named(results, name):
    return [r for r in results if r["check"] == name]


class TestParseFrontmatter:
    def test_parses_fields_and_strips_comments(self):
        fm, body = parse_frontmatter(READY_SPEC)
        assert fm["spec"] == "0001"
        assert fm["risk"] == "HIGH"
        assert fm["harness_context"] == "the existing ClaimsController validation filter"
        assert body.lstrip().startswith("# Spec 0001")

    def test_no_frontmatter(self):
        fm, body = parse_frontmatter("# Just a heading\n")
        assert fm == {}


class TestExtractSection:
    def test_extracts_named_section(self):
        _, body = parse_frontmatter(READY_SPEC)
        goal = extract_section(body, "Goal")
        assert "rejected instead of double-processed" in goal

    def test_missing_section_is_none(self):
        _, body = parse_frontmatter(READY_SPEC)
        assert extract_section(body, "Nonexistent") is None


class TestListItems:
    def test_strips_markers_and_checkboxes(self):
        section = "- [ ] first\n- [x] second\n1. third\nprose line\n"
        assert list_items(section) == ["first", "second", "third"]


class TestReadySpec:
    def test_ready_spec_has_no_must_failures(self):
        results = check_spec_text(READY_SPEC)
        assert must_failures(results) == []

    def test_ready_spec_has_no_vague_flags(self):
        results = check_spec_text(READY_SPEC)
        vague = [r for r in results if r["check"] == "vague-line" and not r["passed"]]
        assert vague == []


class TestRiskTier:
    def test_invalid_risk_blocks(self):
        spec = mutate(READY_SPEC, "risk: HIGH", "risk: CRITICAL")
        results = check_spec_text(spec)
        assert any(r["check"] == "risk-tier" and not r["passed"] for r in must_failures(results))

    def test_section_disagreement_blocks(self):
        spec = mutate(READY_SPEC, "**Tier:** HIGH", "**Tier:** LOW")
        results = check_spec_text(spec)
        assert any(r["check"] == "risk-agreement" for r in must_failures(results))


class TestCheckingPlanDepth:
    def test_matching_depth_passes(self):
        results = check_spec_text(READY_SPEC)  # tier HIGH, depth HIGH
        assert any(r["check"] == "checking-plan" and r["passed"] for r in results)

    def test_depth_mismatch_blocks(self):
        spec = mutate(READY_SPEC, "**Ladder depth:** HIGH", "**Ladder depth:** LOW")
        results = check_spec_text(spec)
        assert any(r["check"] == "checking-plan" for r in must_failures(results))

    def test_missing_depth_blocks(self):
        spec = mutate(READY_SPEC, "**Ladder depth:** HIGH\n", "")
        results = check_spec_text(spec)
        assert any(r["check"] == "checking-plan" for r in must_failures(results))

    def test_high_without_security_or_signoff_advises(self):
        spec = mutate(
            READY_SPEC,
            "**Specifics:** grader + correctness + security pass + named sign-off in the PR.",
            "**Specifics:** grader + a Checker.",
        )
        results = check_spec_text(spec)
        high = [r for r in results if r["check"] == "checking-plan-high" and not r["passed"]]
        assert high and high[0]["severity"] == "SHOULD"


class TestScope:
    def test_empty_out_of_scope_blocks(self):
        spec = mutate(
            READY_SPEC,
            "### Out of scope\n- The payout pipeline under `src/Payments/**` — must not change.",
            "### Out of scope",
        )
        results = check_spec_text(spec)
        assert any(r["check"] == "scope-out" for r in must_failures(results))


    def test_bare_bullet_does_not_count_as_content(self):
        spec = mutate(
            READY_SPEC,
            "### In scope\n- `src/Claims/ClaimsController.cs`\n- `src/Claims/DuplicateGuard.cs`",
            "### In scope\n-",
        )
        results = check_spec_text(spec)
        assert any(r["check"] == "scope-in" for r in must_failures(results))


class TestAcceptanceChecks:
    def test_no_checks_blocks(self):
        spec = mutate(
            READY_SPEC,
            '- [ ] A duplicate submission returns 409 with body `{ "error": "duplicate claim" }`\n'
            "- [ ] The first submission of an id returns 201 and persists one row\n"
            "- [ ] Two concurrent submissions of the same id persist exactly 1 row\n",
            "",
        )
        results = check_spec_text(spec)
        assert any(r["check"] == "acceptance" for r in must_failures(results))

    def test_vague_word_flagged_as_advisory(self):
        spec = mutate(
            READY_SPEC,
            "- [ ] The first submission of an id returns 201 and persists one row",
            "- [ ] The system handles errors gracefully",
        )
        results = check_spec_text(spec)
        vague = [r for r in results if r["check"] == "vague-line" and not r["passed"]]
        assert vague, "expected a vague-line advisory"
        assert all(r["severity"] == "SHOULD" for r in vague)
        # advisory only — must not block
        assert not any(r["check"] == "vague-line" for r in must_failures(results))

    def test_no_concrete_signal_flagged(self):
        spec = mutate(
            READY_SPEC,
            "- [ ] Two concurrent submissions of the same id persist exactly 1 row",
            "- [ ] The endpoint rejects bad input",
        )
        results = check_spec_text(spec)
        assert any(r["check"] == "vague-line" and not r["passed"] for r in results)


class TestPlaceholders:
    def test_todo_blocks(self):
        spec = mutate(READY_SPEC, "## Decision List\n- none", "## Decision List\n- TODO: ask the PO")
        results = check_spec_text(spec)
        assert any(r["check"] == "placeholders" for r in must_failures(results))


class TestMissingSections:
    def test_missing_section_blocks(self):
        spec = mutate(READY_SPEC, "## Why\nDouble-processed claims cause duplicate payouts and reconciliation work.\n\n", "")
        results = check_spec_text(spec)
        assert any(r["check"] == "sections" for r in must_failures(results))


class TestMetricsLogging:
    def test_writes_jsonl(self, tmp_path):
        sdlc = tmp_path / ".sdlc"
        sdlc.mkdir()
        results = check_spec_text(READY_SPEC)
        log_spec_metrics(results, tmp_path / "specs" / "0001-x.md", sdlc)
        log = sdlc / "metrics" / "spec-log.jsonl"
        assert log.exists()
        import json
        entry = json.loads(log.read_text().strip())
        assert entry["spec"] == "0001-x.md"
        assert entry["ready"] is True
