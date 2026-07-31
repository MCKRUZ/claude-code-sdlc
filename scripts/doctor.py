"""doctor.py — day-1 check that the installed harness will actually run.

The harness fails quietly. Hooks that are registered but whose interpreter is missing, rails
scripts installed without the executable bit, a repo secret the gates need that nobody set — each
of these leaves a repo that *looks* set up and has no working checking ladder. Two of the three
bugs found on the first real install were exactly that shape.

So this checks the things that are invisible when they are wrong:

    uv run scripts/doctor.py                 # in the client repo
    uv run scripts/doctor.py --repo <path>
    uv run scripts/doctor.py --offline       # skip the checks that need gh

Exit 1 if anything FAILs. WARN never fails the run — it marks what could not be determined.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

PASS, FAIL, WARN = "PASS", "FAIL", "WARN"

# A diagnostic tool must never be the thing that crashes. The default Windows console is cp1252,
# which cannot encode the dashes and arrows this report used to print — it died mid-run, on the
# platform most of its users are on. Output is forced to UTF-8 and degrades rather than raises.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Tokens the installer deliberately leaves for a human, and the phase that fills each. A residual
# token is not corruption — it is unfinished setup — so the report says who finishes it.
TOKEN_OWNER = {
    "ADO_ORGANIZATION": "Phase 3 — your Azure DevOps organization name",
    "GATED_PATHS": "Phase 3 — the paths that trigger the security review",
    "EVAL_TEST_PROJECT": "Phase 3 — the project holding your eval fixtures",
    "SOLUTION_OR_PROJECT": "Phase 3 — the solution or project CI builds",
    "HEALTH_CHECK": "Phase 8 — how you confirm the new version serves",
    "DEPLOY_STEP": "Phase 8 — the real deploy command",
    "CAPTURE_LAST_GOOD": "Phase 8 — how you record the currently-live version",
    "RESTORE_LAST_GOOD": "Phase 8 — how you roll back",
    "DEV_ENVIRONMENT": "Phase 3 — the GitHub Environment name",
    "ARTIFACT_NAME": "Phase 3 — the CI artifact the deploy promotes",
    "CI_WORKFLOW_NAME": "Phase 3 — the CI workflow name that triggers deploy",
}

# Two placeholder forms, because one of them cannot use the angle brackets. A value that lands in
# an ARGV must avoid << and >>: on Windows npx runs through cmd.exe, which reads them as redirect
# operators and dies before the tool starts. Those few spots use a NAME_NOT_SET sentinel instead,
# and both forms mean the same thing here — setup somebody still has to finish.
RESIDUAL_TOKEN = re.compile(r"<<([A-Z][A-Z0-9_]*)>>|\b([A-Z][A-Z0-9_]*)_NOT_SET\b")
SCANNED_SUFFIXES = {".json", ".yml", ".yaml", ".md", ".sh", ".ps1"}


@dataclass
class Result:
    status: str
    title: str
    detail: str
    fix: str = ""


def _run(cmd: list[str], timeout: int = 30) -> tuple[int, str]:
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout,
                           encoding="utf-8", errors="replace")
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        return 127, str(exc)


# ── tools ─────────────────────────────────────────────────────────────────────────────────────

def check_tools(repo: Path) -> list[Result]:
    """The binaries the harness shells out to. `pwsh` is the one people miss.

    settings.json registers the hooks via `pwsh` (PowerShell 7 is cross-platform). Without it the
    Stop hook never fires — the agent can end a turn on a red build and nothing objects. The
    harness looks installed and the highest-value rung of the ladder is simply absent.
    """
    out = []
    for tool, why, fix in [
        ("git", "everything", "install git"),
        ("gh", "branch protection, secrets, PR gates", "install the GitHub CLI: https://cli.github.com"),
        ("pwsh", "THE HOOKS — settings.json runs them through pwsh", "install PowerShell 7: https://aka.ms/powershell"),
    ]:
        path = shutil.which(tool)
        if path:
            out.append(Result(PASS, f"{tool} present", path))
        else:
            out.append(Result(FAIL, f"{tool} missing", f"needed for: {why}", fix))
    return out


# ── harness install ───────────────────────────────────────────────────────────────────────────

def check_harness_present(repo: Path) -> list[Result]:
    out = []
    manifest = repo / ".claude" / "harness-manifest.json"
    if not manifest.exists():
        return [Result(FAIL, "harness not installed",
                       "no .claude/harness-manifest.json in this repo",
                       "run /sdlc-setup, or install_harness.py, from the repo root")]
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [Result(FAIL, "harness manifest unreadable", str(exc),
                       "re-run the installer with --force")]
    files = data.get("files") or {}
    out.append(Result(PASS, "harness installed",
                      f"{len(files)} file(s), profile {data.get('profile_id') or '—'}, "
                      f"packs {', '.join(data.get('packs') or []) or '—'}"))

    for rel in ("CLAUDE.md", ".claude/settings.json"):
        p = repo / rel
        out.append(Result(PASS, f"{rel} present", "") if p.exists()
                   else Result(FAIL, f"{rel} missing", "core harness file absent",
                               "re-run the installer"))
    return out


def check_hooks(repo: Path) -> list[Result]:
    """Registered hooks must exist on disk AND have a runnable interpreter."""
    settings = repo / ".claude" / "settings.json"
    if not settings.exists():
        return [Result(WARN, "hook wiring not checked", "no .claude/settings.json")]
    try:
        data = json.loads(settings.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [Result(FAIL, "settings.json unreadable", str(exc), "fix the JSON syntax")]

    hooks = data.get("hooks") or {}
    if not hooks:
        return [Result(FAIL, "no hooks registered",
                       "settings.json declares no hooks — the Stop gate is not wired",
                       "restore the `hooks` block from the kit's settings.json")]

    out = []
    for event, entries in hooks.items():
        for entry in entries:
            for hook in entry.get("hooks", []):
                cmd = hook.get("command", "")
                args = hook.get("args", [])
                target = next((a for a in args if a.endswith((".ps1", ".sh"))), None)
                label = f"{event}: {Path(target).name if target else cmd}"

                if cmd and not shutil.which(cmd):
                    out.append(Result(FAIL, f"{label}: interpreter '{cmd}' not on PATH",
                                      "the hook is registered but can never run — this gate is "
                                      "silently absent",
                                      f"install {cmd}, or switch the hook to the .sh form"))
                    continue
                if target:
                    resolved = repo / target.replace("${CLAUDE_PROJECT_DIR}/", "")
                    if not resolved.exists():
                        out.append(Result(FAIL, f"{label}: script missing", str(resolved),
                                          "re-run the installer"))
                        continue
                out.append(Result(PASS, label, "registered, script present, interpreter found"))
    return out


def check_executable_bits(repo: Path) -> list[Result]:
    """Installed .sh files must be executable (issue #18).

    Meaningless on Windows, where there is no such bit — which is exactly why this shipped
    broken: the platform most of the authoring happens on cannot see the failure.
    """
    if os.name == "nt":
        return [Result(WARN, "executable bits not checked",
                       "POSIX permission bits are not meaningful on Windows")]
    scripts = [p for d in (".claude/hooks", "scripts/rails") for p in (repo / d).rglob("*.sh")]
    if not scripts:
        return [Result(WARN, "no installed shell scripts found", "nothing to check")]
    bad = [p for p in scripts if not os.access(p, os.X_OK)]
    if bad:
        names = ", ".join(str(p.relative_to(repo)) for p in bad)
        return [Result(FAIL, f"{len(bad)} script(s) not executable", names,
                       f"chmod +x {names}")]
    return [Result(PASS, f"{len(scripts)} shell script(s) executable", "")]


def _strip_annotations(path: Path, text: str) -> str:
    """Drop the parts of a file where a token is a note rather than an unfilled slot.

    The kit annotates filled values with the token they came from:

        branches: [ main ]   # <<DEFAULT_BRANCH>>

    `main` IS the filled value; the comment is provenance. Scanning raw text reports every one of
    those as unfinished setup, which buries the handful that are real — and a check that cries
    wolf gets muted, which is worse than not having it.

    Comment syntax is approximated (everything after `#`). For finding `<<TOKEN>>` that is safe:
    the failure mode is missing a token inside a quoted string containing `#`, and under-reporting
    is the right way to be wrong here. JSON has no comments, so only the kit's `"//"` note key is
    dropped.
    """
    if path.suffix in {".yml", ".yaml", ".sh", ".ps1"}:
        return "\n".join(line.split("#", 1)[0] for line in text.splitlines())
    if path.suffix == ".json":
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return text
        return json.dumps(_drop_note_keys(data))
    return text


def _drop_note_keys(node):
    """Remove the kit's `"//"` comment convention wherever it appears."""
    if isinstance(node, dict):
        return {k: _drop_note_keys(v) for k, v in node.items() if k != "//"}
    if isinstance(node, list):
        return [_drop_note_keys(v) for v in node]
    return node


def check_residual_tokens(repo: Path) -> list[Result]:
    """Find setup the installer deliberately left for a human (issues #28, #15).

    These are not corruption — they are the unfinished half of the install. Unfound, they surface
    later as whatever the tool does with a literal `<<TOKEN>>`, which on Windows can be a raw
    cmd.exe syntax error that names neither the token nor the tool.
    """
    roots = [repo / ".github", repo / ".claude", repo / "scripts" / "rails"]
    candidates = [p for root in roots if root.exists() for p in root.rglob("*")]
    if (repo / ".mcp.json").exists():
        candidates.append(repo / ".mcp.json")

    found: dict[str, list[str]] = {}
    for path in candidates:
        if not path.is_file() or path.suffix not in SCANNED_SUFFIXES:
            continue
        # READMEs document the token convention — every token appears there by design.
        if path.name.upper().startswith("README"):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for angled, sentinel in RESIDUAL_TOKEN.findall(_strip_annotations(path, text)):
            # Key by the literal that is IN the file. Reporting `<<ADO_ORGANIZATION>>` for a file
            # containing `ADO_ORGANIZATION_NOT_SET` sends the reader searching for absent text.
            literal = f"<<{angled}>>" if angled else f"{sentinel}_NOT_SET"
            found.setdefault(literal, []).append(str(path.relative_to(repo)))

    if not found:
        return [Result(PASS, "no unfilled setup tokens", "")]
    out = []
    for literal, files in sorted(found.items()):
        name = literal.strip("<>").removesuffix("_NOT_SET")
        owner = TOKEN_OWNER.get(name, "fill before relying on the affected tool")
        out.append(Result(WARN, f"{literal} still unfilled",
                          f"{len(files)} file(s): {', '.join(sorted(set(files))[:4])}",
                          owner))
    return out


def check_mcp(repo: Path) -> list[Result]:
    mcp = repo / ".mcp.json"
    if not mcp.exists():
        return [Result(WARN, "no .mcp.json", "this repo declares no MCP servers")]
    try:
        servers = json.loads(mcp.read_text(encoding="utf-8")).get("mcpServers") or {}
    except json.JSONDecodeError as exc:
        return [Result(FAIL, ".mcp.json unreadable", str(exc), "fix the JSON syntax")]
    if not servers:
        return [Result(WARN, ".mcp.json declares no servers", "")]
    return [Result(PASS, f"{len(servers)} MCP server(s) declared", ", ".join(sorted(servers)))]


# ── repo state (needs gh) ─────────────────────────────────────────────────────────────────────

def required_secrets(repo: Path) -> dict[str, list[str]]:
    """Secrets THIS repo's workflows actually reference, mapped to the workflows needing them.

    Read from the installed workflows rather than a fixed list, because the fixed list was wrong
    the first time it met a real repo: the kit ships `ANTHROPIC_API_KEY`, but a repo may adapt to
    `CLAUDE_CODE_OAUTH_TOKEN` (both are valid for claude-code-action) and may delete the eval
    workflows entirely. A doctor that demands the kit's defaults tells you to "fix" a working
    setup, which is worse than staying quiet.
    """
    wf_dir = repo / ".github" / "workflows"
    if not wf_dir.exists():
        return {}
    needed: dict[str, list[str]] = {}
    for wf in sorted(wf_dir.glob("*.yml")):
        body = wf.read_text(encoding="utf-8", errors="replace")
        # Only live references — a secret named in a comment is documentation.
        live = "\n".join(line.split("#", 1)[0] for line in body.splitlines())
        for name in set(re.findall(r"secrets\.([A-Z][A-Z0-9_]*)", live)):
            if name == "GITHUB_TOKEN":       # supplied by Actions; never set by hand
                continue
            needed.setdefault(name, []).append(wf.name)
    return needed


def check_secrets(repo: Path) -> list[Result]:
    needed = required_secrets(repo)
    if not needed:
        return [Result(WARN, "no workflow secrets to check",
                       "no installed workflow references a repository secret")]

    rc, out = _run(["gh", "secret", "list", "--json", "name"], timeout=30)
    if rc != 0:
        return [Result(WARN, "repo secrets not checked",
                       "gh could not list secrets (not authenticated, or no repo access)",
                       "gh auth login")]
    try:
        present = {s["name"] for s in json.loads(out)}
    except (json.JSONDecodeError, KeyError, TypeError):
        return [Result(WARN, "repo secrets not checked", "unexpected gh output")]

    results = []
    for secret, workflows in sorted(needed.items()):
        if secret in present:
            results.append(Result(PASS, f"secret {secret} set", ", ".join(workflows)))
        else:
            results.append(Result(
                FAIL, f"secret {secret} missing",
                f"{', '.join(workflows)} reference it — those gates fail closed without it",
                f"gh secret set {secret}"))
    return results


def check_branch_protection(repo: Path) -> list[Result]:
    rc, out = _run(["gh", "api", "repos/{owner}/{repo}/rulesets"], timeout=30)
    if rc != 0:
        return [Result(WARN, "branch protection not checked",
                       "gh could not read rulesets", "gh auth login")]
    try:
        rulesets = json.loads(out)
    except json.JSONDecodeError:
        return [Result(WARN, "branch protection not checked", "unexpected gh output")]
    if not rulesets:
        return [Result(FAIL, "no branch protection rulesets",
                       "the gates run but nothing makes them mandatory — a red PR can merge",
                       "scripts/rails/apply-branch-protection.sh")]
    active = [r for r in rulesets if r.get("enforcement") == "active"]
    if not active:
        return [Result(FAIL, f"{len(rulesets)} ruleset(s), none active",
                       "protection exists but is not enforcing",
                       "set enforcement: active")]
    return [Result(PASS, f"{len(active)} active ruleset(s)",
                   ", ".join(r.get("name", "?") for r in active))]


# ── report ────────────────────────────────────────────────────────────────────────────────────

SECTIONS = [
    ("Tools", check_tools, False),
    ("Harness", check_harness_present, False),
    ("Hooks", check_hooks, False),
    ("Permissions", check_executable_bits, False),
    ("Unfinished setup", check_residual_tokens, False),
    ("MCP", check_mcp, False),
    ("Repo secrets", check_secrets, True),
    ("Branch protection", check_branch_protection, True),
]


def run(repo: Path, offline: bool = False) -> int:
    print(f"/sdlc-doctor — {repo.resolve()}\n")
    failures, warnings = 0, 0

    for title, check, needs_network in SECTIONS:
        if offline and needs_network:
            print(f"{title}\n  [SKIP] --offline\n")
            continue
        print(title)
        for r in check(repo):
            marker = {PASS: "PASS", FAIL: "FAIL", WARN: "WARN"}[r.status]
            print(f"  [{marker}] {r.title}" + (f" - {r.detail}" if r.detail else ""))
            if r.fix and r.status != PASS:
                print(f"         fix: {r.fix}")
            failures += r.status == FAIL
            warnings += r.status == WARN
        print()

    if failures:
        print(f"{failures} failure(s), {warnings} warning(s). "
              f"The harness will not fully work until the failures are fixed.")
        return 1
    print(f"No failures, {warnings} warning(s)." if warnings else "All checks passed.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--repo", default=".", help="repo to check (default: current directory)")
    ap.add_argument("--offline", action="store_true", help="skip checks that need gh")
    args = ap.parse_args()
    return run(Path(args.repo), offline=args.offline)


if __name__ == "__main__":
    raise SystemExit(main())
