"""The registry is the enforcement; the docs and phase bodies have to agree with it.

`check_gates.py` blocks a phase on `artifacts.required` in `phases/phase-registry.yaml` — nothing
else. So the registry is what a team actually experiences. Three other places describe the same
list to a human, and none of them is consulted at gate time:

* the phase definition's `### `<name>`` artifact spec — what Claude reads to know what to produce
* `docs/phase-lifecycle.md`'s **Required Artifacts** table — what a person reads to plan the phase
* the same file's **Optional Artifacts** list — which must not also name a required artifact

When those disagree, the gate wins silently and the team finds out by being blocked on a file
nobody told them to write.

Not hypothetical. The 1.0.0 "Fix 3" migration added twelve required receipts to the registry and
updated none of the prose: `docs/phase-lifecycle.md` was missing eleven of them, still listed
`go-no-go-record.md` and `drill-record.md` as *optional*, and two of the twelve
(`drill-record.md`, `go-no-go-record.md`) had no artifact spec in any phase definition at all —
required by the gate, described nowhere. Issues #31, #33 and #35 were three separate reports of
that one migration. This test is what makes the next such migration fail here instead of at a
client's Phase 9 gate.
"""

import re
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
REGISTRY = REPO_ROOT / "phases" / "phase-registry.yaml"
LIFECYCLE = REPO_ROOT / "docs" / "phase-lifecycle.md"


def artifact_name(entry) -> str:
    """The filename an artifact entry names, in either the plain or the qualified form.

    Entries are either a bare string or a mapping carrying `path` plus qualifiers such as
    `required_for` (project types) and `root: repo`.
    """
    return entry["path"] if isinstance(entry, dict) else entry


def phases() -> list[dict]:
    return yaml.safe_load(REGISTRY.read_text(encoding="utf-8"))["phases"]


def lifecycle_section(display: str) -> str:
    """The `## Phase N: ...` section of the lifecycle doc, or "" when it has none."""
    key = display.split(":")[0].strip()
    for section in re.split(r"^## ", LIFECYCLE.read_text(encoding="utf-8"), flags=re.M):
        if section.startswith(f"{key}:") or section.startswith(f"{key} "):
            return section
    return ""


def block(section: str, heading: str) -> str:
    match = re.search(rf"### {heading}(.*?)(?=\n### |\Z)", section, re.S)
    return match.group(1) if match else ""


def required_pairs() -> list[tuple[dict, str]]:
    return [(p, artifact_name(a)) for p in phases() for a in p["artifacts"]["required"]]


def test_every_required_artifact_has_a_spec_in_its_phase_definition():
    pairs = required_pairs()
    assert pairs, "no required artifacts parsed — the registry shape changed, not a clean bill"

    missing = []
    for phase, name in pairs:
        body = (REPO_ROOT / phase["definition"]).read_text(encoding="utf-8")
        if f"### `{name}`" not in body:
            missing.append(f"{phase['slug']}: {name} (add a spec to {phase['definition']})")

    assert not missing, (
        "required by the gate, described nowhere — a team hits this as a blocked phase with no "
        "instruction anywhere for what the file should contain:\n  " + "\n  ".join(missing)
    )


def test_every_required_artifact_appears_in_the_lifecycle_docs_required_table():
    missing = []
    for phase, name in required_pairs():
        section = lifecycle_section(phase["display"])
        if not section:
            continue  # the Build loop is continuous and has no numbered phase section
        if name.rstrip("/") not in block(section, "Required Artifacts"):
            missing.append(f"{phase['slug']}: {name}")

    assert not missing, (
        "required by the registry but absent from docs/phase-lifecycle.md's Required Artifacts "
        "table — the doc a person plans the phase from:\n  " + "\n  ".join(missing)
    )


def test_no_required_artifact_is_also_listed_as_optional():
    miscategorised = []
    for phase, name in required_pairs():
        section = lifecycle_section(phase["display"])
        if not section:
            continue
        if name.rstrip("/") in block(section, "Optional Artifacts"):
            miscategorised.append(f"{phase['slug']}: {name}")

    assert not miscategorised, (
        "documented as optional while the gate blocks on it — the exact contradiction that makes "
        "a team skip the artifact and then fail the gate:\n  " + "\n  ".join(miscategorised)
    )


@pytest.mark.parametrize("path", [REGISTRY, LIFECYCLE])
def test_sources_exist(path: Path):
    """Guard the guard: a moved or renamed source must fail loudly, not pass vacuously."""
    assert path.exists(), f"{path} is missing — the checks above would silently pass without it"
