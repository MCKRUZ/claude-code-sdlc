# /sdlc-spec-status — Where a Spec Actually Is

Report a spec's status read from its pull request — checks, whether the grader ran and its
verdict, whether a security review was required and its result, approvals, and whether it
merged. This reads the code host; it never sets a status by hand and never votes on a gate.

## Instructions

1. **Resolve mode and repo root:**
   - **Workflow mode** (default): look for `.sdlc/state.yaml`. The repo root is the
     directory containing `.sdlc/`.
   - **Standalone mode** (`--repo <path>`, or no `.sdlc/` found): operate on the given repo.

2. **Run the report** (the command owns the script — the user never calls it directly):
   ```bash
   uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/spec_status.py \
     --repo <repo-root> --spec <repo-root>/specs/NNNN-name.md
   ```
   In workflow mode pass `--state .sdlc/state.yaml` instead of `--repo`.

3. **Read the result, don't re-interpret it:**
   - **No pull request found** — the spec hasn't been handed off, or the branch hasn't been
     pushed yet. Not an error; say so plainly.
   - **Code-host data unavailable** — report exactly that, with the local status the spec
     file itself carries, and say the rest is unavailable. Never present this as "no PR
     yet" or "not started" — those are a different, more definite claim than "couldn't check".
   - **Grader ran, but no readable verdict** — report this as-is (likely still running, or
     the block is malformed). Don't guess a verdict from the prose above the block; if the
     machine-readable `## Acceptance Check Verdicts` block and the prose ever disagree, the
     block is authoritative, per the grader's own rubric.
   - **`Waiting on`** — this is the one line to lead with when a human asks "where is
     this." Repeat it verbatim; don't paraphrase it into a different claim.
   - **`status: merged` committed** — mention it happened; this is the tool's one write,
     and it only fires once the PR actually merged.

4. **If asked about several specs at once** (e.g. "what's the state of the backlog"), run
   this once per spec and summarize — there is no batch mode; don't invent one.

## Arguments

- `--spec <path>`: the spec to report on (required).
- `--repo <path>`: standalone mode.
- `--json`: structured output, every time as an absolute timestamp — use this when the
  result feeds another step rather than a person reading it directly.

## Important

- The user runs `/sdlc-spec-status` — never `spec_status.py` by hand.
- This command **reads and, once, writes `status: merged`** — it never changes what a
  gate decided, never approves, never merges. If a change is genuinely blocked, the fix is
  in the PR (a fix, a re-request, an override with a name on it), not in this report.
- A "no pull request found" result is not a prompt to create one — that's `/sdlc-handoff`'s
  job, and only after the spec passes its Definition of Ready.
