"""The one impure seam for Azure DevOps: how `az` is spawned (code-host providers, Wave 1).

The twin of `github_import.run_gh / gh_json`, with the same contract (UTF-8 forced, 60 s timeout,
one exception type) plus the az-specific rules, each of which is a pitfall met in practice
(docs/proposals/code-host-providers.md §4.3; fixtures/code_host/azure_devops/captured/CAPTURE-NOTES.md):
  * `AZURE_EXTENSION_USE_DYNAMIC_INSTALL=no` — a missing extension or a typo otherwise triggers an
    unprompted network install (observed: the extension upgraded itself mid-survey).
  * `AZURE_CORE_COLLECT_TELEMETRY=no` — no telemetry fork per call.
  * `--only-show-errors` always — preview/upgrade warnings land on stderr even on success.
  * `--detect false --org --project [--repository]` from the PARSED REMOTE — az's own detection
    costs a `GET …/vsts/info` round-trip per call and needs auth.
  * `--api-version` always on `devops invoke` — the default is 5.0, which predates Environments.
    Environments and deployment records need `7.1-preview` exactly: `7.1-preview.1` crashes the
    extension (`could not convert string to float: '7.1.1'`, captured 2026-10-05).
  * Empty stdout is `[]` — `az boards query` prints NOTHING when no work item matches (captured),
    and an empty list is the honest reading of "nothing matched", not an error.
  * The CLI's DEFAULT ACCOUNT decides the Azure DevOps token. An identity that has never opened
    the organisation in a browser gets HTTP 403 "Identity … has not been materialized"; the
    error is passed on with what to do about it, because the raw text does not say.

Tests monkeypatch `subprocess.run` (for the transport itself) or `az_json` (for everything above
it); nothing in the suite spawns a real `az`.
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import code_host  # noqa: E402
from ado_map import AdoImportError  # noqa: E402

AZ_ENV = code_host.AZ_ENV
API_VERSION = "7.1"
PREVIEW_API_VERSION = "7.1-preview"  # environments / environmentdeploymentrecords ONLY (see above)
MATERIALIZED_HINT = ("the signed-in identity has never opened this organisation in a browser: sign in to it "
                     "interactively once with the account az is using (az's default account decides the "
                     "token; a guest in the organisation's tenant needs "
                     "`az login --allow-no-subscriptions --tenant <tenant id>`)")

# Per-process caches. The scope is parsed once per repo; the repository record serves every
# threads/commits route (it needs the repository GUID); threads serve two fetchers (bodies and
# events) for one PR; the pipelines list and each definition's `show` serve every rail.
# `clear_caches()` exists for tests.
_SCOPE: dict[str, code_host.RemoteInfo] = {}
_REPO: dict[str, dict] = {}
_THREADS: dict[tuple[str, int], dict] = {}
_PIPELINES: dict[str, list] = {}
_PIPELINE_SHOW: dict[tuple[str, int], dict] = {}


def clear_caches() -> None:
    _SCOPE.clear()
    _REPO.clear()
    _THREADS.clear()
    _PIPELINES.clear()
    _PIPELINE_SHOW.clear()


def az_binary() -> str:
    # shutil.which honours PATHEXT, so on Windows this resolves the `az.cmd` shim.
    return shutil.which("az") or "az"


def run_az(args: list[str], cwd, timeout: int = 60) -> str:
    """Shell out to `az`, returning stdout. Never raises anything but AdoImportError."""
    cmd = [az_binary(), *args, "--only-show-errors"]
    try:
        result = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, encoding="utf-8",
                                errors="replace", timeout=timeout, env={**os.environ, **AZ_ENV})
    except FileNotFoundError as e:
        raise AdoImportError("The Azure CLI (`az`) is not installed or not on PATH.") from e
    except subprocess.TimeoutExpired as e:
        raise AdoImportError(f"`az {' '.join(args)}` timed out after {timeout}s.") from e
    if result.returncode != 0:
        err = result.stderr.strip()
        if "azure-devops" in err and "extension" in err.lower():
            err = f"{err}\nrun `az extension add --name azure-devops`"
        elif "materialized" in err:
            err = f"{err}\n{MATERIALIZED_HINT}"
        raise AdoImportError(err or f"`az {' '.join(args)}` exited {result.returncode}.")
    return result.stdout


def az_json(args: list[str], cwd):
    out = run_az([*args, "-o", "json"], cwd)
    try:
        return json.loads(out) if out.strip() else []
    except json.JSONDecodeError as e:
        raise AdoImportError(f"`az {' '.join(args)}` returned unparseable JSON: {e}") from e


def remote(repo_root) -> code_host.RemoteInfo:
    """The parsed Azure DevOps remote for this checkout (honouring `.sdlc/code-host.yaml`), or an
    AdoImportError that says what to do — never a guess at an org."""
    key = str(repo_root)
    if key not in _SCOPE:
        det = code_host.detect_host(repo_root)
        if det.remote is None or det.remote.host != "azure-devops":
            raise AdoImportError(f"origin is not an Azure DevOps remote ({det.detail}); "
                                 f"set organization/project/repository in {code_host.CODE_HOST_FILE}")
        _SCOPE[key] = det.remote
    return _SCOPE[key]


def scope(repo_root, with_repository: bool = True) -> list[str]:
    r = remote(repo_root)
    args = ["--detect", "false", "--org", r.org_url, "--project", r.project]
    return [*args, "--repository", r.repo] if with_repository else args


def invoke(repo_root, area: str, resource: str, route: dict, api_version: str = API_VERSION) -> dict:
    """`az devops invoke` for the REST resources that have no native verb (threads, commits,
    timeline, environments). `api_version` is PREVIEW_API_VERSION for the environments area only."""
    params = [f"{k}={v}" for k, v in route.items()]
    return az_json(["devops", "invoke", "--area", area, "--resource", resource, "--route-parameters", *params,
                    "--api-version", api_version, "--org", remote(repo_root).org_url], repo_root)
