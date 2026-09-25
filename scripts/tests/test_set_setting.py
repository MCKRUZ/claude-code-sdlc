"""Tests for set_setting.py — changing a project setting (spec 0012).

Two things are tested harder than the rest, because both are failures a person would not
notice until much later:

  NOTHING IS LOST. The first version of the roster write parsed the file, changed the object
  and dumped it back. It was correct, it passed validation, and it silently destroyed all nine
  comments its author had written. Losing what a person wrote is what this product exists to
  prevent, so a settings screen must not be the one place it happens.

  A REFUSED CHANGE CHANGES NOTHING. Every refusal happens before the file is touched, and
  these tests assert the file is byte-for-byte identical afterwards rather than trusting it.
"""

import pytest

import set_setting as ss

ROSTER = """\
# The project's team roster.
# Validate any change with: validate_team.py .sdlc/team.yaml
version: "1.0"

teams:
  # Claims handles the money paths.
  - name: claims
    lead: "@priya-n"
  - name: platform
    lead: "@sam-oduya"

people:
  # Priya leads claims.
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

Prose a person wrote, above the table.

## WIP Limits

| team | wip_limit |
|------|-----------|
| claims | 2 |
| platform | 3 |

Prose a person wrote, below it.
"""


def _project(tmp_path, roster=ROSTER, cadence=None):
    (tmp_path / ".sdlc").mkdir(exist_ok=True)
    if roster:
        (tmp_path / ".sdlc" / "team.yaml").write_text(roster, encoding="utf-8")
    if cadence:
        d = tmp_path / ".sdlc" / "artifacts" / "03-foundation"
        d.mkdir(parents=True, exist_ok=True)
        (d / "cadence-plan.md").write_text(cadence, encoding="utf-8")
    return tmp_path


def _roster_text(tmp_path) -> str:
    return (tmp_path / ".sdlc" / "team.yaml").read_text(encoding="utf-8")


class TestNothingIsLost:
    """The regression this file exists for."""

    def test_adding_a_person_keeps_every_comment(self, tmp_path):
        project = _project(tmp_path)
        before = _roster_text(project).count("#")
        ss.set_person(project, "@new-one", "New One", "claims", ["developer"], None)
        assert _roster_text(project).count("#") == before

    def test_adding_a_person_keeps_every_original_line(self, tmp_path):
        project = _project(tmp_path)
        before = _roster_text(project)
        ss.set_person(project, "@new-one", "New One", "claims", ["developer"], None)
        after = _roster_text(project)
        for line in before.splitlines():
            if line.strip():
                assert line in after, f"lost: {line!r}"

    def test_updating_one_field_leaves_the_others_and_the_comments(self, tmp_path):
        project = _project(tmp_path)
        # Keeps `lead`, because Sam leads platform — dropping it is correctly refused, which
        # is how the previous version of this test learned the check is stricter than it
        # assumed. Changing the roles while keeping that one is the real-world case.
        ss.set_person(project, "@sam-oduya", None, None, ["developer", "lead"], None)
        after = _roster_text(project)
        assert "# Priya leads claims." in after
        assert "# Claims handles the money paths." in after
        assert 'name: "Sam Oduya"' in after           # untouched field survives
        assert "roles: [developer, lead]" in after    # changed field applied
        assert 'signs_off: ["1"]' in after            # untouched field survives

    def test_a_limit_change_keeps_the_prose_around_the_table(self, tmp_path):
        project = _project(tmp_path, cadence=CADENCE)
        ss.set_limit(project, "claims", 5)
        after = (project / ".sdlc" / "artifacts" / "03-foundation" / "cadence-plan.md").read_text(encoding="utf-8")
        assert "Prose a person wrote, above the table." in after
        assert "Prose a person wrote, below it." in after
        assert "| claims | 5 |" in after
        assert "| platform | 3 |" in after


class TestARefusalChangesNothing:
    @pytest.mark.parametrize("call,kind", [
        (lambda p: ss.set_person(p, "not-a-handle", None, None, None, None), "bad_handle"),
        (lambda p: ss.set_person(p, "@x", None, "nosuchteam", None, None), "unknown_team"),
        (lambda p: ss.set_person(p, "@x", None, None, ["wizard"], None), "unknown_role"),
    ])
    def test_the_roster_is_untouched(self, tmp_path, call, kind):
        project = _project(tmp_path)
        before = _roster_text(project)
        with pytest.raises(ss.SettingError) as e:
            call(project)
        assert e.value.kind == kind
        assert _roster_text(project) == before

    def test_a_change_that_would_invalidate_the_roster_is_refused(self, tmp_path):
        # Found by running it: moving a team's LEAD to another team leaves that team with a
        # lead who is not on it. One valid row can still break the whole file, which is why
        # the whole file is validated rather than just the row being changed.
        project = _project(tmp_path)
        before = _roster_text(project)
        with pytest.raises(ss.SettingError) as e:
            ss.set_person(project, "@priya-n", None, "platform", None, None)
        assert e.value.kind == "would_be_invalid"
        assert "lead" in str(e.value)
        assert _roster_text(project) == before


class TestLimits:
    def test_a_limit_below_one_is_refused(self, tmp_path):
        with pytest.raises(ss.SettingError) as e:
            ss.set_limit(_project(tmp_path, cadence=CADENCE), "claims", 0)
        assert e.value.kind == "bad_limit"

    def test_a_team_the_roster_does_not_know_is_refused(self, tmp_path):
        # A limit for a team nothing can be assigned to is a number nobody will ever read.
        with pytest.raises(ss.SettingError) as e:
            ss.set_limit(_project(tmp_path, cadence=CADENCE), "ghosts", 2)
        assert e.value.kind == "unknown_team"

    def test_a_missing_row_is_refused_rather_than_invented(self, tmp_path):
        short = CADENCE.replace("| platform | 3 |\n", "")
        with pytest.raises(ss.SettingError) as e:
            ss.set_limit(_project(tmp_path, cadence=short), "platform", 2)
        assert e.value.kind == "no_row"

    def test_no_cadence_plan_says_where_limits_live(self, tmp_path):
        with pytest.raises(ss.SettingError) as e:
            ss.set_limit(_project(tmp_path), "claims", 2)
        assert e.value.kind == "no_cadence_plan"


class TestApproval:
    def test_turning_it_on_without_naming_anyone_is_refused(self, tmp_path):
        with pytest.raises(ss.SettingError) as e:
            ss.set_approval(_project(tmp_path), "requirements", True, None)
        assert e.value.kind == "approver_required"

    def test_an_approver_outside_the_roster_is_refused(self, tmp_path):
        # Nothing could route an approval to them.
        with pytest.raises(ss.SettingError) as e:
            ss.set_approval(_project(tmp_path), "requirements", True, "@nobody")
        assert e.value.kind == "unknown_approver"

    def test_turning_it_on_then_off(self, tmp_path):
        project = _project(tmp_path)
        on = ss.set_approval(project, "requirements", True, "@priya-n")
        assert on["ok"] and "@priya-n" in on["message"]
        off = ss.set_approval(project, "requirements", False, None)
        assert off["ok"] and "off" in off["message"]

    def test_turning_it_off_needs_no_approver(self, tmp_path):
        assert ss.set_approval(_project(tmp_path), "requirements", False, None)["ok"] is True


class TestNoRoster:
    def test_adding_a_person_says_to_create_the_roster_first(self, tmp_path):
        (tmp_path / ".sdlc").mkdir()
        with pytest.raises(ss.SettingError) as e:
            ss.set_person(tmp_path, "@x", None, None, None, None)
        assert e.value.kind == "no_roster"
        assert "example" in str(e.value)
