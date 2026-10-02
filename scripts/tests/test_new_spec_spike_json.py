"""Spec 0021 — `--json` for new_spec.py and new_spike.py.

Two things are pinned here:
  1. WITHOUT --json, stdout/stderr/exit code are exactly what the scripts printed before the
     flag existed (golden captures in fixtures/golden/, taken from the unmodified scripts).
  2. WITH --json, stdout is exactly one JSON document, repo-relative, and the exit codes and
     refusals are unchanged.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from golden_support import SCRIPTS_DIR, capture, read_golden

# name -> (script, args). Each runs in a fresh, empty repo directory.
GOLDEN_CASES = {
    "new_spec-basic": ("new_spec.py", ["--repo", ".", "--name", "Duplicate claim 409", "--risk", "HIGH",
                                        "--owner", "@priya-n", "--team", "core"]),
    "new_spec-bad-risk": ("new_spec.py", ["--repo", ".", "--name", "x", "--risk", "URGENT"]),
    "new_spike-basic": ("new_spike.py", ["--repo", ".", "--name", "Carrier idempotency",
                                          "--box", "1 working day", "--opened-by", "@priya-n",
                                          "--unblocks", "DL-14"]),
    "new_spike-empty-box": ("new_spike.py", ["--repo", ".", "--name", "x", "--box", "  ",
                                              "--opened-by", "@priya-n"]),
    "new_spike-empty-opened-by": ("new_spike.py", ["--repo", ".", "--name", "x", "--box", "4h",
                                                    "--opened-by", " "]),
}


def run(script, args, cwd):
    return subprocess.run(
        [sys.executable, str(SCRIPTS_DIR / script), *args],
        capture_output=True, text=True, encoding="utf-8", cwd=str(cwd),
    )


@pytest.mark.parametrize("case", sorted(GOLDEN_CASES))
def test_unflagged_output_matches_golden(case, tmp_path):
    script, args = GOLDEN_CASES[case]
    assert capture(script, args, tmp_path.resolve()) == read_golden(case)


class TestNewSpecJson:
    def test_prints_exactly_one_document_with_repo_relative_path(self, tmp_path):
        proc = run("new_spec.py", ["--repo", ".", "--name", "Duplicate claim 409", "--risk", "high", "--json"],
                   tmp_path)
        assert proc.returncode == 0
        doc = json.loads(proc.stdout)  # no leading or trailing text, or this raises
        assert doc == {"path": "specs/0001-duplicate-claim-409.md", "id": "0001",
                       "name": "duplicate-claim-409", "risk": "HIGH"}
        assert (tmp_path / doc["path"]).exists()

    def test_second_spec_gets_next_id(self, tmp_path):
        run("new_spec.py", ["--repo", ".", "--name", "first", "--json"], tmp_path)
        doc = json.loads(run("new_spec.py", ["--repo", ".", "--name", "second", "--json"], tmp_path).stdout)
        assert doc["id"] == "0002"
        assert doc["path"] == "specs/0002-second.md"
        assert doc["risk"] == "MEDIUM"

    def test_path_is_relative_in_state_mode(self, tmp_path):
        (tmp_path / ".sdlc").mkdir()
        state = tmp_path / ".sdlc" / "state.yaml"
        state.write_text("x: 1\n", encoding="utf-8")
        doc = json.loads(run("new_spec.py", ["--state", str(state), "--name", "viastate", "--json"],
                             tmp_path).stdout)
        assert doc["path"] == "specs/0001-viastate.md"

    def test_invalid_risk_keeps_exit_code_and_message_with_empty_stdout_json(self, tmp_path):
        plain = run("new_spec.py", ["--repo", ".", "--name", "x", "--risk", "URGENT"], tmp_path)
        flagged = run("new_spec.py", ["--repo", ".", "--name", "x", "--risk", "URGENT", "--json"], tmp_path)
        assert plain.returncode == flagged.returncode == 1
        assert "--risk must be one of" in plain.stdout
        # With --json a refusal must not corrupt stdout: it is not a JSON document, so it goes to stderr.
        assert flagged.stdout == ""
        assert flagged.stderr.strip() == plain.stdout.strip()

    def test_json_output_file_content_equals_unflagged_file_content(self, tmp_path):
        a, b = tmp_path / "a", tmp_path / "b"
        a.mkdir()
        b.mkdir()
        run("new_spec.py", ["--repo", ".", "--name", "same", "--risk", "LOW"], a)
        run("new_spec.py", ["--repo", ".", "--name", "same", "--risk", "LOW", "--json"], b)
        assert (a / "specs/0001-same.md").read_text(encoding="utf-8") == \
            (b / "specs/0001-same.md").read_text(encoding="utf-8")


class TestNewSpikeJson:
    def test_prints_exactly_one_document(self, tmp_path):
        proc = run("new_spike.py", ["--repo", ".", "--name", "Carrier idempotency", "--box", " 1 working day ",
                                     "--opened-by", "@priya-n", "--unblocks", "DL-14", "--json"], tmp_path)
        assert proc.returncode == 0
        doc = json.loads(proc.stdout)
        assert doc == {"path": "spikes/0001-carrier-idempotency.md", "id": "0001",
                       "name": "carrier-idempotency", "box": "1 working day",
                       "opened_by": "@priya-n", "unblocks": "DL-14"}
        assert (tmp_path / doc["path"]).exists()

    def test_unblocks_defaults_to_dash(self, tmp_path):
        doc = json.loads(run("new_spike.py", ["--repo", ".", "--name", "x", "--box", "4h",
                                               "--opened-by", "Sam", "--json"], tmp_path).stdout)
        assert doc["unblocks"] == "—"

    @pytest.mark.parametrize("flag,args,message", [
        ("box", ["--box", "  ", "--opened-by", "Sam"], "--box must not be empty"),
        ("opened-by", ["--box", "4h", "--opened-by", " "], "--opened-by must name a human"),
    ])
    def test_still_refuses_empty_box_or_opener(self, tmp_path, flag, args, message):
        base = ["--repo", ".", "--name", "x", *args]
        plain = run("new_spike.py", base, tmp_path)
        flagged = run("new_spike.py", [*base, "--json"], tmp_path)
        assert plain.returncode == flagged.returncode == 1
        assert message in plain.stdout
        assert flagged.stdout == ""
        assert message in flagged.stderr
        assert not (tmp_path / "spikes").exists()
