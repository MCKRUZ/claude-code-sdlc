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

- [x] Studio uses the sign-in git already has on the machine; it never prompts for, stores or displays
      a password or token.
      <!-- Ticked 2026-09-26. `redact()` (electron/main/commandRunner.ts) scrubs every git/gh
           stdout, stderr and command line before it reaches the console log the UI shows — proven
           against 15+ real credential shapes (GitHub PATs, `github_pat_`, GitLab, Anthropic keys,
           AWS keys, Authorization headers, JWTs) by test/redact.test.ts. No credential input field
           exists anywhere in src/components/, and neither Settings nor ProjectSyncState carries a
           credential field to display in the first place. -->
- [ ] A read-only view of the connection shows the repository, the branch, the local folder, the signed-in
      account, and when it last pulled.
      <!-- Built, not proven (2026-09-26). getConnectionInfo() (sync.ts) returns all five;
           SettingsScreen.tsx renders repo/branch/account/folder and Header.tsx renders last-pulled
           separately. No test asserts any of it is actually shown — the only settings-screen e2e
           coverage (test/e2e/board.spec.ts) exercises spec 0012's roster/approval/rules panels, not
           this. -->
- [ ] Studio pulls every 2 minutes while open, and immediately before a document is opened.
      <!-- Genuine mismatch (2026-09-26). The 2-minute timer is real (index.ts, PULL_INTERVAL_MS).
           "Before a document is opened" was built as "before the PROJECT is opened" instead — the
           code's own comment admits the substitution. Opening an individual document later in the
           same session (documents.ts's openDocument()) triggers no pull at all. Someone who opens
           the project, works for an hour, then opens a second document does not get a fresh pull
           before it. -->
- [x] Saving a change produces exactly one commit containing only the files that changed, with the
      person's change note as the message.
      <!-- Ticked 2026-09-26. test/approvalPath.test.ts, "with no approval step, the change lands
           on the shared branch with who and why" — asserts the pushed content is exactly the
           changed file and that listVersions() carries the real actor and reason. -->
- [ ] When the default branch is protected and approval is OFF for that stage, saving pushes a branch
      and opens a pull request; the pull request merges itself once its checks pass, and the sync
      indicator shows it is waiting until then.
      <!-- Half proven (2026-09-26). "Pushes a branch and opens a pull request" is proven by
           test/approvalPath.test.ts's protected-branch test. "Merges itself once checks pass" is
           real code (pollAndMergeOpenPullRequest, sync.ts) but its identity-matching core is only
           unit-tested in isolation (test/mergeGate.test.ts's isOursToMerge) — no test drives a real
           pull request through checks-green and watches Studio merge it, since that needs a live
           code host. -->
- [ ] When approval is switched ON for that stage, the pull request waits for the named approver first;
      once approved, it still requires an explicit merge — approval covers the content, not the push to
      the default branch — and the sync indicator distinguishes "waiting for approval" from "approved,
      ready to merge."
      <!-- Built, not proven (2026-09-26). The approval-required branch of
           pollAndMergeOpenPullRequest reads real review state and refuses to merge without an
           APPROVED review; the two distinct sync-state kinds exist in shared/types.ts. No
           integration test drives an actual approve-then-merge sequence — same live-code-host
           limitation as the check above. -->
- [ ] When the default branch is not protected, saving commits and pushes directly, and the connection
      screen says which of the two is happening.
      <!-- Half proven (2026-09-26). The git mechanics are proven: approvalPath.test.ts's first
           test asserts result.outcome === 'pushed_directly'. Whether the connection screen actually
           says so in words is unverified — no test targets that rendering. -->
- [ ] Changes that arrived from elsewhere are listed with the person who made them, when, and where they
      came from, whether they were made in Studio, in Claude Code or directly on the code host.
      <!-- Genuine gap, confirmed (2026-09-26). pull() computes this correctly per file
           (describeArrival, sync.ts) and returns it as arrivedChanges. Nothing in src/components/
           consumes it — grepped, zero renderers — and nothing in the test suite asserts on it
           either. The data exists; the feature does not. -->
- [ ] Changes to sections the person did not edit are merged in without asking.
      <!-- Proven at the algorithm level, integration-untested (2026-09-26). 11 cases in
           test/sectionMerge.test.ts prove threeWayMerge's silent-merge behaviour directly. But
           pull() itself — the real orchestration against real git and real shape files — is only
           ever called once in the whole suite (approvalPath.test.ts's initial baseline sync), never
           to actually carry a remote change through to a local merge. -->
- [ ] A section changed both locally and remotely is a clash: both versions are shown side by side, and
      nothing is saved until the person chooses one, or accepts a combined version.
      <!-- Built, not proven (2026-09-26). ClashScreen.tsx renders local/remote panes with "Keep
           mine" / "Keep theirs" / "Let Claude combine", matching the wording exactly. No e2e test
           exists for this screen at all. -->
- [ ] Choosing a version never discards the other silently — the unchosen version is recoverable from
      the branch history, and the choice is recorded in the commit message.
      <!-- Half unbuilt (2026-09-26). "Recoverable from history" holds structurally — nothing here
           rewrites or force-pushes — but that is a passive property, not a feature; nothing helps a
           person actually retrieve it. "Recorded in the commit message" is NOT built: resolveClash()
           (sync.ts) rewrites only the local file and the ancestor hash. It never touches a commit.
           The eventual commit message is whatever gets typed during a later, unrelated save() —
           which section was resolved which way is never injected into it. -->
- [ ] A clash against a change that came from a merged spec warns that keeping the local version makes
      the document disagree with shipped code.
      <!-- Genuine, complete gap (2026-09-26). No provenance distinguishes "this remote change came
           from a merged spec" from any other change — arrival data carries only author and when.
           Unbuilt. -->
- [ ] Closing Studio with unsaved edits keeps them locally and offers them again on reopening; they are
      never pushed without the person saving.
      <!-- True by construction, untested (2026-09-26). Edits land straight in the real local file
           (spec 0010's model) — there is no separate draft buffer to lose, and nothing pushes
           without an explicit save() call. No test exercises the actual close-then-reopen round
           trip. -->
- [ ] Every failure — no network, no permission, a rejected push — leaves the local folder in a working
      state and says what to do next.
      <!-- Partially proven (2026-09-26). The two most dangerous failure modes are covered:
           approvalPath.test.ts's protected-branch test proves the shared branch does not move on a
           rejected push, and save() returns distinct, explicit error strings for unresolved clashes,
           a clash discovered mid-pull, and a rejected push (sync.ts). Not proven: a no-network
           scenario specifically — nothing in the suite kills connectivity mid-pull or mid-save. -->

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
