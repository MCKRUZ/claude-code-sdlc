---
spec: "0012"
name: "studio-settings"
status: draft
type: feature
risk: MEDIUM
source: "SDLC Studio canvas — screens 11, 25, 27, 28"
channel: "ag-ui"
owner: "@MCKRUZ"
developer: ""
checker: ""
team: "core"
harness_context: "every setting is stored in a project document or the spec roster — Studio keeps no settings store of its own"
created: "2026-09-19"
---

# Spec 0012 — Project settings: repository, people, Build rules, approval

## Goal

A person can see and change the project's settings — its repository connection, its people and teams,
its Build limits, and whether changes to signed-off documents need approval — with every setting stored
in the project itself.

## Why

These settings decide who can do what and when work is blocked, so they cannot live in an application's
private store where they drift per machine and vanish on reinstall. Keeping them in the project's own
files means Claude Code, the plugin's scripts and every teammate's Studio all read the same rules, and
every change to them shows up in history like any other change.

## Scope

### In scope
- The repository section: what Studio reads and writes, how saves reach the repository, connection checks
- People and teams: the roster, roles, sign-offs, team leads and the security group
- Build rules: the limit per team, the review-wait alarms, and where Claude Code opens
- Change approval: whether signed-off documents need approval, who approves, and for which stages
- Writing each of these back to the file that owns it

### Out of scope
- Notifications settings and project details — a later spec; they appear in the menu as not yet built.
- Any setting stored only in the application.
- The company library of playbooks and templates — a later spec.

## Acceptance Checks

- [ ] The repository section shows the repository, branch, local folder and signed-in account, and lists
      what Studio may read and what it may write, marking the code as read-only.
- [x] Connection checks report, each with a plain-language result: signed in, can read, can open pull
      requests, whether the default branch is protected, which checks exist, and any check the playbook
      expects that is missing.
- [ ] Each person in the roster shows their code-host handle, team, the roles they may hold and the
      stages they sign off, and is saved to the project's roster file from plugin spec 0001.
      <!-- Un-ticked 2026-09-26. This was ticked on half the claim: the WRITE side is genuinely
           proven (test_set_setting.py). The DISPLAY side — SettingsScreen.tsx actually rendering
           handle/team/roles/signs_off per row — is real code but has zero test coverage anywhere
           in the suite; nothing asserts on roster-row text, in either the unit or e2e suite. A
           rendering bug here would currently ship unnoticed. -->
- [ ] Adding a person offers only people who already have access to the repository; Studio never invites
      anyone or changes anyone's repository permissions.
- [x] The rules that cannot be changed in Studio are stated as such: nobody checks their own work,
      lowering a risk level is recorded against whoever decided it, high-risk changes need a security
      review and a named sign-off.
<!-- Amended 2026-09-24. This check previously read "only a team lead lowers a risk level", which
     describes a rule that exists NOWHERE in the plugin — verified while building spec 0011, whose
     Decision List resolves it: a downgrade is ATTRIBUTABLE, not restricted to certain people,
     because the latter is a rule this system has no honest way to enforce. A settings screen
     stating an unenforced rule as a fact is worse than not listing it: it tells someone they are
     protected by something that is not there. -->
- [ ] Build rules show each team's limit with its number of specs in progress, and saving a limit writes
      it to the project's cadence plan, where it shows in that document's history.
      <!-- Un-ticked 2026-09-26. Same split as the roster check above: the write path is proven
           (test_set_setting.py), but SettingsScreen.tsx's own "{in_flight} in flight / {wip_limit}"
           display has no test anywhere in Settings' e2e coverage. The suite's only "in flight"
           text match tests the separate Build BOARD screen's team cards, not this one. -->
- [ ] A team whose alarm is sounding is named on this screen, with its current waiting time.
- [ ] Change approval can be switched on or off, scoped to chosen stages, and states plainly what happens
      to a draft while it waits.
      <!-- Un-ticked 2026-09-26. Built — the toggle, the stage list, the setStageApproval call and
           the explanatory text all exist in SettingsScreen.tsx — but untested at every layer: no
           test anywhere touches the toggle interaction, stage scoping, or the explanatory text.
           Weaker than the two checks above, which at least had a proven write half. -->
- [x] Every setting screen states which file the setting is stored in.
- [ ] Changing any setting produces a commit like any other change, with who changed it and why.
- [ ] A setting the current person lacks permission to change is shown but not editable, with the reason.

### What is proven, and what is still missing (2026-09-24, corrected 2026-09-26)

Two of eleven ticked, not five. Re-auditing this write-up on 2026-09-26 (the same pass that
covered specs 0008-0011) found three of the original five ticks — the roster, Build-rules, and
change-approval checks — were ticked on the strength of a real, tested WRITE path while the
matching DISPLAY code had never been tested at all. A wrong number on a settings screen is not a
hypothetical here: it is the same class of bug this spec exists to make legible. All three are
un-ticked above with their own notes; only the connection-checks and fixed-rules checks hold up
as originally written. A ticked box means a test asserts it.

**Proven in the real window** (`test/e2e/board.spec.ts`): every section names the file its
setting is stored in, including when that file does not exist yet; an unconfigured setting
reads as "not set up" and never as an error; and each fixed rule names where it is actually
enforced. That last test also asserts the claim this spec was AMENDED to remove — "only a team
lead lowers a risk level" — cannot reappear on screen, since it is enforced nowhere.

**Proven by test** (`scripts/tests/test_set_setting.py`, 22 cases as of 2026-09-26, was 17): a
roster, limit or approval change is validated before it is written; a refusal leaves the file
byte-for-byte as it was; and — the regression that file exists for — every comment and every
untouched line survives a write. The first version of the roster editor parsed the file and
dumped it back, which passed validation and destroyed all nine comments its author had written.
This proves the WRITE half of the roster, Build-rules and approval checks above — none of it
proves what actually renders on screen, which is why those three are un-ticked now.

**NOT BUILT — missing features, not merely unverified:**

1. ~~Connection checks.~~ **BUILT** — six questions, each with a plain-language result and
   each able to answer "could not tell", which is a third answer and not a failure. The
   valuable one compares the playbook's own pipeline definitions against what the project has
   installed, so the screen and the pipelines cannot disagree about what is expected.
   **It found a real gap on its first run, in this very repository:** of the five pipelines
   the playbook expects of every project, only CI is installed here. The correctness review,
   dependency scan, grader and security review ship to clients and do not run on the plugin
   itself. Reported to Matt rather than fixed — installing them changes what every pull
   request must pass.
2. **Choosing a person from those who already have repository access.** Corrected 2026-09-26:
   the original note here was wrong, not just optimistic. Adding someone is not "a typed handle
   today" — there is no add-person control AT ALL. `SettingsScreen.tsx`'s "People and teams"
   section is entirely read-only: no input, no button, no code path that writes a new person.
   The screen's own caption text — "Adding someone here records that they may hold a role..." —
   describes a feature that does not exist, which is worse than the feature simply being
   missing: it promises a control nobody can find. The second half of the check (never inviting
   anyone or changing a permission) is still satisfied by construction, since there is no write
   path of any kind yet. Offering only people who already have access still needs the code
   host's collaborator list, on top of building the control itself.
3. **Naming a team whose review-wait alarm is sounding, with its current waiting time.** The
   alarm thresholds are read and passed through; the elapsed time is not computed. Same root
   cause as spec 0011's "how long it has waited": real waiting time needs a per-pull-request
   fetch the bulk call deliberately does not make.
4. **A setting shown but not editable because this person may not change it — WITH THE SAME
   PROBLEM AS SPEC 0011's RISK RULE.** There is no permission model for settings anywhere in
   this system, so there is nothing to read to decide who may change what. Building it in
   Studio would be a permission rule enforced only in the app, which anyone editing the file
   directly steps around — the pattern this spec was already amended once to avoid. Making it
   real means deciding where setting permissions live, which is a decision rather than a task.
   **Recommendation:** drop this check. The files are in the repository and the code host
   already decides who may change them; a second permission model in the app would be
   theatre. Left for Matt.

**Partly proven:** a settings change committing with who and why is built and the save path is
tested elsewhere, but not yet driven end-to-end through the window against a real remote. And
the repository section states what Studio may read and write as prose rather than as the
itemised list this check describes.

## Risk Tier

**Tier:** MEDIUM
**Why this tier:** it changes rules that govern the team's work, but all of them are recorded, reversible
and enforced elsewhere — branch protection, not Studio, is what actually stops a bad merge.

## Delegation Plan
- **Scope (file patterns):** the Studio application repository only
- **Context (pattern to reuse):** the roster from plugin spec 0001 and the limits block from 0003 —
  Studio edits those files, it does not invent a second format
- **Permissions:** build, test and read auto-allowed. Writes to project files go through spec 0009
- **Gated paths touched:** none

## Checking Plan

**Ladder depth:** MEDIUM
**Specifics:** grader plus a non-author approval. The reviewer should confirm no setting is persisted
anywhere but a project file, and that Studio cannot change anyone's repository permissions.

## Decision List
- **Can a project turn off a rule its playbook set, such as needing a security review?**
  Confirmed as written: no. Playbook rules are shown in the project and are not editable there.
  Delegated by Matt on 2026-09-24 ("do what you think is best") and decided by Claude — recorded as a delegated decision rather than as Matt's own, so a later reader knows whose judgement this was.
  A rule a project can switch off is not a rule, and the playbook is the thing being sold. The
  cost is accepted: a client wanting an exception has to change the playbook, which is the right
  place for that argument to happen rather than a settings screen nobody reviews.
