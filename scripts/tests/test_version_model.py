"""Tests for version_model — the pure content-version derivation (ordinal, dup-hash, baseline)."""

from artifact_model import change_entry
from version_model import (
    hash_hex,
    object_relpath,
    resolve_version,
    versions_for,
)

TS0 = "2026-07-01T00:00:00+00:00"
TS1 = "2026-07-10T00:00:00+00:00"
TS2 = "2026-07-20T00:00:00+00:00"

ART = ".sdlc/artifacts/01-requirements/requirements.md"


def _ledger(*hashes_events):
    """Build a change ledger for ART from (ts, event, hash) triples, plus unrelated noise."""
    out = [change_entry(ts="x", artifact="other.md", event="created", hash="sha256:other")]
    for ts, event, h in hashes_events:
        out.append(change_entry(ts=ts, artifact=ART, event=event, hash=h, actor="kai"))
    return out


# --- hash identity ----------------------------------------------------------------------------

class TestHashIdentity:
    def test_hash_hex_strips_prefix(self):
        assert hash_hex("sha256:abcd1234abcd1234") == "abcd1234abcd1234"
        assert hash_hex("abcd") == "abcd"
        assert hash_hex("") == ""
        assert hash_hex(None) == ""

    def test_object_relpath_shards_on_first_two_hex(self):
        assert object_relpath("sha256:ab12cd34ef567890") == "objects/ab/ab12cd34ef567890"
        assert object_relpath("") == ""

    def test_object_relpath_is_hash_join(self):
        # The store filename IS the ledger's 16-hex — the join key that makes the store the ledger
        # rehydrated to bytes, with no second index.
        h = "sha256:0123456789abcdef"
        assert object_relpath(h).endswith(hash_hex(h))


# --- version enumeration ----------------------------------------------------------------------

class TestVersionsFor:
    def test_ordinal_in_ledger_order(self):
        ledger = _ledger((TS0, "created", "sha256:v1"), (TS1, "revised", "sha256:v2"),
                         (TS2, "revised", "sha256:v3"))
        rows = versions_for(ledger, ART)
        assert [r["n"] for r in rows] == [1, 2, 3]
        assert [r["hash"] for r in rows] == ["sha256:v1", "sha256:v2", "sha256:v3"]
        assert [r["event"] for r in rows] == ["created", "revised", "revised"]

    def test_dup_hash_is_its_own_ordinal_and_marked_restored(self):
        # A rollback re-introduces an earlier hash: it must be v4 (not a skipped ordinal) and carry
        # restored_from pointing at the ordinal it first appeared as.
        ledger = _ledger((TS0, "created", "sha256:a"), (TS1, "revised", "sha256:b"),
                         (TS2, "revised", "sha256:c"), ("2026-07-25T00:00:00+00:00", "revised", "sha256:b"))
        rows = versions_for(ledger, ART)
        assert [r["n"] for r in rows] == [1, 2, 3, 4]
        assert "restored_from" not in rows[1]           # v2 is the first 'b'
        assert rows[3]["restored_from"] == 2            # v4 restores v2's content

    def test_present_reflects_store_set_only(self):
        ledger = _ledger((TS0, "created", "sha256:a"), (TS1, "revised", "sha256:b"))
        rows = versions_for(ledger, ART, present_hashes={"sha256:a"})
        assert rows[0]["present"] is True
        assert rows[1]["present"] is False

    def test_baseline_synthesis_when_no_ledger_entry(self):
        # A pre-existing artifact with no change entry -> a single v1 baseline from the current hash,
        # never [] and never a KeyError.
        rows = versions_for([], ART, current_hash="sha256:cur")
        assert len(rows) == 1
        assert rows[0]["n"] == 1 and rows[0]["event"] == "baseline"
        assert rows[0]["hash"] == "sha256:cur"
        assert rows[0]["present"] is False              # not in the (empty) store set

    def test_baseline_present_when_content_happens_to_be_stored(self):
        rows = versions_for([], ART, current_hash="sha256:cur", present_hashes={"sha256:cur"})
        assert rows[0]["present"] is True

    def test_no_ledger_no_file_is_no_data(self):
        assert versions_for([], ART) == []


# --- reference resolution ---------------------------------------------------------------------

class TestResolveVersion:
    def _rows(self):
        ledger = _ledger((TS0, "created", "sha256:aa11"), (TS1, "revised", "sha256:bb22"),
                         (TS2, "revised", "sha256:cc33"))
        return versions_for(ledger, ART)

    def test_latest_and_default(self):
        rows = self._rows()
        assert resolve_version(rows, "latest")[0]["n"] == 3
        assert resolve_version(rows, "")[0]["n"] == 3

    def test_prev(self):
        rows = self._rows()
        assert resolve_version(rows, "prev")[0]["n"] == 2

    def test_prev_needs_two(self):
        one = versions_for([], ART, current_hash="sha256:x")
        row, note = resolve_version(one, "prev")
        assert row is None and "only one" in note

    def test_vn_ordinal(self):
        rows = self._rows()
        assert resolve_version(rows, "v2")[0]["hash"] == "sha256:bb22"
        row, note = resolve_version(rows, "v9")
        assert row is None and "no version v9" in note

    def test_hash_prefix_unique(self):
        rows = self._rows()
        assert resolve_version(rows, "bb")[0]["n"] == 2
        assert resolve_version(rows, "sha256:cc")[0]["n"] == 3

    def test_hash_prefix_ambiguous_picks_highest_and_lists(self):
        ledger = _ledger((TS0, "created", "sha256:ab11"), (TS1, "revised", "sha256:ab22"))
        rows = versions_for(ledger, ART)
        row, note = resolve_version(rows, "ab")
        assert row["n"] == 2 and "v1" in note and "v2" in note

    def test_unresolvable(self):
        rows = self._rows()
        row, note = resolve_version(rows, "zzz")
        assert row is None and "could not resolve" in note

    def test_empty_versions(self):
        row, note = resolve_version([], "latest")
        assert row is None and note == "no versions"
