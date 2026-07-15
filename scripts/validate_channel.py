"""Validate a channel descriptor YAML against the channel schema.

Mirrors validate_profile.py: a hand-rolled validator that loads channels/_schema.yaml
only to read its `required` list and hardcodes the rest of the rules. A channel is the
customer SURFACE a capability is delivered through (a web AG-UI console, a voice line, a
chat surface) — inert data read only by this validator, check_channel.py, and the discipline
commands/agents. It is never read by the protected gate/spec core.

Usage:
  uv run --project scripts scripts/validate_channel.py channels/<id>.yaml [<id>.yaml ...]

Underscore-prefixed files (_schema, _template) are skipped. Exit 1 on any validation error.
"""

import sys
from pathlib import Path

import yaml

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "channels" / "_schema.yaml"

RISK_FLOORS = ["HIGH", "MEDIUM", "LOW"]
DIMENSION_FIELDS = ["id", "intent", "example_check"]


def load_yaml(path: Path) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def _nonempty_str(value) -> bool:
    return isinstance(value, str) and value.strip() != ""


def validate_channel(channel: dict, schema: dict) -> list[str]:
    errors: list[str] = []

    if not isinstance(channel, dict):
        return ["Root: channel descriptor must be a YAML mapping"]

    # Required fields (the ONLY thing consulted from the schema).
    for field in schema.get("required", []):
        if field not in channel:
            errors.append(f"Root: missing required field '{field}'")

    # surface must be a non-empty string.
    if "surface" in channel and not _nonempty_str(channel["surface"]):
        errors.append("surface: must be a non-empty string")

    # llm_powered must be a boolean.
    if "llm_powered" in channel and not isinstance(channel["llm_powered"], bool):
        errors.append(f"llm_powered: expected boolean, got {type(channel['llm_powered']).__name__}")

    # risk_floor is advisory but, when present, must be a known tier.
    if "risk_floor" in channel and channel["risk_floor"] not in RISK_FLOORS:
        errors.append(f"risk_floor: '{channel['risk_floor']}' not in allowed values {RISK_FLOORS}")

    # acceptance_dimensions: each item carries id + intent + example_check.
    if "acceptance_dimensions" in channel:
        dims = channel["acceptance_dimensions"]
        if not isinstance(dims, list):
            errors.append("acceptance_dimensions: expected array")
        elif not dims:
            errors.append("acceptance_dimensions: must list at least one dimension")
        else:
            for i, dim in enumerate(dims):
                ctx = f"acceptance_dimensions[{i}]"
                if not isinstance(dim, dict):
                    errors.append(f"{ctx}: expected object")
                    continue
                for field in DIMENSION_FIELDS:
                    if not _nonempty_str(dim.get(field)):
                        errors.append(f"{ctx}: missing or empty '{field}'")

    # eval_hooks required (non-empty) when llm_powered is true.
    if channel.get("llm_powered") is True:
        hooks = channel.get("eval_hooks")
        if not isinstance(hooks, list) or not any(_nonempty_str(str(h)) for h in hooks):
            errors.append("eval_hooks: must be a non-empty array when llm_powered is true")

    return errors


def main():
    paths = sys.argv[1:]
    if not paths:
        print("Usage: validate_channel.py <channel.yaml> [<channel.yaml> ...]")
        sys.exit(1)

    schema = load_yaml(SCHEMA_PATH)
    had_error = False

    for arg in paths:
        channel_path = Path(arg)
        if not channel_path.exists():
            print(f"FAIL — {channel_path}: not found")
            had_error = True
            continue
        if channel_path.stem.startswith("_"):
            print(f"SKIP — {channel_path.name} (underscore-prefixed; not a channel descriptor)")
            continue

        channel = load_yaml(channel_path)
        errors = validate_channel(channel, schema)

        if errors:
            had_error = True
            print(f"FAIL — {channel_path.name}: {len(errors)} validation error(s):")
            for e in errors:
                print(f"  - {e}")
        else:
            print(f"PASS — {channel_path.name} is valid")

    sys.exit(1 if had_error else 0)


if __name__ == "__main__":
    main()
