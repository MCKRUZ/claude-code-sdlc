"""Validate a profile YAML against the schema.

Two layers:
  * structural — profiles/_schema.yaml is JSON Schema (expressed in YAML) and is run through
    jsonschema, so types, enums, patterns, and ranges come straight from the schema of record;
  * semantic — the hand-rolled checks below, which also guard against sections that are present
    but the wrong shape (a list where a mapping belongs) so validation reports a named field
    instead of crashing.
"""

import re
import sys
from pathlib import Path

import jsonschema
import yaml

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "profiles" / "_schema.yaml"


def load_yaml(path: Path) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def validate_required(data: dict, required: list[str], context: str) -> list[str]:
    errors = []
    for field in required:
        if field not in data:
            errors.append(f"{context}: missing required field '{field}'")
    return errors


def validate_type(value, expected_type: str, context: str) -> list[str]:
    type_map = {
        "string": str,
        "integer": int,
        "boolean": bool,
        "array": list,
        "object": dict,
    }
    if expected_type not in type_map:
        return []
    ok = isinstance(value, type_map[expected_type])
    if expected_type == "integer" and isinstance(value, bool):
        ok = False  # bool is an int subclass in Python; an integer field must reject true/false
    if not ok:
        return [f"{context}: expected {expected_type}, got {type(value).__name__}"]
    return []


def validate_enum(value, allowed: list, context: str) -> list[str]:
    if value not in allowed:
        return [f"{context}: '{value}' not in allowed values {allowed}"]
    return []


def validate_range(value: int, minimum: int | None, maximum: int | None, context: str) -> list[str]:
    errors = []
    if minimum is not None and value < minimum:
        errors.append(f"{context}: {value} < minimum {minimum}")
    if maximum is not None and value > maximum:
        errors.append(f"{context}: {value} > maximum {maximum}")
    return errors


def validate_schema_structure(profile: dict, schema: dict) -> list[str]:
    """Structural layer: run the profile through the schema with jsonschema. _schema.yaml is
    JSON Schema expressed in YAML, so types, enums, patterns, and ranges come from the schema
    of record. Toy schemas without a 'properties' map (used by unit tests) skip this layer."""
    if not isinstance(schema, dict) or "properties" not in schema:
        return []
    validator = jsonschema.Draft202012Validator(schema)
    errors = []
    for err in sorted(validator.iter_errors(profile), key=lambda e: e.json_path):
        path = ".".join(str(p) for p in err.absolute_path) or "Root"
        errors.append(f"{path}: {err.message}")
    return errors


# Sections that MUST be mappings when present; wrong shapes get named errors, not crashes.
_TOP_LEVEL_MAPPINGS = ["company", "stack", "quality", "compliance", "conventions", "documentation"]
_STACK_MAPPINGS = ["backend", "frontend", "database", "cloud", "ci_cd"]


def validate_containers(profile: dict) -> list[str]:
    errors = []
    for field in _TOP_LEVEL_MAPPINGS:
        if field in profile and not isinstance(profile[field], dict):
            errors.append(f"{field}: expected object, got {type(profile[field]).__name__}")
    stack = profile.get("stack")
    if isinstance(stack, dict):
        for field in _STACK_MAPPINGS:
            if field in stack and not isinstance(stack[field], dict):
                errors.append(f"stack.{field}: expected object, got {type(stack[field]).__name__}")
    if "tools" in profile:
        if not isinstance(profile["tools"], list):
            errors.append("tools: expected array of pack ids")
        else:
            for i, t in enumerate(profile["tools"]):
                errors.extend(validate_type(t, "string", f"tools[{i}]"))
    return errors


def _validate_company(company: dict) -> list[str]:
    errors = validate_required(company, ["name", "profile_id"], "company")
    if isinstance(company.get("profile_id"), str):
        if not re.match(r"^[a-z0-9-]+$", company["profile_id"]):
            errors.append("company.profile_id: must be kebab-case (a-z, 0-9, hyphens)")
    return errors


def _validate_stack(stack: dict) -> list[str]:
    errors = []
    be = stack.get("backend")
    if isinstance(be, dict):
        errors.extend(validate_required(be, ["language", "framework"], "stack.backend"))
        if "language" in be:
            allowed = ["csharp", "typescript", "python", "java", "go", "rust"]
            errors.extend(validate_enum(be["language"], allowed, "stack.backend.language"))
    cloud = stack.get("cloud")
    if isinstance(cloud, dict) and "provider" in cloud:
        allowed = ["azure", "aws", "gcp", "self-hosted"]
        errors.extend(validate_enum(cloud["provider"], allowed, "stack.cloud.provider"))
    ci_cd = stack.get("ci_cd")
    if isinstance(ci_cd, dict) and "platform" in ci_cd:
        allowed = ["github-actions", "azure-devops", "gitlab-ci", "jenkins", "circleci"]
        errors.extend(validate_enum(ci_cd["platform"], allowed, "stack.ci_cd.platform"))
    return errors


def _validate_quality(q: dict) -> list[str]:
    errors = validate_required(q, ["coverage_minimum"], "quality")
    for field in ["coverage_minimum", "coverage_critical"]:
        if field in q:
            errors.extend(validate_type(q[field], "integer", f"quality.{field}"))
            if isinstance(q[field], int) and not isinstance(q[field], bool):
                errors.extend(validate_range(q[field], 0, 100, f"quality.{field}"))
    for field in ["max_file_lines", "max_function_lines"]:
        if field in q:
            errors.extend(validate_type(q[field], "integer", f"quality.{field}"))
    if "evaluation_criteria" in q:
        if not isinstance(q["evaluation_criteria"], list):
            errors.append("quality.evaluation_criteria: expected array")
        else:
            for i, ec in enumerate(q["evaluation_criteria"]):
                ctx = f"quality.evaluation_criteria[{i}]"
                if not isinstance(ec, dict):
                    errors.append(f"{ctx}: expected object")
                    continue
                errors.extend(validate_required(ec, ["name", "description"], ctx))
                if "severity" in ec:
                    errors.extend(validate_enum(ec["severity"], ["fail", "warn"], f"{ctx}.severity"))
    return errors


def _validate_compliance(comp: dict) -> list[str]:
    errors = []
    if isinstance(comp.get("frameworks"), list):
        allowed = ["soc2", "hipaa", "gdpr", "pci-dss", "iso27001", "none"]
        for fw in comp["frameworks"]:
            errors.extend(validate_enum(fw, allowed, "compliance.frameworks"))
    if "change_approval" in comp:
        allowed = ["peer-review", "manager-approval", "change-board", "none"]
        errors.extend(validate_enum(comp["change_approval"], allowed, "compliance.change_approval"))
    return errors


def validate_profile(profile: dict, schema: dict) -> list[str]:
    if not isinstance(profile, dict):
        return [f"Root: profile must be a mapping, got {type(profile).__name__}"]

    errors = validate_schema_structure(profile, schema)

    # Top-level required fields
    for field in schema.get("required", []):
        if field not in profile:
            errors.append(f"Root: missing required field '{field}'")

    # Container shapes first — the per-section checks below only run on well-shaped sections.
    errors.extend(validate_containers(profile))

    if "version" in profile:
        errors.extend(validate_type(profile["version"], "string", "version"))
    if isinstance(profile.get("company"), dict):
        errors.extend(_validate_company(profile["company"]))
    if isinstance(profile.get("stack"), dict):
        errors.extend(_validate_stack(profile["stack"]))
    if isinstance(profile.get("quality"), dict):
        errors.extend(_validate_quality(profile["quality"]))
    if isinstance(profile.get("compliance"), dict):
        errors.extend(_validate_compliance(profile["compliance"]))
    return errors


def main():
    if len(sys.argv) < 2:
        print("Usage: validate_profile.py <profile.yaml>")
        sys.exit(1)

    profile_path = Path(sys.argv[1])
    if not profile_path.exists():
        print(f"Error: {profile_path} not found")
        sys.exit(1)

    schema = load_yaml(SCHEMA_PATH)
    profile = load_yaml(profile_path)

    errors = validate_profile(profile, schema)

    if errors:
        print(f"FAIL — {len(errors)} validation error(s):")
        for e in errors:
            print(f"  ✗ {e}")
        sys.exit(1)
    else:
        print(f"PASS — {profile_path.name} is valid")
        sys.exit(0)


if __name__ == "__main__":
    main()
