"""Tests for risk_model.py — the risk taxonomy and checking-ladder resolver."""

import risk_model as rm


class TestNormalizeTier:
    def test_canonicalizes(self):
        assert rm.normalize_tier(" high ") == "HIGH"
        assert rm.normalize_tier("Medium") == "MEDIUM"

    def test_invalid_is_none(self):
        assert rm.normalize_tier("CRITICAL") is None
        assert rm.normalize_tier(None) is None

    def test_is_valid_tier(self):
        assert rm.is_valid_tier("low") is True
        assert rm.is_valid_tier("xyz") is False


class TestResolveLadder:
    def test_unknown_tier(self):
        assert rm.resolve_ladder("nope") is None

    def test_all_tiers_block_ci_and_require_non_author(self):
        for tier in rm.RISK_TIERS:
            ladder = rm.resolve_ladder(tier)
            assert ladder["ci_blocks"] is True
            assert ladder["grader_runs"] is True
            assert ladder["correctness_blocks_on_defect"] is True
            assert ladder["non_author_approval"] is True

    def test_high_requires_security_and_signoff(self):
        ladder = rm.resolve_ladder("HIGH")
        assert ladder["security_pass_required"] is True
        assert ladder["named_signoff_required"] is True
        assert ladder["review_depth"] == "full"

    def test_medium_and_low_no_security_or_signoff(self):
        for tier in ("MEDIUM", "LOW"):
            ladder = rm.resolve_ladder(tier)
            assert ladder["security_pass_required"] is False
            assert ladder["named_signoff_required"] is False

    def test_gated_path_forces_security_on_low(self):
        ladder = rm.resolve_ladder("LOW", touches_gated_path=True)
        assert ladder["security_pass_required"] is True
        # but a gated path alone does not demand a named sign-off
        assert ladder["named_signoff_required"] is False


class TestRequiredRungs:
    def test_high_lists_security_and_signoff(self):
        rungs = " | ".join(rm.required_rungs("HIGH"))
        assert "security pass" in rungs
        assert "named human sign-off" in rungs

    def test_low_omits_security_and_signoff(self):
        rungs = " | ".join(rm.required_rungs("LOW"))
        assert "security pass" not in rungs
        assert "sign-off" not in rungs
        assert "non-author approval" in rungs

    def test_unknown_tier_empty(self):
        assert rm.required_rungs("nope") == []
