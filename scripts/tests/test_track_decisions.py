"""Tests for track_decisions.py — the phase-spanning decision-log tracker.

The weekend-aware 2-business-day clock is tested through the summarize() function
with an injected `today`, so the assertions are deterministic regardless of when
the suite runs.
"""

from datetime import date

from track_decisions import (
    business_days_elapsed,
    is_open,
    parse_decisions,
    summarize,
)

# A fixed Wednesday so the clock math is deterministic.
TODAY = date(2026, 7, 8)

# DL-01 opened Tue 07-07  -> 1 business day open  (within the 2-day clock)
# DL-02 opened Fri 07-03  -> 3 business days open (Sat/Sun skipped) -> overdue
# DL-03 opened Fri 07-03 but is decided (closed) -> excluded from the open set
LOG = """# Decision Log

| id | decision | owner | opened | due | status |
|-------|-----------------------------|------|------------|------------|---------|
| DL-01 | Pick the auth provider | Jane | 2026-07-07 | 2026-07-09 | open |
| DL-02 | Set the data-retention window | Mira | 2026-07-03 | 2026-07-07 | open |
| DL-03 | Choose the SMS vendor | Ken | 2026-07-03 | 2026-07-07 | decided |
"""


def write_log(tmp_path):
    p = tmp_path / "decision-log.md"
    p.write_text(LOG, encoding="utf-8")
    return p


def by_id(items, decision_id):
    return next((d for d in items if d.get("id") == decision_id), None)


class TestBusinessDaysElapsed:
    def test_spans_a_weekend(self):
        # Fri -> the next Wed is 3 business days (Sat/Sun skipped), not 5 calendar days.
        assert business_days_elapsed(date(2026, 7, 3), date(2026, 7, 8)) == 3

    def test_one_business_day(self):
        assert business_days_elapsed(date(2026, 7, 7), date(2026, 7, 8)) == 1

    def test_same_day_is_zero(self):
        assert business_days_elapsed(date(2026, 7, 8), date(2026, 7, 8)) == 0


class TestSummarize:
    def test_open_within_clock_is_not_overdue(self, tmp_path):
        summary = summarize(parse_decisions(write_log(tmp_path)), today=TODAY)
        dl01 = by_id(summary["open_decisions"], "DL-01")
        assert dl01 is not None
        assert dl01["business_days_open"] == 1
        assert dl01["overdue"] is False

    def test_open_past_clock_spanning_weekend_is_overdue(self, tmp_path):
        summary = summarize(parse_decisions(write_log(tmp_path)), today=TODAY)
        dl02 = by_id(summary["open_decisions"], "DL-02")
        assert dl02 is not None
        assert dl02["business_days_open"] == 3
        assert dl02["overdue"] is True
        assert by_id(summary["overdue_decisions"], "DL-02") is not None
        assert summary["overdue"] == 1

    def test_closed_decision_is_excluded(self, tmp_path):
        summary = summarize(parse_decisions(write_log(tmp_path)), today=TODAY)
        assert by_id(summary["open_decisions"], "DL-03") is None
        assert summary["open"] == 2
        assert summary["total"] == 3


class TestIsOpen:
    def test_open_status(self):
        assert is_open({"status": "open"}) is True

    def test_decided_is_closed(self):
        assert is_open({"status": "decided"}) is False
