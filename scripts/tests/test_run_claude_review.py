"""Behavior tests for the ADO pack's run-claude-review.sh (Fold E) — the SHIPPED script.

The script is the one place gate auth happens, so these pin its two-mode contract:

  * api-key mode (default): byte-for-byte the original behavior — no ANTHROPIC_API_KEY, exit 3
    with the original message; with a key, the CLI runs.
  * foundry mode (CLAUDE_CODE_USE_FOUNDRY=1): no key required; fails CLOSED on a missing
    resource or a missing deployment pin for the alias in MODEL (the spike proved Foundry has
    no alias auto-resolution); unresolved Azure-DevOps $(macro) literals are treated as unset.

The CLI itself is stubbed: a fake `npx` first on PATH captures its environment and argv, so the
tests assert exactly what would reach the real @anthropic-ai/claude-code — no network, no key.
"""

import os
import shutil
import subprocess
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = _REPO_ROOT / "harness" / "packs" / "cicd" / "azure-devops" / "scripts" / "run-claude-review.sh"


def _bash() -> str | None:
    """Git Bash on Windows, never the System32 WSL shim (see test_review_gate_hook)."""
    if os.name != "nt":
        return shutil.which("bash")
    for var in ("ProgramFiles", "ProgramFiles(x86)"):
        base = os.environ.get(var)
        if base and (Path(base) / "Git" / "bin" / "bash.exe").is_file():
            return str(Path(base) / "Git" / "bin" / "bash.exe")
    git = shutil.which("git")
    if git:
        cand = Path(git).parent.parent / "bin" / "bash.exe"
        if cand.is_file():
            return str(cand)
    found = shutil.which("bash")
    return None if found and "system32" in found.lower() else found


BASH = _bash()
needs_sh = pytest.mark.skipif(BASH is None, reason="needs bash (Git Bash on Windows)")


@pytest.fixture
def rig(tmp_path):
    """A fake-npx rig: `npx` first on PATH dumps its env to a file and emits a comment body.
    A no-op `node` shim rides along so the script's node-presence check never depends on the
    host. newline="\\n" pins LF — a CRLF shim mis-executes under Git Bash on Windows, the exact
    class .gitattributes fixed for checked-in scripts (these are written at runtime)."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    env_capture = tmp_path / "npx-env.txt"
    shim = bin_dir / "npx"
    shim.write_text(
        "#!/usr/bin/env bash\n"
        f"env > '{env_capture.as_posix()}'\n"
        "echo 'stub review body'\n",
        encoding="utf-8", newline="\n",
    )
    shim.chmod(0o755)
    node = bin_dir / "node"
    node.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8", newline="\n")
    node.chmod(0o755)
    return bin_dir, env_capture, tmp_path


def _run(rig_tuple, extra_env: dict) -> tuple[int, str, dict]:
    """Run the shipped script with the rig's PATH and the base contract env; returns
    (rc, stderr, captured-npx-env or {})."""
    bin_dir, env_capture, tmp_path = rig_tuple
    comment = tmp_path / "comment.md"
    env = {k: v for k, v in os.environ.items()
           if not k.startswith(("ANTHROPIC_", "CLAUDE_"))}
    env["PATH"] = f"{bin_dir}{os.pathsep}{env['PATH']}"
    env.update({
        "PROMPT": "p", "MODEL": "sonnet", "MAX_TURNS": "5",
        "ALLOWED_TOOLS": "Read", "COMMENT_FILE": str(comment),
    })
    env.update(extra_env)
    p = subprocess.run([BASH, str(SCRIPT)], capture_output=True, text=True,
                       env=env, cwd=tmp_path, timeout=60)
    captured: dict = {}
    if env_capture.exists():
        for line in env_capture.read_text(encoding="utf-8").splitlines():
            k, _, v = line.partition("=")
            captured[k] = v
    return p.returncode, p.stderr, captured


@needs_sh
class TestApiKeyModeUnchanged:
    def test_no_key_exits_3_with_the_original_message(self, rig):
        rc, err, captured = _run(rig, {})
        assert rc == 3
        assert "ANTHROPIC_API_KEY is not set" in err
        assert not captured, "the CLI must not run without auth"

    def test_with_key_the_cli_runs_and_foundry_stays_off(self, rig):
        rc, err, captured = _run(rig, {"ANTHROPIC_API_KEY": "k"})
        assert rc == 0, err
        assert captured.get("ANTHROPIC_API_KEY") == "k"
        assert captured.get("CLAUDE_CODE_USE_FOUNDRY", "") != "1"

    def test_an_unresolved_foundry_macro_literal_is_not_foundry_mode(self, rig):
        """An ADO pipeline without the foundry variables passes the literal '$(...)' through.
        That must read as OFF — otherwise every api-key pipeline breaks the day this ships."""
        rc, err, _ = _run(rig, {"CLAUDE_CODE_USE_FOUNDRY": "$(CLAUDE_CODE_USE_FOUNDRY)"})
        assert rc == 3
        assert "ANTHROPIC_API_KEY is not set" in err

    def test_the_macro_literal_flag_is_scrubbed_from_the_cli_env_too(self, rig):
        """Mode selection alone isn't enough: the CLI must not SEE the literal either. An
        unscrubbed '$(CLAUDE_CODE_USE_FOUNDRY)' is JS-truthy — it could flip the CLI itself
        into foundry mode with no config while the script validated the api-key path."""
        rc, _, captured = _run(rig, {"ANTHROPIC_API_KEY": "k",
                                     "CLAUDE_CODE_USE_FOUNDRY": "$(CLAUDE_CODE_USE_FOUNDRY)"})
        assert rc == 0
        assert captured.get("CLAUDE_CODE_USE_FOUNDRY", "") == ""


@needs_sh
class TestFoundryMode:
    FOUNDRY = {
        "CLAUDE_CODE_USE_FOUNDRY": "1",
        "ANTHROPIC_FOUNDRY_RESOURCE": "my-foundry",
        "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-5",
        "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-4-8",
    }

    def test_runs_keyless_and_passes_the_foundry_env_through(self, rig):
        rc, err, captured = _run(rig, self.FOUNDRY)
        assert rc == 0, err
        assert captured.get("CLAUDE_CODE_USE_FOUNDRY") == "1"
        assert captured.get("ANTHROPIC_FOUNDRY_RESOURCE") == "my-foundry"
        assert captured.get("ANTHROPIC_DEFAULT_SONNET_MODEL") == "claude-sonnet-5"
        assert "ANTHROPIC_API_KEY is not set" not in err

    def test_missing_resource_fails_closed(self, rig):
        rc, err, captured = _run(rig, {"CLAUDE_CODE_USE_FOUNDRY": "1",
                                       "ANTHROPIC_DEFAULT_SONNET_MODEL": "x"})
        assert rc == 3
        assert "ANTHROPIC_FOUNDRY_RESOURCE" in err
        assert not captured

    def test_missing_pin_for_the_alias_in_use_fails_closed(self, rig):
        """MODEL=opus with only the sonnet pin set: Foundry cannot resolve the opus alias, so
        running would produce a fail-closed gate with an opaque API error instead of this
        actionable one."""
        env = dict(self.FOUNDRY)
        env.pop("ANTHROPIC_DEFAULT_OPUS_MODEL")
        env["MODEL"] = "opus"
        rc, err, captured = _run(rig, env)
        assert rc == 3
        assert "ANTHROPIC_DEFAULT_OPUS_MODEL" in err
        assert not captured

    def test_the_other_alias_pin_is_not_demanded(self, rig):
        """MODEL=sonnet must not demand the opus pin — a sonnet-only gate (the grader) should
        configure only what it uses."""
        env = dict(self.FOUNDRY)
        env.pop("ANTHROPIC_DEFAULT_OPUS_MODEL")
        rc, err, _ = _run(rig, env)
        assert rc == 0, err

    def test_macro_literal_token_is_scrubbed_and_chain_fallback_announced(self, rig):
        """When the mint step didn't run, $(FOUNDRY_AUTH_TOKEN) arrives as a literal. The CLI
        must not receive it; the script announces the credential-chain fallback instead."""
        env = dict(self.FOUNDRY)
        env["ANTHROPIC_FOUNDRY_AUTH_TOKEN"] = "$(FOUNDRY_AUTH_TOKEN)"
        rc, err, captured = _run(rig, env)
        assert rc == 0, err
        assert captured.get("ANTHROPIC_FOUNDRY_AUTH_TOKEN", "") == ""
        assert "credential" in err and "chain" in err

    def test_a_real_token_reaches_the_cli(self, rig):
        env = dict(self.FOUNDRY)
        env["ANTHROPIC_FOUNDRY_AUTH_TOKEN"] = "eyJ-token"
        rc, _, captured = _run(rig, env)
        assert rc == 0
        assert captured.get("ANTHROPIC_FOUNDRY_AUTH_TOKEN") == "eyJ-token"

    def test_base_url_only_config_is_accepted(self, rig):
        """ANTHROPIC_FOUNDRY_BASE_URL is the documented alternative to the resource name."""
        env = {k: v for k, v in self.FOUNDRY.items() if k != "ANTHROPIC_FOUNDRY_RESOURCE"}
        env["ANTHROPIC_FOUNDRY_BASE_URL"] = "https://my.services.ai.azure.com/anthropic"
        rc, err, captured = _run(rig, env)
        assert rc == 0, err
        assert captured.get("ANTHROPIC_FOUNDRY_BASE_URL", "").startswith("https://")

    def test_a_resource_key_reaches_the_cli_and_quiets_the_chain_warning(self, rig):
        """ANTHROPIC_FOUNDRY_API_KEY is the key-based foundry fallback — with it set, the
        credential-chain fallback warning must not fire (warn only when NEITHER is present)."""
        env = dict(self.FOUNDRY)
        env["ANTHROPIC_FOUNDRY_API_KEY"] = "resource-key"
        rc, err, captured = _run(rig, env)
        assert rc == 0
        assert captured.get("ANTHROPIC_FOUNDRY_API_KEY") == "resource-key"
        assert "credential" not in err

    def test_a_leftover_key_macro_literal_is_scrubbed_in_foundry_mode(self, rig):
        """A dropped variable group leaves ANTHROPIC_API_KEY as '$(ANTHROPIC_API_KEY)' — the
        CLI must not see that literal as a credential."""
        env = dict(self.FOUNDRY)
        env["ANTHROPIC_API_KEY"] = "$(ANTHROPIC_API_KEY)"
        rc, _, captured = _run(rig, env)
        assert rc == 0
        assert captured.get("ANTHROPIC_API_KEY", "") == ""
