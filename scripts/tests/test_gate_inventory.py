"""Tests for gate_inventory.py — every gate a change must pass (spec 0013).

The gates are described once, in the rails operator's guide. This module turns that table
into data WITHOUT becoming a rival description, so the tests are mostly about faithfulness and
about the three-way classification spec 0013 asks for:

  installed   described and present — a real gate on real changes
  missing     described but absent — the playbook ships it, this project does not run it
  unexpected  present but undescribed — this project's own gate, shown rather than hidden

The failure worth catching hardest: reporting "no gates" when the truth is "the guide could
not be read". Those look identical on screen and mean opposite things — one is a project with
no protection, the other is a tool that could not look.
"""

import gate_inventory as gi

GUIDE = """\
# The delivery rails — operator's guide

Prose a person wrote.

## The gates

| Gate | File | Fires on | Blocks or advises |
| --- | --- | --- | --- |
| **build-and-test** | `ci.yml` | every PR | **Blocks** (hard gate) |
| **spec-gate** | `ci.yml` | every PR | **Blocks** — `no-spec:chore` is the recorded escape |
| **eval-gate** *(optional)* | `ci.yml` | every PR | **Blocks** — keep only if you ship evals |
| **grader** | `grader.yml` | every PR | **Advises** — never blocks |
| **Stop gate** | `.claude/hooks/stop-gate.ps1` | agent tries to finish | **Blocks** a red build |

More prose below.
"""


def _project(tmp_path, guide=GUIDE, workflows=("ci.yml",), ledgers=()):
    gh = tmp_path / ".github"
    gh.mkdir(exist_ok=True)
    if guide is not None:
        (gh / "RAILS.md").write_text(guide, encoding="utf-8")
    wf = gh / "workflows"
    wf.mkdir(exist_ok=True)
    for name in workflows:
        (wf / name).write_text("name: x\n", encoding="utf-8")
    for rel in ledgers:
        path = tmp_path / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("# a ledger\n", encoding="utf-8")
    return tmp_path


class TestParsingTheGuide:
    def test_reads_every_row_of_the_table(self):
        rows = gi.parse_gate_table(GUIDE)
        assert [r["gate"] for r in rows] == [
            "build-and-test", "spec-gate", "eval-gate", "grader", "Stop gate"]

    def test_keeps_what_each_gate_does_verbatim_enough_to_be_useful(self):
        rows = {r["gate"]: r for r in gi.parse_gate_table(GUIDE)}
        assert "Advises" in rows["grader"]["blocks"]
        assert "no-spec:chore" in rows["spec-gate"]["blocks"]  # the recorded escape survives
        assert rows["grader"]["fires_on"] == "every PR"

    def test_optional_is_kept_as_information_not_stripped(self):
        # "optional" changes how a reader should treat an absence, so it must not be lost.
        rows = {r["gate"]: r for r in gi.parse_gate_table(GUIDE)}
        assert rows["eval-gate"]["optional"] is True
        assert rows["grader"]["optional"] is False

    def test_a_table_that_is_not_there_yields_nothing_rather_than_guessing(self):
        assert gi.parse_gate_table("# No table here\n\njust prose\n") == []


class TestThreeWayClassification:
    def test_a_described_and_present_gate_is_installed(self, tmp_path):
        result = gi.inventory(_project(tmp_path, workflows=("ci.yml",)))
        states = {g["gate"]: g["state"] for g in result["gates"]}
        assert states["build-and-test"] == "installed"
        assert states["spec-gate"] == "installed"

    def test_a_described_but_absent_gate_is_MISSING(self, tmp_path):
        # Spec 0013: a gate the playbook ships but this project does not have must not be
        # listed as though it were protecting anybody.
        result = gi.inventory(_project(tmp_path, workflows=("ci.yml",)))
        grader = next(g for g in result["gates"] if g["gate"] == "grader")
        assert grader["state"] == "missing"
        assert "grader.yml" in grader["detail"]

    def test_a_pipeline_this_project_added_itself_is_SHOWN(self, tmp_path):
        # It gates real changes whether the guide knows about it or not.
        result = gi.inventory(_project(tmp_path, workflows=("ci.yml", "our-own-thing.yml")))
        assert [u["file"] for u in result["unexpected"]] == ["our-own-thing.yml"]

    def test_a_gate_that_is_not_a_pipeline_is_not_called_missing(self, tmp_path):
        # The stop gate is a local hook. Absent from .github/workflows by design, so calling
        # it missing would be a false alarm about the most-used gate of the lot.
        result = gi.inventory(_project(tmp_path))
        stop = next(g for g in result["gates"] if g["gate"] == "Stop gate")
        assert stop["state"] == "not_a_pipeline"

    def test_two_gates_in_one_file_are_both_installed(self, tmp_path):
        # build-and-test, spec-gate and eval-gate all live in ci.yml.
        result = gi.inventory(_project(tmp_path, workflows=("ci.yml",)))
        from_ci = [g for g in result["gates"] if g["file"] == "ci.yml"]
        assert len(from_ci) == 3
        assert all(g["state"] == "installed" for g in from_ci)


class TestNoGatesIsNotTheSameAsCannotLook:
    def test_a_missing_guide_is_an_ERROR_not_an_empty_gate_list(self, tmp_path):
        # The failure this test exists for: "no gates" and "could not read the guide" look
        # identical on a screen and mean opposite things.
        gh = tmp_path / ".github" / "workflows"
        gh.mkdir(parents=True)
        original = gi.PLAYBOOK_GUIDE
        try:
            gi.PLAYBOOK_GUIDE = tmp_path / "nonexistent.md"
            result = gi.inventory(tmp_path)
        finally:
            gi.PLAYBOOK_GUIDE = original
        assert result["ok"] is False
        assert "not the same as having no gates" in result["error"]

    def test_a_guide_with_no_table_is_also_an_error(self, tmp_path):
        result = gi.inventory(_project(tmp_path, guide="# Guide\n\nno table\n"))
        assert result["ok"] is False
        assert "not the same as having no gates" in result["error"]


class TestTheProjectsOwnGuideWins:
    def test_the_projects_copy_is_preferred_over_the_playbooks(self, tmp_path):
        # A project may have adapted its guide, and its copy is what its own team reads.
        own = GUIDE.replace("| **grader** | `grader.yml` | every PR | **Advises** — never blocks |",
                            "| **our-gate** | `ours.yml` | every PR | **Blocks** |")
        result = gi.inventory(_project(tmp_path, guide=own))
        assert result["guide_source"] == ".github/RAILS.md"
        assert any(g["gate"] == "our-gate" for g in result["gates"])
        assert not any(g["gate"] == "grader" for g in result["gates"])


class TestBypassLedgers:
    def test_a_ledger_that_exists_is_reported_as_present(self, tmp_path):
        result = gi.inventory(_project(tmp_path, ledgers=(".github/eval-bypasses.md",)))
        ledgers = {l["file"]: l["present"] for l in result["bypass_ledgers"]}
        assert ledgers[".github/eval-bypasses.md"] is True
        assert ledgers[".github/dependency-exceptions.md"] is False

    def test_every_ledger_names_the_gate_it_belongs_to(self, tmp_path):
        for ledger in gi.inventory(_project(tmp_path))["bypass_ledgers"]:
            assert ledger["gate"].strip()


PLAYBOOK = """\
# The delivery rails — operator's guide

## The gates

| Gate | File | Fires on | Blocks or advises |
| --- | --- | --- | --- |
| **build-and-test** | `ci.yml` | every PR | **Blocks** (hard gate) |
| **security-review** | `security.yml` | gated paths | **Blocks** on HIGH |

More prose.
"""


class TestWhatTheProjectClaimsVersusWhatTheStandardExpects:
    """A repository supplies both halves of "are my gates installed?".

    The gate list comes from a file inside the project, and the pipeline files it names are
    also inside the project. So a project could state that every gate is installed and
    blocking, ship inert files to match, and this report would agree — it would be answering
    "does this project SAY it is protected", which is a different question from the one
    somebody opens it to ask.

    Nothing is overruled. A project may legitimately have adapted a gate, and deciding which
    copy is right is not this script's call. The disagreement is REPORTED, because only one of
    the two documents is the standard and a reader needs to know they differ.
    """

    def _with_playbook(self, tmp_path, monkeypatch, guide=GUIDE, playbook=PLAYBOOK, **kw):
        pb = tmp_path / "playbook-RAILS.md"
        pb.write_text(playbook, encoding="utf-8")
        monkeypatch.setattr(gi, "PLAYBOOK_GUIDE", pb)
        return gi.inventory(_project(tmp_path, guide=guide, **kw))

    def test_a_gate_the_standard_expects_and_the_project_never_mentions_is_SURFACED(
            self, tmp_path, monkeypatch):
        # The case reading only the project's copy could never find: a gate dropped from the
        # project's own list simply stops being asked about, and the report comes back clean.
        result = self._with_playbook(tmp_path, monkeypatch)
        dropped = {g["gate"] for g in result["not_in_project_guide"]}
        assert "security-review" in dropped

    def test_it_says_WHY_that_matters(self, tmp_path, monkeypatch):
        result = self._with_playbook(tmp_path, monkeypatch)
        entry = next(g for g in result["not_in_project_guide"] if g["gate"] == "security-review")
        assert "nothing above checks for it" in entry["detail"]

    def test_a_gate_described_differently_is_flagged_with_both_readings(
            self, tmp_path, monkeypatch):
        # "This project says advises, the playbook says blocks" is the difference that matters,
        # and a reader has to see both to judge it.
        weakened = GUIDE.replace(
            "| **build-and-test** | `ci.yml` | every PR | **Blocks** (hard gate) |",
            "| **build-and-test** | `ci.yml` | every PR | **Advises** |")
        result = self._with_playbook(tmp_path, monkeypatch, guide=weakened)
        gate = next(g for g in result["gates"] if g["gate"] == "build-and-test")
        assert "Advises" in gate["differs"] and "Blocks" in gate["differs"]

    def test_a_gate_the_two_describe_IDENTICALLY_is_not_flagged(self, tmp_path, monkeypatch):
        # The control. Flagging agreement would bury the real disagreements in noise.
        result = self._with_playbook(tmp_path, monkeypatch)
        gate = next(g for g in result["gates"] if g["gate"] == "build-and-test")
        assert "differs" not in gate

    def test_a_gate_only_this_project_has_says_so_rather_than_being_called_wrong(
            self, tmp_path, monkeypatch):
        result = self._with_playbook(tmp_path, monkeypatch)
        gate = next(g for g in result["gates"] if g["gate"] == "grader")
        assert "does not describe this gate" in gate["differs"]

    def test_the_report_says_whether_a_comparison_happened_at_all(self, tmp_path, monkeypatch):
        # Without this, "no disagreements" and "nothing was compared" look the same.
        assert self._with_playbook(tmp_path, monkeypatch)["compared_with_playbook"] is True

    def test_a_project_with_no_guide_of_its_own_is_not_compared_against_itself(
            self, tmp_path, monkeypatch):
        pb = tmp_path / "playbook-RAILS.md"
        pb.write_text(PLAYBOOK, encoding="utf-8")
        monkeypatch.setattr(gi, "PLAYBOOK_GUIDE", pb)
        result = gi.inventory(_project(tmp_path, guide=None))
        assert result["compared_with_playbook"] is False
        assert result["not_in_project_guide"] == []


class TestBothWorkflowSpellings:
    def test_a_yaml_pipeline_counts_as_installed(self, tmp_path):
        # The code host runs `.yaml` exactly as it runs `.yml`. Globbing one spelling made a
        # real pipeline invisible in both directions at once.
        guide = GUIDE.replace("`grader.yml`", "`grader.yaml`")
        result = gi.inventory(_project(tmp_path, guide=guide, workflows=("ci.yml", "grader.yaml")))
        gate = next(g for g in result["gates"] if g["gate"] == "grader")
        assert gate["state"] == "installed"

    def test_a_yaml_pipeline_nobody_described_is_still_reported(self, tmp_path):
        result = gi.inventory(_project(tmp_path, workflows=("ci.yml", "mystery.yaml")))
        assert any(u["file"] == "mystery.yaml" for u in result["unexpected"])

    def test_a_described_yaml_pipeline_is_not_ALSO_called_unexpected(self, tmp_path):
        # The converse of the test above, and the one the first pass missed: a gate described
        # with the other spelling was reported as a pipeline nobody described, so the same
        # file appeared as both installed and unexplained.
        guide = GUIDE.replace("`grader.yml`", "`grader.yaml`")
        result = gi.inventory(_project(tmp_path, guide=guide, workflows=("ci.yml", "grader.yaml")))
        assert not any(u["file"] == "grader.yaml" for u in result["unexpected"])
