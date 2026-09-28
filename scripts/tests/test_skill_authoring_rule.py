"""The rule that keeps a document on its template, stated where Claude will read it.

Measured across 70 real documents in four projects, 55 did not match their template's headings and
reached Studio as raw text. The phase guides only pointed at a template ("templates in ..."); nothing
told Claude to keep its headings or to check the result. This pins the rule in SKILL.md, which is
loaded whenever the plugin is active, and checks that the command it names actually exists with the
flags it uses, so the instruction cannot rot into advice for a command that no longer takes them.
"""

import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SKILL = (REPO / "SKILL.md").read_text(encoding="utf-8")


def _section() -> str:
    m = re.search(r"^## Writing Artifacts\s*$(.*?)(?=^## )", SKILL, re.M | re.S)
    assert m, "SKILL.md has no '## Writing Artifacts' section"
    return m.group(1)


def test_skill_has_a_writing_artifacts_rule():
    assert _section().strip()


def test_it_says_to_keep_the_templates_headings_and_allows_extra_sections():
    text = _section()
    assert "templates/phases/" in text
    assert re.search(r"exact", text, re.I), "the rule must say the template's headings are kept exactly"
    assert re.search(r"add (?:your own |extra |further )?sections", text, re.I), "added sections must be allowed"


def test_it_says_to_check_the_result_before_moving_on():
    text = _section()
    assert "stage_readiness.py" in text
    assert re.search(r"section .* not found|not found", text, re.I), "it must name the finding to fix"


def test_the_command_it_names_takes_the_flags_it_uses():
    """Runs the script's own --help and confirms every flag the rule uses is real."""
    line = next((l for l in _section().splitlines() if "stage_readiness.py" in l and "--" in l), None)
    assert line, "the rule must show the command with its flags"
    flags = set(re.findall(r"(--[a-z][a-z-]*)", line))
    assert flags, "no flags found in the command line"
    help_text = subprocess.run(
        [sys.executable, str(REPO / "scripts" / "stage_readiness.py"), "--help"],
        capture_output=True, text=True, timeout=60,
    ).stdout
    missing = sorted(f for f in flags if f not in help_text)
    assert not missing, f"stage_readiness.py --help does not list {missing}"
