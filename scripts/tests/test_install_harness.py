"""Tests for install_harness.py — core-only copy and profile-aware pack composition."""

import hashlib
import json
import shutil
from pathlib import Path

import pytest
import yaml

from install_harness import (
    InstallError,
    _deep_merge,
    _resolve_frontend,
    _resolve_packs,
    _resolve_tools,
    _splice_claude_stack_section,
    install,
)


# ── Synthetic payload (hermetic; no dependency on the sibling delivery-standard checkout) ──

CLAUDE_TEMPLATE = """\
# {{PROJECT_NAME}}

## What this is
{{ONE_PARAGRAPH}}

---

## Stack standards — {{STACK}} profile
<!-- guidance comment the pack replaces -->
- **Architecture:** {{e.g. Clean Architecture}}.
- **Tests:** {{e.g. xUnit}}.
"""

CORE_SETTINGS = {
    "permissions": {
        "allow": ["Bash(dotnet build:*)", "Bash(git status:*)"],
        "ask": ["Bash(git push:*)"],
        "deny": ["Bash(git push --force:*)"],
    },
    "hooks": {"Stop": [{"hooks": [{"type": "command", "command": "stop-gate"}]}]},
}

CORE_MCP = {
    "mcpServers": {
        "context7": {"type": "http", "url": "https://mcp.context7.com/mcp"},
        "sequential-thinking": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-sequential-thinking@2026.7.4"],
        },
        "playwright": {"command": "npx", "args": ["-y", "@playwright/mcp@0.0.78"]},
    }
}

CORE_CI = "name: CI\n# PLACEHOLDER core ci — run: dotnet build {{SOLUTION_OR_PROJECT}}\n"
REALIZED_CI = "name: CI\n# realized github pack ci\njobs:\n  build-and-test:\n    runs-on: ubuntu-latest\n"

STACK_STANDARDS = """\
<!--
  .NET stack standards — realized replacement for the {{STACK}} section.
-->

## Stack standards — .NET 10 / Microsoft Agent Framework

- **Architecture:** Clean Architecture, dependencies point inward. See @./.claude/rules/clean-architecture.md.
- **Tests:** xUnit, 80% floor. See @./.claude/rules/testing.md.
"""

STACK_PACK_YAML = {
    "pack": {"id": "dotnet", "axis": "stack", "name": ".NET", "version": "0.1.0"},
    "provides": {"claude_standards": "claude/stack-standards.md"},
    "overlays": [
        {"src": "rules/clean-architecture.md", "dest": ".claude/rules/clean-architecture.md"},
        {"src": "rules/testing.md", "dest": ".claude/rules/testing.md"},
        {"src": "settings.fragment.json", "dest": ".claude/settings.json", "merge": True},
        {"src": "mcp.fragment.json", "dest": ".mcp.json", "merge": True},
    ],
    "requires_cicd_pack": ["github", "azure-devops"],
}

STACK_FRAGMENT = {
    "//": "merged, not overwritten",
    "permissions": {
        "allow": ["Bash(dotnet format:*)", "Bash(dotnet build:*)"],  # 2nd is a dup of core
        "ask": ["Edit(./**/*.csproj)"],
    },
}

STACK_MCP_FRAGMENT = {
    "//": "merged into .mcp.json",
    "mcpServers": {
        "microsoft-learn": {"type": "http", "url": "https://learn.microsoft.com/api/mcp"},
    },
}

CICD_PACK_YAML = {
    "pack": {"id": "github", "axis": "cicd", "name": "GitHub Actions", "version": "0.1.0"},
    "overlays": [
        {"src": "workflows/ci.yml", "dest": ".github/workflows/ci.yml"},
        {"src": "RAILS.md", "dest": ".github/RAILS.md"},
        {"src": "mcp.fragment.json", "dest": ".mcp.json", "merge": True},
    ],
    "requires_stack_pack": ["dotnet", "angular", "python"],
}

CICD_MCP_FRAGMENT = {
    "mcpServers": {
        "github": {"type": "http", "url": "https://api.githubcopilot.com/mcp/"},
    },
}

FRONTEND_GENERIC_YAML = {
    "pack": {"id": "generic", "axis": "frontend", "name": "Frontend (framework-agnostic)", "version": "0.1.0"},
    "overlays": [
        {"src": "agents/ux-reviewer.md", "dest": ".claude/agents/ux-reviewer.md"},
    ],
    "requires": {},
}

FRONTEND_REACT_YAML = {
    "pack": {"id": "react", "axis": "frontend", "name": "Frontend (React)", "version": "0.1.0"},
    "overlays": [
        {"src": "agents/ux-reviewer.md", "dest": ".claude/agents/ux-reviewer.md"},
    ],
    "requires": {},
}

TOOLS_PACK_YAML = {
    "pack": {"id": "gitnexus", "axis": "tools", "name": "GitNexus code intelligence", "version": "0.1.0"},
    "provides": {"config": "gitnexusignore", "setup_guide": "SETUP.md"},
    "overlays": [
        {"src": "gitnexusignore", "dest": ".gitnexusignore"},
        {"src": "SETUP.md", "dest": ".claude/tools/gitnexus/SETUP.md"},
    ],
    "setup": {
        "summary": "GitNexus installs itself; run its setup + analyze after the harness install.",
        "commands": ["npx gitnexus setup -c claude", "npx gitnexus analyze"],
    },
    "requires": {},
}


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def make_payload(root: Path, *, stack_requires_cicd=None, cicd_present=True, tools_present=True) -> Path:
    """Build a minimal but structurally-real payload: EVERY core FILE_MAP/DIR_MAP/EXTRA_FILES
    source (the installer fails closed on a missing one) + a dotnet stack pack + a github CI/CD
    pack + a gitnexus tools pack. Knobs let a test force an incompatible pair or a missing pack."""
    payload = root / "harness"
    _write(payload / "CLAUDE.md.template", CLAUDE_TEMPLATE)
    _write(payload / "spec-template.md", "# spec template\n")
    _write(payload / "settings.json", json.dumps(CORE_SETTINGS, indent=2) + "\n")
    _write(payload / "mcp.json", json.dumps(CORE_MCP, indent=2) + "\n")
    _write(payload / "HARNESS.md", "# harness tour\n")
    _write(payload / "workflows" / "ci.yml", CORE_CI)
    _write(payload / "workflows" / "RAILS.md", "# rails guide (core)\n")
    _write(payload / "hooks" / "stop-gate.sh", "#!/bin/sh\n")
    _write(payload / "agents" / "code-reviewer.md", "# reviewer\n")
    _write(payload / "skills" / "spec" / "SKILL.md", "# skill\n")
    _write(payload / "profile" / "rubrics" / "grader.md", "# rubric\n")
    _write(payload / "profile" / "rulesets" / "main.json", "{}\n")
    _write(payload / "profile" / "scripts" / "diff-anchors.sh", "#!/bin/sh\n")
    _write(payload / "profile" / "eval-bypasses.md", "# bypasses\n")
    _write(payload / "profile" / "CODEOWNERS", "* @team\n")
    _write(payload / "eval-datasets" / "cases.jsonl", "{}\n")
    _write(payload / "prompts" / "review.md", "# prompt\n")
    _write(payload / "infra" / "main.bicep", "// infra\n")

    stack = dict(STACK_PACK_YAML)
    if stack_requires_cicd is not None:
        stack = {**STACK_PACK_YAML, "requires_cicd_pack": stack_requires_cicd}
    sp = payload / "packs" / "stacks" / "dotnet"
    _write(sp / "pack.yaml", yaml.dump(stack))
    _write(sp / "claude" / "stack-standards.md", STACK_STANDARDS)
    _write(sp / "rules" / "clean-architecture.md", "# clean architecture\n")
    _write(sp / "rules" / "testing.md", "# testing\n")
    _write(sp / "settings.fragment.json", json.dumps(STACK_FRAGMENT, indent=2) + "\n")
    _write(sp / "mcp.fragment.json", json.dumps(STACK_MCP_FRAGMENT, indent=2) + "\n")

    if cicd_present:
        cp = payload / "packs" / "cicd" / "github"
        _write(cp / "pack.yaml", yaml.dump(CICD_PACK_YAML))
        _write(cp / "workflows" / "ci.yml", REALIZED_CI)
        _write(cp / "RAILS.md", "# rails guide\n")
        _write(cp / "mcp.fragment.json", json.dumps(CICD_MCP_FRAGMENT, indent=2) + "\n")

    if tools_present:
        tp = payload / "packs" / "tools" / "gitnexus"
        _write(tp / "pack.yaml", yaml.dump(TOOLS_PACK_YAML))
        _write(tp / "gitnexusignore", "**/bin/\n**/obj/\n")
        _write(tp / "SETUP.md", "# GitNexus setup\nnpx gitnexus analyze\n")

    fg = payload / "packs" / "frontend" / "generic"
    _write(fg / "pack.yaml", yaml.dump(FRONTEND_GENERIC_YAML))
    _write(fg / "agents" / "ux-reviewer.md", "# generic ux reviewer\nstates, a11y, house pattern\n")
    fr = payload / "packs" / "frontend" / "react"
    _write(fr / "pack.yaml", yaml.dump(FRONTEND_REACT_YAML))
    _write(fr / "agents" / "ux-reviewer.md", "# React ux reviewer\nhooks, keys, suspense states\n")
    return payload


@pytest.fixture
def payload(tmp_path):
    return make_payload(tmp_path)


@pytest.fixture
def target(tmp_path):
    t = tmp_path / "repo"
    t.mkdir()
    return t


def _profile_file(tmp_path, profile) -> Path:
    p = tmp_path / "profile.yaml"
    p.write_text(yaml.dump(profile), encoding="utf-8")
    return p


# ── core-only mode (no profile) ────────────────────────────────────────────────

class TestCoreOnly:
    def test_copies_core_and_leaves_tokens(self, payload, target):
        rc = install(payload, target, force=False)
        assert rc == 0
        claude = (target / "CLAUDE.md").read_text(encoding="utf-8")
        assert "{{STACK}}" in claude  # unfilled — no pack composed
        assert (target / ".claude" / "settings.json").is_file()

    def test_ci_is_placeholder(self, payload, target):
        install(payload, target, force=False)
        ci = (target / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
        assert "PLACEHOLDER" in ci

    def test_no_stack_rules_without_profile(self, payload, target):
        install(payload, target, force=False)
        assert not (target / ".claude" / "rules" / "clean-architecture.md").exists()


# ── profile-aware composition ──────────────────────────────────────────────────

class TestCompose:
    def test_returns_zero(self, payload, target, tmp_path, valid_profile):
        rc = install(payload, target, force=False, profile_path=_profile_file(tmp_path, valid_profile))
        assert rc == 0

    def test_stack_rules_land(self, payload, target, tmp_path, valid_profile):
        install(payload, target, force=False, profile_path=_profile_file(tmp_path, valid_profile))
        assert (target / ".claude" / "rules" / "clean-architecture.md").is_file()
        assert (target / ".claude" / "rules" / "testing.md").is_file()

    def test_cicd_overlay_shadows_core_placeholder(self, payload, target, tmp_path, valid_profile):
        install(payload, target, force=False, profile_path=_profile_file(tmp_path, valid_profile))
        ci = (target / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
        assert "realized github pack ci" in ci
        assert "PLACEHOLDER" not in ci

    def test_claude_stack_section_spliced(self, payload, target, tmp_path, valid_profile):
        install(payload, target, force=False, profile_path=_profile_file(tmp_path, valid_profile))
        claude = (target / "CLAUDE.md").read_text(encoding="utf-8")
        assert "{{STACK}}" not in claude
        assert ".NET 10 / Microsoft Agent Framework" in claude
        assert "## What this is" in claude          # earlier sections preserved
        assert "guidance comment the pack replaces" not in claude  # old section gone
        assert "realized replacement for the" not in claude        # pack's HTML comment stripped

    def test_settings_merged_not_overwritten(self, payload, target, tmp_path, valid_profile):
        install(payload, target, force=False, profile_path=_profile_file(tmp_path, valid_profile))
        settings = json.loads((target / ".claude" / "settings.json").read_text(encoding="utf-8"))
        allow = settings["permissions"]["allow"]
        assert "Bash(dotnet format:*)" in allow     # from the fragment
        assert "Bash(git status:*)" in allow         # from the core, preserved
        assert allow.count("Bash(dotnet build:*)") == 1  # dup collapsed
        assert settings["permissions"]["deny"] == ["Bash(git push --force:*)"]  # untouched
        assert "Edit(./**/*.csproj)" in settings["permissions"]["ask"]
        assert "//" not in settings                  # JSON-comment key dropped

    def test_mcp_core_lands_without_profile(self, payload, target):
        install(payload, target, force=False)
        mcp = json.loads((target / ".mcp.json").read_text(encoding="utf-8"))
        assert set(mcp["mcpServers"]) == {"context7", "sequential-thinking", "playwright"}

    def test_mcp_fragment_merged_not_overwritten(self, payload, target, tmp_path, valid_profile):
        install(payload, target, force=False, profile_path=_profile_file(tmp_path, valid_profile))
        mcp = json.loads((target / ".mcp.json").read_text(encoding="utf-8"))
        servers = mcp["mcpServers"]
        assert "microsoft-learn" in servers               # from the stack pack fragment
        assert "github" in servers                        # from the CI/CD pack fragment
        assert "context7" in servers                      # core entries preserved
        assert "playwright" in servers
        assert servers["microsoft-learn"]["url"] == "https://learn.microsoft.com/api/mcp"
        assert "//" not in mcp                            # fragment's comment key dropped

    def test_mcp_preexisting_file_gains_fragment_but_keeps_own_servers(
        self, payload, target, tmp_path, valid_profile
    ):
        own = {"mcpServers": {"team-custom": {"type": "http", "url": "https://example.test/mcp"}}}
        (target / ".mcp.json").write_text(json.dumps(own), encoding="utf-8")
        install(payload, target, force=False, profile_path=_profile_file(tmp_path, valid_profile))
        mcp = json.loads((target / ".mcp.json").read_text(encoding="utf-8"))
        assert "team-custom" in mcp["mcpServers"]         # repo's own server preserved (no --force)
        assert "microsoft-learn" in mcp["mcpServers"]     # fragment still merged in


# ── graceful degrade (valid stack, no pack built for it yet) ────────────────────

class TestGracefulDegrade:
    def test_unknown_language_composes_cicd_only(self, payload, target, tmp_path, valid_profile, capsys):
        # rust has no stack pack, but github-actions still resolves the CI/CD pack: partial compose.
        bad = {**valid_profile, "stack": {**valid_profile["stack"],
                                          "backend": {"language": "rust", "framework": "axum"}}}
        rc = install(payload, target, force=False, profile_path=_profile_file(tmp_path, bad))
        assert rc == 0
        err = capsys.readouterr().err
        assert "no stack pack" in err
        assert not (target / ".claude" / "rules" / "clean-architecture.md").exists()  # no stack pack
        assert "realized github pack ci" in (target / ".github" / "workflows" / "ci.yml").read_text()

    def test_unknown_platform_composes_stack_only(self, payload, target, tmp_path, valid_profile, capsys):
        # jenkins has no CI/CD pack, but csharp still resolves the stack pack: partial compose.
        bad = {**valid_profile, "stack": {**valid_profile["stack"], "ci_cd": {"platform": "jenkins"}}}
        rc = install(payload, target, force=False, profile_path=_profile_file(tmp_path, bad))
        assert rc == 0
        err = capsys.readouterr().err
        assert "no CI/CD pack" in err
        assert (target / ".claude" / "rules" / "clean-architecture.md").is_file()  # stack pack ran
        assert "PLACEHOLDER" in (target / ".github" / "workflows" / "ci.yml").read_text()  # core, unshadowed

    def test_no_packs_at_all_is_core_with_warnings(self, payload, target, tmp_path, valid_profile, capsys):
        bad = {**valid_profile, "stack": {"backend": {"language": "go", "framework": "gin"},
                                          "ci_cd": {"platform": "gitlab-ci"}}}
        rc = install(payload, target, force=False, profile_path=_profile_file(tmp_path, bad))
        assert rc == 0
        err = capsys.readouterr().err
        assert "no stack pack" in err and "no CI/CD pack" in err
        assert "{{STACK}}" in (target / "CLAUDE.md").read_text()  # unfilled — nothing composed


# ── fail-closed resolution (real breakage, not "pack not built yet") ─────────────

class TestFailClosed:
    def test_missing_pack_dir(self, tmp_path, target, valid_profile, capsys):
        payload = make_payload(tmp_path, cicd_present=False)
        rc = install(payload, target, force=False, profile_path=_profile_file(tmp_path, valid_profile))
        assert rc == 2
        assert "not found" in capsys.readouterr().err

    def test_incompatible_pair(self, tmp_path, target, valid_profile, capsys):
        payload = make_payload(tmp_path, stack_requires_cicd=["azure-devops"])  # excludes github
        rc = install(payload, target, force=False, profile_path=_profile_file(tmp_path, valid_profile))
        assert rc == 2
        assert "does not support CI/CD pack" in capsys.readouterr().err

    def test_invalid_profile(self, payload, target, tmp_path, capsys):
        bad = _profile_file(tmp_path, {"company": {"name": "x"}})  # missing required fields
        rc = install(payload, target, force=False, profile_path=bad)
        assert rc == 2
        assert "validation" in capsys.readouterr().err


# ── fail-closed MISS (a mapped source absent from the payload/pack is breakage) ──

class TestFailClosedMiss:
    def test_missing_core_file_fails_closed_and_reports_all(self, tmp_path, target, capsys):
        payload = make_payload(tmp_path)
        (payload / "HARNESS.md").unlink()
        (payload / "spec-template.md").unlink()
        rc = install(payload, target, force=False)
        assert rc == 2
        cap = capsys.readouterr()
        assert "MISS    HARNESS.md" in cap.out                # every miss still printed
        assert "MISS    spec-template.md" in cap.out
        assert "ERROR:" in cap.err
        assert "HARNESS.md" in cap.err and "spec-template.md" in cap.err  # all, not just the first

    def test_missing_dir_map_source_fails_closed(self, tmp_path, target, capsys):
        payload = make_payload(tmp_path)
        shutil.rmtree(payload / "hooks")
        rc = install(payload, target, force=False)
        assert rc == 2
        assert "hooks/" in capsys.readouterr().err

    def test_missing_pack_overlay_src_fails_closed(self, tmp_path, target, valid_profile, capsys):
        payload = make_payload(tmp_path)
        (payload / "packs" / "stacks" / "dotnet" / "rules" / "testing.md").unlink()
        rc = install(payload, target, force=False, profile_path=_profile_file(tmp_path, valid_profile))
        assert rc == 2
        err = capsys.readouterr().err
        assert "ERROR:" in err and "rules/testing.md" in err

    def test_unmapped_payload_file_is_still_optional(self, tmp_path, target):
        # A payload file deliberately absent from every map installs nowhere — and that is fine.
        payload = make_payload(tmp_path)
        _write(payload / "unmapped-notes.md", "# not in any map\n")
        rc = install(payload, target, force=False)
        assert rc == 0
        assert not (target / "unmapped-notes.md").exists()


# ── error contract (every InstallError -> clean "ERROR:" + rc 2, never a traceback) ──

class TestErrorContract:
    def test_merge_into_missing_dest_is_clean_error(self, payload, target, tmp_path, valid_profile, capsys):
        sp = payload / "packs" / "stacks" / "dotnet"
        manifest = yaml.safe_load((sp / "pack.yaml").read_text(encoding="utf-8"))
        manifest["overlays"].append(
            {"src": "mcp.fragment.json", "dest": ".claude/never-shipped.json", "merge": True})
        (sp / "pack.yaml").write_text(yaml.dump(manifest), encoding="utf-8")
        rc = install(payload, target, force=False, profile_path=_profile_file(tmp_path, valid_profile))
        assert rc == 2
        err = capsys.readouterr().err
        assert "ERROR:" in err and "cannot merge" in err

    @pytest.mark.parametrize("field,value", [
        ("stack", "csharp"),
        ("stack", ["backend"]),
        ("company", "acme"),
        ("quality", [80]),
        ("tools", "gitnexus"),
    ])
    def test_malformed_section_shape_is_clean_error(
        self, payload, target, tmp_path, valid_profile, field, value, capsys
    ):
        bad = {**valid_profile, field: value}
        rc = install(payload, target, force=False, profile_path=_profile_file(tmp_path, bad))
        assert rc == 2
        err = capsys.readouterr().err
        assert "ERROR:" in err and field in err


# ── idempotency ────────────────────────────────────────────────────────────────

class TestIdempotency:
    def test_second_run_skips_and_preserves_adaptation(self, payload, target, tmp_path, valid_profile):
        pf = _profile_file(tmp_path, valid_profile)
        install(payload, target, force=False, profile_path=pf)
        # simulate a Phase-3 adaptation of the (now realized) stack section
        claude = target / "CLAUDE.md"
        claude.write_text(claude.read_text(encoding="utf-8").replace(
            "xUnit, 80% floor", "xUnit, 80% floor, and our house rule about TimeProvider"),
            encoding="utf-8")
        rc = install(payload, target, force=False, profile_path=pf)
        assert rc == 0
        assert "house rule about TimeProvider" in claude.read_text(encoding="utf-8")

    def test_force_reoverwrites(self, payload, target, tmp_path, valid_profile):
        pf = _profile_file(tmp_path, valid_profile)
        install(payload, target, force=False, profile_path=pf)
        ci = target / ".github" / "workflows" / "ci.yml"
        ci.write_text("hand edit\n", encoding="utf-8")
        install(payload, target, force=True, profile_path=pf)
        assert "realized github pack ci" in ci.read_text(encoding="utf-8")


# ── splice scope (the stack section only — never the content around it) ─────────

SDLC_SECTION = "## SDLC lifecycle\n\nManaged by /sdlc-setup. Phases live in .sdlc/state.yaml.\n"


class TestSpliceScope:
    """The splice must replace ONLY the stack-standards section (heading to the next '## '
    heading, or EOF). Content appended below it — e.g. the SDLC section /sdlc-setup Step 6
    adds — must survive every re-run."""

    def _append_sdlc(self, target):
        claude = target / "CLAUDE.md"
        claude.write_text(claude.read_text(encoding="utf-8") + "\n" + SDLC_SECTION,
                          encoding="utf-8")

    def test_core_then_profile_rerun_preserves_appended_section(
        self, payload, target, tmp_path, valid_profile
    ):
        # Path A: core-only install, setup appends an SDLC section, a later --profile re-run
        # splices (the {{STACK}} marker survives in the heading) — the SDLC section must survive.
        install(payload, target, force=False)
        self._append_sdlc(target)
        rc = install(payload, target, force=False, profile_path=_profile_file(tmp_path, valid_profile))
        assert rc == 0
        claude = (target / "CLAUDE.md").read_text(encoding="utf-8")
        assert "## SDLC lifecycle" in claude                             # appended section survives
        assert "Phases live in .sdlc/state.yaml." in claude
        assert claude.count(".NET 10 / Microsoft Agent Framework") == 1  # spliced exactly once
        assert "{{STACK}}" not in claude                                 # section itself realized

    def test_force_splice_preserves_content_below_section(self, payload, target):
        # Path B: a --force splice fires even on an adapted section; content below must survive.
        _write(target / "CLAUDE.md",
               "# repo\n\n## Stack standards — .NET (adapted, marker gone)\n\n- house rules\n\n"
               + SDLC_SECTION)
        log: list[str] = []
        _splice_claude_stack_section(payload / "packs" / "stacks" / "dotnet", STACK_PACK_YAML,
                                     target, force=True, log=log)
        text = (target / "CLAUDE.md").read_text(encoding="utf-8")
        assert any(line.startswith("SPLICE") for line in log)
        assert "## SDLC lifecycle" in text                               # tail survives the splice
        assert "Phases live in .sdlc/state.yaml." in text
        assert text.count(".NET 10 / Microsoft Agent Framework") == 1
        assert "house rules" not in text                                 # old section body replaced

    def test_content_above_section_preserved(self, payload, target, tmp_path, valid_profile):
        install(payload, target, force=False)
        self._append_sdlc(target)
        install(payload, target, force=False, profile_path=_profile_file(tmp_path, valid_profile))
        claude = (target / "CLAUDE.md").read_text(encoding="utf-8")
        assert claude.startswith("# {{PROJECT_NAME}}")
        assert "## What this is" in claude

    def test_force_splice_with_tail_is_idempotent(self, payload, target):
        pack_dir = payload / "packs" / "stacks" / "dotnet"
        _write(target / "CLAUDE.md",
               "# repo\n\n## Stack standards — {{STACK}} profile\n\n- placeholder\n\n" + SDLC_SECTION)
        _splice_claude_stack_section(pack_dir, STACK_PACK_YAML, target, force=True, log=[])
        first = (target / "CLAUDE.md").read_text(encoding="utf-8")
        _splice_claude_stack_section(pack_dir, STACK_PACK_YAML, target, force=True, log=[])
        second = (target / "CLAUDE.md").read_text(encoding="utf-8")
        assert first == second                                           # run twice -> identical file
        assert "## SDLC lifecycle" in second
        assert second.count(".NET 10 / Microsoft Agent Framework") == 1

    def test_force_splice_last_section_is_idempotent(self, payload, target):
        # Stack section is the LAST section (empty tail): no spurious newlines, no duplication.
        pack_dir = payload / "packs" / "stacks" / "dotnet"
        _write(target / "CLAUDE.md", "# repo\n\n## Stack standards — {{STACK}} profile\n\n- placeholder\n")
        _splice_claude_stack_section(pack_dir, STACK_PACK_YAML, target, force=True, log=[])
        first = (target / "CLAUDE.md").read_text(encoding="utf-8")
        _splice_claude_stack_section(pack_dir, STACK_PACK_YAML, target, force=True, log=[])
        second = (target / "CLAUDE.md").read_text(encoding="utf-8")
        assert first == second
        assert second.count(".NET 10 / Microsoft Agent Framework") == 1
        assert second.endswith(".claude/rules/testing.md.\n")            # single trailing newline

    def test_missing_heading_skips_and_leaves_file_untouched(
        self, payload, target, tmp_path, valid_profile, capsys
    ):
        install(payload, target, force=False)
        no_heading = "# repo\n\n## Something else\n\ncontent\n"
        (target / "CLAUDE.md").write_text(no_heading, encoding="utf-8")
        rc = install(payload, target, force=False, profile_path=_profile_file(tmp_path, valid_profile))
        assert rc == 0
        assert (target / "CLAUDE.md").read_text(encoding="utf-8") == no_heading
        assert "no '## Stack standards' heading" in capsys.readouterr().out


# ── tools axis (third, multi-select, self-installing) ───────────────────────────

class TestTools:
    def _with_tools(self, valid_profile, tools):
        return {**valid_profile, "tools": tools}

    def test_tools_pack_overlays_static_files(self, payload, target, tmp_path, valid_profile):
        pf = _profile_file(tmp_path, self._with_tools(valid_profile, ["gitnexus"]))
        rc = install(payload, target, force=False, profile_path=pf)
        assert rc == 0
        assert (target / ".gitnexusignore").is_file()
        assert (target / ".claude" / "tools" / "gitnexus" / "SETUP.md").is_file()

    def test_manual_setup_printed(self, payload, target, tmp_path, valid_profile, capsys):
        pf = _profile_file(tmp_path, self._with_tools(valid_profile, ["gitnexus"]))
        install(payload, target, force=False, profile_path=pf)
        out = capsys.readouterr().out
        assert "MANUAL SETUP" in out
        assert "npx gitnexus analyze" in out
        assert ".claude/tools/gitnexus/SETUP.md" in out

    def test_tools_compose_independently_of_stack_cicd(self, payload, target, tmp_path, valid_profile, capsys):
        # unmapped stack + platform (core-only on those axes) but a valid tools pack still overlays.
        bad = {**valid_profile,
               "stack": {"backend": {"language": "go", "framework": "gin"},
                         "ci_cd": {"platform": "gitlab-ci"}},
               "tools": ["gitnexus"]}
        rc = install(payload, target, force=False, profile_path=_profile_file(tmp_path, bad))
        assert rc == 0
        assert (target / ".gitnexusignore").is_file()          # tools axis composed
        assert not (target / ".claude" / "rules" / "clean-architecture.md").exists()  # stack did not

    def test_unknown_tool_warns_and_skips(self, payload, target, tmp_path, valid_profile, capsys):
        pf = _profile_file(tmp_path, self._with_tools(valid_profile, ["gitnexus", "nonexistent"]))
        rc = install(payload, target, force=False, profile_path=pf)
        assert rc == 0
        err = capsys.readouterr().err
        assert "no tools pack 'nonexistent'" in err
        assert (target / ".gitnexusignore").is_file()          # the good one still composed

    def test_no_tools_key_is_noop(self, payload, target, tmp_path, valid_profile, capsys):
        install(payload, target, force=False, profile_path=_profile_file(tmp_path, valid_profile))
        assert not (target / ".gitnexusignore").exists()
        assert "MANUAL SETUP" not in capsys.readouterr().out


class TestFrontend:
    def test_declared_frontend_installs_generic_reviewer(self, payload, target, tmp_path, valid_profile, capsys):
        # valid_profile declares angular-17, which has no pack yet -> generic + warning.
        rc = install(payload, target, force=False, profile_path=_profile_file(tmp_path, valid_profile))
        assert rc == 0
        agent = (target / ".claude" / "agents" / "ux-reviewer.md").read_text(encoding="utf-8")
        assert "generic ux reviewer" in agent
        assert "no frontend pack for framework 'angular'" in capsys.readouterr().err

    def test_react_framework_overlays_generic(self, payload, target, tmp_path, valid_profile):
        prof = {**valid_profile, "stack": {**valid_profile["stack"],
                                           "frontend": {"language": "typescript", "framework": "React 18"}}}
        install(payload, target, force=False, profile_path=_profile_file(tmp_path, prof))
        agent = (target / ".claude" / "agents" / "ux-reviewer.md").read_text(encoding="utf-8")
        assert "React ux reviewer" in agent          # framework pack wins (last overlay)
        assert "generic ux reviewer" not in agent

    def test_no_frontend_block_installs_no_reviewer(self, payload, target, tmp_path, valid_profile):
        prof = {**valid_profile, "stack": {k: v for k, v in valid_profile["stack"].items()
                                           if k != "frontend"}}
        install(payload, target, force=False, profile_path=_profile_file(tmp_path, prof))
        assert not (target / ".claude" / "agents" / "ux-reviewer.md").exists()


class TestResolveFrontend:
    def test_react_resolves_generic_then_react(self, payload, valid_profile):
        prof = {**valid_profile, "stack": {**valid_profile["stack"],
                                           "frontend": {"framework": "react-18"}}}
        resolved, warnings = _resolve_frontend(prof, payload)
        assert [d.name for d, _ in resolved] == ["generic", "react"]
        assert warnings == []

    def test_unmapped_framework_degrades_to_generic(self, payload, valid_profile):
        prof = {**valid_profile, "stack": {**valid_profile["stack"],
                                           "frontend": {"framework": "vue"}}}
        resolved, warnings = _resolve_frontend(prof, payload)
        assert [d.name for d, _ in resolved] == ["generic"]
        assert len(warnings) == 1 and "vue" in warnings[0]

    def test_absent_frontend_resolves_nothing(self, payload, valid_profile):
        prof = {**valid_profile, "stack": {k: v for k, v in valid_profile["stack"].items()
                                           if k != "frontend"}}
        resolved, warnings = _resolve_frontend(prof, payload)
        assert resolved == [] and warnings == []

    def _with_framework(self, valid_profile, raw):
        return {**valid_profile, "stack": {**valid_profile["stack"],
                                           "frontend": {"framework": raw}}}

    @pytest.mark.parametrize("raw", ["react", "reactjs", "react.js", "React 18", "react-18",
                                     "react@18.2", "React.js"])
    def test_react_alias_forms_resolve_react_pack(self, payload, valid_profile, raw):
        resolved, warnings = _resolve_frontend(self._with_framework(valid_profile, raw), payload)
        assert [d.name for d, _ in resolved] == ["generic", "react"]
        assert warnings == []

    def test_react_native_never_matches_react_pack(self, payload, valid_profile):
        resolved, warnings = _resolve_frontend(
            self._with_framework(valid_profile, "react-native"), payload)
        assert [d.name for d, _ in resolved] == ["generic"]     # degrade, not the React WEB pack
        assert len(warnings) == 1 and "react-native" in warnings[0]

    def test_react_native_with_version_still_degrades(self, payload, valid_profile):
        resolved, warnings = _resolve_frontend(
            self._with_framework(valid_profile, "React Native 0.73"), payload)
        assert [d.name for d, _ in resolved] == ["generic"]
        assert len(warnings) == 1 and "react-native" in warnings[0]

    def test_preact_degrades_to_generic(self, payload, valid_profile):
        resolved, warnings = _resolve_frontend(self._with_framework(valid_profile, "preact"), payload)
        assert [d.name for d, _ in resolved] == ["generic"]     # never fuzzy-matched to react
        assert len(warnings) == 1 and "preact" in warnings[0]


class TestResolveTools:
    def test_resolves_gitnexus(self, payload, valid_profile):
        resolved, warnings = _resolve_tools({**valid_profile, "tools": ["gitnexus"]}, payload)
        assert len(resolved) == 1 and resolved[0][0].name == "gitnexus"
        assert warnings == []

    def test_missing_id_warns_not_raises(self, payload, valid_profile):
        resolved, warnings = _resolve_tools({**valid_profile, "tools": ["nope"]}, payload)
        assert resolved == []
        assert any("no tools pack 'nope'" in w for w in warnings)

    def test_non_list_tools_warns(self, payload, valid_profile):
        resolved, warnings = _resolve_tools({**valid_profile, "tools": "gitnexus"}, payload)
        assert resolved == []
        assert any("must be a list" in w for w in warnings)

    def test_absent_tools_key_empty(self, payload, valid_profile):
        resolved, warnings = _resolve_tools(valid_profile, payload)
        assert resolved == [] and warnings == []


# ── merge helper ───────────────────────────────────────────────────────────────

class TestDeepMerge:
    def test_lists_concat_and_dedup(self):
        assert _deep_merge({"a": [1, 2]}, {"a": [2, 3]}) == {"a": [1, 2, 3]}

    def test_nested_dicts(self):
        merged = _deep_merge({"p": {"allow": ["x"]}}, {"p": {"allow": ["y"], "ask": ["z"]}})
        assert merged == {"p": {"allow": ["x", "y"], "ask": ["z"]}}

    def test_drops_comment_keys(self):
        assert _deep_merge({"a": 1}, {"//": "note", "b": 2}) == {"a": 1, "b": 2}

    def test_scalar_overlay_wins(self):
        assert _deep_merge({"a": 1}, {"a": 2}) == {"a": 2}

    def test_nested_comment_keys_stripped_in_overlay_only_subtree(self):
        merged = _deep_merge({}, {"a": {"//": "note", "b": {"//": "nested note", "c": 1}}})
        assert merged == {"a": {"b": {"c": 1}}}

    def test_nested_comment_keys_stripped_in_base_only_subtree(self):
        merged = _deep_merge({"a": {"//": "note", "b": 1}}, {})
        assert merged == {"a": {"b": 1}}


class TestEnsureGitignore:
    def test_preexisting_entry_without_trailing_slash_not_duplicated(self, payload, target):
        (target / ".gitignore").write_text(".claude/.review-receipts\n", encoding="utf-8")
        install(payload, target, force=False)
        lines = [ln.strip() for ln in (target / ".gitignore").read_text(encoding="utf-8").splitlines()]
        receipts = [ln for ln in lines if ln.rstrip("/") == ".claude/.review-receipts"]
        assert len(receipts) == 1                                # no near-duplicate appended
        assert ".claude/settings.local.json" in lines            # the genuinely-missing line added

    def test_all_entries_present_is_noop(self, payload, target):
        content = ".claude/.review-receipts/\n.claude/settings.local.json\n"
        (target / ".gitignore").write_text(content, encoding="utf-8")
        install(payload, target, force=False)
        assert (target / ".gitignore").read_text(encoding="utf-8") == content


# ── install manifest (.claude/harness-manifest.json) ────────────────────────────

MANIFEST_REL = ".claude/harness-manifest.json"


def _read_manifest(target: Path) -> dict:
    return json.loads((target / MANIFEST_REL).read_text(encoding="utf-8"))


def _sha(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


class TestManifest:
    """A successful run ends by recording the composed PRISTINE state (final on-disk hash of
    every dest it touched) so upgrade_harness.py can three-way classify later."""

    def test_full_profile_install_records_correct_hashes(self, payload, target, tmp_path, valid_profile):
        rc = install(payload, target, force=False, profile_path=_profile_file(tmp_path, valid_profile))
        assert rc == 0
        m = _read_manifest(target)
        assert m["manifest_version"] == 1
        for rel in ("CLAUDE.md", ".claude/rules/testing.md", ".github/workflows/ci.yml"):
            assert m["files"][rel] == _sha(target / rel)  # recomputed from final content

    def test_profile_id_and_packs_recorded(self, payload, target, tmp_path, valid_profile):
        install(payload, target, force=False, profile_path=_profile_file(tmp_path, valid_profile))
        m = _read_manifest(target)
        assert m["profile_id"] == "test-profile"
        assert m["packs"] == ["stacks/dotnet", "cicd/github", "frontend/generic"]

    def test_core_only_profile_id_null_and_no_packs(self, payload, target):
        install(payload, target, force=False)
        m = _read_manifest(target)
        assert m["profile_id"] is None
        assert m["packs"] == []

    def test_plugin_version_read_from_plugin_json(self, tmp_path, target):
        payload = make_payload(tmp_path)
        _write(tmp_path / ".claude-plugin" / "plugin.json", json.dumps({"version": "9.9.9"}) + "\n")
        install(payload, target, force=False)
        assert _read_manifest(target)["plugin_version"] == "9.9.9"

    def test_plugin_version_unknown_when_absent(self, payload, target):
        install(payload, target, force=False)
        assert _read_manifest(target)["plugin_version"] == "unknown"

    def test_merged_mcp_hash_reflects_merged_content(self, payload, target, tmp_path, valid_profile):
        install(payload, target, force=False, profile_path=_profile_file(tmp_path, valid_profile))
        mcp = target / ".mcp.json"
        assert "microsoft-learn" in mcp.read_text(encoding="utf-8")  # fragments really merged
        assert _read_manifest(target)["files"][".mcp.json"] == _sha(mcp)

    def test_merged_preexisting_dest_is_recorded_even_though_copy_skipped(
        self, payload, target, tmp_path, valid_profile
    ):
        # core copy SKIPs the pre-existing .mcp.json, but the pack fragments still MERGE into
        # it — a merged dest is touched and must land in the manifest with its merged hash.
        own = {"mcpServers": {"team-custom": {"type": "http", "url": "https://example.test/mcp"}}}
        (target / ".mcp.json").write_text(json.dumps(own), encoding="utf-8")
        install(payload, target, force=False, profile_path=_profile_file(tmp_path, valid_profile))
        assert _read_manifest(target)["files"][".mcp.json"] == _sha(target / ".mcp.json")

    def test_skipped_preexisting_file_not_recorded(self, payload, target):
        _write(target / "specs" / "spec-template.md", "# my own template\n")
        install(payload, target, force=False)
        assert "specs/spec-template.md" not in _read_manifest(target)["files"]

    def test_manifest_never_lists_itself(self, payload, target, tmp_path, valid_profile):
        install(payload, target, force=False, profile_path=_profile_file(tmp_path, valid_profile))
        install(payload, target, force=False, profile_path=_profile_file(tmp_path, valid_profile))
        assert MANIFEST_REL not in _read_manifest(target)["files"]  # even on a re-run

    def test_rerun_preserves_entries_for_untouched_dests(self, payload, target, tmp_path, valid_profile):
        pf = _profile_file(tmp_path, valid_profile)
        install(payload, target, force=False, profile_path=pf)
        first = _read_manifest(target)
        # Phase-3 adaptation: the re-run SKIPs this dest, so its PRISTINE hash must survive
        # (never rehashed from the adapted content — that is what makes ADAPTED detectable).
        (target / ".claude" / "rules" / "testing.md").write_text("# adapted\n", encoding="utf-8")
        rc = install(payload, target, force=False, profile_path=pf)
        assert rc == 0
        second = _read_manifest(target)
        assert second["files"][".claude/rules/testing.md"] == first["files"][".claude/rules/testing.md"]
        assert set(second["files"]) == set(first["files"])  # nothing dropped, nothing new

    def test_manifest_log_line_printed(self, payload, target, capsys):
        install(payload, target, force=False)
        out = capsys.readouterr().out
        assert "MANIFEST .claude/harness-manifest.json (" in out
        assert " files)" in out


class TestResolvePacks:
    def test_resolves_dotnet_github(self, payload, valid_profile):
        stack_pack, cicd_pack, warnings = _resolve_packs(valid_profile, payload)
        (sd, sm), (cd, cm) = stack_pack, cicd_pack
        assert sd.name == "dotnet" and cd.name == "github"
        assert sm["pack"]["id"] == "dotnet" and cm["pack"]["id"] == "github"
        assert warnings == []

    def test_unknown_language_degrades_not_raises(self, payload, valid_profile):
        bad = {**valid_profile, "stack": {"backend": {"language": "go", "framework": "gin"},
                                          "ci_cd": {"platform": "github-actions"}}}
        stack_pack, cicd_pack, warnings = _resolve_packs(bad, payload)
        assert stack_pack is None                # no go pack
        assert cicd_pack is not None             # github pack still resolves
        assert any("no stack pack" in w for w in warnings)

    def test_missing_pack_dir_still_raises(self, tmp_path, valid_profile):
        payload = make_payload(tmp_path, cicd_present=False)  # github mapped but absent from payload
        with pytest.raises(InstallError, match="not found"):
            _resolve_packs(valid_profile, payload)
