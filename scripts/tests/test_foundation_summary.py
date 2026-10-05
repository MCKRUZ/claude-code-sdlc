"""Tests for foundation_summary.py — what Foundation handed to Build (spec 0013).

Spec 0013 asks for this list to be READ FROM THE DOCUMENTS rather than written into the
application, and that clause is the whole design. A hardcoded list would look right the day it
was written and quietly stop matching the moment a template changed — leaving a screen showing
a confident summary of something no longer true. So the tests below are mostly about where the
information comes from:

  WHICH documents count is the phase registry's answer, not this module's.
  WHAT each contains is read from the file, using the shape library's own heading parser.
  A DOCUMENT THAT DOES NOT EXIST says so rather than being omitted — a Build that opened
  without a risk tier map is a real situation, and a quietly shorter list hides it.
"""

import phase_model as pm
import foundation_summary as fs

CADENCE = """\
# Cadence plan

Prose a person wrote.

## The two numbers

Body.

## WIP Limits

| team | wip_limit |
|------|-----------|
| claims | 2 |

## Review-wait alarms

Body.
"""


def _project(tmp_path, documents=None):
    d = tmp_path / ".sdlc" / "artifacts" / "03-foundation"
    d.mkdir(parents=True, exist_ok=True)
    for name, text in (documents or {}).items():
        (d / name).write_text(text, encoding="utf-8")
    return tmp_path


class TestWhichDocumentsCount:
    def test_the_list_comes_from_the_phase_registry(self, tmp_path):
        result = fs.summarize(_project(tmp_path))
        assert result["ok"] is True
        from_registry = {a.name for a in pm.required_artifacts(pm.get_phase("3"))}
        assert {d["name"] for d in result["documents"]} == from_registry

    def test_it_names_the_stage_the_registry_names(self, tmp_path):
        result = fs.summarize(_project(tmp_path))
        assert result["stage"]["display"] == pm.get_phase("3")["display"]
        assert result["stage"]["description"]

    def test_every_document_names_where_it_lives(self, tmp_path):
        for doc in fs.summarize(_project(tmp_path))["documents"]:
            assert doc["path"].endswith(doc["name"])
            # Repo-relative, so it is a location a person can actually go to.
            assert not doc["path"].startswith(("C:", "/"))


class TestWhatEachContains:
    def test_sections_are_read_from_the_file(self, tmp_path):
        project = _project(tmp_path, {"cadence-plan.md": CADENCE})
        doc = next(d for d in fs.summarize(project)["documents"] if d["name"] == "cadence-plan.md")
        assert doc["exists"] is True
        assert doc["sections"] == ["The two numbers", "WIP Limits", "Review-wait alarms"]

    def test_changing_the_document_changes_the_summary(self, tmp_path):
        # The property that makes this read-from-the-document rather than a list in the app.
        project = _project(tmp_path, {"cadence-plan.md": CADENCE})
        before = next(d for d in fs.summarize(project)["documents"]
                      if d["name"] == "cadence-plan.md")["sections"]
        path = project / ".sdlc" / "artifacts" / "03-foundation" / "cadence-plan.md"
        path.write_text(CADENCE + "\n## Something new\n\nBody.\n", encoding="utf-8")
        after = next(d for d in fs.summarize(project)["documents"]
                     if d["name"] == "cadence-plan.md")["sections"]
        assert after == before + ["Something new"]

    def test_a_document_with_no_sections_is_not_an_error(self, tmp_path):
        project = _project(tmp_path, {"cadence-plan.md": "# Title only\n\nprose\n"})
        doc = next(d for d in fs.summarize(project)["documents"] if d["name"] == "cadence-plan.md")
        assert doc["exists"] is True and doc["sections"] == [] and doc["note"] is None


class TestMissingIsShownNotHidden:
    def test_an_absent_document_is_listed_and_says_why(self, tmp_path):
        # A quietly shorter list hides exactly the thing worth noticing.
        result = fs.summarize(_project(tmp_path))
        absent = [d for d in result["documents"] if not d["exists"]]
        assert absent, "every document was present — fixture wrong"
        for doc in absent:
            assert doc["sections"] == []
            assert "not been written yet" in doc["note"]

    def test_present_and_absent_appear_in_one_list(self, tmp_path):
        result = fs.summarize(_project(tmp_path, {"cadence-plan.md": CADENCE}))
        states = {d["name"]: d["exists"] for d in result["documents"]}
        assert states["cadence-plan.md"] is True
        assert any(v is False for v in states.values())


class TestHeadingParsing:
    def test_it_uses_the_shape_librarys_own_parser(self):
        # Not a second piece of markdown-reading logic to keep in step with the first.
        assert fs._headings("## One\n\nbody\n\n## Two\n") == ["One", "Two"]

    def test_a_third_level_heading_is_not_a_section(self):
        assert fs._headings("## One\n\n### Not a section\n") == ["One"]

    def test_a_hash_inside_prose_is_not_a_heading(self):
        assert fs._headings("## Real\n\nsee issue #42 and ## not a heading mid-line\n") == ["Real"]
