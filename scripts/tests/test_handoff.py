"""Tests for handoff.py — the one-command spec hand-off (spec 0005).

The git-worktree mechanics (push_handoff_commit, find_existing_handoff, resolve_base_branch)
are proven against a REAL local git repo with a real bare-repo remote in
test_handoff_live.py — no mocking there, so a change to the actual git plumbing can't hide
behind a mock that quietly drifted from real `git` behavior. This file covers the pure
logic and the refusal ordering, with every git/gh call monkeypatched.
"""

from pathlib import Path

import pytest
import yaml

import handoff as h

READY_SPEC = """---
spec: "0007"
name: "reject-duplicate-claims"
status: ready
type: feature
risk: LOW
source: "—"
channel: ""
owner: "@priya-n"
developer: ""
checker: ""
team: "claims"
harness_context: "the existing validation filter"
created: "2026-06-24"
---

# Spec 0007 — reject-duplicate-claims

## Goal
A duplicate claim is rejected with a 409.

## Why
Duplicates corrupt the ledger.

## Scope

### In scope
- `src/Claims/ClaimsController.cs`

### Out of scope
- The payout pipeline.

## Acceptance Checks
- [ ] A duplicate submission returns 409 with body `{ "error": "duplicate claim" }`

## Risk Tier
**Tier:** LOW
**Why this tier:** additive validation only.

## Delegation Plan
- **Scope (file patterns):** `src/Claims/**`
- **Context (pattern to reuse):** the existing validation filter
- **Permissions:** build/test/lint auto
- **Gated paths touched:** none

## Checking Plan
**Ladder depth:** LOW
**Specifics:** grader plus non-author approval.

## Decision List
- none
"""

NOT_READY_SPEC = READY_SPEC.replace('owner: "@priya-n"', 'owner: ""')

ROSTER = yaml.dump({
    "teams": [{"name": "claims", "lead": "@priya-n"}],
    "people": [
        {"handle": "@priya-n", "name": "Priya", "team": "claims", "roles": ["owner", "lead"]},
        {"handle": "@sam-k", "name": "Sam", "team": "claims", "roles": ["developer"]},
    ],
})


def make_repo(tmp_path, spec_text=READY_SPEC, roster=ROSTER, checker="") -> Path:
    repo = tmp_path / "repo"
    (repo / "specs").mkdir(parents=True)
    (repo / ".sdlc").mkdir()
    text = spec_text.replace('checker: ""', f'checker: "{checker}"') if checker else spec_text
    (repo / "specs" / "0007-reject-duplicate-claims.md").write_text(text, encoding="utf-8")
    if roster is not None:
        (repo / ".sdlc" / "team.yaml").write_text(roster, encoding="utf-8")
    return repo


class TestBranchNameFor:
    def test_matches_the_playbook_example(self):
        assert h.branch_name_for("0007", "reject-duplicate-claims") == "spec/0007-reject-duplicate-claims"


class TestSetStatusAndDeveloper:
    def test_sets_both_fields(self):
        out = h.set_status_and_developer(READY_SPEC, "@sam-k")
        fm, _ = __import__("check_spec").parse_frontmatter(out)
        assert fm["status"] == "in-flight"
        assert fm["developer"] == "@sam-k"

    def test_only_touches_frontmatter_not_body(self):
        text = READY_SPEC + "\nThe developer: field appears nowhere else, but status: is a common word.\n"
        out = h.set_status_and_developer(text, "@sam-k")
        assert "The developer: field appears nowhere else, but status: is a common word." in out

    def test_no_frontmatter_raises(self):
        with pytest.raises(h.HandoffError, match="no frontmatter"):
            h.set_status_and_developer("# just a heading\n", "@sam-k")


class TestHandoffRefusals:
    """Every refusal must leave the repo untouched — asserted by never monkeypatching
    push_handoff_commit/assign_on_host as anything other than a call that would fail
    loudly if reached."""

    def _forbid_mutation(self, monkeypatch):
        def boom(*a, **k):
            raise AssertionError("push_handoff_commit must not run on a refusal path")
        monkeypatch.setattr(h, "push_handoff_commit", boom)
        monkeypatch.setattr(h, "find_existing_handoff", lambda *a, **k: None)

    def test_not_ready_is_refused(self, tmp_path, monkeypatch):
        self._forbid_mutation(monkeypatch)
        repo = make_repo(tmp_path, spec_text=NOT_READY_SPEC)
        with pytest.raises(h.HandoffError, match="not ready"):
            h.handoff(repo, repo / "specs" / "0007-reject-duplicate-claims.md", "@sam-k", None)

    def test_unknown_developer_is_refused(self, tmp_path, monkeypatch):
        self._forbid_mutation(monkeypatch)
        repo = make_repo(tmp_path)
        with pytest.raises(h.HandoffError, match="not listed in the roster"):
            h.handoff(repo, repo / "specs" / "0007-reject-duplicate-claims.md", "@ghost", None)

    def test_developer_as_own_checker_is_refused(self, tmp_path, monkeypatch):
        self._forbid_mutation(monkeypatch)
        repo = make_repo(tmp_path, checker="@sam-k")
        with pytest.raises(h.HandoffError, match="cannot check their own build"):
            h.handoff(repo, repo / "specs" / "0007-reject-duplicate-claims.md", "@sam-k", None)

    def test_no_roster_skips_developer_check(self, tmp_path, monkeypatch):
        """Roster is optional (spec 0001's zero-coupling design) — its absence must not
        block a hand-off, only skip the cross-check."""
        self._forbid_mutation(monkeypatch)
        monkeypatch.setattr(h, "resolve_base_branch", lambda repo_root: "main")
        monkeypatch.setattr(h, "push_handoff_commit", lambda *a, **k: None)
        monkeypatch.setattr(h, "assign_on_host", lambda *a, **k: None)
        repo = make_repo(tmp_path, roster=None)
        result = h.handoff(repo, repo / "specs" / "0007-reject-duplicate-claims.md", "@anyone", None)
        assert result["already_in_flight"] is False

    def test_team_at_wip_limit_is_refused(self, tmp_path, monkeypatch):
        self._forbid_mutation(monkeypatch)
        repo = make_repo(tmp_path)
        monkeypatch.setattr(h.cp, "load_limits", lambda repo_root: (
            {"claims": {"wip_limit": 1, "review_alarm_hours": 24, "review_alarm_hours_default": True,
                        "security_alarm_hours": 48, "security_alarm_hours_default": True}}, [],
        ))
        monkeypatch.setattr(h.ts, "scan_specs", lambda specs_dir: [
            {"id": "0006", "name": "other", "status": "in-flight", "risk": "LOW",
             "channel": "unassigned", "owner": "@priya-n", "developer": "@sam-k", "checker": "",
             "team": "claims", "deferred_reason": "", "path": "specs/0006-other.md"},
        ])
        with pytest.raises(h.HandoffError, match="WIP limit"):
            h.handoff(repo, repo / "specs" / "0007-reject-duplicate-claims.md", "@sam-k", None)

    def test_over_limit_reason_bypasses_the_refusal(self, tmp_path, monkeypatch):
        monkeypatch.setattr(h, "find_existing_handoff", lambda *a, **k: None)
        monkeypatch.setattr(h, "resolve_base_branch", lambda repo_root: "main")
        commits = {}
        monkeypatch.setattr(
            h, "push_handoff_commit",
            lambda repo_root, branch, base, path, text, msg: commits.update(message=msg),
        )
        monkeypatch.setattr(h, "assign_on_host", lambda *a, **k: None)
        repo = make_repo(tmp_path)
        monkeypatch.setattr(h.cp, "load_limits", lambda repo_root: (
            {"claims": {"wip_limit": 1, "review_alarm_hours": 24, "review_alarm_hours_default": True,
                        "security_alarm_hours": 48, "security_alarm_hours_default": True}}, [],
        ))
        monkeypatch.setattr(h.ts, "scan_specs", lambda specs_dir: [
            {"id": "0006", "name": "other", "status": "in-flight", "risk": "LOW",
             "channel": "unassigned", "owner": "@priya-n", "developer": "@sam-k", "checker": "",
             "team": "claims", "deferred_reason": "", "path": "specs/0006-other.md"},
        ])
        result = h.handoff(
            repo, repo / "specs" / "0007-reject-duplicate-claims.md", "@sam-k",
            "staffing gap this sprint",
        )
        assert result["already_in_flight"] is False
        assert "staffing gap this sprint" in commits["message"]

    def test_already_in_flight_short_circuits_before_dor(self, tmp_path, monkeypatch):
        """The remote-branch check must run before the DoR check — an already-handed-off
        spec is a no-op regardless of whether its current text would still pass DoR."""
        monkeypatch.setattr(h, "find_existing_handoff", lambda *a, **k: "@sam-k")
        repo = make_repo(tmp_path, spec_text=NOT_READY_SPEC)  # would fail DoR if reached
        result = h.handoff(repo, repo / "specs" / "0007-reject-duplicate-claims.md", "@sam-k", None)
        assert result == {"already_in_flight": True, "developer": "@sam-k"}


class TestAssignOnHost:
    def test_builds_expected_gh_args(self, monkeypatch):
        captured = {}

        def fake_run_gh(args, cwd):
            captured["args"] = args
            return "https://x/pr/1"

        monkeypatch.setattr(h, "run_gh", fake_run_gh)
        url = h.assign_on_host("repo", "spec/0007-x", "main", "0007", "x", "@sam-k", "@priya-n")
        assert url == "https://x/pr/1"
        assert "--draft" in captured["args"]
        assert "--assignee" in captured["args"] and "sam-k" in captured["args"]
        assert "--reviewer" in captured["args"] and "priya-n" in captured["args"]

    def test_no_checker_omits_reviewer_flag(self, monkeypatch):
        captured = {}

        def fake_run_gh(args, cwd):
            captured["args"] = args
            return "url"

        monkeypatch.setattr(h, "run_gh", fake_run_gh)
        h.assign_on_host("repo", "spec/0007-x", "main", "0007", "x", "@sam-k", "")
        assert "--reviewer" not in captured["args"]


class TestOpenCommand:
    def test_uses_plan_mode_and_names_the_spec(self):
        cmd = h.open_command("repo", "spec/0007-x", "specs/0007-x.md")
        assert cmd[:3] == ["claude", "--permission-mode", "plan"]
        assert "specs/0007-x.md" in cmd[3]


# ---------------------------------------------------------------------------
# Refusals as data (spec 0011's hand-off screen)
# ---------------------------------------------------------------------------

class TestRefusalKind:
    """A graphical caller must BEHAVE differently per refusal — offer a reason box for a WIP
    breach, a person-picker when the developer is the checker. Doing that by pattern-matching
    the refusal's English breaks the first time the wording is improved, so the kind is
    carried as data. The message stays the human-facing truth."""

    def test_defaults_to_other_so_every_existing_raise_still_works(self):
        assert h.HandoffError("something went wrong").kind == "other"

    def test_carries_the_kind_when_given_one(self):
        assert h.HandoffError("at limit", "team_at_limit").kind == "team_at_limit"

    def test_the_message_is_unchanged_by_having_a_kind(self):
        # The kind is additive. Anything that printed this error before must print the same.
        assert str(h.HandoffError("Team 'core' is at its WIP limit", "team_at_limit")) \
            == "Team 'core' is at its WIP limit"

    def test_it_is_still_an_ordinary_exception(self):
        with pytest.raises(h.HandoffError):
            raise h.HandoffError("x", "not_ready")
