"""Shared helpers for the Azure DevOps fixture tests (code-host providers).

Two fixture folders under scripts/tests/fixtures/code_host/azure_devops/:
  * `captured/` — real `az` output, anonymised (CAPTURE-NOTES.md), wrapped
    `{_provenance, _command, _secs, value}`. The ground truth; `load()` prefers it. The files come
    from the SECOND capture (another repository of the same organisation); four that the second
    capture did not produce were kept from the first (`pr_show_abandoned`, `pr_policy_list_abandoned`,
    `pr_threads_abandoned`, `pipelines_show`).
  * the folder itself — the older hand-written documents (`_provenance: hand-written (unverified)`),
    still the only source for shapes no real organisation exercised (a draft PR, a `rejected`
    policy evaluation, a grader comment carrying the verdict block). `load(name, hand_written=True)`
    reaches one on purpose; `source_of()` says which file a name resolves to, so a test can state
    which kind of evidence it rests on and test_fixture_provenance.py can list what is still only
    hand-written.

Tests derive their expected ids, counts and timestamps FROM the fixture (`captured_pr`,
`route_param`, …) rather than hard-coding the numbers of one capture, so a re-capture changes the
data without breaking the assertions. Where a FakeAz answer is DERIVED (re-labelled from a captured
record because the capture did not run that exact call) the helper says so.

`FakeAz` is the router that stands in for `ado_transport.az_json`, keyed on the leading non-flag
argv words, and raises on anything it was not told about — that AssertionError is the read-only
pin, the same device test_pipeline_proof.py uses for `gh`.
"""

import json
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "code_host" / "azure_devops"
CAPTURED = FIXTURES / "captured"
# The remote the tests pretend to be on. The capture was anonymised to contoso / repo-1 / repo-6,
# but the scope az receives comes from THIS remote, never from a fixture, so the slug is free.
ADO_REMOTE = "https://dev.azure.com/contoso/Claims/_git/claims-api"
CAPTURED_REMOTE = "https://dev.azure.com/contoso/repo-1/_git/repo-6"  # what the captured `_command`s targeted


def fixture_path(name: str, hand_written: bool = False) -> Path:
    captured = CAPTURED / f"{name}.json"
    if not hand_written and captured.is_file():
        return captured
    return FIXTURES / f"{name}.json"


def source_of(name: str) -> str:
    """`captured` or `hand-written` — which file `load(name)` reads by default."""
    return "captured" if fixture_path(name).parent == CAPTURED else "hand-written"


def load(name: str, hand_written: bool = False):
    """The az document a fixture stands for. A captured `value` of null is an empty stdout
    (`az boards query` with no match prints nothing) and comes back as `[]`, exactly as
    `ado_transport.az_json` would read it."""
    doc = json.loads(fixture_path(name, hand_written).read_text(encoding="utf-8"))
    if "_command" in doc:  # wrapped so it can carry provenance (every captured file; hand-written arrays)
        return [] if doc.get("value") is None else doc["value"]
    return {k: v for k, v in doc.items() if k != "_provenance"}


def command_of(name: str) -> list[str]:
    """The `az` argv a captured fixture was the answer to (`_command`); [] for a hand-written file."""
    doc = json.loads(fixture_path(name).read_text(encoding="utf-8"))
    return list(doc.get("_command") or [])


def route_param(name: str, key: str) -> str | None:
    """`key=value` among a captured `devops invoke --route-parameters` — e.g. the pullRequestId a
    threads or commits fixture was captured for, so a test never guesses which PR it belongs to."""
    return next((a.split("=", 1)[1] for a in command_of(name) if a.startswith(f"{key}=")), None)


def captured_prs() -> dict[int, dict]:
    """Every captured GitPullRequest by id: both `pr list` answers plus the three `pr show`s (the
    abandoned PR lives only in its show, kept from the first capture)."""
    prs: dict[int, dict] = {}
    for name in ("pr_list", "pr_list_repo"):
        for p in load(name):
            prs[p["pullRequestId"]] = p
    for name in ("pr_show_active", "pr_show_completed", "pr_show_abandoned"):
        p = load(name)
        prs.setdefault(p["pullRequestId"], p)
    return prs


def captured_pr(status: str, **where) -> dict:
    """The NEWEST captured PR with this `status` whose top-level fields match `where`, e.g.
    `captured_pr("active", mergeStatus="conflicts")`. Raises when the capture has none — a test
    that needs a shape nobody captured must say so and derive it."""
    for p in sorted(captured_prs().values(), key=lambda p: p["pullRequestId"], reverse=True):
        if p["status"] == status and all(p.get(k) == v for k, v in where.items()):
            return p
    raise LookupError(f"no captured PR with status={status!r} and {where}")


def route_key(args: list[str]) -> str:
    """The leading command words, e.g. `repos pr policy list`, `devops invoke git`, `account show`."""
    words = []
    for a in args:
        if a.startswith("-"):
            break
        words.append(a)
    if words[:2] == ["devops", "invoke"]:
        words.append(args[args.index("--area") + 1])
        words.append(args[args.index("--resource") + 1])
    return " ".join(words)


def arg_after(args: list[str], flag: str) -> str | None:
    return args[args.index(flag) + 1] if flag in args else None


class FakeAz:
    """Stands in for ado_import.az_json. `answers` maps a route key to a document or a callable
    (args -> document); `fail` maps a needle in the argv to an AdoImportError message."""

    def __init__(self, answers: dict | None = None, fail: dict | None = None):
        self.answers = dict(DEFAULT_ANSWERS)
        self.answers.update(answers or {})
        self.fail = fail or {}
        self.calls: list[list[str]] = []

    def __call__(self, args, cwd):
        import ado_map
        self.calls.append(list(args))
        joined = " ".join(args)
        for needle, message in self.fail.items():
            if needle in joined:
                raise ado_map.AdoImportError(message)
        key = route_key(args)
        # An invoke answer may be registered with or without its resource word (`devops invoke git`
        # serves every git resource) — other waves' tests register either form.
        candidates = [key, " ".join(key.split()[:3])] if key.startswith("devops invoke") else [key]
        found = next((k for k in candidates if k in self.answers), None)
        if found is None:
            raise AssertionError(f"unexpected az call: {args}")
        answer = self.answers[found]
        return answer(args) if callable(answer) else answer

    def count(self, *leading: str) -> int:
        return sum(1 for c in self.calls if c[:len(leading)] == list(leading))


def _pr_list(args):
    """`repos pr list`: filtered by `--source-branch` and a non-`all` `--status` like az does. Every
    captured PR sits on the anonymised `branch-x`, so that branch answers every row of `pr_list`
    (the newest of which is active) and any other branch answers none."""
    prs = load("pr_list")
    branch = arg_after(args, "--source-branch")
    status = arg_after(args, "--status")
    if branch:
        prs = [p for p in prs if p["sourceRefName"] == f"refs/heads/{branch}"]
    if status and status != "all":
        prs = [p for p in prs if p["status"] == status]
    return prs


def _account_show(args):
    """`az account show` was captured whole; the provider asks for
    `--query "{user:user.name,tenant:tenantId}"`, so the projection az would apply is applied here."""
    acct = load("account_show")
    if arg_after(args, "--query") == "{user:user.name,tenant:tenantId}":
        return {"user": (acct.get("user") or {}).get("name"), "tenant": acct.get("tenantId")}
    return acct


def _list_record(definition_id: int, name: str) -> dict:
    """A `pipelines list` row (no `process`, no `repository` — captured: the list carries neither)."""
    shown = load("pipelines_show")
    return {"id": definition_id, "name": name, "path": shown.get("path", "\\"), "type": shown.get("type", "build"),
            "queueStatus": shown.get("queueStatus", "enabled"), "revision": 1}


def project_pipelines() -> list[dict]:
    """DERIVED: the project-wide `pipelines list` the second capture ran (27 definitions) but did not
    keep. Stands in with every definition the kept files name — the captured `pipelines show`
    (2316, bound to a SIBLING repository), the `runs show` build's definition (also a sibling's),
    and the definitions behind the deployment records — so the repository fallback has both kinds
    to sort. `pipeline_repository()` says which repository each one is bound to."""
    rows: dict[int, dict] = {}
    shown = load("pipelines_show")
    rows[shown["id"]] = _list_record(shown["id"], shown["name"])
    build_def = load("runs_show")["definition"]
    rows.setdefault(build_def["id"], _list_record(build_def["id"], build_def["name"]))
    for rec in load("deployment_records")["value"]:
        d = rec.get("definition") or {}
        if d.get("id"):
            rows.setdefault(d["id"], _list_record(d["id"], d["name"]))
    return [rows[k] for k in sorted(rows)]


def pipeline_repository(definition_id: int) -> dict:
    """The `repository` block a derived `pipelines show --id N` answers. Captured where the capture
    had one (the shown definition, the shown build's definition — both bound to sibling
    repositories); the deployment-record definitions are DERIVED as bound to the captured
    repository (`repos show`), so the test remote has pipelines to find."""
    shown = load("pipelines_show")
    if definition_id == shown["id"]:
        return shown["repository"]
    build = load("runs_show")
    if definition_id == build["definition"]["id"]:
        return build["repository"]
    repo = load("repos_show")
    return {**shown["repository"], "id": repo["id"], "name": repo["name"], "defaultBranch": repo.get("defaultBranch"),
            "url": repo.get("webUrl")}


def repo_pipelines() -> list[dict]:
    """The derived project-wide definitions bound to the captured repository — what an honest
    fallback must end up with."""
    repo_id = load("repos_show")["id"]
    return [d for d in project_pipelines() if pipeline_repository(d["id"]).get("id") == repo_id]


def _pipelines_list(args):
    """`pipelines list`: WITH `--repository` the captured answer — `[]`, for a repository that has
    pipelines project-wide (second capture: the filter cannot be trusted); WITHOUT it the derived
    project-wide list."""
    return load("pipelines_list") if "--repository" in args else project_pipelines()


def _pipelines_show(args):
    """`pipelines show --id N`: the captured record is definition 2316 (`backend/ci-cd.yml`, a
    sibling repository's). Every other derived definition answers the same record re-labelled with
    its id, name, repository binding and a flat `.azuredevops/pipelines/<name>.yml` — DERIVED,
    standing in for the shows the capture did not run."""
    wanted = int(arg_after(args, "--id") or 0)
    shown = load("pipelines_show")
    if wanted == shown["id"]:
        return shown
    match = next((d for d in project_pipelines() if d["id"] == wanted), None)
    if match is None:
        raise AssertionError(f"pipelines show for an id the list never named: {wanted}")
    return {**shown, "id": match["id"], "name": match["name"], "repository": pipeline_repository(wanted),
            "process": {"type": 2, "yamlFilename": f".azuredevops/pipelines/{match['name']}.yml"}}


def _runs_list(args):
    """`pipelines runs list --pipeline-ids N`: the captured answer is `[]` (a definition with no
    runs). For the definition of the captured `runs show` build, that one build is served as its
    history — DERIVED (a Build record is the same shape in `show` and in `list`)."""
    build = load("runs_show")
    if arg_after(args, "--pipeline-ids") == str(build["definition"]["id"]):
        return [build]
    return load("runs_list")


DEFAULT_ANSWERS = {
    "account show": _account_show,
    "repos show": load("repos_show"),
    "repos pr list": _pr_list,
    "repos pr policy list": load("pr_policy_list"),
    "repos pr reviewer list": load("pr_reviewer_list"),
    "devops invoke git pullRequestThreads": load("pr_threads"),
    "devops invoke git pullRequestCommits": load("pr_commits"),
    "devops invoke build timeline": load("timeline"),
    "devops invoke distributedtask environments": load("environments"),
    "devops invoke distributedtask environmentdeploymentrecords": load("deployment_records"),
    "repos policy list": load("policy_list"),
    "pipelines list": _pipelines_list,
    "pipelines show": _pipelines_show,
    "pipelines runs list": _runs_list,
    "pipelines variable-group list": load("variable_groups"),
    "pipelines variable-group variable list": load("variable_group_variables"),
    "boards query": load("boards_query"),
}
