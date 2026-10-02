"""Tests for intake_documents.py's --repo/--docs/--json/--skip/--priority/--lock modes (spec 0021)."""

import json
from pathlib import Path

import pytest

from tests.test_intake_documents_golden import DOCS, build_project, run_intake

LOCKED_LINE = "catalog is locked; DOC-NNN ids are stable"


@pytest.fixture
def project(tmp_path):
    root = tmp_path / "proj"
    state = build_project(root)
    return root, state, root / ".sdlc" / "context" / "intake" / "catalog.json"


def as_json(result):
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def tree(root: Path) -> set[str]:
    return {p.relative_to(root).as_posix() for p in root.rglob("*")}


class TestRepoMode:
    def test_repo_and_state_catalog_the_same_documents(self, tmp_path):
        a, b = tmp_path / "a", tmp_path / "b"
        state_a, state_b = build_project(a), build_project(b)
        by_state = as_json(run_intake(["--state", str(state_a), "--json"]))
        by_repo = as_json(run_intake(["--repo", str(b), "--json"]))
        assert by_state == by_repo
        assert (b / ".sdlc" / "context" / "intake" / "catalog.json").exists()

    def test_state_and_repo_together_is_a_usage_error(self, project):
        root, state, _ = project
        result = run_intake(["--state", str(state), "--repo", str(root)])
        assert result.returncode == 2

    def test_no_location_at_all_is_a_usage_error(self):
        assert run_intake([]).returncode == 2

    def test_repo_without_state_file_exits_1(self, tmp_path):
        assert run_intake(["--repo", str(tmp_path)]).returncode == 1


class TestJson:
    def test_stdout_is_exactly_one_json_document(self, project):
        root, state, _ = project
        result = run_intake(["--state", str(state), "--json"])
        payload = json.loads(result.stdout)
        assert result.stdout.strip().startswith("{") and result.stdout.strip().endswith("}")
        assert payload["locked"] is False
        assert payload["provisional"] is False
        assert payload["skipped"] == [] and payload["priority_order"] == []

    def test_document_shape_and_relative_forward_slash_paths(self, project):
        root, state, _ = project
        payload = as_json(run_intake(["--state", str(state), "--json"]))
        first = payload["documents"][0]
        assert set(first) >= {"id", "file", "type", "tokens", "checksum", "skipped", "priority"}
        assert first["id"] == "DOC-001"
        assert first["file"] == "docs/intake/alpha-rfp.md"
        assert first["skipped"] is False and first["priority"] is None
        assert first["checksum"].startswith("sha256:")
        assert str(root).replace("\\", "/") not in json.dumps(payload).replace("\\\\", "/")
        assert payload["totals"]["documents"] == len(DOCS) + 1
        assert payload["totals"]["estimated_tokens"] == sum(
            d["tokens"] for d in payload["documents"]
        )

    def test_json_on_an_existing_catalog_prints_json_only(self, project):
        _, state, _ = project
        run_intake(["--state", str(state)])
        result = run_intake(["--state", str(state), "--json"])
        assert len(as_json(result)["documents"]) == len(DOCS) + 1

    def test_json_with_no_documentation_section_says_why(self, tmp_path):
        state = build_project(tmp_path / "p", documentation=False)
        payload = as_json(run_intake(["--state", str(state), "--json"]))
        assert payload["documents"] == []
        assert "Nothing to intake" in payload["message"]

    def test_json_with_no_matching_documents_keeps_exit_2(self, tmp_path):
        state = build_project(tmp_path / "p", documents=False)
        result = run_intake(["--state", str(state), "--json"])
        assert result.returncode == 2
        assert json.loads(result.stdout)["documents"] == []


class TestDocsStandalone:
    def test_no_sdlc_marks_every_id_provisional_and_writes_nothing(self, tmp_path):
        folder = tmp_path / "refs"
        folder.mkdir()
        for name, body in DOCS.items():
            (folder / name).write_text(body, encoding="utf-8")
        before = tree(tmp_path)
        payload = as_json(run_intake(["--docs", str(folder), "--json"]))
        assert payload["provisional"] is True
        assert [d["id"] for d in payload["documents"]] == ["DOC-001", "DOC-002", "DOC-003"]
        assert payload["documents"][0]["file"] == "alpha-rfp.md"
        assert tree(tmp_path) == before

    def test_text_mode_says_nothing_was_written(self, tmp_path):
        folder = tmp_path / "refs"
        folder.mkdir()
        (folder / "a.md").write_text("# a\n", encoding="utf-8")
        before = tree(tmp_path)
        result = run_intake(["--docs", str(folder)])
        assert result.returncode == 0
        assert "nothing was written" in result.stdout
        assert tree(tmp_path) == before

    def test_missing_docs_folder_exits_1(self, tmp_path):
        assert run_intake(["--docs", str(tmp_path / "nope")]).returncode == 1

    def test_docs_with_a_repo_catalogs_that_folder_and_writes_the_catalog(self, project):
        root, state, catalog_path = project
        other = root / "other-docs"
        other.mkdir()
        (other / "only-one.md").write_text("# one\n", encoding="utf-8")
        payload = as_json(run_intake(["--state", str(state), "--docs", str(other), "--json"]))
        assert [d["file"] for d in payload["documents"]] == ["other-docs/only-one.md"]
        assert payload["provisional"] is False
        assert json.loads(catalog_path.read_text(encoding="utf-8"))["total_documents"] == 1

    def test_docs_outside_the_repo_use_folder_relative_paths(self, project, tmp_path):
        root, state, _ = project
        outside = tmp_path / "elsewhere"
        outside.mkdir()
        (outside / "ext.md").write_text("# ext\n", encoding="utf-8")
        payload = as_json(run_intake(["--state", str(state), "--docs", str(outside), "--json"]))
        assert payload["documents"][0]["file"] == "ext.md"

    @pytest.mark.parametrize("flag", [["--skip", "DOC-001"], ["--priority", "DOC-001"], ["--lock"]])
    def test_catalog_edits_need_a_project(self, tmp_path, flag):
        folder = tmp_path / "refs"
        folder.mkdir()
        (folder / "a.md").write_text("# a\n", encoding="utf-8")
        result = run_intake(["--docs", str(folder), *flag])
        assert result.returncode == 1
        assert tree(tmp_path) == {"refs", "refs/a.md"}


class TestSkipAndPriority:
    def test_skip_and_priority_are_stored_and_reported(self, project):
        _, state, catalog_path = project
        run_intake(["--state", str(state)])
        run_intake(["--state", str(state), "--skip", "DOC-003", "--priority", "DOC-004,DOC-001"])
        stored = json.loads(catalog_path.read_text(encoding="utf-8"))
        assert stored["skipped"] == ["DOC-003"]
        assert stored["priority_order"] == ["DOC-004", "DOC-001"]
        payload = as_json(run_intake(["--state", str(state), "--json"]))
        by_id = {d["id"]: d for d in payload["documents"]}
        assert by_id["DOC-003"]["skipped"] is True
        assert by_id["DOC-004"]["priority"] == 1 and by_id["DOC-001"]["priority"] == 2
        assert by_id["DOC-002"]["priority"] is None
        assert payload["skipped"] == ["DOC-003"]
        assert payload["priority_order"] == ["DOC-004", "DOC-001"]
        totals = payload["totals"]
        assert totals["skipped_documents"] == 1
        assert totals["active_estimated_tokens"] == (
            totals["estimated_tokens"] - by_id["DOC-003"]["tokens"]
        )

    def test_flags_create_the_catalog_when_absent(self, project):
        _, state, catalog_path = project
        assert not catalog_path.exists()
        payload = as_json(run_intake(["--state", str(state), "--skip", "DOC-002", "--json"]))
        assert payload["skipped"] == ["DOC-002"]
        assert catalog_path.exists()

    def test_skip_is_additive_and_idempotent(self, project):
        _, state, catalog_path = project
        run_intake(["--state", str(state), "--skip", "DOC-003"])
        run_intake(["--state", str(state), "--skip", "DOC-001"])
        after_two = catalog_path.read_bytes()
        assert json.loads(after_two)["skipped"] == ["DOC-001", "DOC-003"]
        run_intake(["--state", str(state), "--skip", "DOC-001,DOC-003"])
        assert catalog_path.read_bytes() == after_two

    @pytest.mark.parametrize("flag", ["--skip", "--priority"])
    def test_unknown_id_exits_1_and_leaves_the_catalog_unchanged(self, project, flag):
        _, state, catalog_path = project
        run_intake(["--state", str(state)])
        before = catalog_path.read_bytes()
        result = run_intake(["--state", str(state), flag, "DOC-001,DOC-099"])
        assert result.returncode == 1
        assert "DOC-099" in result.stderr
        assert catalog_path.read_bytes() == before

    def test_unknown_id_does_not_create_a_missing_catalog(self, project):
        _, state, catalog_path = project
        assert run_intake(["--state", str(state), "--skip", "DOC-099"]).returncode == 1
        assert not catalog_path.exists()

    def test_empty_id_in_list_is_a_usage_error(self, project):
        _, state, _ = project
        assert run_intake(["--state", str(state), "--skip", "DOC-001,"]).returncode == 2

    def test_priority_replaces_the_previous_order(self, project):
        _, state, catalog_path = project
        run_intake(["--state", str(state), "--priority", "DOC-001,DOC-002"])
        run_intake(["--state", str(state), "--priority", "DOC-003"])
        assert json.loads(catalog_path.read_text(encoding="utf-8"))["priority_order"] == ["DOC-003"]

    def test_rescan_keeps_decisions_by_document_not_by_id(self, project):
        root, state, catalog_path = project
        run_intake(["--state", str(state), "--skip", "DOC-004"])  # gamma-api.md
        (root / "docs" / "intake" / "aaa-new.md").write_text("# new\n", encoding="utf-8")
        run_intake(["--state", str(state), "--rescan"])
        stored = json.loads(catalog_path.read_text(encoding="utf-8"))
        ids = {d["source_path"]: d["doc_id"] for d in stored["documents"]}
        assert stored["skipped"] == [ids["docs/intake/gamma-api.md"]]
        assert ids["docs/intake/gamma-api.md"] == "DOC-005"


class TestLock:
    def test_lock_sets_flag_and_timestamp(self, project):
        _, state, catalog_path = project
        run_intake(["--state", str(state)])
        result = run_intake(["--state", str(state), "--lock"])
        assert result.returncode == 0
        stored = json.loads(catalog_path.read_text(encoding="utf-8"))
        assert stored["locked"] is True and stored["locked_at"]
        payload = as_json(run_intake(["--state", str(state), "--json"]))
        assert payload["locked"] is True and payload["locked_at"] == stored["locked_at"]

    def test_second_lock_changes_no_byte(self, project):
        _, state, catalog_path = project
        run_intake(["--state", str(state)])
        run_intake(["--state", str(state), "--lock"])
        locked = catalog_path.read_bytes()
        again = run_intake(["--state", str(state), "--lock"])
        assert again.returncode == 0
        assert catalog_path.read_bytes() == locked

    def test_lock_without_a_catalog_exits_1_and_creates_nothing(self, project):
        _, state, catalog_path = project
        result = run_intake(["--state", str(state), "--lock"])
        assert result.returncode == 1
        assert not catalog_path.exists()

    def test_hand_locked_catalog_is_left_alone_by_lock(self, project):
        _, state, catalog_path = project
        run_intake(["--state", str(state)])
        hand = json.loads(catalog_path.read_text(encoding="utf-8"))
        hand["locked"] = True
        catalog_path.write_text(json.dumps(hand, indent=2), encoding="utf-8")
        before = catalog_path.read_bytes()
        assert run_intake(["--state", str(state), "--lock"]).returncode == 0
        assert catalog_path.read_bytes() == before

    @pytest.mark.parametrize(
        "flags",
        [["--rescan"], ["--skip", "DOC-001"], ["--priority", "DOC-001"], ["--lock", "--rescan"]],
    )
    def test_locked_catalog_refuses_changes_and_stays_byte_identical(self, project, flags):
        root, state, catalog_path = project
        run_intake(["--state", str(state)])
        run_intake(["--state", str(state), "--lock"])
        before = catalog_path.read_bytes()
        (root / "docs" / "intake" / "aaa-new.md").write_text("# new\n", encoding="utf-8")
        result = run_intake(["--state", str(state), *flags])
        assert result.returncode == 1
        assert LOCKED_LINE in result.stderr
        assert catalog_path.read_bytes() == before

    def test_locked_catalog_still_reports(self, project):
        _, state, _ = project
        run_intake(["--state", str(state)])
        run_intake(["--state", str(state), "--lock"])
        result = run_intake(["--state", str(state)])
        assert result.returncode == 0 and "[LOCKED]" in result.stdout

    def test_lock_still_works_after_the_intake_folder_is_gone(self, project):
        root, state, catalog_path = project
        run_intake(["--state", str(state)])
        for f in (root / "docs" / "intake").iterdir():
            f.unlink()
        assert run_intake(["--state", str(state), "--lock"]).returncode == 0
        assert json.loads(catalog_path.read_text(encoding="utf-8"))["locked"] is True


class TestOldCatalogCompatibility:
    def test_a_catalog_without_the_new_keys_reads_as_none(self, project):
        _, state, catalog_path = project
        run_intake(["--state", str(state)])
        old = json.loads(catalog_path.read_text(encoding="utf-8"))
        assert "skipped" not in old and "priority_order" not in old and "locked" not in old
        payload = as_json(run_intake(["--state", str(state), "--json"]))
        assert payload["skipped"] == [] and payload["priority_order"] == []
        assert payload["locked"] is False and payload["locked_at"] is None
        assert all(d["skipped"] is False and d["priority"] is None for d in payload["documents"])

    def test_a_default_run_does_not_add_keys_to_catalog_json(self, project):
        _, state, catalog_path = project
        run_intake(["--state", str(state)])
        keys = set(json.loads(catalog_path.read_text(encoding="utf-8")))
        assert keys == {
            "intake_path", "scanned_at", "total_documents", "total_estimated_tokens",
            "index_budget_tokens", "summary_budget_tokens", "documents",
        }
