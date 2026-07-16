"""Initialize .sdlc/ structure in a target project directory."""

import argparse
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = PLUGIN_ROOT / "templates"
sys.path.insert(0, str(Path(__file__).parent))
import phase_model as pm
from validate_profile import SCHEMA_PATH, load_yaml, validate_profile

# Artifact directories, derived from the phase registry (single source of truth)
PHASE_DIRS = [p["slug"] for p in pm.all_phases()]


def load_profile(profile_path: Path) -> dict:
    with open(profile_path) as f:
        return yaml.safe_load(f)


def init_state(profile: dict, project_name: str) -> str:
    template = (TEMPLATES_DIR / "state-init.yaml").read_text()
    now = datetime.now(timezone.utc).isoformat()
    state = template.replace("${PROFILE_ID}", profile["company"]["profile_id"])
    state = state.replace("${PROJECT_NAME}", project_name)
    state = state.replace("${CREATED_AT}", now)
    return state


def create_sdlc_dir(target: Path, profile: dict, project_name: str) -> None:
    sdlc_dir = target / ".sdlc"
    if sdlc_dir.exists():
        print(f"Warning: {sdlc_dir} already exists. Skipping creation.")
        return

    # Create .sdlc/ structure
    sdlc_dir.mkdir(parents=True)
    artifacts_dir = sdlc_dir / "artifacts"
    artifacts_dir.mkdir()

    for phase_dir in PHASE_DIRS:
        (artifacts_dir / phase_dir).mkdir()

    # Create context directory for frozen layers and document intake
    context_dir = sdlc_dir / "context"
    context_dir.mkdir()
    (context_dir / "layers").mkdir()
    (context_dir / "intake").mkdir()  # For document intake summaries (opt-in via profile.documentation)

    # Write state.yaml
    state_content = init_state(profile, project_name)
    (sdlc_dir / "state.yaml").write_text(state_content)

    # Copy frozen profile
    profile_path = sdlc_dir / "profile.yaml"
    with open(profile_path, "w") as f:
        yaml.dump(profile, f, default_flow_style=False, sort_keys=False)

    # Copy constitution template
    constitution_template = TEMPLATES_DIR / "constitution.md"
    if constitution_template.exists():
        shutil.copy2(constitution_template, sdlc_dir / "constitution.md")

    print(f"Created .sdlc/ in {target}")
    print(f"  Profile: {profile['company']['profile_id']}")
    print(f"  Artifacts: {len(PHASE_DIRS)} phase directories")
    print(f"  Context: frozen layers + intake directories")
    print(f"  State: Phase 0 (Discovery) active")


def main():
    parser = argparse.ArgumentParser(description="Initialize SDLC structure in a project")
    parser.add_argument("--profile", required=True, help="Path to profile.yaml")
    parser.add_argument("--target", required=True, help="Target project directory")
    parser.add_argument("--name", default=None, help="Project name (defaults to directory name)")
    args = parser.parse_args()

    profile_path = Path(args.profile)
    target_path = Path(args.target)

    if not profile_path.exists():
        print(f"Error: Profile not found: {profile_path}")
        sys.exit(1)

    # Validate the profile (same rules as validate_profile.py) BEFORE writing anything —
    # init runs first in the setup wizard, so a bad profile must stop here, not downstream.
    profile = load_profile(profile_path)
    errors = validate_profile(profile, load_yaml(SCHEMA_PATH))
    if errors:
        print(f"Error: profile failed validation ({len(errors)} error(s)):")
        for e in errors:
            print(f"  - {e}")
        sys.exit(2)

    if not target_path.exists():
        print(f"Creating target directory: {target_path}")
        target_path.mkdir(parents=True)

    project_name = args.name or target_path.name

    create_sdlc_dir(target_path, profile, project_name)


if __name__ == "__main__":
    main()
