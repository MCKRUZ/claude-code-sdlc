"""Tests for retro_report.py — the cross-ledger retro roll-up.

Covers: recurrence detection (2 rounds = candidate, 1 = not), repeat-stale disposition counting and
the refresh-reject exclusion, currently-stale detection via compute_staleness, the refresh funnel
math (per-spec + by-stem aggregation, refreshed-via-source_spec attribution), honest no-data on an
empty repo, exit 0 on every path (parametrized), dual-mode --repo / --state, the stable --json
shape, --window-days filtering, and that output/JSON never carries an actor-keyed ranking.

House conventions (run_cli via sys.argv + SystemExit + capsys, _write, tmp_path) are adapted from
test_version_refresh.py.
"""

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

import audit_artifacts as aa
import retro_report as rr

REQ = ".sdlc/artifacts/01-requirements/requirements.md"
EPICS = ".sdlc/artifacts/02-design/epics.md"
FINDINGS = ".sdlc/metrics/findings-log.jsonl"
ARTIFACT_LEDGER = ".sdlc/metrics/artifact-log.jsonl"

ACTOR_SENTINEL = "ZZ_ACTOR_SENTINEL_ZZ"


# --- helpers -----------------------------------------------------------------------------------

def _write(p: Path, text: str) -> None:
    """Write fixture content with LF endings on every platform.

    The `newline` argument is load-bearing, not cosmetic: the store captures — and
    `version show` returns — the exact bytes on disk, so a plain text-mode write (which
    expands each newline to CRLF on Windows) makes a byte-exact assertion pass on Linux
    and fail on Windows. Every fixture write of artifact content goes through this helper
    so the corpus is byte-identical on both."""
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8", newline="\n")


def _append_jsonl(p: Path, rows: list[dict]) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "a", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")


def run_cli(argv, capsys) -> tuple[int, str]:
    old = sys.argv
    sys.argv = ["retro_report.py"] + argv
    try:
        with pytest.raises(SystemExit) as ei:
            rr.main()
        code = ei.value.code
    finally:
        sys.argv = old
    return code, capsys.readouterr().out


def run_aa(argv, capsys) -> str:
    """Drive audit_artifacts (for real scans) — exits 0, output captured."""
    old = sys.argv
    sys.argv = ["audit_artifacts.py"] + argv
    try:
        with pytest.raises(SystemExit):
            aa.main()
    finally:
        sys.argv = old
    return capsys.readouterr().out


def _json_out(argv, capsys) -> dict:
    if "--json" not in argv:
        argv = argv + ["--json"]
    code, out = run_cli(argv, capsys)
    assert code == 0
    return json.loads(out)


def _iso(days_ago: float = 0.0) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()


def _finding(cat, target, ts, *, disp="OPEN", sev="HIGH", actor=ACTOR_SENTINEL) -> dict:
    """A findings-log entry in the record_findings shape."""
    from findings_model import fingerprint
    f = {"category": cat, "target": target}
    return {
        "timestamp": ts, "report": "review-report.md",
        "id": "F-1", "category": cat, "severity": sev, "target": target,
        "disposition": disp, "fingerprint": fingerprint(f),
        "target_sha": None, "detail": "detail", "actor": actor,
    }


def _disp_entry(downstream, upstream, ts, *, disposition="ACKNOWLEDGED",
                owner="", reason="", actor=ACTOR_SENTINEL) -> dict:
    """An artifact-log disposition entry (am.disposition_entry shape)."""
    import artifact_model as am
    return am.disposition_entry(ts=ts, downstream=downstream, upstream=upstream,
                                disposition=disposition, owner=owner, reason=reason, actor=actor)


def _write_upstreams(tmp_path: Path, *, req_hours="8") -> None:
    _write(tmp_path / REQ,
           "# Requirements\n\n## FR-001 Duplicate claim\n"
           f"Reject a duplicate within {req_hours} hours; return HTTP 409.\n")
    _write(tmp_path / EPICS, "# Epics\n\n## EP-01 Claims\nCovers FR-001.\n")


def _write_spec(tmp_path: Path, *, sid="0001", status="merged",
                source="FR-001", accept="within 12 hours returns HTTP 409") -> str:
    rel = f"specs/{sid}-thing.md"
    _write(tmp_path / rel,
           "---\n"
           f'spec: "{sid}"\n'
           f"name: thing {sid}\n"
           f"status: {status}\n"
           "risk: HIGH\n"
           f"source: {source}\n"
           'channel: "—"\n'
           "---\n"
           f"# Thing {sid}\n\n"
           "## Scope — in\nDo the thing.\n\n"
           "## Scope — out\nNothing.\n\n"
           "## Acceptance Checks\n"
           f"- {accept}\n")
    return rel


# --- recurrence --------------------------------------------------------------------------------

def test_recurrence_two_rounds_is_candidate_one_round_is_not(tmp_path, capsys):
    fp = tmp_path / FINDINGS
    # Finding A: same (category, target) in two distinct rounds (two timestamps) => candidate.
    _append_jsonl(fp, [_finding("null-check", "auth.py:10", _iso(2))])
    _append_jsonl(fp, [_finding("null-check", "auth.py:10", _iso(1))])
    # Finding B: one round only => NOT a candidate.
    _append_jsonl(fp, [_finding("style", "ui.py:3", _iso(1))])

    data = _json_out(["--repo", str(tmp_path)], capsys)
    assert data["has_data"]["recurring_findings"] is True
    recs = data["recurring_findings"]
    keys = {(r["category"], r["target"]) for r in recs}
    assert ("null-check", "auth.py:10") in keys
    assert ("style", "ui.py:3") not in keys
    a = next(r for r in recs if r["category"] == "null-check")
    assert a["times"] == 2 and a["rounds"] == 2

    _, text = run_cli(["--repo", str(tmp_path)], capsys)
    assert "seen 2 times across 2 rounds" in text
    assert "candidate for a permanent check" in text


def test_recurrence_two_findings_same_round_is_not_recurring(tmp_path, capsys):
    fp = tmp_path / FINDINGS
    ts = _iso(1)
    # Two entries, same round (shared timestamp) => 1 round => not a candidate.
    _append_jsonl(fp, [_finding("null-check", "auth.py:10", ts),
                       _finding("null-check", "auth.py:10", ts)])
    data = _json_out(["--repo", str(tmp_path)], capsys)
    assert data["has_data"]["recurring_findings"] is False
    assert data["recurring_findings"] == []


# --- repeat-stale ------------------------------------------------------------------------------

def test_repeat_stale_disposition_counting(tmp_path, capsys):
    lp = tmp_path / ARTIFACT_LEDGER
    # Two staleness dispositions on the same downstream: one off-books (reason), one open (no reason).
    _append_jsonl(lp, [
        _disp_entry(EPICS, REQ, _iso(2), disposition="NOT_AFFECTED", reason="handled"),
        _disp_entry(EPICS, REQ, _iso(1), disposition="ACKNOWLEDGED", owner=""),  # no owner -> counts
    ])
    data = _json_out(["--repo", str(tmp_path)], capsys)
    assert data["has_data"]["repeat_stale"] is True
    row = next(r for r in data["repeat_stale"] if r["artifact"] == EPICS)
    assert row["flagged"] == 2
    assert row["dispositioned"] == 1  # the NOT_AFFECTED-with-reason
    assert row["open"] == 1           # the ACKNOWLEDGED-without-owner still counts


def test_repeat_stale_excludes_refresh_reject_edges(tmp_path, capsys):
    lp = tmp_path / ARTIFACT_LEDGER
    # A refresh-reject reverse edge: upstream is a specs/* path -> belongs to the funnel, not here.
    _append_jsonl(lp, [
        _disp_entry(REQ, "specs/0001-thing.md", _iso(1),
                    disposition="NOT_AFFECTED", reason="no ripple"),
    ])
    data = _json_out(["--repo", str(tmp_path)], capsys)
    # REQ must not appear as a repeat-stale artifact from the reject edge.
    assert all(r["artifact"] != REQ for r in data["repeat_stale"])


def test_repeat_stale_currently_stale_from_scan(tmp_path, capsys):
    _write_upstreams(tmp_path)
    run_aa(["record", "--scan", "--repo", str(tmp_path)], capsys)     # v1 baseline (both created)
    _write(tmp_path / REQ,
           "# Requirements\n\n## FR-001 Duplicate claim\n"
           "Reject a duplicate within 12 hours; return HTTP 409.\n")
    run_aa(["record", "--scan", "--repo", str(tmp_path)], capsys)     # requirements drifts later
    data = _json_out(["--repo", str(tmp_path)], capsys)
    epics = next((r for r in data["repeat_stale"] if r["artifact"] == EPICS), None)
    assert epics is not None, "epics should be currently stale (upstream changed after it)"
    assert epics["currently_stale"] is True


# --- refresh funnel ----------------------------------------------------------------------------

def _seed_refresh_corpus(tmp_path, capsys, *, sid="0001"):
    """A merged spec drifting from requirements, plus injected refreshed + rejected ledger events."""
    _write_upstreams(tmp_path)                 # requirements says '8 hours'
    spec_rel = _write_spec(tmp_path, sid=sid)  # spec acceptance says '12 hours' -> drift
    spec_node = spec_rel  # already repo-relative
    lp = tmp_path / ARTIFACT_LEDGER
    # A refreshed change attributed to the spec via source_spec; a reject on epics via the spec edge.
    import artifact_model as am
    _append_jsonl(lp, [
        am.change_entry(ts=_iso(0.5), artifact=REQ, event="refreshed",
                        hash="sha256:deadbeefdeadbeef", actor=ACTOR_SENTINEL,
                        reason="auto-refresh") | {"source_spec": sid},
        _disp_entry(EPICS, spec_node, _iso(0.5), disposition="NOT_AFFECTED", reason="no ripple"),
    ])
    return spec_node


def test_refresh_funnel_math_and_by_stem(tmp_path, capsys):
    _seed_refresh_corpus(tmp_path, capsys, sid="0001")
    data = _json_out(["--repo", str(tmp_path)], capsys)
    assert data["has_data"]["refresh_funnel"] is True

    by_spec = {r["spec"]: r for r in data["refresh_funnel"]["by_spec"]}
    assert "0001" in by_spec
    sp = by_spec["0001"]
    assert sp["detected"] >= 1          # requirements is an active candidate
    assert sp["drifted"] >= 1           # the '12 hours' salient token is absent upstream
    assert sp["refreshed"] == 1         # one refreshed change attributed to the spec
    assert sp["rejected"] == 1          # one NOT_AFFECTED reject on epics

    by_stem = {r["stem"]: r for r in data["refresh_funnel"]["by_stem"]}
    assert by_stem["requirements"]["refreshed"] == 1
    assert by_stem["requirements"]["detected"] >= 1
    assert by_stem["epics"]["rejected"] == 1
    assert "note" in by_stem["requirements"]


def test_refreshed_attributed_by_source_spec(tmp_path, capsys):
    """A refreshed event's source_spec attributes it to exactly one spec, not the other."""
    _write_upstreams(tmp_path)
    _write_spec(tmp_path, sid="0001")
    _write_spec(tmp_path, sid="0002")
    import artifact_model as am
    _append_jsonl(tmp_path / ARTIFACT_LEDGER, [
        am.change_entry(ts=_iso(0.5), artifact=REQ, event="refreshed",
                        hash="sha256:deadbeefdeadbeef", actor=ACTOR_SENTINEL,
                        reason="auto-refresh") | {"source_spec": "0002"},
    ])
    data = _json_out(["--repo", str(tmp_path)], capsys)
    by_spec = {r["spec"]: r for r in data["refresh_funnel"]["by_spec"]}
    assert by_spec["0001"]["refreshed"] == 0
    assert by_spec["0002"]["refreshed"] == 1


def test_stem_note_noisy_and_quiet():
    noisy = rr._stem_note(rr._empty_stem("business-rules") | {"rejected": 4, "refreshed": 0})
    assert "noisy" in noisy["note"] and "4 rejected / 0 applied" in noisy["note"]
    quiet = rr._stem_note(rr._empty_stem("requirements") | {"detected": 3, "drifted": 0})
    assert "too tight" in quiet["note"] or "quiet" in quiet["note"]


# --- debt rollup -------------------------------------------------------------------------------

def test_debt_rollup_names_each_ledger(tmp_path, capsys):
    # One open HIGH finding (debt) + a currently-stale artifact (debt).
    _append_jsonl(tmp_path / FINDINGS, [_finding("null-check", "auth.py:10", _iso(1), disp="OPEN")])
    _write_upstreams(tmp_path)
    run_aa(["record", "--scan", "--repo", str(tmp_path)], capsys)
    _write(tmp_path / REQ, "# Requirements\n\n## FR-001\nwithin 12 hours; HTTP 409.\n")
    run_aa(["record", "--scan", "--repo", str(tmp_path)], capsys)

    data = _json_out(["--repo", str(tmp_path)], capsys)
    assert data["has_data"]["debt"] is True
    assert data["debt"]["findings"] >= 1
    assert data["debt"]["artifact_staleness"] >= 1
    assert data["debt"]["total"] == (data["debt"]["findings"]
                                     + data["debt"]["artifact_staleness"]
                                     + data["debt"]["refresh_open"])

    _, text = run_cli(["--repo", str(tmp_path)], capsys)
    assert "findings-log.jsonl" in text
    assert "artifact-log.jsonl" in text


# --- no data / empty repo ----------------------------------------------------------------------

def test_no_data_on_empty_repo(tmp_path, capsys):
    (tmp_path / ".sdlc").mkdir(parents=True, exist_ok=True)
    code, text = run_cli(["--repo", str(tmp_path)], capsys)
    assert code == 0
    assert text.count("no data") == 4  # all four sections
    data = _json_out(["--repo", str(tmp_path)], capsys)
    assert data["has_data"] == {"recurring_findings": False, "repeat_stale": False,
                                "refresh_funnel": False, "debt": False}


# --- window filtering --------------------------------------------------------------------------

def test_window_days_filters_out_old_round(tmp_path, capsys):
    fp = tmp_path / FINDINGS
    _append_jsonl(fp, [_finding("null-check", "auth.py:10", _iso(400))])  # old round
    _append_jsonl(fp, [_finding("null-check", "auth.py:10", _iso(1))])    # recent round

    # All history: 2 rounds => candidate.
    full = _json_out(["--repo", str(tmp_path)], capsys)
    assert full["has_data"]["recurring_findings"] is True

    # Last 30 days: only 1 round in window => not a candidate.
    win = _json_out(["--repo", str(tmp_path), "--window-days", "30"], capsys)
    assert win["has_data"]["recurring_findings"] is False
    assert win["window_days"] == 30


# --- dual mode ---------------------------------------------------------------------------------

def test_dual_mode_repo_and_state_agree(tmp_path, capsys):
    import yaml
    _append_jsonl(tmp_path / FINDINGS, [_finding("null-check", "a.py:1", _iso(2)),
                                        _finding("null-check", "a.py:1", _iso(1))])
    _write(tmp_path / ".sdlc/state.yaml", yaml.safe_dump({"phases": {}}))

    via_repo = _json_out(["--repo", str(tmp_path)], capsys)
    via_state = _json_out(["--state", str(tmp_path / ".sdlc/state.yaml")], capsys)
    assert via_repo["recurring_findings"] == via_state["recurring_findings"]
    assert via_repo["has_data"] == via_state["has_data"]


def test_missing_state_exits_zero(tmp_path, capsys):
    code, _ = run_cli(["--state", str(tmp_path / "nope/.sdlc/state.yaml")], capsys)
    assert code == 0


# --- json shape --------------------------------------------------------------------------------

def test_json_shape_is_stable(tmp_path, capsys):
    (tmp_path / ".sdlc").mkdir(parents=True, exist_ok=True)
    data = _json_out(["--repo", str(tmp_path)], capsys)
    assert set(data.keys()) == {"has_data", "recurring_findings", "repeat_stale",
                                "refresh_funnel", "debt", "window_days"}
    assert set(data["has_data"].keys()) == {"recurring_findings", "repeat_stale",
                                            "refresh_funnel", "debt"}
    assert set(data["refresh_funnel"].keys()) == {"by_spec", "by_stem"}
    assert set(data["debt"].keys()) == {"findings", "artifact_staleness", "refresh_open", "total"}
    assert data["window_days"] is None


# --- exit 0 on every path ----------------------------------------------------------------------

@pytest.mark.parametrize("argv_factory", [
    lambda tp: ["--repo", str(tp)],
    lambda tp: ["--repo", str(tp), "--json"],
    lambda tp: ["--repo", str(tp), "--window-days", "7"],
    lambda tp: ["--repo", str(tp), "--window-days", "0"],       # non-positive window => all history
    lambda tp: ["--repo", str(tp), "--window-days", "-5"],
    lambda tp: ["--state", str(tp / "missing/.sdlc/state.yaml")],
    lambda tp: ["--repo", str(tp / "does-not-exist")],
])
def test_exit_zero_every_path(tmp_path, capsys, argv_factory):
    (tmp_path / ".sdlc/metrics").mkdir(parents=True, exist_ok=True)
    code, _ = run_cli(argv_factory(tmp_path), capsys)
    assert code == 0


def test_exit_zero_on_garbage_ledgers(tmp_path, capsys):
    _write(tmp_path / FINDINGS, "not json\n42\n[\"array\"]\n{\"category\": \"x\"}\n")
    _write(tmp_path / ARTIFACT_LEDGER, "garbage\nnull\n")
    code, _ = run_cli(["--repo", str(tmp_path)], capsys)
    assert code == 0
    code, _ = run_cli(["--repo", str(tmp_path), "--json"], capsys)
    assert code == 0


# --- patterns, not people ----------------------------------------------------------------------

def test_no_actor_ranking_anywhere(tmp_path, capsys):
    """Every ledger entry carries a distinctive actor; it must never surface in output or JSON, and
    no key may be actor-keyed (patterns are keyed by category / artifact / stem)."""
    _append_jsonl(tmp_path / FINDINGS, [_finding("null-check", "auth.py:10", _iso(2)),
                                        _finding("null-check", "auth.py:10", _iso(1))])
    _seed_refresh_corpus(tmp_path, capsys, sid="0001")
    _append_jsonl(tmp_path / ARTIFACT_LEDGER, [
        _disp_entry(EPICS, REQ, _iso(1), disposition="ACKNOWLEDGED", owner="")])

    code, text = run_cli(["--repo", str(tmp_path)], capsys)
    assert code == 0
    assert ACTOR_SENTINEL not in text

    _, jtext = run_cli(["--repo", str(tmp_path), "--json"], capsys)
    assert ACTOR_SENTINEL not in jtext
    blob = jtext.lower()
    assert "actor" not in blob            # no actor key anywhere in the JSON
    assert "by_actor" not in blob
    assert "ranking" not in blob
