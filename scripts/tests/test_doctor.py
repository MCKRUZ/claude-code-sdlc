"""Tests for doctor.py — the day-1 check that the harness will actually run.

A doctor has two ways to be useless, and both were hit while building this one against a real
repo:

  * **Crying wolf.** The first version reported every token in `workflows/README.md` — the file
    that documents the token convention — and every `# <<DEFAULT_BRANCH>>` provenance comment
    next to an already-filled value. Twenty-odd warnings, one of them real. A check that noisy
    gets muted, which is worse than not having it.
  * **Telling you to break a working setup.** The first version demanded `ANTHROPIC_API_KEY`
    because that is what the kit ships, and failed a repo that had correctly adapted to
    `CLAUDE_CODE_OAUTH_TOKEN`.

So the tests below are mostly about what the doctor must NOT say.
"""

import json
import os

import pytest

import doctor
from doctor import (
    FAIL,
    PASS,
    WARN,
    check_executable_bits,
    check_harness_present,
    check_hooks,
    check_residual_tokens,
    check_secrets,
    required_secrets,
)


def _statuses(results):
    return {r.status for r in results}


def _titles(results):
    return " | ".join(r.title for r in results)


@pytest.fixture
def repo(tmp_path):
    """A minimally-installed harness."""
    (tmp_path / ".claude" / "hooks").mkdir(parents=True)
    (tmp_path / ".github" / "workflows").mkdir(parents=True)
    (tmp_path / "CLAUDE.md").write_text("# rules\n", encoding="utf-8")
    (tmp_path / ".claude" / "harness-manifest.json").write_text(
        json.dumps({"profile_id": "test", "packs": ["cicd/github"], "files": {"CLAUDE.md": "x"}}),
        encoding="utf-8",
    )
    _settings(tmp_path, "stop-gate.ps1", command="pwsh")
    (tmp_path / ".claude" / "hooks" / "stop-gate.ps1").write_text("# hook\n", encoding="utf-8")
    return tmp_path


def _settings(repo, script, command="pwsh"):
    (repo / ".claude" / "settings.json").write_text(json.dumps({
        "hooks": {"Stop": [{"hooks": [{
            "type": "command", "command": command,
            "args": ["-File", f"${{CLAUDE_PROJECT_DIR}}/.claude/hooks/{script}"],
        }]}]}
    }), encoding="utf-8")


# ── harness presence ──────────────────────────────────────────────────────────

class TestHarnessPresent:
    def test_an_uninstalled_repo_fails(self, tmp_path):
        results = check_harness_present(tmp_path)
        assert results[0].status == FAIL
        assert "not installed" in results[0].title

    def test_an_installed_repo_passes(self, repo):
        assert FAIL not in _statuses(check_harness_present(repo))

    def test_a_corrupt_manifest_fails_rather_than_raising(self, repo):
        (repo / ".claude" / "harness-manifest.json").write_text("{not json", encoding="utf-8")
        assert check_harness_present(repo)[0].status == FAIL


# ── hooks: the silent-absence class ───────────────────────────────────────────

class TestHooks:
    def test_a_missing_interpreter_fails(self, repo, monkeypatch):
        """The whole point. A hook registered with no interpreter never runs.

        The repo looks set up, the Stop gate is in settings.json, and an agent can end a turn on
        a red build with nothing objecting. Nothing else in the harness reports this.
        """
        monkeypatch.setattr(doctor.shutil, "which", lambda name: None)
        results = check_hooks(repo)
        assert FAIL in _statuses(results)
        assert "interpreter" in _titles(results)

    def test_a_registered_but_missing_script_fails(self, repo, monkeypatch):
        monkeypatch.setattr(doctor.shutil, "which", lambda name: "/usr/bin/pwsh")
        (repo / ".claude" / "hooks" / "stop-gate.ps1").unlink()
        results = check_hooks(repo)
        assert FAIL in _statuses(results)
        assert "script missing" in _titles(results)

    def test_a_fully_wired_hook_passes(self, repo, monkeypatch):
        monkeypatch.setattr(doctor.shutil, "which", lambda name: "/usr/bin/pwsh")
        assert FAIL not in _statuses(check_hooks(repo))

    def test_no_hooks_registered_fails(self, repo):
        (repo / ".claude" / "settings.json").write_text(json.dumps({"permissions": {}}), encoding="utf-8")
        results = check_hooks(repo)
        assert results[0].status == FAIL
        assert "no hooks registered" in results[0].title


# ── residual tokens: the crying-wolf class ────────────────────────────────────

class TestResidualTokens:
    def test_a_live_unfilled_token_is_reported(self, repo):
        (repo / ".mcp.json").write_text(json.dumps({
            "mcpServers": {"azure-devops": {"command": "npx", "args": ["<<ADO_ORGANIZATION>>"]}}
        }), encoding="utf-8")
        results = check_residual_tokens(repo)
        assert WARN in _statuses(results)
        assert "ADO_ORGANIZATION" in _titles(results)

    def test_the_report_says_who_fills_it(self, repo):
        (repo / ".mcp.json").write_text(json.dumps({
            "mcpServers": {"ado": {"args": ["<<ADO_ORGANIZATION>>"]}}
        }), encoding="utf-8")
        fix = [r.fix for r in check_residual_tokens(repo) if "ADO_ORGANIZATION" in r.title][0]
        assert "Phase 3" in fix, "an unfilled token is unfinished setup — name the phase that finishes it"

    def test_a_provenance_comment_is_not_an_unfilled_token(self, repo):
        """`branches: [ main ]   # <<DEFAULT_BRANCH>>` — the value IS filled.

        Reporting these buried the one real finding under twenty false ones.
        """
        (repo / ".github" / "workflows" / "ci.yml").write_text(
            "on:\n  push:\n    branches: [ main ]   # <<DEFAULT_BRANCH>>\n", encoding="utf-8")
        assert check_residual_tokens(repo)[0].status == PASS

    def test_readmes_documenting_the_convention_are_skipped(self, repo):
        (repo / ".github" / "workflows" / "README.md").write_text(
            "Fill <<DEPLOY_STEP>>, <<HEALTH_CHECK>> and <<GATED_PATHS>> in Phase 3.\n",
            encoding="utf-8")
        assert check_residual_tokens(repo)[0].status == PASS

    def test_the_json_note_key_is_not_scanned(self, repo):
        """The kit's `"//"` key explains the token; it is not an occurrence of one."""
        (repo / ".mcp.json").write_text(json.dumps({
            "//": "<<ADO_ORGANIZATION>> is a Phase-3 token",
            "mcpServers": {"x": {"command": "npx", "args": ["real-org"]}},
        }), encoding="utf-8")
        assert check_residual_tokens(repo)[0].status == PASS

    def test_a_clean_repo_reports_pass(self, repo):
        assert check_residual_tokens(repo)[0].status == PASS


# ── secrets: the break-a-working-setup class ──────────────────────────────────

class TestRequiredSecrets:
    def _wf(self, repo, name, body):
        (repo / ".github" / "workflows" / name).write_text(body, encoding="utf-8")

    def test_secrets_come_from_the_installed_workflows(self, repo):
        self._wf(repo, "grader.yml", "  token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}\n")
        assert required_secrets(repo) == {"CLAUDE_CODE_OAUTH_TOKEN": ["grader.yml"]}

    def test_an_adapted_repo_is_not_told_to_use_the_kit_default(self, repo, monkeypatch):
        """A repo on CLAUDE_CODE_OAUTH_TOKEN must not be failed for lacking ANTHROPIC_API_KEY.

        Both are valid for claude-code-action. The first version of this check failed a working
        repo and told the user to set a secret nothing reads.
        """
        self._wf(repo, "grader.yml", "  token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}\n")
        monkeypatch.setattr(doctor, "_run",
                            lambda *a, **k: (0, json.dumps([{"name": "CLAUDE_CODE_OAUTH_TOKEN"}])))
        results = check_secrets(repo)
        assert FAIL not in _statuses(results)
        assert "ANTHROPIC_API_KEY" not in _titles(results)

    def test_a_genuinely_missing_secret_fails(self, repo, monkeypatch):
        self._wf(repo, "grader.yml", "  key: ${{ secrets.ANTHROPIC_API_KEY }}\n")
        monkeypatch.setattr(doctor, "_run", lambda *a, **k: (0, json.dumps([])))
        results = check_secrets(repo)
        assert FAIL in _statuses(results)
        assert "grader.yml" in results[0].detail, "say which workflow needs it"

    def test_github_token_is_never_required(self, repo):
        """Actions supplies it. Asking a human to set it is a wrong instruction."""
        self._wf(repo, "ci.yml", "  token: ${{ secrets.GITHUB_TOKEN }}\n")
        assert required_secrets(repo) == {}

    def test_a_secret_named_only_in_a_comment_is_not_required(self, repo):
        self._wf(repo, "ci.yml", "# set ${{ secrets.ANTHROPIC_API_KEY }} before go-live\njobs: {}\n")
        assert required_secrets(repo) == {}

    def test_unreachable_gh_warns_rather_than_fails(self, repo, monkeypatch):
        """Offline is not a broken harness. Only report what was actually determined."""
        self._wf(repo, "grader.yml", "  key: ${{ secrets.ANTHROPIC_API_KEY }}\n")
        monkeypatch.setattr(doctor, "_run", lambda *a, **k: (1, "not logged in"))
        assert check_secrets(repo)[0].status == WARN


# ── permissions ───────────────────────────────────────────────────────────────

class TestExecutableBits:
    @pytest.mark.skipif(os.name == "nt", reason="POSIX permission bits are not meaningful on Windows")
    def test_a_non_executable_hook_fails(self, repo):
        sh = repo / ".claude" / "hooks" / "stop-gate.sh"
        sh.write_text("#!/bin/sh\n", encoding="utf-8")
        sh.chmod(0o644)
        results = check_executable_bits(repo)
        assert results[0].status == FAIL
        assert "chmod +x" in results[0].fix

    @pytest.mark.skipif(os.name == "nt", reason="POSIX permission bits are not meaningful on Windows")
    def test_executable_hooks_pass(self, repo):
        sh = repo / ".claude" / "hooks" / "stop-gate.sh"
        sh.write_text("#!/bin/sh\n", encoding="utf-8")
        sh.chmod(0o755)
        assert check_executable_bits(repo)[0].status == PASS

    @pytest.mark.skipif(os.name != "nt", reason="describes the Windows path")
    def test_windows_warns_rather_than_claiming_a_pass(self, repo):
        """Windows cannot see the bit — saying PASS would assert something unverified."""
        assert check_executable_bits(repo)[0].status == WARN


# ── the run ───────────────────────────────────────────────────────────────────

class TestRun:
    def test_offline_skips_the_gh_checks(self, repo, capsys):
        doctor.run(repo, offline=True)
        assert "SKIP" in capsys.readouterr().out

    def test_a_broken_repo_exits_nonzero(self, tmp_path):
        assert doctor.run(tmp_path, offline=True) == 1

    def test_warnings_alone_do_not_fail_the_run(self, repo, monkeypatch):
        """WARN marks what could not be determined. Failing on it would train people to ignore it."""
        monkeypatch.setattr(doctor, "SECTIONS", [("Synthetic", lambda r: [
            doctor.Result(WARN, "undetermined", "")], False)])
        assert doctor.run(repo, offline=True) == 0
