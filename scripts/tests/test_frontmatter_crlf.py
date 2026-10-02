"""Editing a spec's frontmatter must not change its line endings.

Specs check out with CRLF on Windows, and four places edit one frontmatter field in place with the
pattern `^field:.*$`. In Python a `.` also matches the `\\r` of a CRLF line, so the match swallowed
the carriage return and the replacement left a bare LF in the middle of an otherwise-CRLF file:

    risk: HIGH\\n          <- was  risk: MEDIUM\\r\\n

A mixed-ending file is a diff of every line it touches in the next commit and trips editors and
tools that assume one convention. It was reachable from Studio's mark-ready, set-risk and defer
(spec_transition), from the hand-off commit (handoff) and from the merged-status write (spec_status).
Found while building bind_channel, which avoids it with its own edit.
"""

import pytest

import handoff
import spec_status
import spec_transition


def spec_text(eol):
    return eol.join([
        "---", 'spec: "0042"', "status: ready", "risk: MEDIUM", 'developer: ""',
        'deferred_reason: ""', "team: core", "---", "", "# Body", "",
    ])


def bare_lf(text):
    return sum(1 for i, c in enumerate(text) if c == "\n" and (i == 0 or text[i - 1] != "\r"))


class TestCrlfSpecsKeepTheirLineEndings:
    @pytest.mark.parametrize("field,value", [("risk", "HIGH"), ("status", "deferred"), ("deferred_reason", "'the vendor slipped'")])
    def test_spec_transition_sets_one_field_without_touching_any_line_ending(self, field, value):
        original = spec_text("\r\n")
        out = spec_transition.set_frontmatter_field(original, field, value)
        assert bare_lf(out) == 0
        assert out.count("\r\n") == original.count("\r\n")
        assert f"{field}: {value}\r\n" in out

    def test_spec_transition_adding_a_missing_field_to_a_crlf_spec(self):
        original = spec_text("\r\n").replace("team: core\r\n", "")
        out = spec_transition.set_frontmatter_field(original, "team", "core", add_if_missing=True)
        assert bare_lf(out) == 0 and "team: core" in out

    def test_handoff_sets_status_and_developer_without_touching_any_line_ending(self):
        out = handoff.set_status_and_developer(spec_text("\r\n"), "@sam-k")
        assert bare_lf(out) == 0
        assert "status: in-flight\r\n" in out and 'developer: "@sam-k"\r\n' in out

    def test_spec_status_marks_merged_without_touching_any_line_ending(self):
        out = spec_status._set_status_merged(spec_text("\r\n"))
        assert bare_lf(out) == 0 and "status: merged\r\n" in out


class TestLfSpecsAreUnchanged:
    def test_an_lf_spec_stays_lf_through_every_edit(self):
        text = spec_text("\n")
        for out in (
            spec_transition.set_frontmatter_field(text, "risk", "HIGH"),
            handoff.set_status_and_developer(text, "@sam-k"),
            spec_status._set_status_merged(text),
        ):
            assert "\r" not in out

    def test_only_the_edited_line_differs(self):
        text = spec_text("\r\n")
        out = spec_transition.set_frontmatter_field(text, "risk", "HIGH")
        assert [a for a, b in zip(text.split("\r\n"), out.split("\r\n")) if a != b] == ["risk: MEDIUM"]

    def test_a_trailing_comment_on_the_line_is_not_what_decides_the_ending(self):
        text = spec_text("\r\n").replace("risk: MEDIUM", "risk: MEDIUM   # tier")
        out = spec_transition.set_frontmatter_field(text, "risk", "HIGH")
        assert bare_lf(out) == 0 and "risk: HIGH\r\n" in out
