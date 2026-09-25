"""Tests for declare_complete.py — can Build be declared finished (spec 0014).

A declaration is the one moment in this system where somebody says "we are done" out loud, in
writing, with their name on it. Everything here exists so that sentence is true when it is said,
so the tests are about the refusals:

  A REFUSAL NAMES WHAT IS OUTSTANDING. A refusal a person cannot act on is a wall; one that
  lists the specs and who is building each is a to-do list. Every blocker carries its items.

  ALL BLOCKERS AT ONCE, not the first. Somebody about to end a phase wants the list, not a game
  of whack-a-mole.

  A CONFIRMATION HAS A NAME ON IT. "The claims team confirmed" with nobody named is not a
  confirmation, and the point of asking each lead is whose assertion it is.
"""

import pytest

import declare_complete as dc

SPEC = """\
---
spec: "{id}"
name: "{name}"
status: {status}
deferred_reason: "{reason}"
type: feature
risk: LOW
owner: "@MCKRUZ"
developer: "{developer}"
team: "{team}"
created: "2026-09-25"
---

# Spec {id} — {name}
"""


def _project(tmp_path, specs):
    d = tmp_path / "specs"
    d.mkdir(exist_ok=True)
    for i, (status, team, developer, reason) in enumerate(specs, start=1):
        sid = f"{i:04d}"
        (d / f"{sid}-thing-{i}.md").write_text(
            SPEC.format(id=sid, name=f"thing-{i}", status=status, team=team,
                        developer=developer, reason=reason),
            encoding="utf-8")
    return tmp_path


ALL_MERGED = [("merged", "claims", "@sam-k", ""), ("merged", "platform", "@sam-k", "")]
CONFIRMED = {"claims": "@priya-n", "platform": "@sam-oduya"}


class TestEverythingDecided:
    def test_all_merged_and_confirmed_can_declare(self, tmp_path):
        result = dc.assess(_project(tmp_path, ALL_MERGED), CONFIRMED)
        assert result["can_declare"] is True
        assert result["blockers"] == []

    def test_deferred_with_a_reason_counts_as_decided(self, tmp_path):
        # A deferral IS a decision somebody made and recorded. This does not second-guess it.
        specs = [("merged", "claims", "@sam-k", ""),
                 ("deferred", "platform", "", "the upstream service slipped a quarter")]
        result = dc.assess(_project(tmp_path, specs), CONFIRMED)
        assert result["can_declare"] is True
        assert len(result["deferred"]) == 1

    def test_a_project_with_no_specs_at_all_can_declare(self, tmp_path):
        (tmp_path / "specs").mkdir()
        assert dc.assess(tmp_path, {})["can_declare"] is True


class TestUnfinishedSpecs:
    @pytest.mark.parametrize("status", ["draft", "ready", "in-flight"])
    def test_any_undecided_status_blocks(self, tmp_path, status):
        specs = [("merged", "claims", "@sam-k", ""), (status, "claims", "@sam-k", "")]
        result = dc.assess(_project(tmp_path, specs), {"claims": "@priya-n"})
        assert result["can_declare"] is False
        blocker = next(b for b in result["blockers"] if b["kind"] == "unfinished_specs")
        assert blocker["count"] == 1

    def test_the_refusal_NAMES_each_spec_and_who_is_building_it(self, tmp_path):
        # A refusal a person cannot act on is a wall.
        specs = [("in-flight", "claims", "@sam-k", "")]
        blocker = next(b for b in dc.assess(_project(tmp_path, specs), {"claims": "@x"})["blockers"]
                       if b["kind"] == "unfinished_specs")
        assert blocker["specs"][0]["spec"] == "0001"
        assert blocker["specs"][0]["developer"] == "@sam-k"
        assert blocker["specs"][0]["status"] == "in-flight"

    def test_nobody_assigned_is_reported_as_such(self, tmp_path):
        specs = [("draft", "claims", "", "")]
        blocker = next(b for b in dc.assess(_project(tmp_path, specs), {"claims": "@x"})["blockers"]
                       if b["kind"] == "unfinished_specs")
        assert blocker["specs"][0]["developer"] is None


class TestDeferredWithoutAReason:
    def test_it_is_its_own_blocker_not_an_unfinished_spec(self, tmp_path):
        # The decision was made; the record of WHY was lost. Those need different fixes, so they
        # are reported differently.
        specs = [("deferred", "claims", "", "")]
        result = dc.assess(_project(tmp_path, specs), {"claims": "@x"})
        kinds = {b["kind"] for b in result["blockers"]}
        assert "deferred_without_reason" in kinds
        assert "unfinished_specs" not in kinds


class TestTeamConfirmation:
    def test_every_team_with_a_spec_must_confirm(self, tmp_path):
        result = dc.assess(_project(tmp_path, ALL_MERGED), {"claims": "@priya-n"})
        blocker = next(b for b in result["blockers"] if b["kind"] == "unconfirmed_teams")
        assert blocker["teams"] == ["platform"]

    def test_a_team_whose_specs_are_ALL_deferred_still_confirms(self, tmp_path):
        # "None of mine were built, and here is why" is exactly the confirmation worth having.
        specs = [("deferred", "platform", "", "the client withdrew this requirement")]
        result = dc.assess(_project(tmp_path, specs), {})
        assert "platform" in next(b for b in result["blockers"]
                                  if b["kind"] == "unconfirmed_teams")["teams"]

    def test_a_spec_with_NO_team_is_its_own_blocker(self, tmp_path):
        # Found by running this rather than reading it: the tracker calls a missing team
        # "unassigned", which is not a team — nobody leads it, so no confirmation can ever
        # arrive, and treating it as one would request a confirmation from nobody.
        specs = [("merged", "", "@sam-k", "")]
        result = dc.assess(_project(tmp_path, specs), {})
        kinds = {b["kind"] for b in result["blockers"]}
        assert "specs_with_no_team" in kinds
        assert "unconfirmed_teams" not in kinds

    def test_unassigned_is_never_asked_to_confirm(self, tmp_path):
        specs = [("merged", "", "@sam-k", "")]
        assert dc.assess(_project(tmp_path, specs), {})["teams_in_list"] == []


class TestAllBlockersAtOnce:
    def test_it_reports_every_problem_rather_than_the_first(self, tmp_path):
        # A person about to end a phase wants the list, not a game of whack-a-mole.
        specs = [("in-flight", "claims", "@sam-k", ""),
                 ("deferred", "platform", "", "")]
        kinds = {b["kind"] for b in dc.assess(_project(tmp_path, specs), {})["blockers"]}
        assert kinds == {"unfinished_specs", "deferred_without_reason", "unconfirmed_teams"}


class TestDeclare:
    def test_an_unnamed_declaration_is_refused(self, tmp_path):
        for nobody in ("", "   ", None):
            with pytest.raises(dc.DeclarationError) as e:
                dc.declare(_project(tmp_path, ALL_MERGED), nobody, CONFIRMED)
            assert e.value.kind == "no_declaring_person"

    def test_it_refuses_while_anything_is_outstanding(self, tmp_path):
        specs = [("in-flight", "claims", "@sam-k", "")]
        with pytest.raises(dc.DeclarationError) as e:
            dc.declare(_project(tmp_path, specs), "Matt K", {"claims": "@priya-n"})
        assert e.value.kind == "unfinished_specs"

    def test_a_permitted_declaration_records_who_and_what_was_deferred(self, tmp_path):
        specs = [("deferred", "claims", "", "the client withdrew this requirement")]
        result = dc.declare(_project(tmp_path, specs), "Matt K", {"claims": "@priya-n"})
        assert result["declared_by"] == "Matt K"
        assert result["deferred"][0]["reason"] == "the client withdrew this requirement"

    def test_it_does_NOT_advance_the_phase_itself(self, tmp_path):
        # advance_phase.py is protected core and already owns that transition with its own gate
        # checks. Wrapping it here would put a second opinion about when a phase may end next to
        # the one that already exists.
        result = dc.declare(_project(tmp_path, ALL_MERGED), "Matt K", CONFIRMED)
        assert "advance_phase.py" in result["next_step"]
        assert "does not advance" in result["next_step"]


class TestParsingConfirmations:
    def test_team_equals_handle(self):
        assert dc._parse_confirmations(["claims=@priya-n"]) == {"claims": "@priya-n"}

    @pytest.mark.parametrize("bad", ["claims", "=@priya-n", "claims=", "  =  "])
    def test_a_confirmation_without_a_name_is_refused(self, bad):
        # The point of asking each lead is whose assertion it is.
        with pytest.raises(dc.DeclarationError) as e:
            dc._parse_confirmations([bad])
        assert e.value.kind == "bad_confirmation"

    def test_no_confirmations_is_an_empty_map_not_an_error(self):
        assert dc._parse_confirmations(None) == {}


class TestItNeverDeclaresOverAThingItCouldNotRead:
    """The one direction this command must never fail in.

    `scan_specs` silently skips a spec whose frontmatter is missing or unclosed — correct for a
    tracker, which is reporting on what it can see. Here it was catastrophic: a skipped spec
    appeared in neither the unfinished list nor the team list, so it raised no blocker and
    requested no confirmation, and the declaration went through as though the file did not
    exist. An in-flight spec became "Build is complete" because of a missing `---`.

    Unreadable is not finished. An empty answer from a directory that could not be read is not
    "there is nothing left to build".
    """

    UNCLOSED = '---\nspec: "0002"\nname: "unfinished"\nstatus: in-flight\nteam: "core"\n\n# body\n'

    def _with_unreadable(self, tmp_path):
        project = _project(tmp_path, ALL_MERGED)
        (project / "specs" / "0002-unfinished.md").write_text(self.UNCLOSED, encoding="utf-8")
        return project

    def test_an_unreadable_spec_blocks_the_declaration(self, tmp_path):
        result = dc.assess(self._with_unreadable(tmp_path), CONFIRMED)
        assert result["can_declare"] is False
        blocker = next(b for b in result["blockers"] if b["kind"] == "unreadable_specs")
        assert blocker["count"] == 1

    def test_the_refusal_NAMES_the_file_so_it_can_be_fixed(self, tmp_path):
        result = dc.assess(self._with_unreadable(tmp_path), CONFIRMED)
        blocker = next(b for b in result["blockers"] if b["kind"] == "unreadable_specs")
        assert "0002-unfinished.md" in blocker["message"]

    def test_declaring_over_one_is_refused(self, tmp_path):
        with pytest.raises(dc.DeclarationError) as e:
            dc.declare(self._with_unreadable(tmp_path), "Matt K", CONFIRMED)
        assert e.value.kind == "unreadable_specs"

    def test_a_MISSING_specs_directory_is_not_an_empty_backlog(self, tmp_path):
        # Renamed, not yet created, or unreadable — every one of those answers "what is in
        # Build?" with "unknown", and unknown is not nothing.
        result = dc.assess(tmp_path, {})
        assert result["can_declare"] is False
        assert any(b["kind"] == "no_specs_directory" for b in result["blockers"])

    def test_an_EMPTY_specs_directory_still_can_declare(self, tmp_path):
        # The control for the case above: a directory that was read and genuinely holds nothing
        # is a real answer, and must stay distinguishable from one that could not be read.
        (tmp_path / "specs").mkdir()
        assert dc.assess(tmp_path, {})["can_declare"] is True

    def test_a_README_in_specs_is_not_mistaken_for_an_unreadable_spec(self, tmp_path):
        project = _project(tmp_path, ALL_MERGED)
        (project / "specs" / "README.md").write_text("# How specs work\n", encoding="utf-8")
        assert dc.assess(project, CONFIRMED)["can_declare"] is True

    def test_the_totals_report_the_unreadable_count(self, tmp_path):
        result = dc.assess(self._with_unreadable(tmp_path), CONFIRMED)
        assert result["totals"]["unreadable"] == 1
