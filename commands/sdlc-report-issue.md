# /sdlc-report-issue — Bugs in the Product, From Report to Fix

Take a bug someone saw in the **product the team is building** from a report that a fixer can
reproduce, through review and prioritization, to a `type: bugfix` spec that a sprint can slate —
the Build loop's own unit (one spec, one branch, one PR). The report is written only once it carries
the minimum: a one-line title, what happened, what was expected, steps to reproduce, **where in the
product** (its channel — the web UI, the API, voice, chat, a report or dataset, mobile), **which
environment** (local, dev, test, staging, production) and build, how badly it hurts, how often, what it
did to the data, **what type of user** the reporter was acting as and their role on the team, **one
screenshot of the product that really is an image**, and the reporter's own statement that nothing in
it is client data, personal data or a secret. Half a report is not written; the gaps are listed. A
secret-shaped string is refused outright — the file is shared with the code host and cannot be
un-published.

The command owns `report_issue.py`; the user never calls it directly. The questions, the minimum, the
refusals and the lifecycle live in `scripts/issue_model.py` — the same list the SDLC Studio desktop app renders
as its *Report an issue* dialog and its *Issues* view, so a bug handled either way is the same record.
The lifecycle in words is `references/issue-lifecycle.md`. Works inside an SDLC project or standalone
against any repository.

## The lifecycle

| Status | Meaning | Who moves it | Verb |
|---|---|---|---|
| `new` | reported, awaiting review | — | `new` |
| `needs-info` | a reviewer asked the reporter something | reviewer | `triage --verdict needs-info --question` |
| `triaged` | confirmed as a bug, severity and data impact corrected if needed | **someone other than the reporter** | `triage --verdict confirmed` |
| `prioritized` | P1 fix now / P2 next sprint / P3 backlog, and a target sprint | a named human, confirming the proposal or not | `prioritize` |
| `promoted` | a `type: bugfix` spec exists (and may be slated into the target sprint) | a named human, confirming the tier or not | `promote [--slate]` |
| `fixed` | the bugfix spec merged (`sync`), or a named human says so | `sync` / a human | `sync`, `set-status --status fixed` |
| `wont-fix` · `duplicate` | closed with a reason the reporter will read | reviewer | `triage` or `set-status` |

Filing the report on the code host (`file`) is orthogonal: it may happen at any status and never
changes it. `reopen --reason` takes a closed report back to `new`. Every move is a dated line in the
report's `## History` and one event in `.sdlc/metrics/issue-log.jsonl`.

## Instructions

### A. Report (`new`) — the interview

1. **Resolve mode and repo root:**
   - **Workflow mode** (default): look for `.sdlc/state.yaml`; pass `--state .sdlc/state.yaml` to
     every call. Reports land under `<repo>/.sdlc/issues/`.
   - **Standalone mode** (`--repo <path>`, or no `.sdlc/state.yaml` found): pass `--repo <path>`;
     `.sdlc/issues/` is created under it. The two flags are mutually exclusive.

2. **Read the question plan and the build facts first** — two reads, nothing written:
   ```bash
   uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/report_issue.py questions --json
   ```
   ```bash
   uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/report_issue.py env --state .sdlc/state.yaml --json
   ```
   Save the `env` document to a temporary file; it is handed to `new` as `--env-json` (the
   repository, branch and commit under test when the bug was seen locally). A fact `env` could not find
   reads `null` — show it as "not recorded", never invent a build number.

3. **Interview, in the plan's order.** Every question is asked with `AskUserQuestion`; the first answer
   (`channel` — where in the product) decides which follow-ups exist, so ask it first and re-read the
   plan for that channel (`questions --channel <answer> --json`):

   > **HITL GATE — the minimum.** Ask one question at a time. For a `choice` question offer the plan's
   > options verbatim (their `label`s) — never a value the plan does not list. For `text`, `multiline`
   > and `lines` keep the person's words exactly; do not summarise, tidy or complete them. A required
   > question with an empty answer is asked again, with the plan's `hint`. Never fill a required field
   > yourself: a guessed step is worse than no report.

   The channels and their follow-ups: **web** → the page's address (without ids or tokens in the query),
   browser and device, what they clicked or typed right before · **api** → the endpoint (method and path),
   status code, a request id, the response or the part that looked wrong · **voice** → what they said,
   what it said back, the device or line · **chat** → what they sent, what it replied, which chat surface
   · **data** → which report, export, dataset or job, the value expected and the value got · **mobile** →
   browser and device, what they did right before, the app build · **other** → where, in their words.
   Every report also asks: environment, build or version (optional — local runs take git's), severity,
   frequency, **data impact** (none / wrong data shown / wrong data written or lost / data exposed), the
   **type of user they were acting as** (the product's own terms: an adjuster, an admin, a signed-out
   visitor), their **role on the team**, and optionally the spec the broken part was built under.

4. **The screenshot is required.** Ask for a path to an image of the product as it looked (PNG, JPEG,
   GIF or WebP, under 10 MB). Do not proceed without one: a report of a screen nobody can see is a
   report nobody fixes. The script checks the file's **bytes**, not its name — a text file called
   `shot.png` is a gap. More than one is welcome (`--screenshot` repeats).

5. **The privacy statement is the person's, not yours.** Ask, in these words or close to them: "Is
   there anything in the screenshot or in what you have written that is client data, personal data, or
   a secret?" Only a clear **no** sets `--no-client-data`. If they are unsure, help them look — a
   customer's name on the screen, an email address, a policy or account number, a token in a response —
   and ask them to crop or re-take the screenshot before going on. The script independently refuses a
   token-shaped string anywhere in the words (exit 2); if that happens, say which **kind** it found (the
   message names the kind, never the value) and ask for the sentence to be rewritten without it.

6. **Preview, then write.** Show the exact command before running it and run it:
   ```bash
   uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/report_issue.py new \
     --state .sdlc/state.yaml --title "<one line>" --channel web \
     --what "<what happened>" --expected "<what they expected>" \
     --steps "<step 1>" --steps "<step 2>" --environment test --severity blocks --frequency always \
     --data-impact wrong-shown --persona "<the type of user>" --reporter-role checker \
     --answer "browser_device=<browser and device>" --answer "last_action=<what they clicked>" \
     --screenshot /path/to/shot.png --no-client-data --env-json /tmp/env.json --by "<name>"
   ```
   `--spec NNNN` links the report to the spec the broken part was built under. `--product-version` names
   the build when it is not a local run. `--escaped-from "<check>"` — for a bug that reached a later stage
   past a check that should have caught it (the grader, the security pass, a CI gate) — also records the
   scorecard's `escaped_bug` event through `scorecard.py` itself; a **production** bug without it gets an
   advisory line asking for it.
   - **Exit 0:** written as `new` — `.sdlc/issues/ISS-NNNN-<slug>.md`, the screenshot(s) copied under
     `ISS-NNNN/`, one `reported` ledger line. The output names the agent's **proposals** (a priority and a
     bugfix tier, from severity, data impact, environment and frequency) — proposals a reviewer confirms or
     changes, never decisions. Show the path and any `advisory:` lines as suggestions, not blockers.
   - **Exit 1:** not written — every gap is listed. Go back to the questions the gaps name; nothing was
     created, so re-running with the answers filled in is the whole fix.
   - **Exit 2:** refused — an AI-looking `--by`, or a secret. Nothing was written.

### B. Review (`triage`) — someone else looks

7. **A report is reviewed by someone other than its reporter** — the method's non-author rule applied to
   bugs. Show the report (`show --issue ISS-NNNN`), reproduce it or read the steps, and ask the reviewer
   with `AskUserQuestion` for the verdict: **confirmed** (optionally correcting the severity or the data
   impact — the proposals move with them), **needs-info** (with the question for the reporter),
   **duplicate** (of which report), or **won't fix** (with the reason the reporter will read).
   ```bash
   uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/report_issue.py triage \
     --state .sdlc/state.yaml --issue ISS-0001 --verdict confirmed [--severity blocks] [--data-impact exposed] --by "<reviewer>"
   ```
   The script refuses the reporter's own name (exit 1) unless they pass `--override --reason "<why>"` — a
   team of one says so out loud, and the override is on the record. `needs-info` needs `--question`;
   `duplicate` needs `--of ISS-NNNN`; `wont-fix` needs `--reason`. The reporter answers a question with
   `note --issue ISS-0001 --note "…" --by "<reporter>"`, then the reviewer triages again.

### C. Prioritize

8. A **triaged** report gets a priority and, when it has one, a target sprint — a named human confirming
   the proposal or changing it, with a reason when they differ:
   ```bash
   uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/report_issue.py prioritize \
     --state .sdlc/state.yaml --issue ISS-0001 --priority P1 --target-sprint S08 --by "<name>"
   ```
   > **HITL GATE:** Show the proposal (`show --issue … --json` → `proposed_priority`) and ask: "P1 — fix
   > now, this sprint or a hotfix; P2 — next sprint; P3 — the backlog. The proposal is P2. Which?" Then
   > ask which sprint the fix should land in; offer the open sprints `/sdlc-sprint list` shows. A
   > target sprint must be an open `sprint.py` record once any exist (a closed or unknown one is exit 1,
   > naming the open ones); with no sprint records yet the id is recorded as typed, with a warning.

### D. Promote — the report becomes a spec

9. A **prioritized** report becomes a `type: bugfix` spec through `new_spec.py` (never by hand), with the
   tier a named human confirms:
   ```bash
   uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/report_issue.py promote \
     --state .sdlc/state.yaml --issue ISS-0001 --risk MEDIUM --owner "@priya-n" --team claims --slate --by "<name>"
   ```
   > **HITL GATE:** Show the proposal (`proposed_risk`) and ask: "The proposal is MEDIUM (data impact
   > wrong-shown, severity degraded, test). Confirm, or raise to HIGH / lower to LOW?" A tier is a
   > decision the method records against a person; the agent only proposes.

   The new spec's `type` is `bugfix` (the harness's repro-gate: its first acceptance check is a test
   that **fails** against the pre-fix code), its `source` is the report's id, and its Goal points at the
   report. `--slate` also runs `sprint.py slate --sprint <target sprint> --spec <new id> --by <name>` so
   the fix enters the commitment window; `sprint.py`'s own refusal (over target, closed sprint) is a
   warning on an otherwise promoted report, shown verbatim. Then hand over to `/sdlc-spec --spec <id>`
   to write the acceptance checks, and the sprint flow (`/sdlc-refine`, `/sdlc-sprint ready`) takes it
   from there like any other spec.

### E. Afterwards

10. **`sync`** — promoted reports follow their spec: when the bugfix spec's `status` is `merged`
    (written by `/sdlc-spec-status` once the PR merged), the report becomes `fixed`. Run it at the daily
    flow check next to `/sdlc-sprint status`; it reads the spec file and writes only the report.
    ```bash
    uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/report_issue.py sync --state .sdlc/state.yaml
    ```
11. **`file`** — the report on the product's code host, any time, after a dry run the person has seen:
    ```bash
    uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/report_issue.py file \
      --state .sdlc/state.yaml --issue ISS-0001 --dry-run --by "<name>"
    ```
    GitHub through `gh issue create`, Azure DevOps through `az boards work-item create --type Bug`,
    chosen by the repository (`code_host.py`; `--host` overrides for one run; `--label bug` adds a label
    or tag). Then without `--dry-run`. The report gains `filed_host` / `filed_url` / `filed_id`; a CLI
    that is not installed or not signed in is exit 1 with its own words — point at `/sdlc-doctor`.
12. **The queue** — `list` reads the reports in decision order (new and needs-info first, then by
    priority), with counts by status and never a total per person; `list --queue` is the review agenda.

13. **Report** (after any write):
    ```
    ISS-0001 — "<title>"  · new | triaged | prioritized P1 → S08 | promoted → spec 0012 | fixed
    Seen:      test · web · blocks · always · data wrong-shown · as an adjuster (checker)
    Proposal:  priority P2 · tier MEDIUM          (confirmed by <name> | changed to P1 by <name>: <reason>)
    Record:    .sdlc/issues/ISS-0001-<slug>.md (1 screenshot) · filed: github #17 | not filed
    Next:      triage by someone other than <reporter> | prioritize | promote --risk MEDIUM | /sdlc-spec --spec 0012
    ```

## Arguments

- No arguments: the report interview (A) in workflow mode.
- `--repo <path>`: standalone mode — any folder; `.sdlc/issues/` is created under it.
- `show | list [--queue|--status S] | check | triage | prioritize | promote [--slate] | note | reopen | sync | file | set-status`
  as above; every write but `sync` takes `--by <name>` (`sync` follows the specs and names no one).
- `--spec NNNN`, `--product-version`, `--escaped-from "<check>"` on `new`.

## Important

- The user runs `/sdlc-report-issue` — never `report_issue.py` by hand. The command owns the interviews;
  the script owns the minimum, the refusals and the lifecycle.
- **The person's words, verbatim.** You ask; you do not write the bug for them. A required answer that is
  missing is asked again, never guessed.
- **No screenshot, no report.** The script refuses to write without an image file whose bytes are an image.
- **Privacy is a statement the person makes**, recorded with their name and the date; a secret-shaped
  string is refused before anything is written, and the refusal names the kind, never the value.
- **Agent proposes, named human decides.** The priority and the bugfix tier are proposals; `prioritize`
  and `promote` need a person's `--priority` / `--risk`. A name that reads as an AI is refused (exit 2).
- **Another pair of eyes.** The reporter does not triage their own report without `--override --reason`.
- **A report is a record, not a ticket.** The lifecycle never gates and is never gated; nothing is
  written to `state.yaml`; the spec flow decides when the fix is READY and when it ships.
- **Exit codes:** reads 0; writes 0 done · 1 not done (gaps listed, the lifecycle's refusal in words, a
  CLI that said no) · 2 refused.
