---
spec: "0009"
name: "studio-repo-sync"
status: draft
type: feature
risk: HIGH
source: "SDLC Studio canvas — screens 25, 26"
channel: "ag-ui"
owner: "@MCKRUZ"
developer: ""
checker: ""
team: "core"
harness_context: "the person's existing git and code-host sign-in on their machine — Studio never holds its own credential"
created: "2026-09-19"
---

# Spec 0009 — Studio pulls, saves as commits, and handles clashes

## Goal

Studio keeps the open project in step with its repository: it pulls what other people changed, saves
each change as a commit, and when the same thing changed in two places it asks the person which version
to keep.

## Why

This is what makes Studio, Claude Code and the code host one shared truth rather than three. It is also
the most dangerous thing Studio does: a careless merge loses work that someone did somewhere else, and
they find out much later. Every rule here exists to make loss impossible rather than unlikely.

## Scope

### In scope
- Connecting to the project's repository using the person's existing sign-in
- Pulling on a timer while Studio is open, and before a document opens
- Saving changes as commits with the person's change note
- Opening a pull request when the branch is protected, and merging it when checks pass
- Showing what arrived from elsewhere, with who made each change
- Clash detection per section, and the choose-a-version screen
- The sync indicator on every screen

### Out of scope
- The document editor itself — spec 0010. This spec provides reading and writing of files.
- Anything to do with code: Studio never writes outside the project's documents and specs.
- Holding any credential of its own, and any background work while Studio is closed.

## Acceptance Checks

- [ ] Studio uses the sign-in git already has on the machine; it never prompts for, stores or displays
      a password or token.
- [ ] A read-only view of the connection shows the repository, the branch, the local folder, the signed-in
      account, and when it last pulled.
- [ ] Studio pulls every 2 minutes while open, and immediately before a document is opened.
- [ ] Saving a change produces exactly one commit containing only the files that changed, with the
      person's change note as the message.
- [ ] When the default branch is protected and approval is OFF for that stage, saving pushes a branch
      and opens a pull request; the pull request merges itself once its checks pass, and the sync
      indicator shows it is waiting until then.
- [ ] When approval is switched ON for that stage, the pull request waits for the named approver first;
      once approved, it still requires an explicit merge — approval covers the content, not the push to
      the default branch — and the sync indicator distinguishes "waiting for approval" from "approved,
      ready to merge."
- [ ] When the default branch is not protected, saving commits and pushes directly, and the connection
      screen says which of the two is happening.
- [ ] Changes that arrived from elsewhere are listed with the person who made them, when, and where they
      came from, whether they were made in Studio, in Claude Code or directly on the code host.
- [ ] Changes to sections the person did not edit are merged in without asking.
- [ ] A section changed both locally and remotely is a clash: both versions are shown side by side, and
      nothing is saved until the person chooses one, or accepts a combined version.
- [ ] Choosing a version never discards the other silently — the unchosen version is recoverable from
      the branch history, and the choice is recorded in the commit message.
- [ ] A clash against a change that came from a merged spec warns that keeping the local version makes
      the document disagree with shipped code.
- [ ] Closing Studio with unsaved edits keeps them locally and offers them again on reopening; they are
      never pushed without the person saving.
- [ ] Every failure — no network, no permission, a rejected push — leaves the local folder in a working
      state and says what to do next.

## Risk Tier

**Tier:** HIGH
**Why this tier:** it writes to a shared repository on a person's behalf and resolves conflicts in other
people's work. A wrong merge destroys work and is discovered late.

## Delegation Plan
- **Scope (file patterns):** the Studio application repository only
- **Context (pattern to reuse):** the person's existing git and code-host sign-in, and the section model
  from plugin spec 0007 — clashes are decided per section, never per line
- **Permissions:** build, test and read auto-allowed. Any git command that writes, and any code-host
  call, must be confirmed while this spec is in development. Force-pushing and history rewriting are
  refused outright
- **Gated paths touched:** none in the plugin; this spec is gated by its own risk tier

## Checking Plan

**Ladder depth:** HIGH — the full ladder
**Specifics:** every mechanical check, the grader, the correctness review, a security pass covering how
the sign-in is used, and a named human sign-off. A reviewer must run the clash cases by hand against a
real repository with two people editing.

## Decision List
- **Should document pull requests merge themselves when checks pass, or always wait for a person?**
  Resolved 2026-09-24 by Matt: depends on the stage's approval setting. When approval is OFF for
  that stage, the PR merges itself once checks pass. When approval is ON, the PR waits for the
  named approver first, and still needs an explicit merge afterward — the approval step is for the
  content, not a standing authorization to also push to the default branch unsupervised.
- **What happens when someone edits the same document in Claude Code while Studio has unsaved edits?**
  Resolved 2026-09-24 by Matt: confirmed as written — the same clash screen, surfaced on Studio's
  next pull (no separate filesystem-watch detection path; one clash mechanism, not two).
