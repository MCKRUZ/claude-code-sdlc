"""Per-stage approval toggle (a spec 0009 prerequisite, shipped early on spec 0010's behalf).

Spec 0009 (Studio's repository sync) needs to know, for a given stage, whether a change to that
stage's documents requires a named person's approval before it merges, and if so who. That
setting properly belongs to spec 0010 (Studio's document editor), which doesn't exist yet — this
module is the minimal, additive piece both specs share, in the same style as a roster
(validate_team.py): a small YAML file this plugin validates and reads, with no opinion about who
may write it beyond "a real person on the roster."

File: .sdlc/approval-settings.yaml

  stages:
    - stage: requirements
      approval_required: false
    - stage: design
      approval_required: true
      approver: "@sam-k"

Absent file, or a stage not listed, means approval_required: false for that stage — the same
safe default spec 0009's own draft described before this toggle existed. `approver` is required
when approval_required is true, and is checked against the team roster's real handles
(validate_team.py's people_handles) when a roster is present; with no roster, the handle is
accepted as written (nothing to check it against) but still must look like a handle.
"""

import re
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
import validate_team as vt  # noqa: E402

HANDLE_RE = re.compile(r"^@[A-Za-z0-9-]+$")


def _nonempty_str(value) -> bool:
    return isinstance(value, str) and value.strip() != ""


def parse_approval_settings(text: str, known_handles: set[str] | None = None) -> tuple[dict, list[str]]:
    """(settings_by_stage, errors). settings_by_stage maps stage id -> {"approval_required":
    bool, "approver": str | None}. A malformed file (or one with only errors) yields an empty
    dict — callers must treat "not in the dict" the same as "approval not required", exactly
    like a missing file, so a bad file degrades safely rather than silently gating everyone out."""
    errors: list[str] = []
    if not text.strip():
        return {}, errors

    try:
        doc = yaml.safe_load(text)
    except yaml.YAMLError as e:
        return {}, [f"invalid YAML: {e}"]

    if doc is None:
        return {}, errors
    if not isinstance(doc, dict):
        return {}, ["Root: expected a YAML mapping"]

    stages = doc.get("stages")
    if stages is None:
        return {}, errors
    if not isinstance(stages, list):
        return {}, ["stages: expected an array"]

    settings: dict[str, dict] = {}
    seen: dict[str, int] = {}
    for i, entry in enumerate(stages):
        ctx = f"stages[{i}]"
        if not isinstance(entry, dict):
            errors.append(f"{ctx}: expected object")
            continue

        stage_id = entry.get("stage")
        if not _nonempty_str(stage_id):
            errors.append(f"{ctx}.stage: missing or empty")
            continue
        if stage_id in seen:
            errors.append(f"{ctx}: duplicate stage '{stage_id}' (first seen at stages[{seen[stage_id]}])")
            continue
        seen[stage_id] = i

        approval_required = entry.get("approval_required", False)
        if not isinstance(approval_required, bool):
            errors.append(f"{ctx}.approval_required: expected true or false")
            continue

        approver = entry.get("approver")
        if approval_required:
            if not _nonempty_str(approver):
                errors.append(f"{ctx}: approval_required is true but no approver is named")
                continue
            if not HANDLE_RE.match(approver):
                errors.append(f"{ctx}.approver: '{approver}' does not look like a @handle")
                continue
            if known_handles is not None and approver not in known_handles:
                errors.append(f"{ctx}.approver: '{approver}' is not a person on the team roster")
                continue
        elif approver is not None and not _nonempty_str(approver):
            errors.append(f"{ctx}.approver: present but empty")
            continue

        settings[stage_id] = {
            "approval_required": approval_required,
            "approver": approver if approval_required else None,
        }

    return settings, errors


def known_handles(repo_root: Path) -> set[str] | None:
    """Real handles from .sdlc/team.yaml, or None if no roster exists yet — the caller then
    skips the approver-is-a-real-person check rather than rejecting every approver outright."""
    roster_path = repo_root / ".sdlc" / "team.yaml"
    if not roster_path.exists():
        return None
    roster = vt.load_yaml(roster_path)
    return vt.people_handles(roster)


def load_approval_settings(repo_root: Path) -> tuple[dict, list[str]]:
    """The one entry point callers use: (settings_by_stage, errors) for
    <repo_root>/.sdlc/approval-settings.yaml. A missing file is not an error — it's the
    documented "approval required: false everywhere" default."""
    settings_path = repo_root / ".sdlc" / "approval-settings.yaml"
    if not settings_path.exists():
        return {}, []
    text = settings_path.read_text(encoding="utf-8")
    return parse_approval_settings(text, known_handles(repo_root))


def main() -> int:
    args = [a for a in sys.argv[1:] if a != "--json"]
    as_json = "--json" in sys.argv[1:]
    if len(args) != 1:
        print("Usage: approval_settings.py <repo-root> [--json]")
        return 1
    repo_root = Path(args[0]).resolve()
    settings, errors = load_approval_settings(repo_root)

    if as_json:
        import json
        print(json.dumps({"settings": settings, "errors": errors}, indent=2))
        return 1 if errors else 0

    if errors:
        print(f"FAIL — {len(errors)} error(s) in .sdlc/approval-settings.yaml:")
        for e in errors:
            print(f"  - {e}")
        return 1

    if not settings:
        print("No approval settings found — approval is not required for any stage.")
        return 0

    print(f"PASS — {len(settings)} stage(s) configured:")
    for stage_id, s in settings.items():
        state = f"required, approver {s['approver']}" if s["approval_required"] else "not required"
        print(f"  - {stage_id}: {state}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
