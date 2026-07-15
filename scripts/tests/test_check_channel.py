"""Tests for check_channel.py — the advisory channel-coverage lint.

Invoked via its CLI with subprocess so the tests lock the always-exit-0,
SHOULD-only contract. The lint is pointed at the repo's real channels/ so it
cross-checks against the shipped voice descriptor (6 acceptance dimensions).
"""

import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent.parent
PLUGIN_ROOT = SCRIPTS_DIR.parent
CHECK = SCRIPTS_DIR / "check_channel.py"
CHANNELS_DIR = PLUGIN_ROOT / "channels"

# One acceptance-check line per voice dimension. Each carries the dimension id
# verbatim, so check_channel's coverage matcher counts it as covered.
VOICE_ALL = [
    "turn-taking: the system yields after each prompt and waits for 1.5 s of silence before resuming.",
    "barge-in: when the caller speaks during playback, output stops within 200 ms.",
    "intent-capture: an ASR result below 0.70 confidence triggers a confirm-or-reprompt.",
    "latency-budget: no response gap exceeds 1200 ms without a hold cue.",
    "readback-confirmation: any state change is read back and confirmed before commit.",
    "fallback-to-human: a human is reachable at every turn and a transfer is offered on error.",
]


def run_check(spec_path):
    return subprocess.run(
        [sys.executable, str(CHECK), "--spec", str(spec_path), "--channels-dir", str(CHANNELS_DIR)],
        capture_output=True,
        text=True,
    )


def write_spec(tmp_path, frontmatter, acceptance_lines):
    checks = "\n".join(f"- [ ] {ln}" for ln in acceptance_lines)
    text = f"---\n{frontmatter}\n---\n\n# Spec 0001 — x\n\n## Acceptance Checks\n{checks}\n"
    p = tmp_path / "0001-x.md"
    p.write_text(text, encoding="utf-8")
    return p


class TestVoiceCoverage:
    def test_all_dimensions_covered(self, tmp_path):
        spec = write_spec(tmp_path, 'spec: "0001"\nname: "x"\nchannel: voice', VOICE_ALL)
        r = run_check(spec)
        assert r.returncode == 0
        assert "not yet covered" not in r.stdout
        assert "all 6" in r.stdout
        assert "covered" in r.stdout

    def test_missing_barge_in_is_a_should_but_still_exit_0(self, tmp_path):
        lines = [ln for ln in VOICE_ALL if not ln.startswith("barge-in")]
        spec = write_spec(tmp_path, 'spec: "0001"\nname: "x"\nchannel: voice', lines)
        r = run_check(spec)
        assert r.returncode == 0  # advisory — never blocks
        assert "1 of 6" in r.stdout
        assert "not yet covered" in r.stdout
        assert "barge-in" in r.stdout


class TestNoChannel:
    def test_blank_channel_is_an_advisory_note(self, tmp_path):
        spec = write_spec(tmp_path, 'spec: "0001"\nname: "x"\nchannel: ""', VOICE_ALL)
        r = run_check(spec)
        assert r.returncode == 0
        assert "No channel bound" in r.stdout


class TestUnknownChannel:
    def test_unknown_channel_is_advisory(self, tmp_path):
        spec = write_spec(tmp_path, 'spec: "0001"\nname: "x"\nchannel: hologram', VOICE_ALL)
        r = run_check(spec)
        assert r.returncode == 0
        assert "no descriptor" in r.stdout
