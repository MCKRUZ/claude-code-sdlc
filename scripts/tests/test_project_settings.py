"""Tests for project_settings.py — every project setting and the file that owns it (0012).

This module composes and decides nothing, so the tests are about two things: that each
section names the file it came from, and that MISSING is reported as missing rather than as
broken. Those two send a person to different places — one to a file they need to create, the
other to one they need to fix — and conflating them is the failure worth catching.
"""

import pathlib

import project_settings as ps

ROSTER = """\
version: "1.0"
teams:
  - name: claims
    lead: "@priya-n"
  - name: platform
    lead: "@sam-oduya"
people:
  - handle: "@priya-n"
    name: "Priya Nair"
    team: claims
    roles: [owner, developer, lead]
    signs_off: ["1"]
  - handle: "@sam-oduya"
    name: "Sam Oduya"
    team: platform
    roles: [owner, checker, lead]
    signs_off: ["1"]
"""

CADENCE = """\
# Cadence plan

## WIP Limits

| team | wip_limit |
|------|-----------|
| claims | 2 |
| platform | 3 |
"""

APPROVAL = """\
stages:
  - stage: requirements
    approval_required: true
    approver: "@priya-n"
"""

SPEC = """\
---
spec: "0001"
name: "a-change"
status: in-flight
type: feature
risk: LOW
owner: "@priya-n"
team: "claims"
created: "2026-09-24"
---

# Spec 0001 — A change
"""


def _project(tmp_path, roster=None, cadence=None, approval=None, spec=None):
    (tmp_path / ".sdlc").mkdir(exist_ok=True)
    if roster:
        (tmp_path / ".sdlc" / "team.yaml").write_text(roster, encoding="utf-8")
    if cadence:
        d = tmp_path / ".sdlc" / "artifacts" / "03-foundation"
        d.mkdir(parents=True, exist_ok=True)
        (d / "cadence-plan.md").write_text(cadence, encoding="utf-8")
    if approval:
        (tmp_path / ".sdlc" / "approval-settings.yaml").write_text(approval, encoding="utf-8")
    if spec:
        (tmp_path / "specs").mkdir(exist_ok=True)
        (tmp_path / "specs" / "0001-a-change.md").write_text(spec, encoding="utf-8")
    return tmp_path


class TestNothingConfigured:
    """An empty project is ORDINARY, not broken. Every section says it is not configured and
    reports no errors — 'you have not set this up' and 'you set it up wrong' send a person to
    two different places."""

    def test_every_section_reports_absent_without_errors(self, tmp_path):
        result = ps.read_settings(_project(tmp_path))
        for key in ("roster", "wip_limits", "approval"):
            assert result[key]["present"] is False, key
            assert result[key]["errors"] == [], key

    def test_it_never_raises_on_an_empty_directory(self, tmp_path):
        assert ps.read_settings(tmp_path)["ok"] is True


class TestEverySectionNamesItsFile:
    """Spec 0012: every settings screen states which file the setting is stored in. A setting
    whose home is invisible is one nobody can correct outside the app."""

    def test_paths_are_repo_relative_and_present_even_when_the_file_is_not(self, tmp_path):
        result = ps.read_settings(_project(tmp_path))
        assert result["roster"]["file"] == ".sdlc/team.yaml"
        assert result["approval"]["file"] == ".sdlc/approval-settings.yaml"
        assert result["wip_limits"]["file"].endswith("cadence-plan.md")
        assert not result["wip_limits"]["file"].startswith("C:")


class TestConfiguredProject:
    def test_reads_the_roster(self, tmp_path):
        result = ps.read_settings(_project(tmp_path, roster=ROSTER))
        assert result["roster"]["present"] is True
        assert result["roster"]["errors"] == []
        assert len(result["roster"]["people"]) == 2
        assert [t["name"] for t in result["roster"]["teams"]] == ["claims", "platform"]

    def test_a_limit_is_reported_WITH_what_is_actually_in_flight(self, tmp_path):
        # The two numbers are only meaningful together; a screen showing one invites the
        # reader to supply the other from memory.
        result = ps.read_settings(_project(tmp_path, roster=ROSTER, cadence=CADENCE, spec=SPEC))
        claims = next(t for t in result["wip_limits"]["teams"] if t["team"] == "claims")
        assert claims["wip_limit"] == 2 and claims["in_flight"] == 1
        assert claims["at_limit"] is False and claims["over_limit"] is False

    def test_the_cadence_plan_s_other_fields_are_passed_through_untouched(self, tmp_path):
        # The alarm thresholds live in the same table, and spec 0012 asks this screen to name
        # a team whose alarm is sounding. Filtering them out here would mean re-reading the
        # same file twice to answer two questions about the same row.
        result = ps.read_settings(_project(tmp_path, roster=ROSTER, cadence=CADENCE, spec=SPEC))
        claims = next(t for t in result["wip_limits"]["teams"] if t["team"] == "claims")
        assert "review_alarm_hours" in claims

    def test_at_limit_and_over_limit_are_distinguished(self, tmp_path):
        one = CADENCE.replace("| claims | 2 |", "| claims | 1 |")
        result = ps.read_settings(_project(tmp_path, roster=ROSTER, cadence=one, spec=SPEC))
        claims = next(t for t in result["wip_limits"]["teams"] if t["team"] == "claims")
        assert claims["at_limit"] is True and claims["over_limit"] is False

    def test_reads_the_approval_setting(self, tmp_path):
        result = ps.read_settings(_project(tmp_path, roster=ROSTER, approval=APPROVAL))
        assert result["approval"]["stages"] == [
            {"stage": "requirements", "approval_required": True, "approver": "@priya-n"}]


class TestMalformedIsNotMissing:
    def test_a_broken_roster_is_PRESENT_with_errors(self, tmp_path):
        # The distinction this whole module exists to preserve.
        result = ps.read_settings(_project(tmp_path, roster="teams: not-a-list\n"))
        assert result["roster"]["present"] is True
        assert result["roster"]["errors"] != []


class TestFixedRules:
    def test_every_fixed_rule_names_where_it_is_enforced(self, tmp_path):
        # A settings screen listing an unenforced rule as a fact tells someone they are
        # protected by something that is not there. Each entry must name real enforcement.
        for rule in ps.read_settings(tmp_path)["fixed_rules"]:
            assert rule["rule"].strip()
            assert rule["enforced_by"].strip()
            assert ".py" in rule["enforced_by"], rule["rule"]

    def test_the_risk_rule_describes_recording_not_restricting(self, tmp_path):
        # Spec 0012 was amended for exactly this: "only a team lead may lower a tier" is a
        # rule nothing enforces. What the system actually does is record who decided.
        risk = next(r for r in ps.read_settings(tmp_path)["fixed_rules"] if "risk tier" in r["rule"])
        assert "recorded" in risk["rule"].lower()
        assert "team lead" not in risk["rule"].lower()
