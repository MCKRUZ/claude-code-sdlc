"""Which delivery rails have actually fired on this repository (Foundation, Step 6).

Foundation closes only when the rails are *proven*, not merely present: a rail that has only
ever seen green has been assumed, not tested. This reads GitHub's own history — the live branch
ruleset, merged pull requests, and every rail's workflow runs — classifies each rail
(pipeline_proof_model.py owns the rules), and writes the result to
`.sdlc/artifacts/03-foundation/pipeline-proof.md`.

READ-ONLY, by construction. Every `gh` call below is a `list`/`view`/`api GET`; nothing here can
open, close, merge, label or trigger anything, and a test pins the exact set of calls. The forced
failures that would PROVE a rail (a planted defect, a probe pull request) are only ever *listed*
— each opens a real pull request, which is a person's call, never this script's.

Honest by design: a rail whose history could not be read is NO_DATA, not "never fired"; a ruleset
that could not be read is "could not read", not "there is no ruleset". Missing data is never
turned into a number.

Re-running rewrites only the gathered sections; the **Forced-failure proofs** a person records
are never touched.

Standalone or Workflow:
  - Standalone: --repo <path>
  - Workflow:   --state <path>/.sdlc/state.yaml

Exit 0 on every path (advisory): a failure to read GitHub is reported as ok:false, not as a crash.
"""

import argparse
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import gate_inventory as gi
import pipeline_proof_model as m
from github_import import GitHubImportError, gh_json
from spec_status import fetch_pr_comment_bodies, parse_verdict_block

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
DOC_PATH = ".sdlc/artifacts/03-foundation/pipeline-proof.md"
TEMPLATE = PLUGIN_ROOT / "templates" / "phases" / "03-foundation" / "pipeline-proof.md"
INSTALLED_RULESET = ".github/rulesets/branch-protection.json"

GENERATED_SECTIONS = ("Rail status", "Branch protection", "Merge history", "Proofs still needed")
PERSONS_SECTION = "Forced-failure proofs"

RUN_FIELDS = "databaseId,conclusion,status,event,headBranch,createdAt,url"
PR_FIELDS = "number,headRefName,state,url,mergedAt,reviewDecision"
GRADER_PR_LIMIT = 30
DEPLOY_JOB_LOOKUPS = 10
WORKERS = 6

STATUS_LABEL = {
    m.PROVEN: "PROVEN", m.RAN_UNPROVEN: "RAN-UNPROVEN", m.NEVER_FIRED: "NEVER-FIRED",
    m.BROKEN: "BROKEN", m.NO_DATA: "NO DATA",
}


# --- gathering ------------------------------------------------------------------------------

def _rail_plan(repo_root: Path) -> tuple[list[dict], list[dict], list[str]]:
    """(workflow rails, local rails, notes). Which rails to look at: the guide's gates plus any
    pipeline this project added for itself — an undescribed pipeline still gates real changes."""
    notes: list[str] = []
    by_file: dict[str, dict] = {}
    local: list[dict] = []
    inv = gi.inventory(repo_root)

    if inv["ok"]:
        for g in inv["gates"]:
            if g["state"] == "not_a_pipeline":
                local.append({"rail": g["gate"], "file": g["file"], "kind": "local", "gates": [g["gate"]], "described": True})
                continue
            spec = by_file.setdefault(g["file"], {
                "rail": Path(g["file"]).stem, "file": g["file"], "kind": m.rail_kind(g["file"]),
                "gates": [], "described": True, "installed": g["state"] == "installed",
            })
            spec["gates"].append(g["gate"])
        for u in inv["unexpected"]:
            by_file.setdefault(u["file"], {
                "rail": Path(u["file"]).stem, "file": u["file"], "kind": m.rail_kind(u["file"]),
                "gates": [], "described": False, "installed": True,
            })
    else:
        notes.append(inv["error"])
        wf_dir = repo_root / ".github" / "workflows"
        for path in sorted(wf_dir.glob("*.y*ml")) if wf_dir.is_dir() else []:
            by_file[path.name] = {
                "rail": path.stem, "file": path.name, "kind": m.rail_kind(path.name),
                "gates": [], "described": False, "installed": True,
            }
    return list(by_file.values()), local, notes


def _fetch_runs(cwd: str, workflow_file: str, limit: int) -> list[dict]:
    return gh_json(["run", "list", "--workflow", workflow_file, "--limit", str(limit), "--json", RUN_FIELDS], cwd)


def _grader_verdicts(cwd: str, runs: list[dict], prs: list[dict]) -> dict | None:
    """pull request number -> the verdict rows the grader posted there. None when the comments
    could not be read at all (which is "unchecked", never "nothing found")."""
    branches = {r.get("headBranch") for r in runs if r.get("event") in m.PR_EVENTS}
    candidates = sorted((p for p in prs if p.get("headRefName") in branches), key=lambda p: p["number"], reverse=True)[:GRADER_PR_LIMIT]

    def latest_verdict(number: int):
        for body in reversed(fetch_pr_comment_bodies(cwd, number)):
            rows = parse_verdict_block(body)
            if rows is not None:
                return rows
        return None

    results, errors = {}, 0
    with ThreadPoolExecutor(WORKERS) as pool:
        futures = {p["number"]: pool.submit(latest_verdict, p["number"]) for p in candidates}
        for number, future in futures.items():
            try:
                rows = future.result()
            except GitHubImportError:
                errors += 1
                continue
            if rows is not None:
                results[number] = rows
    return None if candidates and errors == len(candidates) else results


def _deploy_rollbacks(cwd: str, runs: list[dict]) -> dict:
    """failed deploy run id -> whether its rollback job succeeded."""
    failed = [r for r in runs if r.get("conclusion") == "failure"][:DEPLOY_JOB_LOOKUPS]

    def rolled_back(run: dict) -> bool:
        try:
            jobs = gh_json(["run", "view", str(run["databaseId"]), "--json", "jobs"], cwd).get("jobs", [])
        except GitHubImportError:
            return False
        return any("rollback" in j.get("name", "").lower() and j.get("conclusion") == "success" for j in jobs)

    with ThreadPoolExecutor(WORKERS) as pool:
        return dict(zip((r["databaseId"] for r in failed), pool.map(rolled_back, failed)))


def _read_ruleset(cwd: str, nwo: str, installed_name: str | None) -> dict | None:
    listing = gh_json(["api", f"repos/{nwo}/rulesets"], cwd)
    branch_rulesets = [r for r in listing if r.get("target") == "branch"] or listing
    pick = next((r for r in branch_rulesets if installed_name and r.get("name") == installed_name), None) \
        or (branch_rulesets[0] if branch_rulesets else None)
    return gh_json(["api", f"repos/{nwo}/rulesets/{pick['id']}"], cwd) if pick else None


def _classify(spec: dict, runs: list[dict], prs: list[dict], cwd: str) -> dict:
    if spec["kind"] == "advisory":
        verdicts = _grader_verdicts(cwd, runs, prs) if runs else {}
        return m.classify_rail("advisory", runs, prs, grader_verdicts=verdicts)
    if spec["kind"] == "deploy":
        return m.classify_rail("deploy", runs, prs, rollbacks=_deploy_rollbacks(cwd, runs))
    return m.classify_rail("blocking", runs, prs)


def gather(repo_root, runs_limit: int = 100, prs_limit: int = 100) -> dict:
    repo_root = Path(repo_root)
    cwd = str(repo_root)
    try:
        nwo = gh_json(["repo", "view", "--json", "nameWithOwner"], cwd)["nameWithOwner"]
        prs = gh_json(["pr", "list", "--state", "all", "--limit", str(prs_limit), "--json", PR_FIELDS], cwd)
    except GitHubImportError as e:
        return {"ok": False, "error": str(e)}

    workflow_rails, local_rails, notes = _rail_plan(repo_root)

    def read_rail(spec: dict) -> dict:
        if not spec.get("installed", True):
            return {**spec, **m._result(m.NEVER_FIRED, f"{spec['file']} is not installed in this project's .github/workflows, so it cannot have run.", [], 0)}
        try:
            runs = _fetch_runs(cwd, spec["file"], runs_limit)
        except GitHubImportError as e:
            return {**spec, **m.no_data(spec["rail"], f"The run history could not be read: {e}")}
        return {**spec, **_classify(spec, runs, prs, cwd)}

    with ThreadPoolExecutor(WORKERS) as pool:
        rails = list(pool.map(read_rail, workflow_rails))
    for spec in local_rails:
        rails.append({**spec, **m.no_data(spec["rail"], "A local hook: GitHub keeps no record of it, so its history cannot be read from here.")})

    installed_ruleset = None
    installed_path = repo_root / INSTALLED_RULESET
    if installed_path.is_file():
        try:
            installed_ruleset = json.loads(installed_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            notes.append(f"{INSTALLED_RULESET} could not be parsed, so the live ruleset was not compared with it.")
    try:
        live = _read_ruleset(cwd, nwo, (installed_ruleset or {}).get("name"))
        ruleset = m.compare_ruleset(live, installed_ruleset)
    except GitHubImportError as e:
        ruleset = {"live": None, "enforcing": None, "error": str(e), "created_at": None,
                   "required": [], "bypass_actors": [], "missing_in_live": None, "extra_in_live": None}

    return {
        "ok": True,
        "repo": nwo,
        "gathered_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "rails": rails,
        "ruleset": ruleset,
        "merge_history": m.merge_history(prs, ruleset.get("created_at")),
        "proofs_needed": m.proofs_needed(rails),
        "notes": notes,
    }


# --- rendering ------------------------------------------------------------------------------

def _cell(text) -> str:
    """One table cell that can never break its table: a pipe or a newline in a reason would."""
    return re.sub(r"\s+", " ", str(text).replace("|", "/")).strip()


def _links(evidence: list[dict], shown: int = 3) -> str:
    links = [f"[{e['label']}]({e['url']})" for e in evidence[:shown]]
    if len(evidence) > shown:
        links.append(f"+{len(evidence) - shown} more")
    return ", ".join(links)


def _bullets(items: list[str], none: str) -> str:
    return "\n".join(f"- {i}" for i in items) if items else none


def render_sections(result: dict) -> dict[str, str]:
    rows = ["| Rail | Status | What the history shows | Evidence |", "|------|--------|------------------------|----------|"]
    for r in result["rails"]:
        gates = [g for g in r.get("gates", []) if g != r["rail"]] if r["kind"] != "local" else []
        name = r["rail"] + (f" ({', '.join(gates)})" if gates else "")
        counts = "" if r["runs"] is None else f" ({r['runs']} run(s), {r['red']} red)"
        rows.append(f"| {_cell(name)} | {STATUS_LABEL[r['status']]} | {_cell(r['reason'] + counts)} | {_cell(_links(r['evidence']))} |")

    rs = result["ruleset"]
    if rs.get("error"):
        protection = f"Could not read GitHub's rulesets: {rs['error']}. Nothing below can be confirmed, and this is not the same as there being no ruleset."
    elif not rs["live"]:
        protection = "GitHub reports no branch ruleset on this repository, so nothing is enforcing the required checks."
    else:
        protection = "\n".join([
            f"- **Enforcement:** {rs['enforcement']}" + ("" if rs["enforcing"] else " — **not enforcing**; the required checks are advisory only"),
            f"- **Required checks (live):** {', '.join(rs['required']) or 'none'}",
            "- **Expected by the checked-in ruleset but not enforced live:** "
            + ("not compared (no checked-in ruleset)" if rs["missing_in_live"] is None else (", ".join(rs["missing_in_live"]) or "none")),
            "- **Enforced live but not in the checked-in ruleset:** "
            + ("not compared" if rs["extra_in_live"] is None else (", ".join(rs["extra_in_live"]) or "none")),
            f"- **Bypass actors:** {', '.join(rs['bypass_actors']) or 'none'}",
        ])

    h = result["merge_history"]
    if h["enforced_since"] is None:
        merges = f"{h['total_merged']} merged pull request(s). The date the ruleset went live is unknown, so they are not split into before and after."
    else:
        unapproved = h["unapproved_post_enforcement"]
        merges = (
            f"{h['total_merged']} merged pull request(s): {h['pre_enforcement']} before the ruleset went live "
            f"({h['enforced_since']}) — never subject to it — and {h['post_enforcement']} after.\n\n"
            + ("Every merge since was approved." if not unapproved
               else f"{len(unapproved)} of them merged without an approval (the ruleset asks for one), most recent first: "
                    + _links(sorted(unapproved, key=lambda u: int(u["label"].split("#")[1]), reverse=True), shown=5))
        )

    needed = _bullets(
        [f"**{n['rail']}** — {n['proof']} Touches {n['touches']}." for n in result["proofs_needed"]],
        "Every rail that GitHub can see is proven.",
    )
    notes = "\n".join(f"> {n}" for n in result.get("notes", []))
    return {
        "Rail status": "\n".join(rows),
        "Branch protection": protection,
        "Merge history": merges,
        "Proofs still needed": needed + (f"\n\n{notes}" if notes else ""),
    }


# --- writing the document -------------------------------------------------------------------

_PERSONS_SKELETON = (
    "> Record each proof here as it is done: what was planted, what caught it, and the link.\n\n"
    "| Rail | Proof | Evidence (PR / run URL) | Date |\n|------|-------|-------------------------|------|"
)


def _section_span(text: str, heading: str) -> tuple[int, int] | None:
    found = re.search(rf"^## {re.escape(heading)}[ \t]*\r?$", text, re.MULTILINE)
    if not found:
        return None
    following = re.compile(r"^## ", re.MULTILINE).search(text, found.end())
    return found.start(), following.start() if following else len(text)


def merge_sections(text: str, sections: dict[str, str], header: dict[str, str]) -> str:
    """The document with the given sections' bodies replaced and its header lines updated —
    every other byte untouched, so a person's own section and any edits around it survive."""
    nl = "\r\n" if "\r\n" in text else "\n"
    for label, value in header.items():
        text = re.sub(rf"^(\*\*{re.escape(label)}:\*\*)[^\r\n]*", lambda mo: f"{mo.group(1)} {value}", text, flags=re.MULTILINE)
    for heading, body in sections.items():
        block = f"## {heading}{nl}{nl}{body.replace(chr(10), nl)}{nl}{nl}"
        span = _section_span(text, heading)
        if span:
            start, end = span
            tail = text[end:]
            text = text[:start] + block + tail if tail else text[:start] + block.rstrip() + nl
        else:
            anchor = _section_span(text, PERSONS_SECTION)
            if anchor:
                text = text[:anchor[0]] + block + text[anchor[0]:]
            else:
                text = text.rstrip() + nl + nl + block.rstrip() + nl
    return text


def write_document(repo_root, result: dict) -> Path | None:
    """Writes the evidence into the project's pipeline-proof.md, creating it from the plugin's
    own template when it does not exist. None (and nothing written) when the read failed."""
    if not result.get("ok"):
        return None
    path = Path(repo_root) / DOC_PATH
    if path.is_file():
        with open(path, encoding="utf-8", newline="") as f:
            text = f.read()
        sections = render_sections(result)
    else:
        with open(TEMPLATE, encoding="utf-8", newline="") as f:
            text = f.read()
        sections = {**render_sections(result), PERSONS_SECTION: _PERSONS_SKELETON}
    merged = merge_sections(text, sections, {"Repository": result["repo"], "Evidence gathered": result["gathered_at"]})
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(merged)
    return path


# --- CLI ------------------------------------------------------------------------------------

def _format_text(result: dict) -> str:
    if not result["ok"]:
        return f"Could not gather pipeline evidence: {result['error']}"
    lines = [f"Pipeline evidence for {result['repo']} ({result['gathered_at']})", ""]
    for r in result["rails"]:
        lines.append(f"  {STATUS_LABEL[r['status']]:<13} {r['rail']}: {r['reason']}")
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Which delivery rails have actually fired (read-only against GitHub).")
    where = parser.add_mutually_exclusive_group(required=True)
    where.add_argument("--repo", help="Path to the project repository")
    where.add_argument("--state", help="Path to the project's .sdlc/state.yaml")
    parser.add_argument("--write", action="store_true", help=f"Write the evidence to {DOC_PATH}")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    parser.add_argument("--runs-limit", type=int, default=100, help="Most recent runs to read per rail (default 100)")
    parser.add_argument("--prs-limit", type=int, default=100, help="Most recent pull requests to read (default 100)")
    args = parser.parse_args(argv)

    repo_root = Path(args.repo).resolve() if args.repo else Path(args.state).resolve().parent.parent
    try:
        result = gather(repo_root, args.runs_limit, args.prs_limit)
    except Exception as e:  # noqa: BLE001 — advisory contract: a button in an app must get ok:false, never a traceback
        result = {"ok": False, "error": f"Unexpected failure while reading GitHub: {type(e).__name__}: {e}"}
    if args.write:
        written = write_document(repo_root, result)
        if written:
            result["wrote"] = DOC_PATH
    print(json.dumps(result, indent=2) if args.json else _format_text(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
