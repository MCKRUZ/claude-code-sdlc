"""Tests for audit_artifacts — record/impact/report, the staleness scenario, and exit-0 invariant."""

import io
import json
import os
import sys
from pathlib import Path

import pytest

import artifact_model as am
import audit_artifacts as aa

REQ = ".sdlc/artifacts/01-requirements/requirements.md"
EPICS = ".sdlc/artifacts/01-requirements/epics.md"
GLOSSARY = ".sdlc/artifacts/01-requirements/glossary.md"
LAYER = ".sdlc/context/layers/phase1-requirements.md"
SPEC = "specs/0001-login.md"
DESIGN = ".sdlc/artifacts/02-design/design.md"


def _write(p: Path, text: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def build_corpus(root: Path) -> None:
    sdlc = root / ".sdlc"
    req = sdlc / "artifacts" / "01-requirements"
    _write(req / "requirements.md", "# Requirements\n\n## FR-001 Login\nUser can log in.\n")
    _write(req / "epics.md", "# Epics\n\n## EP-001\nRealizes FR-001.\n")          # -> declared from req
    _write(req / "glossary.md", "# Glossary\n\nTerms. No ids referenced.\n")       # -> unrelated to req
    _write(sdlc / "artifacts" / "02-design" / "design.md", "# Design\n\nNothing declared.\n")  # -> coarse
    _write(sdlc / "context" / "layers" / "phase1-requirements.md",
           "---\nphase: 1\nsource_artifacts:\n  - requirements.md\n---\n\n## Decision\nx\n")
    _write(root / "specs" / "0001-login.md",
           '---\nspec: "0001"\nname: "login"\nsource: "FR-001 (requirements.md)"\n---\n\n# Spec\n')


def write_ledger(root: Path, entries: list[dict]) -> Path:
    ledger = root / ".sdlc" / "metrics" / "artifact-log.jsonl"
    ledger.parent.mkdir(parents=True, exist_ok=True)
    ledger.write_text("".join(json.dumps(e) + "\n" for e in entries), encoding="utf-8")
    return ledger


def run_cli(argv, capsys) -> tuple[int, str]:
    """Invoke main() with argv; return (exit_code, stdout). main() always exits 0 (advisory)."""
    old = sys.argv
    sys.argv = ["audit_artifacts.py"] + argv
    try:
        with pytest.raises(SystemExit) as ei:
            aa.main()
        code = ei.value.code
    finally:
        sys.argv = old
    return code, capsys.readouterr().out


# --- baseline / scan --------------------------------------------------------------------------

class TestScan:
    def test_first_scan_seeds_baseline(self, tmp_path, capsys):
        build_corpus(tmp_path)
        code, out = run_cli(["record", "--scan", "--repo", str(tmp_path)], capsys)
        assert code == 0
        assert "Baseline recorded" in out and "history starts now" in out
        ledger = aa.load_ledger(tmp_path / ".sdlc" / "metrics" / "artifact-log.jsonl")
        arts = {e["artifact"] for e in ledger if am.is_change_entry(e)}
        assert REQ in arts and SPEC in arts and LAYER in arts
        assert all(e["event"] == "created" for e in ledger)

    def test_second_scan_no_changes(self, tmp_path, capsys):
        build_corpus(tmp_path)
        run_cli(["record", "--scan", "--repo", str(tmp_path)], capsys)
        code, out = run_cli(["record", "--scan", "--repo", str(tmp_path)], capsys)
        assert code == 0 and "no changes" in out.lower()

    def test_scan_detects_drift_as_snapshot(self, tmp_path, capsys):
        build_corpus(tmp_path)
        run_cli(["record", "--scan", "--repo", str(tmp_path)], capsys)
        (tmp_path / REQ).write_text("# Requirements\n\n## FR-001 Login\nSLA 4h.\n", encoding="utf-8")
        code, out = run_cli(["record", "--scan", "--repo", str(tmp_path)], capsys)
        assert code == 0 and "drifted" in out
        ledger = aa.load_ledger(tmp_path / ".sdlc" / "metrics" / "artifact-log.jsonl")
        snaps = [e for e in ledger if e.get("event") == "snapshot" and e["artifact"] == REQ]
        assert len(snaps) == 1 and snaps[0].get("prev_hash")


# --- empty ledger -----------------------------------------------------------------------------

class TestEmptyLedger:
    def test_report_no_history(self, tmp_path, capsys):
        build_corpus(tmp_path)
        code, out = run_cli(["report", "--repo", str(tmp_path)], capsys)
        assert code == 0 and "No artifact history yet" in out

    def test_report_json_has_history_false(self, tmp_path, capsys):
        build_corpus(tmp_path)
        code, out = run_cli(["report", "--repo", str(tmp_path), "--json"], capsys)
        payload = json.loads(out)
        assert payload["has_history"] is False and payload["stale"] == 0


# --- the staleness scenario (controlled timestamps) -------------------------------------------

def _baseline_and_upstream_change(tmp_path):
    """Baseline everything at t0, then a later change to requirements.md at t1 (hash req2)."""
    build_corpus(tmp_path)
    t0 = "2026-07-01T00:00:00+00:00"
    t1 = "2026-07-10T00:00:00+00:00"
    entries = [
        am.change_entry(ts=t0, artifact=REQ, event="created", hash="sha256:req1", actor="kai"),
        am.change_entry(ts=t0, artifact=EPICS, event="created", hash="sha256:ep1", actor="kai"),
        am.change_entry(ts=t0, artifact=GLOSSARY, event="created", hash="sha256:gl1", actor="kai"),
        am.change_entry(ts=t0, artifact=LAYER, event="created", hash="sha256:ly1", actor="kai"),
        am.change_entry(ts=t0, artifact=SPEC, event="created", hash="sha256:sp1", actor="kai"),
        am.change_entry(ts=t0, artifact=DESIGN, event="created", hash="sha256:dz1", actor="kai"),
        am.change_entry(ts=t1, artifact=REQ, event="revised", target="FR-001",
                        hash="sha256:req2", prev_hash="sha256:req1", actor="jane", reason="SLA 8h->4h"),
    ]
    write_ledger(tmp_path, entries)
    return t1


class TestStaleness:
    def test_declared_downstreams_flagged_unrelated_not(self, tmp_path, capsys):
        _baseline_and_upstream_change(tmp_path)
        code, out = run_cli(["report", "--repo", str(tmp_path), "--json"], capsys)
        payload = json.loads(out)
        stale = {i["downstream"] for i in payload["items"]}
        assert {EPICS, SPEC, LAYER} <= stale           # declared downstreams of requirements
        assert DESIGN in stale                          # coarse phase-order downstream
        assert GLOSSARY not in stale                    # no path from requirements -> never stale
        assert payload["open"] == len(payload["items"]) # all OPEN before disposition

    def test_declared_vs_coarse_labeled(self, tmp_path, capsys):
        _baseline_and_upstream_change(tmp_path)
        code, out = run_cli(["report", "--repo", str(tmp_path), "--json"], capsys)
        items = {i["downstream"]: i for i in json.loads(out)["items"]}
        assert items[EPICS]["confidence"] == "declared"
        assert items[DESIGN]["confidence"] == "coarse"

    def test_acknowledge_with_owner_clears_debt(self, tmp_path, capsys):
        _baseline_and_upstream_change(tmp_path)
        # Disposition epics <- requirements with an owner -> off the books.
        run_cli(["record", "--repo", str(tmp_path), "--disposition", "ACKNOWLEDGED",
                 "--downstream", EPICS, "--upstream", REQ, "--owner", "jane"], capsys)
        code, out = run_cli(["report", "--repo", str(tmp_path), "--json"], capsys)
        payload = json.loads(out)
        epics_item = next(i for i in payload["items"] if i["downstream"] == EPICS)
        assert epics_item["disposition"] == "ACKNOWLEDGED"
        assert not am.counts_as_debt(epics_item)
        assert payload["acknowledged"] >= 1
        assert payload["open"] < len(payload["items"])

    def test_acknowledge_without_owner_still_debt(self, tmp_path, capsys):
        _baseline_and_upstream_change(tmp_path)
        run_cli(["record", "--repo", str(tmp_path), "--disposition", "ACKNOWLEDGED",
                 "--downstream", SPEC, "--upstream", REQ], capsys)  # no owner
        code, out = run_cli(["report", "--repo", str(tmp_path), "--json"], capsys)
        spec_item = next(i for i in json.loads(out)["items"] if i["downstream"] == SPEC)
        assert spec_item["disposition"] == "ACKNOWLEDGED"
        assert am.counts_as_debt(spec_item)     # mislabeled (no owner) -> still debt

    def test_typed_refreshed_is_rejected_and_item_stays_debt(self, tmp_path, capsys):
        # The anti-relabelling invariant: you cannot clear staleness debt by typing REFRESHED.
        _baseline_and_upstream_change(tmp_path)
        code, out = run_cli(["record", "--repo", str(tmp_path), "--disposition", "REFRESHED",
                             "--downstream", EPICS, "--upstream", REQ], capsys)
        assert code == 0 and "not a recordable disposition" in out.lower()
        # Nothing was recorded, so the item is still OPEN debt.
        _, rep = run_cli(["report", "--repo", str(tmp_path), "--json"], capsys)
        epics_item = next(i for i in json.loads(rep)["items"] if i["downstream"] == EPICS)
        assert am.counts_as_debt(epics_item) is True

    def test_refresh_downstream_drops_it_from_stale(self, tmp_path, capsys):
        _baseline_and_upstream_change(tmp_path)
        # epics changes again AFTER the requirements change -> no longer behind -> not stale.
        ledger = aa.load_ledger(tmp_path / ".sdlc" / "metrics" / "artifact-log.jsonl")
        ledger.append(am.change_entry(ts="2026-07-20T00:00:00+00:00", artifact=EPICS,
                                      event="revised", hash="sha256:ep2", actor="jane"))
        write_ledger(tmp_path, ledger)
        code, out = run_cli(["report", "--repo", str(tmp_path), "--json"], capsys)
        stale = {i["downstream"] for i in json.loads(out)["items"]}
        assert EPICS not in stale


class TestScope:
    def test_phase_scope_limits_rows(self, tmp_path, capsys):
        _baseline_and_upstream_change(tmp_path)
        code, out = run_cli(["report", "--repo", str(tmp_path), "--phase", "1", "--json"], capsys)
        payload = json.loads(out)
        assert payload["scope"] == "phase:1"
        # design.md is phase 2 -> excluded from a phase-1 scope.
        assert all(i["downstream"] != DESIGN for i in payload["items"])
        assert any(i["downstream"] == EPICS for i in payload["items"])
        assert payload["artifacts_tracked"] >= payload["artifacts_shown"]

    def test_artifact_scope_single(self, tmp_path, capsys):
        _baseline_and_upstream_change(tmp_path)
        code, out = run_cli(["report", "--repo", str(tmp_path), "--artifact", EPICS, "--json"], capsys)
        payload = json.loads(out)
        assert payload["scope"] == f"artifact:{EPICS}"
        assert payload["artifacts_shown"] == 1
        assert all(i["downstream"] == EPICS for i in payload["items"])


# --- impact & history -------------------------------------------------------------------------

class TestImpact:
    def test_impact_by_id_lists_downstream(self, tmp_path, capsys):
        build_corpus(tmp_path)
        code, out = run_cli(["impact", "FR-001", "--repo", str(tmp_path), "--json"], capsys)
        payload = json.loads(out)
        assert payload["target"] == REQ
        down = {r["node"] for r in payload["downstream"]}
        assert EPICS in down and SPEC in down

    def test_impact_unresolvable_is_graceful(self, tmp_path, capsys):
        build_corpus(tmp_path)
        code, out = run_cli(["impact", "FR-999", "--repo", str(tmp_path)], capsys)
        assert code == 0 and "could not resolve" in out.lower()


class TestHistory:
    def test_history_trail(self, tmp_path, capsys):
        _baseline_and_upstream_change(tmp_path)
        code, out = run_cli(["report", "--repo", str(tmp_path), "--history", "FR-001", "--json"], capsys)
        payload = json.loads(out)
        assert payload["artifact"] == REQ
        events = [e["event"] for e in payload["history"]]
        assert events == ["created", "revised"]
        assert payload["history"][-1]["actor"] == "jane"


# --- robustness / exit-0 under adverse inputs (adversarial-review regressions) ----------------

class TestSinceTimezone:
    def test_since_bare_date_does_not_crash(self, tmp_path, capsys):
        # Ledger timestamps are tz-aware; a documented bare-date --since parses naive. The compare
        # must not raise (exit-0 invariant). Covers the dashboard and --history paths.
        _baseline_and_upstream_change(tmp_path)
        code, out = run_cli(["report", "--repo", str(tmp_path), "--since", "2026-07-05", "--json"], capsys)
        assert code == 0
        assert json.loads(out)["scope"].endswith("since:2026-07-05")
        code2, _ = run_cli(["report", "--repo", str(tmp_path), "--history", REQ, "--since", "2026-07-05"], capsys)
        assert code2 == 0


class TestCorruptLedger:
    def test_non_dict_json_lines_do_not_crash(self, tmp_path, capsys):
        build_corpus(tmp_path)
        ledger = tmp_path / ".sdlc" / "metrics" / "artifact-log.jsonl"
        ledger.parent.mkdir(parents=True, exist_ok=True)
        good = am.change_entry(ts="2026-07-01T00:00:00+00:00", artifact=REQ, event="created", hash="h1")
        # Valid-JSON but non-object lines interleaved with a real entry (hand-edit / partial write).
        ledger.write_text("null\n42\n\"text\"\n[1,2,3]\n" + json.dumps(good) + "\n", encoding="utf-8")
        for argv in (["report"], ["report", "--history", REQ], ["record", "--scan"]):
            code, _ = run_cli(argv + ["--repo", str(tmp_path)], capsys)
            assert code == 0
        # The one valid entry is still readable past the garbage.
        assert any(e.get("artifact") == REQ for e in aa.load_ledger(ledger))


class TestUnreadableArtifact:
    @pytest.mark.skipif(os.name == "nt" or (hasattr(os, "geteuid") and os.geteuid() == 0),
                        reason="chmod 000 is not enforced on Windows or for root")
    def test_scan_skips_unreadable_file(self, tmp_path, capsys):
        build_corpus(tmp_path)
        victim = tmp_path / REQ
        victim.chmod(0o000)
        try:
            code, out = run_cli(["record", "--scan", "--repo", str(tmp_path)], capsys)
        finally:
            victim.chmod(0o644)
        assert code == 0  # unreadable artifact skipped, never crashes the scan


# --- exit-0 invariant -------------------------------------------------------------------------

class TestExitZero:
    @pytest.mark.parametrize("argv", [
        ["record"],                                  # no mode
        ["record", "--disposition", "ACKNOWLEDGED"], # missing downstream/upstream
        ["impact", "nonsense"],
        ["report"],
        ["report", "--history", "does-not-exist.md"],
    ])
    def test_never_nonzero(self, tmp_path, capsys, argv):
        build_corpus(tmp_path)
        code, _ = run_cli(argv + ["--repo", str(tmp_path)], capsys)
        assert code == 0


# --- narrow console encodings (Windows cp1252) -------------------------------------------------

def _run_on_cp1252_console(argv, monkeypatch) -> tuple[int, str]:
    """Invoke main() with stdout bound to a real cp1252 stream — a default Windows console.

    capsys buffers as UTF-8, so it can NEVER surface an encoding fault; CI is Linux/UTF-8 for the
    same reason. This helper is the only instrument in the suite that reproduces what a Windows
    user actually sees."""
    buf = io.BytesIO()
    stream = io.TextIOWrapper(buf, encoding="cp1252", newline="")
    monkeypatch.setattr(sys, "stdout", stream)
    sys.argv = ["audit_artifacts.py"] + argv
    with pytest.raises(SystemExit) as ei:
        aa.main()
    stream.flush()
    return ei.value.code, buf.getvalue().decode("cp1252")


class TestNarrowConsoleEncoding:
    """The freshness dashboard must render on a console that cannot encode '<-' or a checkmark.

    Both glyphs sit on the ordinary happy path — the arrow prints for every stale item, the
    checkmark for every signed-off phase — so on a default Windows console the tool used to die
    with UnicodeEncodeError and a NON-ZERO exit precisely when it had something to report. That
    breaks the exit-0 advisory guarantee this module is built on.
    """

    def test_stale_items_render_on_cp1252(self, tmp_path, monkeypatch):
        _baseline_and_upstream_change(tmp_path)
        code, out = _run_on_cp1252_console(["report", "--repo", str(tmp_path)], monkeypatch)
        assert code == 0
        assert "STALE" in out          # it still reports the staleness it found
        assert "<-" in out             # via the ASCII fallback, not a dropped line

    def test_signoff_marker_renders_on_cp1252(self, tmp_path, monkeypatch):
        """A signed-off phase alone is enough — no staleness required."""
        build_corpus(tmp_path)
        write_ledger(tmp_path, [
            am.change_entry(ts="2026-07-01T00:00:00+00:00", artifact=REQ,
                            event="created", hash="sha256:req1", actor="kai"),
        ])
        (tmp_path / ".sdlc" / "state.yaml").write_text(
            "phases:\n  '1':\n    sign_off: matt\n", encoding="utf-8")
        code, out = _run_on_cp1252_console(["report", "--repo", str(tmp_path)], monkeypatch)
        assert code == 0
        assert "signed-off" in out

    def test_utf8_console_keeps_the_nicer_glyphs(self, tmp_path, monkeypatch):
        """The fallback is a degradation for narrow consoles only — a UTF-8 console is unchanged."""
        _baseline_and_upstream_change(tmp_path)
        buf = io.BytesIO()
        stream = io.TextIOWrapper(buf, encoding="utf-8", newline="")
        monkeypatch.setattr(sys, "stdout", stream)
        sys.argv = ["audit_artifacts.py", "report", "--repo", str(tmp_path)]
        with pytest.raises(SystemExit) as ei:
            aa.main()
        stream.flush()
        assert ei.value.code == 0
        assert "←" in buf.getvalue().decode("utf-8")
