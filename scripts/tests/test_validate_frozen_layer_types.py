"""validate_frozen_layer.py must report a frontmatter field of the wrong type, not crash on it.

A frozen layer is drafted by a model, and a model sometimes writes a field in the wrong form: a count
where a list of file names was asked for (`source_artifacts: 3`), a word where a number was asked for. The
validator indexed and iterated those fields as if they were right, so a malformed layer produced a Python
traceback ("TypeError: 'int' object is not iterable") instead of the one validation line a person (or
Studio's sign-off, which shows the output) can act on. Found when Studio's live-model sign-off test hit it.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parent.parent / "validate_frozen_layer.py"
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8"}
BODY = ("word " * 1200) + "\n\n## Decision\nGo.\n\n## Key Outcomes\nDone.\n\n## Artifact Summary\nAll.\n"


def validate(tmp_path: Path, frontmatter: str):
    sdlc = tmp_path / ".sdlc"
    (sdlc / "context" / "layers").mkdir(parents=True)
    (sdlc / "artifacts" / "00-discovery").mkdir(parents=True)
    (sdlc / "state.yaml").write_text("project: x\n", encoding="utf-8")
    (sdlc / "context" / "layers" / "phase0-discovery.md").write_text(f"---\n{frontmatter}\n---\n\n{BODY}", encoding="utf-8")
    return subprocess.run([sys.executable, str(SCRIPT), "--state", str(sdlc / "state.yaml"), "--phase", "0"],
                          capture_output=True, text=True, encoding="utf-8", env=ENV)


GOOD = 'phase: 0\nphase_name: discovery\ncreated: "2026-10-05"\nestimated_tokens: 1560'


@pytest.mark.parametrize("value, line", [
    ("3", "source_artifacts must be a list of file names"),
    ("constitution.md", "source_artifacts must be a list of file names"),
    ("{a: 1}", "source_artifacts must be a list of file names"),
    ("[1, 2]", "source_artifacts must be a list of file names"),
    ("[[a]]", "source_artifacts must be a list of file names"),
])
def test_a_source_artifacts_of_the_wrong_type_is_a_validation_error_not_a_traceback(tmp_path, value, line):
    result = validate(tmp_path, f"{GOOD}\nsource_artifacts: {value}")
    assert "Traceback" not in result.stderr and result.returncode == 1, result.stderr
    assert f"[FAIL] {line}" in result.stdout


@pytest.mark.parametrize("value", ['"about 1500"', "[1500]", "{n: 1500}", "true"])
def test_an_estimated_tokens_that_is_not_a_number_is_a_validation_error_not_a_traceback(tmp_path, value):
    result = validate(tmp_path, f'phase: 0\nphase_name: discovery\ncreated: "2026-10-05"\nsource_artifacts: [constitution.md]\nestimated_tokens: {value}')
    assert "Traceback" not in result.stderr and result.returncode == 1, result.stderr
    assert "[FAIL] estimated_tokens must be a number" in result.stdout


@pytest.mark.parametrize("text", ["- just\n- a list", "plain text", "42"])
def test_a_frontmatter_that_is_not_a_mapping_is_reported_as_unusable(tmp_path, text):
    result = validate(tmp_path, text)
    assert "Traceback" not in result.stderr and result.returncode == 1, result.stderr
    assert "[FAIL] YAML frontmatter missing or unparseable" in result.stdout


def test_a_correct_layer_still_passes_the_type_checks(tmp_path):
    result = validate(tmp_path, f"{GOOD}\nsource_artifacts: [constitution.md]")
    assert "must be" not in result.stdout and "Traceback" not in result.stderr
