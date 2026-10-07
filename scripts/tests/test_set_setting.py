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


class TestOneEditChangesOnePerson:
    """A roster edit reported one change and wrote two.

    Values were quoted by hand with `"`, so a `--name` carrying its own YAML structure closed
    that quote and continued the file — adding a whole extra person. The roster was re-validated
    afterwards, and that validation PASSED: the output was perfectly well-formed, just not what
    anyone asked for. The command's own success message said "Added @sam-k."

    It matters because `signs_off` is what the approval machinery reads: a smuggled person
    becomes somebody the sign-off and approval checks then treat as real.

    Two guards, deliberately both: the value is serialized rather than hand-quoted, AND the
    resulting set of people is compared against what the caller named. The second holds
    whatever a value contains, which is the point — the first can only stop what it anticipates.
    """

    SMUGGLE = (
        'Sam"\n      team: claims\n      roles: [developer]\n'
        '    - handle: "@ghost"\n      name: "Ghost"\n      team: claims\n'
        '      roles: [lead, security]\n      signs_off: ["1"]\n    #'
    )

    def test_a_name_carrying_yaml_structure_does_not_add_a_second_person(self, tmp_path):
        # Asserted as the OUTCOME rather than as a refusal, because with the value serialized
        # the payload never becomes structure at all — it is stored as one (very odd) name, and
        # the edit legitimately succeeds. Whether it is refused or defused is the mechanism;
        # that the roster gains exactly the person who was named is the property.
        project = _project(tmp_path)
        ss.set_person(project, "@sam-k", self.SMUGGLE, "claims", ["developer"], None)
        roster = ss.vt.load_yaml(tmp_path / ".sdlc" / "team.yaml")
        assert {p["handle"] for p in roster["people"]} == {"@priya-n", "@sam-oduya", "@sam-k"}
        assert "@ghost" not in {p["handle"] for p in roster["people"]}

    def test_a_name_with_a_line_break_does_not_survive_as_structure(self, tmp_path):
        # The gentler version of the same payload: even where it produces valid YAML, the
        # serializer keeps it a VALUE rather than letting it become file structure.
        project = _project(tmp_path)
        ss.set_person(project, "@sam-k", "Sam\nthe second line", "claims", ["developer"], None)
        roster = ss.vt.load_yaml(tmp_path / ".sdlc" / "team.yaml")
        handles = {p["handle"] for p in roster["people"]}
        assert handles == {"@priya-n", "@sam-oduya", "@sam-k"}

    def test_an_ordinary_name_with_a_quote_in_it_still_works(self, tmp_path):
        # The control: escaping must not make the common case refuse. Names contain quotes,
        # apostrophes and colons, and none of those are an attack.
        project = _project(tmp_path)
        ss.set_person(project, "@sam-k", 'Sam "Sammy" O\'Neill: Jr', "claims", ["developer"], None)
        roster = ss.vt.load_yaml(tmp_path / ".sdlc" / "team.yaml")
        person = next(p for p in roster["people"] if p["handle"] == "@sam-k")
        assert person["name"] == 'Sam "Sammy" O\'Neill: Jr'

    def test_a_signs_off_stage_carrying_a_line_break_is_refused(self, tmp_path):
        # signs_off was written through with no validation at all, and it is what the approval
        # checks read.
        project = _project(tmp_path)
        before = _roster_text(tmp_path)
        with pytest.raises(ss.SettingError) as e:
            ss.set_person(project, "@sam-k", "Sam K", "claims", ["developer"],
                          ['1"\n    - handle: "@ghost'])
        assert e.value.kind == "bad_stage"
        assert _roster_text(tmp_path) == before

    def test_nobody_is_silently_REMOVED_either(self, tmp_path):
        # The same assertion in the other direction. An edit that dropped a person would be
        # just as wrong, and just as invisible in a success message naming one handle.
        project = _project(tmp_path)
        ss.set_person(project, "@sam-k", "Sam K", "claims", ["developer"], None)
        roster = ss.vt.load_yaml(tmp_path / ".sdlc" / "team.yaml")
        assert {"@priya-n", "@sam-oduya"} <= {p["handle"] for p in roster["people"]}


# --- Roster identity: `person --email` and the `code-host` verb (code-host providers, Wave 2) --
# Additive: every test above is byte-identical to before these existed.

import subprocess  # noqa: E402
import sys  # noqa: E402
from pathlib import Path  # noqa: E402

SET_SETTING = Path(ss.__file__).resolve()


def _run(*argv):
    return subprocess.run([sys.executable, str(SET_SETTING), *argv], capture_output=True, text=True)


class TestPersonEmail:
    def test_adding_a_person_with_an_email_writes_it_and_keeps_every_line(self, tmp_path):
        project = _project(tmp_path)
        before = _roster_text(project)
        ss.set_person(project, "@new-one", "New One", "claims", ["developer"], None,
                      email="new.one@example.com")
        after = _roster_text(project)
        for line in before.splitlines():
            if line.strip():
                assert line in after, f"lost: {line!r}"
        assert ss.vt.email_for(ss.vt.load_yaml(project / ".sdlc" / "team.yaml"), "@new-one") \
            == "new.one@example.com"

    def test_adding_an_email_to_an_existing_person_keeps_the_comments(self, tmp_path):
        project = _project(tmp_path)
        ss.set_person(project, "@sam-oduya", None, None, None, None, email="sam@example.com")
        after = _roster_text(project)
        assert "# Priya leads claims." in after
        assert 'name: "Sam Oduya"' in after
        assert "roles: [owner, checker, lead]" in after
        assert ss.vt.email_for(ss.vt.load_yaml(project / ".sdlc" / "team.yaml"), "@sam-oduya") \
            == "sam@example.com"

    def test_without_email_the_edit_is_exactly_as_before(self, tmp_path):
        # The positional signature is unchanged and `email` defaults to None, so a caller that
        # never heard of it gets the same file it always did — no `email:` line appears.
        project = _project(tmp_path)
        ss.set_person(project, "@new-one", "New One", "claims", ["developer"], None)
        assert "email" not in _roster_text(project)

    @pytest.mark.parametrize("email", ["no-at-sign", "", "   ", "a@b.c\n    - handle: '@ghost'"])
    def test_a_bad_email_is_refused_and_the_file_untouched(self, tmp_path, email):
        project = _project(tmp_path)
        before = _roster_text(project)
        with pytest.raises(ss.SettingError) as e:
            ss.set_person(project, "@sam-k", "Sam K", "claims", ["developer"], None, email=email)
        assert e.value.kind == "bad_email"
        assert _roster_text(project) == before

    def test_a_duplicate_email_is_refused_case_insensitively(self, tmp_path):
        project = _project(tmp_path)
        ss.set_person(project, "@sam-oduya", None, None, None, None, email="Sam@example.com")
        before = _roster_text(project)
        with pytest.raises(ss.SettingError) as e:
            ss.set_person(project, "@sam-k", "Sam K", "claims", ["developer"], None,
                          email="sam@EXAMPLE.com")
        assert e.value.kind == "would_be_invalid"
        assert "duplicate email" in str(e.value)
        assert _roster_text(project) == before

    def test_an_email_with_a_quote_stays_a_value_and_adds_nobody(self, tmp_path):
        # The anti-smuggling path is the same one `--name` goes through.
        project = _project(tmp_path)
        ss.set_person(project, "@sam-k", "Sam K", "claims", ["developer"], None,
                      email='sam"k@example.com')
        roster = ss.vt.load_yaml(project / ".sdlc" / "team.yaml")
        assert {p["handle"] for p in roster["people"]} == {"@priya-n", "@sam-oduya", "@sam-k"}
        assert ss.vt.email_for(roster, "@sam-k") == 'sam"k@example.com'

    def test_the_cli_documents_email(self):
        r = _run("person", "--help")
        assert r.returncode == 0 and "--email" in r.stdout


class TestCodeHostVerb:
    def _file(self, tmp_path):
        return tmp_path / ".sdlc" / "code-host.yaml"

    def test_creates_the_file_and_the_directory_with_no_sdlc_present(self, tmp_path):
        result = ss.set_code_host(tmp_path, "azure-devops", organization="contoso")
        assert result["ok"] and result["changed"] and result["file"] == ".sdlc/code-host.yaml"
        fields, errors = ss.parse_code_host_text(self._file(tmp_path).read_text(encoding="utf-8"))
        assert errors == []
        assert fields == {"host": "azure-devops", "organization": "contoso"}

    def test_editing_keeps_a_comment_a_person_wrote(self, tmp_path):
        (tmp_path / ".sdlc").mkdir()
        self._file(tmp_path).write_text(
            "# GHES mirror — do not detect from origin\nhost: none\n", encoding="utf-8")
        ss.set_code_host(tmp_path, "github", repository="payments")
        text = self._file(tmp_path).read_text(encoding="utf-8")
        assert text.startswith("# GHES mirror — do not detect from origin\n")
        assert text.count("host:") == 1
        assert ss.parse_code_host_text(text)[0] == {"host": "github", "repository": "payments"}

    def test_setting_the_same_host_again_reports_unchanged(self, tmp_path):
        ss.set_code_host(tmp_path, "github")
        assert ss.set_code_host(tmp_path, "github")["changed"] is False

    def test_an_unknown_host_is_refused_programmatically_and_exits_2_on_the_cli(self, tmp_path):
        with pytest.raises(ss.SettingError) as e:
            ss.set_code_host(tmp_path, "gitlab")
        assert e.value.kind == "bad_host"
        assert not self._file(tmp_path).exists()
        r = _run("--repo", str(tmp_path), "code-host", "--host", "gitlab")
        assert r.returncode == 2
        assert not self._file(tmp_path).exists()

    @pytest.mark.parametrize("value", ["", "  ", "contoso\nproject: x"])
    def test_a_multi_line_or_empty_detail_is_refused(self, tmp_path, value):
        with pytest.raises(ss.SettingError) as e:
            ss.set_code_host(tmp_path, "azure-devops", organization=value)
        assert e.value.kind == "bad_value"
        assert not self._file(tmp_path).exists()

    def test_a_malformed_existing_file_is_refused_rather_than_overwritten(self, tmp_path):
        (tmp_path / ".sdlc").mkdir()
        self._file(tmp_path).write_text("host: [unterminated\n", encoding="utf-8")
        before = self._file(tmp_path).read_text(encoding="utf-8")
        with pytest.raises(ss.SettingError) as e:
            ss.set_code_host(tmp_path, "github")
        assert e.value.kind == "malformed"
        assert self._file(tmp_path).read_text(encoding="utf-8") == before

    def test_parse_rejects_what_a_reader_must_not_trust(self):
        assert ss.parse_code_host_text("")[0] == {}
        assert "host: missing" in ss.parse_code_host_text("organization: x\n")[1]
        assert any("not a code host" in e for e in ss.parse_code_host_text("host: gitlab\n")[1])
        assert any("unknown key" in e for e in ss.parse_code_host_text("host: github\norganisation: x\n")[1])

    def test_the_cli_writes_json_and_documents_every_flag(self, tmp_path):
        r = _run("--repo", str(tmp_path), "--json", "code-host", "--host", "none")
        assert r.returncode == 0, r.stderr
        assert '"host"' not in r.stdout or True  # the outcome document, not the file
        assert ss.parse_code_host_text(self._file(tmp_path).read_text(encoding="utf-8"))[0] == {"host": "none"}
        h = _run("code-host", "--help").stdout
        for flag in ("--host", "--organization", "--project", "--repository"):
            assert flag in h

    def test_code_host_detect_host_reads_the_file_as_source_file(self, tmp_path):
        # The acceptance check from the design (§12, Wave 2). code_host.py is Wave 1's file;
        # until it lands this is skipped, not faked.
        ch = pytest.importorskip("code_host")
        ss.set_code_host(tmp_path, "azure-devops", organization="contoso", project="p",
                         repository="r")
        detection = ch.detect_host(tmp_path)
        assert getattr(detection, "host", None) == "azure-devops"
        assert getattr(detection, "source", None) == "file"
