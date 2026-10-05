"""Spec 0028 — `intake_documents.py --registry`.

The registry and the session-start index are mechanical given the catalogue and the summaries that
exist. What is pinned here: the numbers come from the catalogue, a person's hand-written sections of an
existing registry survive a re-run byte for byte (with LF and with CRLF), the index respects its token
budget by the command's own trimming order without ever dropping an id, and a missing summary reads as
missing rather than as an empty row.
"""

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

SCRIPTS = Path(__file__).resolve().parent.parent
SCRIPT = SCRIPTS / "intake_documents.py"
sys.path.insert(0, str(SCRIPTS))
from intake_documents import estimate_tokens_from_text  # noqa: E402

REGISTRY_REL = ".sdlc/artifacts/00-discovery/document-registry.md"
INDEX_REL = ".sdlc/context/intake/index.md"

DOCS = {
    "alpha-rfp.md": "# Alpha RFP\n\nThe client needs a claims portal with audit trails.\n",
    "beta-notes.txt": "Meeting notes from the kickoff. Three stakeholders attended the session.\n",
    "gamma-api.md": "# API\n\n" + "endpoint description words " * 40 + "\n",
}

SUMMARY = """---
doc_id: "{doc_id}"
filename: "{name}"
type: "markdown"
---

# {doc_id}: {name}

## Document Overview
{overview}

## Key Information
- **Purpose:** Explain the claims portal.
- **Audience:** The delivery team.
- **Scope:** {scope}
"""


def run(args, cwd=None, budget_env=None):
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args], capture_output=True, text=True, encoding="utf-8", cwd=cwd,
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
    )


def build(root: Path, *, index_budget: int = 5000) -> Path:
    sdlc = root / ".sdlc"
    sdlc.mkdir(parents=True)
    state = sdlc / "state.yaml"
    state.write_text("project: fixture\n", encoding="utf-8")
    (sdlc / "profile.yaml").write_text(yaml.safe_dump({
        "version": "1.0",
        "documentation": {"intake_path": "docs/intake", "types": ["markdown", "text"], "index_budget_tokens": index_budget},
    }), encoding="utf-8")
    intake = root / "docs" / "intake"
    intake.mkdir(parents=True)
    for name, body in DOCS.items():
        (intake / name).write_text(body, encoding="utf-8")
    assert run(["--state", str(state)]).returncode == 0
    return state


def summarise(root: Path, doc_id: str, name: str, *, scope="Claims portal behaviour and audit trails",
              overview="A one paragraph overview of the portal. It has a second sentence."):
    folder = root / ".sdlc" / "context" / "intake"
    slug = name.rsplit(".", 1)[0]
    (folder / f"{doc_id}-{slug}.md").write_text(
        SUMMARY.format(doc_id=doc_id, name=name, scope=scope, overview=overview), encoding="utf-8")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.fixture
def project(tmp_path):
    root = tmp_path.resolve()
    state = build(root)
    return root, state


def registry(root: Path, state: Path, *extra):
    return run(["--state", str(state), "--registry", "--json", *extra])


class TestRefusals:
    def test_no_catalogue_exits_1_and_writes_nothing(self, tmp_path):
        root = tmp_path.resolve()
        (root / ".sdlc").mkdir()
        state = root / ".sdlc" / "state.yaml"
        state.write_text("project: x\n", encoding="utf-8")
        proc = run(["--state", str(state), "--registry"])
        assert proc.returncode == 1 and "no catalog to build a registry from; run intake first" in proc.stderr
        assert not (root / REGISTRY_REL).exists() and not (root / INDEX_REL).exists()

    @pytest.mark.parametrize("extra", [["--skip", "DOC-001"], ["--priority", "DOC-001"], ["--lock"], ["--rescan"]])
    def test_combined_with_a_catalogue_change_is_a_usage_error(self, project, extra):
        root, state = project
        proc = run(["--state", str(state), "--registry", *extra])
        assert proc.returncode == 2
        assert not (root / REGISTRY_REL).exists()

    def test_with_docs_it_is_a_usage_error(self, project):
        root, state = project
        assert run(["--registry", "--docs", str(root / "docs" / "intake")]).returncode == 2

    def test_it_never_changes_the_catalogue(self, project):
        root, state = project
        catalog = root / ".sdlc" / "context" / "intake" / "catalog.json"
        before = sha(catalog)
        assert registry(root, state).returncode == 0
        assert sha(catalog) == before


class TestRegistryContent:
    def test_the_numbers_come_from_the_catalogue(self, project):
        root, state = project
        doc = json.loads(registry(root, state).stdout)
        assert doc["documents"] == 3 and doc["registry_created"] is True
        text = (root / REGISTRY_REL).read_text(encoding="utf-8")
        catalog = json.loads((root / ".sdlc/context/intake/catalog.json").read_text(encoding="utf-8"))
        total = sum(d["estimated_tokens"] for d in catalog["documents"])
        assert "| Total Documents | 3 |" in text
        assert f"| Total Estimated Tokens | {total} |" in text
        assert "markdown: 2" in text and "text: 1" in text
        assert "| Index Budget | 5000 tokens |" in text

    def test_rows_follow_priority_then_id(self, project):
        root, state = project
        assert run(["--state", str(state), "--priority", "DOC-003,DOC-001", "--json"]).returncode == 0
        registry(root, state)
        rows = [l for l in (root / REGISTRY_REL).read_text(encoding="utf-8").splitlines() if l.startswith("| DOC-")]
        assert [r.split("|")[1].strip() for r in rows][:3] == ["DOC-003", "DOC-001", "DOC-002"]

    def test_a_summarised_document_gets_a_link_and_key_topics_from_its_scope(self, project):
        root, state = project
        summarise(root, "DOC-001", "alpha-rfp.md", scope="x" * 120)
        doc = json.loads(registry(root, state).stdout)
        row = next(l for l in (root / REGISTRY_REL).read_text(encoding="utf-8").splitlines() if l.startswith("| DOC-001"))
        assert "[Summary](../../context/intake/DOC-001-alpha-rfp.md)" in row
        assert ("x" * 80) in row and ("x" * 81) not in row
        assert doc["summarised"] == 1 and doc["missing_summaries"] == ["DOC-002", "DOC-003"]

    def test_a_missing_or_placeholder_summary_reads_as_not_yet_summarised(self, project):
        root, state = project
        folder = root / ".sdlc" / "context" / "intake"
        (folder / "DOC-002-beta-notes.md").write_text("# ${ONE_PARAGRAPH_SUMMARY}\n", encoding="utf-8")
        doc = json.loads(registry(root, state).stdout)
        rows = {l.split("|")[1].strip(): l for l in (root / REGISTRY_REL).read_text(encoding="utf-8").splitlines()
                if l.startswith("| DOC-") and l.count("|") == 7}  # the Document Index rows, not the cross-reference map's
        assert "(not yet summarised)" in rows["DOC-001"] and "(not yet summarised)" in rows["DOC-002"]
        assert "[Summary]" not in rows["DOC-002"]
        assert doc["missing_summaries"] == ["DOC-001", "DOC-002", "DOC-003"]

    def test_a_skipped_document_stays_in_the_registry_and_leaves_the_index(self, project):
        root, state = project
        assert run(["--state", str(state), "--skip", "DOC-002", "--json"]).returncode == 0
        registry(root, state)
        text = (root / REGISTRY_REL).read_text(encoding="utf-8")
        assert "(skipped)" in next(l for l in text.splitlines() if l.startswith("| DOC-002"))
        index = (root / INDEX_REL).read_text(encoding="utf-8")
        assert "DOC-002" not in index and "DOC-001" in index and "DOC-003" in index


class TestRerunPreservesWhatAPersonWrote:
    EDIT = "| Claims | DOC-001, DOC-003 | Everything about handling a claim. |"

    def hand_edit(self, path: Path, newline: str):
        text = path.read_text(encoding="utf-8")
        edited = text.replace("| ${CLUSTER_NAME} | DOC-001, DOC-003 | ${CLUSTER_DESCRIPTION} |", self.EDIT)
        assert edited != text
        path.write_bytes(edited.replace("\r\n", "\n").replace("\n", newline).encode("utf-8"))

    @pytest.mark.parametrize("newline", ["\n", "\r\n"])
    def test_only_the_two_gathered_sections_and_the_timestamp_change(self, project, newline):
        root, state = project
        registry(root, state)
        path = root / REGISTRY_REL
        self.hand_edit(path, newline)
        before = path.read_bytes().decode("utf-8")
        summarise(root, "DOC-001", "alpha-rfp.md")  # new information the gathered sections must pick up
        doc = json.loads(registry(root, state).stdout)
        after = path.read_bytes().decode("utf-8")

        assert doc["registry_created"] is False
        assert self.EDIT in after
        if newline == "\r\n":
            assert after.count("\n") == after.count("\r\n")  # every line ending is still CRLF
        else:
            assert "\r" not in after
        assert "[Summary](../../context/intake/DOC-001-alpha-rfp.md)" in after

        def outside(text):
            lines, keep, skipping = text.replace("\r\n", "\n").split("\n"), [], False
            for line in lines:
                if line.startswith("## "):
                    skipping = line in ("## Document Corpus Summary", "## Document Index")
                if not skipping and not line.startswith("Generated:"):
                    keep.append(line)
            return keep

        assert outside(after) == outside(before)

    def test_a_second_run_changes_nothing_but_the_timestamp(self, project):
        root, state = project
        registry(root, state)
        path = root / REGISTRY_REL
        first = path.read_text(encoding="utf-8")
        registry(root, state)
        second = path.read_text(encoding="utf-8")
        strip = lambda t: [l for l in t.splitlines() if not l.startswith("Generated:")]
        assert strip(first) == strip(second)

    def test_a_missing_heading_is_a_warning_and_the_other_section_still_updates(self, project):
        root, state = project
        registry(root, state)
        path = root / REGISTRY_REL
        path.write_text(path.read_text(encoding="utf-8").replace("## Document Index", "## Renamed By Hand"), encoding="utf-8")
        summarise(root, "DOC-001", "alpha-rfp.md")
        proc = registry(root, state)
        assert proc.returncode == 0
        doc = json.loads(proc.stdout)
        assert any("Document Index" in w for w in doc["warnings"])
        assert "## Renamed By Hand" in path.read_text(encoding="utf-8")


class TestIndex:
    def test_one_line_per_active_document_within_the_budget(self, project):
        root, state = project
        summarise(root, "DOC-001", "alpha-rfp.md")
        doc = json.loads(registry(root, state).stdout)
        text = (root / INDEX_REL).read_text(encoding="utf-8")
        lines = [l for l in text.splitlines() if l.startswith("- DOC-")]
        assert [l.split()[1] for l in lines] == ["DOC-001", "DOC-002", "DOC-003"]
        assert "A one paragraph overview of the portal." in lines[0] and "no summary yet" in lines[1]
        assert doc["index_tokens"] == estimate_tokens_from_text(text) <= doc["index_budget"]
        assert doc["index_within_budget"] is True and doc["trimmed"] == []

    def test_filled_topic_clusters_are_included(self, project):
        root, state = project
        registry(root, state)
        TestRerunPreservesWhatAPersonWrote().hand_edit(root / REGISTRY_REL, "\n")
        registry(root, state)
        assert "Claims" in (root / INDEX_REL).read_text(encoding="utf-8")

    def test_an_unfilled_cluster_row_is_not_copied_into_the_index(self, project):
        root, state = project
        registry(root, state)
        assert "CLUSTER_NAME" not in (root / INDEX_REL).read_text(encoding="utf-8")


class TestTrimming:
    def tight(self, tmp_path, budget):
        root = tmp_path.resolve()
        state = build(root, index_budget=budget)
        for doc_id, name in (("DOC-001", "alpha-rfp.md"), ("DOC-002", "beta-notes.txt"), ("DOC-003", "gamma-api.md")):
            summarise(root, doc_id, name, overview="Word " * 60 + "ends here.")
        return root, state

    def test_clusters_go_first_then_descriptions_shorten_and_ids_survive(self, tmp_path):
        root, state = self.tight(tmp_path, 90)
        registry(root, state)
        TestRerunPreservesWhatAPersonWrote().hand_edit(root / REGISTRY_REL, "\n")
        doc = json.loads(registry(root, state).stdout)
        assert doc["trimmed"][0] == "topic clusters dropped"
        assert any(step.startswith("descriptions shortened") for step in doc["trimmed"])
        text = (root / INDEX_REL).read_text(encoding="utf-8")
        assert all(i in text for i in ("DOC-001", "DOC-002", "DOC-003"))
        assert doc["index_tokens"] <= doc["index_budget"] and doc["index_within_budget"] is True

    def test_when_the_ids_alone_exceed_the_budget_it_is_written_in_full_and_says_so(self, tmp_path):
        root, state = self.tight(tmp_path, 5)
        doc = json.loads(registry(root, state).stdout)
        text = (root / INDEX_REL).read_text(encoding="utf-8")
        assert all(i in text for i in ("DOC-001", "DOC-002", "DOC-003"))
        assert doc["index_within_budget"] is False and doc["index_tokens"] > doc["index_budget"]
        assert doc["trimmed"][-1] == "descriptions removed"


class TestOutput:
    def test_json_has_exactly_the_documented_keys_and_forward_slashes(self, project):
        root, state = project
        doc = json.loads(registry(root, state).stdout)
        assert set(doc) == {"registry", "index", "documents", "summarised", "missing_summaries", "index_tokens",
                            "index_budget", "index_within_budget", "trimmed", "registry_created", "warnings"}
        assert doc["registry"] == REGISTRY_REL and doc["index"] == INDEX_REL

    def test_text_mode_says_the_same_in_plain_lines(self, project):
        root, state = project
        proc = run(["--state", str(state), "--registry"])
        assert proc.returncode == 0
        assert "Registry" in proc.stdout and "Index" in proc.stdout and "not yet summarised" in proc.stdout.lower()

    def test_works_with_repo_as_well_as_state(self, project):
        root, state = project
        assert json.loads(run(["--repo", str(root), "--registry", "--json"]).stdout)["documents"] == 3
