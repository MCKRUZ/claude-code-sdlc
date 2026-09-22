"""Live-git integration tests for handoff.py — no mocking.

A real bare repo stands in for the code host's git remote (`gh` itself is not exercised
here, since a bare repo isn't a GitHub repo — that failure path IS what's asserted below,
and it's the real, literal failure `gh` raises against a non-GitHub remote, not a stand-in
for one). This proves the worktree-based branch/commit/push mechanics against real `git`,
so a regression in the actual plumbing can't hide behind a mock that drifted from what
`git` really does.
"""

import subprocess

import pytest
import yaml

import handoff as h
from check_spec import parse_frontmatter

SPEC_TEXT = """---
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

ROSTER = yaml.dump({
    "teams": [{"name": "claims", "lead": "@priya-n"}],
    "people": [
        {"handle": "@priya-n", "name": "Priya", "team": "claims", "roles": ["owner", "lead"]},
        {"handle": "@sam-k", "name": "Sam", "team": "claims", "roles": ["developer"]},
    ],
})


def _git(args, cwd):
    result = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    return result.stdout


@pytest.fixture
def repo(tmp_path):
    """A real bare 'origin' plus a real clone-shaped working repo pointed at it."""
    origin = tmp_path / "origin.git"
    work = tmp_path / "work"
    origin.mkdir()
    work.mkdir()
    _git(["init", "--bare", "-q", "-b", "main"], cwd=origin)
    _git(["init", "-q", "-b", "main"], cwd=work)
    _git(["config", "user.email", "test@example.com"], cwd=work)
    _git(["config", "user.name", "Test"], cwd=work)
    _git(["remote", "add", "origin", str(origin)], cwd=work)

    (work / "specs").mkdir()
    (work / ".sdlc").mkdir()
    (work / "specs" / "0007-reject-duplicate-claims.md").write_text(SPEC_TEXT, encoding="utf-8")
    (work / ".sdlc" / "team.yaml").write_text(ROSTER, encoding="utf-8")
    _git(["add", "-A"], cwd=work)
    _git(["commit", "-q", "-m", "seed"], cwd=work)
    _git(["push", "-q", "origin", "main"], cwd=work)
    return work


class TestHandoffLive:
    def test_resolve_base_branch_reads_the_real_remote(self, repo):
        assert h.resolve_base_branch(repo) == "main"

    def test_full_handoff_pushes_branch_and_commit(self, repo):
        spec_path = repo / "specs" / "0007-reject-duplicate-claims.md"
        result = h.handoff(repo, spec_path, "@sam-k", None)

        assert result["already_in_flight"] is False
        assert result["branch"] == "spec/0007-reject-duplicate-claims"
        # No real GitHub host behind this bare repo — the assignment step must fail
        # cleanly, and the local half above must have already fully succeeded regardless.
        assert result["assignment_error"] is not None

        origin = repo.parent / "origin.git"
        branches = _git(["branch", "-a"], cwd=origin)
        assert "spec/0007-reject-duplicate-claims" in branches

        pushed_text = _git(
            ["show", "spec/0007-reject-duplicate-claims:specs/0007-reject-duplicate-claims.md"],
            cwd=origin,
        )
        fm, _ = parse_frontmatter(pushed_text)
        assert fm["status"] == "in-flight"
        assert fm["developer"] == "@sam-k"

    def test_callers_own_checkout_is_never_touched(self, repo):
        before_branch = _git(["rev-parse", "--abbrev-ref", "HEAD"], cwd=repo).strip()
        before_status = _git(["status", "--porcelain"], cwd=repo)

        h.handoff(repo, repo / "specs" / "0007-reject-duplicate-claims.md", "@sam-k", None)

        assert _git(["rev-parse", "--abbrev-ref", "HEAD"], cwd=repo).strip() == before_branch
        assert _git(["status", "--porcelain"], cwd=repo) == before_status

    def test_temp_worktree_is_cleaned_up(self, repo):
        h.handoff(repo, repo / "specs" / "0007-reject-duplicate-claims.md", "@sam-k", None)
        worktrees = _git(["worktree", "list"], cwd=repo)
        assert worktrees.strip().count("\n") == 0  # only the main checkout remains

    def test_rerun_is_idempotent_and_reads_the_real_branch(self, repo):
        spec_path = repo / "specs" / "0007-reject-duplicate-claims.md"
        h.handoff(repo, spec_path, "@sam-k", None)

        # The caller's own working copy of the spec still reads status: ready — it was
        # never updated locally, only on the spec's own branch. Idempotency must still work.
        assert "status: ready" in spec_path.read_text(encoding="utf-8")

        second = h.handoff(repo, spec_path, "@sam-k", None)
        assert second == {"already_in_flight": True, "developer": "@sam-k"}
