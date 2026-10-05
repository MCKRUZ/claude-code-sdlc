"""Tests for record_draft.py — the AI-draft audit ledger (spec 0010).

The decision this file exists to honour: a DISCARDED draft is still recorded. Most of these
tests are really about that — that the discard path writes an entry, that it is counted, and
that it never leaks into the document's own version history.
"""

import json
import subprocess
import sys
from pathlib import Path

from record_draft import (
    LEDGER_NAME,
    build_entry,
    load_ledger,
    normalize_artifact,
    summarize,
)

CLI_PATH = Path(__file__).resolve().parent.parent / "record_draft.py"


class Args:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


def _record(repo: Path, **overrides) -> subprocess.CompletedProcess:
    args = {
        "--artifact": ".sdlc/artifacts/01-requirements/requirements.md",
        "--field": "Rationale",
        "--outcome": "accepted",
        "--actor": "matt",
    }
    args.update(overrides)
    argv = [sys.executable, str(CLI_PATH), "record", "--repo", str(repo)]
    for k, v in args.items():
        argv += [k, str(v)]
    return subprocess.run(argv, capture_output=True, text=True, timeout=30)


class TestNormalizeArtifact:
    def test_absolute_path_inside_the_repo_becomes_repo_relative(self, tmp_path: Path):
        doc = tmp_path / ".sdlc" / "artifacts" / "01-requirements" / "requirements.md"
        doc.parent.mkdir(parents=True)
        doc.write_text("x")
        assert normalize_artifact(str(doc), tmp_path) == ".sdlc/artifacts/01-requirements/requirements.md"

    def test_already_relative_path_is_forward_slashed(self, tmp_path: Path):
        assert normalize_artifact(r".sdlc\artifacts\a.md", tmp_path) == ".sdlc/artifacts/a.md"


class TestBuildEntry:
    def _args(self, **over):
        base = dict(
            artifact="a.md", field="Rationale", outcome="accepted", actor="matt",
            section=None, instance=None, chars_offered=None, chars_kept=None,
        )
        base.update(over)
        return Args(**base)

    def test_optional_fields_are_omitted_when_unset(self, tmp_path: Path):
        entry = build_entry(self._args(), tmp_path, "T")
        for absent in ("section", "instance", "chars_offered", "chars_kept"):
            assert absent not in entry

    def test_zero_chars_kept_is_recorded_not_dropped(self, tmp_path: Path):
        """A discarded draft keeps zero characters — that zero is the whole point, so it must
        not be treated as 'unset' and omitted."""
        entry = build_entry(self._args(outcome="discarded", chars_offered=90, chars_kept=0), tmp_path, "T")
        assert entry["chars_kept"] == 0
        assert entry["outcome"] == "discarded"


class TestSummarize:
    def test_empty_ledger_reports_no_drafts(self):
        s = summarize([])
        assert s["drafts"] == 0
        assert s["kept_share"] is None  # no data, never a fabricated 0%

    def test_counts_each_outcome(self):
        s = summarize([
            {"outcome": "accepted"}, {"outcome": "edited"},
            {"outcome": "discarded"}, {"outcome": "discarded"},
        ])
        assert s["drafts"] == 4
        assert s["by_outcome"] == {"accepted": 1, "edited": 1, "discarded": 2}

    def test_kept_share_uses_character_counts(self):
        s = summarize([
            {"outcome": "accepted", "chars_offered": 100, "chars_kept": 100},
            {"outcome": "discarded", "chars_offered": 100, "chars_kept": 0},
        ])
        assert s["kept_share"] == 0.5

    def test_entries_without_sizes_do_not_fabricate_a_share(self):
        s = summarize([{"outcome": "accepted"}, {"outcome": "discarded"}])
        assert s["drafts"] == 2
        assert s["kept_share"] is None

    def test_an_unknown_outcome_is_not_counted_as_a_known_one(self):
        s = summarize([{"outcome": "something-else"}])
        assert s["by_outcome"] == {"accepted": 0, "edited": 0, "discarded": 0}


class TestLoadLedger:
    def test_missing_ledger_is_empty_not_an_error(self, tmp_path: Path):
        assert load_ledger(tmp_path / "nope.jsonl") == []

    def test_a_torn_line_does_not_take_the_whole_report_down(self, tmp_path: Path):
        p = tmp_path / LEDGER_NAME
        p.write_text('{"outcome": "accepted"}\nnot json at all\n{"outcome": "discarded"}\n', encoding="utf-8")
        assert len(load_ledger(p)) == 2


class TestCli:
    def test_recording_a_discarded_draft_writes_an_entry(self, tmp_path: Path):
        proc = _record(tmp_path, **{"--outcome": "discarded", "--chars-offered": 90, "--chars-kept": 0})
        assert proc.returncode == 0, proc.stderr
        entries = load_ledger(tmp_path / ".sdlc" / "metrics" / LEDGER_NAME)
        assert len(entries) == 1
        assert entries[0]["outcome"] == "discarded"
        assert entries[0]["chars_kept"] == 0

    def test_the_draft_ledger_is_separate_from_the_version_history(self, tmp_path: Path):
        """The decision was explicit: a discarded draft is recorded, but NOT into the
        document's version history, which stays a record of what the document actually says."""
        _record(tmp_path, **{"--outcome": "discarded"})
        metrics = tmp_path / ".sdlc" / "metrics"
        assert (metrics / LEDGER_NAME).exists()
        assert not (metrics / "artifact-log.jsonl").exists()

    def test_appends_rather_than_overwrites(self, tmp_path: Path):
        _record(tmp_path)
        _record(tmp_path, **{"--outcome": "discarded"})
        assert len(load_ledger(tmp_path / ".sdlc" / "metrics" / LEDGER_NAME)) == 2

    def test_an_unknown_outcome_is_refused(self, tmp_path: Path):
        proc = _record(tmp_path, **{"--outcome": "maybe"})
        assert proc.returncode == 1
        assert "must be one of" in proc.stdout
        assert not (tmp_path / ".sdlc" / "metrics" / LEDGER_NAME).exists()

    def test_report_json_round_trips(self, tmp_path: Path):
        _record(tmp_path, **{"--chars-offered": 10, "--chars-kept": 10})
        proc = subprocess.run(
            [sys.executable, str(CLI_PATH), "report", "--repo", str(tmp_path), "--json"],
            capture_output=True, text=True, timeout=30,
        )
        assert proc.returncode == 0
        assert json.loads(proc.stdout)["drafts"] == 1

    def test_report_on_an_untouched_project_says_no_data(self, tmp_path: Path):
        proc = subprocess.run(
            [sys.executable, str(CLI_PATH), "report", "--repo", str(tmp_path)],
            capture_output=True, text=True, timeout=30,
        )
        assert proc.returncode == 0
        assert "no data" in proc.stdout
