"""Tests for generate_handoff_report.py — the Phase C final-handoff-report assembler."""

import argparse

import pytest
import yaml

import generate_handoff_report as gh


# ── helpers ─────────────────────────────────────────────────────────────────────

def make_repo(tmp_path, *, with_state=True):
    """A repo with .sdlc/{reports,metrics,artifacts/close} and specs/. Returns repo root."""
    repo = tmp_path / "proj"
    sdlc = repo / ".sdlc"
    (sdlc / "reports").mkdir(parents=True)
    (sdlc / "metrics").mkdir(parents=True)
    (sdlc / "artifacts" / "close").mkdir(parents=True)
    (repo / "specs").mkdir(parents=True)
    if with_state:
        state = {
            "project_name": "Acme Claims",
            "created_at": "2026-01-05T09:00:00+00:00",
            "phases": {
                "0": {"name": "discovery", "status": "completed",
                      "completed_at": "2026-01-20T17:00:00+00:00",
                      "gate_results": {"approved_by": "Dana (client)"}},
                "close": {"name": "close", "status": "active", "completed_at": None,
                          "gate_results": {}},
            },
            "history": [{"from": "0", "to": "1", "at": "2026-01-20T17:05:00+00:00"}],
        }
        (sdlc / "state.yaml").write_text(yaml.safe_dump(state), encoding="utf-8")
    return repo


def write_spec(specs_dir, spec_id, status, risk):
    (specs_dir / f"{spec_id}-x.md").write_text(
        f'---\nspec: "{spec_id}"\nname: "x"\nstatus: {status}\nrisk: {risk}\n---\n# Spec\n',
        encoding="utf-8",
    )


def write_deferred_spec(specs_dir, spec_id, name, reason):
    (specs_dir / f"{spec_id}-{name}.md").write_text(
        f'---\nspec: "{spec_id}"\nname: "{name}"\nstatus: deferred\nrisk: LOW\n'
        f'deferred_reason: "{reason}"\n---\n# Spec\n',
        encoding="utf-8",
    )


# ── window / timestamps ──────────────────────────────────────────────────────────

class TestWindow:
    def test_start_and_end_from_records(self):
        state = {
            "created_at": "2026-01-05T09:00:00+00:00",
            "phases": {"x": {"completed_at": "2026-03-01T10:00:00+00:00"}},
            "history": [{"at": "2026-02-01T10:00:00+00:00"}],
        }
        start, end = gh.engagement_window(state)
        assert start == "2026-01-05"
        assert end == "2026-03-01"

    def test_empty_state_is_dashes(self):
        assert gh.engagement_window({}) == ("—", "—")


# ── phase report index ───────────────────────────────────────────────────────────

class TestPhaseReportIndex:
    def test_marks_present_and_missing(self, tmp_path):
        reports = tmp_path / "reports"
        reports.mkdir()
        (reports / "close-report.html").write_text("x", encoding="utf-8")
        out = gh.phase_report_index(reports)
        assert "[close-report.html](reports/close-report.html)" in out
        assert "delivered" in out
        assert "**missing**" in out  # the other phases have no report
        assert "`00-discovery-report.html`" in out


# ── engagement record ────────────────────────────────────────────────────────────

class TestEngagementRecord:
    def test_reads_status_date_and_approver(self):
        state = {"phases": {"0": {"status": "completed",
                                  "completed_at": "2026-01-20T17:00:00+00:00",
                                  "gate_results": {"approved_by": "Dana"}}}}
        out = gh.engagement_record(state)
        assert "passed" in out
        assert "2026-01-20" in out
        assert "Dana" in out

    def test_standalone_no_phases(self):
        assert "standalone" in gh.engagement_record({}).lower()


# ── metrics history ──────────────────────────────────────────────────────────────

class TestMetricsHistory:
    def test_no_data_is_honest(self, tmp_path):
        out = gh.metrics_history(tmp_path)  # no loop-events.jsonl
        assert "no data" in out
        assert "no activity metrics" in out.lower()

    def test_real_numbers(self, tmp_path):
        (tmp_path / "loop-events.jsonl").write_text(
            '{"type": "spec_merged", "accepted_as_is": true}\n'
            '{"type": "deploy", "succeeded": true, "lead_time_hours": 4}\n',
            encoding="utf-8",
        )
        out = gh.metrics_history(tmp_path)
        assert "100%" in out      # accepted-as-is rate
        assert "| Deploys | 1 |" in out


# ── spec backlog ─────────────────────────────────────────────────────────────────

class TestSpecBacklog:
    def test_empty(self, tmp_path):
        assert "No specs" in gh.spec_backlog(tmp_path / "specs")

    def test_merged_count_and_risk(self, tmp_path):
        specs = tmp_path / "specs"
        specs.mkdir()
        write_spec(specs, "0001", "merged", "HIGH")
        write_spec(specs, "0002", "in-flight", "LOW")
        out = gh.spec_backlog(specs)
        assert "1 of 2" in out
        assert "HIGH 1" in out


# ── deferred items ───────────────────────────────────────────────────────────────

class TestDeferredItems:
    def test_empty_reads_none(self, tmp_path):
        assert gh.deferred_items(tmp_path / "specs") == "none"

    def test_no_specs_at_all_reads_none(self, tmp_path):
        specs = tmp_path / "specs"
        specs.mkdir()
        write_spec(specs, "0001", "merged", "HIGH")
        assert gh.deferred_items(specs) == "none"

    def test_lists_number_name_and_reason(self, tmp_path):
        specs = tmp_path / "specs"
        specs.mkdir()
        write_deferred_spec(specs, "0002", "old-idea", "superseded by 0009")
        out = gh.deferred_items(specs)
        assert "0002" in out
        assert "old-idea" in out
        assert "superseded by 0009" in out

    def test_spec_number_order(self, tmp_path):
        specs = tmp_path / "specs"
        specs.mkdir()
        write_deferred_spec(specs, "0009", "second", "not this quarter")
        write_deferred_spec(specs, "0003", "first", "descoped")
        out = gh.deferred_items(specs)
        assert out.index("0003") < out.index("0009")

    def test_merged_and_in_flight_specs_are_excluded(self, tmp_path):
        specs = tmp_path / "specs"
        specs.mkdir()
        write_spec(specs, "0001", "merged", "HIGH")
        write_spec(specs, "0002", "in-flight", "LOW")
        assert gh.deferred_items(specs) == "none"


# ── path resolution ──────────────────────────────────────────────────────────────

class TestResolvePaths:
    def test_repo_mode(self, tmp_path):
        args = argparse.Namespace(state=None, repo=str(tmp_path))
        root, state = gh.resolve_paths(args)
        assert root == tmp_path.resolve()
        assert state is None

    def test_state_mode(self, tmp_path):
        repo = make_repo(tmp_path)
        args = argparse.Namespace(state=str(repo / ".sdlc" / "state.yaml"), repo=None)
        root, state = gh.resolve_paths(args)
        assert root == repo.resolve()
        assert state["project_name"] == "Acme Claims"


# ── end-to-end via main() ────────────────────────────────────────────────────────

class TestMain:
    def _run(self, monkeypatch, argv):
        monkeypatch.setattr("sys.argv", ["generate_handoff_report.py", *argv])
        return gh.main()

    def test_writes_report_with_real_sections(self, tmp_path, monkeypatch):
        repo = make_repo(tmp_path)
        (repo / ".sdlc" / "reports" / "close-report.html").write_text("x", encoding="utf-8")
        write_spec(repo / "specs", "0001", "merged", "HIGH")
        rc = self._run(monkeypatch, ["--state", str(repo / ".sdlc" / "state.yaml")])
        assert rc == 0
        out = (repo / ".sdlc" / "artifacts" / "close" / "final-handoff-report.md").read_text(encoding="utf-8")
        assert "# Final Handoff Report" in out
        assert "Acme Claims" in out
        assert "2026-01-05" in out                 # window start
        assert "Dana (client)" in out              # engagement record approver
        assert "[Fill:" in out                     # narrative slots preserved
        assert "1 of 1" in out                     # spec backlog
        assert "## Deferred items\nnone" in out    # no deferred specs — reads "none"

    def test_writes_report_with_deferred_spec(self, tmp_path, monkeypatch):
        repo = make_repo(tmp_path)
        write_spec(repo / "specs", "0001", "merged", "HIGH")
        write_deferred_spec(repo / "specs", "0002", "skip-this", "not worth it this quarter")
        rc = self._run(monkeypatch, ["--state", str(repo / ".sdlc" / "state.yaml")])
        assert rc == 0
        out = (repo / ".sdlc" / "artifacts" / "close" / "final-handoff-report.md").read_text(encoding="utf-8")
        assert "## Deferred items" in out
        assert "0002" in out
        assert "not worth it this quarter" in out

    def test_refuses_to_clobber_without_force(self, tmp_path, monkeypatch):
        repo = make_repo(tmp_path)
        target = repo / ".sdlc" / "artifacts" / "close" / "final-handoff-report.md"
        target.write_text("HUMAN EDITED", encoding="utf-8")
        rc = self._run(monkeypatch, ["--state", str(repo / ".sdlc" / "state.yaml")])
        assert rc == 1
        assert target.read_text(encoding="utf-8") == "HUMAN EDITED"

    def test_force_overwrites(self, tmp_path, monkeypatch):
        repo = make_repo(tmp_path)
        target = repo / ".sdlc" / "artifacts" / "close" / "final-handoff-report.md"
        target.write_text("HUMAN EDITED", encoding="utf-8")
        rc = self._run(monkeypatch, ["--state", str(repo / ".sdlc" / "state.yaml"), "--force"])
        assert rc == 0
        assert "# Final Handoff Report" in target.read_text(encoding="utf-8")

    def test_standalone_notes_missing_context(self, tmp_path, monkeypatch):
        repo = make_repo(tmp_path, with_state=False)
        out_path = tmp_path / "handoff.md"
        rc = self._run(monkeypatch, ["--repo", str(repo), "--output", str(out_path)])
        assert rc == 0
        text = out_path.read_text(encoding="utf-8")
        assert "Standalone draft" in text
        assert repo.name in text  # project name falls back to repo dir name


class TestDeclaredBy:
    """Who declared Build finished, on the hand-over document (spec 0014).

    This is the line a reader looks at first, so the rule is that it can never disagree with
    the project's own state file. The report is usually drafted at the MOMENT of declaring,
    before the stage has moved and recorded anything — so the caller offers the name it is
    about to record, and the record supersedes it the instant one exists.

    Preferring the offer would let a delivered document name somebody the project does not.
    """

    def _state(self, signed=None, completed=None):
        gate_results = {}
        if signed is not None:
            gate_results["signed_off_by"] = signed
        return {"phases": {"build": {"gate_results": gate_results, "completed_at": completed}}}

    def test_the_recorded_name_is_used(self):
        line = gh.declared_by(self._state(signed="Priya N"), None)
        assert "Priya N" in line

    def test_the_recorded_name_BEATS_the_offered_one(self):
        # The case that matters: a document naming somebody the project does not would be a
        # false record of who took responsibility, which is the whole point of the line.
        line = gh.declared_by(self._state(signed="Priya N"), "Matt K")
        assert "Priya N" in line
        assert "Matt K" not in line

    def test_the_recorded_date_is_shown_with_the_name(self):
        line = gh.declared_by(self._state(signed="Priya N", completed="2026-09-25T09:00:00+00:00"), None)
        assert "2026-09-25" in line

    def test_a_recorded_name_with_no_date_does_not_invent_one(self):
        line = gh.declared_by(self._state(signed="Priya N"), None)
        assert "Priya N" in line
        assert " on " not in line

    def test_an_offered_name_is_marked_as_not_yet_recorded(self):
        # Honest about which it is. A reader must be able to tell "the project says so" from
        # "the tool was told so and the project has not caught up".
        line = gh.declared_by(self._state(), "Matt K")
        assert "Matt K" in line
        assert "not yet recorded" in line

    def test_neither_available_reads_as_a_slot_to_fill(self):
        # Never a blank signature line: a document that admits it does not know is better than
        # one that looks signed by nobody.
        assert "[Fill:" in gh.declared_by({}, None)

    @pytest.mark.parametrize("empty", ["", "   ", None])
    def test_an_empty_offered_name_is_not_a_name(self, empty):
        assert "[Fill:" in gh.declared_by({}, empty)

    @pytest.mark.parametrize("bad", ["", "   ", None, 0, [], {"name": "Priya"}])
    def test_anything_that_is_not_a_real_recorded_name_falls_through(self, bad):
        # Falls through to the offered name rather than rendering an empty signature.
        line = gh.declared_by(self._state(signed=bad), "Matt K")
        assert "Matt K" in line

    def test_gate_results_that_is_not_a_mapping_does_not_crash(self):
        state = {"phases": {"build": {"gate_results": ["not", "a", "mapping"]}}}
        assert "Matt K" in gh.declared_by(state, "Matt K")

    def test_a_project_with_no_build_phase_at_all_does_not_crash(self):
        assert "[Fill:" in gh.declared_by({"phases": {"0": {}}}, None)

    def test_the_line_reaches_the_report(self, tmp_path):
        repo = make_repo(tmp_path)
        report = gh.build_report(
            project_name="p", window=("2026-01-01", "2026-09-25"), sources_present=True,
            phase_index="", record="", metrics="", backlog="", deferred="none",
            declaration=gh.declared_by({}, "Matt K"), generated_at="now",
        )
        assert "Matt K" in report
        assert report.index("Matt K") < report.index("## Outcomes")
