"""Shared fixtures for SDLC script tests."""

from pathlib import Path

import pytest
import yaml


PLUGIN_ROOT = Path(__file__).resolve().parent.parent.parent


@pytest.fixture
def plugin_root():
    return PLUGIN_ROOT


@pytest.fixture
def valid_profile():
    return {
        "version": "1.0",
        "company": {
            "name": "Test Corp",
            "profile_id": "test-profile",
        },
        "stack": {
            "backend": {
                "language": "csharp",
                "framework": "dotnet-8",
                "orm": "ef-core",
                "testing": "xunit",
            },
            "frontend": {
                "language": "typescript",
                "framework": "angular-17",
            },
            "cloud": {
                "provider": "azure",
                "services": ["app-service", "azure-sql"],
            },
            "ci_cd": {
                "platform": "github-actions",
            },
        },
        "quality": {
            "coverage_minimum": 80,
            "coverage_critical": 100,
            "max_file_lines": 800,
            "max_function_lines": 50,
            "require_tdd": True,
            "require_code_review": True,
            "require_security_review": True,
        },
        "compliance": {
            "frameworks": ["soc2"],
            "audit_trail": True,
            "change_approval": "peer-review",
        },
        "conventions": {
            "commit_format": "type: description",
            "branch_naming": "type/ticket-description",
            "immutability": True,
            "no_console_log": True,
        },
    }


@pytest.fixture
def minimal_profile():
    return {
        "version": "1.0",
        "company": {
            "name": "Minimal",
            "profile_id": "minimal",
        },
        "stack": {
            "backend": {
                "language": "typescript",
                "framework": "node",
            },
        },
        "quality": {
            "coverage_minimum": 60,
        },
    }


@pytest.fixture
def tmp_project(tmp_path):
    """Create a temporary project directory for testing."""
    return tmp_path / "test-project"


@pytest.fixture
def sdlc_dir(tmp_path):
    """Create a temporary .sdlc directory with state and profile."""
    sdlc = tmp_path / ".sdlc"
    sdlc.mkdir()
    artifacts = sdlc / "artifacts"
    artifacts.mkdir()
    for i, name in enumerate([
        "discovery", "requirements", "design", "planning",
        "implementation", "quality", "testing", "documentation",
        "deployment", "monitoring",
    ]):
        (artifacts / f"{i:02d}-{name}").mkdir()
    return sdlc


@pytest.fixture
def state_yaml(sdlc_dir, valid_profile):
    """Write a valid state.yaml and profile.yaml into sdlc_dir."""
    state = {
        "version": "1.0",
        "profile_id": "test-profile",
        "project_name": "test-project",
        "created_at": "2026-03-17T10:00:00+00:00",
        "current_phase": 0,
        "phase_name": "discovery",
        "phases": {
            0: {"name": "discovery", "status": "active", "entered_at": "2026-03-17T10:00:00+00:00", "completed_at": None, "gate_results": {}, "artifacts": []},
            1: {"name": "requirements", "status": "pending", "entered_at": None, "completed_at": None, "gate_results": {}, "artifacts": []},
        },
        "history": [],
    }
    state_path = sdlc_dir / "state.yaml"
    with open(state_path, "w") as f:
        yaml.dump(state, f, default_flow_style=False)

    profile_path = sdlc_dir / "profile.yaml"
    with open(profile_path, "w") as f:
        yaml.dump(valid_profile, f, default_flow_style=False)

    return state_path
