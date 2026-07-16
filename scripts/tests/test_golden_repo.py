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

    def test_frontend_degrades_to_generic_with_one_warning(self, golden_repo):
        target, _, err = golden_repo
        reviewer = target / ".claude" / "agents" / "ux-reviewer.md"
        assert reviewer.is_file(), "generic ux-reviewer missing on the degrade path"
        assert "React" not in reviewer.read_text(encoding="utf-8"), "React pack composed for angular-17"
        warnings = [l for l in err.splitlines() if "WARNING" in l]
        assert len(warnings) == 1, f"expected exactly one degrade warning, got: {warnings}"

    def test_manifest_written_for_profile(self, golden_repo):
        target, _, _ = golden_repo
        manifest = json.loads(
            (target / ".claude" / "harness-manifest.json").read_text(encoding="utf-8")
        )
        assert manifest["profile_id"] == "microsoft-enterprise"
        assert manifest["files"], "manifest recorded no files"
        assert ".claude/harness-manifest.json" not in manifest["files"]

    def test_emitted_workflows_parse(self, golden_repo):
        target, _, _ = golden_repo
        workflows = sorted((target / ".github" / "workflows").glob("*.yml"))
        assert workflows, "no workflows installed"
        for wf in workflows:
            yaml.safe_load(wf.read_text(encoding="utf-8"))
