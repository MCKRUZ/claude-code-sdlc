"""Tests for new_spike.py — spike scaffolding, id allocation, and the bounding rules.

A spike's whole value is that it is bounded and that its finding is written down. These tests
encode why that matters, not just that the file lands: an unboxed spike is unsupervised building,
and a spike nobody named is Claude deciding to spike, which it does not get to do.
"""

import argparse

import pytest

from new_spike import create_spike, render_spike


TEMPLATE = (
    '---\n'
    'spike: "NNNN"\n'
    'name: "short-kebab-name"\n'
    'status: open             # open | closed\n'
    'box: "—"                 # the agreed time or token box\n'
    'opened_by: "—"           # the named human who opened it\n'
    'unblocks: "—"            # decision-list item id\n'
    'created: "YYYY-MM-DD"\n'
    '---\n\n'
    '# Spike NNNN — <the question, phrased as a question>\n\n'
    '## The unknown\n'
)


class TestRenderSpike:
    def test_fills_every_frontmatter_placeholder(self):
        out = render_spike(TEMPLATE, "0003", "carrier-idempotency", "1 working day", "M. Kruczek", "DL-14")
        assert 'spike: "0003"' in out
        assert 'name: "carrier-idempotency"' in out
        assert 'box: "1 working day"' in out
        assert 'opened_by: "M. Kruczek"' in out
        assert 'unblocks: "DL-14"' in out

    def test_leaves_no_unrendered_placeholders(self):
        out = render_spike(TEMPLATE, "0001", "x", "4h", "Someone", "ADR-0007")
        assert "NNNN" not in out
        assert "YYYY-MM-DD" not in out
        assert "short-kebab-name" not in out
        # The em-dash defaults must be consumed, not left looking like real values.
        assert 'box: "—"' not in out
        assert 'opened_by: "—"' not in out

    def test_status_stays_open_on_a_new_spike(self):
        """A freshly scaffolded spike is open — closing it is the author's act, not the tool's."""
        out = render_spike(TEMPLATE, "0002", "y", "1d", "Someone", "—")
        assert "status: open" in out

    def test_title_carries_the_id_and_name(self):
        out = render_spike(TEMPLATE, "0009", "queue-ordering", "2h", "Someone", "—")
        assert "# Spike 0009 — queue-ordering" in out

    def test_body_prompts_survive_for_the_author(self):
        """Rendering fills frontmatter only — the thinking prompts must remain."""
        out = render_spike(TEMPLATE, "0004", "z", "1d", "Someone", "—")
        assert "## The unknown" in out


class TestCreateSpike:
    def test_creates_spikes_dir_and_file(self, tmp_path, monkeypatch):
        _use_real_template(monkeypatch)
        p = create_spike(tmp_path, "Carrier API idempotency", "1 working day", "M. Kruczek", "DL-14")
        assert p.exists()
        assert p.parent.name == "spikes"
        assert p.name == "0001-carrier-api-idempotency.md"

    def test_ids_increment_independently_of_specs(self, tmp_path, monkeypatch):
        """Spike ids come from the spikes/ dir — a repo full of specs must not shift them."""
        _use_real_template(monkeypatch)
        specs = tmp_path / "specs"
        specs.mkdir()
        (specs / "0042-unrelated.md").write_text("x", encoding="utf-8")

        first = create_spike(tmp_path, "one", "1d", "A", "—")
        second = create_spike(tmp_path, "two", "1d", "A", "—")
        assert first.name.startswith("0001-")
        assert second.name.startswith("0002-")

    def test_rejects_a_name_that_slugs_to_nothing(self, tmp_path, monkeypatch):
        _use_real_template(monkeypatch)
        with pytest.raises(SystemExit):
            create_spike(tmp_path, "!!!", "1d", "A", "—")

    def test_never_overwrites_an_existing_finding(self, tmp_path, monkeypatch):
        """A committed finding is the durable record — reusing its name must be impossible.

        Ids come from max+1, so a same-name spike gets the next id rather than colliding. The
        guarantee under test is the one that matters: the earlier finding is still on disk,
        untouched, after a spike with an identical name is scaffolded.
        """
        _use_real_template(monkeypatch)
        spikes = tmp_path / "spikes"
        spikes.mkdir()
        (spikes / "0001-taken.md").write_text("original finding", encoding="utf-8")

        p = create_spike(tmp_path, "taken", "1d", "A", "—")
        assert p.name == "0002-taken.md"
        assert (spikes / "0001-taken.md").read_text(encoding="utf-8") == "original finding"

    def test_id_continues_past_the_highest_existing_even_with_gaps(self, tmp_path, monkeypatch):
        """Deleting a spike must not recycle its id — findings are referenced by number."""
        _use_real_template(monkeypatch)
        spikes = tmp_path / "spikes"
        spikes.mkdir()
        (spikes / "0001-a.md").write_text("x", encoding="utf-8")
        (spikes / "0007-c.md").write_text("x", encoding="utf-8")  # 0002-0006 deleted or never used
        p = create_spike(tmp_path, "next one", "1d", "A", "—")
        assert p.name == "0008-next-one.md"


class TestMainGuards:
    """The bounding rules are the point of the mode — they are enforced, not documented."""

    def test_empty_box_is_refused(self, tmp_path, monkeypatch):
        import new_spike
        _use_real_template(monkeypatch)
        monkeypatch.setattr(
            "sys.argv",
            ["new_spike.py", "--repo", str(tmp_path), "--name", "x", "--box", "   ", "--opened-by", "A"],
        )
        with pytest.raises(SystemExit):
            new_spike.main()
        assert not (tmp_path / "spikes").exists()

    def test_empty_opener_is_refused(self, tmp_path, monkeypatch):
        import new_spike
        _use_real_template(monkeypatch)
        monkeypatch.setattr(
            "sys.argv",
            ["new_spike.py", "--repo", str(tmp_path), "--name", "x", "--box", "1d", "--opened-by", "  "],
        )
        with pytest.raises(SystemExit):
            new_spike.main()
        assert not (tmp_path / "spikes").exists()

    def test_box_and_opener_are_required_arguments(self, tmp_path):
        """argparse must refuse the call outright — not default to an unbounded spike."""
        import new_spike
        parser_args = ["--repo", str(tmp_path), "--name", "x"]
        import sys as _sys
        old = _sys.argv
        try:
            _sys.argv = ["new_spike.py", *parser_args]
            with pytest.raises(SystemExit):
                new_spike.main()
        finally:
            _sys.argv = old


def _use_real_template(monkeypatch):
    """Point the script at its shipped template (tests must exercise the real one)."""
    import new_spike
    assert new_spike.TEMPLATE_PATH.exists(), f"template missing: {new_spike.TEMPLATE_PATH}"
