"""Tests for record_findings.py — parsing, the ledger, and the FIXED-claim check."""

import argparse
import json

import pytest

from record_findings import (
    _parse_disposition_cell,
    build_entry,
    cmd_record,
    cmd_report,
    current_state,
    find_fixed_claim_mismatches,
    load_ledger,
    parse_findings_block,
    resolve_target_sha,
)

REPORT_TEMPLATE = """# Review Report — Phase 2: Design

**Mode:** council

## Gate Results

<!-- findings: critical=0 high=2 medium=1 low=0 -->

| id | category | severity | target | disposition | detail |
|----|----------|----------|--------|-------------|--------|
| F1 | missing-rollback | HIGH | design-doc.md:88 | OPEN | no rollback for the migration |
| F2 | auth-gap | HIGH | design-doc.md:120 | OPEN | offline refresh unspecified |
| F3 | untestable-criterion | MEDIUM | requirements.md:42 | OPEN | no measurable signal |

## Summary

Three findings.
"""


class TestParseDispositionCell:
    def test_bare(self):
        assert _parse_disposition_cell("OPEN") == ("OPEN", {})

    def test_with_fields(self):
        disp, fields = _parse_disposition_cell("ACCEPTED_RISK(approver=Jane Doe; date=2026-07-06; reason=low; review_condition=GA)")
        assert disp == "ACCEPTED_RISK"
        assert fields["approver"] == "Jane Doe"
        assert fields["review_condition"] == "GA"

    def test_split_fields(self):
        disp, fields = _parse_disposition_cell("SPLIT(split_to=0042; owner=Jane)")
        assert disp == "SPLIT"
        assert fields == {"split_to": "0042", "owner": "Jane"}


class TestParseFindingsBlock:
    def test_parses_rows(self):
        findings, err = parse_findings_block(REPORT_TEMPLATE)
        assert err is None
        assert len(findings) == 3
        assert findings[0]["category"] == "missing-rollback"
        assert findings[0]["severity"] == "HIGH"
        assert findings[0]["disposition"] == "OPEN"

    def test_missing_block_is_error(self):
        findings, err = parse_findings_block("# Report\n\nNo structured block here.\n")
        assert findings == []
        assert "Gate Results" in err

    def test_block_in_code_fence_is_not_top_level(self):
        text = "# Report\n\n```\n## Gate Results\n| id |\n```\n"
        _, err = parse_findings_block(text)
        assert err is not None

    def test_empty_table_is_error(self):
        text = "## Gate Results\n\n| id | category | severity | target | disposition | detail |\n|--|--|--|--|--|--|\n"
        findings, err = parse_findings_block(text)
        assert findings == []
        assert err is not None


class TestResolveTargetSha:
    def test_finds_file_under_repo(self, tmp_path):
        (tmp_path / "design-doc.md").write_text("hello", encoding="utf-8")
        sha = resolve_target_sha("design-doc.md:88", tmp_path)
        assert sha and sha.startswith("sha256:")

    def test_bare_filename_searched_recursively(self, tmp_path):
        sub = tmp_path / ".sdlc" / "artifacts" / "02-design"
        sub.mkdir(parents=True)
        (sub / "design-doc.md").write_text("hi", encoding="utf-8")
        assert resolve_target_sha("design-doc.md:1", tmp_path) is not None

    def test_unresolvable_is_none(self, tmp_path):
        assert resolve_target_sha("nope.md:1", tmp_path) is None
        assert resolve_target_sha("", tmp_path) is None


class TestLedgerAndState:
    def test_current_state_takes_latest_per_fingerprint(self):
        ledger = [
            {"fingerprint": "auth-gap:x.md", "disposition": "OPEN", "timestamp": "t1"},
            {"fingerprint": "auth-gap:x.md", "disposition": "FIXED", "timestamp": "t2"},
            {"fingerprint": "leak:y.md", "disposition": "OPEN", "timestamp": "t3"},
        ]
        state = current_state(ledger)
        assert state["auth-gap:x.md"]["disposition"] == "FIXED"
        assert state["leak:y.md"]["disposition"] == "OPEN"

    def test_build_entry_captures_fingerprint_and_sha(self, tmp_path):
        (tmp_path / "x.md").write_text("body", encoding="utf-8")
        entry = build_entry(
            {"id": "F1", "category": "auth-gap", "severity": "high", "target": "x.md:5", "disposition": "open"},
            "review-report.md", tmp_path, "2026-07-06T00:00:00+00:00",
        )
        assert entry["fingerprint"] == "auth-gap:x.md"
        assert entry["severity"] == "HIGH"
        assert entry["disposition"] == "OPEN"
        assert entry["target_sha"].startswith("sha256:")


class TestFixedClaimCheck:
    def test_flags_fixed_but_unchanged(self):
        ledger = [
            {"fingerprint": "auth-gap:x.md", "disposition": "OPEN", "target_sha": "sha256:aaaa", "target": "x.md"},
            {"fingerprint": "auth-gap:x.md", "disposition": "FIXED", "target_sha": "sha256:aaaa", "target": "x.md"},
        ]
        mism = find_fixed_claim_mismatches(ledger)
        assert len(mism) == 1

    def test_legit_fix_when_file_changed(self):
        ledger = [
            {"fingerprint": "auth-gap:x.md", "disposition": "OPEN", "target_sha": "sha256:aaaa"},
            {"fingerprint": "auth-gap:x.md", "disposition": "FIXED", "target_sha": "sha256:bbbb"},
        ]
        assert find_fixed_claim_mismatches(ledger) == []

    def test_unverifiable_sha_is_skipped(self):
        ledger = [
            {"fingerprint": "auth-gap:x.md", "disposition": "OPEN", "target_sha": None},
            {"fingerprint": "auth-gap:x.md", "disposition": "FIXED", "target_sha": None},
        ]
        assert find_fixed_claim_mismatches(ledger) == []


class TestCommandsEndToEnd:
    def _args(self, **kw):
        return argparse.Namespace(**kw)

    def test_record_then_report_roundtrip(self, tmp_path, capsys):
        (tmp_path / ".sdlc").mkdir()
        (tmp_path / "design-doc.md").write_text("design", encoding="utf-8")
        (tmp_path / "requirements.md").write_text("reqs", encoding="utf-8")
        report = tmp_path / "review-report.md"
        report.write_text(REPORT_TEMPLATE, encoding="utf-8")

        rc = cmd_record(self._args(command="record", report=str(report), state=None, repo=str(tmp_path)))
        assert rc == 0
        ledger = load_ledger(tmp_path / ".sdlc" / "metrics" / "findings-log.jsonl")
        assert len(ledger) == 3
        capsys.readouterr()  # drain the record output so the report JSON reads clean

        rc = cmd_report(self._args(command="report", state=None, repo=str(tmp_path), strict=False, json=True))
        out = json.loads(capsys.readouterr().out)
        assert out["tracked"] == 3
        assert out["open_debt"] == 2  # two HIGH, the MEDIUM doesn't count
        assert out["fixed_claim_mismatches"] == 0
        assert rc == 0

    def test_record_missing_block_returns_error(self, tmp_path):
        (tmp_path / ".sdlc").mkdir()
        report = tmp_path / "review-report.md"
        report.write_text("# Report\n\nno block\n", encoding="utf-8")
        rc = cmd_record(self._args(command="record", report=str(report), state=None, repo=str(tmp_path)))
        assert rc == 1

    def test_strict_report_exits_two_on_mismatch(self, tmp_path, capsys):
        metrics = tmp_path / ".sdlc" / "metrics"
        metrics.mkdir(parents=True)
        ledger = metrics / "findings-log.jsonl"
        with open(ledger, "w", encoding="utf-8") as f:
            f.write(json.dumps({"fingerprint": "auth-gap:x.md", "disposition": "OPEN", "target_sha": "sha256:aaaa", "severity": "HIGH", "target": "x.md"}) + "\n")
            f.write(json.dumps({"fingerprint": "auth-gap:x.md", "disposition": "FIXED", "target_sha": "sha256:aaaa", "severity": "HIGH", "target": "x.md"}) + "\n")
        rc = cmd_report(self._args(command="report", state=None, repo=str(tmp_path), strict=True, json=False))
        assert rc == 2
        assert "FIXED_CLAIM_MISMATCH" in capsys.readouterr().out
