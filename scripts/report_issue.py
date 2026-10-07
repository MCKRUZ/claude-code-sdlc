"""Bugs in the PRODUCT the team is building, from report to fix — the I/O CLI behind
`/sdlc-report-issue`.

The rules live in `issue_model.py` (the questions, the minimum, the refusals, the lifecycle);
this file is the part that touches the repository. A report is written ONLY when it clears the
minimum: every gap is listed and nothing is written (exit 1). An AI-looking name or a
secret-shaped string is refused outright (exit 2) — the file is shared with a code host and
cannot be un-published.

The lifecycle (issue_model.TRANSITIONS; a report is a record, not a ticket):

  new ──triage confirmed──▶ triaged ──prioritize──▶ prioritized ──promote──▶ promoted ──sync──▶ fixed
   │        │ needs-info ──▶ needs-info ──▶ (triage again)                 (a `type: bugfix` spec; `--slate`
   │        │ duplicate / wont-fix ──▶ closed                                puts it into the target sprint)
   └── file (orthogonal: the report on GitHub / Azure DevOps, any time)      reopen ──▶ new

Verbs
  questions    The question plan, optionally for one channel of the product (`--json` for the app)
  env          The build under test: repository, branch, commit, code host, this machine (`--json`)
  new          Validate, copy the screenshots in, write `.sdlc/issues/ISS-NNNN-<slug>.md`, append the ledger
  show         One report in full, with the actions the lifecycle allows from its status — and why
               not, for the ones it refuses (`--json` for the app's buttons)
  check        Re-validate an existing report against the minimum (exit 1 when it falls short)
  list         The queue — what needs a decision first (`--json` carries counts, never per-person totals)
  triage       Review: confirmed | needs-info (--question) | duplicate (--of) | wont-fix (--reason), by
               someone OTHER than the reporter (`--override --reason` for a team of one)
  prioritize   P1 | P2 | P3 and a target sprint, confirming or changing the report's proposal
  promote      Scaffold a `type: bugfix` spec through `new_spec.py` with the confirmed risk tier;
               `--slate` also slates it into the target sprint through `sprint.py slate`
  note         A dated note by a named person (the reporter's answer to needs-info, a finding)
  reopen       A closed report back to `new`, with a reason
  sync         Promoted reports whose bugfix spec is `status: merged` become `fixed`
  file         The report on the code host (`gh issue create` / `az boards work-item create --type Bug`);
               `--dry-run` prints the exact argv instead
  set-status   fixed | wont-fix | duplicate by a named human, under the lifecycle's rules

Standalone or Workflow (CLAUDE.md design rule):
  - Workflow:   --state .sdlc/state.yaml   (repo root = the directory containing .sdlc/)
  - Standalone: --repo <path>              (any folder; `.sdlc/issues/` is created under it)

Exit codes: reads 0; writes 0 done · 1 not done (a gap, the lifecycle, a CLI that said no) ·
2 refused (AI name, secret). `check` 1 when the report falls short.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
import issue_model as im  # noqa: E402

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_PATH = PLUGIN_ROOT / "templates" / "issues" / "issue-report.md"
ISSUES_DIR = Path(".sdlc") / "issues"
LEDGER = Path(".sdlc") / "metrics" / "issue-log.jsonl"
PROBE_TIMEOUT_S = 10
SIBLING_TIMEOUT_S = 90
AZ_ENV = {"AZURE_EXTENSION_USE_DYNAMIC_INSTALL": "no", "AZURE_CORE_COLLECT_TELEMETRY": "no"}
SPRINT_ID_RE = re.compile(r"^S\d{2,}$")
# One frontmatter field, one bare word: `status` (a reader greps `^status: triaged`).
BARE_FIELDS = {"status"}


class Refused(Exception):
    """Exit 2: nothing is written, and the reason is not a gap the person can fill in."""


class NotDone(Exception):
    """Exit 1: a gap, the lifecycle, a CLI that said no. Nothing is written."""

    def __init__(self, message: str, gaps: list[str] | None = None):
        super().__init__(message)
        self.gaps = gaps or []


# --- repo and files ------------------------------------------------------------------------------

def resolve_repo_root(args) -> Path:
    if getattr(args, "state", None):
        state_path = Path(args.state)
        if not state_path.is_file():
            raise NotDone(f"state file not found: {state_path}")
        return state_path.resolve().parent.parent
    return Path(getattr(args, "repo", None) or ".").resolve()


def source_args(args) -> list[str]:
    """The `--state`/`--repo` pair to hand a sibling script."""
    if getattr(args, "state", None):
        return ["--state", str(Path(args.state).resolve())]
    return ["--repo", str(Path(getattr(args, "repo", None) or ".").resolve())]


def rel(path: Path, root: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def now_ts() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def issue_files(root: Path) -> list[Path]:
    d = root / ISSUES_DIR
    if not d.is_dir():
        return []
    return sorted(p for p in d.iterdir() if p.is_file() and p.suffix == ".md" and im.ISSUE_FILE_RE.match(p.name))


def split_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    try:
        fm = yaml.safe_load(text[3:end]) or {}
    except yaml.YAMLError:
        fm = {}
    body = text[end + 4:]
    return (fm if isinstance(fm, dict) else {}), body.lstrip("\r\n")


def find_issue(root: Path, ref: str) -> Path:
    """`ISS-0007`, `0007`, a filename, or a path — resolved to the report file or NotDone."""
    ref = (ref or "").strip()
    if not ref:
        raise NotDone("--issue is required (an id such as ISS-0007, or the report's path)")
    p = Path(ref)
    if p.is_file():
        return p.resolve()
    if (root / p).is_file():
        return (root / p).resolve()
    m = re.match(r"^(?:ISS-)?(\d{4})$", ref, re.IGNORECASE)
    if m:
        for f in issue_files(root):
            if f.name.startswith(f"ISS-{m.group(1)}-"):
                return f
        raise NotDone(f"no report ISS-{m.group(1)} under {ISSUES_DIR.as_posix()}/")
    raise NotDone(f"'{ref}' is neither a report id nor a file")


def sections(body: str) -> dict[str, str]:
    """`## Heading` -> its text, for the verbs that read what `new` wrote."""
    out: dict[str, str] = {}
    current: str | None = None
    lines: list[str] = []
    for line in body.splitlines():
        m = re.match(r"^## +(.+?)\s*$", line)
        if m:
            if current is not None:
                out[current] = "\n".join(lines).strip()
            current, lines = m.group(1), []
        elif current is not None:
            lines.append(line)
    if current is not None:
        out[current] = "\n".join(lines).strip()
    return out


def _q(value) -> str:
    """A one-line YAML double-quoted scalar: JSON strings are valid YAML, escapes included."""
    return json.dumps("" if value is None else str(value), ensure_ascii=False)


def write_ledger(root: Path, event: dict) -> Path:
    path = root / LEDGER
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(event, ensure_ascii=False) + "\n")
    return path


def set_field(text: str, field: str, value: str) -> str:
    """Replace one frontmatter line, every other byte untouched; a field the file lacks is added
    at the end of the block. `status` stays a bare word; everything else is quoted."""
    fm_end = text.find("\n---", 3)
    head, rest = text[:fm_end], text[fm_end:]
    rendered = value if field in BARE_FIELDS else _q(value)
    pattern = rf"^{re.escape(field)}:[^\r\n]*"
    if re.search(pattern, head, flags=re.MULTILINE):
        head = re.sub(pattern, lambda _m: f"{field}: {rendered}", head, count=1, flags=re.MULTILINE)
    else:
        head = head.rstrip("\r\n") + f"\n{field}: {rendered}"
    return head + rest


def append_history(text: str, line: str) -> str:
    marker = "<!-- {{history}} -->"
    if marker in text:
        return text.replace(marker, f"- {line}")
    return text.rstrip("\n") + f"\n- {line}\n"


def _require_person(name: str | None, what: str) -> str:
    clean = (name or "").strip()
    if not clean:
        raise Refused(f"--by is required: the person {what}, by name")
    if im.is_ai_actor(clean):
        raise Refused(f"--by '{clean}' reads as an AI/automation, not a person")
    return clean


def _same_person(a: str | None, b: str | None) -> bool:
    norm = lambda s: re.sub(r"[^a-z0-9]", "", str(s or "").lower().lstrip("@"))  # noqa: E731
    return bool(norm(a)) and norm(a) == norm(b)


def _sibling(root: Path, script: str, args: list[str]) -> subprocess.CompletedProcess:
    """Run another plugin script the way a person would — never by importing its internals."""
    cmd = [sys.executable, str(PLUGIN_ROOT / "scripts" / script), *args]
    try:
        return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                              timeout=SIBLING_TIMEOUT_S, check=False, cwd=str(root), env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise NotDone(f"{script} did not run: {exc}")


# --- questions ----------------------------------------------------------------------------------

def verb_questions(args, _root: Path | None) -> int:
    channel = im.normalize_channel(args.channel) if args.channel else None
    if args.channel and channel is None:
        raise NotDone(f"'{args.channel}' is not a channel — one of {', '.join(im.CHANNELS)}")
    plan = im.question_plan(channel)
    if args.json:
        print(json.dumps({"channel": channel, "questions": plan,
                          "lifecycle": {"statuses": list(im.STATUSES), "triage_verdicts": list(im.TRIAGE_VERDICTS),
                                        "priorities": list(im.PRIORITIES), "priority_labels": im.PRIORITY_LABELS,
                                        "status_labels": im.STATUS_LABELS, "triage_verdict_labels": im.TRIAGE_VERDICT_LABELS},
                          "minimum": {"title_chars": [im.MIN_TITLE_CHARS, im.MAX_TITLE_CHARS],
                                      "what_happened_chars": im.MIN_WHAT_CHARS, "expected_chars": im.MIN_EXPECTED_CHARS,
                                      "screenshots": 1, "screenshot_bytes": im.MAX_SCREENSHOT_BYTES}}, indent=2, ensure_ascii=False))
        return 0
    print(f"Questions for a bug report{f' seen on the {channel} channel' if channel else ''}:")
    for q in plan:
        req = "required" if q["required"] else "optional"
        only = f" [{', '.join(q['channels'])} only]" if q.get("channels") and channel is None else ""
        print(f"  {q['id']:<20} {q['kind']:<9} {req:<8} {q['prompt']}{only}")
        if q.get("options"):
            print(f"  {'':<20} {'':<9} {'':<8} " + " | ".join(f"{o['value']} — {o['label']}" for o in q["options"]))
        if q.get("hint"):
            print(f"  {'':<20} {'':<9} {'':<8} ({q['hint']})")
    return 0


# --- env ----------------------------------------------------------------------------------------

def _git(root: Path, *args: str) -> str | None:
    if shutil.which("git") is None:
        return None
    try:
        proc = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True, encoding="utf-8",
                              errors="replace", timeout=PROBE_TIMEOUT_S, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return proc.stdout.strip() or None if proc.returncode == 0 else None


def plugin_version() -> str | None:
    try:
        manifest = json.loads((PLUGIN_ROOT / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8"))
        v = manifest.get("version")
        return str(v) if v else None
    except (OSError, ValueError):
        return None


def gather_env(root: Path, app_version: str | None = None) -> dict:
    """What a reporter rarely knows how to find about the build under test. Never a guess: a fact
    that is not there reads null. The product's repository is the subject; the tooling that wrote
    the report is recorded for the record only."""
    try:
        import code_host as ch
        detection = ch.detect_host(root)
        remote = detection.remote
        repo = {"host": detection.host, "slug": remote.slug if remote else None, "web_url": remote.web_url if remote else None,
                "branch": _git(root, "rev-parse", "--abbrev-ref", "HEAD"), "commit": _git(root, "rev-parse", "--short", "HEAD"),
                "describe": _git(root, "describe", "--tags", "--always")}
    except Exception as exc:  # pragma: no cover — the host is a nice-to-have, never a blocker
        repo = {"host": "unknown", "slug": None, "web_url": None, "branch": None, "commit": None, "describe": None, "detail": str(exc)}
    return {
        "repo": repo,
        "machine": {"os": platform.platform(), "python": platform.python_version()},
        "tooling": {"plugin_version": plugin_version(), "app_version": app_version or None},
        "captured_at": now_ts(),
    }


def verb_env(args, root: Path) -> int:
    env = gather_env(root, args.app_version)
    if args.json:
        print(json.dumps(env, indent=2, ensure_ascii=False))
        return 0
    r = env["repo"]
    print("The build under test, as far as this machine can tell:")
    print(f"  {'repository':<14} {r.get('slug') or 'no origin remote'} ({r.get('host')})")
    print(f"  {'branch':<14} {r.get('branch') or 'no repository'}")
    print(f"  {'commit':<14} {r.get('commit') or '—'}" + (f"  ({r.get('describe')})" if r.get("describe") and r.get("describe") != r.get("commit") else ""))
    print(f"  {'this machine':<14} {env['machine']['os']}")
    print(f"  {'written with':<14} plugin {env['tooling']['plugin_version'] or 'unknown'}" + (f", app {env['tooling']['app_version']}" if env["tooling"]["app_version"] else ""))
    return 0


# --- new ----------------------------------------------------------------------------------------

def _kv_pairs(values: list[str], flag: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for item in values or []:
        if "=" not in item:
            raise NotDone(f"{flag} expects KEY=VALUE, got '{item}'")
        k, v = item.split("=", 1)
        k = k.strip()
        if not re.match(r"^[a-z][a-z0-9_]*$", k):
            raise NotDone(f"{flag}: '{k}' is not a field name (lower-case letters, digits, underscores)")
        out[k] = v
    return out


def build_report(args) -> tuple[dict, list[Path], dict]:
    """The report dict `issue_model.validate` reads, the screenshot paths, and the environment facts."""
    answers = _kv_pairs(args.answer, "--answer")
    facts: dict = {}
    if args.env_json:
        try:
            facts = json.loads(Path(args.env_json).read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise NotDone(f"--env-json: {exc}")
        if not isinstance(facts, dict):
            raise NotDone("--env-json must hold one JSON object")
    product_version = (args.product_version or "").strip()
    if not product_version and (args.environment or "") == "local":
        repo = facts.get("repo") if isinstance(facts.get("repo"), dict) else {}
        if repo.get("branch") or repo.get("commit"):
            product_version = f"{repo.get('branch') or '?'} @ {repo.get('commit') or '?'}"
    report = {
        "channel": args.channel, "title": args.title or "", "what_happened": args.what or "", "expected": args.expected or "",
        "steps": "\n".join(args.steps or []), "environment": args.environment or "", "product_version": product_version,
        "severity": args.severity or "", "frequency": args.frequency or "", "data_impact": args.data_impact or "",
        "persona": args.persona or "", "reporter_role": args.reporter_role or "", "spec": args.spec or "",
        "no_client_data": bool(args.no_client_data), "escaped_from": args.escaped_from or "", **answers,
    }
    return report, [Path(p) for p in (args.screenshot or [])], facts


def _cell(value) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ").strip()


def render_report(issue_id: str, report: dict, facts: dict, shots_rel: list[str], by: str, ts: str) -> str:
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    channel = report["channel"]
    fm_lines = [
        "---",
        f"issue: {_q(issue_id)}",
        f"title: {_q(report['title'].strip())}",
        "status: new",
        f"channel: {_q(channel)}",
        f"environment: {_q(report['environment'])}",
        f"product_version: {_q(report.get('product_version') or '')}",
        f"severity: {_q(report['severity'])}",
        f"frequency: {_q(report['frequency'])}",
        f"data_impact: {_q(report['data_impact'])}",
        f"persona: {_q(report['persona'].strip())}",
        f"reporter_role: {_q(report['reporter_role'])}",
        f"spec: {_q(report.get('spec') or '')}",
        f"reported_by: {_q(by)}",
        f"reported_at: {_q(ts)}",
        f"screenshots: {len(shots_rel)}",
        'priority: ""',
        'target_sprint: ""',
        'triaged_by: ""',
        'triage_verdict: ""',
        'prioritized_by: ""',
        'duplicate_of: ""',
        'bugfix_spec: ""',
        'filed_host: ""',
        'filed_url: ""',
        'filed_id: ""',
        f"escaped_from: {_q(report.get('escaped_from') or '')}",
        "---",
    ]
    _, body = split_frontmatter(template)
    body = body.replace("# ISS-NNNN — <title>", f"# {issue_id} — {report['title'].strip()}")

    steps = [s.strip() for s in str(report.get("steps") or "").splitlines() if s.strip()]
    steps_md = "\n".join(f"{i}. {s}" for i, s in enumerate(steps, 1))

    where_rows = [("Channel", im.CHANNEL_LABELS.get(channel, channel))]
    if im.CHANNEL_DESCRIPTOR.get(channel):
        where_rows.append(("Channel descriptor", f"channels/{im.CHANNEL_DESCRIPTOR[channel]}.yaml"))
    prompts = {q["id"]: q["prompt"].rstrip("?") for q in im.CHANNEL_QUESTIONS}
    known = set(im.CORE_FIELDS) | {"escaped_from"}
    for q in im.CHANNEL_QUESTIONS:
        if channel in (q["channels"] or []) and str(report.get(q["id"]) or "").strip():
            where_rows.append((prompts[q["id"]], str(report[q["id"]]).strip()))
    for k, v in report.items():
        if k not in known and k not in im.CHANNEL_FIELD_IDS and str(v or "").strip():
            where_rows.append((k, str(v).strip()))
    where_md = "| Question | Answer |\n|---|---|\n" + "\n".join(f"| {k} | {_cell(v)} |" for k, v in where_rows)

    repo = facts.get("repo") if isinstance(facts.get("repo"), dict) else {}
    machine = facts.get("machine") if isinstance(facts.get("machine"), dict) else {}
    tooling = facts.get("tooling") if isinstance(facts.get("tooling"), dict) else {}
    env_rows = [
        ("environment", im.ENVIRONMENT_LABELS.get(report["environment"], report["environment"])),
        ("product_version", report.get("product_version") or None),
        ("repository", repo.get("slug")),
        ("branch", repo.get("branch")),
        ("commit", repo.get("commit")),
        ("code_host", repo.get("host")),
        ("reporter_machine", machine.get("os")),
        ("written_with", f"plugin {tooling.get('plugin_version')}" + (f", app {tooling.get('app_version')}" if tooling.get("app_version") else "") if tooling.get("plugin_version") else None),
    ]
    env_md = "| Fact | Value |\n|---|---|\n" + "\n".join(
        f"| {k} | {_cell(v) if v not in (None, '') else 'not recorded'} |" for k, v in env_rows)

    shots_md = "\n".join(f"![screenshot {i}]({p})" for i, p in enumerate(shots_rel, 1))
    privacy = f"{by} confirmed on {ts[:10]}: nothing in the screenshots or this report is client data, personal data or a secret."
    history = f"- {ts} — reported by {by}"

    body = body.replace("<!-- {{what_happened}} -->", report["what_happened"].strip())
    body = body.replace("<!-- {{expected}} -->", report["expected"].strip())
    body = body.replace("<!-- {{steps}} -->", steps_md)
    body = body.replace("<!-- {{where}} -->", where_md)
    body = body.replace("<!-- {{environment}} -->", env_md)
    body = body.replace("<!-- {{screenshots}} -->", shots_md)
    body = body.replace("<!-- {{privacy}} -->", privacy)
    body = body.replace("<!-- {{history}} -->", history)
    return "\n".join(fm_lines) + "\n\n" + body


def record_escaped_bug(args, root: Path, issue_id: str, check: str) -> str | None:
    """The scorecard's `escaped_bug` event, through scorecard.py itself (never a hand-written line
    in its ledger). A failure is a warning on the report, never a reason not to write it."""
    try:
        proc = _sibling(root, "scorecard.py", ["record", *source_args(args), "--type", "escaped_bug",
                                               "--field", f"which_check={check}", "--field", f"issue={issue_id}"])
    except NotDone as exc:
        return str(exc)
    if proc.returncode != 0:
        return f"scorecard.py record escaped_bug exited {proc.returncode}: {(proc.stderr or proc.stdout).strip()}"
    return None


def verb_new(args, root: Path) -> int:
    report, shots, facts = build_report(args)
    refused = im.refusals(report, args.by)
    if refused:
        raise Refused("\n".join(refused))
    blocking, advisory = im.validate(report, shots)
    if blocking:
        raise NotDone("not written — the report falls short of the minimum", blocking)

    by = args.by.strip()
    ts = now_ts()
    issues_dir = root / ISSUES_DIR
    issues_dir.mkdir(parents=True, exist_ok=True)
    issue_id = im.next_issue_id(p.name for p in issues_dir.iterdir())
    slug = im.slugify(report["title"])
    report_path = issues_dir / f"{issue_id}-{slug}.md"
    shots_dir = issues_dir / issue_id
    shots_dir.mkdir(exist_ok=True)
    shots_rel: list[str] = []
    for i, shot in enumerate(shots, 1):
        kind = im.image_kind(shot) or "png"
        ext = {"jpeg": "jpg"}.get(kind, kind)
        target = shots_dir / f"screenshot-{i}.{ext}"
        shutil.copyfile(shot, target)
        shots_rel.append(f"{issue_id}/{target.name}")

    report_path.write_text(render_report(issue_id, report, facts, shots_rel, by, ts), encoding="utf-8", newline="\n")
    ledger = write_ledger(root, {
        "timestamp": ts, "event": "reported", "issue": issue_id, "title": report["title"].strip(), "channel": report["channel"],
        "environment": report["environment"], "severity": report["severity"], "frequency": report["frequency"],
        "data_impact": report["data_impact"], "reporter_role": report["reporter_role"], "spec": report.get("spec") or None,
        "by": by, "screenshots": len(shots_rel), "escaped_from": report.get("escaped_from") or None, "path": rel(report_path, root),
    })
    warnings: list[str] = []
    if report.get("escaped_from"):
        w = record_escaped_bug(args, root, issue_id, report["escaped_from"])
        if w:
            warnings.append(w)

    result = {"ok": True, "issue": issue_id, "status": "new", "path": rel(report_path, root),
              "screenshots": [f"{ISSUES_DIR.as_posix()}/{s}" for s in shots_rel], "ledger": rel(ledger, root),
              "proposed_risk": im.proposed_risk(report), "proposed_priority": im.proposed_priority(report),
              "advisory": advisory, "warnings": warnings}
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    n = len(shots_rel)
    print(f"Written: {result['path']} ({n} screenshot{'s' if n != 1 else ''}) — status new, awaiting review")
    for a in advisory:
        print(f"  advisory: {a}")
    for w in warnings:
        print(f"  warning: {w}")
    print(f"Proposal: priority {result['proposed_priority']}, bugfix tier {result['proposed_risk']} — a reviewer confirms or changes both")
    print(f"Next: someone other than {by} reviews it — `report_issue.py triage --issue {issue_id} --verdict confirmed --by \"<reviewer>\"`")
    return 0


# --- reading a report back -----------------------------------------------------------------------

def read_report(path: Path) -> tuple[dict, dict[str, str], str]:
    text = path.read_text(encoding="utf-8")
    fm, body = split_frontmatter(text)
    return fm, sections(body), text


def report_from_file(fm: dict, secs: dict[str, str], path: Path) -> tuple[dict, list[Path]]:
    where: dict[str, str] = {}
    prompts = {q["prompt"].rstrip("?"): q["id"] for q in im.CHANNEL_QUESTIONS}
    for line in secs.get("Where", "").splitlines():
        m = re.match(r"^\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|$", line)
        if m and m.group(1) in prompts:
            where[prompts[m.group(1)]] = m.group(2)
    steps = "\n".join(re.sub(r"^\d+\.\s*", "", s) for s in secs.get("Steps to reproduce", "").splitlines() if s.strip())
    report = {
        "channel": fm.get("channel"), "title": fm.get("title") or "", "what_happened": secs.get("What happened", ""),
        "expected": secs.get("What you expected", ""), "steps": steps, "environment": fm.get("environment") or "",
        "product_version": fm.get("product_version") or "", "severity": fm.get("severity") or "", "frequency": fm.get("frequency") or "",
        "data_impact": fm.get("data_impact") or "", "persona": fm.get("persona") or "", "reporter_role": fm.get("reporter_role") or "",
        "spec": fm.get("spec") or "", "escaped_from": fm.get("escaped_from") or "",
        "no_client_data": "confirmed" in secs.get("Privacy check", ""), **where,
    }
    shots = [path.parent / m.group(1) for m in re.finditer(r"!\[[^\]]*\]\(([^)]+)\)", secs.get("Screenshots", ""))]
    return report, shots


def _status(fm: dict) -> str:
    s = str(fm.get("status") or "new").strip()
    return s if s in im.STATUSES else "new"


def allowed_actions(fm: dict, issue_id: str) -> dict[str, dict]:
    """What the lifecycle allows from this status, and why not where it refuses — the plugin's own
    sentences, so the app's buttons disable with them verbatim."""
    status = _status(fm)
    out: dict[str, dict] = {}
    for action in ("triage", "prioritize", "promote", "fixed", "wont-fix", "duplicate", "reopen"):
        key = "triage:confirmed" if action == "triage" else action
        nxt = im.next_status(key, status)
        out[action] = {"ok": nxt is not None, "reason": None if nxt is not None else im.transition_refusal(key, status, issue_id), "to": nxt}
    filed = bool(fm.get("filed_url"))
    out["file"] = {"ok": not filed, "reason": f"{issue_id} is already filed: {fm.get('filed_url')}" if filed else None, "to": None}
    out["note"] = {"ok": True, "reason": None, "to": None}
    return out


def row_of(fm: dict, path: Path, root: Path) -> dict:
    report, _ = report_from_file(fm, sections(split_frontmatter(path.read_text(encoding="utf-8"))[1]), path)
    return {
        "issue": fm.get("issue") or path.name[:8], "title": fm.get("title") or "", "status": _status(fm),
        "channel": fm.get("channel") or "", "environment": fm.get("environment") or "", "product_version": fm.get("product_version") or None,
        "severity": fm.get("severity") or "", "frequency": fm.get("frequency") or "", "data_impact": fm.get("data_impact") or "",
        "persona": fm.get("persona") or "", "reporter_role": fm.get("reporter_role") or "", "spec": fm.get("spec") or None,
        "priority": fm.get("priority") or None, "target_sprint": fm.get("target_sprint") or None,
        "triaged_by": fm.get("triaged_by") or None, "triage_verdict": fm.get("triage_verdict") or None,
        "prioritized_by": fm.get("prioritized_by") or None, "duplicate_of": fm.get("duplicate_of") or None,
        "bugfix_spec": fm.get("bugfix_spec") or None, "reported_by": fm.get("reported_by") or "", "reported_at": fm.get("reported_at") or "",
        "screenshots": int(fm.get("screenshots") or 0), "filed_host": fm.get("filed_host") or None, "filed_url": fm.get("filed_url") or None,
        "escaped_from": fm.get("escaped_from") or None, "path": rel(path, root),
        "proposed_risk": im.proposed_risk(report), "proposed_priority": im.proposed_priority(report),
    }


def verb_show(args, root: Path) -> int:
    path = find_issue(root, args.issue)
    fm, secs, _ = read_report(path)
    issue_id = str(fm.get("issue") or path.name[:8])
    row = row_of(fm, path, root)
    screenshots = [f"{ISSUES_DIR.as_posix()}/{m.group(1)}" for m in re.finditer(r"!\[[^\]]*\]\(([^)]+)\)", secs.get("Screenshots", ""))]
    doc = {**row, "sections": {k: v for k, v in secs.items() if k != "Screenshots"}, "screenshot_paths": screenshots,
           "actions": allowed_actions(fm, issue_id)}
    if args.json:
        print(json.dumps(doc, indent=2, ensure_ascii=False))
        return 0
    print(f"{issue_id} — {row['title']}")
    print(f"  {row['status']} · {row['environment']} · {row['channel']} · severity {row['severity']} · {row['frequency']} · data {row['data_impact']}"
          + (f" · {row['priority']}" if row["priority"] else "") + (f" → {row['target_sprint']}" if row["target_sprint"] else "")
          + (f" · spec {row['bugfix_spec']}" if row["bugfix_spec"] else ""))
    print(f"  reported by {row['reported_by']} as {row['persona']} ({row['reporter_role']}) on {row['reported_at'][:10]}")
    print(f"  proposal: priority {row['proposed_priority']}, tier {row['proposed_risk']}")
    for heading in ("What happened", "What you expected", "Steps to reproduce"):
        if secs.get(heading):
            print(f"  {heading}: {secs[heading].splitlines()[0]}" + (" …" if len(secs[heading].splitlines()) > 1 else ""))
    print("  can: " + ", ".join(k for k, v in doc["actions"].items() if v["ok"]))
    for k, v in doc["actions"].items():
        if not v["ok"]:
            print(f"  not {k}: {v['reason']}")
    return 0


def verb_check(args, root: Path) -> int:
    path = find_issue(root, args.issue)
    fm, secs, _ = read_report(path)
    report, shots = report_from_file(fm, secs, path)
    blocking, advisory = im.validate(report, shots)
    verdict = "COMPLETE" if not blocking else "INCOMPLETE"
    if args.json:
        print(json.dumps({"issue": fm.get("issue"), "path": rel(path, root), "verdict": verdict, "blocking": blocking, "advisory": advisory,
                          "proposed_risk": im.proposed_risk(report), "proposed_priority": im.proposed_priority(report)}, indent=2, ensure_ascii=False))
    else:
        print(f"{fm.get('issue', path.name)}: {verdict}")
        for b in blocking:
            print(f"  blocking: {b}")
        for a in advisory:
            print(f"  advisory: {a}")
    return 1 if blocking else 0


# --- list ---------------------------------------------------------------------------------------

PRIORITY_ORDER = {"P1": 0, "P2": 1, "P3": 2, None: 3}


def list_rows(root: Path) -> list[dict]:
    rows = []
    for path in issue_files(root):
        fm, _ = split_frontmatter(path.read_text(encoding="utf-8"))
        rows.append(row_of(fm, path, root))
    rows.sort(key=lambda r: (im.QUEUE_ORDER.get(r["status"], 99), PRIORITY_ORDER.get(r["priority"], 3), r["issue"]), )
    # Within a status group the newest report first; the sort above is stable, so reverse the id
    # inside each (status, priority) run.
    out: list[dict] = []
    i = 0
    while i < len(rows):
        j = i
        while j < len(rows) and (rows[j]["status"], rows[j]["priority"]) == (rows[i]["status"], rows[i]["priority"]):
            j += 1
        out.extend(sorted(rows[i:j], key=lambda r: r["issue"], reverse=True))
        i = j
    return out


def verb_list(args, root: Path) -> int:
    rows = list_rows(root)
    counts = {s: sum(1 for r in rows if r["status"] == s) for s in im.STATUSES}
    queue = [r["issue"] for r in rows if r["status"] in ("new", "needs-info")]
    if args.queue:
        rows = [r for r in rows if r["status"] in ("new", "needs-info")]
    if args.status:
        if args.status not in im.STATUSES:
            raise NotDone(f"--status must be one of {', '.join(im.STATUSES)}")
        rows = [r for r in rows if r["status"] == args.status]
    if args.json:
        print(json.dumps({"issues": rows, "count": len(rows), "counts": counts, "queue": queue, "dir": ISSUES_DIR.as_posix()}, indent=2, ensure_ascii=False))
        return 0
    if not rows:
        print("no data — no issue reports" + (" in the queue" if args.queue else " yet (/sdlc-report-issue writes the first)"))
        return 0
    print(f"{'issue':<9} {'status':<12} {'prio':<5} {'severity':<9} {'env':<11} {'channel':<8} title")
    for r in rows:
        print(f"{r['issue']:<9} {r['status']:<12} {r['priority'] or '—':<5} {r['severity']:<9} {r['environment']:<11} {r['channel']:<8} {r['title']}"
              + (f"  → {r['target_sprint']}" if r["target_sprint"] else "") + (f"  → spec {r['bugfix_spec']}" if r["bugfix_spec"] else "")
              + (f"  → {r['filed_url']}" if r["filed_url"] else ""))
    if queue:
        print(f"Queue: {len(queue)} awaiting review ({', '.join(queue)})")
    return 0


# --- the lifecycle verbs ----------------------------------------------------------------------------

def _move(root: Path, path: Path, text: str, fm: dict, action: str, by: str, history_line: str, ledger: dict, fields: dict[str, str]) -> tuple[str, str]:
    """Apply a lifecycle action: the transition, the fields, the history line, the ledger. Returns
    (new_status, written text). Refuses (NotDone) with the model's own sentence."""
    issue_id = str(fm.get("issue") or path.name[:8])
    current = _status(fm)
    nxt = im.next_status(action, current)
    if nxt is None:
        raise NotDone(im.transition_refusal(action, current, issue_id))
    ts = now_ts()
    text = set_field(text, "status", nxt)
    for k, v in fields.items():
        text = set_field(text, k, v)
    text = append_history(text, f"{ts} — {history_line}")
    path.write_text(text, encoding="utf-8", newline="\n")
    write_ledger(root, {"timestamp": ts, "issue": issue_id, "by": by, "from": current, "to": nxt, **ledger})
    return nxt, text


def verb_triage(args, root: Path) -> int:
    by = _require_person(args.by, "reviewing")
    path = find_issue(root, args.issue)
    fm, _, text = read_report(path)
    issue_id = str(fm.get("issue") or path.name[:8])
    verdict = (args.verdict or "").strip()
    if verdict not in im.TRIAGE_VERDICTS:
        raise NotDone(f"--verdict must be one of {', '.join(im.TRIAGE_VERDICTS)}")
    reason = (args.reason or "").strip()
    if _same_person(by, fm.get("reported_by")) and not args.override:
        raise NotDone(f"{issue_id} was reported by {fm.get('reported_by')} — a report is reviewed by someone other than its reporter "
                      f"(another pair of eyes, the method's own rule). A team of one passes `--override --reason \"<why>\"`")
    if args.override and len(reason) < 10:
        raise NotDone("--override needs --reason in your own words (at least 10 characters)")
    fields: dict[str, str] = {"triaged_by": by, "triage_verdict": verdict}
    detail = ""
    if verdict == "needs-info":
        question = (args.question or "").strip()
        if len(question) < 10:
            raise NotDone("needs-info needs --question: what the reporter should add, in a sentence")
        detail = f"asked: {question}"
    elif verdict == "duplicate":
        of = (args.of or "").strip().upper()
        if not im.ISSUE_ID_RE.match(of):
            raise NotDone("duplicate needs --of ISS-NNNN, the report it duplicates")
        if of == issue_id:
            raise NotDone(f"{issue_id} cannot be a duplicate of itself")
        try:
            find_issue(root, of)
        except NotDone:
            raise NotDone(f"--of {of}: no such report")
        fields["duplicate_of"] = of
        detail = f"duplicate of {of}" + (f" — {reason}" if reason else "")
    elif verdict == "wont-fix":
        if len(reason) < 10:
            raise NotDone("wont-fix needs --reason in your own words (at least 10 characters) — the reporter will read it")
        detail = f"won't fix — {reason}"
    else:
        corrections = []
        if args.severity:
            if args.severity not in im.SEVERITIES:
                raise NotDone(f"--severity must be one of {', '.join(im.SEVERITIES)}")
            if args.severity != fm.get("severity"):
                corrections.append(f"severity {fm.get('severity')} → {args.severity}")
                fields["severity"] = args.severity
        if args.data_impact:
            if args.data_impact not in im.DATA_IMPACTS:
                raise NotDone(f"--data-impact must be one of {', '.join(im.DATA_IMPACTS)}")
            if args.data_impact != fm.get("data_impact"):
                corrections.append(f"data impact {fm.get('data_impact')} → {args.data_impact}")
                fields["data_impact"] = args.data_impact
        detail = "confirmed" + (f" ({'; '.join(corrections)})" if corrections else "") + (f" — {reason}" if reason else "")
    history = f"triage by {by}: {detail}" + (f" [override: {reason}]" if args.override and _same_person(by, fm.get("reported_by")) else "")
    status, text = _move(root, path, text, fm, f"triage:{verdict}", by, history,
                         {"event": "triaged", "verdict": verdict, "reason": reason or None, "of": fields.get("duplicate_of"),
                          "question": (args.question or "").strip() or None, "override": bool(args.override)}, fields)
    fm2, _ = split_frontmatter(text)
    report, _ = report_from_file(fm2, sections(split_frontmatter(text)[1]), path)
    result = {"ok": True, "issue": issue_id, "status": status, "verdict": verdict, "triaged_by": by,
              "proposed_priority": im.proposed_priority(report), "proposed_risk": im.proposed_risk(report)}
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    print(f"{issue_id}: {status} — {detail}")
    if status == "triaged":
        print(f"Next: `prioritize --issue {issue_id} --priority {result['proposed_priority']} [--target-sprint SNN]` — {result['proposed_priority']} is the proposal")
    elif status == "needs-info":
        print(f"Next: the reporter answers with `note --issue {issue_id} --note \"…\"`, then triage again")
    return 0


def _sprint_records(args, root: Path) -> list[dict] | None:
    """The sprints sprint.py lists, or None when the list cannot be read (then an id is taken as typed)."""
    try:
        proc = _sibling(root, "sprint.py", ["list", *source_args(args), "--json"])
    except NotDone:
        return None
    if proc.returncode != 0:
        return None
    try:
        doc = json.loads(proc.stdout)
    except ValueError:
        return None
    rows = doc.get("sprints") if isinstance(doc, dict) else None
    return [r for r in rows if isinstance(r, dict)] if isinstance(rows, list) else None


def _check_target_sprint(args, root: Path, sprint_id: str) -> list[str]:
    """Warnings (never refusals) about the target sprint: unknown to sprint.py, or closed."""
    if not SPRINT_ID_RE.match(sprint_id):
        raise NotDone(f"--target-sprint '{sprint_id}' is not a sprint id (S07, S12, …)")
    records = _sprint_records(args, root)
    if records is None:
        return ["the sprint list could not be read; the target sprint is recorded as typed"]
    match = next((r for r in records if r.get("id") == sprint_id), None)
    if records and match is None:
        raise NotDone(f"--target-sprint {sprint_id}: sprint.py lists no such sprint — create it with /sdlc-sprint new, or pick one of "
                      f"{', '.join(r.get('id', '?') for r in records)}")
    if match is not None and match.get("state") == "closed":
        raise NotDone(f"--target-sprint {sprint_id} is closed — pick an open sprint")
    return [] if match is not None else [f"no sprint records yet; {sprint_id} is recorded as typed"]


def verb_prioritize(args, root: Path) -> int:
    by = _require_person(args.by, "prioritizing")
    path = find_issue(root, args.issue)
    fm, secs, text = read_report(path)
    issue_id = str(fm.get("issue") or path.name[:8])
    priority = (args.priority or "").strip().upper()
    report, _ = report_from_file(fm, secs, path)
    proposed = im.proposed_priority(report)
    if not priority:
        raise NotDone(f"--priority is required — the proposal from this report is {proposed} (severity {fm.get('severity')}, data impact "
                      f"{fm.get('data_impact')}, {fm.get('environment')}); a person confirms or changes it")
    if priority not in im.PRIORITIES:
        raise NotDone(f"--priority must be P1, P2 or P3 (the proposal is {proposed})")
    warnings: list[str] = []
    fields = {"priority": priority, "prioritized_by": by}
    target = (args.target_sprint or "").strip().upper()
    if target:
        warnings += _check_target_sprint(args, root, target)
        fields["target_sprint"] = target
    reason = (args.reason or "").strip()
    detail = f"{priority}" + (f" → {target}" if target else "") + (f" — the proposal was {proposed}" if priority != proposed else "") + (f" — {reason}" if reason else "")
    status, _ = _move(root, path, text, fm, "prioritize", by, f"prioritized by {by}: {detail}",
                      {"event": "prioritized", "priority": priority, "proposed_priority": proposed, "target_sprint": target or None, "reason": reason or None},
                      fields)
    result = {"ok": True, "issue": issue_id, "status": status, "priority": priority, "proposed_priority": proposed,
              "target_sprint": target or None, "warnings": warnings, "proposed_risk": im.proposed_risk(report)}
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    print(f"{issue_id}: prioritized {detail}")
    for w in warnings:
        print(f"  warning: {w}")
    print(f"Next: `promote --issue {issue_id} --risk {result['proposed_risk']}" + (" --slate" if target else "") + f" --by \"<name>\"` scaffolds the bugfix spec "
          f"({result['proposed_risk']} is the proposal)")
    return 0


def verb_promote(args, root: Path) -> int:
    by = _require_person(args.by, "confirming the fix is worth a spec")
    path = find_issue(root, args.issue)
    fm, secs, text = read_report(path)
    issue_id = str(fm.get("issue") or path.name[:8])
    current = _status(fm)
    if im.next_status("promote", current) is None:
        raise NotDone(im.transition_refusal("promote", current, issue_id))
    report, _ = report_from_file(fm, secs, path)
    proposed = im.proposed_risk(report)
    risk = (args.risk or "").strip().upper()
    if not risk:
        raise NotDone(f"--risk is required — the proposal from this report is {proposed} (data impact {fm.get('data_impact')}, "
                      f"severity {fm.get('severity')}, {fm.get('environment')}); a person confirms or changes it")
    if risk not in ("HIGH", "MEDIUM", "LOW"):
        raise NotDone(f"--risk must be HIGH, MEDIUM or LOW (the proposal is {proposed})")
    target = str(fm.get("target_sprint") or "").strip()
    if args.slate and not target:
        records = _sprint_records(args, root)
        active = None
        if records:
            try:
                proc = _sibling(root, "sprint.py", ["list", *source_args(args), "--json"])
                active = json.loads(proc.stdout).get("active")
            except (ValueError, NotDone):
                active = None
        if not active:
            raise NotDone("--slate needs a target sprint: prioritize with --target-sprint, or have an active sprint record")
        target = str(active)

    new_args = [*source_args(args), "--name", f"fix {fm.get('title')}", "--risk", risk, "--source", issue_id, "--json"]
    if args.owner:
        new_args += ["--owner", args.owner]
    if args.team:
        new_args += ["--team", args.team]
    proc = _sibling(root, "new_spec.py", new_args)
    if proc.returncode != 0:
        raise NotDone(f"new_spec.py exited {proc.returncode}:\n{(proc.stderr or proc.stdout).strip()}")
    try:
        doc = json.loads(proc.stdout)
    except ValueError:
        raise NotDone(f"new_spec.py gave no JSON back:\n{proc.stdout.strip()}")
    spec_rel = doc.get("path")
    spec_id = str(doc.get("id") or "")
    spec_path = root / spec_rel if spec_rel else None
    if not spec_path or not spec_path.is_file():
        raise NotDone(f"new_spec.py reported a path that is not there: {spec_rel}")

    # The scaffold is a feature spec; a fix is a bugfix (the harness's repro-gate reads `type`).
    # One frontmatter line changes; the body stays the template's for the author to fill, with
    # the Goal pointing at the report so the acceptance checks start from its steps.
    spec_text = spec_path.read_text(encoding="utf-8")
    spec_text = re.sub(r"^type: feature\b[^\r\n]*", "type: bugfix            # repro-gate: the new test FAILS against the pre-fix code", spec_text, count=1, flags=re.MULTILINE)
    spec_text = spec_text.replace("## Goal\n", f"## Goal\n\nFix {issue_id} — {fm.get('title')}. Seen in {fm.get('environment')} on the "
                                                f"{fm.get('channel')} channel as {fm.get('persona')}; severity {fm.get('severity')}, data impact "
                                                f"{fm.get('data_impact')}, priority {fm.get('priority') or 'unset'}. The report — steps, screenshot, "
                                                f"environment — is `{rel(path, root)}`; the first acceptance check is its reproduction.\n", 1)
    spec_path.write_text(spec_text, encoding="utf-8")

    slated: dict | None = None
    warnings: list[str] = []
    if args.slate:
        sl = _sibling(root, "sprint.py", ["slate", *source_args(args), "--sprint", target, "--spec", spec_id, "--by", by])
        first = (sl.stdout or sl.stderr).strip().splitlines()
        slated = {"sprint": target, "exit": sl.returncode, "said": first[0] if first else ""}
        if sl.returncode != 0:
            warnings.append(f"sprint.py slate --sprint {target} --spec {spec_id} exited {sl.returncode}: {slated['said']}")

    detail = f"promoted to bugfix spec {spec_id} ({risk}) by {by}" + (f" — the proposal was {proposed}" if risk != proposed else "")
    if slated:
        detail += f"; slated into {target}" if slated["exit"] == 0 else f"; slate into {target} refused (exit {slated['exit']})"
    status, _ = _move(root, path, text, fm, "promote", by, detail,
                      {"event": "promoted", "spec": spec_id, "risk": risk, "proposed_risk": proposed, "slated": slated}, {"bugfix_spec": spec_id})
    result = {"ok": True, "issue": issue_id, "status": status, "spec": spec_id, "path": spec_rel, "risk": risk, "proposed_risk": proposed,
              "slated": slated, "warnings": warnings}
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    print(f"Bugfix spec {spec_id} scaffolded at {spec_rel} ({risk}" + (f"; the proposal was {proposed}" if risk != proposed else "") + ")")
    if slated and slated["exit"] == 0:
        print(f"Slated into {target}: {slated['said']}")
    for w in warnings:
        print(f"  warning: {w}")
    print(f"Next: /sdlc-spec --spec {spec_id} to write the acceptance checks — the first one is the repro: a test that fails on the pre-fix code")
    return 0


def verb_note(args, root: Path) -> int:
    by = _require_person(args.by, "writing the note")
    note = (args.note or "").strip()
    if len(note) < 3:
        raise NotDone("--note is required: what you want the fixer or the reporter to know")
    if im.secrets_in(note):
        raise Refused(f"the note contains what looks like {', '.join(im.secrets_in(note))} — remove it")
    path = find_issue(root, args.issue)
    fm, _, text = read_report(path)
    issue_id = str(fm.get("issue") or path.name[:8])
    ts = now_ts()
    text = append_history(text, f"{ts} — note by {by}: {note}")
    path.write_text(text, encoding="utf-8", newline="\n")
    write_ledger(root, {"timestamp": ts, "event": "note", "issue": issue_id, "by": by, "note": note})
    if args.json:
        print(json.dumps({"ok": True, "issue": issue_id, "status": _status(fm), "note": note}, indent=2, ensure_ascii=False))
    else:
        print(f"{issue_id}: note recorded" + (" — triage it again when the answer is enough" if _status(fm) == "needs-info" else ""))
    return 0


def verb_reopen(args, root: Path) -> int:
    by = _require_person(args.by, "reopening")
    reason = (args.reason or "").strip()
    if len(reason) < 10:
        raise NotDone("reopen needs --reason in your own words (at least 10 characters) — what still happens")
    path = find_issue(root, args.issue)
    fm, _, text = read_report(path)
    issue_id = str(fm.get("issue") or path.name[:8])
    status, _ = _move(root, path, text, fm, "reopen", by, f"reopened by {by}: {reason}", {"event": "reopened", "reason": reason},
                      {"triaged_by": "", "triage_verdict": "", "duplicate_of": ""})
    if args.json:
        print(json.dumps({"ok": True, "issue": issue_id, "status": status}, indent=2, ensure_ascii=False))
    else:
        print(f"{issue_id}: {status} — {reason}")
    return 0


def _spec_status(root: Path, spec_id: str) -> str | None:
    specs = root / "specs"
    if not specs.is_dir():
        return None
    for p in specs.glob(f"{spec_id}-*.md"):
        fm, _ = split_frontmatter(p.read_text(encoding="utf-8"))
        return str(fm.get("status") or "").strip() or None
    return None


def verb_sync(args, root: Path) -> int:
    """Promoted reports follow their bugfix spec: `status: merged` on the spec (written by
    spec_status.py once the PR merged) makes the report `fixed`. Reads the spec file; writes only
    the report and its ledger."""
    changed: list[dict] = []
    waiting: list[dict] = []
    for path in issue_files(root):
        fm, _, text = read_report(path)
        if _status(fm) != "promoted" or not fm.get("bugfix_spec"):
            continue
        spec_id = str(fm["bugfix_spec"])
        spec_status = _spec_status(root, spec_id)
        if spec_status == "merged":
            status, _ = _move(root, path, text, fm, "fixed", f"spec {spec_id}", f"fixed — bugfix spec {spec_id} merged (sync)",
                              {"event": "fixed", "spec": spec_id, "via": "sync"}, {})
            changed.append({"issue": fm.get("issue"), "spec": spec_id, "status": status})
        else:
            waiting.append({"issue": fm.get("issue"), "spec": spec_id, "spec_status": spec_status})
    if args.json:
        print(json.dumps({"ok": True, "fixed": changed, "waiting": waiting}, indent=2, ensure_ascii=False))
        return 0
    if not changed and not waiting:
        print("no data — no promoted reports to follow")
        return 0
    for c in changed:
        print(f"{c['issue']}: fixed — spec {c['spec']} merged")
    for w in waiting:
        print(f"{w['issue']}: waiting — spec {w['spec']} is {w['spec_status'] or 'unreadable'}")
    return 0


def verb_set_status(args, root: Path) -> int:
    by = _require_person(args.by, "deciding")
    status = (args.status or "").strip()
    if status not in ("fixed", "wont-fix", "duplicate"):
        raise NotDone("--status must be fixed, wont-fix or duplicate (triage, prioritize, promote and reopen move the others)")
    reason = (args.reason or "").strip()
    if status in ("wont-fix", "duplicate") and len(reason) < 10 and not (status == "duplicate" and args.of):
        raise NotDone(f"{status} needs --reason in your own words (at least 10 characters) — the reporter will read it")
    path = find_issue(root, args.issue)
    fm, _, text = read_report(path)
    issue_id = str(fm.get("issue") or path.name[:8])
    if _status(fm) == status:
        print(f"{issue_id} is already {status}. Nothing changed.")
        return 0
    fields: dict[str, str] = {}
    if status == "duplicate":
        of = (args.of or "").strip().upper()
        if not im.ISSUE_ID_RE.match(of):
            raise NotDone("duplicate needs --of ISS-NNNN, the report it duplicates")
        if of == issue_id:
            raise NotDone(f"{issue_id} cannot be a duplicate of itself")
        try:
            find_issue(root, of)
        except NotDone:
            raise NotDone(f"--of {of}: no such report")
        fields["duplicate_of"] = of
    detail = status + (f" of {fields['duplicate_of']}" if status == "duplicate" else "") + (f": {reason}" if reason else "")
    new_status, _ = _move(root, path, text, fm, status, by, f"{detail} by {by}" if status != "fixed" else f"fixed by {by}" + (f": {reason}" if reason else ""),
                          {"event": "status", "status": status, "reason": reason or None, "of": fields.get("duplicate_of")}, fields)
    if args.json:
        print(json.dumps({"ok": True, "issue": issue_id, "status": new_status, "reason": reason or None}, indent=2, ensure_ascii=False))
    else:
        print(f"{issue_id}: {detail}")
    return 0


# --- file ---------------------------------------------------------------------------------------

def host_body(fm: dict, secs: dict[str, str], path_rel: str) -> str:
    """What the code host shows: the reporter's sections verbatim, the facts up top, the
    screenshots named by their repository path (neither CLI attaches files)."""
    head = (f"**{fm.get('issue')}** · {fm.get('environment')} · severity `{fm.get('severity')}` · {fm.get('frequency')} · "
            f"data impact `{fm.get('data_impact')}` · seen on the {fm.get('channel')} channel as {fm.get('persona')}"
            + (f" · priority {fm.get('priority')}" if fm.get("priority") else "") + (f" · spec {fm.get('spec')}" if fm.get("spec") else "")
            + (f" · bugfix spec {fm.get('bugfix_spec')}" if fm.get("bugfix_spec") else ""))
    parts = [head, ""]
    for heading in ("What happened", "What you expected", "Steps to reproduce", "Where", "Environment"):
        if secs.get(heading):
            parts += [f"### {heading}", secs[heading], ""]
    n = int(fm.get("screenshots") or 0)
    parts += ["### Screenshots", f"{n} in the repository under `{Path(path_rel).parent.as_posix()}/{fm.get('issue')}/`.", "",
              f"_Reported with /sdlc-report-issue; the record is `{path_rel}`._"]
    return "\n".join(parts)


def file_argv(host: str, remote, title: str, body_path: Path, label: str | None) -> list[str]:
    if host == "github":
        argv = ["gh", "issue", "create", "--title", title, "--body-file", str(body_path)]
        if remote is not None:
            argv += ["--repo", remote.slug]
        if label:
            argv += ["--label", label]
        return argv
    if host == "azure-devops":
        if remote is None or not remote.org_url or not remote.project:
            raise NotDone("Azure DevOps needs the organisation URL and project — the origin remote did not say; pin them in .sdlc/code-host.yaml")
        argv = ["az", "boards", "work-item", "create", "--type", "Bug", "--title", title,
                "--description", body_path.read_text(encoding="utf-8"), "--org", remote.org_url, "--project", remote.project, "-o", "json"]
        if label:
            argv += ["--fields", f"System.Tags={label}"]
        return argv
    raise NotDone("no code host for this repository — pin one with `set_setting.py code-host github|azure-devops` (or run with --host)")


def parse_filed(host: str, stdout: str) -> tuple[str, str]:
    """(url, id) from the CLI's own output; gh prints the URL, az prints JSON."""
    if host == "github":
        urls = re.findall(r"https?://\S+", stdout)
        if not urls:
            raise NotDone(f"gh gave no URL back:\n{stdout.strip()}")
        url = urls[-1].rstrip(".")
        return url, url.rsplit("/", 1)[-1]
    try:
        doc = json.loads(stdout)
    except ValueError:
        raise NotDone(f"az gave no JSON back:\n{stdout.strip()}")
    wid = str(doc.get("id") or "")
    url = (((doc.get("_links") or {}).get("html") or {}).get("href")) or doc.get("url") or ""
    if not wid:
        raise NotDone(f"az's answer carries no work-item id:\n{stdout.strip()}")
    return url, wid


def verb_file(args, root: Path) -> int:
    by = _require_person(args.by, "filing")
    path = find_issue(root, args.issue)
    fm, secs, text = read_report(path)
    issue_id = str(fm.get("issue") or path.name[:8])
    if fm.get("filed_url"):
        raise NotDone(f"{issue_id} is already filed: {fm['filed_url']}")
    import code_host as ch
    detection = ch.detect_host(root, args.host)
    host = detection.host
    body = host_body(fm, secs, rel(path, root))
    body_path = root / ISSUES_DIR / issue_id / "host-body.md"
    body_path.parent.mkdir(parents=True, exist_ok=True)
    body_path.write_text(body, encoding="utf-8", newline="\n")
    argv = file_argv(host, detection.remote, str(fm.get("title") or issue_id), body_path, args.label)

    if args.dry_run:
        shown = [a if len(a) < 200 else a[:197] + "…" for a in argv]
        if args.json:
            print(json.dumps({"ok": True, "dry_run": True, "host": host, "cwd": str(root), "argv": shown, "body": rel(body_path, root)}, indent=2, ensure_ascii=False))
        else:
            print(f"Would run (cwd {root}):")
            print("  " + " ".join(json.dumps(a, ensure_ascii=False) if re.search(r"\s", a) else a for a in shown))
            print(f"Body: {rel(body_path, root)} (written so the command above can run; the only write a dry run makes)")
        return 0

    cli = argv[0]
    if shutil.which(cli) is None:
        raise NotDone(f"{cli} is not installed — the {host} host is filed through it")
    try:
        proc = subprocess.run(argv, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120,
                              check=False, cwd=str(root), env={**os.environ, **(AZ_ENV if cli == "az" else {})})
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise NotDone(f"{cli} did not run: {exc}")
    if proc.returncode != 0:
        raise NotDone(f"{cli} exited {proc.returncode}:\n{(proc.stderr or proc.stdout).strip()}")
    url, wid = parse_filed(host, proc.stdout)
    ts = now_ts()
    text = set_field(text, "filed_host", host)
    text = set_field(text, "filed_url", url)
    text = set_field(text, "filed_id", wid)
    text = append_history(text, f"{ts} — filed on {host} by {by}: {url or wid}")
    path.write_text(text, encoding="utf-8", newline="\n")
    write_ledger(root, {"timestamp": ts, "event": "filed", "issue": issue_id, "host": host, "url": url, "id": wid, "by": by})
    if args.json:
        print(json.dumps({"ok": True, "issue": issue_id, "status": _status(fm), "host": host, "url": url, "id": wid, "argv": argv[:3]}, indent=2, ensure_ascii=False))
    else:
        print(f"Filed {issue_id} on {host}: {url or wid}")
    return 0


# --- CLI ----------------------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    src = common.add_mutually_exclusive_group()
    src.add_argument("--state", help="Path to .sdlc/state.yaml (workflow mode; repo root = parent of .sdlc/)")
    src.add_argument("--repo", default=".", help="Target repo root (standalone mode; default: cwd)")
    common.add_argument("--json", action="store_true", help="Emit one JSON document")
    by = argparse.ArgumentParser(add_help=False)
    by.add_argument("--by", required=True, metavar="NAME", help="A named human — an AI name is refused")
    issue = argparse.ArgumentParser(add_help=False)
    issue.add_argument("--issue", required=True, help="ISS-NNNN, NNNN, or the report's path")

    parser = argparse.ArgumentParser(
        description="Bugs in the product the team is building, from report to fix: a report that carries the minimum a fixer needs, "
                    "reviewed by someone other than its reporter, prioritized, promoted to a type: bugfix spec a sprint can slate. "
                    "Nothing is written until the minimum is met; a secret-shaped string is refused.")
    sub = parser.add_subparsers(dest="verb", required=True)

    p = sub.add_parser("questions", parents=[common], help="The question plan (optionally for one channel)")
    p.add_argument("--channel", default=None, help=f"One of {', '.join(im.CHANNELS)}")

    p = sub.add_parser("env", parents=[common], help="The build under test: repository, branch, commit, code host, this machine")
    p.add_argument("--app-version", default=None, help="The Tōgō app's version, when the app is the caller")

    p = sub.add_parser("new", parents=[common], help="Write a report (only once it clears the minimum)")
    p.add_argument("--title", required=True, help=f"One line, {im.MIN_TITLE_CHARS}–{im.MAX_TITLE_CHARS} characters")
    p.add_argument("--channel", required=True, help=f"Where in the product: one of {', '.join(im.CHANNELS)}")
    p.add_argument("--what", required=True, help=f"What happened (≥ {im.MIN_WHAT_CHARS} characters)")
    p.add_argument("--expected", required=True, help=f"What you expected (≥ {im.MIN_EXPECTED_CHARS} characters)")
    p.add_argument("--steps", action="append", default=[], metavar="STEP", help="A step to reproduce (repeatable; newlines split too)")
    p.add_argument("--environment", required=True, help=f"One of {', '.join(im.ENVIRONMENTS)}")
    p.add_argument("--product-version", default=None, dest="product_version", help="The build, tag or commit under test (local runs take git's)")
    p.add_argument("--severity", required=True, help=f"One of {', '.join(im.SEVERITIES)}")
    p.add_argument("--frequency", required=True, help=f"One of {', '.join(im.FREQUENCIES)}")
    p.add_argument("--data-impact", required=True, dest="data_impact", help=f"One of {', '.join(im.DATA_IMPACTS)}")
    p.add_argument("--persona", required=True, help="The type of user you were acting as, in the product's own terms")
    p.add_argument("--reporter-role", required=True, dest="reporter_role", help=f"Your role on the team: one of {', '.join(im.REPORTER_ROLES)}")
    p.add_argument("--spec", default="", help="The spec this part of the product was built under (NNNN), optional")
    p.add_argument("--screenshot", action="append", default=[], metavar="PATH", help="An image file (repeatable; at least one)")
    p.add_argument("--no-client-data", action="store_true", dest="no_client_data",
                   help="The reporter's statement: nothing in the screenshots or the words is client data, personal data or a secret")
    p.add_argument("--answer", action="append", default=[], metavar="KEY=VALUE",
                   help="A channel question's answer (`questions --channel X` lists them), repeatable")
    p.add_argument("--env-json", default=None, metavar="PATH", help="The document `env --json` printed, saved to a file")
    p.add_argument("--escaped-from", default=None, metavar="CHECK",
                   help="The check that should have caught this; also records scorecard.py's escaped_bug event")
    p.add_argument("--by", required=True, metavar="NAME", help="The person reporting, by name — an AI name is refused")

    sub.add_parser("show", parents=[common, issue], help="One report in full, with the actions the lifecycle allows and why not")
    sub.add_parser("check", parents=[common, issue], help="Re-validate an existing report (exit 1 when it falls short)")

    p = sub.add_parser("list", parents=[common], help="The queue — what needs a decision first")
    p.add_argument("--status", default=None, help=f"Only one of {', '.join(im.STATUSES)}")
    p.add_argument("--queue", action="store_true", help="Only the reports awaiting review (new, needs-info)")

    p = sub.add_parser("triage", parents=[common, issue, by], help="Review a report: confirmed | needs-info | duplicate | wont-fix")
    p.add_argument("--verdict", required=True, help=f"One of {', '.join(im.TRIAGE_VERDICTS)}")
    p.add_argument("--severity", default=None, help="Correct the severity while confirming")
    p.add_argument("--data-impact", default=None, dest="data_impact", help="Correct the data impact while confirming")
    p.add_argument("--question", default=None, help="needs-info: what the reporter should add")
    p.add_argument("--of", default=None, metavar="ISS-NNNN", help="duplicate: the report it duplicates")
    p.add_argument("--reason", default=None, help="wont-fix: why (required); confirmed: a note; with --override: why the reporter reviews")
    p.add_argument("--override", action="store_true", help="Let the reporter review their own report (a team of one) — needs --reason")

    p = sub.add_parser("prioritize", parents=[common, issue, by], help="P1 | P2 | P3 and a target sprint, confirming the proposal or not")
    p.add_argument("--priority", default=None, help="P1 (fix now) | P2 (next sprint) | P3 (backlog)")
    p.add_argument("--target-sprint", default=None, dest="target_sprint", metavar="SNN", help="The sprint the fix should land in (an open sprint.py record)")
    p.add_argument("--reason", default=None, help="Why, when the priority differs from the proposal")

    p = sub.add_parser("promote", parents=[common, issue, by], help="Scaffold a type: bugfix spec from the report (new_spec.py)")
    p.add_argument("--risk", default=None, help="HIGH | MEDIUM | LOW — the person confirms or changes the report's proposal")
    p.add_argument("--owner", default=None, help="Code-host handle of the accountable owner (e.g. @priya-n)")
    p.add_argument("--team", default=None, help="The team the fix belongs to")
    p.add_argument("--slate", action="store_true", help="Also slate the new spec into the target sprint through sprint.py slate")

    p = sub.add_parser("note", parents=[common, issue, by], help="A dated note by a named person")
    p.add_argument("--note", required=True, help="What the fixer or the reporter should know")

    p = sub.add_parser("reopen", parents=[common, issue, by], help="A closed report back to new, with a reason")
    p.add_argument("--reason", required=True, help="What still happens")

    sub.add_parser("sync", parents=[common], help="Promoted reports whose bugfix spec merged become fixed")

    p = sub.add_parser("file", parents=[common, issue, by], help="Open the report on the product's code host (gh issue / az boards work-item)")
    p.add_argument("--host", choices=["github", "azure-devops"], default=None, help="Override the detected host for this run")
    p.add_argument("--label", default=None, help="A label (GitHub) or tag (Azure DevOps) to add, e.g. bug")
    p.add_argument("--dry-run", action="store_true", dest="dry_run", help="Print the exact command instead of running it")

    p = sub.add_parser("set-status", parents=[common, issue, by], help="fixed | wont-fix | duplicate, under the lifecycle's rules")
    p.add_argument("--status", required=True, help="fixed | wont-fix | duplicate")
    p.add_argument("--reason", default=None, help="Required for wont-fix and duplicate")
    p.add_argument("--of", default=None, metavar="ISS-NNNN", help="duplicate: the report it duplicates")
    return parser


VERBS = {"questions": verb_questions, "env": verb_env, "new": verb_new, "show": verb_show, "check": verb_check, "list": verb_list,
         "triage": verb_triage, "prioritize": verb_prioritize, "promote": verb_promote, "note": verb_note, "reopen": verb_reopen,
         "sync": verb_sync, "file": verb_file, "set-status": verb_set_status}


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        root = resolve_repo_root(args) if args.verb != "questions" else None
        return VERBS[args.verb](args, root)
    except Refused as exc:
        if getattr(args, "json", False):
            print(json.dumps({"ok": False, "refused": True, "reasons": str(exc).split("\n")}, indent=2, ensure_ascii=False))
        else:
            print(f"Refused: {exc}")
        return 2
    except NotDone as exc:
        if getattr(args, "json", False):
            print(json.dumps({"ok": False, "refused": False, "error": str(exc), "gaps": exc.gaps}, indent=2, ensure_ascii=False))
        else:
            print(f"Error: {exc}")
            for g in exc.gaps:
                print(f"  - {g}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
