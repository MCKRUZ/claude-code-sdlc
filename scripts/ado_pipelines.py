"""Azure Pipelines reads: runs, jobs and the variable groups the gates sign in with (Wave 1;
reconciled with the 2026-10-05 captures in Wave 3).

The pipelines half of `ado_import` — split out only for file size. Same names and signatures as
the GitHub side (`pipeline_proof._fetch_runs`, the inline `gh run view --json jobs`, the inline
`gh secret list` in `gate_auth.status`), documented in `code_host.PROVIDER_FUNCTIONS`.

Captured facts this leans on: `az pipelines list` carries NO `process` key, so the YAML file a
definition runs is only on `az pipelines show --id N` (`process.yamlFilename`) — one `show` per
definition, cached per process; `runs list` has no `_links`, so the run URL is built from the
org URL (`ado_map.run_web_url`); `variable-group list` returns `variables` as a dict keyed by
name (`{isSecret, value}`, value null for secrets). The second capture added one more: `pipelines
list --repository R --repository-type tfsgit` answered ZERO definitions for a repository that has
pipelines project-wide (27), so the repository filter cannot be trusted. When it answers nothing,
the project-wide list is read and each definition is matched to this repository through its
`show` record's `repository.id` / `repository.name` (cached) — the YAML-path match then runs on
that bound set. "No pipeline definition found for <repo>" is said only after that fallback.
"""

import re
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ado_transport as t  # noqa: E402
from ado_map import AdoImportError, map_jobs, map_runs  # noqa: E402

PIPELINES_DIR = ".azuredevops/pipelines"
_PIPELINES_LOCK = threading.Lock()  # pipeline_proof reads rails concurrently; the list is filled once


def _pipeline_show(cwd, definition_id: int) -> dict:
    key = (str(cwd), int(definition_id))
    if key not in t._PIPELINE_SHOW:
        t._PIPELINE_SHOW[key] = t.az_json(["pipelines", "show", *t.scope(cwd, with_repository=False),
                                           "--id", str(definition_id)], cwd)
    return t._PIPELINE_SHOW[key]


def _repository_of(cwd, definition: dict) -> dict:
    """The repository a definition is bound to — `list` does not carry it (captured), `show` does.
    A `repository` key on the list row is honoured first should a future extension add one."""
    return definition.get("repository") or _pipeline_show(cwd, definition["id"]).get("repository") or {}


def _bound_to_this_repository(cwd, definition: dict) -> bool:
    """Bound when the definition's repository GUID is this checkout's (`repos show`), or its name
    is the remote's repository name. A definition whose `show` names no repository is NOT assumed
    to be this one's — a sibling repository's pipeline must never count as ours."""
    import ado_import  # lazy: ado_import imports this module; repo_view's record is cached per process
    repo = _repository_of(cwd, definition)
    repo_id = str(ado_import.repo_view(cwd)["id"]).lower()
    repo_name = t.remote(cwd).repo.lower()
    return (str(repo.get("id") or "").lower() == repo_id
            or str(repo.get("name") or "").lower() == repo_name)


def _pipelines(cwd) -> list:
    """The definitions bound to THIS repository. The repository-filtered list is asked first; when
    it answers nothing (second capture: zero for a repository with 27 project-wide definitions)
    the project-wide list is read and filtered through each definition's `show` — one call per
    definition, cached, so the cost is paid once per process."""
    key = str(cwd)
    with _PIPELINES_LOCK:
        if key not in t._PIPELINES:
            defs = t.az_json(["pipelines", "list", *t.scope(cwd), "--repository-type", "tfsgit"], cwd) or []
            if not defs:
                everything = t.az_json(["pipelines", "list", *t.scope(cwd, with_repository=False)], cwd) or []
                defs = [d for d in everything if isinstance(d, dict) and d.get("id") is not None
                        and _bound_to_this_repository(cwd, d)]
            t._PIPELINES[key] = defs
        return t._PIPELINES[key]


def yaml_filename(cwd, definition: dict) -> str:
    """The YAML path a definition runs, forward-slashed; "" when the definition is not YAML-backed.
    Read from `show` because `list` does not carry it (captured) — the list's own `process` key is
    honoured first should a future extension add it."""
    process = definition.get("process") or _pipeline_show(cwd, definition["id"]).get("process") or {}
    return str(process.get("yamlFilename") or "").replace("\\", "/")


def find_definition(cwd, workflow_file: str) -> dict | None:
    """The definition whose YAML is `.azuredevops/pipelines/<file>` — the whole path, so a nested
    `backend/ci.yml` is never mistaken for the gate `ci.yml`; else a definition NAMED like the stem.
    Both searches run over the definitions bound to this repository only."""
    wanted = f"{PIPELINES_DIR}/{workflow_file}"
    defs = _pipelines(cwd)
    by_yaml = next((d for d in defs if yaml_filename(cwd, d).endswith(wanted)), None)
    return by_yaml or next((d for d in defs if d.get("name") == Path(workflow_file).stem), None)


def fetch_runs(cwd: str, workflow_file: str, limit: int) -> list[dict]:
    """Runs of the pipeline behind `.azuredevops/pipelines/<file>`. No definition → AdoImportError
    naming the file, which the caller renders as NO_DATA — never "never fired". When the repository
    has NO definition at all, even after the project-wide fallback, the message says so."""
    match = find_definition(cwd, workflow_file)
    if match is None:
        message = f"pipeline definition for `{workflow_file}` not found in Azure Pipelines"
        if not _pipelines(cwd):
            r = t.remote(cwd)
            message += (f": no pipeline definition found for {r.repo} in project {r.project} "
                        f"(the repository filter answered nothing and no project-wide definition is bound to it)")
        raise AdoImportError(message)
    builds = t.az_json(["pipelines", "runs", "list", *t.scope(cwd, with_repository=False),
                        "--pipeline-ids", str(match["id"]), "--top", str(limit), "--query-order", "QueueTimeDesc"], cwd)
    return map_runs(builds, t.remote(cwd))


def run_jobs(cwd: str, run_id: int) -> dict:
    return map_jobs(t.invoke(cwd, "build", "timeline", {"project": t.remote(cwd).project, "buildId": run_id}))


_GROUP_RE = re.compile(r"^\s*-\s*group:\s*['\"]?([^'\"\s#]+)", re.MULTILINE)


def referenced_variable_groups(repo_root) -> set[str]:
    """`- group: NAME` across the installed pipelines, skipping unfilled `<<TOKEN>>` / `${{ }}` /
    `_NOT_SET` placeholders — the same reading doctor.required_variable_groups makes."""
    folder = Path(repo_root) / PIPELINES_DIR
    names: set[str] = set()
    for path in sorted(folder.glob("*.yml")) if folder.is_dir() else []:
        names.update(n for n in _GROUP_RE.findall(path.read_text(encoding="utf-8", errors="replace"))
                     if not n.startswith(("<<", "${{")) and not n.endswith("_NOT_SET"))
    return names


def secret_names(repo_root) -> list[str]:
    """Variable names in the groups the pipelines reference — all groups when none is referenced
    yet (a fresh install still carries placeholders, and what exists is the honest answer then).
    `variable list` returns a name-keyed mapping (captured); a list of {name} is tolerated."""
    scope = t.scope(repo_root, with_repository=False)
    groups = t.az_json(["pipelines", "variable-group", "list", *scope], repo_root)
    wanted = referenced_variable_groups(repo_root)
    names: set[str] = set()
    for g in groups or []:
        if wanted and g.get("name") not in wanted:
            continue
        variables = t.az_json(["pipelines", "variable-group", "variable", "list", "--group-id", str(g["id"]), *scope],
                              repo_root)
        if isinstance(variables, dict):
            names.update(variables.keys())
        else:
            names.update(v.get("name") for v in variables if isinstance(v, dict))
    return sorted(n for n in names if n)
