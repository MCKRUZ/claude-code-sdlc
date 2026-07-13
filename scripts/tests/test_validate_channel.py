"""Tests for validate_channel.py — the hand-rolled channel-descriptor validator.

Invoked via its CLI with subprocess so the tests lock the exit-code contract
(exit 0 pass / exit 1 fail) and stay robust to internal function naming.
"""

import subprocess
import sys
from pathlib import Path

import yaml

SCRIPTS_DIR = Path(__file__).resolve().parent.parent
VALIDATE = SCRIPTS_DIR / "validate_channel.py"

# A minimal descriptor that satisfies every schema rule. llm_powered is False so
# eval_hooks are not required — individual tests below flip one field at a time.
VALID = {
    "id": "sample",
    "name": "Sample Channel",
    "surface": "A test surface the customer touches",
    "llm_powered": False,
    "acceptance_dimensions": [
        {
            "id": "dim-one",
            "intent": "Something is guaranteed for the customer.",
            "example_check": "A concrete check that returns 200 within 300 ms.",
        },
    ],
}


def run_validate(*paths):
    return subprocess.run(
        [sys.executable, str(VALIDATE), *[str(p) for p in paths]],
        capture_output=True,
        text=True,
    )


def write_descriptor(tmp_path, data, name="sample.yaml"):
    p = tmp_path / name
    p.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")
    return p


class TestValidDescriptor:
    def test_valid_passes(self, tmp_path):
        r = run_validate(write_descriptor(tmp_path, VALID))
        assert r.returncode == 0
        assert "PASS" in r.stdout


class TestRequiredFields:
    def test_missing_id_fails(self, tmp_path):
        data = {k: v for k, v in VALID.items() if k != "id"}
        r = run_validate(write_descriptor(tmp_path, data))
        assert r.returncode == 1
        assert "missing required field 'id'" in r.stdout

    def test_missing_acceptance_dimensions_fails(self, tmp_path):
        data = {k: v for k, v in VALID.items() if k != "acceptance_dimensions"}
        r = run_validate(write_descriptor(tmp_path, data))
        assert r.returncode == 1
        assert "acceptance_dimensions" in r.stdout


class TestLlmPowered:
    def test_llm_powered_without_eval_hooks_fails(self, tmp_path):
        data = dict(VALID)
        data["llm_powered"] = True  # no eval_hooks supplied
        r = run_validate(write_descriptor(tmp_path, data))
        assert r.returncode == 1
        assert "eval_hooks" in r.stdout

    def test_llm_powered_with_eval_hooks_passes(self, tmp_path):
        data = dict(VALID)
        data["llm_powered"] = True
        data["eval_hooks"] = ["intent accuracy (transcript_constraint)"]
        r = run_validate(write_descriptor(tmp_path, data))
        assert r.returncode == 0
        assert "PASS" in r.stdout


class TestRiskFloor:
    def test_bad_risk_floor_enum_fails(self, tmp_path):
        data = dict(VALID)
        data["risk_floor"] = "URGENT"
        r = run_validate(write_descriptor(tmp_path, data))
        assert r.returncode == 1
        assert "risk_floor" in r.stdout


class TestUnderscoreSkip:
    def test_underscore_prefixed_file_is_skipped(self, tmp_path):
        # An underscore-prefixed file (e.g. _template) is never validated.
        p = write_descriptor(tmp_path, {"nonsense": True}, name="_scratch.yaml")
        r = run_validate(p)
        assert r.returncode == 0
        assert "SKIP" in r.stdout
