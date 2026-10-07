# The issue lifecycle — bugs in the product, from report to fix

The rules behind `/sdlc-report-issue`, `scripts/issue_model.py` and the Tōgō app's *Issues* view. One
list; three readers. A bug report here is a **record** that becomes a **spec**: the Build loop's unit is
the spec (one spec, one branch, one PR), so a bug is fixed the way everything else is built — through a
`type: bugfix` spec, its Definition of Ready, its checking ladder and its sprint — never through a side
channel of tickets the gates cannot see.

## What a report must carry

A report is written only once it clears the minimum (`issue_model.validate`). Half a report is listed as
gaps and not written.

| Field | Why a fixer needs it |
|---|---|
| title | one line that names the bug (8–120 characters) |
| what happened · what was expected | in the words on screen, at least 20 / 10 characters |
| steps to reproduce | one per line, from a fresh session; one step is thin (advisory) |
| **channel** | where in the product — `web`, `api`, `voice`, `chat`, `data`, `mobile`, `other`; the library's descriptors (`channels/ag-ui.yaml`, `voice.yaml`, `chat.yaml`) are the same words a spec is bound to |
| channel follow-ups | web: the page's address, browser and device, the last action · api: endpoint, status code, request id, the response · voice: what was said, what was heard, the device · chat: the message, the reply, the surface · data: the dataset or job, expected vs actual · mobile: device, last action, app build · other: where |
| **environment** | `local`, `dev`, `test`, `staging`, `production`; the build or version under test (local runs take the branch and commit from git) |
| severity | `blocks` the task · `degraded` · `cosmetic` |
| frequency | `always` · `sometimes` · `once` |
| **data impact** | `none` · `wrong-shown` · `wrong-written` · `exposed` — the axis that raises the fix's tier and tells Data to look |
| **persona** | the type of user the reporter was acting as, in the product's own terms |
| **reporter role** | the method's roles: builder, checker, owner, product, data, design, steering, client, end-user, other |
| spec | optional — the spec the broken part was built under |
| **screenshot** | at least one image of the product, an image by its **bytes** (PNG, JPEG, GIF, WebP; ≤ 10 MB) |
| **privacy statement** | the reporter's own: nothing in the screenshot or the words is client data, personal data or a secret; recorded with their name and the date |

Refused outright (exit 2, nothing written): a reporter name that reads as an AI or automation (the
findings ledger's regex), and a secret-shaped string anywhere in the words — a token, a key, a private
key, a connection string with a password. The refusal names the **kind**, never the value: the report is
shared with the code host and cannot be un-published.

## The states

```
new ──triage confirmed──▶ triaged ──prioritize──▶ prioritized ──promote──▶ promoted ──sync──▶ fixed
 │        │ needs-info ──▶ needs-info ──(note, triage again)                    ▲
 │        │ duplicate / wont-fix ───────────────────────────▶ closed ──reopen──┘ (back to new)
 └── file: the report on GitHub / Azure DevOps, at any status; never a state of its own
```

| Status | Meaning | Reached by |
|---|---|---|
| `new` | reported, awaiting review | `new`; `reopen` |
| `needs-info` | the reviewer asked the reporter something (`--question`); the reporter answers with `note` | `triage --verdict needs-info` |
| `triaged` | confirmed as a bug in the product; severity and data impact corrected where the reviewer saw otherwise | `triage --verdict confirmed` |
| `prioritized` | P1 / P2 / P3 and, when there is one, a target sprint | `prioritize` (may be revised while prioritized) |
| `promoted` | a `type: bugfix` spec exists; `--slate` put it into the target sprint | `promote` |
| `fixed` | the bugfix spec is `status: merged` (`sync`), or a named human says so after review | `sync`; `set-status fixed` |
| `wont-fix` · `duplicate` | closed, with a reason the reporter will read (`--reason`, `--of ISS-NNNN`) | `triage`; `set-status` |

`issue_model.TRANSITIONS` is the whole machine; an action from the wrong state is refused with a sentence
that says what comes first ("review it first (`triage`), then prioritize it; a bugfix spec is scaffolded
only from a prioritized report"). `show --json` returns, per report, which actions the lifecycle allows
and that sentence for each it refuses — the app's buttons disable with it verbatim.

## The rules

- **Another pair of eyes.** A report is reviewed by someone other than its reporter (the method's
  non-author rule applied to bugs). `triage` refuses the reporter's name unless `--override --reason`
  — a team of one says so out loud, and the override is on the record.
- **Agent proposes, named human decides.** From severity, data impact, environment and frequency the
  model **proposes** a priority (`proposed_priority`) and a bugfix tier (`proposed_risk`):

  | Proposal | When |
  |---|---|
  | priority **P1** · tier **HIGH** | data written wrongly or exposed; or a blocker in production |
  | priority **P2** · tier **MEDIUM** | a blocker anywhere; wrong data shown (P2 when every time) |
  | priority **P3** · tier **LOW** | the rest |

  `prioritize` needs `--priority`, `promote` needs `--risk` — a person's confirmation or change, with the
  change noted against the proposal in the history. Nothing here decides for them.
- **A target sprint is a real one.** Once `sprint.py` records exist, `--target-sprint` must name an open
  record (a closed or unknown one is refused, naming the open ones); with none yet it is recorded as
  typed, with a warning.
- **Promotion goes through `new_spec.py`.** The spec's `type` becomes `bugfix` (the harness's repro-gate:
  the first acceptance check is a test that fails against the pre-fix code), its `source` is the report's
  id, its Goal points at the report. `--slate` runs `sprint.py slate` for the target sprint; sprint.py's
  own refusal (over target, closed) is a warning on an otherwise promoted report — shown verbatim, never
  rephrased.
- **`fixed` follows the spec.** `sync` reads the bugfix spec's `status` (written by `/sdlc-spec-status`
  when the PR merges) and writes only the report and its ledger. A report with no confirmed bug cannot be
  called fixed.
- **Filing is orthogonal.** `file` opens the report on the repository's host (`gh issue create`,
  `az boards work-item create --type Bug`) after a `--dry-run` the person has seen; it records the URL and
  changes no state.
- **Escaped bugs reach the scorecard.** `--escaped-from <check>` records `scorecard.py`'s `escaped_bug`
  event through `scorecard.py` itself; a production report without it carries an advisory asking for the
  check that should have caught it.
- **Never a gate, never gated.** The lifecycle writes `.sdlc/issues/` and `.sdlc/metrics/issue-log.jsonl`
  only; it never writes `state.yaml`, never moves a phase, never blocks a spec. The spec flow (DoR,
  verdicts, `sprint ready`) decides when the fix is ready and when it ships.

## What the records are

- `.sdlc/issues/ISS-NNNN-<slug>.md` — frontmatter (the facts above, plus `priority`, `target_sprint`,
  `triaged_by`, `triage_verdict`, `prioritized_by`, `duplicate_of`, `bugfix_spec`, `filed_*`) and the
  reporter's sections verbatim: What happened · What you expected · Steps to reproduce · Where ·
  Environment · Screenshots · Privacy check · History (one dated line per move).
- `.sdlc/issues/ISS-NNNN/screenshot-N.<ext>` — the images, copied in by `new`.
- `.sdlc/metrics/issue-log.jsonl` — one event per move: `reported`, `triaged`, `prioritized`,
  `promoted` (with the slate's exit when `--slate` ran), `fixed`, `status`, `note`, `reopened`, `filed`.

## Metrics policy

The ledger and `list --json` carry **counts of reports by status** and a reporter per report — never a
total per person, never a time-to-fix per person. "No reports" reads `no data`, never a zero that was not
measured. A pattern across reports (the same channel, the same spec) is the retro's business
(`/sdlc-retro`), read from the ledger; nothing here ranks people.
