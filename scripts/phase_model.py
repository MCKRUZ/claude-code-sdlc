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


# ── Required artifacts: where they live, and whether this project needs them ──────────────────

# Every project type the lifecycle recognises (Phase 0 records one in state.yaml).
PROJECT_TYPES = ("service", "app", "library", "skill", "cli")


class RequiredArtifact:
    """One required artifact, resolved.

    `artifacts.required[]` accepts two shapes, and the plain string is still the common case:

        required:
          - "phase8-handoff.md"                 # lives under the phase's artifact dir
          - path: "README.md"                   # lives at the REPO ROOT
            root: repo
          - path: "RUNBOOK.md"
            root: repo
            required_for: [service, app]        # other project types genuinely do not need it

    Both extensions exist because the gate was checking the wrong thing:

      * `root: repo` — Phase 7 told teams to test the README against a fresh clone while the
        gate checked a COPY under .sdlc/artifacts/07-documentation/. Either the copy drifts from
        the real file or the gate never opens. The phase that exists to prove a stranger can run
        the project was validating a file no stranger would ever read.

      * `required_for` — five phase bodies adapt their artifacts by project_type, and the gate
        did not, so a CLI or a library was told to skip RUNBOOK.md and then blocked on it. The
        plugin could not close Phase 7 on itself.
    """

    __slots__ = ("name", "root", "required_for")

    def __init__(self, name: str, root: str = "phase", required_for: list[str] | None = None):
        if root not in ("phase", "repo"):
            raise ValueError(f"artifact '{name}': root must be 'phase' or 'repo', got {root!r}")
        unknown = set(required_for or ()) - set(PROJECT_TYPES)
        if unknown:
            raise ValueError(f"artifact '{name}': unknown project type(s) {sorted(unknown)}")
        self.name = name
        self.root = root
        self.required_for = list(required_for) if required_for else None

    def applies_to(self, project_type: str | None) -> bool:
        """True if this project must produce the artifact.

        An unset project_type means Phase 0 has not recorded one yet. Everything is required in
        that case — fail closed, because guessing the type would silently drop a real gate.
        """
        if self.required_for is None or project_type is None:
            return True
        return project_type in self.required_for

    def base_dir(self, phase_dir: Path, repo_root: Path) -> Path:
        return repo_root if self.root == "repo" else phase_dir

    def __repr__(self) -> str:                                    # pragma: no cover - debug aid
        return f"RequiredArtifact({self.name!r}, root={self.root!r}, required_for={self.required_for!r})"


def _parse_artifact(entry) -> RequiredArtifact:
    if isinstance(entry, str):
        return RequiredArtifact(entry)
    if isinstance(entry, dict):
        name = entry.get("path")
        if not name:
            raise ValueError(f"artifact entry is missing `path`: {entry!r}")
        return RequiredArtifact(name, entry.get("root", "phase"), entry.get("required_for"))
    raise ValueError(f"artifact entry must be a string or a mapping, got {type(entry).__name__}")


def required_artifacts(phase_def: dict, project_type: str | None = None) -> list[RequiredArtifact]:
    """The artifacts this phase requires OF THIS PROJECT, in registry order."""
    entries = (phase_def.get("artifacts") or {}).get("required") or []
    parsed = [_parse_artifact(e) for e in entries]
    return [a for a in parsed if a.applies_to(project_type)]
