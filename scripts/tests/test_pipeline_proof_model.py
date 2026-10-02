"""Tests for pipeline_proof_model.py — which delivery rails have actually fired, and which are
only assumed.

Foundation's exit report asks whether each rail was "proven by forced failure". A rail that has
only ever been green has not been tested, it has been assumed — so the classification here is
deliberately hard to get to PROVEN, and it never turns a missing observation into a number:

  PROVEN        a failure was caught: a red run on a pull request that did not simply merge red
  RAN_UNPROVEN  it ran, but nothing it ever did is evidence it can stop anything
  NEVER_FIRED   no run exists
  BROKEN        it ran in a way its own design says it never should
  NO_DATA       GitHub has no record of this rail (a local hook), or the read failed — never
                guessed, never reported as a zero
"""

import pipeline_proof_model as m


def run(rid, conclusion, branch="feat-a", event="pull_request", at="2026-09-26T10:00:00Z", **extra):
    return {
        "databaseId": rid, "conclusion": conclusion, "status": "completed", "event": event,
        "headBranch": branch, "createdAt": at, "url": f"https://x/runs/{rid}", **extra,
    }


def pr(number, branch="feat-a", state="MERGED", merged=True, decision="APPROVED"):
    return {
        "number": number, "headRefName": branch, "state": state, "url": f"https://x/pull/{number}",
        "mergedAt": "2026-09-27T10:00:00Z" if merged else None, "reviewDecision": decision,
    }


class TestRailKind:
    def test_the_grader_is_advisory_because_it_is_built_to_never_go_red(self):
        assert m.rail_kind("grader.yml") == "advisory"

    def test_deploys_are_judged_by_rollback_not_by_going_red(self):
        assert m.rail_kind("deploy-dev.yml") == "deploy"
        assert m.rail_kind("deploy-promote.yml") == "deploy"

    def test_everything_else_blocks(self):
        for f in ("ci.yml", "correctness.yml", "security.yml", "gates.yml"):
            assert m.rail_kind(f) == "blocking"


class TestBlockingRail:
    def test_no_runs_at_all_is_never_fired(self):
        c = m.classify_rail("blocking", [], [])
        assert c["status"] == m.NEVER_FIRED

    def test_only_green_runs_is_ran_unproven_not_proven(self):
        c = m.classify_rail("blocking", [run(1, "success"), run(2, "success")], [pr(1)])
        assert c["status"] == m.RAN_UNPROVEN

    def test_a_red_run_that_was_later_fixed_on_the_same_pull_request_is_proven(self):
        runs = [run(1, "failure", at="2026-09-26T10:00:00Z"), run(2, "success", at="2026-09-26T11:00:00Z")]
        c = m.classify_rail("blocking", runs, [pr(7, branch="feat-a")])
        assert c["status"] == m.PROVEN
        assert {"label": "PR #7", "url": "https://x/pull/7"} in c["evidence"]
        assert any(e["url"] == "https://x/runs/1" for e in c["evidence"])

    def test_a_red_run_on_a_pull_request_that_was_closed_unmerged_is_proven(self):
        # The planted-defect pattern: open it, watch the gate go red, close it unmerged.
        c = m.classify_rail("blocking", [run(1, "failure")], [pr(9, state="CLOSED", merged=False)])
        assert c["status"] == m.PROVEN

    def test_a_pull_request_that_merged_while_still_red_is_not_a_catch(self):
        c = m.classify_rail("blocking", [run(1, "failure")], [pr(3, state="MERGED", merged=True)])
        assert c["status"] == m.RAN_UNPROVEN
        assert c["merged_red"] == [{"label": "PR #3", "url": "https://x/pull/3"}]
        assert "merged" in c["reason"].lower()

    def test_a_red_run_still_open_with_no_fix_is_not_yet_a_catch(self):
        c = m.classify_rail("blocking", [run(1, "failure")], [pr(4, state="OPEN", merged=False)])
        assert c["status"] == m.RAN_UNPROVEN

    def test_a_red_run_on_a_push_to_main_is_not_a_pull_request_catch(self):
        c = m.classify_rail("blocking", [run(1, "failure", event="push", branch="main")], [])
        assert c["status"] == m.RAN_UNPROVEN

    def test_a_red_run_with_no_matching_pull_request_is_not_claimed_as_a_catch(self):
        c = m.classify_rail("blocking", [run(1, "failure", branch="orphan")], [pr(1, branch="other")])
        assert c["status"] == m.RAN_UNPROVEN

    def test_a_later_green_on_a_different_branch_does_not_count_as_the_fix(self):
        runs = [run(1, "failure", branch="a"), run(2, "success", branch="b", at="2026-09-26T12:00:00Z")]
        c = m.classify_rail("blocking", runs, [pr(1, branch="a", state="OPEN", merged=False)])
        assert c["status"] == m.RAN_UNPROVEN

    def test_counts_are_reported_so_a_reader_can_see_how_much_history_there_was(self):
        c = m.classify_rail("blocking", [run(1, "success"), run(2, "failure"), run(3, "success")], [])
        assert (c["runs"], c["red"]) == (3, 1)


class TestAdvisoryRail:
    def test_the_grader_going_red_is_broken_because_it_is_designed_to_always_conclude_success(self):
        c = m.classify_rail("advisory", [run(1, "success"), run(2, "failure")], [pr(1)])
        assert c["status"] == m.BROKEN
        assert "never" in c["reason"].lower() or "always" in c["reason"].lower()
        assert c["evidence"][0]["url"] == "https://x/runs/2"

    def test_a_posted_verdict_with_a_not_covered_check_is_proven(self):
        verdicts = {5: [{"check": "AC-1", "covered": True}, {"check": "AC-2", "covered": False}]}
        c = m.classify_rail("advisory", [run(1, "success")], [pr(5)], grader_verdicts=verdicts)
        assert c["status"] == m.PROVEN
        assert {"label": "PR #5", "url": "https://x/pull/5"} in c["evidence"]

    def test_verdicts_that_all_cover_are_ran_unproven(self):
        verdicts = {5: [{"check": "AC-1", "covered": True}]}
        c = m.classify_rail("advisory", [run(1, "success")], [pr(5)], grader_verdicts=verdicts)
        assert c["status"] == m.RAN_UNPROVEN

    def test_no_verdict_could_be_read_is_ran_unproven_and_says_the_comments_were_not_checked(self):
        c = m.classify_rail("advisory", [run(1, "success")], [pr(5)], grader_verdicts=None)
        assert c["status"] == m.RAN_UNPROVEN

    def test_no_runs_is_never_fired(self):
        assert m.classify_rail("advisory", [], [])["status"] == m.NEVER_FIRED


class TestDeployRail:
    def test_no_runs_is_never_fired(self):
        assert m.classify_rail("deploy", [], [])["status"] == m.NEVER_FIRED

    def test_only_successful_deploys_is_ran_unproven(self):
        c = m.classify_rail("deploy", [run(1, "success", event="push")], [])
        assert c["status"] == m.RAN_UNPROVEN
        assert "rollback" in c["reason"].lower()

    def test_a_failed_deploy_whose_rollback_ran_is_proven(self):
        c = m.classify_rail("deploy", [run(1, "failure", event="push")], [], rollbacks={1: True})
        assert c["status"] == m.PROVEN
        assert c["evidence"][0]["url"] == "https://x/runs/1"

    def test_a_failed_deploy_with_no_rollback_is_not_proof_of_rollback(self):
        c = m.classify_rail("deploy", [run(1, "failure", event="push")], [], rollbacks={1: False})
        assert c["status"] == m.RAN_UNPROVEN


class TestNoData:
    def test_a_local_hook_is_no_data_with_the_reason_stated(self):
        c = m.no_data("Stop gate", "a local hook; GitHub keeps no record of it")
        assert c["status"] == m.NO_DATA and "local hook" in c["reason"]

    def test_no_data_is_not_a_number(self):
        c = m.no_data("x", "why")
        assert c["runs"] is None and c["red"] is None


RULESET_LIVE = {
    "name": "main-branch-protection", "enforcement": "active", "created_at": "2026-09-25T12:00:00Z",
    "bypass_actors": [{"actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always"}],
    "rules": [
        {"type": "pull_request", "parameters": {"required_approving_review_count": 1}},
        {"type": "required_status_checks", "parameters": {"required_status_checks": [
            {"context": "build-and-test"}, {"context": "grader"}]}},
    ],
}
RULESET_INSTALLED = {
    "rules": [{"type": "required_status_checks", "parameters": {"required_status_checks": [
        {"context": "build-and-test"}, {"context": "grader"}, {"context": "security-review"}]}}],
}


class TestRuleset:
    def test_reads_required_contexts_from_either_shape(self):
        assert m.required_contexts(RULESET_LIVE) == ["build-and-test", "grader"]
        assert m.required_contexts({"rules": []}) == []

    def test_a_check_the_project_expects_but_the_live_ruleset_lacks_is_reported(self):
        r = m.compare_ruleset(RULESET_LIVE, RULESET_INSTALLED)
        assert r["missing_in_live"] == ["security-review"]
        assert r["extra_in_live"] == []
        assert r["enforcement"] == "active"

    def test_bypass_actors_are_surfaced_not_hidden(self):
        assert m.compare_ruleset(RULESET_LIVE, RULESET_INSTALLED)["bypass_actors"] == [
            "RepositoryRole 5 (always)"]

    def test_an_inactive_ruleset_is_flagged_as_not_enforcing(self):
        r = m.compare_ruleset({**RULESET_LIVE, "enforcement": "evaluate"}, RULESET_INSTALLED)
        assert r["enforcing"] is False
        assert m.compare_ruleset(RULESET_LIVE, RULESET_INSTALLED)["enforcing"] is True

    def test_no_live_ruleset_is_a_finding_in_itself_not_a_crash(self):
        r = m.compare_ruleset(None, RULESET_INSTALLED)
        assert r["enforcing"] is False and r["live"] is False
        assert r["missing_in_live"] == ["build-and-test", "grader", "security-review"]

    def test_with_no_installed_file_there_is_nothing_to_compare_against_and_it_says_so(self):
        r = m.compare_ruleset(RULESET_LIVE, None)
        assert r["missing_in_live"] is None and r["extra_in_live"] is None


class TestMergeHistory:
    def test_merges_before_enforcement_are_marked_pre_enforcement_not_counted_against_the_rails(self):
        prs = [
            {**pr(1), "mergedAt": "2026-09-20T00:00:00Z"},
            {**pr(2), "mergedAt": "2026-09-26T00:00:00Z"},
        ]
        h = m.merge_history(prs, "2026-09-25T12:00:00Z")
        assert h["pre_enforcement"] == 1 and h["post_enforcement"] == 1

    def test_a_post_enforcement_merge_without_approval_is_listed_by_url(self):
        prs = [
            {**pr(2, decision="APPROVED"), "mergedAt": "2026-09-26T00:00:00Z"},
            {**pr(3, decision=""), "mergedAt": "2026-09-27T00:00:00Z"},
        ]
        h = m.merge_history(prs, "2026-09-25T12:00:00Z")
        assert h["unapproved_post_enforcement"] == [{"label": "PR #3", "url": "https://x/pull/3"}]

    def test_unmerged_pull_requests_are_ignored(self):
        h = m.merge_history([pr(4, state="OPEN", merged=False)], "2026-09-25T12:00:00Z")
        assert h["pre_enforcement"] == 0 and h["post_enforcement"] == 0

    def test_with_no_enforcement_date_nothing_is_split_and_it_is_said(self):
        h = m.merge_history([pr(1)], None)
        assert h["enforced_since"] is None and h["pre_enforcement"] is None
        assert h["total_merged"] == 1


class TestProofsNeeded:
    def test_every_rail_not_yet_proven_gets_a_named_forced_failure_and_the_file_it_would_touch(self):
        rails = [
            {"rail": "ci", "kind": "blocking", "status": m.PROVEN},
            {"rail": "correctness", "kind": "blocking", "status": m.RAN_UNPROVEN},
            {"rail": "grader", "kind": "advisory", "status": m.NEVER_FIRED},
            {"rail": "Stop gate", "kind": "local", "status": m.NO_DATA},
        ]
        needed = m.proofs_needed(rails)
        assert [n["rail"] for n in needed] == ["correctness", "grader", "Stop gate"]
        assert all(n["proof"] and n["touches"] for n in needed)

    def test_nothing_needed_when_everything_is_proven(self):
        assert m.proofs_needed([{"rail": "ci", "kind": "blocking", "status": m.PROVEN}]) == []
