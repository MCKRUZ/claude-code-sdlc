"""Validate a frozen layer file for structure, frontmatter, and token budget."""

import argparse
import re
import sys
from pathlib import Path

import yaml

PLUGIN_ROOT = Path(__file__).resolve().parent.parent

REQUIRED_FRONTMATTER_FIELDS = [
    "phase",
    "phase_name",
    "created",
    "source_artifacts",
    "estimated_tokens",
]

TOKEN_MIN = 1000
TOKEN_TARGET_LOW = 1500
TOKEN_TARGET_HIGH = 2000
TOKEN_MAX = 2500


def load_yaml(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def get_phase_name(state: dict, phase_id: int) -> str | None:
    """Get the phase name from the phase registry."""
    registry_path = PLUGIN_ROOT / "phases" / "phase-registry.yaml"
    if not registry_path.exists():
        return None
    registry = load_yaml(registry_path)
    for p in registry.get("phases", []):
        if p["id"] == phase_id:
            return p["name"]
    return None


def extract_frontmatter(content: str) -> dict | None:
    """Extract YAML frontmatter from markdown content."""
    match = re.match(r"^---\s*\n(.*?)\n---", content, re.DOTALL)
    if not match:
        return None
    try:
        return yaml.safe_load(match.group(1))
    except yaml.YAMLError:
        return None


def estimate_tokens(content: str) -> int:
    """Estimate token count from word count (word_count * 1.3)."""
    word_count = len(content.split())
    return int(word_count * 1.3)


def validate(state_path: Path, phase_id: int) -> int:
    """Validate a frozen layer. Returns 0=valid, 1=invalid, 2=error."""
    errors = []
    warnings = []

    # Load state
    if not state_path.exists():
        print(f"Error: State file not found: {state_path}", file=sys.stderr)
        return 2

    state = load_yaml(state_path)
    sdlc_dir = state_path.parent

    # Determine phase name
    phase_name = get_phase_name(state, phase_id)
    if not phase_name:
        print(f"Error: Phase {phase_id} not found in registry", file=sys.stderr)
        return 2

    # Check frozen layer file exists
    layer_path = sdlc_dir / "context" / "layers" / f"phase{phase_id}-{phase_name}.md"
    if not layer_path.exists():
        errors.append(f"Frozen layer not found: {layer_path}")
        print_results(errors, warnings, layer_path)
        return 1

    content = layer_path.read_text(encoding="utf-8", errors="replace")

    # Check frontmatter
    frontmatter = extract_frontmatter(content)
    if frontmatter is None:
        errors.append("YAML frontmatter missing or unparseable")
        print_results(errors, warnings, layer_path)
        return 1

    # Check required fields
    for field in REQUIRED_FRONTMATTER_FIELDS:
        if field not in frontmatter or frontmatter[field] is None:
            errors.append(f"Missing required frontmatter field: {field}")

    # Validate phase matches
    if frontmatter.get("phase") != phase_id:
        errors.append(
            f"Frontmatter phase ({frontmatter.get('phase')}) "
            f"does not match expected ({phase_id})"
        )

    # Token budget check
    estimated_tokens = estimate_tokens(content)
    declared_tokens = frontmatter.get("estimated_tokens", 0)

    if estimated_tokens < TOKEN_MIN:
        errors.append(
            f"Token estimate ({estimated_tokens}) below minimum ({TOKEN_MIN}). "
            f"Frozen layer may be too sparse."
        )
    elif estimated_tokens > TOKEN_MAX:
        errors.append(
            f"Token estimate ({estimated_tokens}) exceeds maximum ({TOKEN_MAX}). "
            f"Frozen layer must be condensed further."
        )
    elif estimated_tokens < TOKEN_TARGET_LOW:
        warnings.append(
            f"Token estimate ({estimated_tokens}) below target range "
            f"({TOKEN_TARGET_LOW}-{TOKEN_TARGET_HIGH}). Consider adding detail."
        )
    elif estimated_tokens > TOKEN_TARGET_HIGH:
        warnings.append(
            f"Token estimate ({estimated_tokens}) above target range "
            f"({TOKEN_TARGET_LOW}-{TOKEN_TARGET_HIGH}). Consider condensing."
        )

    # Check declared vs estimated token count
    if declared_tokens and abs(declared_tokens - estimated_tokens) > 500:
        warnings.append(
            f"Declared estimated_tokens ({declared_tokens}) differs significantly "
            f"from actual estimate ({estimated_tokens}). Use word_count * 1.3."
        )

    # Check traceability — source artifacts reference real files
    source_artifacts = frontmatter.get("source_artifacts", [])
    if not source_artifacts:
        warnings.append("No source_artifacts listed in frontmatter")
    else:
        artifacts_dir = sdlc_dir / "artifacts" / f"{phase_id:02d}-{phase_name}"
        for artifact in source_artifacts:
            artifact_path = artifacts_dir / artifact
            if not artifact_path.exists():
                warnings.append(f"Source artifact not found: {artifact}")

    # Check mandatory sections
    mandatory_sections = [
        "## Decision",
        "## Key Outcomes",
        "## Artifact Summary",
    ]
    for section in mandatory_sections:
        if section not in content:
            errors.append(f"Missing mandatory section: {section}")

    # Check for unfilled template placeholders
    placeholders = re.findall(r"\$\{[A-Z_]+\}", content)
    if placeholders:
        errors.append(f"Unfilled template placeholders: {placeholders[:5]}")

    print_results(errors, warnings, layer_path)
    return 1 if errors else 0


def print_results(
    errors: list[str], warnings: list[str], layer_path: Path
) -> None:
    print(f"Frozen Layer Validation: {layer_path}")
    print("=" * 50)

    if not errors and not warnings:
        print("  [PASS] All checks passed")
    else:
        for e in errors:
            print(f"  [FAIL] {e}")
        for w in warnings:
            print(f"  [WARN] {w}")

    print()
    print(
        f"Summary: {len(errors)} error(s), {len(warnings)} warning(s) — "
        f"{'VALID' if not errors else 'INVALID'}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate a frozen layer file"
    )
    parser.add_argument(
        "--state", required=True, help="Path to .sdlc/state.yaml"
    )
    parser.add_argument(
        "--phase", type=int, required=True, help="Phase number to validate"
    )
    args = parser.parse_args()

    sys.exit(validate(Path(args.state), args.phase))


if __name__ == "__main__":
    main()
