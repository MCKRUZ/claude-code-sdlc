"""sprint.py — The I/O CLI of the sprint team layer: create, slate, ready, run, and close a sprint.

A sprint is a *commitment window over the backlog order* — never a second backlog, never a gate,
never a velocity chart. A named human types a sprint id (S07), slates a *count* of specs by a mix
of risk tiers, readies the sprint once every slated spec clears the Definition of Ready and its
Engineering and Data verdicts, and closes it with kept / carried / dropped, each with a name and a
reason. Every rule lives in sprint_model.py (pure); this file only reads and writes files.

What it reads
  - specs/*.md whose basename matches new_spec.SPEC_FILE_RE (^\\d{4}-) — the installed
    specs/spec-template.md is never listed and never written. Frontmatter via
    check_spec.parse_frontmatter; the DoR verdict via check_spec.check_spec_text.
  - .sdlc/sprints/SNN.md (the sprint record), .sdlc/metrics/sprint-log.jsonl (the ledger),
    .sdlc/decision-log.md (or <repo>/decision-log.md) through track_decisions.
What it writes
  - Spec frontmatter: ONLY the five sprint keys (sprint, next_owner, eng_review, data_review,
    depends_on), inserted after `status:` on first use. `status` stays hand-moved — this script
    cannot write it (sprint_model.set_frontmatter refuses).
  - The sprint record (state, readied_by, closed_by, the rendered ## Slate and ## Close tables).
  - The ledger, append-only. Frontmatter first, then the ledger line; if the ledger append fails
    the script prints DRIFT and exits 1 so the mismatch is never silent.
  - Never .sdlc/state.yaml.

Exit codes
  reads  (status, slate proposal, list, log)               0 always — an unknown or malformed sprint
                                                           id prints "no data", never an error
  writes (new, slate, unslate, handoff, ack, verdict, ready, close, carry, edit) — every one carries --by <name>
         0 ok · 1 illegal / missing precondition / unknown spec / ready gap
         2 refused — an activity-metric field (velocity, points, estimate, effort, hours, ...),
           a malformed frontmatter value ('#', quotes, newline, placeholder token), or an AI
           name where a human's is required.
  plan   0 rendered · 1 the sprint does not exist

Metrics policy: no per-person aggregation exists in any output; empty series read "no data",
never 0; FORBIDDEN_FIELDS are refused with the same wording scorecard.py uses.

Standalone or Workflow (CLAUDE.md design rule):
  - Standalone: --repo <path>              sprints and ledger under <repo>/.sdlc/ (created);
                                           the header notes the missing engagement context
  - Workflow:   --state .sdlc/state.yaml   repo root = the directory containing .sdlc/
Workflow mode is detected by the presence of state.yaml, never by a bare .sdlc/ directory.
`--help` (for the script and every verb) does no filesystem work and exits 0 from any cwd.
"""

import argparse
import json
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import risk_model as rm  # noqa: E402
import sprint_model as sm  # noqa: E402
import track_decisions as td  # noqa: E402
from check_spec import check_spec_text, parse_frontmatter  # noqa: E402
from findings_model import is_ai_actor  # noqa: E402
from new_spec import SPEC_FILE_RE  # noqa: E402

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_PATH = PLUGIN_ROOT / "templates" / "phases" / "build" / "sprint.md"

NO_DATA = "no data"
READY_WHEN = "ready when: every slated spec READY + status ready + eng accepted + data accepted|n-a"
WRITE_VERBS = ("new", "slate", "unslate", "handoff", "ack", "verdict", "ready", "close", "carry", "edit")

# Sprint-record keys written bare (not quoted) so parse_frontmatter and humans read them alike.
_BARE_SPRINT_KEYS = ("state", "target")
_SPRINT_NUM_RE = re.compile(r"^S(\d+)$")
_WIP_CAP_RE = re.compile(r"wip cap.*?\*\*\s*(\d+)\s*\*\*", re.IGNORECASE)


class Refused(Exception):
    """Exit 2: a forbidden metric field, a malformed frontmatter value, or an AI actor name."""


class Illegal(Exception):
    """Exit 1: an illegal operation, a missing precondition, an unknown spec, or a ready gap."""


# --- Paths ----------------------------------------------------------------------------------------

def sprints_dir(repo_root: Path) -> Path:
    return repo_root / ".sdlc" / "sprints"


def sprint_file(repo_root: Path, sprint_id: str) -> Path:
    return sprints_dir(repo_root) / f"{sprint_id}.md"


def ledger_path(repo_root: Path) -> Path:
    return repo_root / ".sdlc" / "metrics" / "sprint-log.jsonl"


def specs_dir(repo_root: Path) -> Path:
    return repo_root / "specs"


def is_workflow(repo_root: Path) -> bool:
    """Workflow mode iff .sdlc/state.yaml exists — a bare .sdlc/ directory does not count."""
    return (repo_root / ".sdlc" / "state.yaml").is_file()


def decision_log_path(repo_root: Path) -> Path | None:
    for candidate in (repo_root / ".sdlc" / "decision-log.md", repo_root / "decision-log.md"):
        if candidate.is_file():
            return candidate
    return None


def resolve_repo_root(args) -> Path | None:
    """Repo root: parent of .sdlc/ from --state (None if the state file is missing), else --repo."""
    if getattr(args, "state", None):
        state_path = Path(args.state)
        if not state_path.is_file():
            return None
        return state_path.resolve().parent.parent
    return Path(getattr(args, "repo", None) or ".").resolve()


def now_ts() -> str:
    return datetime.now(timezone.utc).isoformat()


# --- Spec reading (only ^\d{4}- files) --------------------------------------------------------------

def list_spec_files(repo_root: Path) -> list[Path]:
    """Every specs/NNNN-*.md, sorted. The template (specs/spec-template.md) never matches."""
    d = specs_dir(repo_root)
    if not d.is_dir():
        return []
    return sorted(p for p in d.iterdir() if p.is_file() and p.suffix == ".md" and SPEC_FILE_RE.match(p.name))


def read_spec_text(path: Path) -> str:
    """Bytes-faithful read (no newline translation) so a rewrite leaves untouched bytes identical."""
    return path.read_bytes().decode("utf-8")


def write_spec_text(path: Path, text: str) -> None:
    path.write_bytes(text.encode("utf-8"))


def rel_path(repo_root: Path | None, path: Path) -> str:
    """The repo-relative POSIX path Studio shows and syncs by (e.g. "specs/0007-name.md"). Falls back
    to the path's last two parts when it does not sit under the repo root (it always does in practice)."""
    try:
        if repo_root is not None:
            return Path(path).resolve().relative_to(Path(repo_root).resolve()).as_posix()
    except ValueError:
        pass
    parts = Path(path).parts
    return "/".join(parts[-2:]) if len(parts) >= 2 else str(path)


def spec_row(path: Path, text: str, repo_root: Path | None = None) -> dict:
    """A slate row from one spec file: frontmatter fields, the parsed depends_on, and the DoR verdict."""
    fm, _body = parse_frontmatter(text)
    m = SPEC_FILE_RE.match(path.name)
    file_id = m.group(1) if m else path.stem
    raw_id = str(fm.get("spec", "") or "").strip()
    spec_id = raw_id if raw_id.isdigit() else file_id
    findings = check_spec_text(text)
    blocking = [f["message"] for f in findings if not f["passed"] and f["severity"] == "MUST"]
    return {
        "id": spec_id,
        "name": str(fm.get("name") or path.stem),
        "risk": rm.normalize_tier(fm.get("risk")) or "?",
        "type": str(fm.get("type") or ""),
        "channel": str(fm.get("channel") or ""),
        "status": str(fm.get("status") or "draft").strip().lower(),
        "sprint": str(fm.get("sprint") or "").strip(),
        "next_owner": str(fm.get("next_owner") or "").strip(),
        "eng_review": str(fm.get("eng_review") or "").strip(),
        "data_review": str(fm.get("data_review") or "").strip(),
        "depends_on": sm.parse_depends_on(fm.get("depends_on")),
        "dor": "NOT READY" if blocking else "READY",
        "dor_blocking": blocking,
        "path": str(path),
        "rel_path": rel_path(repo_root, path),
    }


def load_specs(repo_root: Path) -> list[dict]:
    rows = []
    for path in list_spec_files(repo_root):
        try:
            rows.append(spec_row(path, read_spec_text(path), repo_root))
        except UnicodeDecodeError:
            continue
    return sorted(rows, key=lambda r: r["id"])


def find_spec(rows: list[dict], spec_ref: str) -> dict | None:
    """A row by spec id ("0007"), by id without padding ("7"), or by file path/name."""
    ref = str(spec_ref or "").strip()
    if not ref:
        return None
    for r in rows:
        if r["id"] == ref:
            return r
    if ref.isdigit():
        padded = f"{int(ref):04d}"
        for r in rows:
            if r["id"] == padded:
                return r
    ref_path = Path(ref)
    for r in rows:
        p = Path(r["path"])
        if p.name == ref_path.name or p == ref_path.resolve():
            return r
    return None


def ensure_spec_keys(text: str) -> str:
    """Insert every sprint key that is missing (value "") after `status:` — in SPEC_KEYS order."""
    fm, _ = parse_frontmatter(text)
    for key in reversed(sm.SPEC_KEYS):  # each insert lands right after status:, so reverse keeps the order
        if key not in fm:
            text = sm.set_frontmatter(text, key, "")
    return text


def set_spec_key(text: str, key: str, value) -> str:
    """ensure_spec_keys + set one key. ValueError from the model becomes a Refused (exit 2)."""
    try:
        return sm.set_frontmatter(ensure_spec_keys(text), key, value)
    except ValueError as exc:
        raise Refused(f"Refused: {exc}") from None


# --- Sprint record --------------------------------------------------------------------------------

def _sprint_number(sprint_id: str) -> int:
    m = _SPRINT_NUM_RE.match(sprint_id)
    return int(m.group(1)) if m else -1


def list_sprint_ids(repo_root: Path) -> list[str]:
    d = sprints_dir(repo_root)
    if not d.is_dir():
        return []
    ids = [p.stem for p in d.glob("*.md") if sm.is_valid_sprint_id(p.stem)]
    return sorted(ids, key=_sprint_number)


def read_sprint(repo_root: Path, sprint_id: str) -> dict | None:
    """The sprint record as a flat dict (target as int or None). None if there is no such file."""
    path = sprint_file(repo_root, sprint_id)
    if not path.is_file():
        return None
    fm, _ = parse_frontmatter(read_spec_text(path))
    target_raw = str(fm.get("target", "") or "").strip()
    return {
        "id": sprint_id,
        "goal": str(fm.get("goal") or ""),
        "start": str(fm.get("start") or ""),
        "end": str(fm.get("end") or ""),
        "state": (str(fm.get("state") or "planning").strip().lower()),
        "target": int(target_raw) if target_raw.isdigit() else None,
        "mix": str(fm.get("mix") or ""),
        "board_ref": str(fm.get("board_ref") or ""),
        "readied_by": str(fm.get("readied_by") or ""),
        "closed_by": str(fm.get("closed_by") or ""),
        "created": str(fm.get("created") or ""),
        "path": str(path),
        "rel_path": f".sdlc/sprints/{sprint_id}.md",
    }


def active_sprint_id(repo_root: Path) -> str | None:
    """The sprint to default to: the highest-numbered non-closed sprint, else the highest overall."""
    ids = list_sprint_ids(repo_root)
    if not ids:
        return None
    open_ids = [s for s in ids if (read_sprint(repo_root, s) or {}).get("state") != "closed"]
    return (open_ids or ids)[-1]


def set_sprint_field(text: str, key: str, value) -> str:
    """Set `key` in the sprint record's frontmatter, keeping any trailing `# comment`. Refuses values
    parse_frontmatter would mangle ('#', quotes, newlines) or that read as placeholders."""
    try:
        clean = sm.validate_frontmatter_value(value)
    except ValueError as exc:
        raise Refused(f"Refused: {exc}") from None
    if not text.startswith("---"):
        raise Illegal("sprint record has no frontmatter block")
    end = text.find("\n---", 3)
    if end == -1:
        raise Illegal("sprint record frontmatter never closes")
    head, tail = text[:end], text[end:]
    lines = head.split("\n")
    rendered = f"{key}: {clean}" if key in _BARE_SPRINT_KEYS else f'{key}: "{clean}"'
    key_re = re.compile(rf"^{re.escape(key)}\s*:")
    for i, line in enumerate(lines[1:], start=1):
        if key_re.match(line):
            comment = ""
            if "#" in line:
                comment = "  " + line[line.index("#"):].rstrip("\r")
            lines[i] = rendered + comment
            return "\n".join(lines) + tail
    lines.append(rendered)
    return "\n".join(lines) + tail


def replace_section(text: str, heading: str, body_md: str) -> str:
    """Replace the content of `## heading` (keeping the HTML comment right under it) with body_md."""
    lines = text.split("\n")
    head_re = re.compile(rf"^##\s+{re.escape(heading)}\s*$", re.IGNORECASE)
    start = next((i for i, ln in enumerate(lines) if head_re.match(ln.rstrip("\r"))), None)
    if start is None:
        suffix = "" if text.endswith("\n") or not text else "\n"
        return text + f"{suffix}\n## {heading}\n{body_md.rstrip()}\n"
    end = len(lines)
    for j in range(start + 1, len(lines)):
        if lines[j].startswith("## "):
            end = j
            break
    keep = [lines[start]]
    k = start + 1
    in_comment = False
    while k < end:
        ln = lines[k]
        if in_comment or ln.lstrip().startswith("<!--"):
            keep.append(ln)
            in_comment = "-->" not in ln
            k += 1
            continue
        break
    new_block = keep + body_md.rstrip("\n").split("\n") + [""]
    return "\n".join(lines[:start] + new_block + lines[end:])


def _cell(value) -> str:
    s = str(value if value not in (None, "") else "—")
    return s.replace("|", "/").replace("\n", " ")


def render_slate_table(slate: list[dict]) -> str:
    if not slate:
        return NO_DATA
    lines = ["| spec | name | risk | type | status | DoR | eng | data | next owner |",
             "|---|---|---|---|---|---|---|---|---|"]
    for r in sorted(slate, key=lambda x: x["id"]):
        lines.append("| " + " | ".join(_cell(v) for v in (
            r["id"], r["name"], r["risk"], r["type"], r["status"], r["dor"],
            r["eng_review"] or "not recorded", r["data_review"] or "not recorded", r["next_owner"])) + " |")
    return "\n".join(lines)


def render_close_table(kept: list[str], carried: dict[str, str], dropped: dict[str, str],
                       carry_to: str | None, by: str) -> str:
    lines = ["| spec | outcome | by | reason |", "|---|---|---|---|"]
    for sid in kept:
        lines.append(f"| {sid} | kept | {_cell(by)} | merged |")
    for sid in sorted(carried):
        lines.append(f"| {sid} | carried → {carry_to} | {_cell(by)} | {_cell(carried[sid])} |")
    for sid in sorted(dropped):
        lines.append(f"| {sid} | dropped | {_cell(by)} | {_cell(dropped[sid])} |")
    if len(lines) == 2:
        return NO_DATA
    return "\n".join(lines)


# --- Ledger -----------------------------------------------------------------------------------------

def read_ledger_lines(repo_root: Path) -> tuple[list[dict], int]:
    """(entries, skipped): every parseable ledger line as its own dict, verbatim, plus how many
    lines were not JSON objects. Blank lines are neither entries nor skipped."""
    path = ledger_path(repo_root)
    if not path.is_file():
        return [], 0
    out: list[dict] = []
    skipped = 0
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            skipped += 1
            continue
        if isinstance(entry, dict):
            out.append(entry)
        else:
            skipped += 1
    return out, skipped


def read_ledger(repo_root: Path) -> list[dict]:
    return read_ledger_lines(repo_root)[0]


def latest_event_ts(ledger: list[dict], event: str, spec_id: str, sprint_id: str | None = None) -> str | None:
    ts = None
    for e in ledger:
        if e.get("event") != event or str(e.get("spec", "")) != spec_id:
            continue
        if sprint_id is not None and str(e.get("sprint", "")) != sprint_id:
            continue
        if ts is None or str(e.get("ts", "")) > ts:
            ts = str(e.get("ts", ""))
    return ts


def commit(repo_root: Path, writes: list[tuple[Path, str]], events: list[dict]) -> None:
    """Frontmatter/record writes first, then the ledger lines. A failed append prints DRIFT, exit 1."""
    for path, text in writes:
        path.parent.mkdir(parents=True, exist_ok=True)
        write_spec_text(path, text)
    if not events:
        return
    path = ledger_path(repo_root)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            for e in events:
                f.write(json.dumps(e) + "\n")
    except OSError as exc:
        print(f"DRIFT: {len(writes)} file(s) were written but the ledger append failed ({path}): {exc}")
        print("       The frontmatter now disagrees with the ledger — re-run the verb once the path is writable.")
        sys.exit(1)


def make_event(event: str, extras: dict, **fields) -> dict:
    """A ledger line; refuses forbidden (activity-metric) fields with exit 2."""
    merged = dict(extras)
    merged.update({k: v for k, v in fields.items() if v is not None})
    try:
        return sm.event_entry(now_ts(), event, **merged)
    except ValueError as exc:
        raise Refused(str(exc)) from None


def parse_extra_fields(pairs: list[str] | None) -> dict:
    """--field key=value pairs; activity-metric keys are refused (exit 2), malformed pairs exit 1."""
    out: dict = {}
    for raw in pairs or []:
        if "=" not in raw:
            raise Illegal(f"--field expects key=value (got '{raw}')")
        key, _, value = raw.partition("=")
        key = key.strip()
        if not key:
            raise Illegal(f"--field expects key=value (got '{raw}')")
        if sm.is_forbidden_field(key):
            raise Refused(sm.forbidden_field_message(key))
        out[key] = value.strip()
    return out


def require_human(name, flag: str) -> str:
    """A named human for --by / --to. Refuses an AI name — honestly labelled as a label, not a lock."""
    clean = str(name or "").strip()
    if not clean:
        raise Illegal(f"{flag} is required on a write — a named human, not a role or a blank")
    if is_ai_actor(clean):
        raise Refused(f"Refused: {flag} '{clean}' reads as an AI/automation, not a named human. "
                      "The sprint layer records who is accountable; an agent may not be that name. "
                      "(This is labelling, not enforcement — it cannot verify identity, only refuse the obvious.)")
    return clean


# --- The view (status --json) ------------------------------------------------------------------------

def cadence_wip_cap(repo_root: Path) -> int | None:
    """The WIP cap from the first .sdlc/artifacts/*/cadence-plan.md that states one as **N**. None if unset."""
    artifacts = repo_root / ".sdlc" / "artifacts"
    if not artifacts.is_dir():
        return None
    for plan in sorted(artifacts.glob("*/cadence-plan.md")):
        for line in plan.read_text(encoding="utf-8", errors="replace").splitlines():
            m = _WIP_CAP_RE.search(line)
            if m:
                return int(m.group(1))
        return None
    return None


def _is_pending(value) -> bool:
    return sm.normalize_review(value) not in ("accepted", "returned", "n-a")


def decisions_view(repo_root: Path, today: date) -> dict | None:
    path = decision_log_path(repo_root)
    if path is None:
        return None
    summary = td.summarize(td.parse_decisions(path), today)
    overdue = [{"id": d.get("id", ""), "decision": d.get("decision", ""), "owner": d.get("owner", ""),
                "due": d.get("clock_due") or d.get("due") or ""} for d in summary["overdue_decisions"]]
    return {"open": summary["open"], "overdue": overdue}


def empty_view(note: str) -> dict:
    """The one JSON document `status --json` prints when there is nothing to read (a malformed
    --sprint): every key of a real view, empty, `has_data` false and `note` saying why. Studio and
    scripts parse exactly one document either way — never prose where JSON was asked for."""
    return {
        "sprint": None, "slate": [],
        "readiness": {"ready": 0, "total": 0, "gaps": []},
        "verdicts_pending": [], "handoffs_open": [], "mix": {}, "mix_warnings": [],
        "wip": {"in_flight": 0, "cap": None},
        "build_order": [], "next_up": None, "dependency_gaps": [], "decisions": None, "carried_in": [],
        "has_data": False, "note": note,
    }


def _no_sprint_note(repo_root: Path, requested: str | None) -> str:
    if requested:
        return f"sprint {requested} does not exist ({sprint_file(repo_root, requested)}) — run `new` first"
    return f"no sprint record under {sprints_dir(repo_root)} — create one with `sprint.py new`"


def build_view(repo_root: Path, sprint_id: str | None, today: date | None = None,
               wip_cap: int | None = None) -> dict:
    """The sprint status as one dict — exactly the JSON `status --json` prints. When there is no
    sprint to read (none exists, or the one named does not) the document carries a `note` saying why."""
    repo_root = Path(repo_root).resolve()
    today = today or date.today()
    requested = sprint_id
    if sprint_id is None:
        sprint_id = active_sprint_id(repo_root)
    sprint = read_sprint(repo_root, sprint_id) if sprint_id else None
    all_rows = load_specs(repo_root)
    by_id = {r["id"]: r for r in all_rows}
    slate = [r for r in all_rows if sprint_id and r["sprint"] == sprint_id] if sprint else []
    ledger = read_ledger(repo_root)
    if sprint is not None and sprint.get("state") == "closed":
        # After close the frontmatter no longer names the reviewed slate (carried specs moved on,
        # dropped ones were cleared) — the ledger does. Replay it so a closed sprint stays honest.
        have = {r["id"] for r in slate}
        for spec_id in sm.slate_ids_from_ledger(ledger, sprint_id):
            if spec_id in by_id and spec_id not in have:
                slate.append(by_id[spec_id])
                have.add(spec_id)
        slate.sort(key=lambda r: r["id"])

    if sprint is not None:
        sprint = dict(sprint)
        sprint["days"] = sm.sprint_days(sprint["start"], sprint["end"], today)
        try:
            mix = sm.parse_mix(sprint["mix"])
        except ValueError:
            mix = {}
        target = sprint["target"]
    else:
        mix, target = {}, None

    gaps = sm.ready_gaps(slate, by_id) if slate else []
    verdicts_pending = []
    for r in slate:
        for lane in sm.LANES:
            if _is_pending(r[f"{lane}_review"]):
                since = latest_event_ts(ledger, "slated", r["id"], sprint_id)
                verdicts_pending.append({"spec": r["id"], "lane": lane,
                                         "since_business_days": sm.business_days_since(since, today)})
    handoffs_open = []
    for r in slate:
        if r["next_owner"]:
            since = latest_event_ts(ledger, "handoff", r["id"])
            handoffs_open.append({"spec": r["id"], "to": r["next_owner"],
                                  "since_business_days": sm.business_days_since(since, today)})

    cap = wip_cap if wip_cap is not None else cadence_wip_cap(repo_root)
    order = sm.build_order(slate)
    carried_in = [{"spec": str(e.get("spec", "")), "from_sprint": str(e.get("sprint", "")),
                   "reason": str(e.get("reason", ""))}
                  for e in ledger if e.get("event") == "carried" and str(e.get("to_sprint", "")) == (sprint_id or "")]

    return {
        "sprint": sprint,
        "slate": slate,
        "readiness": {"ready": len(slate) - len(gaps), "total": len(slate), "gaps": gaps},
        "verdicts_pending": verdicts_pending,
        "handoffs_open": handoffs_open,
        "mix": sm.mix_status(slate, mix),
        "mix_warnings": sm.mix_warnings(slate, mix, target) if slate else [],
        "wip": {"in_flight": sum(1 for r in all_rows if r["status"] == "in-flight"), "cap": cap},
        "build_order": order,
        "next_up": sm.next_up(order, slate, by_id, cap),
        "dependency_gaps": sm.dependency_gaps(slate, by_id) if slate else [],
        "decisions": decisions_view(repo_root, today),
        "carried_in": carried_in,
        "has_data": bool(slate),
        **({"note": _no_sprint_note(repo_root, requested)} if sprint is None else {}),
    }


# --- Text rendering of the view --------------------------------------------------------------------------

def _bd(n) -> str:
    return NO_DATA if n is None else f"{n} business day{'s' if n != 1 else ''}"


def format_status(view: dict, repo_root: Path) -> str:
    sprint = view.get("sprint")
    lines: list[str] = []
    if sprint is None:
        lines.append(f"Sprint: {NO_DATA} — no sprint record under {sprints_dir(repo_root)}")
        lines.append("  Create one: sprint.py new --sprint S01 --goal \"...\" --start YYYY-MM-DD --target N --mix HIGH:1,MEDIUM:2,LOW:3")
        if not is_workflow(repo_root):
            lines.append("  (standalone mode — no .sdlc/state.yaml; engagement context not shown)")
        return "\n".join(lines)

    goal = f' — "{sprint["goal"]}"' if sprint.get("goal") else ""
    lines.append(f"Sprint {sprint['id']}{goal}")
    mix_text = sprint.get("mix").replace(",", " ") if sprint.get("mix") else "no mix set"
    target = sprint.get("target")
    days = sprint.get("days") or {}
    closed = sprint.get("state") == "closed"
    if closed:
        remaining = f" · closed by {sprint['closed_by']}" if sprint.get("closed_by") else ""
    else:
        remaining = "" if days.get("remaining") is None else f" · {days['remaining']} business days remaining"
    lines.append(f"{sprint['state']} · {sprint['start'] or '?'} → {sprint['end'] or '?'} · "
                 f"target {NO_DATA if target is None else target} · mix {mix_text}{remaining}")
    if sprint.get("board_ref"):
        lines.append(f"board: {sprint['board_ref']} (manual mapping only)")
    if not is_workflow(repo_root):
        lines.append("(standalone mode — no .sdlc/state.yaml; engagement context not shown)")
    lines.append("")

    slate = view.get("slate") or []
    lines.append("Slate")
    if not slate and closed:
        lines.append(f"  {NO_DATA} — closed; see .sdlc/reports/sprint-{sprint['id']}-review.html. "
                     "Start the next sprint with sprint.py new")
    elif not slate:
        lines.append(f"  {NO_DATA} — nothing slated. Propose a slate: sprint.py slate --sprint {sprint['id']}")
    else:
        headers = ["spec", "name", "risk", "type", "status", "DoR", "eng", "data", "next owner"]
        rows = [[r["id"], r["name"], r["risk"], r["type"] or "—", r["status"], r["dor"], r["eng_review"] or "—",
                 r["data_review"] or "—", r["next_owner"] or "—"] for r in sorted(slate, key=lambda x: x["id"])]
        widths = [max(len(h), *(len(str(row[i])) for row in rows)) for i, h in enumerate(headers)]
        lines.append("  " + "  ".join(h.ljust(widths[i]) for i, h in enumerate(headers)))
        for row in rows:
            lines.append("  " + "  ".join(str(c).ljust(widths[i]) for i, c in enumerate(row)))
    lines.append("")

    rd = view.get("readiness") or {}
    if not slate:
        lines.append(f"Readiness   {NO_DATA}")
    else:
        not_ready = rd.get("gaps") or []
        lines.append(f"Readiness   {rd.get('ready')} of {rd.get('total')} ready · {len(not_ready)} with gaps")
        for g in not_ready:
            lines.append(f"  {g['spec']}: " + "; ".join(g["gaps"]))

    pending = view.get("verdicts_pending") or []
    if not pending:
        lines.append(f"Verdicts    {NO_DATA if not slate else 'none pending'}")
    else:
        lines.append(f"Verdicts    {len(pending)} pending — " +
                     ", ".join(f"{p['spec']} {p['lane']} ({_bd(p['since_business_days'])})" for p in pending))

    handoffs = view.get("handoffs_open") or []
    if not handoffs:
        lines.append(f"Handoffs    {NO_DATA if not slate else 'none unacknowledged'}")
    else:
        lines.append(f"Handoffs    {len(handoffs)} unacknowledged — " +
                     ", ".join(f"{h['spec']} → {h['to']} ({_bd(h['since_business_days'])})" for h in handoffs))

    mix = view.get("mix") or {}
    if not mix:
        lines.append(f"Mix         {NO_DATA}")
    else:
        cells = []
        for tier in rm.RISK_TIERS:
            if tier in mix:
                tgt = mix[tier]["target"]
                cells.append(f"{tier} {mix[tier]['actual']}/{'no target' if tgt is None else tgt}")
        lines.append("Mix         " + " · ".join(cells))
    for w in view.get("mix_warnings") or []:
        lines.append(f"  WARNING: {w}")

    wip = view.get("wip") or {}
    cap = wip.get("cap")
    lines.append(f"WIP         {wip.get('in_flight', NO_DATA)} in-flight · cap {'not set' if cap is None else cap}")

    decisions = view.get("decisions")
    if decisions is None:
        lines.append(f"Decisions   {NO_DATA} — no decision-log")
    else:
        overdue = decisions.get("overdue") or []
        text = f"{decisions.get('open')} open"
        if overdue:
            text += " · overdue: " + ", ".join(
                f"{d['id']} (owner: {d['owner'] or 'no owner'}, due {d['due'] or '?'})" for d in overdue)
        lines.append(f"Decisions   {text}")

    for gap in view.get("dependency_gaps") or []:
        lines.append(f"  WARNING: dependency gap — {gap}")

    order = view.get("build_order") or []
    lines.append(f"Build order {' → '.join(order) if order else NO_DATA}"
                 + ("  (deps, then unblocks-most, then HIGH→LOW, then id)" if order else ""))
    nxt = view.get("next_up")
    if nxt:
        cap_text = f", WIP {wip.get('in_flight')} of {cap}" if cap is not None else ""
        lines.append(f"Next up     {nxt} — READY, dependencies merged{cap_text}")
    else:
        why = "no data" if not slate else "no slated spec is READY with merged dependencies inside the WIP cap"
        lines.append(f"Next up     {why}")
    lines.append("")
    lines.append(READY_WHEN)
    return "\n".join(lines)


# --- Rendering the HTML pages (lazy import — generate_sprint_report imports build_view from here) ------

def _render_page(repo_root: Path, sprint_id: str, kind: str, today: date | None, output: Path | None = None,
                 view: dict | None = None) -> Path:
    """`view` lets a caller render a view it computed BEFORE its own writes (close does this, so the
    review page shows the slate that was reviewed, not the frontmatter after carries moved on)."""
    import generate_sprint_report  # noqa: PLC0415 — lazy on purpose (circular import otherwise)
    return generate_sprint_report.generate(repo_root, sprint_id, kind=kind, output=output, today=today, view=view)


def _render_or_warn(repo_root: Path, sprint_id: str, kind: str, today: date | None,
                    view: dict | None = None) -> None:
    try:
        out = _render_page(repo_root, sprint_id, kind, today, view=view)
        print(f"{kind.capitalize()} page written to: {out}")
    except Exception as exc:  # noqa: BLE001 — the write already succeeded; the page is a courtesy
        print(f"WARNING: {kind} page not rendered ({type(exc).__name__}: {exc}). "
              f"Re-render with: sprint.py plan --sprint {sprint_id}")


# --- Verbs -------------------------------------------------------------------------------------------------

def _need_sprint(repo_root: Path, sprint_id: str | None, verb: str) -> dict:
    sid = sprint_id or active_sprint_id(repo_root)
    if not sid:
        raise Illegal(f"{verb}: no sprint given and none found under {sprints_dir(repo_root)} — run `new` first")
    if not sm.is_valid_sprint_id(sid):
        raise Illegal(f"'{sid}' is not a sprint id (expected S07, S12, ...)")
    sprint = read_sprint(repo_root, sid)
    if sprint is None:
        raise Illegal(f"sprint {sid} does not exist ({sprint_file(repo_root, sid)}) — run `new` first")
    return sprint


def _need_spec(rows: list[dict], spec_ref: str) -> dict:
    row = find_spec(rows, spec_ref)
    if row is None:
        raise Illegal(f"unknown spec '{spec_ref}' — no specs/NNNN-*.md carries that id")
    return row


def _today(args) -> date | None:
    raw = getattr(args, "today", None)
    if not raw:
        return None
    d = sm.ts_to_date(raw)
    if d is None:
        raise Illegal(f"--today must be an ISO date (got '{raw}')")
    return d


def cmd_new(args, repo_root: Path) -> int:
    sid = str(args.sprint).strip()
    if not sm.is_valid_sprint_id(sid):
        raise Illegal(f"'{sid}' is not a sprint id (expected S07, S12, ... — matching ^S\\d{{2,}}$)")
    if sprint_file(repo_root, sid).exists():
        raise Illegal(f"sprint {sid} already exists: {sprint_file(repo_root, sid)} (one record per id)")
    if args.target < 1:
        raise Illegal(f"--target must be a positive count of specs (got {args.target})")
    try:
        mix = sm.parse_mix(args.mix, target=args.target)
    except ValueError as exc:
        raise Illegal(f"--mix: {exc}") from None
    start = sm.ts_to_date(args.start)
    if start is None:
        raise Illegal(f"--start must be an ISO date (got '{args.start}')")
    if args.end:
        end = sm.ts_to_date(args.end)
        if end is None:
            raise Illegal(f"--end must be an ISO date (got '{args.end}')")
        if end < start:
            raise Illegal(f"--end {end.isoformat()} must not be before --start {start.isoformat()}")
    else:
        if args.days < 1:
            raise Illegal(f"--days must be a positive number of business days (got {args.days})")
        end = sm.default_end(start, args.days)  # the last business day of the window; start is day 1
    by = require_human(args.by, "--by")
    extras = parse_extra_fields(args.field)

    if not TEMPLATE_PATH.is_file():
        raise Illegal(f"sprint template not found: {TEMPLATE_PATH}")
    text = read_spec_text(TEMPLATE_PATH)
    today = (_today(args) or date.today()).isoformat()
    for key, value in (("sprint", sid), ("goal", args.goal), ("start", start.isoformat()),
                       ("end", end.isoformat()), ("target", str(args.target)), ("mix", sm.mix_to_string(mix)),
                       ("board_ref", args.board_ref or ""), ("created", today)):
        text = set_sprint_field(text, key, value)
    text = re.sub(r"^# Sprint .*$", f"# Sprint {sid}", text, count=1, flags=re.MULTILINE)
    goal_line = str(args.goal).strip()
    if goal_line:
        text = replace_section(text, "Goal", goal_line)

    events = [make_event("sprint_new", extras, sprint=sid, by=by)]
    commit(repo_root, [(sprint_file(repo_root, sid), text)], events)
    print(f"Sprint {sid} created: {sprint_file(repo_root, sid)}")
    print(f"  {start.isoformat()} → {end.isoformat()} · target {args.target} · mix {sm.mix_to_string(mix) or 'none'}")
    print(f"  Next: propose a slate — sprint.py slate --sprint {sid}")
    return 0


def _proposal(repo_root: Path, sprint: dict, all_rows: list[dict]) -> dict:
    sid = sprint["id"]
    current = [r for r in all_rows if r["sprint"] == sid]
    candidates = [r for r in all_rows if r["status"] in sm.SLATEABLE_STATUSES and not r["sprint"]]
    try:
        mix = sm.parse_mix(sprint["mix"])
    except ValueError:
        mix = {}
    target = sprint["target"] if sprint["target"] is not None else 0
    actual = {t: c["actual"] for t, c in sm.mix_status(current, mix).items()}
    remaining_mix = {t: max(n - actual.get(t, 0), 0) for t, n in mix.items()}
    slots = max(target - len(current), 0)
    proposed = sm.propose_slate(candidates, slots, remaining_mix)
    combined = current + proposed
    return {
        "sprint": sid, "target": sprint["target"], "mix": sprint["mix"],
        "already_slated": [r["id"] for r in current],
        "candidates": len(candidates),
        "proposal": proposed,
        "mix_after": sm.mix_status(combined, mix),
        "mix_warnings": sm.mix_warnings(combined, mix, sprint["target"]),
        "dependency_warnings": sm.dependency_gaps(combined, {r["id"]: r for r in all_rows}),
    }


def cmd_slate(args, repo_root: Path) -> int:
    if not args.spec:  # read: print the proposal, write nothing — and, like every read, exit 0 always
        sid = args.sprint or active_sprint_id(repo_root)
        sprint = read_sprint(repo_root, sid) if sid and sm.is_valid_sprint_id(sid) else None
        if sprint is None:
            if not sid:
                why = f"no sprint given and none found under {sprints_dir(repo_root)} — run `new` first"
            elif not sm.is_valid_sprint_id(sid):
                why = f"'{sid}' is not a sprint id (expected S07, S12, ...)"
            else:
                why = f"sprint {sid} does not exist ({sprint_file(repo_root, sid)}) — run `new` first"
            if args.json:
                print(json.dumps({"sprint": sid or None, "target": None, "mix": "", "already_slated": [],
                                  "candidates": 0, "proposal": [], "mix_after": {}, "mix_warnings": [],
                                  "dependency_warnings": [], "has_data": False, "note": why}, indent=2))
            else:
                print(f"Slate proposal: {NO_DATA} — {why}")
            return 0
        sid = sprint["id"]
        all_rows = load_specs(repo_root)
        prop = _proposal(repo_root, sprint, all_rows)
        if args.json:
            print(json.dumps(prop, indent=2))
            return 0
        print(f"Slate proposal for {sid} — target {NO_DATA if prop['target'] is None else prop['target']} · "
              f"mix {prop['mix'] or 'none'} · {prop['candidates']} candidate(s) (status ready|draft, no sprint)")
        if prop["already_slated"]:
            print(f"  already slated: {', '.join(prop['already_slated'])}")
        if not prop["proposal"]:
            print(f"  {NO_DATA} — nothing to propose" + ("" if prop["candidates"] else " (no candidate specs)"))
        for r in prop["proposal"]:
            print(f"  {r['id']}  {r['name']}  [{r['risk']}]  {r['status']}  DoR {r['dor']}")
        for w in prop["mix_warnings"]:
            print(f"  WARNING: {w}")
        for w in prop["dependency_warnings"]:
            print(f"  WARNING: {w}")
        if prop["proposal"]:
            print(f"  Confirm with: sprint.py slate --sprint {sid} --by <name> --spec " +
                  " --spec ".join(r["id"] for r in prop["proposal"]))
        return 0

    # write: the confirm form — a missing or malformed sprint is a precondition failure (exit 1)
    sprint = _need_sprint(repo_root, args.sprint, "slate")
    sid = sprint["id"]
    all_rows = load_specs(repo_root)
    by_id = {r["id"]: r for r in all_rows}
    if sprint["state"] == "closed":
        raise Illegal(f"sprint {sid} is closed — a closed sprint cannot be slated")
    by = require_human(args.by, "--by")
    extras = parse_extra_fields(args.field)
    if args.override and not (args.reason or "").strip():
        raise Illegal("--override needs --reason (the override is recorded, so it needs a why)")

    current = [r for r in all_rows if r["sprint"] == sid]
    to_add: list[dict] = []
    for ref in args.spec:
        row = _need_spec(all_rows, ref)
        if row["status"] == "merged":
            raise Illegal(f"spec {row['id']} is merged — slating delivered work is not a commitment")
        if row["sprint"] and row["sprint"] != sid:
            raise Illegal(f"spec {row['id']} is already slated into {row['sprint']} — unslate it there first")
        if row["sprint"] == sid or any(r["id"] == row["id"] for r in to_add):
            print(f"  note: {row['id']} is already in {sid}; skipped")
            continue
        to_add.append(row)
    if not to_add:
        print(f"Nothing to slate — every named spec is already in {sid}.")
        return 0

    combined = current + to_add
    target = sprint["target"]
    if target is not None and len(combined) > target:
        if not args.override:
            raise Illegal(f"slate would hold {len(combined)} specs, more than the target of {target}. "
                          f"Unslate something, or pass --override --reason \"...\" to record the exception")
        print(f"  WARNING: slate holds {len(combined)} specs, over the target of {target} — override recorded: {args.reason}")
    try:
        mix = sm.parse_mix(sprint["mix"])
    except ValueError:
        mix = {}
    for w in sm.mix_warnings(combined, mix, target):
        if "more than the target" in w and "slate has" in w:
            continue  # already reported above as the override
        print(f"  WARNING: {w}")
    for w in sm.dependency_gaps(combined, by_id):
        print(f"  WARNING: {w} — consider pulling it in: sprint.py slate --sprint {sid} --spec <id>")

    writes, events = [], []
    for row in to_add:
        path = Path(row["path"])
        writes.append((path, set_spec_key(read_spec_text(path), "sprint", sid)))
        events.append(make_event("slated", extras, sprint=sid, spec=row["id"], by=by,
                                 reason=(args.reason or None) if args.override else None))
    new_slate = [dict(r, sprint=sid) for r in combined]
    record = replace_section(read_spec_text(Path(sprint["path"])), "Slate", render_slate_table(new_slate))
    writes.append((Path(sprint["path"]), record))
    commit(repo_root, writes, events)
    print(f"Slated into {sid}: {', '.join(r['id'] for r in to_add)} (by {by})")
    print(f"  {len(combined)} of {NO_DATA if target is None else target} slots filled")
    return 0


def cmd_unslate(args, repo_root: Path) -> int:
    sprint = _need_sprint(repo_root, args.sprint, "unslate")
    sid = sprint["id"]
    if sprint["state"] == "closed":
        raise Illegal(f"sprint {sid} is closed — its slate is a record now")
    by = require_human(args.by, "--by")
    if not (args.reason or "").strip():
        raise Illegal("--reason is required — an unslate without a why is a silent scope change")
    extras = parse_extra_fields(args.field)
    all_rows = load_specs(repo_root)
    row = _need_spec(all_rows, args.spec)
    if row["sprint"] != sid:
        raise Illegal(f"spec {row['id']} is not in {sid} (its sprint is '{row['sprint'] or 'none'}')")
    path = Path(row["path"])
    remaining = [r for r in all_rows if r["sprint"] == sid and r["id"] != row["id"]]
    writes = [(path, set_spec_key(read_spec_text(path), "sprint", "")),
              (Path(sprint["path"]), replace_section(read_spec_text(Path(sprint["path"])), "Slate",
                                                     render_slate_table(remaining)))]
    commit(repo_root, writes, [make_event("unslated", extras, sprint=sid, spec=row["id"], by=by, reason=args.reason.strip())])
    print(f"Unslated {row['id']} from {sid} (by {by}): {args.reason.strip()}")
    return 0


def cmd_status(args, repo_root: Path) -> int:
    sid = args.sprint
    if sid and not sm.is_valid_sprint_id(sid):
        why = f"'{sid}' is not a sprint id (expected S07, S12, ...)"
        if args.json:
            print(json.dumps(empty_view(why), indent=2))
        else:
            print(f"{why} — {NO_DATA}")
        return 0
    view = build_view(repo_root, sid, today=_today(args), wip_cap=args.wip_cap)
    if args.json:
        print(json.dumps(view, indent=2, default=str))
    else:
        print(format_status(view, repo_root))
    return 0


def cmd_handoff(args, repo_root: Path) -> int:
    by = require_human(args.by, "--by")
    to = require_human(args.to, "--to")
    extras = parse_extra_fields(args.field)
    all_rows = load_specs(repo_root)
    row = _need_spec(all_rows, args.spec)
    path = Path(row["path"])
    text = set_spec_key(read_spec_text(path), "next_owner", to)
    commit(repo_root, [(path, text)], [make_event("handoff", extras, spec=row["id"], to=to, by=by,
                                                  note=(args.note or None))])
    print(f"Handoff recorded: {row['id']} → {to} (by {by}). Waiting for: sprint.py ack --spec {row['id']} --by \"{to}\"")
    return 0


def cmd_ack(args, repo_root: Path) -> int:
    by = require_human(args.by, "--by")
    extras = parse_extra_fields(args.field)
    all_rows = load_specs(repo_root)
    row = _need_spec(all_rows, args.spec)
    if not row["next_owner"]:
        raise Illegal(f"spec {row['id']} has no open handoff (next_owner is empty) — nothing to acknowledge")
    if row["next_owner"].strip().lower() != by.lower():
        print(f"  WARNING: {by} acknowledged a handoff addressed to {row['next_owner']} — recorded as-is")
    path = Path(row["path"])
    text = set_spec_key(read_spec_text(path), "next_owner", "")
    commit(repo_root, [(path, text)], [make_event("ack", extras, spec=row["id"], by=by)])
    print(f"Acknowledged: {row['id']} (by {by}); next_owner cleared")
    return 0


def cmd_verdict(args, repo_root: Path) -> int:
    by = require_human(args.by, "--by")
    extras = parse_extra_fields(args.field)
    lane = args.lane.strip().lower()
    verdict = sm.normalize_review(args.verdict)
    if lane not in sm.LANES:
        raise Illegal(f"--lane must be one of {', '.join(sm.LANES)} (got '{args.lane}')")
    if verdict is None:
        raise Illegal(f"--verdict must be one of {', '.join(sm.REVIEW_VALUES)} (got '{args.verdict}')")
    reason = (args.reason or "").strip()
    if verdict == "n-a":
        if lane != "data":
            raise Illegal("n-a is legal for the data lane only — Engineering always records a verdict")
        if not reason:
            raise Illegal("data n-a needs --reason (D4: the Data verdict is required until Data records n-a with a why)")
    if verdict == "returned" and not reason:
        print("  WARNING: 'returned' without --reason — the spec goes back to refinement with no stated why")
    all_rows = load_specs(repo_root)
    row = _need_spec(all_rows, args.spec)
    path = Path(row["path"])
    text = set_spec_key(read_spec_text(path), f"{lane}_review", verdict)
    commit(repo_root, [(path, text)], [make_event("verdict", extras, spec=row["id"], lane=lane, verdict=verdict,
                                                  by=by, reason=(reason or None))])
    print(f"Verdict recorded: {row['id']} {lane}_review = {verdict} (by {by})" + (f": {reason}" if reason else ""))
    return 0


def cmd_ready(args, repo_root: Path) -> int:
    sprint = _need_sprint(repo_root, args.sprint, "ready")
    sid = sprint["id"]
    by = require_human(args.by, "--by")
    extras = parse_extra_fields(args.field)
    if sprint["state"] != "planning":
        raise Illegal(f"sprint {sid} is {sprint['state']} — only a planning sprint can be readied (forward only)")
    all_rows = load_specs(repo_root)
    by_id = {r["id"]: r for r in all_rows}
    slate = [r for r in all_rows if r["sprint"] == sid]
    gaps = sm.ready_gaps(slate, by_id)
    if gaps:
        print(f"Sprint {sid} is NOT ready — {len(gaps)} spec(s) with gaps:")
        for g in gaps:
            label = g["spec"] or "(slate)"
            for msg in g["gaps"]:
                print(f"  {label}: {msg}")
        print(READY_WHEN)
        return 1
    path = Path(sprint["path"])
    text = read_spec_text(path)
    text = set_sprint_field(text, "state", "ready")
    text = set_sprint_field(text, "readied_by", by)
    text = replace_section(text, "Slate", render_slate_table(slate))
    commit(repo_root, [(path, text)], [make_event("ready", extras, sprint=sid, by=by)])
    print(f"Sprint {sid} is ready — {len(slate)} slated spec(s) clear the ready rule (readied by {by})")
    _render_or_warn(repo_root, sid, "planning", _today(args))
    return 0


def _page_result(repo_root: Path, sprint_id: str, kind: str, out: Path) -> dict:
    """What `plan --json` (and generate_sprint_report.py --json) print on success."""
    return {"ok": True, "sprint": sprint_id, "kind": kind, "output": str(out),
            "rel_output": rel_path(repo_root, out)}


def cmd_plan(args, repo_root: Path) -> int:
    as_json = bool(getattr(args, "json", False))
    try:
        sprint = _need_sprint(repo_root, args.sprint, "plan")
        out = _render_page(repo_root, sprint["id"], "planning", _today(args), output=args.output)
    except Illegal as exc:
        if not as_json:
            raise
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        return 1
    except Exception as exc:  # noqa: BLE001 — under --json the caller needs a document, not a traceback
        if not as_json:
            raise
        print(json.dumps({"ok": False, "error": f"planning page not rendered ({type(exc).__name__}: {exc})"}, indent=2))
        return 1
    if as_json:
        print(json.dumps(_page_result(repo_root, sprint["id"], "planning", Path(out)), indent=2))
    else:
        print(f"Planning page written to: {out}")
    return 0


def _parse_decisions(pairs: list[str] | None, flag: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for raw in pairs or []:
        spec, sep, reason = raw.partition("=")
        spec, reason = spec.strip(), reason.strip()
        if not sep or not spec or not reason:
            raise Illegal(f"{flag} expects SPEC=REASON with a non-empty reason (got '{raw}')")
        if spec.isdigit():
            spec = f"{int(spec):04d}"
        out[spec] = reason
    return out


def cmd_close(args, repo_root: Path) -> int:
    sprint = _need_sprint(repo_root, args.sprint, "close")
    sid = sprint["id"]
    by = require_human(args.by, "--by")
    extras = parse_extra_fields(args.field)
    if sprint["state"] == "closed":
        raise Illegal(f"sprint {sid} is already closed (by {sprint['closed_by'] or 'unknown'})")
    carried = _parse_decisions(args.carry, "--carry")
    dropped = _parse_decisions(args.drop, "--drop")
    both = sorted(set(carried) & set(dropped))
    if both:
        raise Illegal(f"spec(s) named in both --carry and --drop: {', '.join(both)}")
    carry_to = (args.carry_to or "").strip() or None
    if carried and not carry_to:
        raise Illegal("--carry needs --carry-to SNN (the sprint the carried specs move into)")
    if carry_to and not sm.is_valid_sprint_id(carry_to):
        raise Illegal(f"--carry-to '{carry_to}' is not a sprint id (expected S08, S12, ...)")
    if carry_to == sid:
        raise Illegal(f"--carry-to {carry_to} is this sprint — carry forward, not in place")

    all_rows = load_specs(repo_root)
    by_id = {r["id"]: r for r in all_rows}
    slate = [r for r in all_rows if r["sprint"] == sid]
    outcome = sm.outcomes(slate)
    open_ids = set(outcome["open"])
    for spec in sorted(set(carried) | set(dropped)):
        if spec not in by_id:
            raise Illegal(f"unknown spec '{spec}' in --carry/--drop")
        if spec not in open_ids:
            why = "merged (kept)" if spec in outcome["kept"] else f"not slated into {sid}"
            raise Illegal(f"spec {spec} is {why} — only open slated specs are carried or dropped")
    undecided = sorted(open_ids - set(carried) - set(dropped))
    if undecided:
        raise Illegal(f"every open spec needs a decision — undecided: {', '.join(undecided)}. "
                      f"Add --carry-to SNN --carry SPEC=REASON or --drop SPEC=REASON for each")
    if carry_to and read_sprint(repo_root, carry_to) is None:
        print(f"  WARNING: sprint {carry_to} has no record yet — create it with `new` so the carried specs land somewhere")

    # The review page must show the slate that was reviewed. Build the view BEFORE the writes below
    # rewrite carried specs to the next sprint and clear the dropped ones; then stamp the closed state.
    today = _today(args)
    review_view = build_view(repo_root, sid, today=today)
    if review_view.get("sprint"):
        review_view["sprint"]["state"] = "closed"
        review_view["sprint"]["closed_by"] = by

    writes, events = [], []
    for spec in sorted(carried):
        path = Path(by_id[spec]["path"])
        writes.append((path, set_spec_key(read_spec_text(path), "sprint", carry_to)))
        events.append(make_event("carried", extras, sprint=sid, spec=spec, to_sprint=carry_to, by=by, reason=carried[spec]))
    for spec in sorted(dropped):
        path = Path(by_id[spec]["path"])
        writes.append((path, set_spec_key(read_spec_text(path), "sprint", "")))
        events.append(make_event("dropped", extras, sprint=sid, spec=spec, by=by, reason=dropped[spec]))
    path = Path(sprint["path"])
    text = read_spec_text(path)
    text = set_sprint_field(text, "state", "closed")
    text = set_sprint_field(text, "closed_by", by)
    text = replace_section(text, "Slate", render_slate_table(slate))
    text = replace_section(text, "Close", render_close_table(outcome["kept"], carried, dropped, carry_to, by))
    writes.append((path, text))
    events.append(make_event("closed", extras, sprint=sid, by=by))
    commit(repo_root, writes, events)
    print(f"Sprint {sid} closed by {by}: {len(outcome['kept'])} kept · {len(carried)} carried"
          + (f" → {carry_to}" if carried else "") + f" · {len(dropped)} dropped")
    _render_or_warn(repo_root, sid, "review", today, view=review_view)
    return 0


# --- list / log (reads, exit 0 always) ---------------------------------------------------------------------

def sprint_list_view(repo_root: Path) -> dict:
    """Every sprint record in id order: {sprints[{id,state,goal,start,end,ordinal}], active, count}.
    `ordinal` is the 1-based position in id order (S07 is the 1st if it is the lowest id on disk).
    A record with no parseable frontmatter, or a state outside SPRINT_STATES, reads `state: null`."""
    repo_root = Path(repo_root).resolve()
    rows = []
    for ordinal, sid in enumerate(list_sprint_ids(repo_root), start=1):
        fm, _ = parse_frontmatter(read_spec_text(sprint_file(repo_root, sid)))
        state = str(fm.get("state") or "").strip().lower()
        rows.append({
            "id": sid,
            "state": state if fm and state in sm.SPRINT_STATES else None,
            "goal": str(fm.get("goal") or ""),
            "start": str(fm.get("start") or ""),
            "end": str(fm.get("end") or ""),
            "ordinal": ordinal,
        })
    return {"sprints": rows, "active": active_sprint_id(repo_root), "count": len(rows)}


def cmd_list(args, repo_root: Path) -> int:
    view = sprint_list_view(repo_root)
    if args.json:
        print(json.dumps(view, indent=2))
        return 0
    if not view["sprints"]:
        print(f"Sprints: {NO_DATA} — {_no_sprint_note(repo_root, None)}")
        return 0
    print(f"Sprints: {view['count']} record(s) under {sprints_dir(repo_root)} · active {view['active'] or NO_DATA}")
    for s in view["sprints"]:
        dates = f"{s['start'] or '?'} → {s['end'] or '?'}"
        print(f"  {s['id']}  #{s['ordinal']}  {s['state'] or 'state unreadable'}  {dates}  {s['goal'] or '(no goal)'}")
    return 0


def _since_date(raw) -> date | None:
    if not raw:
        return None
    d = sm.ts_to_date(raw)
    if d is None:
        raise Illegal(f"--since must be an ISO date (got '{raw}')")
    return d


def cmd_log(args, repo_root: Path) -> int:
    """The ledger, verbatim: every line is printed as it was written, nothing reshaped or summed.
    --since keeps events dated on or after that day (00:00, inclusive); an undated line cannot be
    placed, so it is kept. --sprint keeps the lines whose `sprint` field is that id."""
    since = _since_date(args.since)
    sprint_filter = (args.sprint or "").strip() or None
    entries, skipped = read_ledger_lines(repo_root)
    events = []
    for e in entries:
        if sprint_filter is not None and str(e.get("sprint", "")) != sprint_filter:
            continue
        if since is not None:
            when = sm.ts_to_date(e.get("ts"))
            if when is not None and when < since:
                continue
        events.append(e)
    path = ledger_path(repo_root)
    doc = {"events": events, "count": len(events), "since": since.isoformat() if since else None,
           "path": str(path), "exists": path.is_file(), "skipped": skipped}
    if args.json:
        print(json.dumps(doc, indent=2))
        return 0
    if not doc["exists"]:
        print(f"Sprint log: {NO_DATA} — no ledger at {path}")
        return 0
    scope = (f" since {doc['since']}" if since else "") + (f" for {sprint_filter}" if sprint_filter else "")
    print(f"Sprint log: {len(events)} event(s){scope} — {path}"
          + (f" · {skipped} unreadable line(s) skipped" if skipped else ""))
    if not events:
        print(f"  {NO_DATA}")
    for e in events:
        rest = "  ".join(f"{k}={v}" for k, v in e.items() if k not in ("ts", "event"))
        print(f"  {e.get('ts', 'undated')}  {e.get('event', '?')}  {rest}".rstrip())
    return 0


# --- carry / edit (writes) ---------------------------------------------------------------------------------

def cmd_carry(args, repo_root: Path) -> int:
    """Move one open slated spec into a later sprint without closing the one it leaves — the close
    path's `carried` outcome, available mid-sprint. One commit: the spec's `sprint:`, both sprints'
    `## Slate` tables, and one `carried` event of exactly close's shape."""
    by = require_human(args.by, "--by")
    extras = parse_extra_fields(args.field)
    reason = (args.reason or "").strip()
    if not reason:
        raise Illegal("--reason is required — a carry without a why is a silent scope change")
    to = str(args.to or "").strip()
    if not sm.is_valid_sprint_id(to):
        raise Illegal(f"--to '{to}' is not a sprint id (expected S08, S12, ...)")
    all_rows = load_specs(repo_root)
    row = _need_spec(all_rows, args.spec)
    src = row["sprint"]
    if not src:
        raise Illegal(f"spec {row['id']} is not in a sprint — slate it instead: sprint.py slate --sprint {to} --spec {row['id']}")
    if row["status"] == "merged":
        raise Illegal(f"spec {row['id']} is merged — delivered work is kept where it was delivered, not carried")
    if to == src:
        raise Illegal(f"--to {to} is the sprint {row['id']} is already in — carry forward, not in place")
    target = read_sprint(repo_root, to)
    if target is None:
        raise Illegal(f"sprint {to} does not exist ({sprint_file(repo_root, to)}) — run `new` first")
    if target["state"] == "closed":
        raise Illegal(f"sprint {to} is closed — a closed sprint cannot take a carried spec")
    source = read_sprint(repo_root, src) if sm.is_valid_sprint_id(src) else None
    if source is not None and source["state"] == "closed":
        raise Illegal(f"sprint {src} is closed — its slate is a record now; {row['id']} is carried or dropped at close, not after")

    writes = []
    spec_path = Path(row["path"])
    writes.append((spec_path, set_spec_key(read_spec_text(spec_path), "sprint", to)))
    if source is not None:
        remaining = [r for r in all_rows if r["sprint"] == src and r["id"] != row["id"]]
        writes.append((Path(source["path"]),
                       replace_section(read_spec_text(Path(source["path"])), "Slate", render_slate_table(remaining))))
    else:
        print(f"  note: sprint {src} has no record under {sprints_dir(repo_root)} — only the spec and the ledger name it")
    arriving = [r for r in all_rows if r["sprint"] == to] + [dict(row, sprint=to)]
    writes.append((Path(target["path"]),
                   replace_section(read_spec_text(Path(target["path"])), "Slate", render_slate_table(arriving))))
    event = make_event("carried", extras, sprint=src, spec=row["id"], to_sprint=to, by=by, reason=reason)
    commit(repo_root, writes, [event])
    print(f"Carried {row['id']}: {src} → {to} (by {by}): {reason}")
    if target["target"] is not None and len(arriving) > target["target"]:
        print(f"  WARNING: {to} now holds {len(arriving)} specs, over its target of {target['target']}")
    return 0


def cmd_edit(args, repo_root: Path) -> int:
    """Change a sprint record's goal after `new`: the frontmatter `goal:` and the `## Goal` section,
    nothing else, with one `sprint_edited` event. The record is read-only once the sprint is closed."""
    by = require_human(args.by, "--by")
    extras = parse_extra_fields(args.field)
    sprint = _need_sprint(repo_root, args.sprint, "edit")
    sid = sprint["id"]
    goal = str(args.goal or "").strip()
    if not goal:
        raise Illegal("--goal must be a non-empty sentence — the goal is the sprint's one outcome")
    if sprint["state"] == "closed":
        raise Illegal(f"sprint {sid} is closed — its record is read-only now")
    if goal == sprint["goal"]:
        print(f"Sprint {sid} goal unchanged — nothing written")
        return 0
    path = Path(sprint["path"])
    text = set_sprint_field(read_spec_text(path), "goal", goal)
    text = replace_section(text, "Goal", goal)
    commit(repo_root, [(path, text)], [make_event("sprint_edited", extras, sprint=sid, field="goal", by=by)])
    print(f"Sprint {sid} goal set by {by}: {goal}")
    return 0


# --- CLI ---------------------------------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    src = common.add_mutually_exclusive_group()
    src.add_argument("--state", help="Path to .sdlc/state.yaml (workflow mode; repo root = parent of .sdlc/)")
    src.add_argument("--repo", default=".", help="Target repo root (standalone mode; default: cwd)")
    common.add_argument("--today", default=None, metavar="YYYY-MM-DD",
                        help="Override today's date for business-day arithmetic (replays, tests)")

    write = argparse.ArgumentParser(add_help=False)
    write.add_argument("--field", action="append", default=[], metavar="KEY=VALUE",
                       help="Extra key=value recorded on the ledger line (repeatable). Activity-metric keys "
                            "(velocity, points, estimate, effort, hours, ...) are refused with exit 2")

    parser = argparse.ArgumentParser(
        description="Sprint team layer: slate a count of specs by risk-tier mix, ready the sprint once every "
                    "slated spec clears the Definition of Ready and its Eng/Data verdicts, close it with "
                    "kept / carried / dropped. Advisory — never a gate, never gated; never writes state.yaml.")
    sub = parser.add_subparsers(dest="verb", required=True)

    p = sub.add_parser("new", parents=[common, write], help="Create a sprint record in `planning`")
    p.add_argument("--sprint", required=True, metavar="SNN", help="Human-typed sprint id, e.g. S07")
    p.add_argument("--goal", required=True, help="One outcome-shaped sentence")
    p.add_argument("--start", required=True, metavar="YYYY-MM-DD", help="First day of the sprint")
    end = p.add_mutually_exclusive_group()
    end.add_argument("--end", default=None, metavar="YYYY-MM-DD",
                     help="Last day of the sprint (default: the last business day of a --days-long window; start is day 1)")
    end.add_argument("--days", type=int, default=10, help="Sprint length in business days, start included (default: 10)")
    p.add_argument("--target", required=True, type=int, help="How many specs to slate — a count, never a size")
    p.add_argument("--mix", default="", help='By risk tier, e.g. "HIGH:1,MEDIUM:2,LOW:3"; counts sum <= target')
    p.add_argument("--board-ref", default="", help='Manual board mapping only, e.g. "ADO Iteration 6"; nothing reads it')
    p.add_argument("--by", required=True, help="The named human creating the sprint (recorded on the ledger)")

    p = sub.add_parser("slate", parents=[common, write],
                       help="Propose a slate (no --spec; writes nothing) or slate the named specs")
    p.add_argument("--sprint", default=None, metavar="SNN", help="Sprint id (default: the active sprint)")
    p.add_argument("--spec", action="append", default=[], metavar="ID", help="Spec id to slate (repeatable)")
    p.add_argument("--by", default=None, help="The named human confirming the slate (required with --spec)")
    p.add_argument("--override", action="store_true", help="Allow the slate to exceed the target (needs --reason)")
    p.add_argument("--reason", default=None, help="Why the target is exceeded (recorded)")
    p.add_argument("--json", action="store_true", help="Emit the proposal as JSON (proposal mode only)")

    p = sub.add_parser("unslate", parents=[common, write], help="Remove a spec from the slate (with a reason)")
    p.add_argument("--sprint", default=None, metavar="SNN", help="Sprint id (default: the active sprint)")
    p.add_argument("--spec", required=True, metavar="ID")
    p.add_argument("--by", required=True, help="The named human")
    p.add_argument("--reason", required=True, help="Why it leaves the slate")

    p = sub.add_parser("status", parents=[common], help="The slate, readiness, verdicts, handoffs, mix, WIP, build order (read-only)")
    p.add_argument("--sprint", default=None, metavar="SNN", help="Sprint id (default: the active sprint)")
    p.add_argument("--wip-cap", type=int, default=None, help="WIP cap for next-up (default: from cadence-plan.md if stated)")
    p.add_argument("--json", action="store_true", help="Emit the view as JSON")

    p = sub.add_parser("handoff", parents=[common, write], help="Assign the next action on a spec to a named person")
    p.add_argument("--spec", required=True, metavar="ID")
    p.add_argument("--to", required=True, help="The named human who now holds the next action")
    p.add_argument("--by", required=True, help="The named human recording the handoff")
    p.add_argument("--note", default=None, help="Optional note recorded on the ledger")

    p = sub.add_parser("ack", parents=[common, write], help="Acknowledge a handoff (clears next_owner)")
    p.add_argument("--spec", required=True, metavar="ID")
    p.add_argument("--by", required=True, help="The named human acknowledging")

    p = sub.add_parser("verdict", parents=[common, write], help="Record the independent Engineering or Data verdict on a spec")
    p.add_argument("--spec", required=True, metavar="ID")
    p.add_argument("--lane", required=True, choices=list(sm.LANES), help="eng | data")
    p.add_argument("--verdict", required=True, choices=list(sm.REVIEW_VALUES),
                   help="accepted | returned | pending | n-a (n-a: data lane only, needs --reason)")
    p.add_argument("--by", required=True, help="The named lead")
    p.add_argument("--reason", default=None, help="Why (required for n-a; advised for returned)")

    p = sub.add_parser("ready", parents=[common, write],
                       help="Ready the sprint if every slated spec clears the ready rule; else list the gaps (exit 1)")
    p.add_argument("--sprint", default=None, metavar="SNN", help="Sprint id (default: the active sprint)")
    p.add_argument("--by", required=True, help="The named human readying the sprint")

    p = sub.add_parser("plan", parents=[common], help="Render (or re-render) the sprint-planning page on demand")
    p.add_argument("--sprint", default=None, metavar="SNN", help="Sprint id (default: the active sprint)")
    p.add_argument("--output", type=Path, default=None, help="Output path (default: .sdlc/reports/sprint-SNN-planning.html)")
    p.add_argument("--json", action="store_true",
                   help='Emit {"ok", "sprint", "kind", "output", "rel_output"} (or {"ok": false, "error"}) instead of prose')

    p = sub.add_parser("close", parents=[common, write],
                       help="Close the sprint: kept (merged) / carried (with reason) / dropped (with reason)")
    p.add_argument("--sprint", default=None, metavar="SNN", help="Sprint id (default: the active sprint)")
    p.add_argument("--by", required=True, help="The named human closing the sprint")
    p.add_argument("--carry-to", default=None, metavar="SNN", help="The sprint carried specs move into")
    p.add_argument("--carry", action="append", default=[], metavar="SPEC=REASON", help="Carry an open spec (repeatable)")
    p.add_argument("--drop", action="append", default=[], metavar="SPEC=REASON", help="Drop an open spec (repeatable)")

    p = sub.add_parser("list", parents=[common], help="Every sprint record with its state and ordinal (read-only)")
    p.add_argument("--json", action="store_true", help='Emit {"sprints", "active", "count"}')

    p = sub.add_parser("log", parents=[common], help="The ledger lines, verbatim — nothing reshaped or summed (read-only)")
    p.add_argument("--since", default=None, metavar="YYYY-MM-DD",
                   help="Only events dated on or after this day (00:00, inclusive); undated lines are kept")
    p.add_argument("--sprint", default=None, metavar="SNN", help="Only events whose sprint field is this id")
    p.add_argument("--json", action="store_true",
                   help='Emit {"events", "count", "since", "path", "exists", "skipped"}')

    p = sub.add_parser("carry", parents=[common, write],
                       help="Move an open slated spec into a later sprint now, with a reason (close's `carried`, mid-sprint)")
    p.add_argument("--spec", required=True, metavar="ID")
    p.add_argument("--to", required=True, metavar="SNN", help="The sprint the spec moves into (must exist and be open)")
    p.add_argument("--reason", required=True, help="Why it moves (recorded)")
    p.add_argument("--by", required=True, help="The named human carrying it")

    p = sub.add_parser("edit", parents=[common, write], help="Change a sprint's goal (recorded; closed sprints are read-only)")
    p.add_argument("--sprint", required=True, metavar="SNN", help="Sprint id, e.g. S07")
    p.add_argument("--goal", required=True, help="The new one outcome-shaped sentence")
    p.add_argument("--by", required=True, help="The named human editing the record")
    return parser


VERBS = {
    "new": cmd_new, "slate": cmd_slate, "unslate": cmd_unslate, "status": cmd_status,
    "handoff": cmd_handoff, "ack": cmd_ack, "verdict": cmd_verdict, "ready": cmd_ready,
    "plan": cmd_plan, "close": cmd_close, "list": cmd_list, "log": cmd_log, "carry": cmd_carry, "edit": cmd_edit,
}


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    repo_root = resolve_repo_root(args)
    if repo_root is None:
        print(f"Error: state file not found: {args.state}")
        return 1
    try:
        return VERBS[args.verb](args, repo_root)
    except Refused as exc:
        print(str(exc))
        return 2
    except Illegal as exc:
        print(f"Error: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
