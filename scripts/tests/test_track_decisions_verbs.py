"""Spec 0021 — `track_decisions.py open` / `decide`.

Why these tests are shaped the way they are: the verbs write into a file a person has edited, so the
property that matters is that nothing else in that file moves (every-other-byte, on LF and CRLF
files), that a refusal leaves the file exactly as it was, and that the no-verb report people already
depend on did not change.
"""

import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from golden_support import SCRIPTS_DIR, capture, read_golden  # noqa: E402

import track_decisions as td  # noqa: E402

SCRIPT = SCRIPTS_DIR / "track_decisions.py"
FRIDAY = "2026-10-02"
TUESDAY = "2026-10-06"

HEADER = ("| id    | decision                | owner | opened     | due (2 business days) | status |\n"
          "|-------|-------------------------|-------|------------|-----------------------|--------|\n")
ROWS = ("| DL-01 | Pick the auth provider  | Jane  | 2026-07-07 | 2026-07-09            | open   |\n"
        "| DL-02 | Choose the SMS vendor   | Ken   | 2026-07-03 | 2026-07-07            | decided|\n")
REAL_LOG = "# Decision Log\n\nSome prose.\n\n" + HEADER + ROWS + "\n*Add one row per decision.*\n"


def run(args, cwd):
    return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True,
                          encoding="utf-8", cwd=str(cwd))


def make_log(tmp_path, text, eol="\n"):
    (tmp_path / ".sdlc").mkdir(exist_ok=True)
    path = tmp_path / ".sdlc" / "decision-log.md"
    path.write_bytes(text.replace("\n", eol).encode("utf-8"))
    return path


def open_args(decision="Pick a vendor", owner="Jane", opened=FRIDAY, *extra):
    return ["open", "--repo", ".", "--decision", decision, "--owner", owner, "--opened", opened, *extra]


def ids_in_rows(path):
    return [d["id"] for d in td.parse_decisions(path)]


# --- the no-verb report is exactly what it was ---

GOLDEN_LOG = (
    "# Decision Log\n\n"
    "| id | decision | owner | opened | due | status |\n"
    "|-------|-----------------------------|------|------------|------------|---------|\n"
    "| DL-01 | Pick the auth provider | Jane | 2099-01-05 | 2099-01-07 | open |\n"
    "| DL-02 | Choose the SMS vendor | Ken | 2099-01-05 | 2099-01-07 | decided |\n"
    "| DL-03 | Unscheduled thing | Mira | soon | | open |\n"
)


@pytest.mark.parametrize("name,args", [
    ("track_decisions-report", ["--repo", "."]),
    ("track_decisions-report-json", ["--repo", ".", "--json"]),
])
def test_no_verb_report_matches_golden_captured_before_the_verbs_existed(name, args, tmp_path):
    root = tmp_path.resolve()
    (root / "decision-log.md").write_bytes(GOLDEN_LOG.encode("utf-8"))
    assert capture("track_decisions.py", args, root) == read_golden(name)


def test_no_verb_state_mode_still_reads_state_sibling_log(tmp_path):
    make_log(tmp_path, GOLDEN_LOG)
    state = tmp_path / ".sdlc" / "state.yaml"
    state.write_text("x: 1\n", encoding="utf-8")
    out = json.loads(run(["--state", str(state), "--json"], tmp_path).stdout)
    assert out["total"] == 3 and out["open"] == 2


# --- open: id allocation ---

def test_open_allocates_next_id_scanning_prose_as_well_as_rows(tmp_path):
    # DL-07 appears only in prose: an id mentioned anywhere is never reused.
    log = make_log(tmp_path, REAL_LOG.replace("Some prose.", "We parked this earlier as DL-07."))
    out = json.loads(run(open_args() + ["--json"], tmp_path).stdout)
    assert out["id"] == "DL-08"
    assert ids_in_rows(log)[-1] == "DL-08"


def test_open_id_grows_past_99(tmp_path):
    make_log(tmp_path, REAL_LOG.replace("DL-02", "DL-99"))
    out = json.loads(run(open_args() + ["--json"], tmp_path).stdout)
    assert out["id"] == "DL-100"


def test_open_on_log_with_no_rows_starts_at_dl_01(tmp_path):
    make_log(tmp_path, "# Log\n\n" + HEADER)
    assert json.loads(run(open_args() + ["--json"], tmp_path).stdout)["id"] == "DL-01"


# --- open: the clock ---

def test_friday_opening_is_due_the_following_tuesday(tmp_path):
    assert date.fromisoformat(FRIDAY).weekday() == 4
    make_log(tmp_path, REAL_LOG)
    out = json.loads(run(open_args(opened=FRIDAY) + ["--json"], tmp_path).stdout)
    assert out["due"] == TUESDAY == td.add_business_days(date(2026, 10, 2), 2).isoformat()


def test_row_written_with_status_open_and_report_flags_nothing_overdue_for_a_fresh_one(tmp_path):
    log = make_log(tmp_path, REAL_LOG)
    run(open_args(opened="2099-01-05"), tmp_path)
    row = [d for d in td.parse_decisions(log) if d["id"] == "DL-03"][0]
    assert row == {"id": "DL-03", "decision": "Pick a vendor", "owner": "Jane",
                   "opened": "2099-01-05", "due": "2099-01-07", "status": "open"}


def test_open_defaults_opened_to_today(tmp_path):
    make_log(tmp_path, REAL_LOG)
    args = ["open", "--repo", ".", "--decision", "x", "--owner", "y", "--json"]
    out = json.loads(run(args, tmp_path).stdout)
    assert out["opened"] == date.today().isoformat()


def test_text_output_names_the_id_and_due_date(tmp_path):
    make_log(tmp_path, REAL_LOG)
    out = run(open_args(), tmp_path).stdout
    assert "DL-03" in out and TUESDAY in out


# --- open: creating the log from the shipped template ---

def test_open_creates_log_from_template_and_replaces_the_placeholder_row(tmp_path):
    proc = run(open_args(), tmp_path)
    assert proc.returncode == 0, proc.stderr
    log = tmp_path / ".sdlc" / "decision-log.md"
    text = log.read_text(encoding="utf-8")
    assert "[the open question a human must decide]" not in text
    assert ids_in_rows(log) == ["DL-01"]
    # Everything in the template except the placeholder row is carried over.
    template = td.TEMPLATE_PATH.read_text(encoding="utf-8").splitlines()
    kept = [ln for ln in template if not ln.startswith("| DL-01")]
    assert [ln for ln in text.splitlines() if not ln.startswith("| DL-01")] == kept


def test_second_open_on_a_template_born_log_gets_dl_02(tmp_path):
    run(open_args(), tmp_path)
    out = json.loads(run(open_args("another", "Bo") + ["--json"], tmp_path).stdout)
    assert out["id"] == "DL-02"


def test_template_prose_citing_dl_01_as_an_example_does_not_consume_dl_01(tmp_path):
    # The shipped template's own prose says "e.g. `DL-01` in Requirements". That is example text, so a
    # verbatim copy of the template must still hand out DL-01 first.
    make_log(tmp_path, td.TEMPLATE_PATH.read_text(encoding="utf-8"))
    assert json.loads(run(open_args() + ["--json"], tmp_path).stdout)["id"] == "DL-01"


def test_a_person_citing_dl_01_in_their_own_prose_does_consume_it(tmp_path):
    # Same shape of log, but the DL-01 mention is the person's own words, not shipped template text.
    text = td.TEMPLATE_PATH.read_text(encoding="utf-8").replace(
        "# Decision Log\n","# Decision Log\nWe already discussed DL-01 verbally.\n", 1)
    make_log(tmp_path, text)
    assert json.loads(run(open_args() + ["--json"], tmp_path).stdout)["id"] == "DL-02"


def test_log_whose_only_dl_01_is_the_placeholder_row_starts_at_dl_01(tmp_path):
    text = ("# Decision Log\n\n" + HEADER +
            "| DL-01 | [the open question a human must decide] | [name/role] | [YYYY-MM-DD] "
            "| [YYYY-MM-DD] | open |\n")
    log = make_log(tmp_path, text)
    out = json.loads(run(open_args() + ["--json"], tmp_path).stdout)
    assert out["id"] == "DL-01"
    assert ids_in_rows(log) == ["DL-01"]
    assert "[name/role]" not in log.read_text(encoding="utf-8")


def test_a_real_row_with_one_bracketed_word_is_not_mistaken_for_a_placeholder(tmp_path):
    text = "# L\n\n" + HEADER + "| DL-01 | Rename [legacy] endpoint | Jane | 2026-07-07 | 2026-07-09 | open |\n"
    make_log(tmp_path, text)
    assert json.loads(run(open_args() + ["--json"], tmp_path).stdout)["id"] == "DL-02"


# --- open: every other byte is unchanged ---

@pytest.mark.parametrize("eol", ["\n", "\r\n"])
def test_open_only_inserts_one_row_and_preserves_line_endings(tmp_path, eol):
    log = make_log(tmp_path, REAL_LOG, eol)
    before = log.read_bytes()
    assert run(open_args("Pick a vendor", "Jane"), tmp_path).returncode == 0
    after = log.read_bytes()
    row = f"| DL-03 | Pick a vendor | Jane | {FRIDAY} | {TUESDAY} | open |{eol}".encode()
    assert row in after
    assert after.replace(row, b"", 1) == before
    if eol == "\r\n":
        assert re.search(rb"(?<!\r)\n", after) is None


def test_open_inserts_inside_the_table_not_after_trailing_prose(tmp_path):
    log = make_log(tmp_path, REAL_LOG)
    run(open_args(), tmp_path)
    lines = log.read_text(encoding="utf-8").splitlines()
    assert lines.index(next(ln for ln in lines if ln.startswith("| DL-03"))) < lines.index(
        "*Add one row per decision.*")


def test_open_on_a_file_with_no_final_newline_stays_without_one(tmp_path):
    text = "# L\n\n" + HEADER + ROWS.rstrip("\n")
    log = make_log(tmp_path, text)
    before = log.read_bytes()
    run(open_args(), tmp_path)
    after = log.read_bytes()
    assert after.startswith(before + b"\n| DL-03 |")
    assert not after.endswith(b"\n")


def test_open_cell_values_escape_pipes_and_collapse_newlines(tmp_path):
    log = make_log(tmp_path, REAL_LOG)
    run(open_args("Use A | B\nor  C", "  Jane \n"), tmp_path)
    assert r"| DL-03 | Use A \| B or  C | Jane |" in log.read_text(encoding="utf-8")
    row = td.parse_decisions(log)[-1]
    assert row["decision"] == "Use A | B or  C" and row["owner"] == "Jane"


def test_open_matches_columns_by_first_word_so_other_header_wording_works(tmp_path):
    text = ("# L\n\n| ID | Decision (what) | Owner / role | Opened (date) | Due (clock) | Status |\n"
            "|---|---|---|---|---|---|\n| DL-04 | Old | Jo | 2026-07-01 | 2026-07-03 | open |\n")
    log = make_log(tmp_path, text)
    run(open_args(), tmp_path)
    assert f"| DL-05 | Pick a vendor | Jane | {FRIDAY} | {TUESDAY} | open |" in log.read_text(encoding="utf-8")


def test_open_with_columns_in_a_different_order_fills_each_by_name(tmp_path):
    text = ("# L\n\n| status | owner | id | decision | due | opened |\n|---|---|---|---|---|---|\n")
    log = make_log(tmp_path, text)
    run(open_args(), tmp_path)
    assert f"| open | Jane | DL-01 | Pick a vendor | {TUESDAY} | {FRIDAY} |" in log.read_text(encoding="utf-8")


# --- decide ---

def decide_args(ident="DL-01", by="Matt K", resolution="Use Entra ID", *extra):
    return ["decide", "--repo", ".", "--id", ident, "--by", by, "--resolution", resolution,
            "--decided", "2026-10-05", *extra]


@pytest.mark.parametrize("eol", ["\n", "\r\n"])
def test_decide_changes_only_the_decision_and_status_cells_of_that_row(tmp_path, eol):
    log = make_log(tmp_path, REAL_LOG, eol)
    before = log.read_bytes().decode("utf-8").split(eol)
    proc = run(decide_args(), tmp_path)
    assert proc.returncode == 0, proc.stderr
    after = log.read_bytes().decode("utf-8").split(eol)
    assert len(after) == len(before)
    changed = [i for i, (a, b) in enumerate(zip(before, after)) if a != b]
    assert len(changed) == 1 and before[changed[0]].startswith("| DL-01")
    new = after[changed[0]]
    assert new == ("| DL-01 | Pick the auth provider — decided by Matt K on 2026-10-05: Use Entra ID  "
                   "| Jane  | 2026-07-07 | 2026-07-09            | decided   |")
    if eol == "\r\n":
        assert re.search(rb"(?<!\r)\n", log.read_bytes()) is None


def test_decide_then_the_report_shows_it_no_longer_open(tmp_path):
    log = make_log(tmp_path, REAL_LOG)
    assert [d["id"] for d in td.summarize(td.parse_decisions(log))["open_decisions"]] == ["DL-01"]
    run(decide_args(), tmp_path)
    report = json.loads(run(["--repo", ".", "--json"], tmp_path).stdout)
    assert report["open"] == 0
    assert td.is_open(td.parse_decisions(log)[0]) is False
    assert "No open decisions." in run(["--repo", "."], tmp_path).stdout


def test_decide_json_shape(tmp_path):
    make_log(tmp_path, REAL_LOG)
    out = json.loads(run(decide_args() + ["--json"], tmp_path).stdout)
    assert out == {"id": "DL-01", "status": "decided", "decided": "2026-10-05", "by": "Matt K",
                   "path": ".sdlc/decision-log.md"}


def test_decide_id_is_case_insensitive(tmp_path):
    make_log(tmp_path, REAL_LOG)
    assert run(decide_args("dl-01"), tmp_path).returncode == 0


def test_decide_on_a_row_with_no_trailing_pipe_and_no_final_newline(tmp_path):
    text = "# L\n\n" + HEADER + "| DL-01 | Pick | Jane | 2026-07-07 | 2026-07-09 | open"
    log = make_log(tmp_path, text)
    assert run(decide_args(), tmp_path).returncode == 0
    d = td.parse_decisions(log)[0]
    assert d["status"] == "decided" and d["decision"].startswith("Pick — decided by Matt K")


# --- refusals leave the file untouched ---

@pytest.mark.parametrize("args", [
    open_args(decision="  "),
    open_args(owner=" "),
    open_args(opened="not-a-date"),
    decide_args("DL-99"),
    decide_args("DL-02"),                       # already decided
    decide_args(resolution="  "),
    decide_args(by=" "),
    ["decide", "--repo", ".", "--id", "DL-01", "--by", "M", "--resolution", "r", "--decided", "13/13/13"],
], ids=["empty-decision", "empty-owner", "bad-opened", "unknown-id", "already-decided",
        "empty-resolution", "empty-by", "bad-decided"])
def test_refusal_exits_1_with_message_on_stderr_and_file_unchanged(tmp_path, args):
    log = make_log(tmp_path, REAL_LOG)
    before = log.read_bytes()
    proc = run(args, tmp_path)
    assert proc.returncode == 1
    assert proc.stdout == "" and proc.stderr.startswith("Error:")
    assert log.read_bytes() == before


def test_decide_id_that_appears_only_in_prose_is_unknown(tmp_path):
    log = make_log(tmp_path, REAL_LOG.replace("Some prose.", "Parked as DL-07."))
    before = log.read_bytes()
    proc = run(decide_args("DL-07"), tmp_path)
    assert proc.returncode == 1 and log.read_bytes() == before


def test_decide_with_no_log_exits_1_and_creates_nothing(tmp_path):
    proc = run(decide_args(), tmp_path)
    assert proc.returncode == 1
    assert not (tmp_path / ".sdlc").exists()


def test_refused_open_does_not_create_the_log(tmp_path):
    assert run(open_args(decision=""), tmp_path).returncode == 1
    assert not (tmp_path / ".sdlc").exists()


def test_unrecognised_header_exits_1_naming_the_headers_found(tmp_path):
    text = "# L\n\n| id | question | who | opened | due | state |\n|---|---|---|---|---|---|\n"
    log = make_log(tmp_path, text)
    before = log.read_bytes()
    proc = run(open_args(), tmp_path)
    assert proc.returncode == 1
    for header in ("id", "question", "who", "state"):
        assert header in proc.stderr
    assert log.read_bytes() == before


def test_file_with_no_table_exits_1_unchanged(tmp_path):
    log = make_log(tmp_path, "# Decision Log\n\nNothing here yet.\n")
    before = log.read_bytes()
    assert run(open_args(), tmp_path).returncode == 1
    assert log.read_bytes() == before


# --- CLI shape ---

def test_state_mode_writes_the_sibling_log_and_reports_a_repo_relative_path(tmp_path):
    log = make_log(tmp_path, REAL_LOG)
    state = tmp_path / ".sdlc" / "state.yaml"
    state.write_text("x: 1\n", encoding="utf-8")
    args = ["open", "--state", str(state), "--decision", "q", "--owner", "o", "--opened", FRIDAY, "--json"]
    out = json.loads(run(args, tmp_path).stdout)
    assert out["path"] == ".sdlc/decision-log.md" and out["id"] == "DL-03"
    assert ids_in_rows(log)[-1] == "DL-03"


def test_state_and_repo_together_is_a_usage_error(tmp_path):
    make_log(tmp_path, REAL_LOG)
    assert run(["--state", "s.yaml", "open", "--repo", ".", "--decision", "q", "--owner", "o"],
               tmp_path).returncode == 2


def test_missing_required_verb_arguments_is_a_usage_error(tmp_path):
    assert run(["open", "--repo", "."], tmp_path).returncode == 2


def test_global_options_before_the_verb_are_honoured(tmp_path):
    make_log(tmp_path, REAL_LOG)
    proc = run(["--repo", ".", "--json", "open", "--decision", "q", "--owner", "o"], tmp_path)
    assert proc.returncode == 0 and json.loads(proc.stdout)["id"] == "DL-03"


def test_open_accepts_phase_without_storing_it(tmp_path):
    log = make_log(tmp_path, REAL_LOG)
    assert run(open_args() + ["--phase", "requirements"], tmp_path).returncode == 0
    assert "requirements" not in log.read_text(encoding="utf-8")
