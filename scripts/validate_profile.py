"""Validate a profile YAML against the schema."""

import sys
from pathlib import Path

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
    if expected_type in type_map and not isinstance(value, type_map[expected_type]):
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


def validate_profile(profile: dict, schema: dict) -> list[str]:
    errors = []

    # Top-level required fields
    for field in schema.get("required", []):
        if field not in profile:
            errors.append(f"Root: missing required field '{field}'")

    # Version
    if "version" in profile:
        errors.extend(validate_type(profile["version"], "string", "version"))

    # Company
    if "company" in profile:
        company = profile["company"]
        errors.extend(validate_required(company, ["name", "profile_id"], "company"))
        if "profile_id" in company:
            import re
            if not re.match(r"^[a-z0-9-]+$", company["profile_id"]):
                errors.append("company.profile_id: must be kebab-case (a-z, 0-9, hyphens)")

    # Stack
    if "stack" in profile:
        stack = profile["stack"]
        if "backend" in stack:
            be = stack["backend"]
            errors.extend(validate_required(be, ["language", "framework"], "stack.backend"))
            if "language" in be:
                allowed = ["csharp", "typescript", "python", "java", "go", "rust"]
                errors.extend(validate_enum(be["language"], allowed, "stack.backend.language"))
        if "cloud" in stack and "provider" in stack["cloud"]:
            allowed = ["azure", "aws", "gcp", "self-hosted"]
            errors.extend(validate_enum(stack["cloud"]["provider"], allowed, "stack.cloud.provider"))
        if "ci_cd" in stack and "platform" in stack["ci_cd"]:
            allowed = ["github-actions", "azure-devops", "gitlab-ci", "jenkins", "circleci"]
            errors.extend(validate_enum(stack["ci_cd"]["platform"], allowed, "stack.ci_cd.platform"))

    # Quality
    if "quality" in profile:
        q = profile["quality"]
        errors.extend(validate_required(q, ["coverage_minimum"], "quality"))
        for field in ["coverage_minimum", "coverage_critical"]:
            if field in q:
                errors.extend(validate_type(q[field], "integer", f"quality.{field}"))
                if isinstance(q[field], int):
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
                        errors.extend(
                            validate_enum(ec["severity"], ["fail", "warn"], f"{ctx}.severity")
                        )

    # Compliance
    if "compliance" in profile:
        comp = profile["compliance"]
        if "frameworks" in comp:
            allowed = ["soc2", "hipaa", "gdpr", "pci-dss", "iso27001", "none"]
            for fw in comp["frameworks"]:
                errors.extend(validate_enum(fw, allowed, "compliance.frameworks"))
        if "change_approval" in comp:
            allowed = ["peer-review", "manager-approval", "change-board", "none"]
            errors.extend(validate_enum(comp["change_approval"], allowed, "compliance.change_approval"))

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
