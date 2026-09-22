# Design Proposal: Plugin work behind SDLC Studio (the front end)

**Status:** Draft for review
**Author:** (via SDLC Studio front-end design session, 2026-09-18)
**Related:** SDLC Studio design canvas (claude.ai artifact "SDLC Studio"); `docs/templates-artifacts.md`

---

## Why this exists

The SDLC Studio design assumes the plugin can do things it cannot do today. This document lists
that work, in the order it should happen. Item 1 is written out in full because every other
document-editing screen depends on it; the rest are scoped to one paragraph each and will get their
own proposals.

Every claim below is tagged **Verified** (read in the code, with the location) or **Unverified**.

---

## Architecture decision: Studio is a desktop app, not a hosted service

**Decision taken (2026-09-18).** Studio runs on each person's computer, against a local clone of the
project repository, using the same GitHub or Azure DevOps sign-in that git and Claude Code already use.
There is no Studio server. The repository and the code host are the only shared state.

Why:
- The plugin's scripts already run locally (`uv run scripts/...`) against the project folder; a desktop
  app calls them directly.
- "Open in Claude Code" can start a real local session on the spec's branch.
- Studio can do exactly what the signed-in person can do — no organisation-wide app, no tokens on a server.

What this rules in and out:
- Anything team-wide (the Build board, "Needs me", the scorecard) is **derived on each machine** from the
  repository plus the code host's own history. Nothing may depend on a shared Studio database.
- Notifications ride the code host: a hand-off is a GitHub/Azure DevOps assignment or review request.
- Studio syncs only while open. Every write must be a normal commit, so nothing depends on Studio running.

Accepted costs: everyone installs the app; derived views may be slow on very large projects
(**Unverified** — measure against a 200-spec repository before committing to the approach).

---

## 1. Template shapes — how the app knows what fields a document has

### Problem

Documents are Markdown. Their structure exists only as writing conventions:

- headings mark sections (`### FR-012: …`);
- bold labels mark fields (`**Priority:**`, `**Source:**`);
- some templates carry hidden markers such as
  `<!-- REQUIRED: acceptance-criteria — at least 2 Given/When/Then statements … -->`.

**Verified:** 28 of the 64 Markdown files under `templates/` contain at least one `<!-- REQUIRED`
marker (84 markers total; grep count). The other 36 — including the Build-stage
`templates/phases/build/spec.md` — have none.

**Verified:** the gate's completeness check never compares a document to its template. It passes
any non-empty file with no placeholder text (`scripts/check_gates.py`, `check_artifact_complete`).
Deleting a required section entirely does not fail the gate.

**Verified:** a document keeps no record of which template, or which version of it, it came from.
Templates are copied once at creation (`scripts/init_project.py:12`, `scripts/new_spec.py:22`,
`scripts/new_spike.py:35`).

**Verified:** the gate treats `<!-- REQUIRED:` as unfinished text (`scripts/check_gates.py:67`,
`PLACEHOLDER_MARKERS`), so writers must delete those markers to pass. Finished documents therefore
carry **no** field markers — the markers cannot be used to read a filled-in document.

**Verified:** the same list does not include bracket placeholders such as `[Write 3–5 sentences here]`
or `[Name/title]` (only `[INSERT`). A document that still contains them passes the gate.

**Verified:** templates contradict themselves in places — `problem-statement.md` asks for a
"2-3 sentence" executive summary in its marker and "3–5 sentences" in its placeholder.

A front end cannot draw reliable forms from conventions alone: the first renamed heading or dropped
bold label breaks the form or loses content.

### Decision

Give every template a **shape** stored beside it, and keep documents as Markdown.

Options considered:

| Option | Verdict |
|---|---|
| Parse the Markdown conventions only | Rejected — fragile; any hand edit breaks it |
| **Shape file beside each template; documents stay Markdown** | **Chosen** |
| Store documents as structured data; generate Markdown for reading | Rejected — breaks everything that reads or writes Markdown today (Claude, gates, version diffs); a rewrite |

### What a shape contains

One file per template, next to it (e.g. `requirements.shape.yaml` beside `requirements.md`):

- template id and **version**;
- ordered list of **sections**, each with: heading text, whether it **repeats** (one block per
  requirement, per ADR…), and an **id pattern** for repeating blocks (e.g. `FR-{nnn}`, allocated
  document-wide, never reused);
- per section, its **fields**: label, type (`sentence`, `paragraph`, `list`, `table` with columns,
  `choice` with options such as P0/P1/P2, `reference` to a DOC-/FR-/DL- id), required or not, and the
  guidance text shown to the writer;
- which fields feed the **sign-off check** (required and non-placeholder).

### What a document carries

One hidden line at the top recording its template id and version. This is also what template
versioning needs (item 3), so the two are built once.

### Reading and writing rules (the hard part)

1. **Read:** match the document against its shape by heading and label. Anything that does not
   match — a paragraph someone added in an editor — becomes a **free-text block**, shown and kept
   verbatim. Nothing is ever dropped.
2. **Write:** the app may only rewrite the fields it owns, in the template's layout. Everything else
   is left byte-for-byte as it was.
3. **Numbering:** new repeating blocks get the next free id across the whole document.
   **Verified gap:** nothing in `scripts/` allocates requirement numbers today (grep for `FR-`
   patterns found no allocator; not an exhaustive search).
4. **Round-trip test:** for every template, "read → write with no changes" must produce an identical
   file. This is the acceptance test for the whole item.

### Sign-off check

The shape lets the gate confirm that required fields exist and are filled — closing the "deleted
section still passes" hole.

**Constraint:** `scripts/check_gates.py` is part of the protected core that recent features were
required to leave byte-for-byte unchanged. So ship this first as a **separate, advisory** check
(same pattern as `check_channel.py`), and decide deliberately whether it later becomes blocking.

### Order of work

1. Define the shape format and write a validator for it (mirrors `profiles/_schema.yaml` style).
2. Generate first-draft shapes for the 28 templates that have `REQUIRED` markers; review by hand.
3. Add the template-id/version stamp to documents created from now on; documents without one
   fall back to "all free text" (still readable, still editable).
4. Build the read/write library with the round-trip test for every shaped template.
5. Add the advisory shape-aware completeness check.
6. Write shapes for the remaining 36 templates.

**Risk:** step 4. Hand-edited Markdown is the common case, and a writer that "tidies" it will lose
people's work. Strict ownership rules plus the round-trip test are the mitigation.

---

## 2. Company templates

**Verified:** there is no way for a company or profile to supply its own templates. Every script
reads from the plugin's own `templates/` folder (see item 1), and the profile schema has no
template setting. Needed: a company template store, and a profile field that lists which company
templates it uses and at which stage (required or optional).

**Verified:** which documents a stage requires is fixed in `phases/phase-registry.yaml`, so a
company template cannot add a required document to a stage. Needed: a profile-level extension to
the stage's required list.

## 3. Template versions and update offers

Depends on items 1 and 2. Each template gets a version; each document records the version it
came from (item 1). When a template changes, documents in unsigned stages are **offered** the
update (never forced); signed-off documents stay on their version. Removed sections are kept and
marked; renames are recorded so content moves with them.

## 4. Approval for changes to signed-off documents

**Verified:** `/sdlc-revise` records who changed a document and why, and never touches sign-off
records (`commands/sdlc-revise.md`, "Important"). There is no approval step. Needed: a per-project
setting (on/off, who approves, which stages) and a "waiting for approval" draft state in which
the signed-off version stays in force.

## 5. Company profiles created from the app

**Verified:** profiles are hand-written YAML inside the plugin (`profiles/*/profile.yaml`), checked
by `scripts/validate_profile.py`. Needed: profiles stored outside the plugin folder, written by the
app, validated by the same schema.

**Verified:** setup has full support only for these technology packs: back ends `dotnet`,
`node-typescript`, `python`; front ends `angular`, `react` (plus `generic`); code hosting `github`,
`azure-devops` (`harness/packs/`). The profile builder must label anything else "basic support".

**Verified:** SOC 2 is the only compliance framework with a gate file (`profiles/*/compliance/soc2-gates.yaml`).
**Unverified:** how HIPAA, GDPR and PCI are handled beyond the compliance-checker agent's review.

## 6. Source files: PowerPoint and Excel

**Verified:** document intake reads PDF, Markdown, plain text, Word and HTML only
(`scripts/intake_documents.py`, `TYPE_GLOBS`). Needed: PowerPoint and Excel, read properly —
spreadsheets summarised sheet by sheet, not flattened to PDF. Also needed: files added by
drag-and-drop in the app land in the profile's intake folder, and intake works without a
`documentation` section in the profile.

## 7. Activity log for the Console

**Unverified:** the plugin does not appear to record which commands ran. The Console and the
"used in this project" counts on the Commands screen need an append-only activity log (command,
trigger, files written, checks run), in the same JSONL style as `.sdlc/metrics/`.

## 8. Two inconsistencies to fix

- **Verified:** `templates/phases/01-requirements/user-stories.md` calls itself a required artifact,
  but `phases/phase-registry.yaml` does not list it for Requirements. Decision taken: make it
  optional (stories are decomposed in Design, per `epics.md`).
- **Verified:** setup copies the charter to `.sdlc/constitution.md` (`scripts/init_project.py:65-67`),
  but the Discovery gate looks for `constitution.md` in `.sdlc/artifacts/00-discovery/`
  (`scripts/check_gates.py:380`). Decision taken: keep one copy, in the Discovery folder.
  **Unverified:** whether anything still reads the `.sdlc/` copy — check before removing it.

## 9. Repository sync: pull, save as a commit, clash handling

**Verified (search, not an exhaustive read):** the only plugin script that runs git is the health check,
`scripts/doctor.py`, which confirms git is installed and checks branch protection
(`_check_branch_protection_github`). No script pulls, commits, pushes or opens pull requests.

Needed (mostly Studio's own code, with one plugin dependency):
- Pull every 2 minutes while Studio is open, and before a document opens.
- Each save becomes one commit, with the author's change note as its message.
- When `main` is protected, Studio opens a pull request that merges itself once checks pass. It waits for
  a person only when approval is on for that stage (item 4).
- Clash handling is **per section, not per line**. Changes to different sections merge silently; the same
  section changed in two places is shown side by side (keep mine / keep theirs / let Claude combine).
  This depends on item 1 (template shapes), because sections are what the shape defines.
- A clash with a merged spec's change warns that keeping the local version makes the document disagree with
  shipped code, and offers a follow-up spec. This ties into `/sdlc-refresh`.

## 10. People, roles and teams

**Verified:** a spec's frontmatter records `spec`, `name`, `status`, `type`, `risk`, `source`, `channel`,
`harness_context` and `created` (`templates/phases/build/spec.md`). It has no owner, developer, checker or
team. The plugin has no roster of people or teams.

Needed:
- Spec fields: `owner` (intent and decisions), `developer` (drives Claude Code, approves the plan),
  `checker` (non-author approval), `team`. Values are code-host handles, so approvals on the host count.
- A project roster file: each person's handle, team, the roles they may hold, and which stages they sign
  off. Team leads per team. A security-review group (for example a GitHub team).
- `check_spec.py` treats a missing `owner` as not ready. The "checker is not the developer" rule stays
  enforced by branch protection on the host, not by the plugin.

## 11. Limits per team, and the review-wait alarm

**Verified:** the work-in-progress cap is one number for the whole project, passed as `--wip-cap`
(`scripts/track_specs.py:72-77`, `:123`). Its docstring says the cap itself lives in `cadence-plan.md`,
as prose.

Needed:
- Limits per team, in a structured block that `track_specs.py` can read rather than a command-line flag.
- The review-wait alarm threshold (default 1 day), with security reviews measured separately (default
  2 days). When a team's alarm is sounding, a new hand-off for that team is refused.
- Studio's Build-rules screen writes this block. It lives in `cadence-plan.md`, so changes show in that
  document's history.

## 12. A "deferred" spec status

**Verified:** spec statuses are `draft`, `ready`, `in-flight`, `merged` (`scripts/track_specs.py:24`).

Needed:
- A `deferred` status with a required reason. It is left out of work-in-progress counts.
- The feature-complete declaration may happen only when every committed spec is `merged` or `deferred`.
  Each team lead confirms their own list.
- `phase7-handoff.md`'s "Deferred items" section is generated from the deferred specs and their reasons.
- **Unverified:** whether anything else assumes the four-status list; check every reader of
  `STATUS_ORDER` before adding one.

## 13. Scorecard from the code host's history

**Verified:** `scripts/scorecard.py` reports from `.sdlc/metrics/loop-events.jsonl`, and events get
into that log through its `record` command. **Verified (search, not an exhaustive read):** no command,
agent or hook calls `scorecard.py record`, so today the log fills only if someone records by hand.

Needed: build the events from the code host instead of recording them.
- Merges, reverts and rework come from pull requests.
- Review wait runs from review request to approval, with security reviews split out.
- Deploys and failures come from pipeline runs; incidents and time to recover come from a labelled issue.

Keep `scorecard.py`'s report logic, its "no data, never zero" rule, and its refusal of activity metrics.
Add an import step from the host. Because every machine derives from the same history, every teammate
sees the same numbers.

## 14. Starting Claude Code with a spec loaded

**Unverified:** nothing in the plugin starts a Claude Code session for a spec.

Needed: one command that does the hand-off end to end.
- Create the spec's branch using the playbook's naming rule. `conventions.branch_naming` already exists
  in `profiles/_schema.yaml`, so this reuses it.
- Start Claude Code on that branch with the spec loaded, in plan mode.
- Set `status: in-flight` and `developer`, and assign the developer on the code host.
- Record the plan approval when the developer gives it. **Unverified:** plan approval is not recorded
  anywhere today; Studio's status screen shows it as a step.

## 15. Spec status from pull requests and checks

Needed: link each spec to its pull request by branch name. Read the pull request's state, checks, grader
verdict, security review and approvals, so Studio can show a read-only "where is this spec" view.
When the pull request merges, set `status: merged` in the same pull request or a follow-up commit.
**Unverified:** whether the grader's verdict comment is structured enough to read reliably; it may need a
machine-readable block, like `/sdlc-review`'s `## Gate Results`.
