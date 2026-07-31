"""Tests for check_gates.py."""

from pathlib import Path

import pytest
import yaml

import phase_model as pm
from check_gates import (
    check_artifact_complete,
    check_artifact_exists,
    check_artifact_not_empty,
    check_exit_criteria,
    check_phase_gates,
    format_results,
)


class TestCheckArtifactExists:
    def test_file_exists(self, tmp_path):
        (tmp_path / "readme.md").write_text("content")
        passed, msg = check_artifact_exists(tmp_path, "readme.md")
        assert passed is True
        assert "exists" in msg

    def test_file_missing(self, tmp_path):
        passed, msg = check_artifact_exists(tmp_path, "missing.md")
        assert passed is False
        assert "Missing" in msg

    def test_dir_exists_with_files(self, tmp_path):
        d = tmp_path / "reports"
        d.mkdir()
        (d / "report.md").write_text("content")
        passed, msg = check_artifact_exists(tmp_path, "reports")
        assert passed is True
        assert "1 item" in msg

    def test_dir_exists_empty(self, tmp_path):
        (tmp_path / "reports").mkdir()
        passed, msg = check_artifact_exists(tmp_path, "reports")
        assert passed is False
        assert "empty" in msg


class TestCheckArtifactNotEmpty:
    def test_file_with_content(self, tmp_path):
        (tmp_path / "doc.md").write_text("Hello world")
        passed, msg = check_artifact_not_empty(tmp_path, "doc.md")
        assert passed is True

    def test_empty_file(self, tmp_path):
        (tmp_path / "doc.md").write_text("")
        passed, msg = check_artifact_not_empty(tmp_path, "doc.md")
        assert passed is False
        assert "empty" in msg

    def test_whitespace_only_file(self, tmp_path):
        (tmp_path / "doc.md").write_text("   \n  \n  ")
        passed, msg = check_artifact_not_empty(tmp_path, "doc.md")
        assert passed is False
        assert "empty" in msg

    def test_missing_file(self, tmp_path):
        passed, msg = check_artifact_not_empty(tmp_path, "missing.md")
        assert passed is False
        assert "Missing" in msg


class TestCheckArtifactComplete:
    def test_complete_content(self, tmp_path):
        (tmp_path / "doc.md").write_text("# Problem Statement\n\nThis is a real document.")
        passed, msg = check_artifact_complete(tmp_path, "doc.md")
        assert passed is True
        assert "complete" in msg

    def test_contains_todo(self, tmp_path):
        (tmp_path / "doc.md").write_text("# Doc\n\nTODO: fill this in")
        passed, msg = check_artifact_complete(tmp_path, "doc.md")
        assert passed is False
        assert "placeholder" in msg

    def test_contains_tbd(self, tmp_path):
        (tmp_path / "doc.md").write_text("# Doc\n\nStatus: TBD")
        passed, msg = check_artifact_complete(tmp_path, "doc.md")
        assert passed is False
        assert "TBD" in str(msg)

    def test_contains_template_variable(self, tmp_path):
        (tmp_path / "doc.md").write_text("Name: ${PROJECT_NAME}")
        passed, msg = check_artifact_complete(tmp_path, "doc.md")
        assert passed is False
        assert "${" in str(msg)

    def test_contains_placeholder_keyword(self, tmp_path):
        (tmp_path / "doc.md").write_text("Description: PLACEHOLDER")
        passed, msg = check_artifact_complete(tmp_path, "doc.md")
        assert passed is False

    def test_contains_insert_bracket(self, tmp_path):
        (tmp_path / "doc.md").write_text("Author: [INSERT NAME]")
        passed, msg = check_artifact_complete(tmp_path, "doc.md")
        assert passed is False

    def test_directory_of_real_files_is_complete(self, tmp_path):
        """Named for what it checks: directories are no longer complete unconditionally.

        See TestDirectoryCompleteness — the contents are now checked too.
        """
        d = tmp_path / "reports"
        d.mkdir()
        (d / "file.md").write_text("content")
        passed, msg = check_artifact_complete(tmp_path, "reports")
        assert passed is True

    def test_missing_file(self, tmp_path):
        passed, msg = check_artifact_complete(tmp_path, "missing.md")
        assert passed is False


class TestCheckPhaseGates:
    def test_phase_0_no_artifacts(self, sdlc_dir, valid_profile, state_yaml):
        state = yaml.safe_load(state_yaml.read_text())
        results = check_phase_gates(0, state, valid_profile, sdlc_dir / "artifacts")
        # Phase 0 requires problem-statement.md
        failures = [r for r in results if r["passed"] is False]
        assert len(failures) > 0

    def test_phase_0_with_artifact(self, sdlc_dir, valid_profile, state_yaml):
        # Create all required Phase 0 artifacts
        discovery_dir = sdlc_dir / "artifacts" / "00-discovery"
        (discovery_dir / "problem-statement.md").write_text(
            "# Problem Statement\n\nWe need a better process.\n\n## Scope\nIn scope: everything."
        )
        (discovery_dir / "constitution.md").write_text(
            "# Constitution\n\nCore principles and constraints for this project."
        )
        (discovery_dir / "success-criteria.md").write_text(
            "# Success Criteria\n\nThe project succeeds when all users can log in."
        )
        (discovery_dir / "constraints.md").write_text(
            "# Constraints\n\nMust use existing infrastructure."
        )
        (discovery_dir / "phase1-handoff.md").write_text(
            "# Phase 1 Handoff\n\nReady for requirements phase."
        )
        state = yaml.safe_load(state_yaml.read_text())
        results = check_phase_gates(0, state, valid_profile, sdlc_dir / "artifacts")
        must_failures = [r for r in results if r["passed"] is False and r.get("severity") == "MUST"]
        assert len(must_failures) == 0

    def test_invalid_phase_id(self, sdlc_dir, valid_profile, state_yaml):
        state = yaml.safe_load(state_yaml.read_text())
        results = check_phase_gates(99, state, valid_profile, sdlc_dir / "artifacts")
        assert len(results) == 1
        assert results[0]["passed"] is False
        assert "not found" in results[0]["message"]

    def test_compliance_gates_loaded(self, sdlc_dir, state_yaml):
        """Phase 1 with SOC 2 should include compliance gates.

        Uses microsoft-enterprise profile_id so get_compliance_gates finds the
        actual soc2-gates.yaml on disk.
        """
        # Build a profile whose profile_id matches the real on-disk directory
        ms_profile = {
            "company": {"name": "MS Test", "profile_id": "microsoft-enterprise"},
            "quality": {"coverage_minimum": 80},
            "compliance": {"frameworks": ["soc2"]},
        }
        req_dir = sdlc_dir / "artifacts" / "01-requirements"
        (req_dir / "requirements.md").write_text(
            "# Requirements\n\nAuthentication and authorization are required."
        )
        (req_dir / "acceptance-criteria.md").write_text(
            "# Acceptance Criteria\n\nGiven a user, when they log in, then they see the dashboard."
        )
        state = yaml.safe_load(state_yaml.read_text())
        results = check_phase_gates(1, state, ms_profile, sdlc_dir / "artifacts")
        compliance_gates = [r for r in results if "compliance" in r["gate"]]
        # Should have at least one SOC 2 gate for phase 1
        assert len(compliance_gates) >= 1


class TestExitCriteriaGate:
    """G7 — the registry's prose exit conditions must reach the human who signs.

    Every phase declares `exit_gate.conditions[]`. Before this gate existed, no code
    read them: the human was stopped at the gate, shown a list of files that exist and
    contain no placeholders, and asked to approve. The checklist they were approving
    against was never rendered.
    """

    def _exit_criteria(self, results):
        return [r for r in results if r["gate"] == "G7-exit-criteria"]

    def test_prose_conditions_are_surfaced_for_review(self, sdlc_dir, valid_profile, state_yaml):
        """Phase 3 declares three prose conditions; each must appear as a REVIEW item."""
        state = yaml.safe_load(state_yaml.read_text())
        results = check_phase_gates(3, state, valid_profile, sdlc_dir / "artifacts")

        criteria = self._exit_criteria(results)
        assert len(criteria) == 3, "Phase 3's three prose exit conditions must all be surfaced"
        assert all(r["passed"] is None for r in criteria), "prose conditions are human-verified"

        messages = " ".join(r["message"] for r in criteria)
        assert "Walking skeleton deployed" in messages
        assert "The rails are proven, not just present" in messages
        assert "At least one HIGH-risk spec has run the full Build loop" in messages

    def test_artifact_conditions_are_not_duplicated(self, sdlc_dir, valid_profile, state_yaml):
        """Conditions carrying an `artifact:` key are already covered by G1/G2."""
        state = yaml.safe_load(state_yaml.read_text())
        results = check_phase_gates(3, state, valid_profile, sdlc_dir / "artifacts")

        for r in self._exit_criteria(results):
            assert "artifact" not in r, f"artifact condition re-emitted by G7: {r}"

    def test_phase_with_no_prose_conditions_emits_none(self):
        """A phase whose conditions are ALL artifact entries must produce no G7 items.

        This used to point at Phase 0 as its example. Phase 0 now declares real prose
        conditions — the opening phases had only file-existence checks, so the approver was
        never shown a judgement call — so the example moved into the test. Asserting a property
        of the code beats asserting a property of today's registry data.
        """
        phase_def = {
            "exit_gate": {"conditions": [
                {"artifact": "design-doc.md", "check": "exists_and_complete"},
                {"artifact": "adrs/", "check": "exists_and_complete"},
            ]}
        }
        assert check_exit_criteria(phase_def) == []

    def test_the_opening_phases_declare_judgement_calls(self):
        """Phases 0-2 must each put something a human actually has to decide at the gate.

        A phase whose entire exit gate is "these files exist and contain no TODO" asks the
        approver to sign for work nobody assessed. That is the shape of a rubber stamp.
        """
        for phase_id in ("0", "1", "2"):
            surfaced = check_exit_criteria(pm.get_phase(phase_id))
            assert surfaced, f"phase {phase_id} surfaces no human-verified exit condition"

    def test_exit_criteria_never_block(self, sdlc_dir, valid_profile, state_yaml):
        """A human decides these. They must never turn into a MUST failure."""
        state = yaml.safe_load(state_yaml.read_text())
        results = check_phase_gates(3, state, valid_profile, sdlc_dir / "artifacts")

        blocking = [
            r for r in self._exit_criteria(results)
            if r["passed"] is False and r.get("severity") == "MUST"
        ]
        assert blocking == [], "exit criteria are reported, not enforced — gates report, humans decide"

    def test_build_loop_condition_is_surfaced(self, sdlc_dir, valid_profile, state_yaml):
        """The Build loop's single condition is the human declaration itself."""
        state = yaml.safe_load(state_yaml.read_text())
        results = check_phase_gates("build", state, valid_profile, sdlc_dir / "artifacts")

        criteria = self._exit_criteria(results)
        assert len(criteria) == 1
        assert "feature-complete" in criteria[0]["message"]

    def test_all_declared_prose_conditions_reach_the_human(self, sdlc_dir, valid_profile, state_yaml):
        """Whatever the registry declares, G7 renders. No phase's checklist goes unread."""
        import phase_model as pm

        state = yaml.safe_load(state_yaml.read_text())
        for phase in pm.all_phases():
            declared = [
                c for c in (phase.get("exit_gate", {}) or {}).get("conditions", []) or []
                if isinstance(c, dict) and "artifact" not in c and "check" in c
            ]
            results = check_phase_gates(
                phase["id"], state, valid_profile, sdlc_dir / "artifacts"
            )
            surfaced = self._exit_criteria(results)
            assert len(surfaced) == len(declared), (
                f"phase {phase['id']}: declared {len(declared)} prose conditions, "
                f"surfaced {len(surfaced)}"
            )


class TestFormatResults:
    def test_all_pass(self):
        results = [
            {"gate": "G1", "passed": True, "message": "OK", "severity": "MUST"},
        ]
        output = format_results(results, 0)
        assert "COMPLIANT" in output
        assert "ALL GATES COMPLIANT" in output

    def test_has_failures(self):
        results = [
            {"gate": "G1", "passed": False, "message": "Missing file", "severity": "MUST"},
        ]
        output = format_results(results, 0)
        assert "NON-COMPLIANT" in output
        assert "BLOCKED" in output

    def test_manual_checks(self):
        results = [
            {"gate": "G1", "passed": True, "message": "OK", "severity": "MUST"},
            {"gate": "G4", "passed": None, "message": "Manual check", "severity": "MUST"},
        ]
        output = format_results(results, 0)
        assert "REVIEW" in output

    def test_summary_counts(self):
        results = [
            {"gate": "G1", "passed": True, "message": "OK", "severity": "MUST"},
            {"gate": "G2", "passed": False, "message": "Fail", "severity": "MUST"},
            {"gate": "G3", "passed": None, "message": "Manual", "severity": "SHOULD"},
        ]
        output = format_results(results, 0)
        assert "1 compliant" in output
        assert "1 non-compliant" in output
        assert "1 review" in output
        assert "3 total" in output


# ── D-2: repo-root artifacts are the real files, not copies ───────────────────

def _phase7_artifacts(sdlc_dir, repo_root, *, in_repo=(), in_phase=(), receipts=True):
    """Lay down Phase 7's artifacts, choosing which live where.

    `receipts` writes the Fix 3 human receipts (the cold README verification and the RUNBOOK
    walkthrough). They are required for a service, so tests about *other* Phase 7 behaviour need
    them present or they fail for an unrelated reason.
    """
    body = "# Doc\n\nReal content that a stranger could follow, with no placeholders.\n"
    for name in in_repo:
        (repo_root / name).write_text(body, encoding="utf-8")
    phase_dir = sdlc_dir / "artifacts" / "07-documentation"
    if receipts:
        for name in ("readme-verification.md", "runbook-walkthrough.md"):
            (phase_dir / name).write_text(body, encoding="utf-8")
    for name in in_phase:
        (phase_dir / name).write_text(body, encoding="utf-8")


def _failures(results, artifact):
    return [r for r in results if r.get("artifact") == artifact and r["passed"] is False]


class TestRepoRootArtifacts:
    """Phase 7 proves a stranger can run the project — so it must check the file they'd read.

    The gate used to resolve every artifact under .sdlc/artifacts/07-documentation/. A team
    either duplicated README.md there, where it drifted from the real one by the next commit,
    or the phase never closed. The phase whose whole purpose is 'prove this works cold'
    validated a file no stranger would ever open.
    """

    def test_readme_at_the_repo_root_satisfies_the_gate(self, sdlc_dir, valid_profile, state_yaml):
        repo_root = sdlc_dir.parent
        state = yaml.safe_load(state_yaml.read_text())
        state["project_type"] = "service"
        _phase7_artifacts(sdlc_dir, repo_root,
                          in_repo=["README.md", "RUNBOOK.md"],
                          in_phase=["api-docs.md", "phase8-handoff.md"])
        results = check_phase_gates(7, state, valid_profile, sdlc_dir / "artifacts")
        assert not [r for r in results if r["passed"] is False], [r["message"] for r in results if r["passed"] is False]

    def test_a_copy_under_sdlc_does_not_satisfy_the_gate(self, sdlc_dir, valid_profile, state_yaml):
        """The copy is exactly what drifts — it must not count as the deliverable."""
        repo_root = sdlc_dir.parent
        state = yaml.safe_load(state_yaml.read_text())
        state["project_type"] = "service"
        _phase7_artifacts(sdlc_dir, repo_root,
                          in_phase=["README.md", "RUNBOOK.md", "api-docs.md", "phase8-handoff.md"])
        results = check_phase_gates(7, state, valid_profile, sdlc_dir / "artifacts")
        assert _failures(results, "README.md"), "a copy under .sdlc/ must not satisfy README.md"
        assert _failures(results, "RUNBOOK.md")

    def test_phase_local_artifacts_still_resolve_under_the_phase_dir(self, sdlc_dir, valid_profile, state_yaml):
        """The default is unchanged — only entries that say `root: repo` move."""
        repo_root = sdlc_dir.parent
        state = yaml.safe_load(state_yaml.read_text())
        state["project_type"] = "service"
        _phase7_artifacts(sdlc_dir, repo_root,
                          in_repo=["README.md", "RUNBOOK.md", "phase8-handoff.md"],
                          in_phase=["api-docs.md"])
        results = check_phase_gates(7, state, valid_profile, sdlc_dir / "artifacts")
        assert _failures(results, "phase8-handoff.md"), "a handoff at the repo root is in the wrong place"


# ── D-3: the gate honours project_type, like the phase bodies do ──────────────

class TestProjectTypeAwareness:
    """Five phase bodies adapt required artifacts by project_type; the gate must agree.

    Phase 7 tells a library or CLI to 'Skip RUNBOOK — there is no server to operate', then the
    gate blocked on RUNBOOK.md anyway. No non-service project could close Phase 7 — including
    this plugin, which is a `skill`.
    """

    @pytest.mark.parametrize("project_type", ["library", "cli"])
    def test_runbook_is_not_required_without_a_server(self, sdlc_dir, valid_profile, state_yaml, project_type):
        repo_root = sdlc_dir.parent
        state = yaml.safe_load(state_yaml.read_text())
        state["project_type"] = project_type
        _phase7_artifacts(sdlc_dir, repo_root,
                          in_repo=["README.md"],
                          in_phase=["api-docs.md", "phase8-handoff.md"])
        results = check_phase_gates(7, state, valid_profile, sdlc_dir / "artifacts")
        assert not [r for r in results if r["passed"] is False], [r["message"] for r in results if r["passed"] is False]

    def test_a_skill_needs_neither_runbook_nor_api_docs(self, sdlc_dir, valid_profile, state_yaml):
        repo_root = sdlc_dir.parent
        state = yaml.safe_load(state_yaml.read_text())
        state["project_type"] = "skill"
        _phase7_artifacts(sdlc_dir, repo_root, in_repo=["README.md"], in_phase=["phase8-handoff.md"])
        results = check_phase_gates(7, state, valid_profile, sdlc_dir / "artifacts")
        assert not [r for r in results if r["passed"] is False], [r["message"] for r in results if r["passed"] is False]

    def test_a_service_still_needs_all_of_them(self, sdlc_dir, valid_profile, state_yaml):
        """Relaxing for other types must not relax the type the artifacts exist for."""
        repo_root = sdlc_dir.parent
        state = yaml.safe_load(state_yaml.read_text())
        state["project_type"] = "service"
        _phase7_artifacts(sdlc_dir, repo_root, in_repo=["README.md"], in_phase=["phase8-handoff.md"])
        results = check_phase_gates(7, state, valid_profile, sdlc_dir / "artifacts")
        assert _failures(results, "RUNBOOK.md")
        assert _failures(results, "api-docs.md")

    def test_an_unset_project_type_requires_everything(self, sdlc_dir, valid_profile, state_yaml):
        """Phase 0 hasn't recorded a type yet — fail closed rather than guess and drop a gate."""
        repo_root = sdlc_dir.parent
        state = yaml.safe_load(state_yaml.read_text())
        state.pop("project_type", None)
        _phase7_artifacts(sdlc_dir, repo_root, in_repo=["README.md"], in_phase=["phase8-handoff.md"])
        results = check_phase_gates(7, state, valid_profile, sdlc_dir / "artifacts")
        assert _failures(results, "RUNBOOK.md")

    def test_skipped_artifacts_are_reported_not_silently_dropped(self, sdlc_dir, valid_profile, state_yaml):
        """The approver must see WHY a gate shrank, or the gate quietly got weaker."""
        repo_root = sdlc_dir.parent
        state = yaml.safe_load(state_yaml.read_text())
        state["project_type"] = "skill"
        _phase7_artifacts(sdlc_dir, repo_root, in_repo=["README.md"], in_phase=["phase8-handoff.md"])
        results = check_phase_gates(7, state, valid_profile, sdlc_dir / "artifacts")
        notes = [r for r in results if r.get("artifact") == "RUNBOOK.md" and r["severity"] == "INFO"]
        assert notes and "N/A — skill" in notes[0]["message"]


# ── X-7: a directory artifact is checked through to its files ─────────────────

class TestDirectoryCompleteness:
    """`adrs/` used to pass on being non-empty.

    That let Phase 2 close on a folder holding one ADR that was headings and TODOs — the phase
    whose output is the signed record of WHY the system is shaped this way, satisfied by a
    directory with no decisions in it. If a file containing a TODO fails, a directory of them
    cannot pass.
    """

    def test_a_directory_of_real_documents_passes(self, tmp_path):
        adrs = tmp_path / "adrs"
        adrs.mkdir()
        (adrs / "ADR-001.md").write_text("# ADR-001\n\nWe chose Postgres because of the join load.")
        passed, msg = check_artifact_complete(tmp_path, "adrs")
        assert passed is True
        assert "1 file" in msg

    def test_a_placeholder_inside_a_directory_blocks(self, tmp_path):
        adrs = tmp_path / "adrs"
        adrs.mkdir()
        (adrs / "ADR-001.md").write_text("# ADR-001\n\nTODO: decide the datastore")
        passed, msg = check_artifact_complete(tmp_path, "adrs")
        assert passed is False
        assert "ADR-001.md" in msg, "the message must name the offending file"

    def test_one_good_document_does_not_excuse_a_bad_one(self, tmp_path):
        adrs = tmp_path / "adrs"
        adrs.mkdir()
        (adrs / "ADR-001.md").write_text("# ADR-001\n\nWe chose Postgres because of the join load.")
        (adrs / "ADR-002.md").write_text("# ADR-002\n\nTBD")
        passed, msg = check_artifact_complete(tmp_path, "adrs")
        assert passed is False
        assert "ADR-002.md" in msg

    def test_an_empty_file_inside_a_directory_blocks(self, tmp_path):
        adrs = tmp_path / "adrs"
        adrs.mkdir()
        (adrs / "ADR-001.md").write_text("   \n")
        passed, msg = check_artifact_complete(tmp_path, "adrs")
        assert passed is False
        assert "empty" in msg

    def test_nested_documents_are_checked_too(self, tmp_path):
        adrs = tmp_path / "adrs"
        (adrs / "superseded").mkdir(parents=True)
        (adrs / "ADR-001.md").write_text("# ADR-001\n\nReal decision, real rationale.")
        (adrs / "superseded" / "ADR-000.md").write_text("PLACEHOLDER")
        passed, _ = check_artifact_complete(tmp_path, "adrs")
        assert passed is False, "a placeholder in a subdirectory still means the record is unfinished"


# ── the waiver mechanism (Fix 3) ──────────────────────────────────────────────

from check_gates import waiver_in  # noqa: E402


class TestWaiver:
    """A required receipt may be waived IN the artifact — but never silently.

    Some human work genuinely will not happen: no live carrier API to spike against, no client
    ops engineer to walk the RUNBOOK. A gate with no escape gets worked around, and the
    workaround leaves no trace. So the escape is built in and made loud: the file exists, names
    who waived it and why, and the gate reports it at INFO in the report the approver signs
    against.
    """

    def test_a_waiver_needs_both_a_name_and_a_reason(self, tmp_path):
        (tmp_path / "a.md").write_text("WAIVED: Wes Carter — no live carrier sandbox exists yet",
                                       encoding="utf-8")
        assert waiver_in(tmp_path / "a.md") == ("Wes Carter", "no live carrier sandbox exists yet")

    def test_an_unattributed_waiver_is_not_a_waiver(self, tmp_path):
        """`WAIVED: because we ran out of time` names nobody — that is the thing being prevented."""
        (tmp_path / "a.md").write_text("WAIVED: — ran out of time")
        assert waiver_in(tmp_path / "a.md") is None

    def test_a_reasonless_waiver_is_not_a_waiver(self, tmp_path):
        (tmp_path / "a.md").write_text("WAIVED: Wes Carter")
        assert waiver_in(tmp_path / "a.md") is None

    def test_it_reads_the_bulleted_and_bold_forms(self, tmp_path):
        (tmp_path / "a.md").write_text(
            "- **WAIVED:** Dan Ruiz — client security signed the brief instead\n", encoding="utf-8")
        who, why = waiver_in(tmp_path / "a.md")
        assert who == "Dan Ruiz" and "client security" in why

    def test_an_ordinary_artifact_is_not_a_waiver(self, tmp_path):
        (tmp_path / "a.md").write_text("# Threat model\n\nBoundary 1: the carrier API.\n")
        assert waiver_in(tmp_path / "a.md") is None

    def test_a_waived_artifact_does_not_block_the_gate(self, sdlc_dir, valid_profile, state_yaml):
        repo_root = sdlc_dir.parent
        state = yaml.safe_load(state_yaml.read_text())
        state["project_type"] = "service"
        body = "# Doc\n\nReal content with no placeholders.\n"
        for name in ("README.md", "RUNBOOK.md"):
            (repo_root / name).write_text(body, encoding="utf-8")
        d = sdlc_dir / "artifacts" / "07-documentation"
        for name in ("api-docs.md", "readme-verification.md", "runbook-walkthrough.md"):
            (d / name).write_text(body, encoding="utf-8")
        (d / "phase8-handoff.md").write_text(
            "# Handoff\n\nWAIVED: Dan Ruiz — deployment deferred to the next engagement\n",
            encoding="utf-8")
        results = check_phase_gates(7, state, valid_profile, sdlc_dir / "artifacts")
        assert not [r for r in results if r["passed"] is False], [r["message"] for r in results if r["passed"] is False]

    def test_a_waived_artifact_is_reported_with_the_name(self, sdlc_dir, valid_profile, state_yaml):
        """Silent is the failure mode. The approver must see WHO waived it and why."""
        repo_root = sdlc_dir.parent
        state = yaml.safe_load(state_yaml.read_text())
        state["project_type"] = "service"
        body = "# Doc\n\nReal content.\n"
        for name in ("README.md", "RUNBOOK.md"):
            (repo_root / name).write_text(body, encoding="utf-8")
        d = sdlc_dir / "artifacts" / "07-documentation"
        for name in ("api-docs.md", "readme-verification.md", "runbook-walkthrough.md"):
            (d / name).write_text(body, encoding="utf-8")
        (d / "phase8-handoff.md").write_text(
            "WAIVED: Dan Ruiz — deployment deferred\n", encoding="utf-8")
        results = check_phase_gates(7, state, valid_profile, sdlc_dir / "artifacts")
        waived = [r for r in results if r.get("artifact") == "phase8-handoff.md"
                  and "WAIVED" in r["message"]]
        assert waived, "a waived artifact must appear in the report"
        assert "Dan Ruiz" in waived[0]["message"]
        assert waived[0]["severity"] == "INFO", "a waiver is information, not a silent MUST pass"

    def test_a_missing_artifact_is_still_a_failure(self, sdlc_dir, valid_profile, state_yaml):
        """The waiver is an escape from the WORK, not from the record. No file, no pass."""
        state = yaml.safe_load(state_yaml.read_text())
        state["project_type"] = "service"
        results = check_phase_gates(7, state, valid_profile, sdlc_dir / "artifacts")
        assert [r for r in results if r["passed"] is False]
