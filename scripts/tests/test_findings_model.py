"""Tests for findings_model.py — severity mapping, disposition counting, identity."""

from findings_model import (
    DEBT_SEVERITIES,
    SEVERITIES,
    counts_as_debt,
    debt_exceeds_bar,
    fingerprint,
    is_ai_actor,
    normalize_disposition,
    normalize_severity,
    open_debt,
    to_gate_severity,
    validate_disposition,
)


class TestNormalize:
    def test_severity_canonical(self):
        assert normalize_severity("high") == "HIGH"
        assert normalize_severity(" Critical ") == "CRITICAL"
        assert normalize_severity("bogus") is None
        assert normalize_severity(None) is None

    def test_disposition_canonical(self):
        assert normalize_disposition("open") == "OPEN"
        assert normalize_disposition("accepted_risk") == "ACCEPTED_RISK"
        assert normalize_disposition("waffle") is None


class TestGateSeverityMap:
    def test_maps_high_and_critical_to_must(self):
        assert to_gate_severity("CRITICAL") == "MUST"
        assert to_gate_severity("HIGH") == "MUST"

    def test_medium_should_low_info(self):
        assert to_gate_severity("MEDIUM") == "SHOULD"
        assert to_gate_severity("LOW") == "INFO"

    def test_unknown_defaults_info(self):
        assert to_gate_severity("wat") == "INFO"

    def test_debt_severities_are_the_must_ones(self):
        assert set(DEBT_SEVERITIES) == {s for s in SEVERITIES if to_gate_severity(s) == "MUST"}


class TestIsAiActor:
    def test_flags_ai_names(self):
        assert is_ai_actor("Claude")
        assert is_ai_actor("the agent")
        assert is_ai_actor("GPT-4")
        assert is_ai_actor("automated reviewer")

    def test_allows_human_names(self):
        assert not is_ai_actor("Jane Doe")
        assert not is_ai_actor("Aiden Bishop")  # 'ai'/'bot' only as whole words
        assert not is_ai_actor("")


class TestValidateDisposition:
    def test_open_and_postponed_count(self):
        assert validate_disposition({"disposition": "OPEN"})[0] is False
        assert validate_disposition({"disposition": "POSTPONED"})[0] is False

    def test_fixed_off_books(self):
        assert validate_disposition({"disposition": "FIXED"})[0] is True

    def test_split_needs_id_and_owner(self):
        assert validate_disposition({"disposition": "SPLIT"})[0] is False
        assert validate_disposition({"disposition": "SPLIT", "split_to": "0042"})[0] is False
        assert validate_disposition({"disposition": "SPLIT", "split_to": "0042", "owner": "Jane"})[0] is True

    def test_accepted_risk_needs_all_four_fields(self):
        base = {"disposition": "ACCEPTED_RISK", "approver": "Jane Doe", "date": "2026-07-06", "reason": "low blast radius"}
        assert validate_disposition(base)[0] is False  # missing review_condition
        base["review_condition"] = "revisit at GA"
        assert validate_disposition(base)[0] is True

    def test_accepted_risk_rejects_ai_approver(self):
        f = {"disposition": "ACCEPTED_RISK", "approver": "Claude", "date": "2026-07-06",
             "reason": "x", "review_condition": "y"}
        off, reason = validate_disposition(f)
        assert off is False
        assert "human" in reason

    def test_unknown_disposition_counts(self):
        assert validate_disposition({"disposition": "SHRUG"})[0] is False


class TestCountsAsDebt:
    def test_open_high_counts(self):
        assert counts_as_debt({"severity": "HIGH", "disposition": "OPEN"})

    def test_open_medium_does_not_count(self):
        assert not counts_as_debt({"severity": "MEDIUM", "disposition": "OPEN"})

    def test_fixed_high_does_not_count(self):
        assert not counts_as_debt({"severity": "HIGH", "disposition": "FIXED"})

    def test_mislabeled_split_high_still_counts(self):
        assert counts_as_debt({"severity": "CRITICAL", "disposition": "SPLIT"})  # no id/owner


class TestOpenDebtAndBar:
    def test_open_debt_filters(self):
        findings = [
            {"severity": "HIGH", "disposition": "OPEN"},
            {"severity": "CRITICAL", "disposition": "OPEN"},
            {"severity": "HIGH", "disposition": "FIXED"},
            {"severity": "LOW", "disposition": "OPEN"},
        ]
        assert len(open_debt(findings)) == 2

    def test_bar_threshold(self):
        two = [{"severity": "HIGH", "disposition": "OPEN"}, {"severity": "HIGH", "disposition": "OPEN"}]
        assert debt_exceeds_bar(two) is True
        assert debt_exceeds_bar(two[:1]) is False
        assert debt_exceeds_bar(two, threshold=3) is False


class TestFingerprint:
    def test_category_plus_file(self):
        assert fingerprint({"category": "Missing Rollback", "target": "design-doc.md:88"}) == "missing-rollback:design-doc.md"

    def test_line_stripped_so_same_class_same_place_matches(self):
        a = fingerprint({"category": "auth-gap", "target": "x.md:10"})
        b = fingerprint({"category": "auth-gap", "target": "x.md:99"})
        assert a == b == "auth-gap:x.md"

    def test_no_target_is_just_category(self):
        assert fingerprint({"category": "scope-ambiguity"}) == "scope-ambiguity"

    def test_missing_category_is_uncategorized(self):
        assert fingerprint({"target": "x.md"}) == "uncategorized:x.md"
