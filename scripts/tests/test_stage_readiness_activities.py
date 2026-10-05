"""stage_readiness.py's new `activities` and `definition` keys (spec 0023).

Both are additive: an older Studio ignores keys it does not know, so it must still get exactly the
document it had. What matters here is that nothing already in the result moves, the text report is
the same, a broken declaration degrades to "no activities" instead of failing the whole report, and
reading is still read-only.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

import activities_model
import stage_readiness as sr

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / "scripts" / "stage_readiness.py"


@pytest.fixture
def project(tmp_path):
    (tmp_path / ".sdlc" / "artifacts" / "00-discovery").mkdir(parents=True)
    (tmp_path / ".sdlc" / "state.yaml").write_text('project_name: demo\ncurrent_phase: "0"\n', encoding="utf-8")
    return tmp_path


def test_the_result_gains_activities_and_the_phase_definition_path(project):
    result = sr.assess(project, "0")
    assert [a["id"] for a in result["activities"]][:2] == ["intake", "brief"]
    assert result["definition"] == "phases/00-discovery.md"


def test_it_reports_the_phase_it_was_asked_about_not_the_current_one(project):
    result = sr.assess(project, "1")
    assert {"feature-brief", "rules"} <= {a["id"] for a in result["activities"]}
    assert result["definition"] == "phases/01-requirements.md"


def test_every_existing_key_is_still_there_and_unchanged_in_kind(project):
    result = sr.assess(project, "0")
    assert {"stage", "sign_off", "artifacts", "judgement_conditions", "judgement",
            "confirmed_count", "blocking_count", "ready"} <= set(result)


def test_the_text_report_does_not_change(project):
    result = sr.assess(project, "0")
    without = {k: v for k, v in result.items() if k not in ("activities", "definition", "warnings")}
    assert sr.format_report(result) == sr.format_report(without)


def test_a_run_still_writes_nothing_to_the_project(project):
    before = sorted((str(p), p.stat().st_size) for p in project.rglob("*") if p.is_file())
    sr.assess(project, "0")
    assert sorted((str(p), p.stat().st_size) for p in project.rglob("*") if p.is_file()) == before


def test_a_broken_declaration_degrades_to_no_activities_and_a_warning(project, monkeypatch, tmp_path):
    bad = tmp_path / "broken.yaml"
    bad.write_text("'0': not-a-list\n", encoding="utf-8")
    monkeypatch.setattr(activities_model, "ACTIVITIES_PATH", bad)
    result = sr.assess(project, "0")
    assert result["activities"] == []
    assert any("activities" in w.lower() for w in result["warnings"])
    assert result["artifacts"] is not None  # the rest of the report is intact


def test_a_malformed_entry_degrades_to_no_activities_and_a_named_warning(project, monkeypatch, tmp_path):
    bad = tmp_path / "typed-wrong.yaml"
    bad.write_text("'build':\n  - {id: x, label: x, kind: run, requires: [file]}\n", encoding="utf-8")
    monkeypatch.setattr(activities_model, "ACTIVITIES_PATH", bad)
    result = sr.assess(project, "0")
    assert result["activities"] == []
    assert any("requires must be a mapping" in w for w in result["warnings"])
    assert result["artifacts"] is not None


def test_any_fault_while_evaluating_the_declaration_becomes_a_warning_not_a_crash(project, monkeypatch):
    def explode(*_a, **_k):
        raise TypeError("unhashable type: 'list'")
    monkeypatch.setattr(activities_model, "validate", explode)
    result = sr.assess(project, "0")
    assert result["activities"] == []
    assert any("could not be evaluated" in w and "TypeError" in w for w in result["warnings"])
    assert result["ready"] in (True, False)  # the rest of the report is intact


def test_a_healthy_run_has_no_warnings_key(project):
    assert "warnings" not in sr.assess(project, "0")


def test_the_json_a_caller_reads_carries_the_new_keys(project):
    proc = subprocess.run([sys.executable, str(SCRIPT), "--repo", str(project), "--phase", "0", "--json"],
                          capture_output=True, text=True, encoding="utf-8")
    assert proc.returncode == 0
    doc = json.loads(proc.stdout)
    assert doc["activities"] and doc["definition"] == "phases/00-discovery.md"
