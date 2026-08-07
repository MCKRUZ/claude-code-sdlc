"""retro_report.py — the cross-ledger retro roll-up behind /sdlc-retro.

Three ledgers already record, honestly and append-only, what the advisory layers surfaced round
after round: review findings (findings-log.jsonl), artifact staleness + change history
(artifact-log.jsonl), and — folded into the same artifact ledger — the reverse-propagation refresh
trail (`refreshed` changes + reject dispositions). Each on its own answers "what is open right now".
This tool reads all three at once and answers the *retro* question: what keeps happening.

Four read-only sections, all exit 0 always (advisory — a retro never blocks and never mutates):

  1. RECURRING FINDINGS   — a (category, target) group seen in >= 2 distinct rounds is a candidate
                            for a permanent check ("findings become new checks").
  2. REPEAT-STALE ARTIFACTS — per downstream artifact, how many times it was dispositioned for
                            staleness, and whether it is stale right now.
  3. REFRESH FUNNEL       — per merged spec and by upstream stem: candidates → drifted → refreshed
                            → rejected → still open. Doubles as the divergence-heuristic tuning
                            signal (lots rejected / few applied = noisy; nothing ever drifts = too
                            tight).
  4. DISPOSITION DEBT ROLLUP — combined honest-counting debt across the three ledgers, each line
                            naming its source.

Everything is keyed by category / artifact / stem — never by actor. There is deliberately no flag to
rank by person, and the forbidden activity metrics (velocity, story points, PR count, LOC) are never
computed. Patterns, not people.

Standalone or Workflow (CLAUDE.md design rule):
  --repo <path>   standalone (reads <repo>/.sdlc)      |   --state .sdlc/state.yaml   in-workflow
"""

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import artifact_model as am
import audit_artifacts as aa
import findings_model as fm
import track_specs as ts

FINDINGS_LEDGER_NAME = "findings-log.jsonl"


# --- Loading (never crashes; a non-dict / bad line is skipped, mirroring aa.load_ledger) -------

def load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    out: list[dict] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            out.append(obj)
    return out


# --- Window plumbing ---------------------------------------------------------------------------

def cutoff_from(window_days) -> datetime | None:
    """The oldest timestamp still in the window, or None for all-history. A non-positive N is treated
    as no window (never silently drops everything)."""
    if not window_days or window_days <= 0:
        return None
    return datetime.now(timezone.utc) - timedelta(days=window_days)


def in_window(ts: str, cutoff: datetime | None) -> bool:
    """True if `ts` is inside the window. An unparseable timestamp is kept (honest: we don't drop a
    real event just because its clock stamp is malformed)."""
    if cutoff is None:
        return True
    dt = aa._parse_ts(ts)
    if dt is None:
        return True
    return dt >= cutoff


def _safe(fn, default):
    """Run a section builder; on any fault return `default` so one bad ledger never sinks the rest
    (and never a stack trace — the whole tool is advisory)."""
    try:
        return fn()
    except Exception:
        return default


# --- Section 1: recurring findings -------------------------------------------------------------

def recurring_findings(findings: list[dict], cutoff: datetime | None) -> list[dict]:
    """Group findings-log entries by (category, target). A group seen in >= 2 distinct rounds (a round
    = one distinct report timestamp — one `record_findings record` invocation shares one timestamp) is
    a candidate for a permanent check. Keyed by category+target, never by actor."""
    groups: dict[tuple, dict] = {}
    for e in findings:
        if not in_window(e.get("timestamp", ""), cutoff):
            continue
        cat = (e.get("category") or "").strip()
        tgt = (e.get("target") or "").strip()
        if not (cat or tgt):
            continue
        g = groups.setdefault((cat, tgt), {"category": cat, "target": tgt,
                                           "times": 0, "rounds": set(), "dispositions": {}})
        g["times"] += 1
        g["rounds"].add(e.get("timestamp", ""))
        disp = fm.normalize_disposition(e.get("disposition")) or (e.get("disposition") or "?")
        g["dispositions"][disp] = g["dispositions"].get(disp, 0) + 1

    out: list[dict] = []
    for g in groups.values():
        rounds = len(g["rounds"])
        if rounds >= 2:
            out.append({"category": g["category"], "target": g["target"],
                        "times": g["times"], "rounds": rounds, "dispositions": g["dispositions"]})
    out.sort(key=lambda x: (-x["times"], -x["rounds"], x["category"], x["target"]))
    return out


# --- Section 2: repeat-stale artifacts ---------------------------------------------------------

def repeat_stale(art_ledger: list[dict], base_dir: Path, sdlc_dir: Path,
                 cutoff: datetime | None) -> list[dict]:
    """Per downstream artifact: how many staleness disposition entries it accrued in the window
    (flagged), how many are legitimately off the books vs still open, and whether it is stale right
    now (from compute_staleness on the *current* ledger — a now-fact, so it ignores the window).

    Refresh-reject reverse edges (upstream is a specs/* path) are excluded here — they belong to the
    refresh funnel (section 3), so they are not double-counted as staleness flags."""
    by_down: dict[str, list[dict]] = {}
    for e in art_ledger:
        if not am.is_disposition_entry(e):
            continue
        if str(e.get("upstream") or "").startswith("specs/"):
            continue  # refresh-reject edge — counted in the refresh funnel, not here
        if not in_window(e.get("ts", ""), cutoff):
            continue
        down = str(e.get("downstream") or "").strip()
        if down:
            by_down.setdefault(down, []).append(e)

    stale_items = aa.compute_staleness(base_dir, sdlc_dir, art_ledger)
    currently = {i["downstream"] for i in stale_items}

    out: list[dict] = []
    for down in sorted(set(by_down) | currently):
        entries = by_down.get(down, [])
        flagged = len(entries)
        open_ = sum(1 for e in entries if am.counts_as_debt(e))
        dispositioned = flagged - open_
        out.append({"artifact": down, "flagged": flagged, "dispositioned": dispositioned,
                    "open": open_, "currently_stale": down in currently})
    out.sort(key=lambda x: (not x["currently_stale"], -x["flagged"], x["artifact"]))
    return out


# --- Section 3: refresh funnel (also the divergence-heuristic tuning signal) -------------------

def _empty_stem(stem: str) -> dict:
    return {"stem": stem, "detected": 0, "drifted": 0, "refreshed": 0, "rejected": 0, "open": 0}


def _stem_note(agg: dict) -> dict:
    """One honest tuning readout per stem. High rejected/applied ⇒ the divergence signal is noisy;
    candidates that never drift ⇒ it is too tight (quiet)."""
    a = dict(agg)
    applied, rejected = a["refreshed"], a["rejected"]
    detected, drifted = a["detected"], a["drifted"]
    if applied == 0 and rejected > 0:
        note = f"{rejected} rejected / 0 applied — drift signal may be noisy for this stem"
    elif detected > 0 and drifted == 0 and applied == 0 and rejected == 0:
        note = f"0 of {detected} candidate(s) ever drifted — divergence signal may be too tight (quiet)"
    elif rejected > applied and applied > 0:
        note = f"{rejected} rejected / {applied} applied — drift signal may be noisy for this stem"
    elif applied > 0:
        note = f"{applied} applied / {rejected} rejected — signal landing"
    else:
        note = "candidates detected; nothing applied or rejected yet"
    a["note"] = note
    return a


def refresh_funnel(base_dir: Path, sdlc_dir: Path, metrics_dir: Path,
                   art_ledger: list[dict], cutoff: datetime | None) -> dict:
    """Reuse audit_artifacts' own detection/status internals rather than reimplementing the drift
    call. Per merged spec: detected (active candidates) → drifted → refreshed (`refreshed` change
    events attributed to the spec via the source_spec rider) → rejected (NOT_AFFECTED whose upstream
    is this spec) → still open. Aggregated the same way by upstream stem."""
    merged = [s for s in ts.scan_specs(base_dir / "specs") if s.get("status") == "merged"]
    by_spec: list[dict] = []
    stem_agg: dict[str, dict] = {}

    for s in merged:
        spec_node = aa._normalize_artifact_arg(base_dir, s["path"])
        spec_id = aa._spec_id_of(base_dir, spec_node)
        cands, _, _ = aa._detect_candidates(
            base_dir, sdlc_dir, metrics_dir, spec_node, transitive=False, include_coarse=False)
        active = [c for c in cands if not c["already_fresher"]]
        drifted = [c for c in active if c["drift"] and c["confidence"] == "declared"]

        refreshed_targets = [
            e.get("artifact") for e in art_ledger
            if am.is_change_entry(e)
            and am.normalize_event(e.get("event")) == "refreshed"
            and e.get("source_spec") == spec_id and e.get("artifact")
            and in_window(e.get("ts", ""), cutoff)]
        rejected_targets = [
            e.get("downstream") for e in art_ledger
            if am.is_disposition_entry(e) and e.get("upstream") == spec_node
            and am.normalize_disposition(e.get("disposition")) == "NOT_AFFECTED"
            and e.get("downstream") and in_window(e.get("ts", ""), cutoff)]

        _, _, rows = aa._refresh_status_rows(
            base_dir, sdlc_dir, metrics_dir, spec_node, transitive=False, include_coarse=False)
        open_rows = [r for r in rows if _row_is_open(r)]

        by_spec.append({
            "spec": spec_id, "spec_node": spec_node, "name": s.get("name", ""),
            "detected": len(active), "drifted": len(drifted),
            "refreshed": len(refreshed_targets), "rejected": len(rejected_targets),
            "open": len(open_rows),
        })

        for c in active:
            agg = stem_agg.setdefault(c["stem"], _empty_stem(c["stem"]))
            agg["detected"] += 1
            if c["drift"] and c["confidence"] == "declared":
                agg["drifted"] += 1
        for t in refreshed_targets:
            st = aa._pre_build_stem(t) or "?"
            stem_agg.setdefault(st, _empty_stem(st))["refreshed"] += 1
        for t in rejected_targets:
            st = aa._pre_build_stem(t) or "?"
            stem_agg.setdefault(st, _empty_stem(st))["rejected"] += 1
        for r in open_rows:
            st = r.get("stem") or "?"
            stem_agg.setdefault(st, _empty_stem(st))["open"] += 1

    by_spec.sort(key=lambda x: str(x["spec"]))
    by_stem = sorted((_stem_note(a) for a in stem_agg.values()), key=lambda x: x["stem"])
    return {"by_spec": by_spec, "by_stem": by_stem}


def _row_is_open(row: dict) -> bool:
    """A refresh-status row still counts as open debt: OPEN, or a mislabeled off-books disposition."""
    disp = row.get("disposition")
    if disp == "OPEN":
        return True
    return disp in ("ACKNOWLEDGED", "NOT_AFFECTED") and not row.get("off_books")


# --- Section 4: disposition debt rollup --------------------------------------------------------

def _current_findings_state(findings: list[dict]) -> list[dict]:
    """Latest entry per fingerprint — a finding's current disposition (mirrors record_findings)."""
    latest: dict[str, dict] = {}
    for e in findings:
        fp = e.get("fingerprint") or fm.fingerprint(e)
        if fp:
            latest[fp] = e
    return list(latest.values())


def debt_rollup(findings: list[dict], art_ledger: list[dict], base_dir: Path, sdlc_dir: Path,
                funnel: dict) -> dict:
    """Combined honest-counting debt — a now-measurement, so the window never applies. Each source is
    named on its own line by the caller."""
    findings_debt = len(fm.open_debt(_current_findings_state(findings)))
    stale_debt = len(am.open_debt(aa.compute_staleness(base_dir, sdlc_dir, art_ledger)))
    refresh_open = sum(sp["open"] for sp in funnel.get("by_spec", []))
    return {
        "findings": findings_debt,
        "artifact_staleness": stale_debt,
        "refresh_open": refresh_open,
        "total": findings_debt + stale_debt + refresh_open,
    }


# --- Assembly ----------------------------------------------------------------------------------

def build_payload(args) -> dict:
    base_dir, sdlc_dir, metrics_dir = aa.resolve_paths(args)
    cutoff = cutoff_from(getattr(args, "window_days", None))
    art_ledger = load_jsonl(metrics_dir / aa.LEDGER_NAME)
    findings = load_jsonl(metrics_dir / FINDINGS_LEDGER_NAME)

    recurring = _safe(lambda: recurring_findings(findings, cutoff), [])
    stale = _safe(lambda: repeat_stale(art_ledger, base_dir, sdlc_dir, cutoff), [])
    funnel = _safe(lambda: refresh_funnel(base_dir, sdlc_dir, metrics_dir, art_ledger, cutoff),
                   {"by_spec": [], "by_stem": []})
    debt = _safe(lambda: debt_rollup(findings, art_ledger, base_dir, sdlc_dir, funnel),
                 {"findings": 0, "artifact_staleness": 0, "refresh_open": 0, "total": 0})

    has_data = {
        "recurring_findings": bool(recurring),
        "repeat_stale": bool(stale),
        "refresh_funnel": any(
            (sp["detected"] + sp["drifted"] + sp["refreshed"] + sp["rejected"] + sp["open"]) > 0
            for sp in funnel.get("by_spec", [])),
        # Debt is a real measurement (possibly 0) whenever either ledger exists; only truly-absent
        # ledgers read "no data" (never a fabricated zero).
        "debt": bool(art_ledger) or bool(findings),
    }
    return {
        "has_data": has_data,
        "recurring_findings": recurring,
        "repeat_stale": stale,
        "refresh_funnel": funnel,
        "debt": debt,
        "window_days": getattr(args, "window_days", None),
    }


def format_report(p: dict) -> str:
    hd = p["has_data"]
    wd = p["window_days"]
    window = f"  (last {wd} days)" if wd else "  (all history)"
    L = [f"Retro Roll-up{window}", "=" * 60, ""]

    L.append("Recurring findings (candidates for a permanent check):")
    if not hd["recurring_findings"]:
        L.append("  no data")
    else:
        for g in p["recurring_findings"]:
            disp = ", ".join(f"{k}={v}" for k, v in sorted(g["dispositions"].items())) or "none"
            L.append(f"  • {g['category'] or '—'} @ {g['target'] or '—'}")
            L.append(f"      seen {g['times']} times across {g['rounds']} rounds — "
                     f"candidate for a permanent check")
            L.append(f"      dispositions: {disp}")
    L.append("")

    L.append("Repeat-stale artifacts (artifact-log.jsonl):")
    if not hd["repeat_stale"]:
        L.append("  no data")
    else:
        for r in p["repeat_stale"]:
            cur = " · currently STALE" if r["currently_stale"] else ""
            L.append(f"  • {r['artifact']}")
            L.append(f"      flagged {r['flagged']} times "
                     f"({r['dispositioned']} dispositioned, {r['open']} open){cur}")
    L.append("")

    L.append("Refresh funnel — divergence-heuristic tuning signal (artifact-log.jsonl):")
    if not hd["refresh_funnel"]:
        L.append("  no data")
    else:
        L.append("  by spec:")
        for sp in p["refresh_funnel"]["by_spec"]:
            if (sp["detected"] + sp["refreshed"] + sp["rejected"] + sp["open"]) == 0:
                continue
            name = f" {sp['name']}" if sp.get("name") else ""
            arrow = aa._glyph("→", "->")
            L.append(f"    spec {sp['spec']}{name}: {sp['detected']} detected {arrow} "
                     f"{sp['drifted']} drifted {arrow} {sp['refreshed']} refreshed {arrow} "
                     f"{sp['rejected']} rejected {arrow} {sp['open']} still open")
        L.append("  by upstream stem:")
        for st in p["refresh_funnel"]["by_stem"]:
            L.append(f"    {st['stem']}: {st['detected']} detected · {st['drifted']} drifted · "
                     f"{st['refreshed']} applied · {st['rejected']} rejected · {st['open']} open")
            L.append(f"        {st['note']}")
    L.append("")

    L.append("Disposition debt rollup (honest counting):")
    if not hd["debt"]:
        L.append("  no data")
    else:
        d = p["debt"]
        L.append(f"  findings debt        (findings-log.jsonl):  {d['findings']}")
        L.append(f"  artifact staleness   (artifact-log.jsonl):  {d['artifact_staleness']}")
        L.append(f"  refresh open         (artifact-log.jsonl):  {d['refresh_open']}")
        L.append(f"  total open debt:     {d['total']}")
    L.append("")

    L.append("=" * 60)
    L.append("ADVISORY — read-only; patterns, not people; never blocks (exit 0).")
    L.append("Never tracked: velocity, story points, PR count, lines of code. No per-person ranking.")
    return "\n".join(L)


# --- CLI ---------------------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Cross-ledger retro roll-up: recurring findings, repeat-stale artifacts, the "
                    "refresh funnel, and combined disposition debt (read-only, advisory; exit 0)")
    src = p.add_mutually_exclusive_group()
    src.add_argument("--state", help="Path to .sdlc/state.yaml (workflow mode)")
    src.add_argument("--repo", default=".", help="Repo root containing .sdlc/ (standalone; default cwd)")
    p.add_argument("--window-days", dest="window_days", type=int, default=None,
                   help="Only count time-stamped ledger events from the last N days (default: all history)")
    p.add_argument("--json", action="store_true", help="Emit JSON (per-section has_data flags)")
    return p


def main() -> None:
    args = build_parser().parse_args()
    try:
        payload = build_payload(args)
        if args.json:
            print(json.dumps(payload, indent=2))
        else:
            print(format_report(payload))
    except SystemExit:
        raise  # resolve_paths exits 0 on a missing --state; honour it
    except Exception as exc:  # advisory: never a stack trace, never a non-zero exit
        print(f"retro — could not complete the roll-up ({type(exc).__name__}); no data.")
    sys.exit(0)


if __name__ == "__main__":
    main()
