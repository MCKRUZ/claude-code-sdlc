"""Which delivery rails have actually fired — the pure classification (Foundation, Step 6).

A rail that has only ever seen green has not been tested; it has been assumed. Foundation's
exit report asks whether each rail was proven by forced failure, and a person answering that
from memory — or from the fact that the workflow file exists — is guessing. This module turns
GitHub's own history into an answer, and is built to make PROVEN hard to reach:

  PROVEN        a failure was caught: a red run on a pull request that did not simply merge red
  RAN_UNPROVEN  it ran, but nothing it ever did is evidence that it can stop anything
  NEVER_FIRED   no run exists
  BROKEN        it ran in a way its own design says it never should
  NO_DATA       GitHub keeps no record of this rail (a local hook), or the read failed

NO_DATA is the fifth state on purpose. The honest answer for a Stop hook is not "never fired" —
GitHub cannot know — and an unreadable history is not "no runs". Neither is ever turned into a
number.

Pure: dicts in, dicts out. The one impure seam (calling `gh`) lives in pipeline_proof.py, so
every rule here is testable against fixture dicts with no network.
"""

from datetime import datetime

PROVEN = "PROVEN"
RAN_UNPROVEN = "RAN_UNPROVEN"
NEVER_FIRED = "NEVER_FIRED"
BROKEN = "BROKEN"
NO_DATA = "NO_DATA"
STATES = (PROVEN, RAN_UNPROVEN, NEVER_FIRED, BROKEN, NO_DATA)

PR_EVENTS = {"pull_request", "pull_request_target"}
MAX_EVIDENCE = 5  # a report a person reads, not a dump: the most recent few of each kind


def rail_kind(workflow_file: str) -> str:
    """How a rail demonstrates it works. The grader is built to ALWAYS conclude successfully
    (harness/workflows/RAILS.md) — its output is a posted verdict, so going red means it broke,
    not that it caught something. A deploy proves itself by rolling back. Everything else is a
    gate that goes red to block."""
    name = workflow_file.lower()
    if name.startswith("grader"):
        return "advisory"
    if name.startswith("deploy"):
        return "deploy"
    return "blocking"


def _ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _pr_ref(pr: dict) -> dict:
    return {"label": f"PR #{pr['number']}", "url": pr["url"]}


def _run_ref(run: dict, prefix: str = "red run") -> dict:
    return {"label": f"{prefix} {run['databaseId']}", "url": run["url"]}


def _result(status, reason, runs, red, evidence=None, **extra):
    return {
        "status": status, "reason": reason, "runs": len(runs) if runs is not None else None,
        "red": red, "evidence": evidence or [], **extra,
    }


def no_data(rail: str, reason: str) -> dict:
    return {"status": NO_DATA, "reason": reason, "runs": None, "red": None, "evidence": []}


def _latest_pr_by_branch(prs: list[dict]) -> dict:
    latest: dict[str, dict] = {}
    for pr in prs:
        branch = pr.get("headRefName")
        if branch and (branch not in latest or pr["number"] > latest[branch]["number"]):
            latest[branch] = pr
    return latest


def _classify_failures(runs: list[dict], prs: list[dict]) -> tuple[list[dict], list[dict]]:
    """(caught, merged_red). A red run on a pull request is a catch when the change did not just
    carry it into main: the same branch later went green (it was fixed), or the pull request was
    closed unmerged (the planted-defect pattern). A pull request that merged with its last run
    still red is the opposite of a catch and is reported separately — it is a bypass signal."""
    by_branch = _latest_pr_by_branch(prs)
    caught, merged_red = [], []
    for red in sorted((r for r in runs if r.get("conclusion") == "failure" and r.get("event") in PR_EVENTS),
                      key=lambda r: r["createdAt"], reverse=True):
        pr = by_branch.get(red.get("headBranch"))
        if pr is None:
            continue  # cannot tie this run to a change, so it is not claimed as a catch
        fixed_later = any(
            r.get("conclusion") == "success" and r.get("headBranch") == red.get("headBranch")
            and _ts(r["createdAt"]) > _ts(red["createdAt"])
            for r in runs
        )
        closed_unmerged = pr.get("state") == "CLOSED" and not pr.get("mergedAt")
        if fixed_later or closed_unmerged:
            caught.append({"run": red, "pr": pr})
        elif pr.get("mergedAt"):
            merged_red.append({"run": red, "pr": pr})
    return caught, merged_red


def _dedupe(refs: list[dict]) -> list[dict]:
    seen, out = set(), []
    for ref in refs:
        if ref["url"] not in seen:
            seen.add(ref["url"])
            out.append(ref)
    return out


def classify_rail(
    kind: str,
    runs: list[dict],
    prs: list[dict],
    grader_verdicts: dict | None = None,
    rollbacks: dict | None = None,
) -> dict:
    """Classify one rail from its run history.

    `grader_verdicts` maps a pull request number to the verdict rows the grader posted there
    (None when the comments could not be read — which is "unproven", never "proven").
    `rollbacks` maps a failed deploy run's id to whether its rollback job succeeded."""
    if not runs:
        return _result(NEVER_FIRED, "No run of this workflow exists.", [], 0)

    red_runs = [r for r in runs if r.get("conclusion") == "failure"]
    red = len(red_runs)

    if kind == "advisory":
        return _classify_advisory(runs, red_runs, prs, grader_verdicts)
    if kind == "deploy":
        return _classify_deploy(runs, red_runs, rollbacks or {})

    caught, merged_red = _classify_failures(runs, prs)
    merged_refs = _dedupe([_pr_ref(c["pr"]) for c in merged_red])[:MAX_EVIDENCE]
    if caught:
        evidence = _dedupe(
            [ref for c in caught[:MAX_EVIDENCE] for ref in (_pr_ref(c["pr"]), _run_ref(c["run"]))]
        )
        return _result(
            PROVEN,
            f"Went red on {len(caught)} pull request run(s) that were then fixed or closed unmerged.",
            runs, red, evidence, merged_red=merged_refs,
        )
    if merged_red:
        return _result(
            RAN_UNPROVEN,
            f"Went red on {len(merged_red)} pull request run(s), but those changes merged anyway "
            f"— a red run that merged is not a catch.",
            runs, red, merged_refs, merged_red=merged_refs,
        )
    why = ("Every run was green." if red == 0
           else "Red runs exist, but none can be tied to a pull request that was then fixed or closed unmerged.")
    return _result(RAN_UNPROVEN, why, runs, red, merged_red=[])


def _classify_advisory(runs, red_runs, prs, grader_verdicts) -> dict:
    red = len(red_runs)
    if red:
        return _result(
            BROKEN,
            f"Errored on {red} of {len(runs)} run(s). This rail is designed to ALWAYS conclude "
            f"successfully — its output is a posted verdict — so a red run means it failed to do "
            f"its job, not that it caught something.",
            runs, red, [_run_ref(r, "errored run") for r in sorted(red_runs, key=lambda r: r["createdAt"], reverse=True)[:MAX_EVIDENCE]],
        )
    if grader_verdicts is None:
        return _result(
            RAN_UNPROVEN,
            "It ran green, but the pull request comments could not be read, so no posted verdict "
            "was checked.",
            runs, 0,
        )
    by_number = {p["number"]: p for p in prs}
    missed = [n for n, rows in grader_verdicts.items() if any(not row.get("covered") for row in rows)]
    if missed:
        evidence = [_pr_ref(by_number[n]) for n in sorted(missed, reverse=True) if n in by_number][:MAX_EVIDENCE]
        return _result(PROVEN, f"Posted a verdict naming an uncovered acceptance check on {len(missed)} pull request(s).", runs, 0, evidence)
    return _result(
        RAN_UNPROVEN,
        f"Ran green and posted verdicts on {len(grader_verdicts)} pull request(s), but never one "
        f"that named an uncovered check.",
        runs, 0,
    )


def _classify_deploy(runs, red_runs, rollbacks) -> dict:
    red = len(red_runs)
    rolled_back = [r for r in red_runs if rollbacks.get(r["databaseId"])]
    if rolled_back:
        return _result(
            PROVEN, f"{len(rolled_back)} failed deploy(s) triggered a rollback that succeeded.",
            runs, red, [_run_ref(r, "rolled-back deploy") for r in rolled_back[:MAX_EVIDENCE]],
        )
    why = ("Every deploy succeeded, so the rollback has never been exercised."
           if red == 0 else
           "Deploys failed, but none is recorded as having run a successful rollback.")
    return _result(RAN_UNPROVEN, why, runs, red)


# --- branch protection ----------------------------------------------------------------------

def required_contexts(ruleset: dict | None) -> list[str]:
    """The status-check names a ruleset (live from the API, or the checked-in export — the shape
    is the same) makes mandatory."""
    contexts: list[str] = []
    for rule in (ruleset or {}).get("rules", []):
        if rule.get("type") == "required_status_checks":
            for check in rule.get("parameters", {}).get("required_status_checks", []):
                if check.get("context"):
                    contexts.append(check["context"])
    return contexts


def compare_ruleset(live: dict | None, installed: dict | None) -> dict:
    """What GitHub actually enforces, against what the project's checked-in ruleset says it
    should. The repository supplies both halves of "we are protected" only if you read nothing
    but the repository — the live ruleset is the half it cannot forge."""
    installed_ctx = required_contexts(installed) if installed is not None else None
    if live is None:
        return {
            "live": False, "enforcing": False, "enforcement": None, "created_at": None,
            "required": [], "bypass_actors": [],
            "missing_in_live": installed_ctx, "extra_in_live": None if installed_ctx is None else [],
        }
    live_ctx = required_contexts(live)
    return {
        "live": True,
        "enforcement": live.get("enforcement"),
        "enforcing": live.get("enforcement") == "active",
        "created_at": live.get("created_at"),
        "required": live_ctx,
        "bypass_actors": [
            f"{a.get('actor_type')} {a.get('actor_id')} ({a.get('bypass_mode')})"
            for a in live.get("bypass_actors", [])
        ],
        "missing_in_live": None if installed_ctx is None else [c for c in installed_ctx if c not in live_ctx],
        "extra_in_live": None if installed_ctx is None else [c for c in live_ctx if c not in installed_ctx],
    }


def merge_history(prs: list[dict], enforced_since: str | None) -> dict:
    """Merged pull requests, split at the moment the ruleset went live. A merge from before that
    date was never subject to the rails, so it is not evidence against them — it is only counted."""
    merged = [p for p in prs if p.get("mergedAt")]
    if enforced_since is None:
        return {"total_merged": len(merged), "enforced_since": None, "pre_enforcement": None,
                "post_enforcement": None, "unapproved_post_enforcement": None}
    cutoff = _ts(enforced_since)
    post = [p for p in merged if _ts(p["mergedAt"]) >= cutoff]
    return {
        "total_merged": len(merged),
        "enforced_since": enforced_since,
        "pre_enforcement": len(merged) - len(post),
        "post_enforcement": len(post),
        "unapproved_post_enforcement": [_pr_ref(p) for p in post if p.get("reviewDecision") != "APPROVED"],
    }


# --- what is still needed -------------------------------------------------------------------

_PROOFS = [
    ("stop", "A deliberately failing test, then ask an agent to finish: confirms the Stop hook blocks it.",
     "a throwaway test file (never merged)"),
    ("grader", "A pull request with a planted mismatch between the spec and the code: confirms the grader posts the miss.",
     "a spec under specs/ and the source file it describes"),
    ("correctness", "A pull request with a planted logic defect (an off-by-one or a flipped condition): watch the gate go "
                    "red on the exact line, record the override label, watch it go green, then close it unmerged.",
     "one source file under src/"),
    ("security", "A probe pull request touching a guarded path: confirms the security gate fires.",
     "a file under a guarded path listed in risk-tier-map.md"),
    ("deploy", "A known-bad deploy to dev: confirms deploy-dev restores the last good version.",
     "the deploy-dev inputs (a deliberately failing health check)"),
]
_DEFAULT_PROOF = (
    "A pull request with a deliberately failing check: confirms the merge is blocked.",
    "one test file",
)


def proofs_needed(rails: list[dict]) -> list[dict]:
    """For every rail not yet PROVEN, the forced failure that would prove it and the file that
    forced failure would touch. Listed, never run — each one opens a real pull request, which is
    a person's call."""
    needed = []
    for rail in rails:
        if rail["status"] == PROVEN:
            continue
        key = (rail.get("file") or rail["rail"]).lower()
        proof, touches = next(((p, t) for word, p, t in _PROOFS if word in key), _DEFAULT_PROOF)
        needed.append({"rail": rail["rail"], "proof": proof, "touches": touches})
    return needed
