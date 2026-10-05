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

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
HARNESS_WORKFLOWS = PLUGIN_ROOT / "harness" / "workflows"
INSTALLED_WORKFLOWS = ".github/workflows"

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


def expected_workflows() -> dict[str, str]:
    """The pipelines the harness ships, minus the ones no project universally needs."""
    if not HARNESS_WORKFLOWS.is_dir():
        return {}
    return {
        f.name: f.name
        for f in sorted(HARNESS_WORKFLOWS.glob("*.yml"))
        if f.name not in NOT_UNIVERSALLY_EXPECTED
    }


def check_installed_checks(repo_root: Path) -> tuple[dict, dict]:
    """Which pipelines this project has, and which the playbook expects that it does not.

    A file comparison rather than a code-host query, deliberately: a pipeline that has never
    run reports no check on the host, so asking the host would call a correctly-installed but
    not-yet-triggered pipeline missing."""
    installed_dir = repo_root / INSTALLED_WORKFLOWS
    installed = sorted(f.name for f in installed_dir.glob("*.yml")) if installed_dir.is_dir() else []

    present = _check("checks_installed", "Which checks does this project have?",
                     "yes" if installed else "no",
                     ", ".join(installed) if installed else
                     f"no pipeline definitions found in {INSTALLED_WORKFLOWS}")

    expected = expected_workflows()
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


def report(repo_root: Path) -> dict:
    installed, missing = check_installed_checks(repo_root)
    checks = [
        check_signed_in(repo_root),
        check_can_read(repo_root),
        check_can_open_pull_requests(repo_root),
        check_branch_protected(repo_root),
        installed,
        missing,
    ]
    return {
        "ok": True,
        "repo": str(repo_root),
        "checks": checks,
        "not_universally_expected": NOT_UNIVERSALLY_EXPECTED,
    }


def format_report(result: dict) -> str:
    symbol = {"yes": "yes    ", "no": "NO     ", "unknown": "unknown"}
    lines = []
    for c in result["checks"]:
        lines.append(f"  {symbol.get(c['state'], '?')}  {c['question']}")
        lines.append(f"           {c['detail']}")
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
    args = parser.parse_args()

    result = report(resolve_repo_root(args))
    print(json.dumps(result, indent=2) if args.json else format_report(result))


if __name__ == "__main__":
    main()
