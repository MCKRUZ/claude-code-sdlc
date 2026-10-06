"""sprint_model.py — Single source of truth for the sprint vocabulary, the "ready" rule, the slate
proposal, the build-order heuristic, and the spec-frontmatter writer's refusal rules.

A sprint is a *commitment window over the backlog order*, never a second backlog: a named human
slates a count of specs (`target`) by a *mix of work* (risk tiers — the axis that sets checking
depth), readies the sprint once every slated spec clears the Definition of Ready and its Engineering
and Data verdicts, and closes it with kept / carried / dropped, each with a name and a reason. This
module owns that arithmetic and does NO I/O: pure functions over plain dict rows, so it is trivially
testable and safe to import from sprint.py, generate_sprint_report.py, and the hooks.

The vocabulary (proposal §4, decisions D1–D8):

  - SPRINT_STATES      planning → ready → closed. Human-triggered, forward only.
  - SPEC_KEYS          the five optional spec-frontmatter keys this layer owns
                       (sprint, next_owner, eng_review, data_review, depends_on). `status` is NOT
                       one of them — it stays the protected, hand-moved four-value field.
  - REVIEW_VALUES      pending | accepted | returned | n-a  (n-a is legal for the data lane only,
                       and only with a reason — that rule is enforced by the CLI, named here).
  - EVENTS             the ledger vocabulary (.sdlc/metrics/sprint-log.jsonl).

Honest counting rules this module enforces:

  - The "ready" rule (D3) is conjunctive: DoR READY AND status at least ready (ready, in-flight or
    merged — only draft/unknown falls short) AND eng accepted AND data
    accepted-or-n-a, plus a dependency graph with no cycle and nothing pointing outside the slate
    at an unmerged spec. ready_gaps() lists every gap per spec; it never rounds a partial to ready.
  - The mix (D1/D5) is advisory: a breach WARNS; only the slate-over-target rule blocks (in the CLI).
  - FORBIDDEN_FIELDS: the activity metrics the standard never tracks (scorecard.FORBIDDEN_TYPES plus
    points / estimate / effort / hours / capacity). event_entry() refuses them so velocity cannot
    come back in through the sprint's side door. No per-person aggregation exists anywhere here.
  - "no data" is None, never 0: business_days_since() and sprint_days() return None when the
    underlying date is missing or unparseable rather than fabricating a zero.

Timestamps are always supplied by the caller (never minted here) so the model stays deterministic
under test. Business-day math is delegated to track_decisions (weekend-aware, dates in, ints out);
ts_to_date() is the adapter from a full ISO ledger timestamp to the UTC calendar date it needs.
"""

import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import risk_model as rm  # noqa: E402
from check_dependencies import detect_cycles, topological_sort  # noqa: E402
from check_spec import PLACEHOLDER_RE  # noqa: E402
from scorecard import FORBIDDEN_TYPES  # noqa: E402
from track_decisions import add_business_days, business_days_elapsed, parse_iso_date  # noqa: E402

# --- Vocabulary ---------------------------------------------------------------------------------

SPRINT_STATES = ("planning", "ready", "closed")
SPRINT_ID_RE = re.compile(r"^S\d{2,}$")

# The five spec-frontmatter keys this layer owns. `status` is deliberately absent (hand-moved).
SPEC_KEYS = ("sprint", "next_owner", "eng_review", "data_review", "depends_on")
REVIEW_VALUES = ("pending", "accepted", "returned", "n-a")
LANES = ("eng", "data")

# Specs a `slate` proposal may draw from (no sprint yet; not in-flight, not merged).
SLATEABLE_STATUSES = ("ready", "draft")
# Statuses that satisfy the ready rule's status rung: ready, or already past it. Only draft (or a
# missing/unknown status) is short of the bar.
AT_LEAST_READY_STATUSES = ("ready", "in-flight", "merged")

# Ledger events (.sdlc/metrics/sprint-log.jsonl), one line per event. Append-only: a name, once
# written to a ledger, is never renamed or removed (the ledger is replayed, not migrated).
EVENTS = (
    "slated", "unslated", "handoff", "ack", "verdict", "ready", "closed", "carried", "dropped", "sprint_new",
    "sprint_edited",  # sprint.py edit: {sprint, field, by} — a record field changed after `new`
)

# Activity metrics the standard forbids (R4). A superset of scorecard's refusal list.
FORBIDDEN_FIELDS = set(FORBIDDEN_TYPES) | {"points", "estimate", "effort", "hours", "capacity"}

# Values a frontmatter writer must refuse: check_spec.parse_frontmatter truncates at '#' and strips
# quotes, and PLACEHOLDER_RE would turn a written value into a DoR failure.
_FORBIDDEN_VALUE_CHARS = ('#', '"', "'", "\n", "\r")

_TIER_RANK = {tier: i for i, tier in enumerate(rm.RISK_TIERS)}  # HIGH=0 < MEDIUM=1 < LOW=2


def is_forbidden_field(key) -> bool:
    """True if a field/flag key names an activity metric the layer refuses to record."""
    k = str(key or "").strip().lower().replace("-", "_").replace(" ", "_")
    return k in FORBIDDEN_FIELDS


def forbidden_field_message(key) -> str:
    """The refusal wording (same style as scorecard.py) for a forbidden field."""
    return (f"Refused: '{key}' is an activity metric the standard never tracks "
            f"(velocity, story points, PR count, lines of code). Steering is on outcomes.")


def is_valid_sprint_id(sprint_id) -> bool:
    return bool(SPRINT_ID_RE.match(str(sprint_id or "").strip()))


def normalize_review(value) -> str | None:
    """Canonical review verdict, or None if not one of REVIEW_VALUES ('' reads as None)."""
    v = str(value or "").strip().lower()
    return v if v in REVIEW_VALUES else None


# --- Mix (D1) ----------------------------------------------------------------------------------

def parse_mix(s, target: int | None = None) -> dict[str, int]:
    """'HIGH:1,MEDIUM:2,LOW:3' -> {'HIGH': 1, 'MEDIUM': 2, 'LOW': 3}. '' -> {} (no mix set).

    ValueError on garbage: an unknown tier, a non-integer or negative count, a repeated tier, or —
    when `target` is given — counts that sum to more than the target (the mix is a breakdown of
    the target, not an addition to it).
    """
    text = str(s or "").strip()
    mix: dict[str, int] = {}
    if not text:
        return mix
    for part in text.split(","):
        part = part.strip()
        if not part:
            continue
        if ":" not in part:
            raise ValueError(f"mix entry '{part}' must look like TIER:count (e.g. HIGH:1)")
        tier_raw, _, count_raw = part.partition(":")
        tier = rm.normalize_tier(tier_raw)
        if tier is None:
            raise ValueError(f"mix tier '{tier_raw.strip()}' is not one of {', '.join(rm.RISK_TIERS)}")
        if tier in mix:
            raise ValueError(f"mix names tier {tier} twice")
        try:
            count = int(count_raw.strip())
        except ValueError:
            raise ValueError(f"mix count for {tier} must be an integer (got '{count_raw.strip()}')") from None
        if count < 0:
            raise ValueError(f"mix count for {tier} must not be negative (got {count})")
        mix[tier] = count
    if target is not None and sum(mix.values()) > int(target):
        raise ValueError(f"mix counts sum to {sum(mix.values())}, more than the target of {target}")
    return mix


def mix_to_string(mix: dict[str, int]) -> str:
    """Inverse of parse_mix, in HIGH → MEDIUM → LOW order."""
    return ",".join(f"{t}:{mix[t]}" for t in rm.RISK_TIERS if t in mix)


def mix_status(slate_rows: list[dict], mix: dict[str, int]) -> dict[str, dict]:
    """Per tier: {'target': n | None, 'actual': m}. Empty dict when there is neither a mix nor a slate.

    A tier the mix does not name but the slate contains gets target None ("no target"), not 0.
    """
    actual: dict[str, int] = {}
    for row in slate_rows:
        tier = rm.normalize_tier(row.get("risk"))
        if tier is not None:
            actual[tier] = actual.get(tier, 0) + 1
    out: dict[str, dict] = {}
    for tier in rm.RISK_TIERS:
        if tier in mix or tier in actual:
            out[tier] = {"target": mix.get(tier), "actual": actual.get(tier, 0)}
    return out


def mix_warnings(slate_rows: list[dict], mix: dict[str, int], target: int | None) -> list[str]:
    """Advisory warnings only — a mix breach never blocks (D5)."""
    warnings: list[str] = []
    if target is not None and mix and sum(mix.values()) > int(target):
        warnings.append(f"mix counts sum to {sum(mix.values())}, more than the target of {target}")
    if target is not None and len(slate_rows) > int(target):
        warnings.append(f"slate has {len(slate_rows)} specs, more than the target of {target}")
    for tier, cell in mix_status(slate_rows, mix).items():
        tgt, act = cell["target"], cell["actual"]
        if tgt is None:
            warnings.append(f"mix breach: {act} {tier} slated but the mix sets no {tier} target")
        elif act > tgt:
            warnings.append(f"mix breach: {act} {tier} slated vs {tgt} in the mix")
        elif act < tgt:
            warnings.append(f"mix short: {act} {tier} slated vs {tgt} in the mix")
    return warnings


# --- Slate proposal ---------------------------------------------------------------------------

def _row_id(row: dict) -> str:
    return str(row.get("id", ""))


def propose_slate(candidates: list[dict], target: int, mix: dict[str, int]) -> list[dict]:
    """Propose up to `target` rows from already-filtered candidates, honouring the mix.

    Each tier bucket is filled in spec-id (backlog) order up to its mix count; the remaining slots
    are filled by id from whatever is left. Never exceeds target. The result is in id order — a
    slate is a subset of the backlog, not a re-ordering of it.
    """
    target = max(int(target or 0), 0)
    ordered = sorted(candidates, key=_row_id)
    picked: list[dict] = []
    picked_ids: set[str] = set()

    for tier in rm.RISK_TIERS:
        want = mix.get(tier, 0)
        for row in ordered:
            if want <= 0 or len(picked) >= target:
                break
            if _row_id(row) in picked_ids or rm.normalize_tier(row.get("risk")) != tier:
                continue
            picked.append(row)
            picked_ids.add(_row_id(row))
            want -= 1

    for row in ordered:
        if len(picked) >= target:
            break
        if _row_id(row) not in picked_ids:
            picked.append(row)
            picked_ids.add(_row_id(row))

    return sorted(picked, key=_row_id)


# --- Dependencies -----------------------------------------------------------------------------

def parse_depends_on(value) -> list[str]:
    """'' -> [], '0007' -> ['0007'], '0007, 0009' -> ['0007', '0009']. Lists pass through; dedupes."""
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        parts = [str(v) for v in value]
    else:
        parts = str(value).split(",")
    out: list[str] = []
    for p in parts:
        p = p.strip()
        if p and p not in out:
            out.append(p)
    return out


def dependency_graph(slate_rows: list[dict]) -> dict[str, list[str]]:
    """{spec id: [ids it depends on]} for the slate. Deps may name ids outside the slate."""
    return {_row_id(row): parse_depends_on(row.get("depends_on")) for row in slate_rows}


def _dependency_gaps_by_spec(slate_rows: list[dict], all_rows_by_id: dict[str, dict] | None) -> dict[str, list[str]]:
    graph = dependency_graph(slate_rows)
    known = all_rows_by_id if all_rows_by_id is not None else {_row_id(r): r for r in slate_rows}
    gaps: dict[str, list[str]] = {sid: [] for sid in graph}

    for cycle in detect_cycles(graph):
        msg = "dependency cycle: " + " -> ".join(cycle)
        for sid in set(cycle):
            if sid in gaps and msg not in gaps[sid]:
                gaps[sid].append(msg)

    for sid, deps in graph.items():
        for dep in deps:
            if dep in graph:
                continue  # inside the slate — ordering handles it
            other = known.get(dep)
            if other is None:
                gaps[sid].append(f"depends on {dep}, which is not a known spec")
            elif str(other.get("status", "")).strip().lower() != "merged":
                status = str(other.get("status", "")).strip().lower() or "unknown"
                gaps[sid].append(f"depends on {dep} (status {status}), which is outside the slate and not merged")
    return gaps


def dependency_gaps(slate_rows: list[dict], all_rows_by_id: dict[str, dict] | None = None) -> list[str]:
    """Flat, per-spec-prefixed list of dependency gaps: cycles, unknown ids, unmerged deps outside the slate."""
    out: list[str] = []
    for sid, msgs in _dependency_gaps_by_spec(slate_rows, all_rows_by_id).items():
        out.extend(f"{sid}: {m}" for m in msgs)
    return out


# --- Build order (D7) and next up ---------------------------------------------------------------

def _dependents(graph: dict[str, list[str]]) -> dict[str, set[str]]:
    """{id: set of slate ids that (transitively) depend on it} — what each spec unblocks."""
    direct: dict[str, set[str]] = {sid: set() for sid in graph}
    for sid, deps in graph.items():
        for dep in deps:
            if dep in direct:
                direct[dep].add(sid)

    out: dict[str, set[str]] = {}
    for sid in graph:
        seen: set[str] = set()
        stack = list(direct[sid])
        while stack:
            n = stack.pop()
            if n in seen or n == sid:
                continue
            seen.add(n)
            stack.extend(direct.get(n, ()))
        out[sid] = seen
    return out


def build_order(slate_rows: list[dict]) -> list[str]:
    """Advisory order: dependencies first, then the spec that unblocks the most others, then
    HIGH → MEDIUM → LOW (the longest checking ladder starts first), then spec id.

    check_dependencies.topological_sort is the base: it decides whether an order exists at all.
    The tie-breaks are applied as a priority Kahn walk over the same graph. On a cycle the walk
    goes as far as it can and the stuck remainder is appended by the same key — the cycle itself
    is reported by dependency_gaps(), not hidden here.
    """
    graph = dependency_graph(slate_rows)
    if not graph:
        return []
    rows = {_row_id(r): r for r in slate_rows}
    unblocks = _dependents(graph)

    def key(sid: str):
        tier = rm.normalize_tier(rows[sid].get("risk"))
        return (-len(unblocks[sid]), _TIER_RANK.get(tier, len(_TIER_RANK)), sid)

    in_deg = {sid: sum(1 for d in deps if d in graph) for sid, deps in graph.items()}
    dependents_direct: dict[str, list[str]] = {sid: [] for sid in graph}
    for sid, deps in graph.items():
        for d in deps:
            if d in graph:
                dependents_direct[d].append(sid)

    ready = sorted((sid for sid, deg in in_deg.items() if deg == 0), key=key)
    order: list[str] = []
    while ready:
        sid = ready.pop(0)
        order.append(sid)
        for n in dependents_direct[sid]:
            in_deg[n] -= 1
            if in_deg[n] == 0:
                ready.append(n)
        ready.sort(key=key)

    if topological_sort(graph) is None or len(order) != len(graph):
        stuck = sorted((sid for sid in graph if sid not in order), key=key)
        order.extend(stuck)
    return order


def _deps_merged(row: dict, all_rows_by_id: dict[str, dict]) -> bool:
    for dep in parse_depends_on(row.get("depends_on")):
        other = all_rows_by_id.get(dep)
        if other is None or str(other.get("status", "")).strip().lower() != "merged":
            return False
    return True


def next_up(order: list[str], slate_rows: list[dict], all_rows_by_id: dict[str, dict],
            wip_cap: int | None = None) -> str | None:
    """The first spec in `order` that is READY (DoR), status ready, with every dependency merged —
    and only when in-flight work is under the WIP cap (if a cap is given). Advisory; None if nothing."""
    if wip_cap is not None:
        in_flight = sum(1 for r in all_rows_by_id.values() if str(r.get("status", "")).strip().lower() == "in-flight")
        if in_flight >= int(wip_cap):
            return None
    rows = {_row_id(r): r for r in slate_rows}
    for sid in order:
        row = rows.get(sid)
        if row is None:
            continue
        if str(row.get("dor", "")).upper() != "READY":
            continue
        if str(row.get("status", "")).strip().lower() != "ready":
            continue
        if not _deps_merged(row, all_rows_by_id):
            continue
        return sid
    return None


# --- The ready rule (D3) ----------------------------------------------------------------------

def spec_gaps(row: dict) -> list[str]:
    """Per-spec gaps against the ready rule, dependency gaps excluded (see ready_gaps)."""
    gaps: list[str] = []
    dor = str(row.get("dor", "unknown") or "unknown")
    if dor.upper() != "READY":
        blocking = [str(m) for m in (row.get("dor_blocking") or [])]
        detail = f" ({'; '.join(blocking)})" if blocking else ""
        gaps.append(f"DoR: {dor}{detail}")
    # "At least ready": a spec that is already in-flight or merged is past the bar, not short of it —
    # otherwise a spec that merges early (or a closed sprint's kept specs) reads as a readiness gap.
    status = str(row.get("status", "")).strip().lower() or "unknown"
    if status not in AT_LEAST_READY_STATUSES:
        gaps.append(f"status is {status}, not ready")
    eng = normalize_review(row.get("eng_review"))
    if eng != "accepted":
        gaps.append(f"eng_review is {eng or 'not recorded'}, needs accepted")
    data = normalize_review(row.get("data_review"))
    if data not in ("accepted", "n-a"):
        gaps.append(f"data_review is {data or 'not recorded'}, needs accepted or n-a")
    return gaps


def ready_gaps(slate_rows: list[dict], all_rows_by_id: dict[str, dict] | None = None) -> list[dict]:
    """[{'spec': id, 'gaps': [...]}] for every slated spec that is not ready. Empty list == the sprint may be readied.

    Conjunctive by design: every slated spec must be DoR READY, status ready, eng accepted, data
    accepted-or-n-a, AND free of dependency gaps (cycle, unknown id, unmerged dep outside the slate).
    An empty slate is itself a gap — there is nothing to commit to.
    """
    if not slate_rows:
        return [{"spec": "", "gaps": ["the slate is empty — nothing to ready"]}]
    dep_gaps = _dependency_gaps_by_spec(slate_rows, all_rows_by_id)
    out: list[dict] = []
    for row in sorted(slate_rows, key=_row_id):
        sid = _row_id(row)
        gaps = spec_gaps(row) + dep_gaps.get(sid, [])
        if gaps:
            out.append({"spec": sid, "gaps": gaps})
    return out


# --- Close (R4) -------------------------------------------------------------------------------

def outcomes(slate_rows: list[dict]) -> dict[str, list[str]]:
    """{'kept': [ids with status merged], 'open': [every other slated id]} — this sprint only."""
    kept = sorted(_row_id(r) for r in slate_rows if str(r.get("status", "")).strip().lower() == "merged")
    open_ = sorted(_row_id(r) for r in slate_rows if str(r.get("status", "")).strip().lower() != "merged")
    return {"kept": kept, "open": open_}


# --- Frontmatter writer rules -------------------------------------------------------------------

def validate_frontmatter_value(value) -> str:
    """The exact string a writer may put after `key:`. ValueError otherwise.

    Refuses '#' (parse_frontmatter truncates at it), quotes (stripped, so they would be silently
    lost), newlines (would break the block), and anything PLACEHOLDER_RE matches (would fail the DoR).
    """
    if value is None:
        value = ""
    if not isinstance(value, str):
        value = str(value)
    for ch in _FORBIDDEN_VALUE_CHARS:
        if ch in value:
            name = {"#": "'#'", '"': "double quote", "'": "single quote", "\n": "newline", "\r": "carriage return"}[ch]
            raise ValueError(f"frontmatter value {value!r} contains a {name}; only names, enumerations and spec ids are allowed")
    if PLACEHOLDER_RE.search(value):
        raise ValueError(f"frontmatter value {value!r} matches a placeholder token (TODO/TBD/NNNN/...)")
    return value.strip()


def set_frontmatter(text: str, key: str, value) -> str:
    """Return `text` with `key: "value"` set in the frontmatter block; the body is byte-identical.

    Replaces an existing `key:` line (preserving a trailing `# comment`), else inserts after the
    `status:` line, else right after the opening `---`. Only SPEC_KEYS may be written — `status`
    stays hand-moved. ValueError on a missing frontmatter block or a refused value.
    """
    if key not in SPEC_KEYS:
        raise ValueError(f"key '{key}' is not one of the sprint layer's keys ({', '.join(SPEC_KEYS)})")
    clean = validate_frontmatter_value(value)
    if not text.startswith("---"):
        raise ValueError("no frontmatter block (text does not start with ---)")
    end = text.find("\n---", 3)
    if end == -1:
        raise ValueError("no frontmatter block (opening --- never closed)")

    head, tail = text[:end], text[end:]
    lines = head.split("\n")  # lines[0] == "---" (possibly with trailing \r)
    new_line = f'{key}: "{clean}"'
    key_re = re.compile(rf"^{re.escape(key)}\s*:")
    status_re = re.compile(r"^status\s*:")

    for i, line in enumerate(lines[1:], start=1):
        if key_re.match(line):
            comment = ""
            if "#" in line:
                comment_idx = line.index("#")
                comment = "  " + line[comment_idx:].rstrip("\r")
            lines[i] = new_line + comment
            return "\n".join(lines) + tail

    insert_at = 1
    for i, line in enumerate(lines[1:], start=1):
        if status_re.match(line):
            insert_at = i + 1
            break
    lines.insert(insert_at, new_line)
    return "\n".join(lines) + tail


# --- Time adapters (business days, "no data" honest) --------------------------------------------

def ts_to_date(ts) -> date | None:
    """A ledger 'ts' (full ISO, '+00:00' or 'Z') or a bare ISO date -> the UTC calendar date. None if unparseable."""
    if ts is None:
        return None
    if isinstance(ts, datetime):
        dt = ts
    elif isinstance(ts, date):
        return ts
    else:
        s = str(ts).strip()
        if not s:
            return None
        if s.endswith("Z") or s.endswith("z"):
            s = s[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(s)
        except ValueError:
            return parse_iso_date(s)
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc)
    return dt.date()


def business_days_since(ts, today) -> int | None:
    """Business days from a ledger timestamp to `today`; None ("no data") if the timestamp is missing or garbage."""
    start = ts_to_date(ts)
    end = ts_to_date(today)
    if start is None or end is None:
        return None
    return business_days_elapsed(start, end)


def default_end(start, days: int = 10) -> date | None:
    """The sprint end date: the LAST business day of a `days`-business-day window that starts on
    `start` (D2 default 10). `start` counts as day 1, so Mon 2026-09-28 -> Fri 2026-10-09, and the
    window is inclusive on both ends. None if start is unparseable."""
    s = ts_to_date(start)
    if s is None:
        return None
    return add_business_days(s, max(int(days), 1) - 1)


def sprint_days(start, end, today) -> dict:
    """{'total', 'elapsed', 'remaining'} in business days over the inclusive window [start, end].
    All None when start or end is missing/garbage.

    total counts start and end both (Mon 09-28 -> Fri 10-09 is 10); elapsed is the number of business
    days completed before `today` (clamped to [0, total]) so on the last day remaining reads 1, not 0;
    remaining = total - elapsed. Never a fabricated 0.
    """
    s, e, t = ts_to_date(start), ts_to_date(end), ts_to_date(today)
    if s is None or e is None:
        return {"total": None, "elapsed": None, "remaining": None}
    total = business_days_elapsed(s, e) + (1 if s.weekday() < 5 else 0)
    if t is None:
        return {"total": total, "elapsed": None, "remaining": None}
    elapsed = min(max(business_days_elapsed(s, t), 0), total)
    return {"total": total, "elapsed": elapsed, "remaining": total - elapsed}


# --- Ledger-derived slate (closed sprints) ---------------------------------------------------------

def slate_ids_from_ledger(ledger: list[dict], sprint_id: str) -> list[str]:
    """The spec ids that were in `sprint_id`'s slate when it closed, replayed from the ledger.

    `close` rewrites carried specs' `sprint:` to the next sprint and clears dropped ones, so after
    close the frontmatter no longer names the slate that was reviewed. The ledger does: replay
    `slated` (add) and `unslated` (remove) in timestamp order, then add every spec that `close`
    recorded as `carried` or `dropped` for this sprint (it was necessarily slated). Sorted ids;
    empty when the ledger has nothing for the sprint (the caller reads that as "no data").
    """
    sid = str(sprint_id or "")
    if not sid:
        return []
    events = sorted((e for e in ledger if isinstance(e, dict) and str(e.get("sprint", "")) == sid),
                    key=lambda e: str(e.get("ts", "")))
    ids: list[str] = []
    for e in events:
        spec = str(e.get("spec", "") or "")
        if not spec:
            continue
        ev = e.get("event")
        if ev == "slated" and spec not in ids:
            ids.append(spec)
        elif ev == "unslated" and spec in ids:
            ids.remove(spec)
    for e in events:
        spec = str(e.get("spec", "") or "")
        if spec and e.get("event") in ("carried", "dropped") and spec not in ids:
            ids.append(spec)
    return sorted(ids)


# --- Ledger entries ---------------------------------------------------------------------------

def event_entry(ts: str, event: str, **fields) -> dict:
    """One sprint-log line: {'ts', 'event', **fields}. ValueError on an unknown event or a forbidden field.

    `ts` is the caller's (datetime.now(timezone.utc).isoformat() in the CLI); nothing is minted here.
    A field whose key is an activity metric (FORBIDDEN_FIELDS) is refused with the standard's wording.
    """
    if event not in EVENTS:
        raise ValueError(f"unknown sprint event '{event}'. Known: {', '.join(EVENTS)}")
    for k in fields:
        if is_forbidden_field(k):
            raise ValueError(forbidden_field_message(k))
    entry = {"ts": ts, "event": event}
    entry.update(fields)
    return entry
