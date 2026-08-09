"""Behavior tests for the review-gate hook (Fold C) — the SHIPPED payload scripts, not a model.

The gate's one job: `git push` / `gh pr create` / `az repos pr create` refuse until per-commit
review receipts exist. Fold C added the az trigger; these tests pin all three triggers plus the
non-trigger cases (a PR command *mentioned* is not a PR command *invoked*), against the real
harness/hooks/review-gate.sh executed the way Claude Code executes it: PreToolUse JSON on stdin.

The pwsh twin runs the same table where pwsh exists (Windows CI); skipped elsewhere — the .sh
and .ps1 forms ship together and must agree, so the table is shared.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SH_HOOK = _REPO_ROOT / "harness" / "hooks" / "review-gate.sh"
PS1_HOOK = _REPO_ROOT / "harness" / "hooks" / "review-gate.ps1"

needs_sh = pytest.mark.skipif(
    shutil.which("bash") is None or shutil.which("jq") is None,
    reason="review-gate.sh needs bash + jq (the hook itself fails open without jq)")
needs_pwsh = pytest.mark.skipif(
    shutil.which("pwsh") is None, reason="review-gate.ps1 needs pwsh")


@pytest.fixture
def gated_repo(tmp_path):
    """A repo where the gate SHOULD fire: a spec branch whose diff vs main touches src/,
    committed clean, with no review receipts."""
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=tmp_path, check=True)
    env = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@t", "PATH": os.environ["PATH"], "HOME": str(tmp_path)}
    (tmp_path / "README.md").write_text("x\n", encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=tmp_path, check=True, env=env)
    subprocess.run(["git", "commit", "-qm", "init"], cwd=tmp_path, check=True, env=env)
    subprocess.run(["git", "checkout", "-qb", "spec/0001-test"], cwd=tmp_path, check=True, env=env)
    src = tmp_path / "src"
    src.mkdir()
    (src / "Thing.cs").write_text("class Thing {}\n", encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=tmp_path, check=True, env=env)
    subprocess.run(["git", "commit", "-qm", "feat: thing"], cwd=tmp_path, check=True, env=env)
    return tmp_path


def _payload(command: str) -> str:
    return json.dumps({"tool_name": "Bash", "tool_input": {"command": command}})


def _hook_env(repo: Path, extra_env: dict | None) -> dict:
    """The hook honors RAILS_* knobs (BASE, SRC_REGEX, KINDS, SKIP) — a developer who
    experimented with them in their shell would otherwise flip every deny row to allow.
    GIT_DIR/GIT_WORK_TREE would similarly point the hook's git at the wrong repo."""
    env = {k: v for k, v in os.environ.items()
           if not k.startswith("RAILS_") and k not in ("GIT_DIR", "GIT_WORK_TREE")}
    env["CLAUDE_PROJECT_DIR"] = str(repo)
    env.update(extra_env or {})
    return env


def _run_sh(repo: Path, command: str, extra_env: dict | None = None):
    p = subprocess.run(["bash", str(SH_HOOK)], input=_payload(command), capture_output=True,
                       text=True, env=_hook_env(repo, extra_env), cwd=repo, timeout=30)
    return p.returncode, p.stdout


def _run_ps1(repo: Path, command: str, extra_env: dict | None = None):
    p = subprocess.run(["pwsh", "-NoProfile", "-File", str(PS1_HOOK)], input=_payload(command),
                       capture_output=True, text=True, env=_hook_env(repo, extra_env),
                       cwd=repo, timeout=60)
    return p.returncode, p.stdout


def _is_deny(stdout: str) -> bool:
    if not stdout.strip():
        return False
    decision = json.loads(stdout)
    return decision["hookSpecificOutput"]["permissionDecision"] == "deny"


# The shared trigger table: (command, must_gate). "Must gate" here means DENY, because the
# fixture repo always has unreviewed src/ changes.
TRIGGERS = [
    ("az repos pr create --title 'x' --source-branch spec/0001-test", True),   # Fold C
    ("gh pr create --title x --body y",                               True),   # regression
    ("git push -u origin spec/0001-test",                             True),   # regression
    ("cd sub && az repos pr create -t x",                             True),   # compound segment
    ("AZURE_DEVOPS_EXT_PAT=xyz az repos pr create -t x",              True),   # env-prefixed invocation
    ("FOO=1 BAR=2 git push",                                          True),   # env-prefix, git twin
    ("echo hi\naz repos pr create --title x",                         True),   # multi-line command
    ("echo az repos pr create",                                       False),  # mentioned, not invoked
    ("FOO=1 echo az repos pr create",                                 False),  # env-prefix on a mention
    ("echo 'run gh pr create later'",                                 False),
    ("az repos pr list --status active",                              False),  # a query, not a create
    ("az repos pr create-thing",                                      False),  # suffix word, not the cmd
    ("az pipelines runs list",                                        False),
    ("git status",                                                    False),
]


@needs_sh
class TestShTriggers:
    @pytest.mark.parametrize("command,must_gate", TRIGGERS,
                             ids=[t[0][:40] for t in TRIGGERS])
    def test_trigger_table(self, gated_repo, command, must_gate):
        rc, out = _run_sh(gated_repo, command)
        assert rc == 0, f"a hook must exit 0 either way, got {rc}"
        assert _is_deny(out) == must_gate, \
            f"{command!r}: expected {'DENY' if must_gate else 'allow'}, stdout={out!r}"

    def test_receipts_open_the_gate_for_az(self, gated_repo):
        """The az trigger uses the same receipt evidence as push/gh — receipts for HEAD allow it."""
        sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=gated_repo,
                             capture_output=True, text=True, check=True).stdout.strip()
        receipts = gated_repo / ".claude" / ".review-receipts"
        receipts.mkdir(parents=True)
        for kind in ("code-review", "simplify"):
            (receipts / f"{sha}.{kind}").write_text("reviewed\n", encoding="utf-8")
        rc, out = _run_sh(gated_repo, "az repos pr create --title x")
        assert rc == 0 and not _is_deny(out), f"receipts present but still denied: {out!r}"

    def test_the_deny_reason_tells_the_agent_what_to_run(self, gated_repo):
        _, out = _run_sh(gated_repo, "az repos pr create --title x")
        reason = json.loads(out)["hookSpecificOutput"]["permissionDecisionReason"]
        assert "/code-review" in reason or "code-review" in reason
        assert "save-review-receipt" in reason

    def test_the_documented_bypass_still_works_for_az(self, gated_repo):
        rc, out = _run_sh(gated_repo, "az repos pr create --title x",
                          {"RAILS_SKIP_REVIEW_GATE": "1"})
        assert rc == 0 and not _is_deny(out)


@needs_pwsh
class TestPs1Triggers:
    @pytest.mark.parametrize("command,must_gate", TRIGGERS,
                             ids=[t[0][:40] for t in TRIGGERS])
    def test_trigger_table(self, gated_repo, command, must_gate):
        rc, out = _run_ps1(gated_repo, command)
        assert rc == 0, f"a hook must exit 0 either way, got {rc}"
        assert _is_deny(out) == must_gate, \
            f"{command!r}: expected {'DENY' if must_gate else 'allow'}, stdout={out!r}"

    def test_receipts_open_the_gate_for_az(self, gated_repo):
        sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=gated_repo,
                             capture_output=True, text=True, check=True).stdout.strip()
        receipts = gated_repo / ".claude" / ".review-receipts"
        receipts.mkdir(parents=True)
        for kind in ("code-review", "simplify"):
            (receipts / f"{sha}.{kind}").write_text("reviewed\n", encoding="utf-8")
        rc, out = _run_ps1(gated_repo, "az repos pr create --title x")
        assert rc == 0 and not _is_deny(out), f"receipts present but still denied: {out!r}"
