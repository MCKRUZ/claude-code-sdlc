"""Every `az` argv the provider issues is one the installed CLI accepts (code-host providers).

Help text only — no network, no login, nothing created. Skips cleanly unless `az` AND the
azure-devops extension are present (CI runners ship neither; see the design's CI note), with the
two environment variables set so az can neither install the extension on the fly nor phone home.
What this proves is narrow and worth having: a flag name in `ado_import.AZ_CONTRACT` that the
real CLI does not know would otherwise be found by the first person to click the button.
"""

import os
import shutil
import subprocess

import pytest

import ado_import

AZ_ENV = {**os.environ, "AZURE_EXTENSION_USE_DYNAMIC_INSTALL": "no", "AZURE_CORE_COLLECT_TELEMETRY": "no"}


def _az(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run([shutil.which("az") or "az", *args, "--only-show-errors"],
                          capture_output=True, text=True, encoding="utf-8", errors="replace",
                          env=AZ_ENV, timeout=120, check=False)


def _extension_present() -> bool:
    if shutil.which("az") is None:
        return False
    try:
        return _az(["extension", "show", "--name", "azure-devops", "-o", "json"]).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


pytestmark = pytest.mark.skipif(not _extension_present(),
                                reason="az with the azure-devops extension is not installed; help text cannot be read")


def _command_words(argv: list[str]) -> list[str]:
    words = []
    for a in argv:
        if a.startswith("-"):
            break
        words.append(a)
    return words


_HELP_CACHE: dict[tuple[str, ...], str] = {}


def _help(words: list[str]) -> str:
    key = tuple(words)
    if key not in _HELP_CACHE:
        proc = _az([*words, "--help"])
        _HELP_CACHE[key] = proc.stdout + proc.stderr
    return _HELP_CACHE[key]


# Global az flags are documented under `az --help`, not per command.
GLOBAL_FLAGS = {"-o", "--output", "--query", "--only-show-errors", "--help", "--debug", "--verbose"}


@pytest.mark.parametrize("argv", ado_import.AZ_CONTRACT, ids=lambda a: " ".join(_command_words(a)))
def test_every_flag_in_the_contract_appears_in_local_help(argv):
    words = _command_words(argv)
    text = _help(words)
    assert words[-1] in text, f"`az {' '.join(words)} --help` did not describe the command"
    flags = [a for a in argv if a.startswith("-") and a not in GLOBAL_FLAGS]
    missing = [f for f in flags if f not in text]
    assert not missing, f"az {' '.join(words)}: flags not in --help: {missing}"
