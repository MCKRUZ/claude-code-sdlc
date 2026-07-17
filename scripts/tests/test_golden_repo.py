"""Golden-repo test — the REAL payload composed with the flagship profile, end to end.

Installs harness/ with profiles/microsoft-enterprise/profile.yaml into a fresh git repo and
asserts the composed OUTPUT: the exact installed tree (snapshot), the spliced CLAUDE.md, the
merged settings.json/.mcp.json, the frontend degrade path (angular-17 -> generic ux-reviewer
+ exactly one warning), the manifest, and that every emitted workflow parses.

The tree snapshot is the drift tripwire for the whole composition. When the kit legitimately
adds/moves files, regenerate it:

    GOLDEN_REGEN=1 uv run --project . pytest tests/test_golden_repo.py -q

then review the diff of tests/golden/enterprise-tree.txt and commit it with the change.
"""

import io
import json
import os
import subprocess
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

import pytest
import yaml

from install_harness import install

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PAYLOAD = _REPO_ROOT / "harness"
PROFILE = _REPO_ROOT / "profiles" / "microsoft-enterprise" / "profile.yaml"
STARTER_PROFILE = _REPO_ROOT / "profiles" / "starter" / "profile.yaml"
GOLDEN_TREE = Path(__file__).resolve().parent / "golden" / "enterprise-tree.txt"

REGEN_HINT = (
    "installed tree diverged from tests/golden/enterprise-tree.txt.\n"
    "If the change is intentional, regenerate the snapshot and commit it:\n"
    "    GOLDEN_REGEN=1 uv run --project . pytest tests/test_golden_repo.py -q"
)


def _installed_tree(target: Path) -> list[str]:
    return sorted(
        p.relative_to(target).as_posix()
        for p in target.rglob("*")
        if p.is_file() and p.relative_to(target).parts[0] != ".git"
    )


@pytest.fixture(scope="class")
def golden_repo(tmp_path_factory):
    target = tmp_path_factory.mktemp("golden-repo")
    subprocess.run(["git", "init", "-q"], cwd=target, check=True)
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        rc = install(PAYLOAD, target, force=False, profile_path=PROFILE)
    assert rc == 0, f"install failed rc={rc}\n{out.getvalue()}\n{err.getvalue()}"
    return target, out.getvalue(), err.getvalue()


class TestGoldenRepo:
    def test_tree_matches_snapshot(self, golden_repo):
        target, _, _ = golden_repo
        tree = _installed_tree(target)
        if os.environ.get("GOLDEN_REGEN") == "1":
            GOLDEN_TREE.parent.mkdir(parents=True, exist_ok=True)
            GOLDEN_TREE.write_text("\n".join(tree) + "\n", encoding="utf-8")
            pytest.skip(f"regenerated {GOLDEN_TREE.name} ({len(tree)} paths) — review and commit it")
        assert GOLDEN_TREE.is_file(), f"missing snapshot {GOLDEN_TREE}.\n{REGEN_HINT}"
        expected = GOLDEN_TREE.read_text(encoding="utf-8").splitlines()
        assert tree == expected, REGEN_HINT

    def test_claude_md_is_spliced(self, golden_repo):
        target, _, _ = golden_repo
        claude = (target / "CLAUDE.md").read_text(encoding="utf-8")
        assert "{{STACK}}" not in claude, "stack marker survived — splice did not run"
        assert "## Stack standards" in claude

    def test_settings_merged_core_plus_fragment(self, golden_repo):
        target, _, _ = golden_repo
        settings = json.loads((target / ".claude" / "settings.json").read_text(encoding="utf-8"))
        deny = settings["permissions"]["deny"]
        allow = settings["permissions"]["allow"]
        assert "Bash(git push --force:*)" in deny, "core deny rule lost in merge"
        assert "Bash(dotnet sln:*)" in allow, "dotnet fragment addition missing from merge"

    def test_mcp_has_core_trio_plus_stack_server(self, golden_repo):
        target, _, _ = golden_repo
        mcp = json.loads((target / ".mcp.json").read_text(encoding="utf-8"))
        servers = set(mcp["mcpServers"])
        assert {"context7", "sequential-thinking", "playwright", "microsoft-learn"} <= servers

    def test_frontend_composes_the_angular_pack(self, golden_repo):
        # The profile declares angular-17; the frontend axis installs generic then overlays the
        # angular pack (same dest, last wins). Until the angular pack existed this degraded to the
        # generic reviewer plus a WARNING — this test used to assert exactly that.
        target, _, _ = golden_repo
        reviewer = (target / ".claude" / "agents" / "ux-reviewer.md").read_text(encoding="utf-8")
        assert "Angular" in reviewer, "angular pack did not overlay the generic reviewer"
        assert "React" not in reviewer, "React pack composed for an angular-17 profile"

    def test_flagship_install_is_warning_free(self, golden_repo):
        # Every axis the flagship profile declares now has a pack. A warning here means an axis
        # silently degraded — the thing a client would never notice until CI ran the wrong stack.
        _, _, err = golden_repo
        warnings = [l for l in err.splitlines() if "WARNING" in l]
        assert warnings == [], f"flagship profile degraded on an axis: {warnings}"

    def test_manifest_written_for_profile(self, golden_repo):
        target, _, _ = golden_repo
        manifest = json.loads(
            (target / ".claude" / "harness-manifest.json").read_text(encoding="utf-8")
        )
        assert manifest["profile_id"] == "microsoft-enterprise"
        assert manifest["files"], "manifest recorded no files"
        assert ".claude/harness-manifest.json" not in manifest["files"]

    def test_pipeline_sets_up_dotnet_from_the_toolchain_map(self, golden_repo):
        """The .NET twin of TestStarterRepoIsNode.test_pipeline_runs_node_not_dotnet — the flagship
        had no version assertion at all, which is why setup-dotnet sat two majors behind unnoticed
        (intent-driven-development#14). This pins the map -> workflow binding; it cannot detect
        staleness against upstream, which stays a periodic human check."""
        target, _, _ = golden_repo
        ci = (target / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
        assert "uses: actions/setup-dotnet@v6" in ci   # github pack's toolchain_map for id: dotnet
        assert "dotnet-version: '10.x'" in ci          # map's input name + ci-profile's version

    def test_dotnet_eval_gate_cannot_pass_by_matching_nothing(self, golden_repo):
        """`dotnet test --filter` matching ZERO tests exits 0 — "No test matches the given testcase
        filter" is a WARNING, and the trx is still written with total="0" and outcome="Completed".
        Verified on SDK 8.0.129 / 9.0.316 / 10.0.301: all three. Without this runsettings value the
        gate passes green having run nothing. It must stay LAST, after `--`."""
        target, _, _ = golden_repo
        ci = (target / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
        eval_step = ci.split("eval-gate:", 1)[1]
        assert "-- RunConfiguration.TreatNoTestsAsError=true" in eval_step, (
            "the .NET eval gate lost its fail-closed setting — zero matched tests would exit 0"
        )

    def test_emitted_workflows_parse(self, golden_repo):
        target, _, _ = golden_repo
        workflows = sorted((target / ".github" / "workflows").glob("*.yml"))
        assert workflows, "no workflows installed"
        for wf in workflows:
            yaml.safe_load(wf.read_text(encoding="utf-8"))


@pytest.fixture(scope="class")
def starter_repo(tmp_path_factory):
    target = tmp_path_factory.mktemp("starter-repo")
    subprocess.run(["git", "init", "-q"], cwd=target, check=True)
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        rc = install(PAYLOAD, target, force=False, profile_path=STARTER_PROFILE)
    assert rc == 0, f"install failed rc={rc}\n{out.getvalue()}\n{err.getvalue()}"
    return target, out.getvalue(), err.getvalue()


class TestStarterRepoIsNode:
    """The point of the whole seam: a Node profile must get a NODE pipeline. Before the seam was
    mechanical, this repo would have been handed `dotnet restore`."""

    def _ci(self, target: Path) -> str:
        return (target / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

    def test_pipeline_runs_node_not_dotnet(self, starter_repo):
        target, _, _ = starter_repo
        ci = self._ci(target)
        assert "uses: actions/setup-node@v7" in ci        # github pack's toolchain_map for id: node
        assert "node-version: '24.x'" in ci               # map's input name + ci-profile's version
        assert "npm ci" in ci                             # ci-profile.commands.restore
        assert "npx vitest run" in ci
        # THE WHOLE FILE, not just the blocking job. This assertion was scoped to the blocking job
        # while the eval-gate carried a hardcoded `dotnet test` on every stack; closing that seam
        # (intent-driven-development#15) retired the exemption. A Node repo now receives no .NET
        # anywhere in its pipeline — which is the entire promise of the seam.
        assert "dotnet" not in ci, "a .NET command leaked into a Node repo's pipeline"

    def test_eval_gate_is_realized_from_the_node_stack(self, starter_repo):
        """The gap this closed (intent-driven-development#15): the eval job used to hardcode
        `dotnet test` regardless of stack, because ci-profile declared only a FILTER and not the
        runner invocation that consumes it."""
        target, _, _ = starter_repo
        eval_job = self._ci(target).split("eval-gate:", 1)
        assert len(eval_job) == 2, "eval-gate job vanished"
        assert 'npx vitest run -t "@owasp-agentic"' in eval_job[1]

    def test_node_eval_gate_cannot_pass_by_matching_nothing(self, starter_repo):
        """`vitest run -t` matching ZERO tests exits 0 (verified on vitest 3.2.7 and 4.1.10), so a
        bare invocation would be a gate that passes green having run nothing. The realized job must
        carry the guard that fails closed — and it must guard on numPassed+numFailed, because
        `success` is true and `numTotalTests` counts COLLECTED (not matched) on a zero-match run."""
        eval_job = self._ci(starter_repo[0]).split("eval-gate:", 1)[1]
        assert "numPassedTests+r.numFailedTests" in eval_job, "eval gate lost its fail-closed guard"
        assert "failing closed" in eval_job

    def test_coverage_floor_comes_from_the_customer_profile(self, starter_repo):
        # starter states quality.coverage_minimum: 60; the node pack declares 80. The profile is
        # the later layer, so 60 is what the gate must enforce.
        target, _, _ = starter_repo
        assert "COVERAGE_FLOOR: '60'" in self._ci(target)

    def test_no_seam_token_survives(self, starter_repo):
        target, _, _ = starter_repo
        from ci_tokens import residual_tokens
        for path in target.rglob("*"):
            if path.is_file() and path.suffix in (".yml", ".yaml"):
                left = residual_tokens(path.read_text(encoding="utf-8"))
                assert not left, f"{path.name} kept seam tokens: {left}"

    def test_node_stack_standards_spliced(self, starter_repo):
        target, _, _ = starter_repo
        claude = (target / "CLAUDE.md").read_text(encoding="utf-8")
        assert "{{STACK}}" not in claude
        assert (target / ".claude" / "skills" / "api-pattern-node" / "SKILL.md").is_file()

    def test_emitted_workflows_parse(self, starter_repo):
        target, _, _ = starter_repo
        for wf in sorted((target / ".github" / "workflows").glob("*.yml")):
            yaml.safe_load(wf.read_text(encoding="utf-8"))
