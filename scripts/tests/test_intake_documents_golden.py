"""Golden captures pinning intake_documents.py's output when no new flag is given.

The captures in fixtures/golden/intake_documents-<case>.txt were taken from the
script as it stood BEFORE the --repo/--docs/--json/--skip/--priority/--lock
modes were added (spec 0021), on the fixed fixture project built below.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

SCRIPT = Path(__file__).resolve().parent.parent / "intake_documents.py"
GOLDEN_DIR = Path(__file__).resolve().parent / "fixtures" / "golden"

CASES = ["fresh", "existing", "rescan", "no-documentation", "no-matches", "missing-intake"]

DOCS = {
    "alpha-rfp.md": "# Alpha RFP\n\nThe client needs a claims portal with audit trails.\n",
    "beta-notes.txt": "Meeting notes from the kickoff. Three stakeholders attended the session.\n",
    "gamma-api.md": "# API\n\n" + "endpoint description words " * 40 + "\n",
}


def build_project(root: Path, *, documents: bool = True, documentation: bool = True,
                  intake_exists: bool = True) -> Path:
    """Create a minimal project with an .sdlc folder and a few intake documents."""
    sdlc = root / ".sdlc"
    sdlc.mkdir(parents=True)
    (sdlc / "state.yaml").write_text("project: fixture\n", encoding="utf-8")
    profile: dict = {"version": "1.0"}
    if documentation:
        profile["documentation"] = {
            "intake_path": "docs/intake",
            "types": ["pdf", "markdown", "text", "docx"],
            "max_documents": 50,
        }
    (sdlc / "profile.yaml").write_text(yaml.safe_dump(profile), encoding="utf-8")
    if intake_exists:
        intake = root / "docs" / "intake"
        intake.mkdir(parents=True)
        if documents:
            for name, body in DOCS.items():
                (intake / name).write_text(body, encoding="utf-8")
            (intake / "delta-spec.docx").write_bytes(b"PK\x03\x04" + b"x" * 400)
    return sdlc / "state.yaml"


def run_intake(args: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        capture_output=True, text=True, encoding="utf-8", cwd=cwd,
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
    )


def normalise(text: str, root: Path) -> str:
    return text.replace(str(root), "<ROOT>").replace("\\", "/").replace("\r\n", "\n")


def render(result: subprocess.CompletedProcess, root: Path) -> str:
    return f"exit: {result.returncode}\n--- stdout ---\n{normalise(result.stdout, root)}"


def capture_case(case: str, root: Path) -> str:
    kwargs = {}
    if case == "no-documentation":
        kwargs["documentation"] = False
    elif case == "no-matches":
        kwargs["documents"] = False
    elif case == "missing-intake":
        kwargs["intake_exists"] = False
    state = build_project(root, **kwargs)
    if case in ("existing", "rescan"):
        run_intake(["--state", str(state)])
    extra = ["--rescan"] if case == "rescan" else []
    return render(run_intake(["--state", str(state), *extra]), root)


@pytest.mark.parametrize("case", CASES)
def test_no_flag_output_matches_pre_change_capture(case, tmp_path):
    expected = (GOLDEN_DIR / f"intake_documents-{case}.txt").read_text(encoding="utf-8")
    assert capture_case(case, tmp_path / "proj") == expected
