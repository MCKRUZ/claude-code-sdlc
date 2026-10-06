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


# ---------------------------------------------------------------------------
# Tōgō command center (togo-command-center.md §2.5 row 9): findings[], recurrence{}, --spec
# ---------------------------------------------------------------------------

from record_findings import attribute_to_spec, findings_rows, scope_paths, target_under  # noqa: E402

SPEC_WITH_SCOPE = """\
---
spec: "0042"
name: "duplicate-claim"
status: draft
risk: LOW
---

# Spec 0042 — x

## Scope

### In scope
- `src/Claims/**`
- the file `design-doc.md`

### Out of scope
- `src/Billing/`

## Acceptance Checks
- [ ] something
"""


def _entry(fp, disp, ts, **extra):
    cat, _, target = fp.partition(":")
    return {"fingerprint": fp, "category": cat, "target": target, "disposition": disp,
            "severity": "HIGH", "timestamp": ts, "id": "F1", "detail": "d", "report": "review-report.md", **extra}


class TestFindingsRows:
    def test_the_same_fingerprint_twice_is_one_row_with_two_rounds(self):
        rows = findings_rows([_entry("auth-gap:x.md", "OPEN", "t1"), _entry("auth-gap:x.md", "FIXED", "t2")])
        assert len(rows) == 1
        row = rows[0]
        assert row["rounds"] == 2 and row["first_seen"] == "t1" and row["last_seen"] == "t2"
        assert row["disposition"] == "FIXED" and row["off_books"] is True

    def test_a_split_without_its_evidence_is_still_on_the_books(self):
        row = findings_rows([_entry("leak:y.md", "SPLIT", "t1")])[0]
        assert row["off_books"] is False and "split_to" in row["off_books_reason"]
        ok = findings_rows([_entry("leak:y.md", "SPLIT", "t1", split_to="0042", owner="Jane")])[0]
        assert ok["off_books"] is True and ok["evidence"] == {"split_to": "0042", "owner": "Jane"}

    def test_an_ai_approver_cannot_take_an_accepted_risk_off_the_books(self):
        row = findings_rows([_entry("leak:y.md", "ACCEPTED_RISK", "t1", approver="Claude", date="d",
                                    reason="r", review_condition="c")])[0]
        assert row["off_books"] is False

    def test_rows_keep_first_appearance_order_and_entries_without_a_fingerprint_are_skipped(self):
        rows = findings_rows([_entry("b:x.md", "OPEN", "t1"), {"disposition": "OPEN"}, _entry("a:y.md", "OPEN", "t2")])
        assert [r["fingerprint"] for r in rows] == ["b:x.md", "a:y.md"]


class TestScopeAttribution:
    def test_scope_paths_are_the_backticked_in_scope_paths_only(self):
        assert scope_paths(SPEC_WITH_SCOPE) == ["src/Claims/**", "design-doc.md"]
        assert scope_paths("# no scope\n") == []
        assert scope_paths("## Scope\n\n### In scope\n- the claims service\n") == []

    @pytest.mark.parametrize("target, scope, expected", [
        ("src/Claims/ClaimsController.cs:88", "src/Claims/**", True),
        ("src/Billing/x.cs", "src/Claims/**", False),
        ("design-doc.md:12", "design-doc.md", True),
        ("design-doc.md.bak", "design-doc.md", False),
        ("src/Claims/a.cs", "src/Claims", True),
        ("src/Claimsx/a.cs", "src/Claims", False),
        ("", "src/Claims/**", False),
    ])
    def test_target_under(self, target, scope, expected):
        assert target_under(target, scope) is expected

    def test_attribution_counts_both_sides_and_names_the_method(self):
        rows = findings_rows([_entry("auth-gap:src/Claims/a.cs", "OPEN", "t1"),
                              _entry("leak:src/Billing/b.cs", "OPEN", "t2")])
        mine, attribution = attribute_to_spec(rows, scope_paths(SPEC_WITH_SCOPE))
        assert [r["fingerprint"] for r in mine] == ["auth-gap:src/Claims/a.cs"]
        assert attribution == {"method": "scope-paths", "scope_paths": ["src/Claims/**", "design-doc.md"],
                               "attributed": 1, "unattributed": 1}

    def test_no_scope_paths_attributes_nothing(self):
        rows = findings_rows([_entry("auth-gap:src/Claims/a.cs", "OPEN", "t1")])
        mine, attribution = attribute_to_spec(rows, [])
        assert mine == [] and attribution["attributed"] == 0 and attribution["unattributed"] == 1


class TestReportJsonAdditions:
    def _args(self, **kw):
        base = dict(command="report", state=None, repo=None, strict=False, json=True, spec=None)
        return argparse.Namespace(**{**base, **kw})

    def _ledger(self, tmp_path, *entries):
        metrics = tmp_path / ".sdlc" / "metrics"
        metrics.mkdir(parents=True, exist_ok=True)
        with open(metrics / "findings-log.jsonl", "w", encoding="utf-8") as f:
            for e in entries:
                f.write(json.dumps(e) + "\n")

    def test_the_three_legacy_keys_are_unchanged_and_the_new_ones_ride_beside(self, tmp_path, capsys):
        self._ledger(tmp_path, _entry("auth-gap:x.md", "OPEN", "t1"), _entry("auth-gap:x.md", "OPEN", "t2"),
                     _entry("leak:y.md", "OPEN", "t3"))
        rc = cmd_report(self._args(repo=str(tmp_path)))
        out = json.loads(capsys.readouterr().out)
        assert rc == 0
        assert (out["tracked"], out["open_debt"], out["fixed_claim_mismatches"]) == (2, 2, 0)
        assert [r["rounds"] for r in out["findings"]] == [2, 1]
        assert out["recurrence"] == {"auth-gap:x.md": 2, "leak:y.md": 1}
        assert "attribution" not in out

    def test_spec_filters_the_listing_but_not_the_counts(self, tmp_path, capsys):
        self._ledger(tmp_path, _entry("auth-gap:src/Claims/a.cs", "OPEN", "t1"), _entry("leak:src/Billing/b.cs", "OPEN", "t2"))
        spec = tmp_path / "specs" / "0042-duplicate-claim.md"
        spec.parent.mkdir()
        spec.write_text(SPEC_WITH_SCOPE, encoding="utf-8")
        cmd_report(self._args(repo=str(tmp_path), spec=str(spec)))
        out = json.loads(capsys.readouterr().out)
        assert out["tracked"] == 2 and out["open_debt"] == 2
        assert [r["target"] for r in out["findings"]] == ["src/Claims/a.cs"]
        assert out["recurrence"] == {"auth-gap:src/Claims/a.cs": 1}
        assert out["attribution"] == {"method": "scope-paths", "scope_paths": ["src/Claims/**", "design-doc.md"],
                                      "attributed": 1, "unattributed": 1}

    def test_spec_with_no_scope_paths_attributes_zero(self, tmp_path, capsys):
        self._ledger(tmp_path, _entry("auth-gap:x.md", "OPEN", "t1"))
        spec = tmp_path / "spec.md"
        spec.write_text("---\nspec: \"0001\"\n---\n# s\n\n## Scope\n\n### In scope\n- prose only\n", encoding="utf-8")
        cmd_report(self._args(repo=str(tmp_path), spec=str(spec)))
        out = json.loads(capsys.readouterr().out)
        assert out["findings"] == [] and out["attribution"]["attributed"] == 0

    def test_a_missing_spec_is_an_error_not_an_empty_attribution(self, tmp_path, capsys):
        self._ledger(tmp_path)
        assert cmd_report(self._args(repo=str(tmp_path), spec=str(tmp_path / "nope.md"))) == 1

    def test_strict_still_exits_two_on_a_mismatch_with_the_new_keys_present(self, tmp_path, capsys):
        self._ledger(tmp_path, {**_entry("auth-gap:x.md", "OPEN", "t1"), "target_sha": "sha256:aaaa"},
                     {**_entry("auth-gap:x.md", "FIXED", "t2"), "target_sha": "sha256:aaaa"})
        rc = cmd_report(self._args(repo=str(tmp_path), strict=True))
        out = json.loads(capsys.readouterr().out)
        assert rc == 2 and out["fixed_claim_mismatches"] == 1 and out["findings"][0]["disposition"] == "FIXED"

    def test_an_empty_ledger_reads_as_empty_lists_not_zeros_in_disguise(self, tmp_path, capsys):
        cmd_report(self._args(repo=str(tmp_path)))
        out = json.loads(capsys.readouterr().out)
        assert out["findings"] == [] and out["recurrence"] == {}

    def test_text_mode_without_spec_is_byte_identical_to_format_report(self, tmp_path, capsys):
        self._ledger(tmp_path, _entry("auth-gap:x.md", "OPEN", "t1"))
        cmd_report(self._args(repo=str(tmp_path), json=False))
        printed = capsys.readouterr().out
        text, _ = format_report(load_ledger(tmp_path / ".sdlc" / "metrics" / "findings-log.jsonl"))
        assert printed == text + "\n"


from record_findings import format_report  # noqa: E402
