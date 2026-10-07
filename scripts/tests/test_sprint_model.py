"""Tests for sprint_model.py — the pure sprint vocabulary, ready rule, slate, build order, writer rules."""

from datetime import date, datetime, timezone

import pytest

import check_spec
import scorecard
import sprint_model as sm


# --- helpers -----------------------------------------------------------------------------------

def row(id, risk="MEDIUM", status="ready", dor="READY", eng="accepted", data="accepted",
        depends_on="", sprint="S07", next_owner="", dor_blocking=None, **extra):
    r = {
        "id": id, "name": f"spec-{id}", "risk": risk, "type": "feature", "channel": "",
        "status": status, "sprint": sprint, "next_owner": next_owner,
        "eng_review": eng, "data_review": data, "depends_on": sm.parse_depends_on(depends_on),
        "dor": dor, "dor_blocking": dor_blocking or [], "path": f"specs/{id}-spec.md",
    }
    r.update(extra)
    return r


def by_id(*rows):
    return {r["id"]: r for r in rows}


SPEC_WITH_STATUS = (
    '---\n'
    'spec: "0007"\n'
    'name: "duplicate-claim-409"\n'
    'status: ready            # draft | ready | in-flight | merged\n'
    'type: feature\n'
    'risk: HIGH\n'
    '---\n'
    '\n'
    '# Spec 0007 — Duplicate claim 409\n'
    '\n'
    '## Goal\n'
    'Return 409 on a duplicate claim. # not a comment, body text\n'
    '\n'
    '---\n'
    'trailing rule in body\n'
)

SPEC_NO_STATUS = (
    '---\n'
    'spec: "0007"\n'
    'name: "duplicate-claim-409"\n'
    'risk: HIGH\n'
    '---\n'
    '# Spec 0007\n'
)


def body_of(text):
    return text[text.find("\n---", 3):]


# --- vocabulary --------------------------------------------------------------------------------

class TestVocabulary:
    def test_states_forward_only_order(self):
        assert sm.SPRINT_STATES == ("planning", "ready", "closed")

    def test_sprint_id_regex(self):
        assert sm.is_valid_sprint_id("S07")
        assert sm.is_valid_sprint_id("S123")
        assert not sm.is_valid_sprint_id("S7")
        assert not sm.is_valid_sprint_id("s07")
        assert not sm.is_valid_sprint_id("Sprint07")
        assert not sm.is_valid_sprint_id("")
        assert not sm.is_valid_sprint_id(None)

    def test_spec_keys_exact_and_status_excluded(self):
        assert sm.SPEC_KEYS == ("sprint", "next_owner", "eng_review", "data_review", "depends_on")
        assert "status" not in sm.SPEC_KEYS

    def test_review_values_and_lanes(self):
        assert sm.REVIEW_VALUES == ("pending", "accepted", "returned", "n-a")
        assert sm.LANES == ("eng", "data")
        assert sm.SLATEABLE_STATUSES == ("ready", "draft")

    def test_normalize_review(self):
        assert sm.normalize_review(" Accepted ") == "accepted"
        assert sm.normalize_review("N-A") == "n-a"
        assert sm.normalize_review("") is None
        assert sm.normalize_review(None) is None
        assert sm.normalize_review("approved") is None


# --- forbidden fields ----------------------------------------------------------------------------

class TestForbiddenFields:
    def test_superset_of_scorecard(self):
        assert set(scorecard.FORBIDDEN_TYPES) <= sm.FORBIDDEN_FIELDS

    def test_sprint_additions_present(self):
        for k in ("points", "estimate", "effort", "hours", "capacity"):
            assert k in sm.FORBIDDEN_FIELDS

    def test_is_forbidden_field_normalizes(self):
        assert sm.is_forbidden_field("velocity")
        assert sm.is_forbidden_field("Story-Points")
        assert sm.is_forbidden_field(" story points ")
        assert sm.is_forbidden_field("LOC")
        assert sm.is_forbidden_field("hours")
        assert not sm.is_forbidden_field("reason")
        assert not sm.is_forbidden_field("spec")
        assert not sm.is_forbidden_field(None)

    def test_refusal_wording_matches_scorecard_style(self):
        msg = sm.forbidden_field_message("points")
        assert msg.startswith("Refused: 'points' is an activity metric the standard never tracks")
        assert "Steering is on outcomes." in msg


# --- mix -------------------------------------------------------------------------------------

class TestParseMix:
    def test_valid(self):
        assert sm.parse_mix("HIGH:1,MEDIUM:2,LOW:3") == {"HIGH": 1, "MEDIUM": 2, "LOW": 3}

    def test_case_and_whitespace_tolerant(self):
        assert sm.parse_mix(" high : 1 , low:2 ") == {"HIGH": 1, "LOW": 2}

    def test_empty_is_no_mix(self):
        assert sm.parse_mix("") == {}
        assert sm.parse_mix(None) == {}
        assert sm.parse_mix("  ") == {}

    def test_partial_mix_allowed(self):
        assert sm.parse_mix("HIGH:2") == {"HIGH": 2}

    @pytest.mark.parametrize("bad", ["HIGH", "HIGH:x", "CRITICAL:1", "HIGH:-1", "HIGH:1,HIGH:2", "HIGH=1"])
    def test_invalid_raises(self, bad):
        with pytest.raises(ValueError):
            sm.parse_mix(bad)

    def test_sum_over_target_raises(self):
        with pytest.raises(ValueError, match="more than the target"):
            sm.parse_mix("HIGH:2,LOW:3", target=4)

    def test_sum_equal_to_target_ok(self):
        assert sm.parse_mix("HIGH:2,LOW:2", target=4) == {"HIGH": 2, "LOW": 2}

    def test_sum_under_target_ok(self):
        assert sm.parse_mix("HIGH:1", target=6) == {"HIGH": 1}

    def test_roundtrip_string(self):
        assert sm.mix_to_string(sm.parse_mix("LOW:3,HIGH:1")) == "HIGH:1,LOW:3"
        assert sm.mix_to_string({}) == ""


class TestMixStatus:
    def test_actual_vs_target(self):
        slate = [row("0001", "HIGH"), row("0002", "MEDIUM"), row("0003", "MEDIUM"), row("0004", "MEDIUM")]
        st = sm.mix_status(slate, {"HIGH": 1, "MEDIUM": 2, "LOW": 3})
        assert st == {
            "HIGH": {"target": 1, "actual": 1},
            "MEDIUM": {"target": 2, "actual": 3},
            "LOW": {"target": 3, "actual": 0},
        }

    def test_tier_not_in_mix_has_no_target_not_zero(self):
        st = sm.mix_status([row("0001", "LOW")], {"HIGH": 1})
        assert st["LOW"] == {"target": None, "actual": 1}
        assert st["HIGH"] == {"target": 1, "actual": 0}
        assert "MEDIUM" not in st

    def test_empty_everything_is_empty_not_zeros(self):
        assert sm.mix_status([], {}) == {}

    def test_ordered_high_to_low(self):
        st = sm.mix_status([row("0001", "LOW"), row("0002", "HIGH")], {"MEDIUM": 1})
        assert list(st) == ["HIGH", "MEDIUM", "LOW"]


class TestMixWarnings:
    def test_no_warnings_when_matched(self):
        slate = [row("0001", "HIGH"), row("0002", "LOW")]
        assert sm.mix_warnings(slate, {"HIGH": 1, "LOW": 1}, target=2) == []

    def test_breach_over(self):
        w = sm.mix_warnings([row("0001", "HIGH"), row("0002", "HIGH")], {"HIGH": 1}, target=2)
        assert any("mix breach: 2 HIGH slated vs 1" in m for m in w)

    def test_short(self):
        w = sm.mix_warnings([row("0001", "HIGH")], {"HIGH": 1, "LOW": 2}, target=3)
        assert any("mix short: 0 LOW slated vs 2" in m for m in w)

    def test_tier_without_target(self):
        w = sm.mix_warnings([row("0001", "LOW")], {"HIGH": 1}, target=2)
        assert any("no LOW target" in m for m in w)

    def test_slate_over_target_and_mix_sum_over_target(self):
        w = sm.mix_warnings([row("0001"), row("0002"), row("0003")], {"MEDIUM": 4}, target=2)
        assert any("slate has 3 specs, more than the target of 2" in m for m in w)
        assert any("mix counts sum to 4, more than the target of 2" in m for m in w)

    def test_no_target_no_mix_no_warnings(self):
        assert sm.mix_warnings([], {}, None) == []


# --- propose_slate ---------------------------------------------------------------------------

class TestProposeSlate:
    def cands(self):
        return [
            row("0005", "LOW", status="draft"), row("0001", "HIGH", status="ready"),
            row("0003", "MEDIUM", status="ready"), row("0002", "HIGH", status="draft"),
            row("0004", "MEDIUM", status="ready"), row("0006", "LOW", status="ready"),
            row("0007", "LOW", status="draft"),
        ]

    def test_fills_buckets_in_id_order(self):
        picked = sm.propose_slate(self.cands(), 4, {"HIGH": 1, "MEDIUM": 1, "LOW": 2})
        assert [r["id"] for r in picked] == ["0001", "0003", "0005", "0006"]

    def test_never_exceeds_target(self):
        picked = sm.propose_slate(self.cands(), 2, {"HIGH": 2, "MEDIUM": 2, "LOW": 2})
        assert len(picked) == 2
        assert [r["id"] for r in picked] == ["0001", "0002"]

    def test_remaining_slots_filled_by_id(self):
        picked = sm.propose_slate(self.cands(), 3, {"LOW": 1})
        assert [r["id"] for r in picked] == ["0001", "0002", "0005"]

    def test_no_mix_is_backlog_order(self):
        picked = sm.propose_slate(self.cands(), 3, {})
        assert [r["id"] for r in picked] == ["0001", "0002", "0003"]

    def test_bucket_short_falls_back_to_id(self):
        # only two HIGH exist; the third slot is filled by id from the rest
        picked = sm.propose_slate(self.cands(), 3, {"HIGH": 3})
        assert [r["id"] for r in picked] == ["0001", "0002", "0003"]

    def test_fewer_candidates_than_target(self):
        picked = sm.propose_slate([row("0009")], 5, {"HIGH": 1})
        assert [r["id"] for r in picked] == ["0009"]

    def test_zero_or_negative_target_is_empty(self):
        assert sm.propose_slate(self.cands(), 0, {"HIGH": 1}) == []
        assert sm.propose_slate(self.cands(), -1, {}) == []

    def test_does_not_mutate_input(self):
        c = self.cands()
        before = [r["id"] for r in c]
        sm.propose_slate(c, 3, {"HIGH": 1})
        assert [r["id"] for r in c] == before


# --- dependencies -----------------------------------------------------------------------------

class TestParseDependsOn:
    def test_forms(self):
        assert sm.parse_depends_on("") == []
        assert sm.parse_depends_on(None) == []
        assert sm.parse_depends_on("0007") == ["0007"]
        assert sm.parse_depends_on("0007, 0009") == ["0007", "0009"]
        assert sm.parse_depends_on("0007,0009,") == ["0007", "0009"]

    def test_list_passthrough_and_dedupe(self):
        assert sm.parse_depends_on(["0007", " 0009 ", "0007"]) == ["0007", "0009"]
        assert sm.parse_depends_on("0007,0007") == ["0007"]


class TestDependencyGraph:
    def test_graph(self):
        g = sm.dependency_graph([row("0001", depends_on="0002,0009"), row("0002")])
        assert g == {"0001": ["0002", "0009"], "0002": []}


class TestDependencyGaps:
    def test_no_gaps(self):
        slate = [row("0001", depends_on="0002"), row("0002")]
        assert sm.dependency_gaps(slate, by_id(*slate)) == []

    def test_cycle(self):
        slate = [row("0001", depends_on="0002"), row("0002", depends_on="0001")]
        gaps = sm.dependency_gaps(slate, by_id(*slate))
        assert any("dependency cycle" in g for g in gaps)
        assert any(g.startswith("0001:") for g in gaps)
        assert any(g.startswith("0002:") for g in gaps)

    def test_dep_outside_slate_unmerged(self):
        slate = [row("0001", depends_on="0009")]
        outside = row("0009", status="ready", sprint="")
        gaps = sm.dependency_gaps(slate, by_id(*slate, outside))
        assert gaps == ["0001: depends on 0009 (status ready), which is outside the slate and not merged"]

    def test_dep_outside_slate_merged_is_fine(self):
        slate = [row("0001", depends_on="0009")]
        outside = row("0009", status="merged", sprint="")
        assert sm.dependency_gaps(slate, by_id(*slate, outside)) == []

    def test_unknown_id(self):
        slate = [row("0001", depends_on="0042")]
        assert sm.dependency_gaps(slate, by_id(*slate)) == ["0001: depends on 0042, which is not a known spec"]

    def test_without_all_rows_uses_slate_only(self):
        slate = [row("0001", depends_on="0042")]
        assert sm.dependency_gaps(slate) == ["0001: depends on 0042, which is not a known spec"]


# --- build order / next up -------------------------------------------------------------------

class TestBuildOrder:
    def test_empty(self):
        assert sm.build_order([]) == []

    def test_dependencies_first(self):
        slate = [row("0001", "HIGH", depends_on="0003"), row("0003", "LOW")]
        assert sm.build_order(slate) == ["0003", "0001"]

    def test_unblocks_most_wins_over_tier(self):
        # 0002 (LOW) unblocks two specs; 0001 (HIGH) unblocks none.
        slate = [row("0001", "HIGH"), row("0002", "LOW"), row("0003", "MEDIUM", depends_on="0002"),
                 row("0004", "MEDIUM", depends_on="0002")]
        order = sm.build_order(slate)
        assert order[0] == "0002"
        assert order.index("0002") < order.index("0003")
        assert order.index("0002") < order.index("0004")

    def test_unblocks_counts_transitively(self):
        # 0001 -> unblocks 0002 -> unblocks 0003 (chain of 2); 0009 unblocks only 0008 directly.
        slate = [row("0001", "LOW"), row("0002", "LOW", depends_on="0001"), row("0003", "LOW", depends_on="0002"),
                 row("0009", "HIGH"), row("0008", "LOW", depends_on="0009")]
        assert sm.build_order(slate)[0] == "0001"

    def test_high_before_medium_before_low(self):
        slate = [row("0001", "LOW"), row("0002", "MEDIUM"), row("0003", "HIGH")]
        assert sm.build_order(slate) == ["0003", "0002", "0001"]

    def test_id_is_final_tiebreak(self):
        slate = [row("0009", "MEDIUM"), row("0002", "MEDIUM"), row("0005", "MEDIUM")]
        assert sm.build_order(slate) == ["0002", "0005", "0009"]

    def test_full_heuristic_chain(self):
        # 0004 (LOW) unblocks 0001 and 0002 -> first. Then 0001 (HIGH) vs 0002 (LOW): HIGH first. Then 0003.
        slate = [row("0001", "HIGH", depends_on="0004"), row("0002", "LOW", depends_on="0004"),
                 row("0003", "MEDIUM"), row("0004", "LOW")]
        # 0003 (MEDIUM, unblocks 0) vs 0004 (LOW, unblocks 2) -> 0004 first.
        assert sm.build_order(slate) == ["0004", "0001", "0003", "0002"]

    def test_deps_outside_slate_are_ignored_for_ordering(self):
        slate = [row("0001", "LOW", depends_on="0099"), row("0002", "LOW")]
        assert sm.build_order(slate) == ["0001", "0002"]

    def test_cycle_still_returns_every_spec_once(self):
        slate = [row("0001", depends_on="0002"), row("0002", depends_on="0001"), row("0003", "HIGH")]
        order = sm.build_order(slate)
        assert sorted(order) == ["0001", "0002", "0003"]
        assert order[0] == "0003"


class TestNextUp:
    def test_first_ready_in_order(self):
        slate = [row("0001"), row("0002")]
        assert sm.next_up(["0001", "0002"], slate, by_id(*slate)) == "0001"

    def test_skips_not_ready_dor(self):
        slate = [row("0001", dor="NOT READY"), row("0002")]
        assert sm.next_up(["0001", "0002"], slate, by_id(*slate)) == "0002"

    def test_skips_status_not_ready(self):
        slate = [row("0001", status="draft"), row("0002", status="in-flight"), row("0003")]
        assert sm.next_up(["0001", "0002", "0003"], slate, by_id(*slate)) == "0003"

    def test_skips_unmerged_dependency(self):
        dep = row("0009", status="in-flight", sprint="")
        slate = [row("0001", depends_on="0009"), row("0002")]
        assert sm.next_up(["0001", "0002"], slate, by_id(*slate, dep)) == "0002"

    def test_merged_dependency_ok(self):
        dep = row("0009", status="merged", sprint="")
        slate = [row("0001", depends_on="0009"), row("0002")]
        assert sm.next_up(["0001", "0002"], slate, by_id(*slate, dep)) == "0001"

    def test_unknown_dependency_blocks(self):
        slate = [row("0001", depends_on="0042")]
        assert sm.next_up(["0001"], slate, by_id(*slate)) is None

    def test_wip_cap_reached_is_none(self):
        inflight = [row("0010", status="in-flight", sprint=""), row("0011", status="in-flight", sprint="")]
        slate = [row("0001")]
        assert sm.next_up(["0001"], slate, by_id(*slate, *inflight), wip_cap=2) is None
        assert sm.next_up(["0001"], slate, by_id(*slate, *inflight), wip_cap=3) == "0001"

    def test_no_cap_ignores_in_flight(self):
        inflight = [row("0010", status="in-flight", sprint="")]
        slate = [row("0001")]
        assert sm.next_up(["0001"], slate, by_id(*slate, *inflight), wip_cap=None) == "0001"

    def test_nothing_ready_is_none_not_empty_string(self):
        slate = [row("0001", dor="unknown")]
        assert sm.next_up(["0001"], slate, by_id(*slate)) is None


# --- ready rule -------------------------------------------------------------------------------

class TestReadyGaps:
    def test_all_green_no_gaps(self):
        slate = [row("0001"), row("0002", data="n-a")]
        assert sm.ready_gaps(slate, by_id(*slate)) == []

    def test_empty_slate_is_a_gap(self):
        gaps = sm.ready_gaps([])
        assert len(gaps) == 1 and "empty" in gaps[0]["gaps"][0]

    def test_dor_not_ready_with_blocking_detail(self):
        slate = [row("0001", dor="NOT READY", dor_blocking=["Missing section `## Scope`"])]
        gaps = sm.ready_gaps(slate, by_id(*slate))
        assert gaps[0]["spec"] == "0001"
        assert gaps[0]["gaps"] == ["DoR: NOT READY (Missing section `## Scope`)"]

    def test_dor_unknown(self):
        slate = [row("0001", dor="unknown")]
        assert sm.ready_gaps(slate)[0]["gaps"] == ["DoR: unknown"]

    @pytest.mark.parametrize("status", ["draft", ""])
    def test_status_short_of_ready(self, status):
        slate = [row("0001", status=status)]
        gaps = sm.ready_gaps(slate)[0]["gaps"]
        assert gaps == [f"status is {status or 'unknown'}, not ready"]

    @pytest.mark.parametrize("status", ["ready", "in-flight", "merged"])
    def test_status_at_or_past_ready_is_not_a_gap(self, status):
        """A spec that already merged is past the bar, not short of it (closed sprints, early merges)."""
        slate = [row("0001", status=status)]
        assert sm.ready_gaps(slate, by_id(*slate)) == []

    @pytest.mark.parametrize("eng", ["pending", "returned", "n-a", "", None])
    def test_eng_must_be_accepted(self, eng):
        slate = [row("0001", eng=eng)]
        gaps = sm.ready_gaps(slate)[0]["gaps"]
        assert len(gaps) == 1 and gaps[0].startswith("eng_review is") and "needs accepted" in gaps[0]

    @pytest.mark.parametrize("data", ["pending", "returned", "", None])
    def test_data_must_be_accepted_or_na(self, data):
        slate = [row("0001", data=data)]
        gaps = sm.ready_gaps(slate)[0]["gaps"]
        assert len(gaps) == 1 and gaps[0].startswith("data_review is") and "accepted or n-a" in gaps[0]

    def test_data_na_is_fine(self):
        assert sm.ready_gaps([row("0001", data="n-a")]) == []

    def test_every_gap_listed_together(self):
        slate = [row("0001", dor="NOT READY", status="draft", eng="pending", data="pending")]
        gaps = sm.ready_gaps(slate)[0]["gaps"]
        assert len(gaps) == 4

    def test_dependency_gaps_included(self):
        outside = row("0009", status="ready", sprint="")
        slate = [row("0001", depends_on="0009")]
        gaps = sm.ready_gaps(slate, by_id(*slate, outside))
        assert gaps == [{"spec": "0001", "gaps": ["depends on 0009 (status ready), which is outside the slate and not merged"]}]

    def test_cycle_is_a_gap_on_each_member(self):
        slate = [row("0001", depends_on="0002"), row("0002", depends_on="0001")]
        gaps = sm.ready_gaps(slate, by_id(*slate))
        assert [g["spec"] for g in gaps] == ["0001", "0002"]
        assert all("dependency cycle" in g["gaps"][0] for g in gaps)

    def test_only_specs_with_gaps_listed_in_id_order(self):
        slate = [row("0003", eng="pending"), row("0001"), row("0002", status="draft")]
        gaps = sm.ready_gaps(slate)
        assert [g["spec"] for g in gaps] == ["0002", "0003"]


# --- outcomes -----------------------------------------------------------------------------------

class TestOutcomes:
    def test_kept_vs_open(self):
        slate = [row("0003", status="merged"), row("0001", status="in-flight"), row("0002", status="merged"),
                 row("0004", status="ready")]
        assert sm.outcomes(slate) == {"kept": ["0002", "0003"], "open": ["0001", "0004"]}

    def test_empty(self):
        assert sm.outcomes([]) == {"kept": [], "open": []}

    def test_no_per_person_key(self):
        out = sm.outcomes([row("0001", status="merged", next_owner="Priya")])
        assert set(out) == {"kept", "open"}


# --- set_frontmatter ----------------------------------------------------------------------------

class TestSetFrontmatter:
    def test_insert_after_status(self):
        out = sm.set_frontmatter(SPEC_WITH_STATUS, "sprint", "S07")
        lines = out.split("\n")
        i = next(i for i, l in enumerate(lines) if l.startswith("status:"))
        assert lines[i + 1] == 'sprint: "S07"'
        assert lines[i + 2] == "type: feature"

    def test_insert_after_opening_dashes_when_no_status(self):
        out = sm.set_frontmatter(SPEC_NO_STATUS, "depends_on", "0001,0002")
        assert out.split("\n")[1] == 'depends_on: "0001,0002"'
        assert out.split("\n")[0] == "---"

    def test_replace_existing_line(self):
        once = sm.set_frontmatter(SPEC_WITH_STATUS, "sprint", "S07")
        twice = sm.set_frontmatter(once, "sprint", "S08")
        assert twice.count("sprint:") == 1
        assert 'sprint: "S08"' in twice
        assert "S07" not in twice

    def test_replace_preserves_trailing_comment(self):
        text = '---\nspec: "0001"\nsprint: ""   # SNN or blank\nstatus: draft\n---\nbody\n'
        out = sm.set_frontmatter(text, "sprint", "S07")
        assert 'sprint: "S07"  # SNN or blank' in out
        assert out.count("sprint:") == 1

    def test_clear_to_empty(self):
        once = sm.set_frontmatter(SPEC_WITH_STATUS, "next_owner", "Priya")
        cleared = sm.set_frontmatter(once, "next_owner", "")
        assert 'next_owner: ""' in cleared
        assert "Priya" not in cleared

    def test_body_bytes_identical(self):
        for text in (SPEC_WITH_STATUS, SPEC_NO_STATUS):
            out = sm.set_frontmatter(text, "sprint", "S07")
            assert body_of(out) == body_of(text)
            out2 = sm.set_frontmatter(out, "sprint", "S08")
            assert body_of(out2) == body_of(text)

    def test_other_frontmatter_lines_untouched(self):
        out = sm.set_frontmatter(SPEC_WITH_STATUS, "eng_review", "accepted")
        fm_before, _ = check_spec.parse_frontmatter(SPEC_WITH_STATUS)
        fm_after, _ = check_spec.parse_frontmatter(out)
        assert fm_after.pop("eng_review") == "accepted"
        assert fm_after == fm_before

    def test_roundtrips_through_parse_frontmatter(self):
        out = SPEC_WITH_STATUS
        for key, val in (("sprint", "S07"), ("next_owner", "Priya"), ("eng_review", "accepted"),
                         ("data_review", "n-a"), ("depends_on", "0001,0002")):
            out = sm.set_frontmatter(out, key, val)
        fm, _ = check_spec.parse_frontmatter(out)
        assert fm["sprint"] == "S07"
        assert fm["next_owner"] == "Priya"
        assert fm["eng_review"] == "accepted"
        assert fm["data_review"] == "n-a"
        assert sm.parse_depends_on(fm["depends_on"]) == ["0001", "0002"]
        assert fm["status"] == "ready"

    def test_dor_verdict_unchanged_by_key_insertion(self):
        before = [f for f in check_spec.check_spec_text(SPEC_WITH_STATUS) if not f["passed"] and f["severity"] == "MUST"]
        out = SPEC_WITH_STATUS
        for key in sm.SPEC_KEYS:
            out = sm.set_frontmatter(out, key, "")
        after = [f for f in check_spec.check_spec_text(out) if not f["passed"] and f["severity"] == "MUST"]
        assert [f["message"] for f in after] == [f["message"] for f in before]

    @pytest.mark.parametrize("bad", ["S07 # note", 'say "hi"', "it's", "a\nb", "a\rb", "TBD", "NNNN", "TODO", "FIXME"])
    def test_refuses_dangerous_values(self, bad):
        with pytest.raises(ValueError):
            sm.set_frontmatter(SPEC_WITH_STATUS, "sprint", bad)

    def test_refuses_status_and_unknown_keys(self):
        with pytest.raises(ValueError):
            sm.set_frontmatter(SPEC_WITH_STATUS, "status", "merged")
        with pytest.raises(ValueError):
            sm.set_frontmatter(SPEC_WITH_STATUS, "risk", "LOW")

    def test_refuses_text_without_frontmatter(self):
        with pytest.raises(ValueError):
            sm.set_frontmatter("# no frontmatter\n", "sprint", "S07")
        with pytest.raises(ValueError):
            sm.set_frontmatter("---\nspec: 1\nnever closed\n", "sprint", "S07")

    def test_validate_value_strips_and_accepts_plain(self):
        assert sm.validate_frontmatter_value(" S07 ") == "S07"
        assert sm.validate_frontmatter_value(None) == ""


# --- time adapters -------------------------------------------------------------------------------

class TestTimeAdapters:
    def test_ts_to_date_real_isoformat(self):
        ts = datetime(2026, 9, 28, 23, 30, tzinfo=timezone.utc).isoformat()
        assert ts.endswith("+00:00")
        assert sm.ts_to_date(ts) == date(2026, 9, 28)

    def test_ts_to_date_z_suffix(self):
        assert sm.ts_to_date("2026-09-28T23:30:00Z") == date(2026, 9, 28)

    def test_ts_to_date_converts_offset_to_utc(self):
        # 01:30 at +05:00 is 20:30 UTC the day before
        assert sm.ts_to_date("2026-09-29T01:30:00+05:00") == date(2026, 9, 28)

    def test_ts_to_date_bare_date_and_objects(self):
        assert sm.ts_to_date("2026-09-30") == date(2026, 9, 30)
        assert sm.ts_to_date(date(2026, 9, 30)) == date(2026, 9, 30)
        assert sm.ts_to_date(datetime(2026, 9, 30, 12)) == date(2026, 9, 30)

    def test_ts_to_date_garbage_is_none(self):
        assert sm.ts_to_date("") is None
        assert sm.ts_to_date(None) is None
        assert sm.ts_to_date("yesterday") is None

    def test_business_days_since(self):
        # Fri 2026-09-25 -> Wed 2026-09-30: Mon, Tue, Wed = 3 business days
        assert sm.business_days_since("2026-09-25T10:00:00+00:00", date(2026, 9, 30)) == 3
        assert sm.business_days_since("2026-09-30T10:00:00+00:00", date(2026, 9, 30)) == 0

    def test_business_days_since_no_data_is_none_not_zero(self):
        assert sm.business_days_since(None, date(2026, 9, 30)) is None
        assert sm.business_days_since("", date(2026, 9, 30)) is None
        assert sm.business_days_since("garbage", date(2026, 9, 30)) is None

    def test_default_end_is_the_last_business_day_of_the_window(self):
        # Mon 2026-09-28, start counted as day 1: a 10-business-day window ends Fri 2026-10-09 (D2)
        assert sm.default_end("2026-09-28") == date(2026, 10, 9)
        assert sm.default_end("2026-09-28", 5) == date(2026, 10, 2)   # Mon..Fri of the same week
        assert sm.default_end("2026-09-28", 1) == date(2026, 9, 28)   # a one-day sprint ends the day it starts
        assert sm.default_end("2026-10-02", 2) == date(2026, 10, 5)   # Fri + 1 skips the weekend -> Mon
        assert sm.default_end("nope") is None

    def test_sprint_days(self):
        d = sm.sprint_days("2026-09-28", "2026-10-09", date(2026, 9, 30))
        assert d == {"total": 10, "elapsed": 2, "remaining": 8}
        # on the last day one business day (today) remains — the window is inclusive
        assert sm.sprint_days("2026-09-28", "2026-10-09", date(2026, 10, 9)) == {"total": 10, "elapsed": 9, "remaining": 1}

    def test_sprint_days_clamps(self):
        assert sm.sprint_days("2026-09-28", "2026-10-09", date(2026, 9, 1)) == {"total": 10, "elapsed": 0, "remaining": 10}
        assert sm.sprint_days("2026-09-28", "2026-10-09", date(2026, 12, 1)) == {"total": 10, "elapsed": 10, "remaining": 0}

    def test_sprint_days_no_data_is_none(self):
        assert sm.sprint_days("", "2026-10-09", date(2026, 9, 30)) == {"total": None, "elapsed": None, "remaining": None}
        assert sm.sprint_days("2026-09-28", "YYYY-MM-DD", date(2026, 9, 30)) == {"total": None, "elapsed": None, "remaining": None}
        assert sm.sprint_days("2026-09-28", "2026-10-09", None) == {"total": 10, "elapsed": None, "remaining": None}


# --- ledger-derived slate (closed sprints) ---------------------------------------------------------

class TestSlateIdsFromLedger:
    LEDGER = [
        {"ts": "2026-09-18T09:00:00+00:00", "event": "sprint_new", "sprint": "S07", "by": "Priya"},
        {"ts": "2026-09-18T09:05:00+00:00", "event": "slated", "sprint": "S07", "spec": "0001", "by": "Priya"},
        {"ts": "2026-09-18T09:05:01+00:00", "event": "slated", "sprint": "S07", "spec": "0002", "by": "Priya"},
        {"ts": "2026-09-18T09:05:02+00:00", "event": "slated", "sprint": "S07", "spec": "0005", "by": "Priya"},
        {"ts": "2026-09-19T09:00:00+00:00", "event": "unslated", "sprint": "S07", "spec": "0005", "by": "Priya", "reason": "x"},
        {"ts": "2026-09-19T09:00:00+00:00", "event": "slated", "sprint": "S08", "spec": "0009", "by": "Priya"},
        {"ts": "2026-10-09T16:00:00+00:00", "event": "carried", "sprint": "S07", "spec": "0002", "to_sprint": "S08", "by": "Priya", "reason": "late"},
        {"ts": "2026-10-09T16:00:01+00:00", "event": "dropped", "sprint": "S07", "spec": "0003", "by": "Priya", "reason": "hand-slated, then dropped"},
        {"ts": "2026-10-09T16:05:00+00:00", "event": "closed", "sprint": "S07", "by": "Priya"},
        "not a dict",
    ]

    def test_replays_slated_minus_unslated_plus_carried_and_dropped(self):
        assert sm.slate_ids_from_ledger(self.LEDGER, "S07") == ["0001", "0002", "0003"]

    def test_other_sprint_and_empty(self):
        assert sm.slate_ids_from_ledger(self.LEDGER, "S08") == ["0009"]
        assert sm.slate_ids_from_ledger(self.LEDGER, "S99") == []
        assert sm.slate_ids_from_ledger([], "S07") == []
        assert sm.slate_ids_from_ledger(self.LEDGER, "") == []

    def test_reslate_after_unslate_counts_once(self):
        ledger = self.LEDGER + [{"ts": "2026-09-20T09:00:00+00:00", "event": "slated", "sprint": "S07", "spec": "0005", "by": "Priya"}]
        assert sm.slate_ids_from_ledger(ledger, "S07") == ["0001", "0002", "0003", "0005"]


# --- ledger entries ------------------------------------------------------------------------------

class TestEventEntry:
    # Re-recorded 2026-10-06 (togo-command-center §2.5 row 4): `sprint.py edit` appends `sprint_edited`.
    # EVENTS is append-only — the first ten names, in this order, are pinned forever; a new verb may
    # only add a name at the end, never rename or remove one (ledgers are replayed, not migrated).
    ORIGINAL_TEN = ("slated", "unslated", "handoff", "ack", "verdict", "ready", "closed",
                    "carried", "dropped", "sprint_new")

    def test_vocabulary(self):
        assert sm.EVENTS[:10] == self.ORIGINAL_TEN
        assert sm.EVENTS == (*self.ORIGINAL_TEN, "sprint_edited")

    def test_events_are_unique_and_append_only(self):
        assert len(set(sm.EVENTS)) == len(sm.EVENTS)
        assert sm.EVENTS.index("sprint_edited") == len(sm.EVENTS) - 1

    def test_sprint_edited_entry_shape(self):
        e = sm.event_entry("2026-10-06T10:00:00+00:00", "sprint_edited", sprint="S07", field="goal", by="Priya")
        assert e == {"ts": "2026-10-06T10:00:00+00:00", "event": "sprint_edited", "sprint": "S07",
                     "field": "goal", "by": "Priya"}

    def test_entry_shape_uses_caller_ts(self):
        e = sm.event_entry("2026-09-30T10:00:00+00:00", "slated", sprint="S07", spec="0001", by="Priya")
        assert e == {"ts": "2026-09-30T10:00:00+00:00", "event": "slated", "sprint": "S07", "spec": "0001", "by": "Priya"}

    def test_every_event_accepted(self):
        for ev in sm.EVENTS:
            assert sm.event_entry("t", ev)["event"] == ev

    def test_unknown_event_raises(self):
        with pytest.raises(ValueError, match="unknown sprint event"):
            sm.event_entry("t", "velocity_recorded")

    @pytest.mark.parametrize("field", ["points", "story_points", "velocity", "hours", "estimate", "effort", "loc", "capacity"])
    def test_forbidden_field_refused_with_standard_wording(self, field):
        with pytest.raises(ValueError, match="activity metric the standard never tracks"):
            sm.event_entry("t", "slated", **{field: 5})
