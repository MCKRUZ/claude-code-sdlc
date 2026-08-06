"""audit_artifacts.py — the advisory engine behind /sdlc-audit-artifacts and /sdlc-revise.

Connects two facts the tool already has — *when each artifact last changed* (SHA-256 hashes) and
*what depends on what* (declared traceability, via artifact_lineage) — into staleness detection, an
append-only change history, and a forward "what would this change put at risk" impact view.

Three subcommands, all **exit 0 always** (advisory — staleness is never a gate):

  record   append to the ledger. Three modes:
             --scan                      hash-walk every artifact; append `created` for new files and
                                         `snapshot` for drifted ones. The first-ever scan is the
                                         baseline ("history starts now" — the retro-baseline).
             --artifact P [--target ID]  one explicit change entry (the /sdlc-revise write).
                 --actor A --reason R [--event revised] [--decision-ref DL-NN] [--phase P]
             --disposition SET           a human's judgement on one staleness candidate.
                 --downstream D --upstream U [--owner O] [--reason R] [--actor A]
  impact   <id|file>   forward lineage: everything downstream that a change here could make stale.
  report   freshness dashboard (default) | --history <id|file> | --json | --since YYYY-MM-DD

The ledger lives in its OWN JSONL (.sdlc/metrics/artifact-log.jsonl), never inside state.yaml's
gate_results (that dict is expanded into phantom rows by audit_gates.extract_gate_history — the trap
this layer must not fall into).

Standalone or Workflow (CLAUDE.md design rule):
  --repo <path>   standalone (reads <repo>/.sdlc)      |   --state .sdlc/state.yaml   in-workflow
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
import artifact_lineage as al
import artifact_model as am
import phase_model as pm
from track_artifacts import compute_checksum

LEDGER_NAME = "artifact-log.jsonl"


# --- Path / state plumbing --------------------------------------------------------------------

def resolve_paths(args) -> tuple[Path, Path, Path]:
    """(base_dir, sdlc_dir, metrics_dir) from --state (the .sdlc beside it) or --repo (<repo>/.sdlc)."""
    if getattr(args, "state", None):
        state_path = Path(args.state)
        if not state_path.exists():
            print(f"Error: State file not found: {state_path}")
            sys.exit(0)  # advisory — never a hard failure
        sdlc = state_path.resolve().parent
        return sdlc.parent, sdlc, sdlc / "metrics"
    repo = Path(args.repo).resolve()
    return repo, repo / ".sdlc", repo / ".sdlc" / "metrics"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_ledger(ledger_path: Path) -> list[dict]:
    if not ledger_path.exists():
        return []
    out = []
    for line in ledger_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if line:
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            # Only object entries are ledger records. A valid-JSON non-object line (null, 42, a
            # bare string/array — e.g. from a hand-edit or partial write) is skipped, not appended,
            # so downstream .get() calls never hit a non-dict and the exit-0 invariant holds.
            if isinstance(obj, dict):
                out.append(obj)
    return out


def append_entries(metrics_dir: Path, entries: list[dict]) -> Path:
    metrics_dir.mkdir(parents=True, exist_ok=True)
    ledger_path = metrics_dir / LEDGER_NAME
    with open(ledger_path, "a", encoding="utf-8") as f:
        for e in entries:
            f.write(json.dumps(e) + "\n")
    return ledger_path


def load_state(sdlc_dir: Path) -> dict:
    state_path = sdlc_dir / "state.yaml"
    if not state_path.exists():
        return {}
    try:
        return yaml.safe_load(state_path.read_text(encoding="utf-8", errors="replace")) or {}
    except yaml.YAMLError:
        return {}


# --- Artifact scanning & identity -------------------------------------------------------------

def scan_hashes(base_dir: Path, sdlc_dir: Path) -> dict[str, str]:
    """Current SHA of every tracked node (same node namespace as artifact_lineage)."""
    hashes: dict[str, str] = {}
    for node in al.discover_nodes(base_dir, sdlc_dir):
        p = base_dir / node
        if p.is_file():
            try:
                hashes[node] = compute_checksum(p)
            except OSError:
                continue  # unreadable file (e.g. mode 000) — skip, never crash the advisory scan
    return hashes


_SLUG_TO_ID = {p["slug"]: pm.normalize_id(p["id"]) for p in pm.all_phases()}


def phase_id_of(node: str) -> str:
    """Best-effort phase id a node belongs to (for the ledger's `phase` field). '' if unknown."""
    parts = node.split("/")
    if ".sdlc" in parts and "artifacts" in parts:
        i = parts.index("artifacts")
        if i + 1 < len(parts):
            return _SLUG_TO_ID.get(parts[i + 1], "") or ""
    if "context/layers/phase" in node:
        import re
        m = re.search(r"context/layers/phase([^/-]+)-", node)
        if m and pm.get_phase(m.group(1)):
            return pm.normalize_id(m.group(1))
    if node.startswith("specs/"):
        return "build"
    return ""


def resolve_target_node(base_dir: Path, sdlc_dir: Path, target: str, nodes: list[str]) -> str | None:
    """Resolve an id (FR-012) or a path to a known node. None if it can't be placed."""
    target = (target or "").strip()
    if not target:
        return None
    if al.ID_RE.fullmatch(target):
        return al.find_id_declarations(base_dir, nodes).get(target)
    # A path (absolute, repo-relative, or bare filename).
    return al._resolve_path_ref(base_dir, sdlc_dir, nodes[0] if nodes else ".", target, set(nodes)) \
        or _rel_if_node(base_dir, target, set(nodes))


def _rel_if_node(base_dir: Path, target: str, node_set: set) -> str | None:
    try:
        rel = (base_dir / target).resolve().relative_to(base_dir.resolve()).as_posix()
    except ValueError:
        rel = target
    return rel if rel in node_set else None


def _parse_ts(ts: str):
    try:
        dt = datetime.fromisoformat(str(ts))
    except (ValueError, TypeError):
        return None
    # Ledger timestamps are tz-aware (now_iso); a bare-date --since (the documented YYYY-MM-DD form)
    # parses naive. Coerce naive to UTC so `da < db` never mixes aware/naive and raises TypeError.
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _ts_lt(a: str, b: str) -> bool:
    """True if timestamp a is strictly before b (parsed; falls back to string order)."""
    da, db = _parse_ts(a), _parse_ts(b)
    if da is not None and db is not None:
        return da < db
    return str(a) < str(b)


# --- Staleness ---------------------------------------------------------------------------------

def compute_staleness(base_dir: Path, sdlc_dir: Path, ledger: list[dict]) -> list[dict]:
    """One item per (upstream→downstream) edge where the upstream changed *after* the downstream
    last did. Each item carries its resolved disposition (recorded, else OPEN) so honest counting
    can run over the list."""
    graph = al.build_graph(base_dir, sdlc_dir)
    latest = am.latest_change_per_artifact(ledger)
    dispositions = am.latest_dispositions(ledger)

    items: list[dict] = []
    for e in graph:
        up, down = e["upstream"], e["downstream"]
        cu, cd = latest.get(up), latest.get(down)
        if not cu or not cd:
            continue
        t_up, t_down = cu.get("ts", ""), cd.get("ts", "")
        if not _ts_lt(t_down, t_up):
            continue  # downstream is at least as fresh as the upstream change — not stale
        up_hash = cu.get("hash") or ""
        key = am.staleness_key(down, up, up_hash)
        recorded = dispositions.get(key)
        item = {
            "downstream": down,
            "upstream": up,
            "upstream_hash": up_hash,
            "basis": e["basis"],
            "confidence": e["confidence"],
            "upstream_changed": t_up,
            "downstream_changed": t_down,
            "disposition": "OPEN",
        }
        if recorded:
            item["disposition"] = am.normalize_disposition(recorded.get("disposition")) or "OPEN"
            for k in ("owner", "reason"):
                if recorded.get(k):
                    item[k] = recorded[k]
        items.append(item)
    return items


# --- record ------------------------------------------------------------------------------------

def do_scan(base_dir: Path, sdlc_dir: Path, metrics_dir: Path, actor: str) -> int:
    ledger = load_ledger(metrics_dir / LEDGER_NAME)
    first_run = not any(am.is_change_entry(e) for e in ledger)
    latest = am.latest_change_per_artifact(ledger)
    hashes = scan_hashes(base_dir, sdlc_dir)
    ts = now_iso()
    actor = actor or ("baseline" if first_run else "scan")

    new_entries: list[dict] = []
    created = drifted = 0
    for node, sha in sorted(hashes.items()):
        prev = latest.get(node)
        if prev is None:
            new_entries.append(am.change_entry(
                ts=ts, artifact=node, event="created", phase=phase_id_of(node),
                hash=sha, actor=actor, reason="baseline" if first_run else "first seen"))
            created += 1
        elif prev.get("hash") != sha:
            new_entries.append(am.change_entry(
                ts=ts, artifact=node, event="snapshot", phase=phase_id_of(node),
                hash=sha, prev_hash=prev.get("hash"), actor=actor, reason="drift detected by scan"))
            drifted += 1

    if not new_entries:
        print("Artifact scan: no changes since the last ledger entry (nothing to record).")
        return 0
    append_entries(metrics_dir, new_entries)
    if first_run:
        print(f"Baseline recorded: {created} artifact(s) hashed — history starts now.")
    else:
        print(f"Recorded {len(new_entries)} change(s): {created} new, {drifted} drifted.")
    return 0


def do_change(args, base_dir: Path, sdlc_dir: Path, metrics_dir: Path) -> int:
    node = _normalize_artifact_arg(base_dir, args.artifact)
    ledger = load_ledger(metrics_dir / LEDGER_NAME)
    prev = am.latest_change_per_artifact(ledger).get(node)
    p = base_dir / node
    try:
        sha = compute_checksum(p) if p.is_file() else None
    except OSError:
        sha = None  # unreadable file — record the change with an unknown hash, never crash
    entry = am.change_entry(
        ts=now_iso(), artifact=node, event=args.event, target=args.target or "",
        phase=args.phase or phase_id_of(node), hash=sha,
        prev_hash=prev.get("hash") if prev else None,
        actor=args.actor or "", reason=args.reason or "", decision_ref=args.decision_ref or "")
    append_entries(metrics_dir, [entry])
    tgt = f" ({args.target})" if args.target else ""
    print(f"Recorded {entry['event']} of {node}{tgt} by {args.actor or 'unknown'}"
          + (f" — ref {args.decision_ref}" if args.decision_ref else ""))
    return 0


def do_disposition(args, base_dir: Path, sdlc_dir: Path, metrics_dir: Path) -> int:
    disp = am.normalize_disposition(args.disposition)
    if disp not in am.SETTABLE_DISPOSITIONS:
        print(f"record --disposition: '{args.disposition}' is not a recordable disposition "
              f"(choose one of {', '.join(am.SETTABLE_DISPOSITIONS)}). REFRESHED is DERIVED from the "
              f"ledger — update the downstream artifact and re-scan; you cannot type it. Nothing recorded.")
        return 0
    nodes = al.discover_nodes(base_dir, sdlc_dir)
    down = resolve_target_node(base_dir, sdlc_dir, args.downstream, nodes) or args.downstream
    up = resolve_target_node(base_dir, sdlc_dir, args.upstream, nodes) or args.upstream
    ledger = load_ledger(metrics_dir / LEDGER_NAME)
    up_change = am.latest_change_per_artifact(ledger).get(up)
    up_hash = args.upstream_hash or (up_change.get("hash") if up_change else "") or ""
    entry = am.disposition_entry(
        ts=now_iso(), downstream=down, upstream=up, upstream_hash=up_hash,
        disposition=args.disposition, owner=args.owner or "", reason=args.reason or "",
        actor=args.actor or "")
    append_entries(metrics_dir, [entry])
    off, why = am.validate_disposition(entry)
    tag = "off the books" if off else f"STILL COUNTS as debt ({why})"
    print(f"Recorded disposition {entry['disposition']} for {down} <- {up}: {tag}.")
    return 0


def _normalize_artifact_arg(base_dir: Path, artifact: str) -> str:
    try:
        return (base_dir / artifact).resolve().relative_to(base_dir.resolve()).as_posix()
    except ValueError:
        return artifact.replace("\\", "/")


def cmd_record(args) -> int:
    base_dir, sdlc_dir, metrics_dir = resolve_paths(args)
    if args.disposition:
        if not (args.downstream and args.upstream):
            print("record --disposition needs --downstream and --upstream (nothing recorded).")
            return 0
        return do_disposition(args, base_dir, sdlc_dir, metrics_dir)
    if args.scan:
        return do_scan(base_dir, sdlc_dir, metrics_dir, args.actor or "")
    if args.artifact:
        return do_change(args, base_dir, sdlc_dir, metrics_dir)
    print("record: choose a mode — --scan, --artifact <path>, or --disposition <SET> "
          "(nothing recorded).")
    return 0


# --- impact ------------------------------------------------------------------------------------

def cmd_impact(args) -> int:
    base_dir, sdlc_dir, _ = resolve_paths(args)
    nodes = al.discover_nodes(base_dir, sdlc_dir)
    node = resolve_target_node(base_dir, sdlc_dir, args.target, nodes)
    if not node:
        print(f"Impact — could not resolve '{args.target}' to a known artifact.")
        print("(advisory — nothing to assess)")
        return 0
    graph = al.build_graph(base_dir, sdlc_dir)
    rows = al.downstream_of(graph, node)
    if args.json:
        print(json.dumps({"target": node, "downstream": rows}, indent=2))
        return 0
    print(f"Impact — if {node} changes, {len(rows)} downstream artifact(s) may go stale:")
    if not rows:
        print("  (no declared or inferred downstream)")
    for r in sorted(rows, key=lambda x: (x["confidence"], x["node"])):
        label = "declared" if r["confidence"] == "declared" else "COARSE (phase-order guess)"
        path = " -> ".join(r["path"][1:]) if len(r["path"]) > 2 else r["node"]
        print(f"  • {r['node']}   [{label}]" + (f"   via {path}" if len(r["path"]) > 2 else ""))
    print("(advisory — a downstream may already account for the change; disposition each in "
          "/sdlc-audit-artifacts)")
    return 0


# --- report ------------------------------------------------------------------------------------

def cmd_report(args) -> int:
    base_dir, sdlc_dir, metrics_dir = resolve_paths(args)
    ledger = load_ledger(metrics_dir / LEDGER_NAME)

    if args.history:
        return _report_history(base_dir, sdlc_dir, ledger, args)

    full_latest = am.latest_change_per_artifact(ledger)
    has_history = bool(full_latest)
    items = compute_staleness(base_dir, sdlc_dir, ledger)
    latest, items, scope = _apply_scope(base_dir, sdlc_dir, full_latest, items, args)

    debt = am.open_debt(items)
    # "dispositioned" == legitimately off the books (ACKNOWLEDGED w/ owner, NOT_AFFECTED w/ reason).
    # Defined as the complement of debt so the footer count always reconciles with the per-node line.
    acknowledged = [i for i in items if not am.counts_as_debt(i)]
    stale_downstreams = sorted({i["downstream"] for i in items})

    if args.json:
        print(json.dumps({
            "has_history": has_history,
            "scope": scope,
            "artifacts_tracked": len(full_latest),
            "artifacts_shown": len(latest),
            "stale": len(stale_downstreams),
            "open": len(debt),
            "acknowledged": len(acknowledged),
            "items": items,
        }, indent=2))
        return 0

    print(_format_freshness(sdlc_dir, latest, items, debt, acknowledged, scope, has_history))
    return 0


def _apply_scope(base_dir: Path, sdlc_dir: Path, latest: dict, items: list[dict], args):
    """Restrict the freshness view to --artifact, --phase, and/or --since. Returns
    (scoped_latest, scoped_items, scope_label)."""
    scope = "all"
    if getattr(args, "artifact", None):
        nodes = al.discover_nodes(base_dir, sdlc_dir)
        node = resolve_target_node(base_dir, sdlc_dir, args.artifact, nodes) or \
            _normalize_artifact_arg(base_dir, args.artifact)
        latest = {k: v for k, v in latest.items() if k == node}
        items = [i for i in items if i["downstream"] == node]
        scope = f"artifact:{node}"
    elif getattr(args, "phase", None):
        pid = pm.normalize_id(args.phase)
        latest = {k: v for k, v in latest.items() if phase_id_of(k) == pid}
        items = [i for i in items if phase_id_of(i["downstream"]) == pid]
        scope = f"phase:{pid}"
    if getattr(args, "since", None):
        latest = {k: v for k, v in latest.items() if not _ts_lt(v.get("ts", ""), args.since)}
        items = [i for i in items if i["downstream"] in latest]
        scope = f"{scope}+since:{args.since}" if scope != "all" else f"since:{args.since}"
    return latest, items, scope


def _report_history(base_dir: Path, sdlc_dir: Path, ledger: list[dict], args) -> int:
    nodes = al.discover_nodes(base_dir, sdlc_dir)
    node = resolve_target_node(base_dir, sdlc_dir, args.history, nodes) or \
        _normalize_artifact_arg(base_dir, args.history)
    trail = am.changes_for(ledger, node)
    if args.since:
        trail = [e for e in trail if not _ts_lt(e.get("ts", ""), args.since)]
    if args.json:
        print(json.dumps({"artifact": node, "history": trail}, indent=2))
        return 0
    print(f"History — {node}")
    print("=" * 50)
    if not trail:
        print("  (no recorded changes — run `record --scan` to seed a baseline)")
        return 0
    for e in trail:
        who = e.get("actor") or "unknown"
        tgt = f" [{e['target']}]" if e.get("target") else ""
        why = f' — "{e["reason"]}"' if e.get("reason") else ""
        ref = f" ({e['decision_ref']})" if e.get("decision_ref") else ""
        print(f"  {e.get('ts', '?')[:19]}  {e.get('event', '?'):9}{tgt}  by {who}{why}{ref}")
    return 0


def _format_freshness(sdlc_dir, latest, items, debt, acknowledged, scope, has_history) -> str:
    state = load_state(sdlc_dir)
    phases = state.get("phases", {}) if isinstance(state, dict) else {}

    header = "Artifact Freshness" + ("" if scope == "all" else f"  (scope: {scope})")
    lines = [header, "=" * 50]
    if not latest:
        if not has_history:
            lines.append("No artifact history yet.")
            lines.append("Run `record --scan` to seed a baseline (history starts now); nothing is")
            lines.append("fabricated about the past.")
        else:
            lines.append(f"No tracked artifacts match this scope ({scope}).")
        lines.append("=" * 50)
        lines.append("ADVISORY — nothing to assess (advisory surface — never blocks).")
        return "\n".join(lines)

    stale_by_down: dict[str, list[dict]] = {}
    for i in items:
        stale_by_down.setdefault(i["downstream"], []).append(i)

    for node in sorted(latest):
        c = latest[node]
        when = c.get("ts", "?")[:10]
        who = c.get("actor") or "?"
        node_items = stale_by_down.get(node, [])
        if not node_items:
            status = "FRESH"
        else:
            n_open = len(am.open_debt(node_items))
            status = f"STALE ({n_open} open, {len(node_items) - n_open} dispositioned)"
        signed = _signoff_note(node, phases)
        lines.append(f"  {node}")
        lines.append(f"      changed {when} by {who}   {signed}   {status}")
        for i in node_items:
            disp = am.normalize_disposition(i.get("disposition")) or "OPEN"
            owner = f" {i['owner']}" if i.get("owner") else ""
            conf = "" if i["confidence"] == "declared" else " [coarse]"
            lines.append(f"         ← {i['upstream']}{conf}  ({disp}{owner})")

    lines.append("=" * 50)
    lines.append(f"{len(latest)} artifact(s) tracked · "
                 f"{len({i['downstream'] for i in items})} stale · "
                 f"{len(debt)} open · {len(acknowledged)} dispositioned")
    lines.append("ADVISORY — staleness is a candidate a human dispositions, never a gate (exit 0).")
    return "\n".join(lines)


def _signoff_note(node: str, phases: dict) -> str:
    pid = phase_id_of(node)
    pdata = phases.get(pid) if isinstance(phases, dict) else None
    if isinstance(pdata, dict):
        if pdata.get("sign_off") or pdata.get("signed_by"):
            return "signed-off ✓"
        if pdata.get("status") == "completed":
            return "phase completed"
    return "unsigned"


# --- CLI ---------------------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Advisory artifact change-ledger, staleness, and impact (never blocks; exit 0)")
    sub = parser.add_subparsers(dest="command", required=True)

    common = argparse.ArgumentParser(add_help=False)
    src = common.add_mutually_exclusive_group()
    src.add_argument("--state", help="Path to .sdlc/state.yaml (workflow mode)")
    src.add_argument("--repo", default=".", help="Repo root containing .sdlc/ (standalone; default cwd)")

    p_rec = sub.add_parser("record", parents=[common], help="Append change or disposition entries")
    p_rec.add_argument("--scan", action="store_true", help="Hash-walk artifacts; record new/drifted files")
    p_rec.add_argument("--artifact", help="Record one explicit change to this artifact path")
    p_rec.add_argument("--target", help="Sub-artifact id the change touched (e.g. FR-012)")
    p_rec.add_argument("--event", default="revised", help="Change event (created/revised/refreshed/snapshot)")
    p_rec.add_argument("--phase", help="Phase id the artifact belongs to (inferred if omitted)")
    p_rec.add_argument("--actor", help="Who made the change")
    p_rec.add_argument("--reason", help="Why the change was made")
    p_rec.add_argument("--decision-ref", dest="decision_ref", help="Linked decision-log id (DL-NN)")
    p_rec.add_argument("--disposition", help="Record a staleness disposition (OPEN/ACKNOWLEDGED/NOT_AFFECTED; REFRESHED is derived, not recordable)")
    p_rec.add_argument("--downstream", help="Downstream artifact for a disposition")
    p_rec.add_argument("--upstream", help="Upstream artifact for a disposition")
    p_rec.add_argument("--upstream-hash", dest="upstream_hash", help="Pin the disposition to this upstream hash")
    p_rec.add_argument("--owner", help="Owner (required for ACKNOWLEDGED to be off the books)")

    p_imp = sub.add_parser("impact", parents=[common], help="Forward: what a change here could make stale")
    p_imp.add_argument("target", help="An id (FR-012) or an artifact path")
    p_imp.add_argument("--json", action="store_true", help="Emit JSON")

    p_rep = sub.add_parser("report", parents=[common], help="Freshness dashboard / history")
    p_rep.add_argument("--history", help="Backward change trail for an id or artifact path")
    p_rep.add_argument("--artifact", help="Scope the dashboard to one artifact (id or path)")
    p_rep.add_argument("--phase", help="Scope the dashboard to one phase id")
    p_rep.add_argument("--since", help="Filter to changes on/after this ISO date")
    p_rep.add_argument("--json", action="store_true", help="Emit JSON")

    args = parser.parse_args()
    if args.command == "record":
        rc = cmd_record(args)
    elif args.command == "impact":
        rc = cmd_impact(args)
    else:
        rc = cmd_report(args)
    # Advisory by construction — never a non-zero exit.
    sys.exit(0 if rc is None else 0)


if __name__ == "__main__":
    main()
