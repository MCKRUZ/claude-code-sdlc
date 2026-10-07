"""The issue-report model behind `/sdlc-report-issue` — bugs in the PRODUCT the team is building.

The single source of truth for what a usable bug report must carry, which follow-up questions
depend on where in the product the bug was seen, and the words a report is refused with.

Why a model module (the `risk_model.py` / `findings_model.py` pattern): the slash command asks
the questions in a conversation, the SDLC Studio desktop app renders them as a form, and
`report_issue.py` enforces the minimum on both. Three readers, one list — so a question added
here reaches the conversation and the form in the same release and the CLI refuses the same gap
either way. Nothing in here touches the filesystem except reading a candidate screenshot's
first bytes.

The product is the subject. "Where" is the product's channel of use — the plugin's own channel
vocabulary (`channels/`: the web UI, voice, chat) widened with the API, a data product, mobile —
and each channel asks its own follow-ups (the URL and the browser for the web; the endpoint and
the status code for the API; what was said and what was heard for voice). "In what environment"
is the product's: local, dev, test, staging or production, with the build or commit under test.
"What type of user" is asked twice, because both matter: the kind of user the reporter was acting
as, in the product's own terms (an adjuster, an admin, a signed-out visitor), and the reporter's
role on the team (the method's roles, `references/team-model.md`).

The minimum (`validate`) is deliberately strict and deliberately short. A report that cannot be
reproduced is a report nobody fixes: title, what happened, what was expected, at least one step,
where, which environment, how badly, how often, what it did to the data, who the reporter was
acting as and who they are, ONE screenshot that really is an image, and the reporter's own
statement that nothing in the words or the picture is client data, personal data or a secret. A
secret-looking string (a token, a private key) is REFUSED, not warned about — the file is shared
with a code host, and the plugin cannot un-publish.

No per-person counting exists here or in `report_issue.py list`: a reporter is recorded per
issue so the fixer can ask them; nothing totals.
"""

from __future__ import annotations

import re
from pathlib import Path

try:  # the same regex the findings ledger and spec_transition use to refuse an AI signing
    from findings_model import is_ai_actor  # type: ignore
except Exception:  # pragma: no cover — standalone import of this module alone
    _AI_ACTOR_RE = re.compile(r"\b(ai|agent|claude|gpt|codex|llm|bot|automated|assistant|copilot)\b", re.IGNORECASE)

    def is_ai_actor(name) -> bool:  # type: ignore[no-redef]
        return bool(_AI_ACTOR_RE.search(str(name or "")))


# --- the vocabulary ---------------------------------------------------------------------------

ISSUE_ID_RE = re.compile(r"^ISS-(\d{4})$")
ISSUE_FILE_RE = re.compile(r"^ISS-(\d{4})-")
SPEC_ID_RE = re.compile(r"^\d{4}$")

# Where in the product: the plugin's channel vocabulary (channels/ag-ui.yaml, voice.yaml, chat.yaml)
# plus the surfaces a product has that are not a conversation.
CHANNELS = ("web", "api", "voice", "chat", "data", "mobile", "other")
CHANNEL_LABELS = {
    "web": "The web UI (a screen in the browser)",
    "api": "The API (a request and its response)",
    "voice": "The voice assistant (something said, something heard)",
    "chat": "The chat assistant (a message and its reply)",
    "data": "A report, export, dataset or batch job",
    "mobile": "The mobile app",
    "other": "Somewhere else",
}
# How a channel here maps to a descriptor in channels/ — so a spec bound to a channel and a bug
# seen on it speak the same word. None where the library has no descriptor yet.
CHANNEL_DESCRIPTOR = {"web": "ag-ui", "voice": "voice", "chat": "chat", "api": None, "data": None, "mobile": None, "other": None}

ENVIRONMENTS = ("local", "dev", "test", "staging", "production")
ENVIRONMENT_LABELS = {
    "local": "Local — on my machine, from a branch",
    "dev": "Dev — the shared development deployment",
    "test": "Test / QA",
    "staging": "Staging / pre-production",
    "production": "Production — real users saw it",
}

SEVERITIES = ("blocks", "degraded", "cosmetic")
SEVERITY_LABELS = {
    "blocks": "Blocks the task — the user cannot finish what they came to do",
    "degraded": "Degraded — the task completes, with a workaround or a wrong detail",
    "cosmetic": "Cosmetic — wrong, but nothing is lost",
}

FREQUENCIES = ("always", "sometimes", "once")
FREQUENCY_LABELS = {"always": "Every time", "sometimes": "Sometimes", "once": "Once so far"}

DATA_IMPACTS = ("none", "wrong-shown", "wrong-written", "exposed")
DATA_IMPACT_LABELS = {
    "none": "None — nothing about the data is wrong",
    "wrong-shown": "Wrong data shown — the stored data is fine",
    "wrong-written": "Wrong data written or lost",
    "exposed": "Data exposed — someone saw what they should not",
}

REPORTER_ROLES = ("builder", "checker", "owner", "product", "data", "design", "steering", "client", "end-user", "other")
REPORTER_ROLE_LABELS = {
    "builder": "Builder — I build specs on this product",
    "checker": "Checker — I give the non-author approval",
    "owner": "Owner — I am accountable for the intent",
    "product": "Product — I shape the backlog",
    "data": "Data — the data contract and readiness",
    "design": "Design — the experience and the channel",
    "steering": "Steering committee",
    "client": "Client stakeholder",
    "end-user": "An end user of the product",
    "other": "Another role",
}

# The lifecycle: a report is reviewed (triaged) by someone other than its reporter, prioritized,
# and then becomes a `type: bugfix` spec — the Build loop's unit, which a sprint can slate. Filing
# on the code host is orthogonal (`filed_url`), not a state. `fixed` arrives when the bugfix spec
# merges (`sync`) or by a named human's hand.
STATUSES = ("new", "needs-info", "triaged", "prioritized", "promoted", "fixed", "wont-fix", "duplicate")
TERMINAL_STATUSES = ("fixed", "wont-fix", "duplicate")
STATUS_LABELS = {
    "new": "New — awaiting review", "needs-info": "Needs info — the reporter was asked something",
    "triaged": "Triaged — confirmed as a bug", "prioritized": "Prioritized — P1 / P2 / P3 and a target sprint",
    "promoted": "Promoted — a bugfix spec exists", "fixed": "Fixed", "wont-fix": "Won't fix", "duplicate": "Duplicate",
}
# The order the queue is read in: what needs a decision first.
QUEUE_ORDER = {s: i for i, s in enumerate(("new", "needs-info", "triaged", "prioritized", "promoted", "fixed", "wont-fix", "duplicate"))}

TRIAGE_VERDICTS = ("confirmed", "needs-info", "duplicate", "wont-fix")
TRIAGE_VERDICT_LABELS = {
    "confirmed": "Confirmed — it is a bug in the product, as described",
    "needs-info": "Needs info — ask the reporter something before deciding",
    "duplicate": "Duplicate of another report",
    "wont-fix": "Won't fix — with the reason the reporter will read",
}

PRIORITIES = ("P1", "P2", "P3")
PRIORITY_LABELS = {
    "P1": "P1 — fix now: this sprint, or a hotfix outside it",
    "P2": "P2 — next sprint",
    "P3": "P3 — the backlog; refined when its turn comes",
}

# action -> {from: to}. An action absent for a status is refused with `transition_refusal`.
TRANSITIONS: dict[str, dict[str, str]] = {
    "triage:confirmed": {"new": "triaged", "needs-info": "triaged"},
    "triage:needs-info": {"new": "needs-info", "needs-info": "needs-info"},
    "triage:duplicate": {"new": "duplicate", "needs-info": "duplicate", "triaged": "duplicate", "prioritized": "duplicate"},
    "triage:wont-fix": {"new": "wont-fix", "needs-info": "wont-fix", "triaged": "wont-fix", "prioritized": "wont-fix"},
    "prioritize": {"triaged": "prioritized", "prioritized": "prioritized"},
    "promote": {"prioritized": "promoted"},
    # A fix can land without a spec of its own (a one-line hotfix in another spec's PR) once the
    # report has been reviewed; an unreviewed report cannot be "fixed" — nobody confirmed the bug.
    "fixed": {"triaged": "fixed", "prioritized": "fixed", "promoted": "fixed"},
    "wont-fix": {"new": "wont-fix", "needs-info": "wont-fix", "triaged": "wont-fix", "prioritized": "wont-fix", "promoted": "wont-fix"},
    "duplicate": {"new": "duplicate", "needs-info": "duplicate", "triaged": "duplicate", "prioritized": "duplicate", "promoted": "duplicate"},
    "reopen": {"fixed": "new", "wont-fix": "new", "duplicate": "new"},
}


def next_status(action: str, current: str) -> str | None:
    """The status `action` leads to from `current`, or None when the lifecycle refuses it."""
    return TRANSITIONS.get(action, {}).get(current)


def allowed_from(current: str) -> list[str]:
    """The actions the lifecycle allows from `current`, as the verbs a person types."""
    out: list[str] = []
    for action, table in TRANSITIONS.items():
        if current in table:
            verb = action.split(":")[0] if action.startswith("triage:") else ("set-status " + action if action in ("fixed", "wont-fix", "duplicate") else action)
            if verb not in out:
                out.append(verb)
    return out


def transition_refusal(action: str, current: str, issue_id: str = "the report") -> str:
    """Why `action` is refused from `current`, in words that say what comes first — and only ever
    naming actions the lifecycle does allow from here."""
    if current in TERMINAL_STATUSES and action != "reopen":
        return f"{issue_id} is {current} — a closed report is not acted on; `reopen --reason` first"
    if action == "promote":
        if current in ("new", "needs-info"):
            return f"{issue_id} is {current} — review it first (`triage`), then prioritize it; a bugfix spec is scaffolded only from a prioritized report"
        if current == "triaged":
            return f"{issue_id} is triaged but not prioritized — `prioritize --priority P1|P2|P3` first, so the spec enters the right sprint"
        if current == "promoted":
            return f"{issue_id} already has a bugfix spec"
    if action == "prioritize":
        return f"{issue_id} is {current} — a report is prioritized once it has been reviewed and confirmed (`triage --verdict confirmed`)"
    if action == "fixed":
        return f"{issue_id} is {current} — nobody has confirmed the bug yet; triage it before calling it fixed"
    if action == "reopen":
        return f"{issue_id} is {current}, not closed — nothing to reopen"
    if action.startswith("triage:"):
        return f"{issue_id} is {current} — triage decides a new or needs-info report; from {current} the lifecycle allows: {', '.join(allowed_from(current))}"
    return f"{action} is not an action the lifecycle takes from {current}; it allows: {', '.join(allowed_from(current))}"


def proposed_priority(report: dict) -> str:
    """The priority the agent PROPOSES — a human confirms it. A blocker in production, data exposed
    or written wrongly → P1. A blocker anywhere, or wrong data shown every time → P2. The rest P3."""
    impact = str(report.get("data_impact") or "")
    severity = str(report.get("severity") or "")
    env = str(report.get("environment") or "")
    frequency = str(report.get("frequency") or "")
    if impact in ("wrong-written", "exposed") or (severity == "blocks" and env == "production"):
        return "P1"
    if severity == "blocks" or (impact == "wrong-shown" and frequency == "always"):
        return "P2"
    return "P3"

# The sizes a report must clear. Characters, not words: a word count rewards padding.
MIN_TITLE_CHARS = 8
MAX_TITLE_CHARS = 120
MIN_WHAT_CHARS = 20
MIN_EXPECTED_CHARS = 10
MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024

# --- images: a screenshot must be one, decided by its bytes, never by its name ------------------

_IMAGE_MAGIC = (
    ("png", b"\x89PNG\r\n\x1a\n", 0),
    ("jpeg", b"\xff\xd8\xff", 0),
    ("gif", b"GIF87a", 0),
    ("gif", b"GIF89a", 0),
)


def image_kind(path: Path) -> str | None:
    """`png` / `jpeg` / `gif` / `webp` from the file's first bytes, or None when it is not one."""
    try:
        with open(path, "rb") as fh:
            head = fh.read(16)
    except OSError:
        return None
    for kind, magic, offset in _IMAGE_MAGIC:
        if head[offset:offset + len(magic)] == magic:
            return kind
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    return None


# --- secrets: refused, never warned about -------------------------------------------------------

SECRET_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("a GitHub token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b")),
    ("a GitHub fine-grained token", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{30,}\b")),
    ("an AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("a private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("a bearer token", re.compile(r"\bBearer\s+[A-Za-z0-9\-._~+/]{20,}=*", re.IGNORECASE)),
    ("an API key", re.compile(r"\bsk-[A-Za-z0-9\-_]{20,}\b")),
    ("a Slack token", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}\b")),
    ("a JSON web token", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
    ("an Azure DevOps personal access token", re.compile(r"\b[a-z2-7]{52}\b")),
    # A masked value (`Password=********`, `pwd=xxxxxxxx`) is not a secret; a real one is.
    ("a connection string with a password", re.compile(r"(?i)\b(password|pwd)\s*=\s*(?![*xX•#]+(?:[;\s]|$))[^;\s]{6,}")),
)


def secrets_in(text: str) -> list[str]:
    """The kinds of secret-looking strings in `text`, each named once. Never the match itself."""
    found: list[str] = []
    for label, pattern in SECRET_PATTERNS:
        if pattern.search(text or "") and label not in found:
            found.append(label)
    return found


# --- the questions ------------------------------------------------------------------------------

def _choice(id_: str, prompt: str, values, labels: dict[str, str], *, required=True, hint: str | None = None,
            channels=None, auto=False) -> dict:
    return {"id": id_, "prompt": prompt, "kind": "choice", "required": required,
            "options": [{"value": v, "label": labels.get(v, v)} for v in values],
            "hint": hint, "channels": list(channels) if channels else None, "auto": auto}


def _text(id_: str, prompt: str, *, kind="text", required=True, hint: str | None = None, channels=None,
          pattern: str | None = None, auto=False) -> dict:
    return {"id": id_, "prompt": prompt, "kind": kind, "required": required, "options": None,
            "hint": hint, "channels": list(channels) if channels else None, "pattern": pattern, "auto": auto}


# Asked of every report, in this order. `screenshot` and `no_client_data` are not words a person
# types: the first is a file, the second a confirmation — both required.
BASE_QUESTIONS: tuple[dict, ...] = (
    _choice("channel", "Where in the product did you see it?", CHANNELS, CHANNEL_LABELS,
            hint="The next questions depend on this answer."),
    _text("title", "One line that names the bug", hint=f"{MIN_TITLE_CHARS}–{MAX_TITLE_CHARS} characters; what is wrong, not where"),
    _text("what_happened", "What happened?", kind="multiline",
          hint=f"At least {MIN_WHAT_CHARS} characters. Quote the exact words on screen where you can."),
    _text("expected", "What did you expect instead?", kind="multiline", hint=f"At least {MIN_EXPECTED_CHARS} characters"),
    _text("steps", "Steps to reproduce", kind="lines", hint="One step per line, from a fresh start. At least one."),
    _choice("environment", "Which environment?", ENVIRONMENTS, ENVIRONMENT_LABELS,
            hint="Production means real users saw it — say which check should have caught it, too"),
    _text("product_version", "Which build or version of the product?", required=False, auto=True,
          hint="A release tag, a build number or a commit; local runs take the branch and commit from git"),
    _choice("severity", "How badly does it hurt?", SEVERITIES, SEVERITY_LABELS),
    _choice("frequency", "How often?", FREQUENCIES, FREQUENCY_LABELS),
    _choice("data_impact", "What did it do to the data?", DATA_IMPACTS, DATA_IMPACT_LABELS,
            hint="Wrong data written or data exposed raises the risk tier of the fix"),
    _text("persona", "What type of user were you acting as?",
          hint="In the product's own terms — an adjuster, a claims lead, an admin, a signed-out visitor"),
    _choice("reporter_role", "And your role on the team?", REPORTER_ROLES, REPORTER_ROLE_LABELS),
    _text("spec", "The spec this part of the product was built under (optional)", required=False, pattern=r"^\d{4}$",
          hint="Four digits, e.g. 0007 — the fix lands beside it"),
    {"id": "screenshot", "prompt": "A screenshot of the product as it looked", "kind": "file", "required": True, "options": None,
     "hint": "PNG, JPEG, GIF or WebP, under 10 MB. Paste from the clipboard or choose a file; in Claude Code give a path.",
     "channels": None, "auto": False},
    {"id": "no_client_data", "prompt": "Nothing in the screenshot or these words is client data, personal data or a secret",
     "kind": "confirm", "required": True, "options": None,
     "hint": "Your statement, recorded with the report. Crop names, emails, policy numbers and account ids out first. A token-shaped string is refused regardless.",
     "channels": None, "auto": False},
)

# Follow-ups per channel. `auto` marks a value the app may fill itself (and a person confirms).
CHANNEL_QUESTIONS: tuple[dict, ...] = (
    _text("url", "The page's address", required=False, channels=["web"], hint="Without query strings that carry ids or tokens"),
    _text("browser_device", "Browser and device", channels=["web", "mobile"], hint="e.g. Chrome 130 on Windows 11 · Safari on iPhone 15"),
    _text("last_action", "What did you click or type right before?", channels=["web", "mobile"]),
    _text("endpoint", "The endpoint", channels=["api"], hint="Method and path, e.g. POST /claims"),
    _text("status_code", "The status code you got", kind="number", required=False, channels=["api"]),
    _text("request_id", "A request or correlation id, if the response carried one", required=False, channels=["api"]),
    _text("response_excerpt", "The response, or the part that looked wrong", kind="multiline", required=False, channels=["api", "data"],
          hint="Ids and codes only — no names, emails or account numbers"),
    _text("utterance", "What did you say?", channels=["voice"]),
    _text("heard", "What did it say back?", channels=["voice"]),
    _text("device", "Which device or line?", required=False, channels=["voice"], hint="A phone number's last digits, a smart speaker, the test harness"),
    _text("message", "What did you send?", channels=["chat"]),
    _text("reply", "What did it reply?", channels=["chat"]),
    _text("chat_surface", "In which chat surface?", required=False, channels=["chat"], hint="Teams, Slack, the web widget, the test harness"),
    _text("dataset", "Which report, export, dataset or job?", channels=["data"]),
    _text("expected_vs_actual", "The value you expected and the value you got", kind="multiline", channels=["data"],
          hint="Record ids and figures only — never a person's details"),
    _text("app_build", "The app build", required=False, channels=["mobile"], hint="From the app's About screen"),
    _text("where", "Where, in your own words?", channels=["other"]),
)

# The fields the model owns; anything else the reporter adds is kept under `## Where` verbatim.
CORE_FIELDS = tuple(q["id"] for q in BASE_QUESTIONS)
CHANNEL_FIELD_IDS = tuple(q["id"] for q in CHANNEL_QUESTIONS)


def question_plan(channel: str | None = None) -> list[dict]:
    """The questions to ask, in order: every base question, then the follow-ups for `channel`
    (inserted right after the channel question). With no channel, every follow-up is listed with
    its `channels` so a reader can branch itself."""
    plan: list[dict] = []
    for q in BASE_QUESTIONS:
        plan.append(dict(q))
        if q["id"] == "channel":
            for f in CHANNEL_QUESTIONS:
                if channel is None or channel in (f["channels"] or []):
                    plan.append(dict(f))
    return plan


def required_for(channel: str) -> list[str]:
    """Field ids that must be present for a report on `channel`."""
    return [q["id"] for q in question_plan(channel) if q["required"]]


def normalize_channel(value) -> str | None:
    s = str(value or "").strip().lower()
    return s if s in CHANNELS else None


# --- validation: the Definition of Ready for a bug report -------------------------------------------

def validate(report: dict, screenshots: list[Path]) -> tuple[list[str], list[str]]:
    """(blocking, advisory). Blocking lines name the gap and what clears it; advisory lines are
    worth fixing but do not stop the write. Pure: reads only the screenshots' first bytes."""
    blocking: list[str] = []
    advisory: list[str] = []
    get = lambda k: str(report.get(k) or "").strip()  # noqa: E731

    channel = normalize_channel(report.get("channel"))
    if channel is None:
        blocking.append(f"channel: one of {', '.join(CHANNELS)} is required — where in the product")

    title = get("title")
    if len(title) < MIN_TITLE_CHARS:
        blocking.append(f"title: at least {MIN_TITLE_CHARS} characters that name the bug")
    elif len(title) > MAX_TITLE_CHARS:
        blocking.append(f"title: at most {MAX_TITLE_CHARS} characters — the detail belongs in 'what happened'")
    if any(c in title for c in "\r\n"):
        blocking.append("title: one line")

    if len(get("what_happened")) < MIN_WHAT_CHARS:
        blocking.append(f"what_happened: at least {MIN_WHAT_CHARS} characters — what you saw, in the words on screen")
    if len(get("expected")) < MIN_EXPECTED_CHARS:
        blocking.append(f"expected: at least {MIN_EXPECTED_CHARS} characters — what should have happened")

    steps = [s.strip() for s in str(report.get("steps") or "").splitlines() if s.strip()]
    if not steps:
        blocking.append("steps: at least one step to reproduce, one per line")
    elif len(steps) == 1:
        advisory.append("steps: one step is thin — a reader starts from a fresh session; say how they get where you were")

    if get("environment") not in ENVIRONMENTS:
        blocking.append(f"environment: one of {', '.join(ENVIRONMENTS)}")
    if get("severity") not in SEVERITIES:
        blocking.append(f"severity: one of {', '.join(SEVERITIES)}")
    if get("frequency") not in FREQUENCIES:
        blocking.append(f"frequency: one of {', '.join(FREQUENCIES)}")
    if get("data_impact") not in DATA_IMPACTS:
        blocking.append(f"data_impact: one of {', '.join(DATA_IMPACTS)}")
    if not get("persona"):
        blocking.append("persona: what type of user you were acting as, in the product's own terms")
    if get("reporter_role") not in REPORTER_ROLES:
        blocking.append(f"reporter_role: one of {', '.join(REPORTER_ROLES)}")
    if get("environment") == "production" and not get("escaped_from"):
        advisory.append("escaped_from: a production bug escaped a check — name the check that should have caught it (`--escaped-from`) so the scorecard sees it")
    if get("data_impact") in ("wrong-written", "exposed"):
        advisory.append("data_impact: wrong data written or data exposed — the bugfix spec should carry a HIGH or MEDIUM tier, and Data should see this report")

    spec = get("spec")
    if spec and not SPEC_ID_RE.match(spec):
        blocking.append(f"spec: '{spec}' is not a spec id (four digits)")

    if channel is not None:
        for q in CHANNEL_QUESTIONS:
            if channel not in (q["channels"] or []):
                continue
            value = get(q["id"])
            if q["required"] and not value:
                blocking.append(f"{q['id']}: required when the channel is {channel} — {q['prompt'].rstrip('?')}")
            pat = q.get("pattern")
            if value and pat and not re.match(pat, value):
                blocking.append(f"{q['id']}: '{value}' does not look right ({q.get('hint') or pat})")
            if value and q["kind"] == "number" and not re.match(r"^-?\d+$", value):
                blocking.append(f"{q['id']}: a whole number, or leave it out")

    if not screenshots:
        blocking.append("screenshot: at least one image file is required — the product as it looked")
    for shot in screenshots:
        p = Path(shot)
        if not p.is_file():
            blocking.append(f"screenshot: {p} is not a file")
            continue
        kind = image_kind(p)
        if kind is None:
            blocking.append(f"screenshot: {p.name} is not a PNG, JPEG, GIF or WebP image (decided by its bytes, not its name)")
        elif p.stat().st_size > MAX_SCREENSHOT_BYTES:
            blocking.append(f"screenshot: {p.name} is over 10 MB — crop or re-save it")

    if not bool(report.get("no_client_data")):
        blocking.append("no_client_data: confirm that nothing in the screenshot or the words is client data, personal data or a secret")

    return blocking, advisory


_TEXT_FIELDS = ("title", "what_happened", "expected", "steps", "persona", "url", "last_action", "endpoint", "request_id",
                "response_excerpt", "utterance", "heard", "device", "message", "reply", "chat_surface", "dataset",
                "expected_vs_actual", "app_build", "where", "product_version", "browser_device")


def refusals(report: dict, by: str | None) -> list[str]:
    """Why a report is REFUSED outright (exit 2) — before anything is written: an AI-looking
    reporter, or a secret-shaped string anywhere in the words."""
    out: list[str] = []
    clean = (by or "").strip()
    if not clean:
        out.append("--by is required: the person reporting, by name — the fixer will have questions")
    elif is_ai_actor(clean):
        out.append(f"--by '{clean}' reads as an AI/automation, not a person; a bug report names who saw it")
    # Every string the report carries — the known fields AND any extra answer — one scan.
    text = "\n".join(str(v) for v in report.values() if isinstance(v, str))
    for label in secrets_in(text):
        out.append(f"the report contains what looks like {label} — remove it; this file is shared with the code host and cannot be un-published")
    return out


def slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.strip().lower()).strip("-")
    return slug[:48].rstrip("-") or "issue"


def next_issue_id(existing_names) -> str:
    highest = 0
    for name in existing_names:
        m = ISSUE_FILE_RE.match(str(name))
        if m:
            highest = max(highest, int(m.group(1)))
    return f"ISS-{highest + 1:04d}"


def proposed_risk(report: dict) -> str:
    """The risk tier the agent PROPOSES for the bugfix spec — a human confirms it (CLAUDE.md). Data
    exposed or written wrongly, or a blocker in production, is HIGH; a blocker elsewhere or wrong
    data shown is MEDIUM; the rest LOW. A proposal, never a decision."""
    impact = str(report.get("data_impact") or "")
    severity = str(report.get("severity") or "")
    env = str(report.get("environment") or "")
    if impact in ("wrong-written", "exposed") or (severity == "blocks" and env == "production"):
        return "HIGH"
    if severity == "blocks" or impact == "wrong-shown":
        return "MEDIUM"
    return "LOW"
