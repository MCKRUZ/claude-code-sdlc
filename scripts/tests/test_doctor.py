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
    check_branch_protection,
    check_executable_bits,
    check_harness_present,
    check_hooks,
    check_residual_tokens,
    check_secrets,
    check_tools,
    installed_platform,
    required_secrets,
    required_variable_groups,
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


# ── platform awareness: an ADO repo is never told to fix a GitHub it does not have ────────────

def _make_ado(repo):
    """Flip the standard fixture to an Azure DevOps install: manifest names the azure-devops
    CI/CD pack, pipelines live in .azuredevops/pipelines/."""
    (repo / ".claude" / "harness-manifest.json").write_text(json.dumps({
        "profile_id": "ado-test", "packs": ["stacks/dotnet", "cicd/azure-devops"],
        "files": {"CLAUDE.md": "x"},
    }), encoding="utf-8")
    (repo / ".azuredevops" / "pipelines").mkdir(parents=True)
    return repo


class TestInstalledPlatform:
    def test_the_ado_pack_flips_the_platform(self, repo):
        assert installed_platform(_make_ado(repo)) == "azure-devops"

    def test_the_github_pack_is_github(self, repo):
        assert installed_platform(repo) == "github"

    def test_no_manifest_defaults_to_github(self, tmp_path):
        """The pre-pack behavior. A missing manifest must not change what the doctor says."""
        assert installed_platform(tmp_path) == "github"

    def test_a_corrupt_manifest_defaults_to_github_rather_than_raising(self, repo):
        (repo / ".claude" / "harness-manifest.json").write_text("{not json", encoding="utf-8")
        assert installed_platform(repo) == "github"

    def test_a_packless_manifest_defaults_to_github(self, repo):
        (repo / ".claude" / "harness-manifest.json").write_text(
            json.dumps({"profile_id": "core-only", "files": {}}), encoding="utf-8")
        assert installed_platform(repo) == "github"

    def test_a_type_corrupt_packs_value_defaults_to_github_rather_than_raising(self, repo):
        """Valid JSON, wrong type. A diagnostic tool must never be the thing that crashes."""
        (repo / ".claude" / "harness-manifest.json").write_text(
            json.dumps({"profile_id": "x", "packs": 5, "files": {}}), encoding="utf-8")
        assert installed_platform(repo) == "github"


class TestToolsFollowThePlatform:
    def test_an_ado_repo_requires_az_not_gh(self, repo, monkeypatch):
        """Demanding gh on an Azure DevOps repo is telling you to fix a working setup."""
        monkeypatch.setattr(doctor.shutil, "which", lambda name: None)
        titles = _titles(check_tools(_make_ado(repo)))
        assert "az missing" in titles
        assert "gh" not in titles

    def test_a_github_repo_still_requires_gh(self, repo, monkeypatch):
        monkeypatch.setattr(doctor.shutil, "which", lambda name: None)
        titles = _titles(check_tools(repo))
        assert "gh missing" in titles
        assert "az missing" not in titles  # no az row at all

    def test_git_and_pwsh_are_required_on_both(self, repo, monkeypatch):
        monkeypatch.setattr(doctor.shutil, "which", lambda name: None)
        for r in (repo, _make_ado(repo)):
            titles = _titles(check_tools(r))
            assert "git missing" in titles and "pwsh missing" in titles


class TestRequiredVariableGroups:
    def _pipe(self, repo, name, body):
        (repo / ".azuredevops" / "pipelines" / name).write_text(body, encoding="utf-8")

    def test_groups_come_from_the_installed_pipelines(self, repo):
        _make_ado(repo)
        self._pipe(repo, "grader.yml", "variables:\n  - group: rails-secrets\n")
        assert required_variable_groups(repo) == {"rails-secrets": ["grader.yml"]}

    def test_a_group_named_only_in_a_comment_is_not_required(self, repo):
        _make_ado(repo)
        self._pipe(repo, "ci.yml", "# reference `- group: rails-secrets` once wired\njobs: []\n")
        assert required_variable_groups(repo) == {}

    def test_an_unfilled_variable_group_token_is_not_a_missing_group(self, repo):
        """`- group: <<VARIABLE_GROUP>>` is unfinished setup — the residual-token check owns it.
        Demanding a variable group literally named <<VARIABLE_GROUP>> would be a wrong instruction."""
        _make_ado(repo)
        self._pipe(repo, "grader.yml", "variables:\n  - group: <<VARIABLE_GROUP>>\n")
        assert required_variable_groups(repo) == {}

    def test_the_argv_safe_sentinel_form_is_not_a_missing_group_either(self, repo):
        _make_ado(repo)
        self._pipe(repo, "grader.yml", "variables:\n  - group: VARIABLE_GROUP_NOT_SET\n")
        assert required_variable_groups(repo) == {}

    def test_a_quoted_exotic_name_is_captured_whole_not_mangled(self, repo):
        """'My Group (Prod)' truncated to 'My Group' would FAIL demanding a group that does not
        exist under that name while the real one works — telling the user to fix a working
        setup, the module's cardinal sin. Quoting is the escape hatch for exotic legal names."""
        _make_ado(repo)
        self._pipe(repo, "ci.yml", "variables:\n  - group: 'My Group (Prod)'\n")
        assert required_variable_groups(repo) == {"My Group (Prod)": ["ci.yml"]}

    def test_a_bare_name_with_spaces_parens_and_unicode_survives(self, repo):
        _make_ado(repo)
        self._pipe(repo, "ci.yml", "variables:\n  - group: naïve rails (dev)   # exposes KEY\n")
        assert required_variable_groups(repo) == {"naïve rails (dev)": ["ci.yml"]}

    def test_a_runtime_template_expression_is_not_a_group_name(self, repo):
        _make_ado(repo)
        self._pipe(repo, "ci.yml", "variables:\n  - group: ${{ parameters.groupName }}\n")
        assert required_variable_groups(repo) == {}

    def test_a_github_only_repo_has_no_variable_groups(self, repo):
        assert required_variable_groups(repo) == {}


class TestAdoSecrets:
    def _pipe(self, repo, name, body):
        (repo / ".azuredevops" / "pipelines" / name).write_text(body, encoding="utf-8")

    def test_dispatch_uses_az_on_an_ado_repo(self, repo, monkeypatch):
        _make_ado(repo)
        self._pipe(repo, "grader.yml", "variables:\n  - group: rails-secrets\n")
        seen = []
        monkeypatch.setattr(doctor.shutil, "which", lambda name: name)  # az.cmd resolution aside
        monkeypatch.setattr(doctor, "_run",
                            lambda cmd, **k: (seen.append((cmd, k)), (0, "[]"))[1])
        check_secrets(repo)
        cmd, kwargs = seen[0]
        assert cmd[0] == "az", "an ADO repo must be checked with az, not gh"
        assert "--only-show-errors" in cmd, "az stderr chatter must not corrupt the JSON parse"
        assert kwargs.get("cwd") == str(repo), \
            "az must detect org/project from --repo's remote, not the doctor's CWD"

    def test_dispatch_still_uses_gh_on_a_github_repo(self, repo, monkeypatch):
        (repo / ".github" / "workflows" / "g.yml").write_text(
            "  key: ${{ secrets.ANTHROPIC_API_KEY }}\n", encoding="utf-8")
        seen = []
        monkeypatch.setattr(doctor, "_run", lambda cmd, **k: (seen.append(cmd), (0, "[]"))[1])
        check_secrets(repo)
        assert seen and seen[0][0] == "gh"

    def test_a_present_group_passes(self, repo, monkeypatch):
        _make_ado(repo)
        self._pipe(repo, "grader.yml", "variables:\n  - group: rails-secrets\n")
        monkeypatch.setattr(doctor, "_run",
                            lambda *a, **k: (0, json.dumps([{"name": "rails-secrets"}])))
        results = check_secrets(repo)
        assert FAIL not in _statuses(results)

    def test_a_missing_group_fails_and_names_the_pipeline(self, repo, monkeypatch):
        _make_ado(repo)
        self._pipe(repo, "grader.yml", "variables:\n  - group: rails-secrets\n")
        monkeypatch.setattr(doctor, "_run", lambda *a, **k: (0, json.dumps([])))
        results = check_secrets(repo)
        assert FAIL in _statuses(results)
        assert "grader.yml" in results[0].detail, "say which pipeline needs it"

    def test_unreachable_az_warns_rather_than_fails(self, repo, monkeypatch):
        """Offline is not a broken harness — same rule as the gh path."""
        _make_ado(repo)
        self._pipe(repo, "grader.yml", "variables:\n  - group: rails-secrets\n")
        monkeypatch.setattr(doctor, "_run", lambda *a, **k: (1, "az login required"))
        assert check_secrets(repo)[0].status == WARN

    def test_no_group_references_warns_rather_than_inventing_a_requirement(self, repo):
        _make_ado(repo)
        assert check_secrets(repo)[0].status == WARN


class TestAdoBranchPolicies:
    def test_dispatch_uses_az_on_an_ado_repo(self, repo, monkeypatch):
        _make_ado(repo)
        seen = []
        monkeypatch.setattr(doctor.shutil, "which", lambda name: name)
        monkeypatch.setattr(doctor, "_run", lambda cmd, **k: (seen.append(cmd), (0, "[]"))[1])
        check_branch_protection(repo)
        assert seen and seen[0][:3] == ["az", "repos", "policy"]

    def test_no_policies_fails_and_points_at_the_configure_script(self, repo, monkeypatch):
        _make_ado(repo)
        monkeypatch.setattr(doctor, "_run", lambda *a, **k: (0, "[]"))
        results = check_branch_protection(repo)
        assert results[0].status == FAIL
        assert "configure-branch-policies.sh" in results[0].fix

    def test_enforcing_policies_pass_naming_their_kinds(self, repo, monkeypatch):
        _make_ado(repo)
        monkeypatch.setattr(doctor, "_run", lambda *a, **k: (0, json.dumps([
            {"isEnabled": True, "isBlocking": True, "type": {"displayName": "Build"}},
            {"isEnabled": True, "isBlocking": True,
             "type": {"displayName": "Minimum number of reviewers"}},
        ])))
        results = check_branch_protection(repo)
        assert results[0].status == PASS
        assert "Build" in results[0].detail

    def test_disabled_policies_fail_rather_than_passing_on_existence(self, repo, monkeypatch):
        """A policy that exists but does not enforce is the same silent absence as none at all."""
        _make_ado(repo)
        monkeypatch.setattr(doctor, "_run", lambda *a, **k: (0, json.dumps([
            {"isEnabled": False, "isBlocking": True, "type": {"displayName": "Build"}},
        ])))
        assert check_branch_protection(repo)[0].status == FAIL

    def test_an_enabled_but_optional_policy_is_not_enforcement(self, repo, monkeypatch):
        """isEnabled without isBlocking is advice, not a gate — the ADO twin of a GitHub
        ruleset whose enforcement is not 'active'. Passing on it would claim a protection
        that does not block a red PR."""
        _make_ado(repo)
        monkeypatch.setattr(doctor, "_run", lambda *a, **k: (0, json.dumps([
            {"isEnabled": True, "isBlocking": False, "type": {"displayName": "Build"}},
        ])))
        assert check_branch_protection(repo)[0].status == FAIL

    def test_a_dict_shaped_response_warns_rather_than_raising(self, repo, monkeypatch):
        monkeypatch.setattr(doctor, "_run", lambda *a, **k: (0, json.dumps({"value": []})))
        assert check_branch_protection(_make_ado(repo))[0].status == WARN

    def test_unreachable_az_warns_rather_than_fails(self, repo, monkeypatch):
        _make_ado(repo)
        monkeypatch.setattr(doctor, "_run", lambda *a, **k: (1, "not logged in"))
        assert check_branch_protection(repo)[0].status == WARN

    def test_a_github_repo_is_still_checked_via_gh_api(self, repo, monkeypatch):
        seen = []
        monkeypatch.setattr(doctor, "_run", lambda cmd, **k: (seen.append(cmd), (0, "[]"))[1])
        check_branch_protection(repo)
        assert seen and seen[0][0] == "gh"


class TestResidualTokensScanAdoHome:
    def test_a_token_in_an_ado_pipeline_is_reported(self, repo):
        """.azuredevops/ is a scan root — an unfilled <<GATED_PATHS>> in security.yml was
        invisible before the platform-aware pass, exactly the silent-absence shape."""
        _make_ado(repo)
        (repo / ".azuredevops" / "pipelines" / "security.yml").write_text(
            "env:\n  GATED: <<GATED_PATHS>>\n", encoding="utf-8")
        results = check_residual_tokens(repo)
        assert WARN in _statuses(results)
        assert "GATED_PATHS" in _titles(results)

    def test_the_variable_group_token_names_its_owner(self, repo):
        _make_ado(repo)
        (repo / ".azuredevops" / "pipelines" / "grader.yml").write_text(
            "variables:\n  - group: <<VARIABLE_GROUP>>\n", encoding="utf-8")
        fix = [r.fix for r in check_residual_tokens(repo) if "VARIABLE_GROUP" in r.title][0]
        assert "Phase 3" in fix


class TestArgvSafePlaceholders:
    """A placeholder that lands in an ARGV cannot use << >> (issue #28).

    On Windows npx runs through cmd.exe, which reads them as redirect operators and dies with
    `<< was unexpected at this time.` before the tool starts — naming neither the tool nor the
    token. Those spots use a NAME_NOT_SET sentinel, which the tool itself then reports clearly.
    The doctor has to recognise both forms, or swapping the placeholder would trade a detected
    failure for an undetected one.
    """

    def test_the_sentinel_form_is_detected(self, repo):
        (repo / ".mcp.json").write_text(json.dumps({
            "mcpServers": {"azure-devops": {
                "command": "npx", "args": ["-y", "@azure-devops/mcp", "ADO_ORGANIZATION_NOT_SET"]}}
        }), encoding="utf-8")
        results = check_residual_tokens(repo)
        assert WARN in _statuses(results)
        assert "ADO_ORGANIZATION" in _titles(results)

    def test_the_sentinel_carries_the_same_owner_as_the_angled_form(self, repo):
        (repo / ".mcp.json").write_text(json.dumps({
            "mcpServers": {"ado": {"args": ["ADO_ORGANIZATION_NOT_SET"]}}
        }), encoding="utf-8")
        fix = [r.fix for r in check_residual_tokens(repo) if "ADO_ORGANIZATION" in r.title][0]
        assert "Phase 3" in fix

    def test_a_filled_org_is_not_reported(self, repo):
        (repo / ".mcp.json").write_text(json.dumps({
            "mcpServers": {"ado": {"args": ["-y", "@azure-devops/mcp", "harbor-mutual"]}}
        }), encoding="utf-8")
        assert check_residual_tokens(repo)[0].status == PASS
