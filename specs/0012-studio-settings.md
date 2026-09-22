---
spec: "0012"
name: "studio-settings"
status: draft
type: feature
risk: MEDIUM
source: "SDLC Studio canvas — screens 11, 25, 27, 28"
channel: "ag-ui"
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
- [ ] Connection checks report, each with a plain-language result: signed in, can read, can open pull
      requests, whether the default branch is protected, which checks exist, and any check the playbook
      expects that is missing.
- [ ] Each person in the roster shows their code-host handle, team, the roles they may hold and the
      stages they sign off, and is saved to the project's roster file from plugin spec 0001.
- [ ] Adding a person offers only people who already have access to the repository; Studio never invites
      anyone or changes anyone's repository permissions.
- [ ] The rules that cannot be changed in Studio are stated as such: nobody checks their own work, only
      a team lead lowers a risk level, high-risk changes need a security review and a named sign-off.
- [ ] Build rules show each team's limit with its number of specs in progress, and saving a limit writes
      it to the project's cadence plan, where it shows in that document's history.
- [ ] A team whose alarm is sounding is named on this screen, with its current waiting time.
- [ ] Change approval can be switched on or off, scoped to chosen stages, and states plainly what happens
      to a draft while it waits.
- [ ] Every setting screen states which file the setting is stored in.
- [ ] Changing any setting produces a commit like any other change, with who changed it and why.
- [ ] A setting the current person lacks permission to change is shown but not editable, with the reason.

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
- **Can a project turn off a rule its playbook set, such as needing a security review?** Written here as
  no: playbook rules are shown but not editable in the project. Owner: Matt, before this spec is ready.
