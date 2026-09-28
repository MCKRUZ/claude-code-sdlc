"""What the software can say about a sign-off question — a pre-check, never a verdict.

Each phase's exit gate carries plain-language questions no file check can settle ("Scope
boundaries are unambiguous"). The person signing still answers them. What can be computed is
the part that isn't judgement: whether the document has out-of-scope items at all, how many
success dimensions carry thresholds and a named source, whether `project_type` is recorded.
A hint reports exactly that — "found 4, each with a source; confirm you agree" — so the person
starts from evidence instead of a blank box, and is never told the question is settled.

Three statuses, deliberately:
  looks_met  — what a check can see is in order; the person still confirms it
  not_yet    — something a check can see is missing, and the detail says what
  judgement  — nothing here can be checked; the default for every question without an evaluator

The phase registry is fixed core and gives its questions no ids, so an evaluator is matched by a
distinctive phrase of the question's wording (`HINT_NEEDLES`). A test requires every phrase to
match exactly one real question, so a reworded question fails loudly instead of quietly losing
its hint.

Pure and read-only: it reads documents and state, writes nothing, and never raises on a
malformed document — a document it cannot read is `not_yet`, not a crash.
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import track_decisions as td  # noqa: E402

CONFIRM = "Confirm you agree."
JUDGEMENT = {"status": "judgement", "detail": "Needs your judgement — nothing here can check this."}

_PLACEHOLDER = re.compile(r"^\[.*\]$")
_NO_VALUE = {"", "—", "–", "-", "n/a", "tbd"}


def _hint(status: str, detail: str) -> dict:
    return {"status": status, "detail": detail}


def _read(repo_root: Path, rel: str) -> str | None:
    try:
        return (repo_root / rel).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None


def _is_filled(cell: str) -> bool:
    """A table cell or bullet that says something — not blank, a dash, or template placeholder."""
    cell = cell.strip()
    return cell.lower() not in _NO_VALUE and not _PLACEHOLDER.match(cell)


def _plain(line: str) -> str:
    return re.sub(r"[#*_:]+", "", line).replace("-", " ").strip().lower()


def _is_heading(line: str) -> bool:
    return line.lstrip().startswith("#")


def _is_bold_label(line: str) -> bool:
    return bool(re.match(r"^\s*\*\*[^*]+\*\*", line))


def _table_rows(lines: list[str]) -> list[list[str]]:
    rows = []
    for line in lines:
        s = line.strip()
        if not s.startswith("|"):
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if cells and set("".join(cells)) <= set("-: "):
            continue  # the |---|---| separator
        rows.append(cells)
    return rows


# --- Phase 0 ---------------------------------------------------------------------------------

def _scope(repo_root: Path, state: dict) -> dict:
    text = _read(repo_root, ".sdlc/artifacts/00-discovery/problem-statement.md")
    if text is None:
        return _hint("not_yet", "problem-statement.md does not exist yet.")
    lines = text.splitlines()
    start = next((i for i, l in enumerate(lines) if _plain(l).startswith("out of scope")), None)
    if start is None:
        return _hint("not_yet", "problem-statement.md has no 'Out of scope' list.")
    items = 0
    for line in lines[start + 1:]:
        if _is_heading(line) or _is_bold_label(line) or line.strip() == "---":
            break
        m = re.match(r"^\s*(?:[-*]|\d+\.)\s+(.+)$", line)
        if m and _is_filled(m.group(1)):
            items += 1
    if items == 0:
        return _hint("not_yet", "The 'Out of scope' list has nothing in it yet.")
    return _hint("looks_met", f"{items} thing(s) listed as out of scope. Is the boundary clear to a new reader? {CONFIRM}")


def _dimension_blocks(text: str) -> list[list[str]]:
    blocks: list[list[str]] = []
    current: list[str] | None = None
    for line in text.splitlines():
        if _is_heading(line):
            level = len(line) - len(line.lstrip("#"))
            if level == 3 and line.lstrip("# ").lower().startswith("dimension"):
                current = []
                blocks.append(current)
                continue
            if level <= 3:
                current = None
        if current is not None:
            current.append(line)
    return blocks


def _dimension_is_complete(block: list[str]) -> bool:
    """A Pass row with a threshold AND a named way to measure it, and a Fail row with a threshold.
    A dash in the Fail row's measure column is fine: what is being read from is named once."""
    rows = {r[0].lower().split()[0]: r for r in _table_rows(block) if r and r[0]}
    passed, failed = rows.get("pass"), rows.get("fail")
    if not passed or not failed or len(passed) < 3 or len(failed) < 2:
        return False
    return _is_filled(passed[1]) and _is_filled(passed[2]) and _is_filled(failed[1])


def _success_criteria(repo_root: Path, state: dict) -> dict:
    text = _read(repo_root, ".sdlc/artifacts/00-discovery/success-criteria.md")
    if text is None:
        return _hint("not_yet", "success-criteria.md does not exist yet.")
    blocks = _dimension_blocks(text)
    complete = sum(1 for b in blocks if _dimension_is_complete(b))
    if complete >= 3:
        return _hint("looks_met", f"{complete} dimensions each state pass and fail thresholds and where they are read from. {CONFIRM}")
    return _hint(
        "not_yet",
        f"{complete} of {len(blocks)} dimension(s) have pass/fail thresholds and a named source; at least 3 are needed.",
    )


def _personas(repo_root: Path, state: dict) -> dict:
    text = _read(repo_root, ".sdlc/artifacts/00-discovery/problem-statement.md")
    if text is None:
        return _hint("not_yet", "problem-statement.md does not exist yet.")
    lines = text.splitlines()
    start = next((i for i, l in enumerate(lines) if _is_heading(l) and "persona" in l.lower()), None)
    if start is None:
        return _hint("not_yet", "problem-statement.md has no personas section.")
    body: list[str] = []
    for line in lines[start + 1:]:
        if _is_heading(line):
            break
        body.append(line)
    rows = _table_rows(body)
    if not rows:
        return _hint("not_yet", "The personas section has no table.")
    width = len(rows[0])
    filled = sum(1 for r in rows[1:] if len(r) >= width and all(_is_filled(c) for c in r[:width]))
    if filled == 0:
        return _hint("not_yet", "No persona row is filled in yet.")
    if filled < 3:
        return _hint("not_yet", f"{filled} persona(s) fully filled in; the template asks for at least 3.")
    return _hint("looks_met", f"{filled} personas listed with every column filled. Is each a real person or role you named? {CONFIRM}")


def _project_type(repo_root: Path, state: dict) -> dict:
    value = state.get("project_type")
    if isinstance(value, str) and value.strip():
        return _hint("looks_met", f"project_type is '{value.strip()}'. {CONFIRM}")
    return _hint("not_yet", "project_type is not recorded in state.yaml.")


# --- Phase 1 ---------------------------------------------------------------------------------

def _architectural_questions(repo_root: Path, state: dict) -> dict:
    text = _read(repo_root, ".sdlc/artifacts/01-requirements/phase2-handoff.md")
    if text is None:
        return _hint("not_yet", "phase2-handoff.md does not exist yet.")
    # A template line still reading "[Question]" is the placeholder, not a question someone asked.
    ids = {m for line in text.splitlines() if "[Question]" not in line for m in re.findall(r"AQ-\d+", line)}
    if not ids:
        return _hint("not_yet", "No numbered AQ-NN question is listed in phase2-handoff.md.")
    return _hint("looks_met", f"{len(ids)} numbered architectural question(s) listed. Is any implication missing? {CONFIRM}")


def _decision_log(repo_root: Path, state: dict) -> dict:
    path = repo_root / ".sdlc" / "decision-log.md"
    if not path.exists():
        return _hint("not_yet", "There is no decision log yet.")
    open_ones = [d for d in td.parse_decisions(path) if td.is_open(d)]
    incomplete = [d["id"] or "(no id)" for d in open_ones if not d["owner"].strip() or not d["due"].strip()]
    if incomplete:
        return _hint("not_yet", "Open decision(s) with no owner or due date: " + ", ".join(incomplete) + ".")
    return _hint("looks_met", f"{len(open_ones)} open decision(s), each with an owner and a due date. {CONFIRM}")


HINTS = (
    ("Scope boundaries are unambiguous", _scope),
    ("success-criteria.md has at least 3 measurable dimensions", _success_criteria),
    ("Every persona is a real person or role", _personas),
    ("project_type is recorded in state.yaml", _project_type),
    ("Every architectural implication appears in phase2-handoff.md", _architectural_questions),
    ("Every open product decision is recorded in .sdlc/decision-log.md", _decision_log),
)
HINT_NEEDLES = tuple(needle for needle, _ in HINTS)


def hint_for(question: str, repo_root: Path, state: dict) -> dict:
    """The pre-check for one question. Never raises: a check that cannot run says so."""
    for needle, evaluate in HINTS:
        if needle in question:
            try:
                return evaluate(Path(repo_root), state or {})
            except Exception as exc:  # a malformed document must not take the readiness view down
                return _hint("not_yet", f"Could not be checked ({type(exc).__name__}).")
    return dict(JUDGEMENT)
