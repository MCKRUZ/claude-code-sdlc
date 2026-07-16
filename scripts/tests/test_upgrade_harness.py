"""Tests for upgrade_harness.py — manifest-driven three-way upgrade classification.

Each classification row gets an integration test: install v1 from the hermetic synthetic
payload, mutate the payload and/or the target, run the upgrade, and assert the classification
plus its file/manifest effects (dry-run must change nothing; --apply performs the row's action).
"""

import json
from pathlib import Path

import pytest

from upgrade_harness import (
    ADAPTED,
    ADOPT,
    CONFLICT,
    CONFLICT_UNTRACKED,
    DELETED_LOCALLY,
    IDENTICAL,
    NEW,
    RETIRED,
    UPDATE,
    _classify,
    upgrade,
)
from install_harness import install
from tests.test_install_harness import (
    MANIFEST_REL,
    _profile_file,
    _read_manifest,
    _sha,
    _write,
    make_payload,
)

# The stack-pack rule used as the guinea pig for most rows.
RULE = ".claude/rules/testing.md"
RULE_SRC = Path("packs") / "stacks" / "dotnet" / "rules" / "testing.md"


@pytest.fixture
def payload(tmp_path):
    return make_payload(tmp_path)


@pytest.fixture
def profile(tmp_path, valid_profile):
    return _profile_file(tmp_path, valid_profile)


@pytest.fixture
def target(tmp_path, payload, profile):
    """A repo with the harness installed (v1) and its manifest in place."""
    t = tmp_path / "repo"
    t.mkdir()
    assert install(payload, t, force=False, profile_path=profile) == 0
    return t


def _run(capsys, payload, target, profile=None, apply=False):
    """Run the upgrade with a drained capture buffer; returns (rc, stdout, stderr)."""
    capsys.readouterr()  # drop the install fixture's output
    rc = upgrade(payload, target, profile, apply)
    cap = capsys.readouterr()
    return rc, cap.out, cap.err


def _edit_manifest(target, mutate):
    path = target / MANIFEST_REL
    manifest = json.loads(path.read_text(encoding="utf-8"))
    mutate(manifest)
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def _tree_hashes(root: Path) -> dict[str, str]:
    return {p.relative_to(root).as_posix(): _sha(p) for p in sorted(root.rglob("*")) if p.is_file()}


# ── the classifier itself (one row per spec line; hashes as opaque tokens) ──────

class TestClassify:
    @pytest.mark.parametrize("old,new,cur,expected", [
        ("a", "a", "a", IDENTICAL),           # untouched, upstream unchanged
        ("a", "b", "b", IDENTICAL),           # user already matches the new pristine
        ("a", "b", "a", UPDATE),              # untouched locally, upstream moved -> safe replace
        ("a", "a", "b", ADAPTED),             # adapted locally, upstream unchanged -> keep
        ("a", "b", "c", CONFLICT),            # both sides moved -> human merge
        ("a", "a", None, DELETED_LOCALLY),    # user deleted it -> respect the deletion
        ("a", None, None, DELETED_LOCALLY),   # deleted locally AND retired upstream
        (None, "b", None, NEW),               # new upstream file
        (None, "b", "b", ADOPT),              # untracked but already pristine -> track it
        (None, "b", "c", CONFLICT_UNTRACKED), # untracked and diverged -> human merge
        ("a", None, "a", RETIRED),            # upstream dropped it -> untrack, keep the file
        ("a", None, "b", RETIRED),            # retired upstream even if adapted locally
    ])
    def test_rows(self, old, new, cur, expected):
        assert _classify(old, new, cur) == expected


# ── IDENTICAL ──────────────────────────────────────────────────────────────────

class TestIdentical:
    def test_same_payload_dry_run_is_all_identical(self, capsys, payload, target, profile):
        rc, out, _ = _run(capsys, payload, target, profile)
        assert rc == 0
        assert "IDENTICAL (" in out
        for name in (UPDATE, ADAPTED, CONFLICT, CONFLICT_UNTRACKED, NEW, ADOPT, RETIRED,
                     DELETED_LOCALLY):
            assert f"{name} (" not in out

    def test_apply_refreshes_manifest_and_writes_no_siblings(self, capsys, payload, target, profile):
        before = _read_manifest(target)["files"]
        rc, _, _ = _run(capsys, payload, target, profile, apply=True)
        assert rc == 0
        assert _read_manifest(target)["files"] == before      # same pristine hashes
        assert list(target.rglob("*.harness-new")) == []


# ── UPDATE ─────────────────────────────────────────────────────────────────────

class TestUpdate:
    def test_dry_run_classifies_and_leaves_file(self, capsys, tmp_path, payload, target, profile):
        _write(tmp_path / "harness" / RULE_SRC, "# testing v2\n")
        rc, out, _ = _run(capsys, payload, target, profile)
        assert rc == 0
        assert f"{UPDATE} (1)" in out and RULE in out
        assert (target / RULE).read_text(encoding="utf-8") == "# testing\n"  # untouched

    def test_apply_replaces_file_and_updates_manifest(self, capsys, tmp_path, payload, target, profile):
        _write(tmp_path / "harness" / RULE_SRC, "# testing v2\n")
        rc, _, _ = _run(capsys, payload, target, profile, apply=True)
        assert rc == 0
        assert (target / RULE).read_text(encoding="utf-8") == "# testing v2\n"
        assert _read_manifest(target)["files"][RULE] == _sha(target / RULE)


# ── ADAPTED ────────────────────────────────────────────────────────────────────

class TestAdapted:
    def test_local_adaptation_is_kept(self, capsys, payload, target, profile):
        old_entry = _read_manifest(target)["files"][RULE]
        (target / RULE).write_text("# adapted by the repo\n", encoding="utf-8")
        rc, out, _ = _run(capsys, payload, target, profile, apply=True)
        assert rc == 0
        assert f"{ADAPTED} (1)" in out and RULE in out
        assert (target / RULE).read_text(encoding="utf-8") == "# adapted by the repo\n"
        assert _read_manifest(target)["files"][RULE] == old_entry  # pristine hash survives


# ── CONFLICT ───────────────────────────────────────────────────────────────────

class TestConflict:
    def _diverge(self, tmp_path, target):
        _write(tmp_path / "harness" / RULE_SRC, "# testing v2\n")
        (target / RULE).write_text("# adapted by the repo\n", encoding="utf-8")

    def test_dry_run_reports_without_sibling(self, capsys, tmp_path, payload, target, profile):
        self._diverge(tmp_path, target)
        rc, out, _ = _run(capsys, payload, target, profile)
        assert rc == 0                                         # conflicts are the report's job
        assert f"{CONFLICT} (1)" in out and RULE in out
        assert not (target / (RULE + ".harness-new")).exists()

    def test_apply_writes_sibling_keeps_current_and_manifest(self, capsys, tmp_path, payload,
                                                             target, profile):
        old_entry = _read_manifest(target)["files"][RULE]
        self._diverge(tmp_path, target)
        rc, _, _ = _run(capsys, payload, target, profile, apply=True)
        assert rc == 0
        sibling = target / (RULE + ".harness-new")
        assert sibling.read_text(encoding="utf-8") == "# testing v2\n"   # new pristine content
        assert (target / RULE).read_text(encoding="utf-8") == "# adapted by the repo\n"
        assert _read_manifest(target)["files"][RULE] == old_entry        # unchanged until merged


# ── DELETED-LOCALLY ────────────────────────────────────────────────────────────

class TestDeletedLocally:
    def test_deletion_is_respected(self, capsys, payload, target, profile):
        (target / RULE).unlink()
        rc, out, _ = _run(capsys, payload, target, profile, apply=True)
        assert rc == 0
        assert f"{DELETED_LOCALLY} (1)" in out and RULE in out
        assert not (target / RULE).exists()                    # never reinstalled


# ── NEW ────────────────────────────────────────────────────────────────────────

class TestNew:
    def test_dry_run_reports_without_installing(self, capsys, tmp_path, payload, target, profile):
        _write(tmp_path / "harness" / "hooks" / "session-start.sh", "#!/bin/sh\n# new hook\n")
        rc, out, _ = _run(capsys, payload, target, profile)
        assert rc == 0
        assert f"{NEW} (1)" in out and ".claude/hooks/session-start.sh" in out
        assert not (target / ".claude" / "hooks" / "session-start.sh").exists()

    def test_apply_installs_and_tracks(self, capsys, tmp_path, payload, target, profile):
        _write(tmp_path / "harness" / "hooks" / "session-start.sh", "#!/bin/sh\n# new hook\n")
        rc, _, _ = _run(capsys, payload, target, profile, apply=True)
        assert rc == 0
        dest = target / ".claude" / "hooks" / "session-start.sh"
        assert dest.read_text(encoding="utf-8") == "#!/bin/sh\n# new hook\n"
        assert _read_manifest(target)["files"][".claude/hooks/session-start.sh"] == _sha(dest)


# ── UNTRACKED: ADOPT / CONFLICT-UNTRACKED ──────────────────────────────────────

class TestUntracked:
    def test_pristine_untracked_file_is_adopted(self, capsys, payload, target, profile):
        _edit_manifest(target, lambda m: m["files"].pop(RULE))
        rc, out, _ = _run(capsys, payload, target, profile, apply=True)
        assert rc == 0
        assert f"{ADOPT} (1)" in out and RULE in out
        assert (target / RULE).read_text(encoding="utf-8") == "# testing\n"  # file untouched
        assert _read_manifest(target)["files"][RULE] == _sha(target / RULE)  # now tracked

    def test_diverged_untracked_file_conflicts(self, capsys, payload, target, profile):
        _edit_manifest(target, lambda m: m["files"].pop(RULE))
        (target / RULE).write_text("# adapted by the repo\n", encoding="utf-8")
        rc, out, _ = _run(capsys, payload, target, profile, apply=True)
        assert rc == 0
        assert f"{CONFLICT_UNTRACKED} (1)" in out and RULE in out
        assert (target / (RULE + ".harness-new")).read_text(encoding="utf-8") == "# testing\n"
        assert (target / RULE).read_text(encoding="utf-8") == "# adapted by the repo\n"
        assert RULE not in _read_manifest(target)["files"]     # not adopted while diverged


# ── RETIRED ────────────────────────────────────────────────────────────────────

class TestRetired:
    def test_entry_dropped_file_kept(self, capsys, tmp_path, payload, target, profile):
        (tmp_path / "harness" / "agents" / "code-reviewer.md").unlink()  # retired upstream
        rel = ".claude/agents/code-reviewer.md"
        rc, out, _ = _run(capsys, payload, target, profile, apply=True)
        assert rc == 0
        assert f"{RETIRED} (1)" in out and rel in out
        assert (target / rel).is_file()                        # deletion is the human's call
        assert rel not in _read_manifest(target)["files"]      # but it is untracked now


# ── LEGACY MODE (no manifest) ──────────────────────────────────────────────────

class TestLegacyMode:
    def test_dry_run_flags_legacy_and_adopts(self, capsys, payload, target, profile):
        (target / MANIFEST_REL).unlink()
        rc, out, _ = _run(capsys, payload, target, profile)
        assert rc == 0
        assert "LEGACY" in out
        assert f"{ADOPT} (" in out                             # pristine files get adopted
        assert not (target / MANIFEST_REL).exists()            # dry-run writes nothing

    def test_apply_writes_fresh_manifest(self, capsys, payload, target, profile):
        (target / MANIFEST_REL).unlink()
        rc, _, _ = _run(capsys, payload, target, profile, apply=True)
        assert rc == 0
        m = _read_manifest(target)
        assert m["profile_id"] == "test-profile"
        assert m["files"]["CLAUDE.md"] == _sha(target / "CLAUDE.md")
        assert m["files"][RULE] == _sha(target / RULE)
        assert MANIFEST_REL not in m["files"]


# ── report content ─────────────────────────────────────────────────────────────

class TestReport:
    def test_counts_and_next_actions_footer(self, capsys, tmp_path, payload, target, profile):
        _write(tmp_path / "harness" / RULE_SRC, "# testing v2\n")                        # UPDATE
        (target / ".claude" / "rules" / "clean-architecture.md").write_text(
            "# adapted\n", encoding="utf-8")                                             # ADAPTED
        rc, out, _ = _run(capsys, payload, target, profile)
        assert rc == 0
        assert f"{UPDATE} (1)" in out
        assert f"{ADAPTED} (1)" in out
        assert "IDENTICAL (" in out
        assert ".harness-new" in out                           # merge-then-delete instruction
        assert "CLAUDE.md" in out                              # the SDLC-section merge warning

    def test_dry_run_mutates_nothing(self, capsys, tmp_path, payload, target, profile):
        _write(tmp_path / "harness" / RULE_SRC, "# testing v2\n")
        (target / RULE).write_text("# adapted by the repo\n", encoding="utf-8")  # conflict too
        before = _tree_hashes(target)
        rc, _, _ = _run(capsys, payload, target, profile)
        assert rc == 0
        assert _tree_hashes(target) == before                  # bit-for-bit untouched


# ── rc contract (0 even with conflicts; 2 on InstallError-class problems) ───────

class TestRcContract:
    def test_bad_payload_is_clean_rc2(self, capsys, tmp_path, target, profile):
        rc, _, err = _run(capsys, tmp_path / "nope", target, profile)
        assert rc == 2
        assert "ERROR:" in err
        assert "Traceback" not in err

    def test_bad_profile_is_clean_rc2(self, capsys, tmp_path, payload, target):
        bad = tmp_path / "bad-profile.yaml"
        bad.write_text("company:\n  name: x\n", encoding="utf-8")  # fails schema validation
        rc, _, err = _run(capsys, payload, target, bad)
        assert rc == 2
        assert "ERROR:" in err and "validation" in err

    def test_corrupt_manifest_is_clean_rc2(self, capsys, payload, target, profile):
        (target / MANIFEST_REL).write_text("{not json", encoding="utf-8")
        rc, _, err = _run(capsys, payload, target, profile)
        assert rc == 2
        assert "ERROR:" in err
        assert "Traceback" not in err
