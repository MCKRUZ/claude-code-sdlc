"""Tests for artifact_model — the ledger vocabulary and the staleness honest-counting rules."""

from artifact_model import (
    CHANGE_EVENTS,
    DISPOSITION_EVENT,
    change_entry,
    changes_for,
    counts_as_debt,
    disposition_entry,
    is_change_entry,
    is_disposition_entry,
    latest_change_per_artifact,
    latest_dispositions,
    normalize_disposition,
    normalize_event,
    open_debt,
    staleness_key,
    validate_disposition,
)

TS = "2026-07-28T00:00:00+00:00"


class TestNormalization:
    def test_events(self):
        assert normalize_event("Revised") == "revised"
        assert normalize_event("SNAPSHOT") == "snapshot"
        assert normalize_event("nonsense") is None
        assert normalize_event(None) is None

    def test_dispositions(self):
        assert normalize_disposition("acknowledged") == "ACKNOWLEDGED"
        assert normalize_disposition(" not_affected ") == "NOT_AFFECTED"
        assert normalize_disposition("bogus") is None


class TestEntryKinds:
    def test_change_vs_disposition(self):
        ch = change_entry(ts=TS, artifact="a.md", event="revised")
        dp = disposition_entry(ts=TS, downstream="b.md", upstream="a.md", disposition="OPEN")
        assert is_change_entry(ch) and not is_disposition_entry(ch)
        assert is_disposition_entry(dp) and not is_change_entry(dp)
        assert dp["event"] == DISPOSITION_EVENT

    def test_change_events_are_all_change_kind(self):
        for ev in CHANGE_EVENTS:
            assert is_change_entry(change_entry(ts=TS, artifact="a.md", event=ev))

    def test_change_entry_unknown_event_falls_back_to_revised(self):
        assert change_entry(ts=TS, artifact="a.md", event="wat")["event"] == "revised"

    def test_change_entry_carries_decision_ref_only_when_present(self):
        assert "decision_ref" not in change_entry(ts=TS, artifact="a.md")
        assert change_entry(ts=TS, artifact="a.md", decision_ref="DL-07")["decision_ref"] == "DL-07"


class TestHonestCounting:
    def test_open_is_debt(self):
        item = {"disposition": "OPEN"}
        off, _ = validate_disposition(item)
        assert off is False
        assert counts_as_debt(item) is True

    def test_recorded_refreshed_still_counts_as_debt(self):
        # REFRESHED is derived-only. A genuinely refreshed downstream never reaches this function
        # (it drops out of the stale set by timestamp). So a stale item labelled REFRESHED was
        # hand-typed — the anti-relabelling rule says it still counts. You cannot type it away.
        item = {"disposition": "REFRESHED"}
        off, why = validate_disposition(item)
        assert off is False and "derived" in why
        assert counts_as_debt(item) is True

    def test_refreshed_is_not_a_settable_disposition(self):
        from artifact_model import SETTABLE_DISPOSITIONS
        assert "REFRESHED" not in SETTABLE_DISPOSITIONS
        assert set(SETTABLE_DISPOSITIONS) == {"OPEN", "ACKNOWLEDGED", "NOT_AFFECTED"}

    def test_acknowledged_needs_owner(self):
        assert counts_as_debt({"disposition": "ACKNOWLEDGED"}) is True          # no owner -> debt
        assert counts_as_debt({"disposition": "ACKNOWLEDGED", "owner": ""}) is True
        assert counts_as_debt({"disposition": "ACKNOWLEDGED", "owner": "jane"}) is False

    def test_not_affected_needs_reason(self):
        assert counts_as_debt({"disposition": "NOT_AFFECTED"}) is True
        assert counts_as_debt({"disposition": "NOT_AFFECTED", "reason": "no data field touched"}) is False

    def test_unknown_disposition_counts_as_debt(self):
        off, why = validate_disposition({"disposition": "WISHED_AWAY"})
        assert off is False and "unknown" in why
        assert counts_as_debt({"disposition": "WISHED_AWAY"}) is True

    def test_open_debt_filters(self):
        items = [
            {"id": 1, "disposition": "OPEN"},
            {"id": 2, "disposition": "NOT_AFFECTED", "reason": "no shared field"},  # off books
            {"id": 3, "disposition": "ACKNOWLEDGED"},                # no owner -> debt
            {"id": 4, "disposition": "ACKNOWLEDGED", "owner": "x"},   # off books
        ]
        assert sorted(i["id"] for i in open_debt(items)) == [1, 3]


class TestStalenessKey:
    def test_pins_on_upstream_hash(self):
        k1 = staleness_key("b.md", "a.md", "sha256:aaa")
        k2 = staleness_key("b.md", "a.md", "sha256:bbb")
        assert k1 != k2                       # a later upstream change re-opens the item
        assert staleness_key("b.md", "a.md") == "b.md<-a.md"

    def test_disposition_entry_sets_key(self):
        dp = disposition_entry(ts=TS, downstream="b.md", upstream="a.md",
                               upstream_hash="sha256:aaa", disposition="ACKNOWLEDGED", owner="jane")
        assert dp["key"] == staleness_key("b.md", "a.md", "sha256:aaa")


class TestLedgerProjections:
    def test_latest_change_last_write_wins(self):
        ledger = [
            change_entry(ts="1", artifact="a.md", event="created", hash="h1"),
            change_entry(ts="2", artifact="a.md", event="revised", hash="h2"),
            change_entry(ts="1", artifact="b.md", event="created", hash="hb"),
        ]
        latest = latest_change_per_artifact(ledger)
        assert latest["a.md"]["hash"] == "h2"
        assert latest["b.md"]["hash"] == "hb"

    def test_latest_dispositions_keyed(self):
        ledger = [
            disposition_entry(ts="1", downstream="b.md", upstream="a.md",
                              upstream_hash="h", disposition="OPEN"),
            disposition_entry(ts="2", downstream="b.md", upstream="a.md",
                              upstream_hash="h", disposition="ACKNOWLEDGED", owner="jane"),
        ]
        latest = latest_dispositions(ledger)
        assert len(latest) == 1
        assert next(iter(latest.values()))["disposition"] == "ACKNOWLEDGED"

    def test_changes_for_history_trail(self):
        ledger = [
            change_entry(ts="1", artifact="a.md", event="created"),
            disposition_entry(ts="1", downstream="a.md", upstream="x.md", disposition="OPEN"),
            change_entry(ts="2", artifact="a.md", event="revised"),
            change_entry(ts="2", artifact="b.md", event="created"),
        ]
        trail = changes_for(ledger, "a.md")
        assert [e["event"] for e in trail] == ["created", "revised"]
