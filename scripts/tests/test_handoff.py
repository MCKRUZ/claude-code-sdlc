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


class TestAHandleCannotBecomeAnotherField:
    """The same defect as spec_transition's, in the path that starts the work.

    The handle went into a regex replacement TEMPLATE, and the frontmatter reader is line-based
    and last-key-wins — so a handle spanning two lines rewrites whichever fields the template
    declares above `developer:`. `risk` is one of them. A tier silently downgraded at hand-off
    time is the whole checking ladder shortening with nobody's name against it.

    Reachable without an attacker: handles come from `.sdlc/team.yaml`, which ships inside a
    repository, and the hand-off dialog lists whatever that file contains.
    """

    # A HIGH fixture on purpose: the interesting direction is a DOWNGRADE, and asserting
    # against a spec that was already LOW would prove nothing at all.
    HIGH_SPEC = READY_SPEC.replace("risk: LOW", "risk: HIGH")

    def test_a_handle_with_a_line_break_is_refused(self):
        with pytest.raises(h.HandoffError) as e:
            h.set_status_and_developer(self.HIGH_SPEC, '@sam-k\nrisk: LOW\nchecker: "@sam-k"')
        assert "line break" in str(e.value)

    def test_a_handle_with_a_carriage_return_is_refused(self):
        with pytest.raises(h.HandoffError):
            h.set_status_and_developer(self.HIGH_SPEC, "@sam-k\rrisk: LOW")

    def test_a_backslash_n_typed_as_two_characters_stays_two_characters(self):
        # The original defect needed no real newline: re.sub expands `\` + `n` inside a
        # replacement template.
        assert "risk: HIGH" in self.HIGH_SPEC
        out = h.set_status_and_developer(self.HIGH_SPEC, r"@sam-k\nrisk: LOW")
        fm, _ = h.cs.parse_frontmatter(out)
        assert fm["risk"] == "HIGH"
        assert fm["status"] == "in-flight"

    def test_an_ordinary_handle_is_unaffected(self):
        out = h.set_status_and_developer(READY_SPEC, "@sam-k")
        fm, _ = h.cs.parse_frontmatter(out)
        assert fm["developer"] == "@sam-k" and fm["status"] == "in-flight"


# ---------------------------------------------------------------------------
# Azure DevOps (code-host providers, Wave 4) — additive; everything above is untouched
# ---------------------------------------------------------------------------

import json  # noqa: E402  (appended with the class below; the file above is byte-identical)
import sys  # noqa: E402

import ado_transport  # noqa: E402
import code_host  # noqa: E402
from tests.ado_fixtures import ADO_REMOTE, FakeAz  # noqa: E402

ADO_ROSTER = yaml.dump({
    "teams": [{"name": "claims", "lead": "@priya-n"}],
    "people": [
        {"handle": "@priya-n", "name": "Priya", "team": "claims", "roles": ["owner", "lead"],
         "email": "priya@contoso.example"},
        {"handle": "@sam-k", "name": "Sam", "team": "claims", "roles": ["developer"]},
    ],
})
ADO_PR_URL = "https://dev.azure.com/contoso/Claims/_git/claims-api/pullrequest/77"


class TestOnAzureDevOps:
    """The assignment step on Azure DevOps. ADO has no assignee on a pull request, so the
    developer is named in the description; the checker is a required reviewer by roster EMAIL
    (an `@handle` is a CLIError to az); a checker with no email is an assignment_error with the
    PR still open and `ok: true` — the local half is never failed over the host half. The
    GitHub path is pinned unchanged by TestAssignOnHost above and by test_gh_argv_golden."""

    @pytest.fixture
    def az(self, monkeypatch):
        ado_transport.clear_caches()
        # Both this module's detection and ado_transport's scope read origin through code_host.
        monkeypatch.setattr(code_host, "origin_url", lambda root: ADO_REMOTE)
        fake = FakeAz(answers={"repos pr create": lambda args: 77})  # `--query pullRequestId` → a bare id
        monkeypatch.setattr(ado_transport, "az_json", fake)
        monkeypatch.setattr(h, "find_existing_handoff", lambda *a, **k: None)
        monkeypatch.setattr(h, "resolve_base_branch", lambda repo_root: "main")
        monkeypatch.setattr(h, "push_handoff_commit", lambda *a, **k: None)
        yield fake
        ado_transport.clear_caches()

    def _run(self, tmp_path, roster, checker="@priya-n"):
        repo = make_repo(tmp_path, roster=roster, checker=checker)
        return h.handoff(repo, repo / "specs" / "0007-reject-duplicate-claims.md", "@sam-k", None)

    def test_opens_a_draft_pr_with_the_checker_as_required_reviewer_by_email(self, tmp_path, az):
        result = self._run(tmp_path, ADO_ROSTER)
        assert result["pr_url"] == ADO_PR_URL          # built from pullRequestId, never read from az
        assert result["assignment_error"] is None
        assert len(az.calls) == 1, az.calls              # exactly one az call: the PR create
        args = az.calls[0]
        assert args[:3] == ["repos", "pr", "create"]
        assert args[args.index("--draft") + 1] == "true"
        assert args[args.index("--required-reviewers") + 1] == "priya@contoso.example"
        assert args[args.index("--source-branch") + 1] == "spec/0007-reject-duplicate-claims"
        assert args[args.index("--target-branch") + 1] == "main"
        assert args[args.index("--query") + 1] == "pullRequestId"
        assert "--detect" in args and args[args.index("--detect") + 1] == "false"
        assert "--assignee" not in args and "--reviewer" not in args   # gh vocabulary never leaks

    def test_the_developer_is_named_in_the_description_because_ado_has_no_assignee(self, tmp_path, az):
        self._run(tmp_path, ADO_ROSTER)
        args = az.calls[0]
        description = args[args.index("--description") + 1: args.index("--draft")]
        assert any(line.startswith("Developer: @sam-k") for line in description), description
        assert any("specs/0007-reject-duplicate-claims.md" in line for line in description)

    def test_a_checker_without_an_email_still_gets_a_pr_and_an_assignment_error(self, tmp_path, az):
        result = self._run(tmp_path, ROSTER)  # the GitHub-era roster: no `email` anywhere
        assert result["pr_url"] == ADO_PR_URL
        assert result["assignment_error"] == (
            "checker @priya-n has no email in .sdlc/team.yaml; Azure DevOps needs one to add a reviewer")
        args = az.calls[0]
        assert "--required-reviewers" not in args
        assert any("no email" in line for line in args[args.index("--description") + 1:])

    def test_no_checker_means_no_reviewer_and_no_error(self, tmp_path, az):
        result = self._run(tmp_path, ADO_ROSTER, checker="")
        assert result["assignment_error"] is None and result["pr_url"] == ADO_PR_URL
        assert "--required-reviewers" not in az.calls[0]

    def test_an_az_failure_is_an_assignment_error_not_a_crash(self, tmp_path, monkeypatch, az):
        failing = FakeAz(fail={"pr create": "TF401027: You need the Git 'PullRequestContribute' permission"})
        monkeypatch.setattr(ado_transport, "az_json", failing)
        result = self._run(tmp_path, ADO_ROSTER)
        assert result["pr_url"] is None
        assert "TF401027" in result["assignment_error"]
        assert result["already_in_flight"] is False      # the local half still counts as done

    def test_an_az_call_the_fixture_was_not_told_about_fails_loudly(self, tmp_path, monkeypatch, az):
        # The read-only / exact-argv pin: FakeAz answers only what it was given.
        monkeypatch.setattr(ado_transport, "az_json", FakeAz())
        with pytest.raises(AssertionError, match="unexpected az call"):
            self._run(tmp_path, ADO_ROSTER)

    def test_the_github_path_never_touches_az(self, tmp_path, monkeypatch, az):
        captured = {}

        def fake_run_gh(args, cwd):
            captured["args"] = args
            return "https://gh/pull/7\n"
        monkeypatch.setattr(h, "run_gh", fake_run_gh)
        repo = make_repo(tmp_path, roster=ADO_ROSTER, checker="@priya-n")
        result = h.handoff(repo, repo / "specs" / "0007-reject-duplicate-claims.md", "@sam-k", None,
                           host="github")
        assert result["pr_url"] == "https://gh/pull/7"
        assert az.calls == []
        assert "--draft" in captured["args"]
        assert captured["args"][captured["args"].index("--assignee") + 1] == "sam-k"
        assert captured["args"][captured["args"].index("--reviewer") + 1] == "priya-n"

    def test_host_fn_resolves_the_module_global_at_call_time(self, monkeypatch):
        # Existing tests patch `h.assign_on_host` by name; the dispatch must see that patch.
        monkeypatch.setattr(h, "assign_on_host", lambda *a, **k: "patched")
        assert h._host_fn("assign_on_host", "github")(*range(7)) == "patched"
        assert h._host_fn("assign_on_host", "none")(*range(7)) == "patched"
        import ado_import
        assert h._host_fn("assign_on_host", "azure-devops") is ado_import.create_draft_pr

    def test_reviewer_gap_treats_an_email_as_already_resolvable(self, tmp_path):
        repo = make_repo(tmp_path, roster=ROSTER)
        assert h.reviewer_gap(repo, "priya@contoso.example") is None
        assert h.reviewer_gap(repo, "") is None
        assert "no email" in h.reviewer_gap(repo, "@priya-n")

    def _main(self, monkeypatch, capsys, tmp_path, result, *extra):
        monkeypatch.setattr(code_host, "origin_url", lambda root: ADO_REMOTE)
        monkeypatch.setattr(code_host, "cli_state", lambda host, **k: ("available", "probed by a stub"))
        monkeypatch.setattr(h, "handoff", lambda *a, **k: result)
        monkeypatch.setattr(sys, "argv", ["handoff.py", "--repo", str(tmp_path), "--spec", "x.md",
                                          "--developer", "@sam-k", *extra])
        h.main()
        return capsys.readouterr().out

    def test_json_carries_the_top_level_host_block(self, tmp_path, monkeypatch, capsys):
        result = {"already_in_flight": False, "branch": "spec/0007-x", "developer": "@sam-k",
                  "checker": "@priya-n", "pr_url": ADO_PR_URL, "assignment_error": None,
                  "spec_rel_path": "specs/0007-x.md"}
        out = json.loads(self._main(monkeypatch, capsys, tmp_path, result, "--json", "--host", "azure-devops"))
        assert out["ok"] is True and out["pr_url"] == ADO_PR_URL
        assert out["host"]["name"] == "azure-devops" and out["host"]["source"] == "flag"
        assert out["host"]["cli"] == "az" and out["host"]["cli_state"] == "available"

    def test_text_claims_review_requested_only_when_it_was(self, tmp_path, monkeypatch, capsys):
        result = {"already_in_flight": False, "branch": "spec/0007-x", "developer": "@sam-k",
                  "checker": "@priya-n", "pr_url": ADO_PR_URL,
                  "assignment_error": "checker @priya-n has no email in .sdlc/team.yaml; Azure DevOps needs one to add a reviewer",
                  "spec_rel_path": "specs/0007-x.md"}
        out = self._main(monkeypatch, capsys, tmp_path, result)
        assert f"PR: {ADO_PR_URL}" in out
        assert "review requested" not in out
        assert "Could not assign on the code host: checker @priya-n has no email" in out
        assert "Code host: azure-devops (from remote)" in out


# ---------------------------------------------------------------------------
# Tōgō command center (togo-command-center.md §2.5 row 7): `--check`, the dry run
# ---------------------------------------------------------------------------

import subprocess  # noqa: E402

SCRIPT = Path(__file__).resolve().parent.parent / "handoff.py"


class TestCheckHandoff:
    def _no_remote_branch(self, monkeypatch):
        monkeypatch.setattr(h, "find_existing_handoff", lambda *a, **k: None)
        for name in ("resolve_base_branch", "push_handoff_commit", "assign_on_host"):
            monkeypatch.setattr(h, name, lambda *a, _n=name, **k: (_ for _ in ()).throw(
                AssertionError(f"{_n} must never run under --check")))

    def test_a_ready_spec_reports_what_would_happen_and_touches_nothing(self, tmp_path, monkeypatch):
        self._no_remote_branch(monkeypatch)
        repo = make_repo(tmp_path, checker="@priya-n")
        spec = repo / "specs" / "0007-reject-duplicate-claims.md"
        before = spec.read_text(encoding="utf-8")
        result = h.check_handoff(repo, spec, "@sam-k", None)
        assert result == {"ok": True, "already_in_flight": False, "would": {
            "branch": h.branch_name_for("0007", "reject-duplicate-claims"),
            "developer": "@sam-k", "checker": "@priya-n", "team": "claims", "in_flight_after": None}}
        assert spec.read_text(encoding="utf-8") == before
        assert not list(repo.rglob("handoff-wt"))

    def test_in_flight_after_is_a_count_only_where_a_cap_exists(self, tmp_path, monkeypatch):
        self._no_remote_branch(monkeypatch)
        repo = make_repo(tmp_path)
        monkeypatch.setattr(h.cp, "load_limits", lambda repo_root: (
            {"claims": {"wip_limit": 3, "review_alarm_hours": 24, "review_alarm_hours_default": True,
                        "security_alarm_hours": 48, "security_alarm_hours_default": True}}, []))
        monkeypatch.setattr(h.ts, "scan_specs", lambda specs_dir: [
            {"id": "0006", "name": "other", "status": "in-flight", "risk": "LOW", "channel": "unassigned",
             "owner": "@priya-n", "developer": "@sam-k", "checker": "", "team": "claims",
             "deferred_reason": "", "path": "specs/0006-other.md"}])
        assert h.check_handoff(repo, repo / "specs" / "0007-reject-duplicate-claims.md", "@sam-k", None)[
            "would"]["in_flight_after"] == 2

    @pytest.mark.parametrize("setup, developer, kind", [
        (dict(spec_text=NOT_READY_SPEC), "@sam-k", "not_ready"),
        (dict(), "@ghost", "unknown_developer"),
        (dict(checker="@sam-k"), "@sam-k", "developer_is_checker"),
    ])
    def test_every_refusal_is_identical_live_and_in_check(self, tmp_path, monkeypatch, setup, developer, kind):
        self._no_remote_branch(monkeypatch)
        repo = make_repo(tmp_path, **setup)
        spec = repo / "specs" / "0007-reject-duplicate-claims.md"
        with pytest.raises(h.HandoffError) as live:
            h.handoff(repo, spec, developer, None, host="none")
        with pytest.raises(h.HandoffError) as check:
            h.check_handoff(repo, spec, developer, None)
        assert (live.value.kind, str(live.value)) == (check.value.kind, str(check.value)) == (kind, str(live.value))

    def test_the_wip_refusal_is_identical_live_and_in_check(self, tmp_path, monkeypatch):
        self._no_remote_branch(monkeypatch)
        repo = make_repo(tmp_path)
        monkeypatch.setattr(h.cp, "load_limits", lambda repo_root: (
            {"claims": {"wip_limit": 1, "review_alarm_hours": 24, "review_alarm_hours_default": True,
                        "security_alarm_hours": 48, "security_alarm_hours_default": True}}, []))
        monkeypatch.setattr(h.ts, "scan_specs", lambda specs_dir: [
            {"id": "0006", "name": "other", "status": "in-flight", "risk": "LOW", "channel": "unassigned",
             "owner": "@priya-n", "developer": "@sam-k", "checker": "", "team": "claims",
             "deferred_reason": "", "path": "specs/0006-other.md"}])
        spec = repo / "specs" / "0007-reject-duplicate-claims.md"
        with pytest.raises(h.HandoffError) as live:
            h.handoff(repo, spec, "@sam-k", None, host="none")
        with pytest.raises(h.HandoffError) as check:
            h.check_handoff(repo, spec, "@sam-k", None)
        assert live.value.kind == check.value.kind == "team_at_limit" and str(live.value) == str(check.value)

    def test_already_in_flight_is_reported_not_refused(self, tmp_path, monkeypatch):
        monkeypatch.setattr(h, "find_existing_handoff", lambda *a, **k: "@sam-k")
        repo = make_repo(tmp_path, spec_text=NOT_READY_SPEC)
        assert h.check_handoff(repo, repo / "specs" / "0007-reject-duplicate-claims.md", "@sam-k", None) == {
            "ok": True, "already_in_flight": True, "developer": "@sam-k", "would": None}

    def test_the_live_path_still_returns_exactly_what_it_did(self, tmp_path, monkeypatch):
        """handoff() now runs through check_preconditions; its results must not grow keys."""
        monkeypatch.setattr(h, "find_existing_handoff", lambda *a, **k: None)
        monkeypatch.setattr(h, "resolve_base_branch", lambda repo_root: "main")
        monkeypatch.setattr(h, "push_handoff_commit", lambda *a, **k: None)
        monkeypatch.setattr(h, "assign_on_host", lambda *a, **k: "https://example/pr/1")
        repo = make_repo(tmp_path, checker="@priya-n")
        result = h.handoff(repo, repo / "specs" / "0007-reject-duplicate-claims.md", "@sam-k", None, host="none")
        assert result == {"already_in_flight": False, "branch": "spec/0007-reject-duplicate-claims",
                          "developer": "@sam-k", "checker": "@priya-n", "pr_url": "https://example/pr/1",
                          "assignment_error": None, "spec_rel_path": "specs/0007-reject-duplicate-claims.md"}

    def test_the_cli_check_prints_one_json_document_and_leaves_git_branches_alone(self, tmp_path, monkeypatch):
        """Against a real repository with no remote, `ls-remote` fails — which is a refusal (exit 1),
        reported as JSON, and `git branch --list` is unchanged. Whatever the outcome, --check never
        reaches the mutation."""
        repo = make_repo(tmp_path)
        subprocess.run(["git", "init", "-q", "-b", "main"], cwd=repo, check=True)
        subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
        subprocess.run(["git", "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"],
                       cwd=repo, check=True)
        branches_before = subprocess.run(["git", "branch", "--list"], cwd=repo, capture_output=True, text=True).stdout
        proc = subprocess.run([sys.executable, str(SCRIPT), "--repo", str(repo), "--spec",
                               str(repo / "specs" / "0007-reject-duplicate-claims.md"),
                               "--developer", "@sam-k", "--check", "--json", "--host", "none"],
                              capture_output=True, text=True, encoding="utf-8",
                              env={**__import__("os").environ, "PYTHONIOENCODING": "utf-8"})
        payload = json.loads(proc.stdout)
        assert proc.returncode in (0, 1) and payload["ok"] == (proc.returncode == 0)
        assert "host" in payload
        branches_after = subprocess.run(["git", "branch", "--list"], cwd=repo, capture_output=True, text=True).stdout
        assert branches_after == branches_before
        assert "spec/" not in branches_after
