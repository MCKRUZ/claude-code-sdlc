"""Tests for validate_profile.py."""

import pytest

from validate_profile import (
    validate_enum,
    validate_profile,
    validate_range,
    validate_required,
    validate_type,
)


class TestValidateRequired:
    def test_all_present(self):
        data = {"a": 1, "b": 2}
        assert validate_required(data, ["a", "b"], "ctx") == []

    def test_missing_field(self):
        data = {"a": 1}
        errors = validate_required(data, ["a", "b"], "ctx")
        assert len(errors) == 1
        assert "'b'" in errors[0]

    def test_all_missing(self):
        errors = validate_required({}, ["a", "b"], "ctx")
        assert len(errors) == 2

    def test_empty_required(self):
        assert validate_required({"a": 1}, [], "ctx") == []


class TestValidateType:
    @pytest.mark.parametrize("value,expected_type", [
        ("hello", "string"),
        (42, "integer"),
        (True, "boolean"),
        ([1, 2], "array"),
        ({"a": 1}, "object"),
    ])
    def test_correct_types(self, value, expected_type):
        assert validate_type(value, expected_type, "ctx") == []

    @pytest.mark.parametrize("value,expected_type", [
        (42, "string"),
        ("hello", "integer"),
        ("true", "boolean"),
        ("not a list", "array"),
        ("not a dict", "object"),
    ])
    def test_wrong_types(self, value, expected_type):
        errors = validate_type(value, expected_type, "ctx")
        assert len(errors) == 1
        assert "expected" in errors[0]


class TestValidateEnum:
    def test_valid_value(self):
        assert validate_enum("a", ["a", "b", "c"], "ctx") == []

    def test_invalid_value(self):
        errors = validate_enum("d", ["a", "b", "c"], "ctx")
        assert len(errors) == 1
        assert "'d'" in errors[0]


class TestValidateRange:
    def test_within_range(self):
        assert validate_range(50, 0, 100, "ctx") == []

    def test_at_boundaries(self):
        assert validate_range(0, 0, 100, "ctx") == []
        assert validate_range(100, 0, 100, "ctx") == []

    def test_below_minimum(self):
        errors = validate_range(-1, 0, 100, "ctx")
        assert len(errors) == 1
        assert "minimum" in errors[0]

    def test_above_maximum(self):
        errors = validate_range(101, 0, 100, "ctx")
        assert len(errors) == 1
        assert "maximum" in errors[0]

    def test_none_bounds(self):
        assert validate_range(999, None, None, "ctx") == []
        assert validate_range(50, None, 100, "ctx") == []
        assert validate_range(50, 0, None, "ctx") == []


class TestValidateProfile:
    def test_valid_full_profile(self, valid_profile):
        schema = {"required": ["version", "company", "stack", "quality"]}
        errors = validate_profile(valid_profile, schema)
        assert errors == []

    def test_valid_minimal_profile(self, minimal_profile):
        schema = {"required": ["version", "company", "stack", "quality"]}
        errors = validate_profile(minimal_profile, schema)
        assert errors == []

    def test_missing_required_top_level(self):
        profile = {"version": "1.0"}
        schema = {"required": ["version", "company", "stack", "quality"]}
        errors = validate_profile(profile, schema)
        assert len(errors) == 3  # missing company, stack, quality

    def test_invalid_profile_id_uppercase(self):
        profile = {
            "version": "1.0",
            "company": {"name": "Test", "profile_id": "Invalid-ID"},
            "stack": {"backend": {"language": "csharp", "framework": "dotnet-8"}},
            "quality": {"coverage_minimum": 80},
        }
        schema = {"required": ["version", "company", "stack", "quality"]}
        errors = validate_profile(profile, schema)
        assert any("kebab-case" in e for e in errors)

    def test_invalid_backend_language(self):
        profile = {
            "version": "1.0",
            "company": {"name": "Test", "profile_id": "test"},
            "stack": {"backend": {"language": "cobol", "framework": "mainframe"}},
            "quality": {"coverage_minimum": 80},
        }
        schema = {"required": ["version", "company", "stack", "quality"]}
        errors = validate_profile(profile, schema)
        assert any("cobol" in e for e in errors)

    def test_invalid_cloud_provider(self):
        profile = {
            "version": "1.0",
            "company": {"name": "Test", "profile_id": "test"},
            "stack": {
                "backend": {"language": "csharp", "framework": "dotnet"},
                "cloud": {"provider": "heroku"},
            },
            "quality": {"coverage_minimum": 80},
        }
        schema = {"required": ["version", "company", "stack", "quality"]}
        errors = validate_profile(profile, schema)
        assert any("heroku" in e for e in errors)

    def test_invalid_ci_cd_platform(self):
        profile = {
            "version": "1.0",
            "company": {"name": "Test", "profile_id": "test"},
            "stack": {
                "backend": {"language": "csharp", "framework": "dotnet"},
                "ci_cd": {"platform": "bamboo"},
            },
            "quality": {"coverage_minimum": 80},
        }
        schema = {"required": ["version", "company", "stack", "quality"]}
        errors = validate_profile(profile, schema)
        assert any("bamboo" in e for e in errors)

    def test_coverage_out_of_range(self):
        profile = {
            "version": "1.0",
            "company": {"name": "Test", "profile_id": "test"},
            "stack": {"backend": {"language": "csharp", "framework": "dotnet"}},
            "quality": {"coverage_minimum": 150},
        }
        schema = {"required": ["version", "company", "stack", "quality"]}
        errors = validate_profile(profile, schema)
        assert any("maximum" in e for e in errors)

    def test_invalid_compliance_framework(self):
        profile = {
            "version": "1.0",
            "company": {"name": "Test", "profile_id": "test"},
            "stack": {"backend": {"language": "csharp", "framework": "dotnet"}},
            "quality": {"coverage_minimum": 80},
            "compliance": {"frameworks": ["sox"]},
        }
        schema = {"required": ["version", "company", "stack", "quality"]}
        errors = validate_profile(profile, schema)
        assert any("sox" in e for e in errors)

    def test_invalid_change_approval(self):
        profile = {
            "version": "1.0",
            "company": {"name": "Test", "profile_id": "test"},
            "stack": {"backend": {"language": "csharp", "framework": "dotnet"}},
            "quality": {"coverage_minimum": 80},
            "compliance": {"change_approval": "self-approval"},
        }
        schema = {"required": ["version", "company", "stack", "quality"]}
        errors = validate_profile(profile, schema)
        assert any("self-approval" in e for e in errors)

    def test_missing_company_fields(self):
        profile = {
            "version": "1.0",
            "company": {},
            "stack": {"backend": {"language": "csharp", "framework": "dotnet"}},
            "quality": {"coverage_minimum": 80},
        }
        schema = {"required": ["version", "company", "stack", "quality"]}
        errors = validate_profile(profile, schema)
        assert any("name" in e for e in errors)
        assert any("profile_id" in e for e in errors)

    def test_missing_backend_fields(self):
        profile = {
            "version": "1.0",
            "company": {"name": "Test", "profile_id": "test"},
            "stack": {"backend": {}},
            "quality": {"coverage_minimum": 80},
        }
        schema = {"required": ["version", "company", "stack", "quality"]}
        errors = validate_profile(profile, schema)
        assert any("language" in e for e in errors)
        assert any("framework" in e for e in errors)


SCHEMA = {"required": ["version", "company", "stack", "quality"]}


def _base_profile():
    return {
        "version": "1.0",
        "company": {"name": "Test", "profile_id": "test"},
        "stack": {"backend": {"language": "csharp", "framework": "dotnet"}},
        "quality": {"coverage_minimum": 80},
    }


class TestContainerTypes:
    """Sections present but of the wrong shape produce named errors, never zero errors or a crash."""

    @pytest.mark.parametrize("field,value", [
        ("company", "acme"), ("company", ["acme"]),
        ("stack", "csharp"), ("stack", ["backend"]),
        ("quality", [80]), ("quality", "high"),
    ])
    def test_wrong_top_level_container(self, field, value):
        errors = validate_profile({**_base_profile(), field: value}, SCHEMA)
        assert any(e.startswith(f"{field}:") for e in errors), errors

    @pytest.mark.parametrize("field,value", [
        ("backend", "csharp"),
        ("frontend", ["angular"]),
        ("ci_cd", "github-actions"),
        ("cloud", "azure"),
    ])
    def test_wrong_stack_section_container(self, field, value):
        profile = _base_profile()
        profile["stack"] = {**profile["stack"], field: value}
        errors = validate_profile(profile, SCHEMA)
        assert any(f"stack.{field}" in e for e in errors), errors

    def test_tools_must_be_list(self):
        errors = validate_profile({**_base_profile(), "tools": "gitnexus"}, SCHEMA)
        assert any(e.startswith("tools:") for e in errors)

    def test_tools_items_must_be_strings(self):
        errors = validate_profile({**_base_profile(), "tools": ["gitnexus", 42]}, SCHEMA)
        assert any("tools[1]" in e for e in errors)

    def test_profile_itself_must_be_mapping(self):
        errors = validate_profile(["not", "a", "profile"], SCHEMA)
        assert len(errors) == 1 and "mapping" in errors[0]


class TestBoolNotInteger:
    """isinstance(True, int) is True in Python — bools must not pass integer fields."""

    def test_validate_type_rejects_bool_for_integer(self):
        errors = validate_type(True, "integer", "ctx")
        assert len(errors) == 1 and "bool" in errors[0]

    def test_validate_type_still_accepts_real_integers(self):
        assert validate_type(80, "integer", "ctx") == []

    def test_coverage_minimum_true_fails(self):
        profile = _base_profile()
        profile["quality"] = {"coverage_minimum": True}
        errors = validate_profile(profile, SCHEMA)
        assert any("coverage_minimum" in e for e in errors), errors


class TestSchemaStructuralLayer:
    """The real _schema.yaml is JSON Schema (in YAML); validate_profile runs it through
    jsonschema as the structural layer. Toy schemas without 'properties' skip that layer."""

    @pytest.fixture
    def real_schema(self):
        from validate_profile import SCHEMA_PATH, load_yaml
        return load_yaml(SCHEMA_PATH)

    def test_valid_profile_passes_real_schema(self, valid_profile, real_schema):
        assert validate_profile(valid_profile, real_schema) == []

    def test_minimal_profile_passes_real_schema(self, minimal_profile, real_schema):
        assert validate_profile(minimal_profile, real_schema) == []

    def test_version_pattern_enforced_by_schema(self, valid_profile, real_schema):
        # Only the jsonschema layer knows the ^\d+\.\d+$ pattern — proves it is genuinely wired.
        errors = validate_profile({**valid_profile, "version": "one"}, real_schema)
        assert any(e.startswith("version") for e in errors), errors

    def test_bool_coverage_fails_real_schema(self, valid_profile, real_schema):
        bad = {**valid_profile, "quality": {**valid_profile["quality"], "coverage_minimum": True}}
        errors = validate_profile(bad, real_schema)
        assert any("coverage_minimum" in e for e in errors), errors

    def test_wrong_container_fails_real_schema(self, valid_profile, real_schema):
        errors = validate_profile({**valid_profile, "stack": ["csharp"]}, real_schema)
        assert any(e.startswith("stack:") for e in errors), errors
