"""Tests for connection_report.py — is this project wired up? (spec 0012)

The check that earns this file is the last one: which pipelines the playbook expects that a
project does not have. The others confirm what a person could work out in a minute; that one
answers something nobody can see by looking.

Two properties are asserted hard:

  THREE ANSWERS, NOT TWO. Every check can say "could not tell", and that is not a failure. A
  check reporting "no" when it means "I could not look" sends someone to fix something that
  was never broken.

  ONE SOURCE OF TRUTH. The expected set is read from the harness's own pipeline definitions.
  A hardcoded list here would drift the first time a pipeline is added — silently, which is
  the exact failure this report exists to catch, reproduced in the tool that catches it.
"""

import connection_report as cr


class TestExpectedSetComesFromTheHarness:
    def test_it_reads_the_harness_rather_than_a_list_in_this_file(self):
        expected = cr.expected_workflows()
        assert expected, "no expected pipelines found — the harness path is wrong"
        # Everything expected exists as a real file in the harness.
        for name in expected:
            assert (cr.HARNESS_WORKFLOWS / name).exists(), name

    def test_the_deliberate_exclusions_are_written_down_with_reasons(self):
        # Excluding a pipeline from "expected" is a judgement, so it is recorded rather than
        # buried in a filter — and each one says why.
        assert cr.NOT_UNIVERSALLY_EXPECTED
        for name, reason in cr.NOT_UNIVERSALLY_EXPECTED.items():
            assert reason.strip(), name
            assert name not in cr.expected_workflows()

    def test_a_deploy_pipeline_is_not_expected_of_every_project(self):
        assert "deploy-dev.yml" not in cr.expected_workflows()


class TestMissingChecks:
    def test_a_project_with_no_pipelines_is_told_exactly_which_are_missing(self, tmp_path):
        present, missing = cr.check_installed_checks(tmp_path)
        assert present["state"] == "no"
        assert missing["state"] == "yes"
        for name in cr.expected_workflows():
            assert name in missing["detail"], name

    def test_a_fully_wired_project_reports_nothing_missing(self, tmp_path):
        wf = tmp_path / ".github" / "workflows"
        wf.mkdir(parents=True)
        for name in cr.expected_workflows():
            (wf / name).write_text("name: x\n", encoding="utf-8")
        present, missing = cr.check_installed_checks(tmp_path)
        assert present["state"] == "yes"
        assert missing["state"] == "no"

    def test_a_partly_wired_project_names_only_what_is_absent(self, tmp_path):
        expected = list(cr.expected_workflows())
        wf = tmp_path / ".github" / "workflows"
        wf.mkdir(parents=True)
        (wf / expected[0]).write_text("name: x\n", encoding="utf-8")
        _, missing = cr.check_installed_checks(tmp_path)
        assert missing["state"] == "yes"
        assert expected[0] not in missing["detail"]
        assert expected[1] in missing["detail"]

    def test_an_extra_pipeline_a_project_added_is_not_a_problem(self, tmp_path):
        wf = tmp_path / ".github" / "workflows"
        wf.mkdir(parents=True)
        for name in cr.expected_workflows():
            (wf / name).write_text("name: x\n", encoding="utf-8")
        (wf / "a-project-of-its-own.yml").write_text("name: x\n", encoding="utf-8")
        _, missing = cr.check_installed_checks(tmp_path)
        assert missing["state"] == "no"

    def test_it_compares_FILES_not_what_the_host_has_reported(self, tmp_path):
        # A pipeline that has never run reports no check on the code host, so asking the host
        # would call a correctly-installed but not-yet-triggered pipeline missing. This is a
        # file comparison on purpose, and needs no network at all.
        wf = tmp_path / ".github" / "workflows"
        wf.mkdir(parents=True)
        for name in cr.expected_workflows():
            (wf / name).write_text("name: x\n", encoding="utf-8")
        _, missing = cr.check_installed_checks(tmp_path)
        assert missing["state"] == "no"


class TestThreeAnswersNotTwo:
    def test_every_check_state_is_one_of_three(self, tmp_path, monkeypatch):
        monkeypatch.setattr(cr, "_gh", lambda *a, **k: (False, "no code host here"))
        for check in cr.report(tmp_path)["checks"]:
            assert check["state"] in ("yes", "no", "unknown"), check

    def test_an_unreachable_host_is_UNKNOWN_where_it_cannot_tell(self, tmp_path, monkeypatch):
        # Not "no". "I could not look" and "the answer is no" send a person to two different
        # places, and only one of them is a problem with the project.
        monkeypatch.setattr(cr, "_gh", lambda *a, **k: (False, "gh unavailable"))
        states = {c["check"]: c["state"] for c in cr.report(tmp_path)["checks"]}
        assert states["can_open_prs"] == "unknown"
        assert states["branch_protected"] == "unknown"

    def test_every_check_carries_a_question_and_a_detail(self, tmp_path, monkeypatch):
        monkeypatch.setattr(cr, "_gh", lambda *a, **k: (False, ""))
        for check in cr.report(tmp_path)["checks"]:
            assert check["question"].endswith("?"), check
            assert check["detail"].strip(), check


class TestNeverRaises:
    def test_a_missing_code_host_is_an_answer_not_a_crash(self, tmp_path, monkeypatch):
        def boom(*a, **k):
            raise OSError("gh not installed")
        monkeypatch.setattr(cr.subprocess, "run", boom)
        result = cr.report(tmp_path)
        assert result["ok"] is True
        assert len(result["checks"]) == 6

    def test_unreadable_host_output_does_not_crash(self, tmp_path, monkeypatch):
        monkeypatch.setattr(cr, "_gh", lambda *a, **k: (True, "not json"))
        assert cr.check_branch_protected(tmp_path)["state"] == "unknown"
