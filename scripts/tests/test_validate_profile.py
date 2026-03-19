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
