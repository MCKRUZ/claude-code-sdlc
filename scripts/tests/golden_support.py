"""Shared helper for the golden-capture tests of spec 0021.

A golden file records what a script printed (stdout, stderr, exit code) for a fixed fixture
situation, taken from the script BEFORE it gained a `--json` mode. Tests re-run the script and
compare, which is what proves unflagged output did not move.

Machine-specific paths are normalised to `<REPO>` and separators to `/`, so a golden taken on one
machine holds on another.
"""

import os
import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent.parent
GOLDEN_DIR = Path(__file__).resolve().parent / "fixtures" / "golden"


def normalise(text: str, root: Path) -> str:
    """Replace the fixture root (raw and JSON-escaped) with <REPO> and unify separators."""
    raw = str(root)
    escaped = raw.replace("\\", "\\\\")
    out = text.replace(escaped, "<REPO>").replace(raw, "<REPO>")
    out = out.replace("\\\\", "/").replace("\\", "/")
    return out.replace("\r\n", "\n")


def capture(script: str, args: list[str], root: Path) -> str:
    """Run scripts/<script> with args; return the normalised exit code, stdout and stderr."""
    proc = subprocess.run(
        [sys.executable, str(SCRIPTS_DIR / script), *args],
        capture_output=True, text=True, encoding="utf-8", cwd=str(root),
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
    )
    return (
        f"exit: {proc.returncode}\n"
        f"--- stdout ---\n{normalise(proc.stdout, root)}"
        f"--- stderr ---\n{normalise(proc.stderr, root)}"
    )


def golden_path(name: str) -> Path:
    return GOLDEN_DIR / f"{name}.txt"


def read_golden(name: str) -> str:
    return golden_path(name).read_text(encoding="utf-8")
