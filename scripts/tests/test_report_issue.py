"""report_issue.py — the I/O CLI behind /sdlc-report-issue (questions, env, new, check, list,
file, promote, set-status), for bugs in the product the team is building.

Covers: dual mode (--repo bare folder / --state via conftest's state_yaml); `new` writes nothing
until the minimum is met and lists every gap (exit 1); an AI name or a secret is exit 2 with
nothing written; the happy path copies the screenshot in, writes the report from the template,
appends the ledger, and `check` then reads COMPLETE; `list --json` carries no per-person
aggregation; `file --dry-run` prints the exact gh / az argv and runs nothing; `file` records the
URL the CLI returned (through an injected fake CLI on PATH); `promote` scaffolds a bugfix spec
through new_spec.py with the person's confirmed tier and links the two; `set-status` needs a
reason for wont-fix / duplicate; `--escaped-from` records scorecard.py's own event;
`.sdlc/state.yaml` is byte-identical around every verb; `--help` exits 0 for the script and
every verb.
"""

import json
import os
import stat
import subprocess
import sys
from pathlib import Path

import pytest

import issue_model as im
import report_issue as ri
from tests.test_issue_model import png_bytes

PLUGIN_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = PLUGIN_ROOT / "scripts" / "report_issue.py"


def run(args: list[str], cwd: Path | None = None, env: dict | None = None) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, encoding="utf-8",
                          cwd=str(cwd) if cwd else None, env={**os.environ, "PYTHONIOENCODING": "utf-8", **(env or {})})


@pytest.fixture
def repo(tmp_path) -> Path:
    r = tmp_path / "repo"
    r.mkdir()
    return r


@pytest.fixture
def shot(tmp_path) -> Path:
    p = tmp_path / "shot.png"
    p.write_bytes(png_bytes())
    return p


TITLE = "Claim total doubles after adding a second line item"


def base_new(repo: Path, shot: Path, **over) -> list[str]:
    fields = {
        "--title": TITLE, "--channel": "web",
        "--what": "Adding a second line item shows the claim total as twice the sum of the two lines.",
        "--expected": "The total is the sum of the line items", "--environment": "test", "--severity": "degraded",
        "--frequency": "always", "--data-impact": "wrong-shown", "--persona": "a claims adjuster", "--reporter-role": "checker",
        "--by": "Priya N.",
    }
    fields.update(over)
    argv = ["new", "--repo", str(repo)]
    for k, v in fields.items():
        if v is not None:
            argv += [k, v]
    argv += ["--steps", "open claim 1042", "--steps", "add a line item of 100", "--screenshot", str(shot), "--no-client-data",
             "--answer", "browser_device=Chrome 130 on Windows 11", "--answer", "last_action=clicked Add line item"]
    return argv


class TestQuestionsAndEnv:
    def test_questions_json_is_the_model_s_plan_for_the_channel(self):
        proc = run(["questions", "--channel", "api", "--json"])
        assert proc.returncode == 0, proc.stderr
        doc = json.loads(proc.stdout)
        assert doc["channel"] == "api"
        assert [q["id"] for q in doc["questions"]] == [q["id"] for q in im.question_plan("api")]
        assert doc["minimum"]["screenshots"] == 1

    def test_questions_text_lists_every_question_with_its_kind(self):
        proc = run(["questions"])
        assert proc.returncode == 0
        for q in im.question_plan(None):
            assert q["id"] in proc.stdout

    def test_an_unknown_channel_is_exit_1(self):
        proc = run(["questions", "--channel", "mainframe"])
        assert proc.returncode == 1 and "not a channel" in proc.stdout

    def test_env_json_is_about_the_build_under_test_and_reads_null_for_what_is_not_there(self, repo):
        proc = run(["env", "--repo", str(repo), "--app-version", "0.1.0", "--json"])
        assert proc.returncode == 0, proc.stderr
        doc = json.loads(proc.stdout)
        assert doc["repo"]["host"] == "none" and doc["repo"]["slug"] is None
        assert doc["repo"]["branch"] is None and doc["repo"]["commit"] is None  # not a repository
        assert doc["machine"]["os"]
        assert doc["tooling"]["plugin_version"] == json.loads((PLUGIN_ROOT / ".claude-plugin" / "plugin.json").read_text())["version"]
        assert doc["tooling"]["app_version"] == "0.1.0"

    def test_env_reads_the_repository_when_there_is_one(self, repo):
        subprocess.run(["git", "init", "-q", repo], check=True)
        subprocess.run(["git", "-C", str(repo), "remote", "add", "origin", "https://github.com/acme/claims.git"], check=True)
        doc = json.loads(run(["env", "--repo", str(repo), "--json"]).stdout)
        assert doc["repo"]["host"] == "github" and doc["repo"]["slug"] == "acme/claims"
        text = run(["env", "--repo", str(repo)]).stdout
        assert "acme/claims" in text and "The build under test" in text


class TestNew:
    def test_the_minimum_is_enforced_every_gap_named_nothing_written(self, repo, shot):
        proc = run(["new", "--repo", str(repo), "--title", "short", "--channel", "web", "--what", "it broke",
                    "--expected", "x", "--environment", "moon", "--severity", "bad", "--frequency", "always", "--data-impact", "none",
                    "--persona", "", "--reporter-role", "tester", "--screenshot", str(shot), "--by", "Priya N."])
        assert proc.returncode == 1
        for gap in ("title:", "what_happened:", "expected:", "steps:", "environment:", "severity:", "persona:", "reporter_role:",
                    "browser_device:", "last_action:", "no_client_data:"):
            assert gap in proc.stdout, gap
        assert not (repo / ".sdlc").exists()

    def test_the_gaps_are_json_when_asked(self, repo, shot):
        proc = run(["new", "--repo", str(repo), "--title", "short", "--channel", "other", "--what", "it broke", "--expected", "x",
                    "--environment", "test", "--severity", "cosmetic", "--frequency", "once", "--data-impact", "none", "--persona", "admin",
                    "--reporter-role", "other", "--screenshot", str(shot), "--by", "Priya N.", "--json"])
        assert proc.returncode == 1
        doc = json.loads(proc.stdout)
        assert doc["ok"] is False and doc["refused"] is False and any(g.startswith("where:") for g in doc["gaps"])

    def test_an_ai_name_is_refused_exit_2_nothing_written(self, repo, shot):
        proc = run(base_new(repo, shot, **{"--by": "Claude"}))
        assert proc.returncode == 2 and "reads as an AI" in proc.stdout
        assert not (repo / ".sdlc").exists()

    def test_a_secret_is_refused_exit_2_without_echoing_it(self, repo, shot):
        token = "ghp_abcdefghijklmnopqrstuvwxyz012345"
        proc = run(base_new(repo, shot, **{"--what": f"the error page printed {token} in the details column of the row"}))
        assert proc.returncode == 2 and "GitHub token" in proc.stdout and token not in proc.stdout
        assert not (repo / ".sdlc").exists()

    def test_an_answer_may_not_stand_in_for_one_of_new_s_own_fields(self, repo, shot):
        proc = run(base_new(repo, shot) + ["--answer", "no_client_data=1"])
        assert proc.returncode == 1 and "one of new's own fields" in proc.stdout
        proc = run(base_new(repo, shot) + ["--answer", "title=something else"])
        assert proc.returncode == 1 and "one of new's own fields" in proc.stdout
        assert not (repo / ".sdlc").exists()

    def test_a_channel_typed_in_capitals_is_written_in_the_plugin_s_own_lower_case(self, repo, shot):
        proc = run(base_new(repo, shot, **{"--channel": "WEB"}) + ["--json"])
        assert proc.returncode == 0, proc.stdout
        report = next((repo / ".sdlc" / "issues").glob("ISS-0001-*.md")).read_text(encoding="utf-8")
        assert 'channel: "web"' in report
        assert run(["check", "--repo", str(repo), "--issue", "ISS-0001"]).returncode == 0

    def test_a_secret_in_an_extra_answer_is_refused_too(self, repo, shot):
        proc = run(base_new(repo, shot) + ["--answer", "extra=token ghp_abcdefghijklmnopqrstuvwxyz012345"])
        assert proc.returncode == 2 and "GitHub token" in proc.stdout

    def test_a_heading_typed_inside_the_words_stays_their_sentence(self, repo, shot):
        proc = run(base_new(repo, shot, **{"--what": "The totals page shows this:\n## Steps\nand then doubles the sum of the two lines."}))
        assert proc.returncode == 0, proc.stdout
        check = run(["check", "--repo", str(repo), "--issue", "ISS-0001", "--json"])
        assert check.returncode == 0
        doc = json.loads(run(["show", "--repo", str(repo), "--issue", "ISS-0001", "--json"]).stdout)
        assert "Steps" not in doc["sections"] and "\\## Steps" in doc["sections"]["What happened"]

    def test_a_deleted_report_s_id_is_never_given_out_again(self, repo, shot):
        assert run(base_new(repo, shot)).returncode == 0
        for p in (repo / ".sdlc" / "issues").glob("ISS-0001-*.md"):
            p.unlink()
        proc = run(base_new(repo, shot, **{"--title": "Second one, a different bug entirely"}) + ["--json"])
        assert json.loads(proc.stdout)["issue"] == "ISS-0002"

    def test_a_screenshot_that_is_not_an_image_is_a_gap(self, repo, tmp_path):
        fake = tmp_path / "shot.png"
        fake.write_bytes(b"hello")
        proc = run(base_new(repo, fake))
        assert proc.returncode == 1 and "not a PNG, JPEG, GIF or WebP" in proc.stdout

    def test_the_happy_path_writes_the_report_copies_the_screenshot_and_appends_the_ledger(self, repo, shot):
        proc = run(base_new(repo, shot, **{"--spec": "0007"}) + ["--answer", "url=https://test.claims.example/claims/1042", "--json"])
        assert proc.returncode == 0, proc.stdout + proc.stderr
        doc = json.loads(proc.stdout)
        assert doc["ok"] is True and doc["issue"] == "ISS-0001" and doc["status"] == "new"
        assert doc["proposed_risk"] == "MEDIUM" and doc["proposed_priority"] == "P2"
        assert doc["path"] == ".sdlc/issues/ISS-0001-claim-total-doubles-after-adding-a-second-line-i.md"
        assert doc["screenshots"] == [".sdlc/issues/ISS-0001/screenshot-1.png"]
        report = (repo / doc["path"]).read_text(encoding="utf-8")
        assert report.startswith(f'---\nissue: "ISS-0001"\ntitle: "{TITLE}"\nstatus: new\nchannel: "web"\nenvironment: "test"\n')
        assert 'priority: ""' in report and 'target_sprint: ""' in report and 'triaged_by: ""' in report
        assert 'data_impact: "wrong-shown"' in report and 'persona: "a claims adjuster"' in report and 'reporter_role: "checker"' in report
        assert 'spec: "0007"' in report and 'reported_by: "Priya N."' in report and 'bugfix_spec: ""' in report
        assert "## What happened" in report and "1. open claim 1042\n2. add a line item of 100" in report
        assert "| Channel | The web UI (a screen in the browser) |" in report and "| Channel descriptor | channels/ag-ui.yaml |" in report
        assert "| Browser and device | Chrome 130 on Windows 11 |" in report and "| The page's address | https://test.claims.example/claims/1042 |" in report
        assert "| environment | Test / QA |" in report and "| repository | not recorded |" in report
        assert "![screenshot 1](ISS-0001/screenshot-1.png)" in report
        assert "Priya N. confirmed on" in report and "reported by Priya N." in report
        assert (repo / ".sdlc" / "issues" / "ISS-0001" / "screenshot-1.png").read_bytes() == shot.read_bytes()
        ledger = [json.loads(l) for l in (repo / ".sdlc" / "metrics" / "issue-log.jsonl").read_text().splitlines()]
        assert ledger[0]["event"] == "reported" and ledger[0]["issue"] == "ISS-0001" and ledger[0]["by"] == "Priya N."
        assert ledger[0]["channel"] == "web" and ledger[0]["environment"] == "test" and ledger[0]["data_impact"] == "wrong-shown"
        assert "velocity" not in str(ledger) and "points" not in str(ledger)

    def test_ids_climb_and_the_second_report_is_0002(self, repo, shot):
        assert run(base_new(repo, shot)).returncode == 0
        proc = run(base_new(repo, shot, **{"--title": "Second one, a different bug entirely"}) + ["--json"])
        assert json.loads(proc.stdout)["issue"] == "ISS-0002"

    def test_steps_with_newlines_in_one_value_split_into_lines(self, repo, shot):
        proc = run(base_new(repo, shot) + ["--steps", "add a second of 50\nread the total"])
        assert proc.returncode == 0
        report = next((repo / ".sdlc" / "issues").glob("ISS-0001-*.md")).read_text(encoding="utf-8")
        assert "3. add a second of 50\n4. read the total" in report

    def test_env_json_feeds_the_environment_table_and_a_local_run_takes_the_commit_from_it(self, repo, shot, tmp_path):
        env_doc = tmp_path / "env.json"
        env_doc.write_text(json.dumps({"repo": {"host": "github", "slug": "acme/claims", "branch": "spec/0007-x", "commit": "abc1234"},
                                       "machine": {"os": "Windows-11"}, "tooling": {"plugin_version": "1.8.0", "app_version": "0.1.0"}}))
        proc = run(base_new(repo, shot, **{"--environment": "local"}) + ["--env-json", str(env_doc)])
        assert proc.returncode == 0, proc.stdout
        report = next((repo / ".sdlc" / "issues").glob("ISS-0001-*.md")).read_text(encoding="utf-8")
        assert 'product_version: "spec/0007-x @ abc1234"' in report
        assert "| repository | acme/claims |" in report and "| commit | abc1234 |" in report and "| reporter_machine | Windows-11 |" in report
        assert "| written_with | plugin 1.8.0, app 0.1.0 |" in report

    def test_a_product_version_given_by_hand_wins(self, repo, shot):
        proc = run(base_new(repo, shot, **{"--environment": "staging", "--product-version": "v2.3.1 (build 884)"}))
        assert proc.returncode == 0, proc.stdout
        report = next((repo / ".sdlc" / "issues").glob("ISS-0001-*.md")).read_text(encoding="utf-8")
        assert 'product_version: "v2.3.1 (build 884)"' in report

    def test_workflow_mode_through_state_leaves_state_yaml_byte_identical(self, state_yaml, sdlc_dir, shot):
        before = (sdlc_dir / "state.yaml").read_bytes()
        proc = run(["new", "--state", str(sdlc_dir / "state.yaml")] + base_new(Path("."), shot)[3:])
        assert proc.returncode == 0, proc.stdout + proc.stderr
        assert (sdlc_dir / "state.yaml").read_bytes() == before
        assert list((sdlc_dir / "issues").glob("ISS-0001-*.md"))

    def test_a_missing_state_file_is_exit_1(self, tmp_path, shot):
        proc = run(["new", "--state", str(tmp_path / "nope" / "state.yaml")] + base_new(Path("."), shot)[3:])
        assert proc.returncode == 1 and "state file not found" in proc.stdout

    def test_escaped_from_records_scorecard_s_own_event(self, repo, shot):
        proc = run(base_new(repo, shot, **{"--environment": "production", "--escaped-from": "grader"}) + ["--json"])
        assert proc.returncode == 0, proc.stdout
        doc = json.loads(proc.stdout)
        assert doc["warnings"] == [] and doc["advisory"] == []
        events = [json.loads(l) for l in (repo / ".sdlc" / "metrics" / "loop-events.jsonl").read_text().splitlines()]
        assert events[-1]["type"] == "escaped_bug" and events[-1]["which_check"] == "grader" and events[-1]["issue"] == "ISS-0001"

    def test_a_production_bug_without_the_check_is_written_with_the_advisory(self, repo, shot):
        proc = run(base_new(repo, shot, **{"--environment": "production"}) + ["--json"])
        assert proc.returncode == 0
        assert any(a.startswith("escaped_from:") for a in json.loads(proc.stdout)["advisory"])


class TestCheckListAndStatus:
    def test_check_reads_complete_for_a_written_report_and_incomplete_once_a_section_is_emptied(self, repo, shot):
        assert run(base_new(repo, shot)).returncode == 0
        ok = run(["check", "--repo", str(repo), "--issue", "ISS-0001", "--json"])
        assert ok.returncode == 0
        assert json.loads(ok.stdout)["verdict"] == "COMPLETE" and json.loads(ok.stdout)["proposed_risk"] == "MEDIUM"
        path = next((repo / ".sdlc" / "issues").glob("ISS-0001-*.md"))
        text = path.read_text(encoding="utf-8")
        path.write_text(text.replace("## Steps to reproduce\n\n1. open claim 1042\n2. add a line item of 100", "## Steps to reproduce\n"), encoding="utf-8")
        bad = run(["check", "--repo", str(repo), "--issue", "0001", "--json"])
        assert bad.returncode == 1
        doc = json.loads(bad.stdout)
        assert doc["verdict"] == "INCOMPLETE" and any(g.startswith("steps:") for g in doc["blocking"])

    def test_a_path_that_is_not_a_report_is_refused_by_every_verb_that_would_write_to_it(self, repo, shot):
        assert run(base_new(repo, shot)).returncode == 0
        other = subprocess.run([sys.executable, str(PLUGIN_ROOT / "scripts" / "new_spec.py"), "--repo", str(repo), "--name", "policy lookup", "--json"],
                               capture_output=True, text=True, encoding="utf-8")
        spec_rel = json.loads(other.stdout)["path"]
        before = (repo / spec_rel).read_bytes()
        for argv in (["note", "--note", "a note that must not land in a spec", "--by", "Sam K"],
                     ["triage", "--verdict", "confirmed", "--by", "Sam K"],
                     ["set-status", "--status", "fixed", "--by", "Sam K"],
                     ["show"], ["check"]):
            proc = run([argv[0], "--repo", str(repo), "--issue", spec_rel, *argv[1:]])
            assert proc.returncode == 1 and "is not an issue report" in proc.stdout, argv
        assert (repo / spec_rel).read_bytes() == before
        state = repo / ".sdlc" / "metrics" / "issue-log.jsonl"
        assert run(["note", "--repo", str(repo), "--issue", str(state), "--note", "x", "--by", "Sam K"]).returncode == 1

    def test_check_names_an_unknown_issue(self, repo):
        proc = run(["check", "--repo", str(repo), "--issue", "ISS-0042"])
        assert proc.returncode == 1 and "no report ISS-0042" in proc.stdout

    def test_list_is_newest_first_and_carries_no_per_person_aggregation(self, repo, shot):
        assert run(base_new(repo, shot)).returncode == 0
        assert run(base_new(repo, shot, **{"--title": "Second one, a different bug entirely", "--by": "Sam K"})).returncode == 0
        proc = run(["list", "--repo", str(repo), "--json"])
        doc = json.loads(proc.stdout)
        assert [r["issue"] for r in doc["issues"]] == ["ISS-0002", "ISS-0001"]
        assert doc["count"] == 2
        assert {r["reported_by"] for r in doc["issues"]} == {"Priya N.", "Sam K"}
        assert doc["issues"][0]["environment"] == "test" and doc["issues"][0]["channel"] == "web" and doc["issues"][0]["bugfix_spec"] is None
        assert doc["issues"][0]["status"] == "new" and doc["issues"][0]["proposed_priority"] == "P2"
        assert doc["counts"]["new"] == 2 and doc["counts"]["fixed"] == 0 and doc["queue"] == ["ISS-0002", "ISS-0001"]
        assert not {k for k in doc if "per_" in k or "by_person" in k}
        text = run(["list", "--repo", str(repo)]).stdout
        assert "ISS-0002" in text and "Second one" in text

    def test_list_with_nothing_reads_no_data(self, repo):
        proc = run(["list", "--repo", str(repo)])
        assert proc.returncode == 0 and proc.stdout.startswith("no data")
        doc = json.loads(run(["list", "--repo", str(repo), "--json"]).stdout)
        assert doc["issues"] == [] and doc["count"] == 0 and doc["queue"] == [] and doc["dir"] == ".sdlc/issues"
        assert set(doc["counts"]) == set(im.STATUSES) and set(doc["counts"].values()) == {0}

    def test_set_status_follows_the_lifecycle_and_needs_a_reason_or_a_duplicate_target(self, repo, shot):
        assert run(base_new(repo, shot)).returncode == 0
        assert run(base_new(repo, shot, **{"--title": "Second one, a different bug entirely"})).returncode == 0
        fixed = run(["set-status", "--repo", str(repo), "--issue", "ISS-0001", "--status", "fixed", "--by", "Sam K"])
        assert fixed.returncode == 1 and "nobody has confirmed the bug" in fixed.stdout
        short = run(["set-status", "--repo", str(repo), "--issue", "ISS-0001", "--status", "wont-fix", "--reason", "nah", "--by", "Sam K"])
        assert short.returncode == 1 and "needs --reason" in short.stdout
        ai = run(["set-status", "--repo", str(repo), "--issue", "ISS-0001", "--status", "wont-fix", "--reason", "we are retiring that screen", "--by", "release bot"])
        assert ai.returncode == 2
        self_dup = run(["set-status", "--repo", str(repo), "--issue", "ISS-0001", "--status", "duplicate", "--of", "ISS-0001", "--by", "Sam K"])
        assert self_dup.returncode == 1 and "duplicate of itself" in self_dup.stdout
        ok = run(["set-status", "--repo", str(repo), "--issue", "ISS-0001", "--status", "duplicate", "--of", "ISS-0002", "--by", "Sam K"])
        assert ok.returncode == 0, ok.stdout
        text = next((repo / ".sdlc" / "issues").glob("ISS-0001-*.md")).read_text(encoding="utf-8")
        assert "\nstatus: duplicate\n" in text and 'duplicate_of: "ISS-0002"' in text and "duplicate of ISS-0002 by Sam K" in text
        again = run(["set-status", "--repo", str(repo), "--issue", "ISS-0001", "--status", "duplicate", "--of", "ISS-0002", "--by", "Sam K"])
        assert again.returncode == 0 and "Nothing changed" in again.stdout
        closed = run(["triage", "--repo", str(repo), "--issue", "ISS-0001", "--verdict", "confirmed", "--by", "Sam K"])
        assert closed.returncode == 1 and "closed report" in closed.stdout and "reopen" in closed.stdout
        events = [json.loads(l) for l in (repo / ".sdlc" / "metrics" / "issue-log.jsonl").read_text().splitlines()]
        assert [e["event"] for e in events] == ["reported", "reported", "status"]
        assert events[-1]["from"] == "new" and events[-1]["to"] == "duplicate" and events[-1]["of"] == "ISS-0002"


def triaged(repo: Path, shot: Path, **over) -> None:
    """A report reviewed and confirmed by someone other than its reporter."""
    assert run(base_new(repo, shot, **over)).returncode == 0
    proc = run(["triage", "--repo", str(repo), "--issue", "ISS-0001", "--verdict", "confirmed", "--by", "Sam K"])
    assert proc.returncode == 0, proc.stdout


class TestTriage:
    def test_the_reporter_may_not_review_their_own_report_unless_they_say_so_with_a_reason(self, repo, shot):
        assert run(base_new(repo, shot)).returncode == 0
        own = run(["triage", "--repo", str(repo), "--issue", "ISS-0001", "--verdict", "confirmed", "--by", "priya n"])
        assert own.returncode == 1 and "someone other than its reporter" in own.stdout
        text = next((repo / ".sdlc" / "issues").glob("ISS-0001-*.md")).read_text(encoding="utf-8")
        assert "\nstatus: new\n" in text
        bare = run(["triage", "--repo", str(repo), "--issue", "ISS-0001", "--verdict", "confirmed", "--override", "--by", "Priya N."])
        assert bare.returncode == 1 and "--override needs --reason" in bare.stdout
        solo = run(["triage", "--repo", str(repo), "--issue", "ISS-0001", "--verdict", "confirmed", "--override", "--reason", "team of one this sprint", "--by", "Priya N.", "--json"])
        assert solo.returncode == 0, solo.stdout
        assert json.loads(solo.stdout)["status"] == "triaged"
        text = next((repo / ".sdlc" / "issues").glob("ISS-0001-*.md")).read_text(encoding="utf-8")
        assert "[override: team of one this sprint]" in text

    def test_confirmed_moves_to_triaged_and_may_correct_severity_and_data_impact(self, repo, shot):
        assert run(base_new(repo, shot)).returncode == 0
        proc = run(["triage", "--repo", str(repo), "--issue", "ISS-0001", "--verdict", "confirmed", "--severity", "blocks",
                    "--data-impact", "wrong-written", "--reason", "reproduced on test with claim 1042", "--by", "Sam K", "--json"])
        assert proc.returncode == 0, proc.stdout
        doc = json.loads(proc.stdout)
        assert doc["status"] == "triaged" and doc["triaged_by"] == "Sam K"
        assert doc["proposed_priority"] == "P1" and doc["proposed_risk"] == "HIGH"  # the corrections moved the proposals
        text = next((repo / ".sdlc" / "issues").glob("ISS-0001-*.md")).read_text(encoding="utf-8")
        assert "\nstatus: triaged\n" in text and 'severity: "blocks"' in text and 'data_impact: "wrong-written"' in text
        assert 'triaged_by: "Sam K"' in text and 'triage_verdict: "confirmed"' in text
        assert "triage by Sam K: confirmed (severity degraded → blocks; data impact wrong-shown → wrong-written) — reproduced on test" in text
        events = [json.loads(l) for l in (repo / ".sdlc" / "metrics" / "issue-log.jsonl").read_text().splitlines()]
        assert events[-1]["event"] == "triaged" and events[-1]["verdict"] == "confirmed" and events[-1]["from"] == "new" and events[-1]["to"] == "triaged"

    def test_needs_info_asks_a_question_and_a_note_answers_it_then_triage_again(self, repo, shot):
        assert run(base_new(repo, shot)).returncode == 0
        bare = run(["triage", "--repo", str(repo), "--issue", "ISS-0001", "--verdict", "needs-info", "--by", "Sam K"])
        assert bare.returncode == 1 and "needs --question" in bare.stdout
        asked = run(["triage", "--repo", str(repo), "--issue", "ISS-0001", "--verdict", "needs-info", "--question", "Which claim type was it — motor or property?", "--by", "Sam K"])
        assert asked.returncode == 0, asked.stdout
        text = next((repo / ".sdlc" / "issues").glob("ISS-0001-*.md")).read_text(encoding="utf-8")
        assert "\nstatus: needs-info\n" in text and "asked: Which claim type" in text
        note = run(["note", "--repo", str(repo), "--issue", "ISS-0001", "--note", "Motor, a comprehensive policy", "--by", "Priya N."])
        assert note.returncode == 0 and "triage it again" in note.stdout
        text = next((repo / ".sdlc" / "issues").glob("ISS-0001-*.md")).read_text(encoding="utf-8")
        assert "note by Priya N.: Motor, a comprehensive policy" in text
        again = run(["triage", "--repo", str(repo), "--issue", "ISS-0001", "--verdict", "confirmed", "--by", "Sam K"])
        assert again.returncode == 0 and "triaged" in again.stdout

    def test_duplicate_needs_an_existing_other_report_and_wont_fix_a_reason(self, repo, shot):
        assert run(base_new(repo, shot)).returncode == 0
        assert run(base_new(repo, shot, **{"--title": "Second one, a different bug entirely"})).returncode == 0
        missing = run(["triage", "--repo", str(repo), "--issue", "ISS-0002", "--verdict", "duplicate", "--of", "ISS-0042", "--by", "Sam K"])
        assert missing.returncode == 1 and "no such report" in missing.stdout
        dup = run(["triage", "--repo", str(repo), "--issue", "ISS-0002", "--verdict", "duplicate", "--of", "iss-0001", "--by", "Sam K", "--json"])
        assert dup.returncode == 0 and json.loads(dup.stdout)["status"] == "duplicate"
        text = next((repo / ".sdlc" / "issues").glob("ISS-0002-*.md")).read_text(encoding="utf-8")
        assert 'duplicate_of: "ISS-0001"' in text
        wf = run(["triage", "--repo", str(repo), "--issue", "ISS-0001", "--verdict", "wont-fix", "--reason", "short", "--by", "Sam K"])
        assert wf.returncode == 1 and "needs --reason" in wf.stdout
        wf = run(["triage", "--repo", str(repo), "--issue", "ISS-0001", "--verdict", "wont-fix", "--reason", "that screen is retired in S09", "--by", "Sam K"])
        assert wf.returncode == 0 and "won't fix" in wf.stdout

    def test_a_note_with_a_secret_is_refused(self, repo, shot):
        assert run(base_new(repo, shot)).returncode == 0
        proc = run(["note", "--repo", str(repo), "--issue", "ISS-0001", "--note", "token was ghp_abcdefghijklmnopqrstuvwxyz012345", "--by", "Sam K"])
        assert proc.returncode == 2 and "GitHub token" in proc.stdout
        reason = run(["triage", "--repo", str(repo), "--issue", "ISS-0001", "--verdict", "wont-fix", "--reason", "see sk-abcdefghijklmnopqrstuvwxyz0123456789 in the logs", "--by", "Sam K"])
        assert reason.returncode == 2 and "API key" in reason.stdout

    def test_a_refusal_names_only_the_actions_the_lifecycle_allows_from_here(self, repo, shot):
        prioritized(repo, shot)
        assert run(["promote", "--repo", str(repo), "--issue", "ISS-0001", "--risk", "MEDIUM", "--by", "Sam K"]).returncode == 0
        proc = run(["triage", "--repo", str(repo), "--issue", "ISS-0001", "--verdict", "confirmed", "--by", "Sam K"])
        assert proc.returncode == 1 and "the lifecycle allows:" in proc.stdout
        allowed = proc.stdout.split("the lifecycle allows:")[1]
        assert "prioritize" not in allowed and "promote" not in allowed and "set-status fixed" in allowed

    def test_reopen_clears_the_review_and_the_priority_but_keeps_the_bugfix_spec_on_the_record(self, repo, shot):
        prioritized(repo, shot, target=None)
        assert run(["promote", "--repo", str(repo), "--issue", "ISS-0001", "--risk", "MEDIUM", "--by", "Sam K"]).returncode == 0
        assert run(["set-status", "--repo", str(repo), "--issue", "ISS-0001", "--status", "fixed", "--by", "Sam K"]).returncode == 0
        again = run(["set-status", "--repo", str(repo), "--issue", "ISS-0001", "--status", "fixed", "--by", "Sam K", "--json"])
        assert json.loads(again.stdout) == {"ok": True, "issue": "ISS-0001", "status": "fixed", "changed": False, "message": "already fixed; nothing changed"}
        ok = run(["reopen", "--repo", str(repo), "--issue", "ISS-0001", "--reason", "the total doubles again on test", "--by", "Priya N."])
        assert ok.returncode == 0
        text = next((repo / ".sdlc" / "issues").glob("ISS-0001-*.md")).read_text(encoding="utf-8")
        assert 'priority: ""' in text and 'target_sprint: ""' in text and 'prioritized_by: ""' in text and 'bugfix_spec: "0001"' in text
        assert "bugfix spec 0001 kept on the record" in text


class TestPrioritize:
    def test_prioritize_needs_a_triaged_report_and_a_priority_naming_the_proposal(self, repo, shot):
        assert run(base_new(repo, shot)).returncode == 0
        early = run(["prioritize", "--repo", str(repo), "--issue", "ISS-0001", "--priority", "P1", "--by", "Sam K"])
        assert early.returncode == 1 and "reviewed and confirmed" in early.stdout
        assert run(["triage", "--repo", str(repo), "--issue", "ISS-0001", "--verdict", "confirmed", "--by", "Sam K"]).returncode == 0
        bare = run(["prioritize", "--repo", str(repo), "--issue", "ISS-0001", "--by", "Sam K"])
        assert bare.returncode == 1 and "the proposal from this report is P2" in bare.stdout
        bad = run(["prioritize", "--repo", str(repo), "--issue", "ISS-0001", "--priority", "P9", "--by", "Sam K"])
        assert bad.returncode == 1 and "P1, P2 or P3" in bad.stdout

    def test_prioritize_records_the_priority_and_the_target_sprint_and_notes_a_changed_proposal(self, repo, shot):
        triaged(repo, shot)
        proc = run(["prioritize", "--repo", str(repo), "--issue", "ISS-0001", "--priority", "P1", "--target-sprint", "s08", "--reason", "the demo is Friday", "--by", "Sam K", "--json"])
        assert proc.returncode == 0, proc.stdout
        doc = json.loads(proc.stdout)
        assert doc["status"] == "prioritized" and doc["priority"] == "P1" and doc["proposed_priority"] == "P2" and doc["target_sprint"] == "S08"
        assert doc["warnings"] == ["no sprint records yet; S08 is recorded as typed"]
        text = next((repo / ".sdlc" / "issues").glob("ISS-0001-*.md")).read_text(encoding="utf-8")
        assert 'priority: "P1"' in text and 'target_sprint: "S08"' in text and 'prioritized_by: "Sam K"' in text
        assert "prioritized by Sam K: P1 → S08 — the proposal was P2 — the demo is Friday" in text
        again = run(["prioritize", "--repo", str(repo), "--issue", "ISS-0001", "--priority", "P2", "--by", "Sam K"])
        assert again.returncode == 0  # a priority may be revised while the report is prioritized

    def test_a_target_sprint_must_be_an_open_sprint_once_sprint_records_exist(self, repo, shot):
        triaged(repo, shot)
        new_sprint = run_sprint(repo, ["new", "--sprint", "S07", "--goal", "Adjusters file without a phone call", "--start", "2026-10-05", "--target", "3", "--by", "Pod Lead"])
        assert new_sprint.returncode == 0, new_sprint.stdout
        unknown = run(["prioritize", "--repo", str(repo), "--issue", "ISS-0001", "--priority", "P2", "--target-sprint", "S09", "--by", "Sam K"])
        assert unknown.returncode == 1 and "lists no such sprint" in unknown.stdout and "S07" in unknown.stdout
        bad_id = run(["prioritize", "--repo", str(repo), "--issue", "ISS-0001", "--priority", "P2", "--target-sprint", "sprint7", "--by", "Sam K"])
        assert bad_id.returncode == 1 and "not a sprint id" in bad_id.stdout
        ok = run(["prioritize", "--repo", str(repo), "--issue", "ISS-0001", "--priority", "P2", "--target-sprint", "S07", "--by", "Sam K", "--json"])
        assert ok.returncode == 0 and json.loads(ok.stdout)["warnings"] == []


def run_sprint(repo: Path, args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(PLUGIN_ROOT / "scripts" / "sprint.py"), *args, "--repo", str(repo)], capture_output=True,
                          text=True, encoding="utf-8", env={**os.environ, "PYTHONIOENCODING": "utf-8"})


def fake_cli(bin_dir: Path, name: str, body: str) -> None:
    """A stand-in `gh` / `az` on PATH that prints what the real one prints and records its argv."""
    script = bin_dir / name
    script.write_text("#!/bin/sh\n" + body, encoding="utf-8")
    script.chmod(script.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def with_origin(repo: Path, url: str) -> None:
    subprocess.run(["git", "init", "-q", repo], check=True)
    subprocess.run(["git", "-C", str(repo), "remote", "add", "origin", url], check=True)


class TestFile:
    def test_dry_run_prints_the_exact_gh_argv_and_runs_nothing(self, repo, shot):
        with_origin(repo, "https://github.com/acme/claims.git")
        assert run(base_new(repo, shot)).returncode == 0
        proc = run(["file", "--repo", str(repo), "--issue", "ISS-0001", "--dry-run", "--by", "Priya N.", "--json"])
        assert proc.returncode == 0, proc.stdout
        doc = json.loads(proc.stdout)
        assert doc["dry_run"] is True and doc["host"] == "github"
        assert doc["argv"][:5] == ["gh", "issue", "create", "--title", TITLE]
        assert "--body-file" in doc["argv"] and doc["argv"][-2:] == ["--repo", "acme/claims"]
        body = Path(doc["body"]).read_text(encoding="utf-8")
        assert "### Steps to reproduce" in body and "ISS-0001" in body and "1 in the repository under" in body
        assert "seen on the web channel as a claims adjuster" in body
        # A dry run writes NOTHING into the repository: the body is a temp file, named as such.
        assert not Path(doc["body"]).resolve().is_relative_to(repo.resolve())
        assert "temporary file" in doc["note"]
        assert not (repo / ".sdlc" / "issues" / "ISS-0001" / "host-body.md").exists()
        text = next((repo / ".sdlc" / "issues").glob("ISS-0001-*.md")).read_text(encoding="utf-8")
        assert 'filed_url: ""' in text  # a dry run files nothing

    def test_dry_run_builds_the_az_work_item_command_from_the_remote(self, repo, shot):
        with_origin(repo, "https://dev.azure.com/acme/Claims/_git/claims")
        assert run(base_new(repo, shot)).returncode == 0
        proc = run(["file", "--repo", str(repo), "--issue", "ISS-0001", "--dry-run", "--label", "bug", "--by", "Priya N.", "--json"])
        assert proc.returncode == 0, proc.stdout
        argv = json.loads(proc.stdout)["argv"]
        assert argv[:6] == ["az", "boards", "work-item", "create", "--type", "Bug"]
        assert "--org" in argv and argv[argv.index("--org") + 1] == "https://dev.azure.com/acme"
        assert argv[argv.index("--project") + 1] == "Claims"
        assert argv[-2:] == ["--fields", "System.Tags=bug"]

    def test_no_code_host_is_exit_1_with_the_way_out(self, repo, shot):
        assert run(base_new(repo, shot)).returncode == 0
        proc = run(["file", "--repo", str(repo), "--issue", "ISS-0001", "--dry-run", "--by", "Priya N."])
        assert proc.returncode == 1 and "no code host" in proc.stdout
        assert not (repo / ".sdlc" / "issues" / "ISS-0001" / "host-body.md").exists()  # said before anything was written

    @pytest.mark.skipif(sys.platform == "win32", reason="the fake CLI is a shell script")
    def test_filing_records_the_url_gh_printed_and_the_ledger_event(self, repo, shot, tmp_path):
        with_origin(repo, "https://github.com/acme/claims.git")
        assert run(base_new(repo, shot)).returncode == 0
        bin_dir = tmp_path / "bin"
        bin_dir.mkdir()
        fake_cli(bin_dir, "gh", 'echo "$@" > "$0.argv"\necho "Creating issue in acme/claims"\necho "https://github.com/acme/claims/issues/17"\n')
        env = {"PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"}
        proc = run(["file", "--repo", str(repo), "--issue", "ISS-0001", "--by", "Priya N.", "--json"], env=env)
        assert proc.returncode == 0, proc.stdout + proc.stderr
        doc = json.loads(proc.stdout)
        assert doc == {"ok": True, "issue": "ISS-0001", "status": "new", "host": "github", "url": "https://github.com/acme/claims/issues/17", "id": "17", "argv": ["gh", "issue", "create"]}
        assert "--title Claim total doubles" in (bin_dir / "gh.argv").read_text()
        text = next((repo / ".sdlc" / "issues").glob("ISS-0001-*.md")).read_text(encoding="utf-8")
        assert "\nstatus: new\n" in text and 'filed_host: "github"' in text and 'filed_url: "https://github.com/acme/claims/issues/17"' in text
        assert "filed on github by Priya N.: https://github.com/acme/claims/issues/17" in text
        events = [json.loads(l) for l in (repo / ".sdlc" / "metrics" / "issue-log.jsonl").read_text().splitlines()]
        assert events[-1]["event"] == "filed" and events[-1]["url"].endswith("/17")
        again = run(["file", "--repo", str(repo), "--issue", "ISS-0001", "--by", "Priya N."], env=env)
        assert again.returncode == 1 and "already filed" in again.stdout

    @pytest.mark.skipif(sys.platform == "win32", reason="the fake CLI is a shell script")
    def test_a_cli_that_says_no_is_exit_1_with_its_words_and_nothing_recorded(self, repo, shot, tmp_path):
        with_origin(repo, "https://github.com/acme/claims.git")
        assert run(base_new(repo, shot)).returncode == 0
        bin_dir = tmp_path / "bin"
        bin_dir.mkdir()
        fake_cli(bin_dir, "gh", 'echo "GraphQL: Resource not accessible by integration" 1>&2\nexit 1\n')
        proc = run(["file", "--repo", str(repo), "--issue", "ISS-0001", "--by", "Priya N."], env={"PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"})
        assert proc.returncode == 1 and "gh exited 1" in proc.stdout and "Resource not accessible" in proc.stdout
        text = next((repo / ".sdlc" / "issues").glob("ISS-0001-*.md")).read_text(encoding="utf-8")
        assert 'filed_url: ""' in text

    def test_an_ai_filer_is_refused(self, repo, shot):
        assert run(base_new(repo, shot)).returncode == 0
        proc = run(["file", "--repo", str(repo), "--issue", "ISS-0001", "--dry-run", "--by", "Copilot"])
        assert proc.returncode == 2


def prioritized(repo: Path, shot: Path, target: str | None = None, **over) -> None:
    triaged(repo, shot, **over)
    args = ["prioritize", "--repo", str(repo), "--issue", "ISS-0001", "--priority", "P2", "--by", "Sam K"]
    if target:
        args += ["--target-sprint", target]
    proc = run(args)
    assert proc.returncode == 0, proc.stdout


class TestPromote:
    def test_promote_needs_a_prioritized_report_and_says_what_comes_first(self, repo, shot):
        assert run(base_new(repo, shot)).returncode == 0
        early = run(["promote", "--repo", str(repo), "--issue", "ISS-0001", "--risk", "MEDIUM", "--by", "Sam K"])
        assert early.returncode == 1 and "review it first" in early.stdout
        assert run(["triage", "--repo", str(repo), "--issue", "ISS-0001", "--verdict", "confirmed", "--by", "Sam K"]).returncode == 0
        mid = run(["promote", "--repo", str(repo), "--issue", "ISS-0001", "--risk", "MEDIUM", "--by", "Sam K"])
        assert mid.returncode == 1 and "prioritize" in mid.stdout
        assert not (repo / "specs").exists()

    def test_without_a_tier_the_proposal_is_named_and_nothing_is_scaffolded(self, repo, shot):
        prioritized(repo, shot)
        proc = run(["promote", "--repo", str(repo), "--issue", "ISS-0001", "--by", "Sam K"])
        assert proc.returncode == 1 and "the proposal from this report is MEDIUM" in proc.stdout
        assert not (repo / "specs").exists()

    def test_promote_scaffolds_a_bugfix_spec_through_new_spec_and_links_the_two(self, repo, shot):
        prioritized(repo, shot)
        proc = run(["promote", "--repo", str(repo), "--issue", "ISS-0001", "--risk", "HIGH", "--owner", "@priya-n", "--team", "claims", "--by", "Sam K", "--json"])
        assert proc.returncode == 0, proc.stdout + proc.stderr
        doc = json.loads(proc.stdout)
        assert doc["ok"] is True and doc["status"] == "promoted" and doc["spec"] == "0001" and doc["risk"] == "HIGH" and doc["proposed_risk"] == "MEDIUM"
        assert doc["slated"] is None and doc["warnings"] == []
        spec = (repo / doc["path"]).read_text(encoding="utf-8")
        assert 'spec: "0001"' in spec and "\nrisk: HIGH" in spec and spec.count("type: bugfix") == 1 and "type: feature" not in spec
        assert 'source: "ISS-0001"' in spec and 'owner: "@priya-n"' in spec and 'team: "claims"' in spec
        assert "Fix ISS-0001 — Claim total doubles" in spec and ".sdlc/issues/ISS-0001-" in spec and "priority P2" in spec
        report = next((repo / ".sdlc" / "issues").glob("ISS-0001-*.md")).read_text(encoding="utf-8")
        assert 'bugfix_spec: "0001"' in report and "\nstatus: promoted\n" in report
        assert "promoted to bugfix spec 0001 (HIGH) by Sam K — the proposal was MEDIUM" in report
        events = [json.loads(l) for l in (repo / ".sdlc" / "metrics" / "issue-log.jsonl").read_text().splitlines()]
        assert events[-1]["event"] == "promoted" and events[-1]["spec"] == "0001" and events[-1]["risk"] == "HIGH" and events[-1]["proposed_risk"] == "MEDIUM"
        again = run(["promote", "--repo", str(repo), "--issue", "ISS-0001", "--risk", "LOW", "--by", "Sam K"])
        assert again.returncode == 1 and "already has a bugfix spec" in again.stdout
        listed = json.loads(run(["list", "--repo", str(repo), "--json"]).stdout)["issues"][0]
        assert listed["bugfix_spec"] == "0001" and listed["status"] == "promoted"

    def test_slate_puts_the_new_spec_into_the_target_sprint_through_sprint_py(self, repo, shot):
        new_sprint = run_sprint(repo, ["new", "--sprint", "S07", "--goal", "Adjusters file without a phone call", "--start", "2026-10-05", "--target", "3", "--by", "Pod Lead"])
        assert new_sprint.returncode == 0, new_sprint.stdout
        prioritized(repo, shot, target="S07")
        proc = run(["promote", "--repo", str(repo), "--issue", "ISS-0001", "--risk", "MEDIUM", "--slate", "--by", "Sam K", "--json"])
        assert proc.returncode == 0, proc.stdout + proc.stderr
        doc = json.loads(proc.stdout)
        assert doc["slated"]["sprint"] == "S07" and doc["slated"]["exit"] == 0 and doc["warnings"] == []
        import check_spec as cs
        fm, _ = cs.parse_frontmatter((repo / doc["path"]).read_text(encoding="utf-8"))
        assert fm["sprint"] == "S07" and fm["type"] == "bugfix"  # sprint.py wrote the key; the fix is in the commitment window
        status = run_sprint(repo, ["status", "--sprint", "S07", "--json"])
        assert any(row["id"] == "0001" for row in json.loads(status.stdout)["slate"])
        report = next((repo / ".sdlc" / "issues").glob("ISS-0001-*.md")).read_text(encoding="utf-8")
        assert "slated into S07" in report

    def test_slate_without_a_target_or_an_active_sprint_is_exit_1_and_a_refused_slate_is_a_warning(self, repo, shot):
        prioritized(repo, shot)
        none = run(["promote", "--repo", str(repo), "--issue", "ISS-0001", "--risk", "MEDIUM", "--slate", "--by", "Sam K"])
        assert none.returncode == 1 and "needs a target sprint" in none.stdout and not (repo / "specs").exists()
        # A sprint of target 1 that is already full: sprint.py refuses the second slate (over target
        # without --override), and that refusal is a warning on an otherwise promoted report.
        new_sprint = run_sprint(repo, ["new", "--sprint", "S07", "--goal", "A goal", "--start", "2026-10-05", "--target", "1", "--by", "Pod Lead"])
        assert new_sprint.returncode == 0, new_sprint.stdout
        other = subprocess.run([sys.executable, str(PLUGIN_ROOT / "scripts" / "new_spec.py"), "--repo", str(repo), "--name", "policy lookup", "--json"],
                               capture_output=True, text=True, encoding="utf-8")
        assert other.returncode == 0, other.stdout
        assert run_sprint(repo, ["slate", "--sprint", "S07", "--spec", json.loads(other.stdout)["id"], "--by", "Pod Lead"]).returncode == 0
        assert run(["prioritize", "--repo", str(repo), "--issue", "ISS-0001", "--priority", "P2", "--target-sprint", "S07", "--by", "Sam K"]).returncode == 0
        proc = run(["promote", "--repo", str(repo), "--issue", "ISS-0001", "--risk", "MEDIUM", "--slate", "--by", "Sam K", "--json"])
        assert proc.returncode == 0, proc.stdout
        doc = json.loads(proc.stdout)
        assert doc["status"] == "promoted" and doc["slated"]["exit"] == 1 and doc["warnings"] and "exited 1" in doc["warnings"][0]
        report = next((repo / ".sdlc" / "issues").glob("ISS-0001-*.md")).read_text(encoding="utf-8")
        assert "slate into S07 refused (exit 1)" in report

    def test_an_ai_promoter_is_refused_and_a_bad_tier_is_exit_1(self, repo, shot):
        prioritized(repo, shot)
        assert run(["promote", "--repo", str(repo), "--issue", "ISS-0001", "--risk", "HIGH", "--by", "Codex"]).returncode == 2
        bad = run(["promote", "--repo", str(repo), "--issue", "ISS-0001", "--risk", "SEVERE", "--by", "Sam K"])
        assert bad.returncode == 1 and "HIGH, MEDIUM or LOW" in bad.stdout


class TestSyncShowReopen:
    def test_sync_marks_a_promoted_report_fixed_once_its_spec_is_merged(self, repo, shot):
        prioritized(repo, shot)
        proc = run(["promote", "--repo", str(repo), "--issue", "ISS-0001", "--risk", "MEDIUM", "--by", "Sam K", "--json"])
        spec_path = repo / json.loads(proc.stdout)["path"]
        waiting = run(["sync", "--repo", str(repo), "--json"])
        assert json.loads(waiting.stdout) == {"ok": True, "fixed": [], "waiting": [{"issue": "ISS-0001", "spec": "0001", "spec_status": "draft"}]}
        spec_path.write_text(spec_path.read_text(encoding="utf-8").replace("status: draft", "status: merged", 1), encoding="utf-8")
        done = run(["sync", "--repo", str(repo)])
        assert done.returncode == 0 and "ISS-0001: fixed — spec 0001 merged" in done.stdout
        text = next((repo / ".sdlc" / "issues").glob("ISS-0001-*.md")).read_text(encoding="utf-8")
        assert "\nstatus: fixed\n" in text and "bugfix spec 0001 merged (sync)" in text
        events = [json.loads(l) for l in (repo / ".sdlc" / "metrics" / "issue-log.jsonl").read_text().splitlines()]
        assert events[-1]["event"] == "fixed" and events[-1]["via"] == "sync" and events[-1]["by"] == "spec 0001"
        assert run(["sync", "--repo", str(repo)]).stdout.startswith("no data")

    def test_show_lists_the_allowed_actions_with_the_plugin_s_reasons_for_the_refused_ones(self, repo, shot):
        assert run(base_new(repo, shot)).returncode == 0
        doc = json.loads(run(["show", "--repo", str(repo), "--issue", "ISS-0001", "--json"]).stdout)
        assert doc["issue"] == "ISS-0001" and doc["status"] == "new" and doc["screenshot_paths"] == [".sdlc/issues/ISS-0001/screenshot-1.png"]
        assert doc["sections"]["Steps to reproduce"].startswith("1. open claim 1042")
        a = doc["actions"]
        assert a["triage"] == {"ok": True, "reason": None, "to": "triaged"}
        assert a["promote"]["ok"] is False and "review it first" in a["promote"]["reason"]
        assert a["fixed"]["ok"] is False and a["reopen"]["ok"] is False and a["file"]["ok"] is True and a["note"]["ok"] is True
        text = run(["show", "--repo", str(repo), "--issue", "0001"]).stdout
        assert "can: triage, wont-fix, duplicate, file, note" in text and "not promote:" in text

    def test_reopen_takes_a_closed_report_back_to_new_with_a_reason(self, repo, shot):
        assert run(base_new(repo, shot)).returncode == 0
        assert run(["triage", "--repo", str(repo), "--issue", "ISS-0001", "--verdict", "wont-fix", "--reason", "that screen is retired in S09", "--by", "Sam K"]).returncode == 0
        bare = run(["reopen", "--repo", str(repo), "--issue", "ISS-0001", "--reason", "nope", "--by", "Priya N."])
        assert bare.returncode == 1 and "needs --reason" in bare.stdout
        ok = run(["reopen", "--repo", str(repo), "--issue", "ISS-0001", "--reason", "the screen is back in S10 and so is the bug", "--by", "Priya N.", "--json"])
        assert ok.returncode == 0 and json.loads(ok.stdout)["status"] == "new"
        text = next((repo / ".sdlc" / "issues").glob("ISS-0001-*.md")).read_text(encoding="utf-8")
        assert "\nstatus: new\n" in text and 'triaged_by: ""' in text and 'triage_verdict: ""' in text and "reopened by Priya N." in text
        not_closed = run(["reopen", "--repo", str(repo), "--issue", "ISS-0001", "--reason", "the screen is back in S10 and so is the bug", "--by", "Priya N."])
        assert not_closed.returncode == 1 and "nothing to reopen" in not_closed.stdout


class TestHelp:
    @pytest.mark.parametrize("argv", [[], ["questions"], ["env"], ["new"], ["show"], ["check"], ["list"], ["triage"], ["prioritize"], ["promote"],
                                      ["note"], ["reopen"], ["sync"], ["file"], ["set-status"]])
    def test_help_exits_0_from_a_folder_with_no_sdlc(self, argv, tmp_path):
        proc = run([*argv, "--help"], cwd=tmp_path)
        assert proc.returncode == 0, proc.stderr
        assert "usage:" in proc.stdout


def test_the_pure_helpers_keep_other_frontmatter_bytes(tmp_path):
    text = '---\nissue: "ISS-0001"\nstatus: open\nfiled_url: ""\n---\n\n# x\n\n## History\n\n<!-- {{history}} -->\n'
    out = ri.set_field(ri.set_field(text, "status", "filed"), "filed_url", "https://x/1")
    assert out.startswith('---\nissue: "ISS-0001"\nstatus: filed\nfiled_url: "https://x/1"\n---\n')
    assert ri.append_history(out, "t — filed").endswith("## History\n\n- t — filed\n")
    assert ri.append_history(ri.append_history(out, "a"), "b").endswith("- a\n- b\n")
