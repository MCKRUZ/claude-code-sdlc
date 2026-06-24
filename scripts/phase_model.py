"""
phase_model.py — Single source of truth for SDLC phase identity and ordering.

The phase registry (phases/phase-registry.yaml) defines the phases. Phase ids may be
integers (0, 1, 2, 3, 7, 8, 9) or strings ("build", "close"); they are deliberately
NOT contiguous and NOT sequential (the 4/5/6 gap marks the removed batch middle).

Rules every script MUST follow — route through this module instead of:
  - computing the next phase as `id + 1`           -> use next_phase()
  - deriving a directory name by zero-padding an id -> use artifact_dirname() (reads `slug`)
  - assuming `state["phases"]` keys are ints        -> ids are normalized to strings here
  - hardcoding terminal as `id >= 9`                -> use is_terminal()
"""

from pathlib import Path

import yaml

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
REGISTRY_PATH = PLUGIN_ROOT / "phases" / "phase-registry.yaml"


def normalize_id(phase_id) -> str | None:
    """Canonical string form of a phase id from any source (CLI arg, state.yaml, registry)."""
    if phase_id is None:
        return None
    return str(phase_id).strip()


def load_phases() -> list[dict]:
    """All phase entries, sorted by lifecycle `order` (independent of file order)."""
    with open(REGISTRY_PATH, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return sorted(data["phases"], key=lambda p: p["order"])


def all_phases() -> list[dict]:
    return load_phases()


def all_phase_ids() -> list[str]:
    return [normalize_id(p["id"]) for p in load_phases()]


def get_phase(phase_id) -> dict | None:
    """Registry entry for phase_id (int or str), or None if unknown."""
    pid = normalize_id(phase_id)
    for p in load_phases():
        if normalize_id(p["id"]) == pid:
            return p
    return None


def phase_order(phase_id) -> int | None:
    p = get_phase(phase_id)
    return p["order"] if p else None


def next_phase(phase_id) -> dict | None:
    """The phase whose `order` is exactly one greater. None if terminal or unknown."""
    p = get_phase(phase_id)
    if p is None:
        return None
    target = p["order"] + 1
    for q in load_phases():
        if q["order"] == target:
            return q
    return None


def prior_phases(phase_id) -> list[dict]:
    """All phases with a lower `order` than phase_id, in lifecycle order."""
    p = get_phase(phase_id)
    if p is None:
        return []
    return [q for q in load_phases() if q["order"] < p["order"]]


def is_terminal(phase_id) -> bool:
    """True for the final phase (explicit `terminal: true`, or highest order as a fallback)."""
    p = get_phase(phase_id)
    if p is None:
        return False
    if p.get("terminal"):
        return True
    return p["order"] == max(q["order"] for q in load_phases())


def is_before(a, b) -> bool:
    """True if phase `a` comes strictly before phase `b` in lifecycle order."""
    oa, ob = phase_order(a), phase_order(b)
    if oa is None or ob is None:
        return False
    return oa < ob


def artifact_dirname(phase_id) -> str | None:
    """Artifact directory slug for a phase (e.g. '00-discovery', 'build', 'close')."""
    p = get_phase(phase_id)
    return p["slug"] if p else None


def phase_name(phase_id) -> str | None:
    p = get_phase(phase_id)
    return p["name"] if p else None


def phase_display(phase_id) -> str | None:
    p = get_phase(phase_id)
    return p["display"] if p else None


def phase_count() -> int:
    return len(load_phases())


def is_continuous(phase_id) -> bool:
    """True for the Build loop — a continuous phase with no batch artifact exit gate."""
    p = get_phase(phase_id)
    return bool(p and p.get("continuous"))
