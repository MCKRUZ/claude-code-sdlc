"""Tests for ci_tokens.py — the compose-time <<CI_*>> token table (the stack<->CI/CD seam).

Unit-level: loading/validating a stack pack's ci-profile.yaml, mapping its toolchain.id through a
CI/CD pack's toolchain_map, and the substitute/residual-scan primitives. The end-to-end wiring
(substitute during the CI/CD overlay, fail closed on a residual, preserve on a degraded stack axis)
is covered in test_install_harness.py::TestCiSeam.
"""

from pathlib import Path

import pytest
import yaml

from ci_tokens import (
    SEAM_TOKENS,
    build_token_table,
    load_ci_profile,
    residual_tokens,
    substitute,
)


DOTNET_CI_PROFILE = {
    "toolchain": {"id": "dotnet", "version": "10.x"},
    "solution": "{{SOLUTION_OR_PROJECT}}",
    "commands": {
        "restore": "dotnet restore {{SOLUTION_OR_PROJECT}}",
        "build": "dotnet build {{SOLUTION_OR_PROJECT}} --no-restore --configuration Release",
        "test": 'dotnet test {{SOLUTION_OR_PROJECT}} --collect:"XPlat Code Coverage"',
        "lint": "dotnet format {{SOLUTION_OR_PROJECT}} --verify-no-changes",
    },
    "coverage": {"floor_percent": 80, "tool": "coverlet"},
    "eval_gate": {"enabled": False, "test_filter": "Category=OwaspAgentic"},
}

GITHUB_TOOLCHAIN_MAP = {
    "dotnet": {"action": "actions/setup-dotnet@v4", "input": "dotnet-version"},
    "node": {"action": "actions/setup-node@v7", "input": "node-version"},
}

ADO_TOOLCHAIN_MAP = {
    "dotnet": {"action": "UseDotNet@2", "input": "version"},
    "node": {"action": "NodeTool@0", "input": "versionSpec"},
}


def _stack_pack(tmp_path: Path, profile=None, *, declare=True) -> tuple[Path, dict]:
    """A minimal stack pack on disk: pack.yaml declaring provides.ci_profile + the profile itself."""
    pack_dir = tmp_path / "packs" / "stacks" / "dotnet"
    pack_dir.mkdir(parents=True)
    provides = {"ci_profile": "ci-profile.yaml"} if declare else {}
    manifest = {"pack": {"id": "dotnet"}, "provides": provides, "overlays": []}
    if profile is not None:
        (pack_dir / "ci-profile.yaml").write_text(yaml.dump(profile), encoding="utf-8")
    return pack_dir, manifest


def _cicd_manifest(toolchain_map) -> dict:
    return {"pack": {"id": "github"}, "overlays": [], "toolchain_map": toolchain_map}


# ── loading + validating the stack pack's ci-profile ────────────────────────────

class TestLoadCiProfile:
    def test_loads_the_declared_profile(self, tmp_path):
        pack_dir, manifest = _stack_pack(tmp_path, DOTNET_CI_PROFILE)
        assert load_ci_profile(pack_dir, manifest)["toolchain"]["id"] == "dotnet"

    def test_undeclared_ci_profile_raises(self, tmp_path):
        pack_dir, manifest = _stack_pack(tmp_path, DOTNET_CI_PROFILE, declare=False)
        with pytest.raises(ValueError, match="provides.ci_profile"):
            load_ci_profile(pack_dir, manifest)

    def test_declared_but_absent_profile_raises(self, tmp_path):
        pack_dir, manifest = _stack_pack(tmp_path, profile=None)
        with pytest.raises(ValueError, match="ci-profile.yaml"):
            load_ci_profile(pack_dir, manifest)

    def test_multiline_command_raises(self, tmp_path):
        """Rule: a command must be a single line — a workflow splices it into one `run:` block."""
        bad = {**DOTNET_CI_PROFILE,
               "commands": {**DOTNET_CI_PROFILE["commands"], "test": "dotnet build\ndotnet test"}}
        pack_dir, manifest = _stack_pack(tmp_path, bad)
        with pytest.raises(ValueError, match="commands.test.*single line"):
            load_ci_profile(pack_dir, manifest)

    def test_folded_scalar_command_is_single_line_and_loads(self, tmp_path):
        """The .NET profile writes commands.test as a `>-` folded scalar: single-line at load."""
        raw = (
            "toolchain: {id: dotnet, version: '10.x'}\n"
            "commands:\n"
            "  restore: dotnet restore x\n"
            "  build: dotnet build x\n"
            "  test:    >-\n"
            "    dotnet test x\n"
            '    --collect:"XPlat Code Coverage" --results-directory coverage\n'
            "  lint: dotnet format x\n"
            "coverage: {floor_percent: 80}\n"
            "eval_gate: {enabled: false, test_filter: 'Category=OwaspAgentic'}\n"
        )
        pack_dir = tmp_path / "packs" / "stacks" / "dotnet"
        pack_dir.mkdir(parents=True)
        (pack_dir / "ci-profile.yaml").write_text(raw, encoding="utf-8")
        manifest = {"provides": {"ci_profile": "ci-profile.yaml"}}
        profile = load_ci_profile(pack_dir, manifest)
        assert "\n" not in profile["commands"]["test"]
        assert profile["commands"]["test"].startswith("dotnet test x --collect:")

    def test_trailing_newline_command_is_not_multiline(self, tmp_path):
        """A `>` (clip) folded scalar keeps a trailing newline — benign, not a multi-line command."""
        ok = {**DOTNET_CI_PROFILE,
              "commands": {**DOTNET_CI_PROFILE["commands"], "lint": "dotnet format x\n"}}
        pack_dir, manifest = _stack_pack(tmp_path, ok)
        assert load_ci_profile(pack_dir, manifest)["commands"]["lint"].strip() == "dotnet format x"


# ── building the token table ───────────────────────────────────────────────────

class TestBuildTokenTable:
    def test_dotnet_github_table(self, tmp_path):
        table = build_token_table(DOTNET_CI_PROFILE, _cicd_manifest(GITHUB_TOOLCHAIN_MAP), "github")
        assert table["<<CI_TOOLCHAIN_ACTION>>"] == "actions/setup-dotnet@v4"
        assert table["<<CI_TOOLCHAIN_INPUT>>"] == "dotnet-version"
        assert table["<<CI_TOOLCHAIN_VERSION>>"] == "10.x"
        assert table["<<CI_RESTORE_CMD>>"] == "dotnet restore {{SOLUTION_OR_PROJECT}}"
        assert table["<<CI_COVERAGE_FLOOR>>"] == "80"      # stringified for YAML splicing
        assert table["<<CI_EVAL_TEST_FILTER>>"] == "Category=OwaspAgentic"

    def test_same_profile_different_platform_maps_to_ado_task(self, tmp_path):
        """The whole point of the seam: one ci-profile, each platform's own toolchain vocabulary."""
        table = build_token_table(DOTNET_CI_PROFILE, _cicd_manifest(ADO_TOOLCHAIN_MAP), "azure-devops")
        assert table["<<CI_TOOLCHAIN_ACTION>>"] == "UseDotNet@2"
        assert table["<<CI_TOOLCHAIN_INPUT>>"] == "version"
        assert table["<<CI_RESTORE_CMD>>"] == "dotnet restore {{SOLUTION_OR_PROJECT}}"  # unchanged

    def test_unknown_toolchain_id_for_platform_raises_naming_id_and_pack(self):
        rust = {**DOTNET_CI_PROFILE, "toolchain": {"id": "rust", "version": "1.x"}}
        with pytest.raises(ValueError) as exc:
            build_token_table(rust, _cicd_manifest(GITHUB_TOOLCHAIN_MAP), "github")
        assert "rust" in str(exc.value)      # names the unmapped id
        assert "github" in str(exc.value)    # names the pack that lacks the entry

    def test_pack_without_toolchain_map_raises(self):
        with pytest.raises(ValueError, match="toolchain_map"):
            build_token_table(DOTNET_CI_PROFILE, {"pack": {"id": "github"}}, "github")

    def test_missing_ci_profile_key_raises_naming_the_path(self):
        no_lint = {**DOTNET_CI_PROFILE,
                   "commands": {k: v for k, v in DOTNET_CI_PROFILE["commands"].items()
                                if k != "lint"}}
        with pytest.raises(ValueError, match="commands.lint"):
            build_token_table(no_lint, _cicd_manifest(GITHUB_TOOLCHAIN_MAP), "github")

    def test_toolchain_map_entry_missing_input_raises(self):
        broken = {"dotnet": {"action": "actions/setup-dotnet@v4"}}
        with pytest.raises(ValueError, match="input"):
            build_token_table(DOTNET_CI_PROFILE, _cicd_manifest(broken), "github")


# ── the substitute / residual-scan primitives ──────────────────────────────────

class TestSubstitute:
    def test_replaces_every_occurrence(self):
        out = substitute("a <<CI_BUILD_CMD>> b <<CI_BUILD_CMD>>", {"<<CI_BUILD_CMD>>": "make"})
        assert out == "a make b make"

    def test_leaves_curly_repo_tokens_untouched(self):
        """{{SOLUTION_OR_PROJECT}} is Phase-3 repo adaptation — never compose-time."""
        text = "run: <<CI_RESTORE_CMD>>\n# keep {{SOLUTION_OR_PROJECT}} and {{STACK}}\n"
        out = substitute(text, {"<<CI_RESTORE_CMD>>": "dotnet restore {{SOLUTION_OR_PROJECT}}"})
        assert out == "run: dotnet restore {{SOLUTION_OR_PROJECT}}\n# keep {{SOLUTION_OR_PROJECT}} and {{STACK}}\n"

    def test_leaves_non_ci_angle_tokens_untouched(self):
        """<<EVAL_TEST_PROJECT>> / <<SOLUTION_OR_PROJECT>> are Phase-3, not compose-time."""
        text = "<<EVAL_TEST_PROJECT>> <<SOLUTION_OR_PROJECT>> <<DEFAULT_BRANCH>> <<ADO_ORGANIZATION>>"
        assert substitute(text, {"<<CI_BUILD_CMD>>": "x"}) == text


class TestResidualTokens:
    def test_finds_unfilled_seam_tokens(self):
        assert residual_tokens("a <<CI_LINT_CMD>> b <<CI_TEST_CMD>>") == [
            "<<CI_LINT_CMD>>", "<<CI_TEST_CMD>>"]

    def test_dedupes_and_sorts(self):
        assert residual_tokens("<<CI_TEST_CMD>> <<CI_BUILD_CMD>> <<CI_TEST_CMD>>") == [
            "<<CI_BUILD_CMD>>", "<<CI_TEST_CMD>>"]

    def test_ignores_phase_three_tokens(self):
        assert residual_tokens("<<SOLUTION_OR_PROJECT>> {{STACK}} <<EVAL_TEST_PROJECT>>") == []

    def test_ignores_phase_three_blanks_that_share_the_ci_prefix(self):
        """REGRESSION: the seam is a closed VOCABULARY, not the <<CI_ prefix. deploy-dev.yml (both
        packs) carries these repo blanks — naming the CI pipeline, nothing to do with the stack.
        Treating the prefix as the namespace would fail every install closed on deploy-dev.yml."""
        text = "<<CI_WORKFLOW_NAME>> <<CI_PIPELINE_NAME>> <<CI_PIPELINE_RESOURCE>>"
        assert residual_tokens(text) == []
        assert substitute(text, {"<<CI_BUILD_CMD>>": "x"}) == text   # and never substituted

    def test_clean_text_has_none(self):
        assert residual_tokens("run: dotnet restore {{SOLUTION_OR_PROJECT}}\n") == []


class TestSeamVocabulary:
    def test_is_exactly_the_nine_designed_tokens(self):
        """The vocabulary is closed and small on purpose — every entry must be filled by a real
        ci-profile value or toolchain_map field, and each is referenced by a pack workflow."""
        assert SEAM_TOKENS == {
            "<<CI_TOOLCHAIN_ACTION>>", "<<CI_TOOLCHAIN_INPUT>>", "<<CI_TOOLCHAIN_VERSION>>",
            "<<CI_RESTORE_CMD>>", "<<CI_BUILD_CMD>>", "<<CI_TEST_CMD>>", "<<CI_LINT_CMD>>",
            "<<CI_COVERAGE_FLOOR>>", "<<CI_EVAL_TEST_FILTER>>",
        }

    def test_a_built_table_fills_every_seam_token(self):
        table = build_token_table(DOTNET_CI_PROFILE, _cicd_manifest(GITHUB_TOOLCHAIN_MAP), "github")
        assert set(table) == SEAM_TOKENS
