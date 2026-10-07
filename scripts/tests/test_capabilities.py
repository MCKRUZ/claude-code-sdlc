"""The plugin's declared capabilities (spec 0023).

Studio is released separately from the plugin, so it will meet plugins older than the scripts it
wants to call. A capability list lets it hide a button and say why, rather than run the script and
show a project manager an argument-parsing error. The list is declared, not probed (probing would
run `--help` on a dozen scripts every time the dashboard loads) — which is only safe if a test
proves each entry true. That is the first test class here: a capability cannot be declared that
the script does not actually have.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

import capabilities as caps
import generate_status as gs

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPTS = ROOT / "scripts"


def help_text(script, argv):
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    proc = subprocess.run([sys.executable, str(SCRIPTS / script), *argv, "--help"],
                          capture_output=True, text=True, encoding="utf-8", env=env)
    return proc.stdout + proc.stderr


@pytest.mark.parametrize("name", sorted(caps.CAPABILITIES))
def test_every_declared_capability_is_true_of_its_script(name):
    spec = caps.CAPABILITIES[name]
    if not (SCRIPTS / spec["script"]).exists():
        pytest.skip(f"{spec['script']} is not in this plugin, so {name} is (correctly) not reported")
    text = help_text(spec["script"], spec.get("argv", []))
    missing = [f for f in spec["flags"] if f not in text]
    assert not missing, f"{name}: {spec['script']} {' '.join(spec.get('argv', []))} --help lacks {missing}"


def test_the_activities_capability_is_true_of_stage_readiness(tmp_path):
    (tmp_path / ".sdlc").mkdir()
    (tmp_path / ".sdlc" / "state.yaml").write_text('current_phase: "0"\n', encoding="utf-8")
    import stage_readiness
    assert "activities" in stage_readiness.assess(tmp_path, "0")


def test_the_capabilities_the_plan_depends_on_are_declared():
    assert {"activities", "add-row", "doctor-json", "gate-audit-json", "upgrade-report-json",
            "check-channel-json", "interaction-spec-check", "bind-channel", "decision-open",
            "decision-decide", "intake-modes", "new-spec-json", "new-spike-json",
            "pipeline-proof"} <= set(caps.CAPABILITIES)


def test_the_list_is_sorted_strings():
    listed = caps.list_capabilities()
    assert listed == sorted(listed) and all(isinstance(c, str) for c in listed)


def test_a_capability_whose_script_is_absent_is_omitted_not_reported(tmp_path):
    assert caps.list_capabilities(scripts_dir=tmp_path) == []


def test_only_the_scripts_that_exist_are_reported(tmp_path):
    (tmp_path / "doctor.py").write_text("# stand-in\n")
    assert caps.list_capabilities(scripts_dir=tmp_path) == ["doctor-json"]


def test_status_json_gains_capabilities_and_keeps_every_existing_key():
    state = {"project_name": "demo", "current_phase": "0", "phases": {}}
    out = gs.status_json(state, Path("/nonexistent/.sdlc"))
    assert out["capabilities"] == caps.list_capabilities()
    without = {k: v for k, v in out.items() if k != "capabilities"}
    assert without  # the document it always had is still there


def test_the_markdown_dashboard_does_not_mention_capabilities():
    state = {"project_name": "demo", "current_phase": "0", "phases": {}}
    assert "capabilit" not in gs.generate_dashboard(state, Path("/nonexistent/.sdlc")).lower()


def test_the_sprint_capabilities_studio_reads_are_declared_with_the_agreed_shape():
    """studio-improvements shared contract: Studio's Sprint view keys on these names."""
    assert caps.CAPABILITIES["sprint-status"] == {
        "script": "sprint.py", "argv": ["status"], "flags": ["--repo", "--state", "--sprint", "--json"]}
    assert caps.CAPABILITIES["sprint-plan"] == {
        "script": "sprint.py", "argv": ["plan"], "flags": ["--repo", "--state", "--sprint", "--json"]}
    assert caps.CAPABILITIES["sprint-report"] == {
        "script": "generate_sprint_report.py", "flags": ["--repo", "--state", "--sprint", "--kind", "--json"]}
    assert {"sprint-status", "sprint-plan", "sprint-report"} <= set(caps.list_capabilities())


def test_the_import_outcomes_capability_is_declared_with_the_agreed_shape():
    """code-host providers (Wave 5): Studio keys the host-neutral scorecard import on this name."""
    assert caps.CAPABILITIES["import-outcomes"] == {
        "script": "import_outcomes.py", "flags": ["--since", "--repo", "--state", "--host", "--json"]}
    assert "import-outcomes" in caps.list_capabilities()


def test_the_command_center_capabilities_are_declared_with_the_agreed_shape():
    """togo-command-center.md §2.6: Studio disables a control on an older plugin by these names,
    so the names and the flags behind them are a contract, not a convenience."""
    assert caps.CAPABILITIES["sprint-list"] == {
        "script": "sprint.py", "argv": ["list"], "flags": ["--repo", "--state", "--json"]}
    assert caps.CAPABILITIES["sprint-log"] == {
        "script": "sprint.py", "argv": ["log"], "flags": ["--since", "--sprint", "--json"]}
    assert caps.CAPABILITIES["sprint-carry"] == {
        "script": "sprint.py", "argv": ["carry"], "flags": ["--spec", "--to", "--reason", "--by"]}
    assert caps.CAPABILITIES["sprint-edit"] == {
        "script": "sprint.py", "argv": ["edit"], "flags": ["--sprint", "--goal", "--by"]}
    assert caps.CAPABILITIES["sprint-write"] == {
        "script": "sprint.py", "argv": ["slate"], "flags": ["--spec", "--by", "--override", "--reason"]}
    assert caps.CAPABILITIES["confirm-tier"] == {
        "script": "spec_transition.py", "argv": ["confirm-tier"], "flags": ["--by"]}
    assert caps.CAPABILITIES["assign-roles"] == {
        "script": "spec_transition.py", "argv": ["assign"], "flags": ["--developer", "--checker", "--by"]}
    assert caps.CAPABILITIES["handoff-check"] == {"script": "handoff.py", "flags": ["--check", "--json"]}
    assert caps.CAPABILITIES["findings-json"] == {
        "script": "record_findings.py", "argv": ["report"], "flags": ["--json", "--spec"]}
    assert caps.CAPABILITIES["readiness-all"] == {"script": "spec_readiness.py", "flags": ["--all", "--json"]}
    assert {"sprint-list", "sprint-log", "sprint-carry", "sprint-edit", "sprint-write", "confirm-tier",
            "assign-roles", "handoff-check", "findings-json", "readiness-all"} <= set(caps.list_capabilities())


def test_the_issue_report_capabilities_are_declared_with_the_agreed_shape():
    """/sdlc-report-issue (1.8.0): the app's Issues view keys on these names — the form's questions,
    the build facts, the write, the queue, one report with its allowed actions, the three lifecycle
    decisions, the sync and the filing each disable with the reason `arrives with a newer plugin:
    lacks <name>` on a plugin without them."""
    assert caps.CAPABILITIES["issue-questions"] == {
        "script": "report_issue.py", "argv": ["questions"], "flags": ["--channel", "--json"]}
    assert caps.CAPABILITIES["issue-env"] == {
        "script": "report_issue.py", "argv": ["env"], "flags": ["--repo", "--state", "--app-version", "--json"]}
    assert caps.CAPABILITIES["issue-report"]["script"] == "report_issue.py"
    assert caps.CAPABILITIES["issue-report"]["argv"] == ["new"]
    assert {"--title", "--channel", "--environment", "--data-impact", "--persona", "--reporter-role", "--screenshot",
            "--no-client-data", "--by", "--json"} <= set(caps.CAPABILITIES["issue-report"]["flags"])
    assert caps.CAPABILITIES["issue-list"] == {
        "script": "report_issue.py", "argv": ["list"], "flags": ["--repo", "--state", "--status", "--queue", "--json"]}
    assert caps.CAPABILITIES["issue-show"] == {"script": "report_issue.py", "argv": ["show"], "flags": ["--issue", "--json"]}
    assert caps.CAPABILITIES["issue-triage"]["argv"] == ["triage"]
    assert {"--issue", "--verdict", "--question", "--of", "--reason", "--override", "--by"} <= set(caps.CAPABILITIES["issue-triage"]["flags"])
    assert caps.CAPABILITIES["issue-prioritize"] == {
        "script": "report_issue.py", "argv": ["prioritize"], "flags": ["--issue", "--priority", "--target-sprint", "--reason", "--by"]}
    assert caps.CAPABILITIES["issue-promote"] == {
        "script": "report_issue.py", "argv": ["promote"], "flags": ["--issue", "--risk", "--owner", "--team", "--slate", "--by"]}
    assert caps.CAPABILITIES["issue-sync"] == {"script": "report_issue.py", "argv": ["sync"], "flags": ["--repo", "--state", "--json"]}
    assert caps.CAPABILITIES["issue-file"] == {
        "script": "report_issue.py", "argv": ["file"], "flags": ["--issue", "--host", "--label", "--dry-run", "--by", "--json"]}
    assert {"issue-questions", "issue-env", "issue-report", "issue-list", "issue-show", "issue-triage", "issue-prioritize",
            "issue-promote", "issue-sync", "issue-file"} <= set(caps.list_capabilities())
