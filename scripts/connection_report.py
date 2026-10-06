"""Is this project actually wired up? (spec 0012's connection checks)

Six questions, each answered in plain language, and each able to say "could not tell" —
which is a third answer and not a failure. A check that reports "no" when it means "I could
not look" sends someone to fix something that was never broken.

The valuable one is the last: WHICH CHECKS THE PLAYBOOK EXPECTS THAT THIS PROJECT DOES NOT
HAVE. The others confirm what a person could work out for themselves in a minute. That one
answers something nobody can see by looking — a project can be signed in, readable, and
perfectly able to open pull requests while quietly missing the security review that its own
risk tiers assume will run.

The expected set is read from the harness's own pipeline definitions rather than listed here.
A hardcoded list in this file would be a second source of truth that drifts the first time a
pipeline is added, and it would drift silently — the exact failure this report exists to
catch, reproduced in the tool that catches it.

Read-only and always exits 0: this reports on a project, it does not gate anything.

Two axes (code-host providers): the four host probes follow the CODE HOST — `gh` for a GitHub
remote exactly as before, `az` through `ado_import` for an Azure DevOps one (`--host` overrides)
— while the two pipeline checks follow the CI PLATFORM the harness manifest records, because a
GitHub repository can legitimately run Azure Pipelines. Still exactly six checks, each still
`yes | no | unknown`; "the CLI is unavailable" rides the top-level `host` block, never a fourth
state and never a false "no" where "I could not look" is the truth.

Standalone or Workflow:
  - Standalone: --repo <path>
  - Workflow:   --state <path>/.sdlc/state.yaml
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import code_host  # noqa: E402
import host_report  # noqa: E402
from github_import import GitHubImportError  # noqa: E402

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
HARNESS_WORKFLOWS = PLUGIN_ROOT / "harness" / "workflows"
INSTALLED_WORKFLOWS = ".github/workflows"
ADO = "azure-devops"
# The CI axis: where the harness ships the gate pipelines, and where an install puts them.
HARNESS_PIPELINES = {"github": HARNESS_WORKFLOWS,
                     ADO: PLUGIN_ROOT / "harness" / "packs" / "cicd" / ADO / "azure-pipelines"}
INSTALLED_PIPELINES = {"github": INSTALLED_WORKFLOWS, ADO: ".azuredevops/pipelines"}
NO_PERMISSION_PROBE = ("Azure DevOps exposes no cheap permission probe; a refused `az repos pr create` is "
                       "the real answer")

# Pipelines that are deliberately NOT expected of every project: deployment belongs to a
# project that deploys, and the full evaluation benchmark is opt-in. Listing them here is a
# judgement, so it is written down rather than buried in a filter.
NOT_UNIVERSALLY_EXPECTED = {
    "deploy-dev.yml": "only a project that deploys needs this",
    "deploy-promote.yml": "only a project that deploys needs this",
    "eval-suite.yml": "the full benchmark is opt-in; eval-regression is the gate",
    "eval-regression.yml": "only a project with an evaluation suite needs this",
    "rails-telemetry.yml": "reporting, not a gate",
}


def _gh(args: list[str], cwd: Path, timeout: int = 20) -> tuple[bool, str]:
    """Run gh, returning (ok, output). Never raises — an unavailable code host is an answer."""
    try:
        result = subprocess.run(["gh", *args], cwd=str(cwd), capture_output=True,
                                text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as e:
        return (False, str(e))
    return (result.returncode == 0, (result.stdout or result.stderr).strip())


def _check(name: str, question: str, state: str, detail: str) -> dict:
    """One answered question. `state` is yes | no | unknown — never a bare boolean, because
    "I could not look" is a real answer and a boolean cannot hold it."""
    return {"check": name, "question": question, "state": state, "detail": detail}


def check_signed_in(repo_root: Path) -> dict:
    ok, out = _gh(["api", "user", "--jq", ".login"], repo_root)
    if ok and out:
        return _check("signed_in", "Signed in to the code host?", "yes", f"as {out}")
    return _check("signed_in", "Signed in to the code host?", "no",
                  "gh is not signed in — run `gh auth login`")


def check_can_read(repo_root: Path) -> dict:
    ok, out = _gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], repo_root)
    if ok and out:
        return _check("can_read", "Can read this repository?", "yes", out)
    return _check("can_read", "Can read this repository?", "no",
                  out or "the repository could not be read")


def check_can_open_pull_requests(repo_root: Path) -> dict:
    ok, out = _gh(["repo", "view", "--json", "viewerPermission", "--jq", ".viewerPermission"], repo_root)
    if not ok:
        return _check("can_open_prs", "Can open pull requests?", "unknown",
                      "the repository's permissions could not be read")
    # WRITE or better can open one; READ cannot. Reported from the host's own answer rather
    # than inferred from whether a push happened to work.
    if out in ("ADMIN", "MAINTAIN", "WRITE"):
        return _check("can_open_prs", "Can open pull requests?", "yes", f"permission: {out}")
    return _check("can_open_prs", "Can open pull requests?", "no",
                  f"permission: {out or 'unknown'} — a pull request needs write access")


def check_branch_protected(repo_root: Path) -> dict:
    ok, out = _gh(["api", "repos/{owner}/{repo}/rulesets"], repo_root)
    if not ok:
        return _check("branch_protected", "Is the default branch protected?", "unknown",
                      "the repository's rules could not be read")
    try:
        rulesets = json.loads(out)
    except json.JSONDecodeError:
        return _check("branch_protected", "Is the default branch protected?", "unknown",
                      "the rules came back unreadable")
    active = [r for r in rulesets if r.get("enforcement") == "active"] if isinstance(rulesets, list) else []
    if active:
        return _check("branch_protected", "Is the default branch protected?", "yes",
                      f"{len(active)} active rule set(s)")
    # Deliberately "no, as far as this can tell" rather than "no": what actually decides is
    # whether a direct push is refused, and a repository can be protected in ways this probe
    # does not see.
    return _check("branch_protected", "Is the default branch protected?", "no",
                  "no active rule sets found — what actually decides is whether a direct "
                  "push gets refused")


def expected_workflows(ci_platform: str = "github") -> dict[str, str]:
    """The pipelines the harness ships for this CI platform, minus the ones no project universally
    needs. The Azure Pipelines pack realises the same gates under the same file names."""
    folder = HARNESS_PIPELINES.get(ci_platform, HARNESS_WORKFLOWS)
    if not folder.is_dir():
        return {}
    return {
        f.name: f.name
        for f in sorted(folder.glob("*.yml"))
        if f.name not in NOT_UNIVERSALLY_EXPECTED
    }


def check_installed_checks(repo_root: Path, ci_platform: str = "github") -> tuple[dict, dict]:
    """Which pipelines this project has, and which the playbook expects that it does not.

    A file comparison rather than a code-host query, deliberately: a pipeline that has never
    run reports no check on the host, so asking the host would call a correctly-installed but
    not-yet-triggered pipeline missing. Read from the CI platform's directories, so an Azure
    Pipelines install is never told its GitHub workflows are missing."""
    installed_rel = INSTALLED_PIPELINES.get(ci_platform, INSTALLED_WORKFLOWS)
    installed_dir = repo_root / installed_rel
    installed = sorted(f.name for f in installed_dir.glob("*.yml")) if installed_dir.is_dir() else []

    present = _check("checks_installed", "Which checks does this project have?",
                     "yes" if installed else "no",
                     ", ".join(installed) if installed else
                     f"no pipeline definitions found in {installed_rel}")

    expected = expected_workflows(ci_platform)
    if not expected:
        missing = _check("checks_missing", "Any check the playbook expects but is missing?",
                         "unknown",
                         "the playbook's own pipeline definitions could not be read, so there "
                         "is nothing to compare against")
        return present, missing

    absent = [name for name in expected if name not in installed]
    if not absent:
        return present, _check("checks_missing",
                               "Any check the playbook expects but is missing?", "no",
                               f"all {len(expected)} expected pipelines are present")

    return present, _check("checks_missing", "Any check the playbook expects but is missing?",
                           "yes", ", ".join(absent))


# --- the Azure DevOps probes (through ado_import; never raise) ---------------------------------

def _ado_failure(e: Exception) -> str:
    state, detail = host_report.cli_state_from_error("az", str(e))
    if state == "signed_out":
        return "az is not signed in — run `az login`"
    return detail if state != "unknown" else str(e).splitlines()[0]


def ado_checks(repo_root: Path) -> tuple[list[dict], str | None]:
    """The four host probes on Azure DevOps, and the first CLI failure (for the `host` block)."""
    import ado_import
    error: str | None = None
    try:
        who = ado_import.whoami(repo_root)
        handle = code_host.resolve_person(ado_import._roster(repo_root), who)
        # az's DEFAULT account decides the token: a person signed in to the wrong tenant is
        # "signed in" and still cannot read the organisation — so the tenant is named here.
        detail = (f"as {who['login']}" + (f" (roster: {handle})" if handle else "")
                  + (f"; tenant {who['tenant']}" if who.get("tenant") else "")
                  + " — az's default account decides the token; the organisation may need a different one")
        signed_in = _check("signed_in", "Signed in to the code host?", "yes", detail)
    except GitHubImportError as e:
        error = str(e)
        signed_in = _check("signed_in", "Signed in to the code host?", "no", _ado_failure(e))
    try:
        can_read = _check("can_read", "Can read this repository?", "yes", ado_import.repo_view(repo_root)["nameWithOwner"])
    except GitHubImportError as e:
        error = error or str(e)
        can_read = _check("can_read", "Can read this repository?", "no", _ado_failure(e))
    can_open = _check("can_open_prs", "Can open pull requests?", "unknown", NO_PERMISSION_PROBE)
    try:
        configs, branch = ado_import.branch_policies(repo_root)
        enforcing = [c for c in configs if isinstance(c, dict) and c.get("isEnabled") and c.get("isBlocking")]
        if enforcing:
            protected = _check("branch_protected", "Is the default branch protected?", "yes",
                               f"{len(enforcing)} enforcing polic{'y' if len(enforcing) == 1 else 'ies'} on `{branch}`")
        else:
            protected = _check("branch_protected", "Is the default branch protected?", "no",
                               f"no enabled, blocking policy on `{branch}` — what decides is whether a direct "
                               "push gets refused")
    except GitHubImportError as e:
        error = error or str(e)
        protected = _check("branch_protected", "Is the default branch protected?", "unknown",
                           f"policies could not be read: {_ado_failure(e)}")
    return [signed_in, can_read, can_open, protected], error


def report(repo_root: Path, host: str | None = None) -> dict:
    detection = host_report.detect(repo_root, host)
    ci_platform = code_host.installed_ci_platform(repo_root)
    installed, missing = check_installed_checks(repo_root, ci_platform)
    error = None
    if detection.host == ADO:
        host_checks, error = ado_checks(repo_root)
    else:
        host_checks = [
            check_signed_in(repo_root),
            check_can_read(repo_root),
            check_can_open_pull_requests(repo_root),
            check_branch_protected(repo_root),
        ]
    checks = [*host_checks, installed, missing]
    note = None
    if detection.host not in (ci_platform, "none"):
        note = (f"the code host is {detection.host} but the installed CI pack is {ci_platform} — a legitimate "
                f"combination; the two pipeline checks read the {INSTALLED_PIPELINES[ci_platform]} directory")
    return {
        "ok": True,
        "repo": str(repo_root),
        "checks": checks,
        "not_universally_expected": NOT_UNIVERSALLY_EXPECTED,
        "host": host_report.host_block(detection, error),
        "ci_platform": ci_platform,
        "note": note,
    }


def format_report(result: dict) -> str:
    symbol = {"yes": "yes    ", "no": "NO     ", "unknown": "unknown"}
    lines = []
    for c in result["checks"]:
        lines.append(f"  {symbol.get(c['state'], '?')}  {c['question']}")
        lines.append(f"           {c['detail']}")
    h = result.get("host")
    if h:  # a footer only when the host is not GitHub — the GitHub text is byte-identical
        footer = host_report.footer(code_host.Detection(h["name"], h["source"], None, h["detail"]))
        if footer:
            lines.append(f"  {footer}")
        if result.get("note"):
            lines.append(f"  Note: {result['note']}")
    return "\n".join(lines)


def resolve_repo_root(args) -> Path:
    if args.state:
        state = Path(args.state)
        if not state.exists():
            print(f"Error: State file not found: {state}", file=sys.stderr)
            sys.exit(1)
        return state.resolve().parent.parent
    return Path(args.repo).resolve()


def main():
    parser = argparse.ArgumentParser(
        description="Is this project wired up? (read-only; always exits 0)")
    src = parser.add_mutually_exclusive_group()
    src.add_argument("--state", help="Path to .sdlc/state.yaml (workflow mode)")
    src.add_argument("--repo", default=".", help="Target repo root (standalone mode; default: cwd)")
    parser.add_argument("--json", action="store_true", help="Emit the report as JSON")
    parser.add_argument("--host", choices=code_host.HOSTS, default=None,
                        help="Code host to probe (default: detected from the origin remote; "
                             "`none` falls through to gh as before)")
    args = parser.parse_args()

    result = report(resolve_repo_root(args), args.host)
    print(json.dumps(result, indent=2) if args.json else format_report(result))


if __name__ == "__main__":
    main()
