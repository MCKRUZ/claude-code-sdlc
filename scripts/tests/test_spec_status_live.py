"""Live-git integration tests for spec_status.py's `status: merged` write path — no mocking.

Same rationale as test_handoff_live.py: a real bare repo proves the actual git plumbing,
so a regression in it can't hide behind a mock that drifted from what `git` really does.
"""

import subprocess

import pytest

import spec_status as ss
from check_spec import parse_frontmatter

SPEC_TEXT = """---
spec: "0007"
name: "reject-duplicate-claims"
status: in-flight
developer: "@sam-k"
---

# Spec 0007 — reject-duplicate-claims
body
"""


def _git(args, cwd):
    result = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    return result.stdout


@pytest.fixture
def repo(tmp_path):
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
    (work / "specs" / "0007-reject-duplicate-claims.md").write_text(SPEC_TEXT, encoding="utf-8")
    _git(["add", "-A"], cwd=work)
    _git(["commit", "-q", "-m", "seed"], cwd=work)
    _git(["push", "-q", "origin", "main"], cwd=work)
    return work


class TestReadCommittedStatus:
    def test_reads_the_remote_committed_value(self, repo):
        status = ss.read_committed_status(repo, "main", "specs/0007-reject-duplicate-claims.md")
        assert status == "in-flight"

    def test_ignores_the_callers_local_uncommitted_edit(self, repo):
        # Editing the local working copy without committing must not change what this reads —
        # it always reads what's actually on origin/main.
        (repo / "specs" / "0007-reject-duplicate-claims.md").write_text(
            SPEC_TEXT.replace("status: in-flight", "status: merged"), encoding="utf-8",
        )
        status = ss.read_committed_status(repo, "main", "specs/0007-reject-duplicate-claims.md")
        assert status == "in-flight"


class TestFinalizeMerge:
    def test_commits_status_merged_onto_the_default_branch(self, repo):
        wrote, error = ss.finalize_merge(repo, "main", "specs/0007-reject-duplicate-claims.md", "0007")
        assert wrote is True
        assert error is None

        origin = repo.parent / "origin.git"
        pushed = _git(["show", "main:specs/0007-reject-duplicate-claims.md"], cwd=origin)
        fm, _ = parse_frontmatter(pushed)
        assert fm["status"] == "merged"
        assert fm["developer"] == "@sam-k"  # untouched

    def test_rerun_is_idempotent(self, repo):
        ss.finalize_merge(repo, "main", "specs/0007-reject-duplicate-claims.md", "0007")
        wrote, error = ss.finalize_merge(repo, "main", "specs/0007-reject-duplicate-claims.md", "0007")
        assert wrote is False
        assert error is None

    def test_callers_own_checkout_is_never_touched(self, repo):
        before = _git(["status", "--porcelain"], cwd=repo)
        ss.finalize_merge(repo, "main", "specs/0007-reject-duplicate-claims.md", "0007")
        assert _git(["status", "--porcelain"], cwd=repo) == before

    def test_temp_worktree_is_cleaned_up(self, repo):
        ss.finalize_merge(repo, "main", "specs/0007-reject-duplicate-claims.md", "0007")
        worktrees = _git(["worktree", "list"], cwd=repo)
        assert worktrees.strip().count("\n") == 0
