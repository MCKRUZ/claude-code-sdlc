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


# ---------------------------------------------------------------------------
# Tōgō command center (togo-command-center.md §2.5 row 8): `ladder{}` and `--all`
# ---------------------------------------------------------------------------

import json  # noqa: E402
import subprocess  # noqa: E402
import sys  # noqa: E402

import pytest  # noqa: E402
import risk_model as rm  # noqa: E402

SCRIPT = Path(__file__).resolve().parent.parent / "spec_readiness.py"
LEGACY_KEYS = ["ok", "spec", "risk", "status", "ready", "blocking", "advisory", "passed"]


def _run(*argv):
    proc = subprocess.run([sys.executable, str(SCRIPT), *argv], capture_output=True, text=True,
                          encoding="utf-8", env={"PYTHONIOENCODING": "utf-8", "PATH": ""})
    return proc.returncode, proc.stdout


class TestLadder:
    @pytest.mark.parametrize("tier", rm.RISK_TIERS)
    def test_the_rungs_are_risk_models_own_for_every_tier(self, tmp_path, tier):
        spec = _write(tmp_path, READY_ENOUGH.replace("risk: LOW", f"risk: {tier}"))
        ladder = sr.readiness(spec)["ladder"]
        assert ladder == {"tier": tier, "touches_gated_path": None, "rungs": rm.required_rungs(tier)}

    def test_a_declared_gated_path_adds_the_security_rung_even_at_LOW(self, tmp_path):
        spec = _write(tmp_path, READY_ENOUGH.replace("risk: LOW\n", "risk: LOW\ngated_path: true\n"))
        ladder = sr.readiness(spec)["ladder"]
        assert ladder["touches_gated_path"] is True
        assert "security pass — blocks" in ladder["rungs"]
        assert ladder["rungs"] == rm.required_rungs("LOW", touches_gated_path=True)

    def test_not_declared_is_null_and_declared_false_is_false(self, tmp_path):
        assert sr.readiness(_write(tmp_path, READY_ENOUGH))["ladder"]["touches_gated_path"] is None
        spec = _write(tmp_path, READY_ENOUGH.replace("risk: LOW\n", "risk: LOW\ngated_path: false\n"))
        assert sr.readiness(spec)["ladder"]["touches_gated_path"] is False

    def test_a_tier_that_is_not_a_tier_has_no_rungs_rather_than_a_default(self, tmp_path):
        spec = _write(tmp_path, READY_ENOUGH.replace("risk: LOW", "risk: SEVERE"))
        assert sr.readiness(spec)["ladder"] == {"tier": "", "touches_gated_path": None, "rungs": []}

    def test_the_legacy_keys_are_byte_identical_to_the_findings_they_always_were(self, tmp_path):
        spec = _write(tmp_path, READY_ENOUGH)
        result = sr.readiness(spec)
        assert list(result)[: len(LEGACY_KEYS)] == LEGACY_KEYS and list(result)[-1] == "ladder"
        findings = cs.check_spec_text(READY_ENOUGH)
        assert result["blocking"] + result["advisory"] + result["passed"] == \
            [f for f in findings if not f["passed"] and f["severity"] == "MUST"] + \
            [f for f in findings if not f["passed"] and f["severity"] != "MUST"] + \
            [f for f in findings if f["passed"]]


class TestAll:
    def test_one_row_per_NNNN_file_and_the_template_is_not_a_row(self, tmp_path):
        _write(tmp_path, READY_ENOUGH, name="0042-duplicate-claim.md")
        _write(tmp_path, READY_ENOUGH.replace('spec: "0042"', 'spec: "0043"'), name="0043-second.md")
        _write(tmp_path, READY_ENOUGH, name="spec-template.md")
        (tmp_path / "specs" / "README.md").write_text("# specs\n", encoding="utf-8")
        result = sr.readiness_all(tmp_path)
        assert result["ok"] is True
        assert [r["spec"] for r in result["specs"]] == ["0042", "0043"]
        assert [r["path"] for r in result["specs"]] == ["specs/0042-duplicate-claim.md", "specs/0043-second.md"]

    def test_each_row_is_exactly_what_spec_would_say(self, tmp_path):
        spec = _write(tmp_path, READY_ENOUGH)
        row = sr.readiness_all(tmp_path)["specs"][0]
        single = sr.readiness(spec)
        assert {k: v for k, v in row.items() if k != "path"} == single

    def test_no_specs_directory_is_an_empty_list_not_a_crash(self, tmp_path):
        assert sr.readiness_all(tmp_path) == {"ok": True, "specs": []}

    def test_the_cli_runs_all_from_repo_and_from_state_with_exit_0(self, tmp_path):
        _write(tmp_path, READY_ENOUGH)
        (tmp_path / ".sdlc").mkdir()
        (tmp_path / ".sdlc" / "state.yaml").write_text("project_name: x\n", encoding="utf-8")
        code, out = _run("--all", "--repo", str(tmp_path), "--json")
        assert code == 0 and len(json.loads(out)["specs"]) == 1
        code, out = _run("--all", "--state", str(tmp_path / ".sdlc" / "state.yaml"), "--json")
        assert code == 0 and json.loads(out)["specs"][0]["path"] == "specs/0042-duplicate-claim.md"
        code, out = _run("--all", "--repo", str(tmp_path))
        assert code == 0 and out.startswith("Spec 0042 — ")

    def test_spec_and_all_together_is_a_usage_error_and_spec_still_works_alone(self, tmp_path):
        spec = _write(tmp_path, READY_ENOUGH)
        code, _ = _run("--spec", str(spec), "--all")
        assert code == 2
        code, out = _run("--spec", str(spec), "--json")
        assert code == 0 and json.loads(out)["ladder"]["tier"] == "LOW"
