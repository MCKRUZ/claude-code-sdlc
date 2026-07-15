"""Tests for the additive sign-off keys in advance_phase.py.

Two independent guarantees:
  1. With no flags, an advance is byte-for-byte the old behaviour — no signed_off_by
     scalar inside gate_results and no sign_offs sibling key.
  2. With flags, the human sign-off is a scalar in gate_results (audit ignores scalars)
     and the per-discipline sign-offs are a list of dicts on a SIBLING key — never inside
     gate_results — so audit_gates.extract_gate_history returns the SAME row count with and
     without the flags (no phantom rows).
"""

from pathlib import Path

import yaml

import phase_model as pm
from advance_phase import advance
from audit_gates import extract_gate_history

# The five Phase 0 required artifacts, with real (placeholder-free) content so
# every MUST gate passes and the advance actually happens.
PHASE0_ARTIFACTS = {
    "problem-statement.md": "# Problem Statement\n\nWe need a better claims process.\n\n## Scope\nIn scope: everything.\n",
    "constitution.md": "# Constitution\n\nCore principles and constraints for this project.\n",
    "success-criteria.md": "# Success Criteria\n\nThe project succeeds when all users can log in.\n",
    "constraints.md": "# Constraints\n\nMust use the existing infrastructure.\n",
    "phase1-handoff.md": "# Phase 1 Handoff\n\nReady for the requirements phase.\n",
}


def make_project(root, profile):
    """A fresh .sdlc at `root` sitting on Phase 0 with all MUST gates satisfied."""
    sdlc = root / ".sdlc"
    artifacts = sdlc / "artifacts"
    artifacts.mkdir(parents=True)
    for p in pm.all_phases():
        (artifacts / p["slug"]).mkdir(parents=True, exist_ok=True)

    disc = artifacts / pm.artifact_dirname("0")
    for name, content in PHASE0_ARTIFACTS.items():
        (disc / name).write_text(content, encoding="utf-8")

    state = {
        "version": "1.0",
        "profile_id": profile["company"]["profile_id"],
        "project_name": "test-project",
        "current_phase": "0",
        "phase_name": "discovery",
        "phases": {
            "0": {"name": "discovery", "status": "active", "entered_at": "2026-03-17T10:00:00+00:00",
                  "completed_at": None, "gate_results": {}, "artifacts": []},
            "1": {"name": "requirements", "status": "pending", "entered_at": None,
                  "completed_at": None, "gate_results": {}, "artifacts": []},
        },
        "history": [],
    }
    (sdlc / "state.yaml").write_text(yaml.safe_dump(state, sort_keys=False), encoding="utf-8")
    (sdlc / "profile.yaml").write_text(yaml.safe_dump(profile, sort_keys=False), encoding="utf-8")
    return sdlc / "state.yaml"


def load(state_path):
    return yaml.safe_load(Path(state_path).read_text(encoding="utf-8"))


class TestNoFlags:
    def test_gate_results_has_no_signoff_keys(self, tmp_path, valid_profile):
        state_path = make_project(tmp_path / "plain", valid_profile)
        rc = advance(state_path, confirmed=True)
        assert rc == 0
        phase0 = load(state_path)["phases"]["0"]
        assert "signed_off_by" not in phase0["gate_results"]
        assert "sign_offs" not in phase0


class TestWithFlags:
    def test_scalar_signoff_and_sibling_list(self, tmp_path, valid_profile):
        state_path = make_project(tmp_path / "signed", valid_profile)
        rc = advance(
            state_path,
            confirmed=True,
            signed_by="Jane",
            discipline_signoffs=["Design:interaction-specs:Ken"],
        )
        assert rc == 0
        phase0 = load(state_path)["phases"]["0"]

        # Scalar sign-off lives inside gate_results (safe: the auditor skips scalars).
        assert phase0["gate_results"]["signed_off_by"] == "Jane"

        # Per-discipline sign-offs are a list of dicts on a SIBLING key, not gate_results.
        assert "sign_offs" not in phase0["gate_results"]
        sign_offs = phase0["sign_offs"]
        assert isinstance(sign_offs, list)
        assert sign_offs[0]["discipline"] == "Design"
        assert sign_offs[0]["section"] == "interaction-specs"
        assert sign_offs[0]["by"] == "Ken"
        assert sign_offs[0]["at"]  # timestamp recorded


class TestAuditSafety:
    def test_signoff_never_creates_phantom_audit_rows(self, tmp_path, valid_profile):
        plain = make_project(tmp_path / "a", valid_profile)
        advance(plain, confirmed=True)
        rows_plain = extract_gate_history(load(plain))

        signed = make_project(tmp_path / "b", valid_profile)
        advance(
            signed,
            confirmed=True,
            signed_by="Jane",
            discipline_signoffs=["Design:interaction-specs:Ken", "Data:data-contract:Mira"],
        )
        rows_signed = extract_gate_history(load(signed))

        # Same number of audit rows with and without the sign-off flags.
        assert len(rows_signed) == len(rows_plain)
        # No discipline sign-off leaked into the audit as a phantom row.
        assert not any(r.get("by") in {"Ken", "Mira"} for r in rows_signed)
