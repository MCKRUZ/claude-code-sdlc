---
spec: "0008"
name: "studio-shell"
status: draft
type: feature
risk: MEDIUM
source: "SDLC Studio canvas — screens 1, 14, 17"
channel: "ag-ui"
owner: "@MCKRUZ"
developer: ""
checker: ""
team: "core"
harness_context: "the plugin's own scripts as the only way Studio reads or changes project state — never a second implementation"
created: "2026-09-19"
---

# Spec 0008 — The Studio desktop application shell

## Goal

A desktop application that opens an existing project folder, shows the project's stage, and gives every
screen the same frame: stage navigation, a chat panel beside the work, and a console showing what
Claude ran.

## Why

Everything else in Studio hangs off this frame, and the frame is where the product's promise lives: a
person always knows which stage they are in, what changed, and what is being run on their behalf. It is
a desktop application because the project is a folder on disk and the plugin's scripts and Claude Code
already run there — so Studio can call them directly, with the person's own permissions, and no server
is needed.

## Scope

### In scope
- Opening a project by choosing its folder, and remembering recently opened projects
- Reading the project's state through the plugin's own scripts
- The frame: header, stage navigation, the chat panel, the console button and panel
- The console: every command Studio runs, with its output, in plain and technical views
- Setting up a new project, by running the plugin's setup with a chosen playbook
- The design tokens — colours, type, spacing — as one theme used by every later screen

### Out of scope
- Documents, specs, settings and the board. Those are specs 0009 to 0014.
- Any reimplementation of plugin logic. Studio calls the scripts; if something is missing, it becomes
  a plugin spec rather than app code.
- Writing to the repository. That is spec 0009.

## Acceptance Checks

- [ ] Choosing a folder that contains a project opens it; choosing one that does not offers to set a
      project up there instead.
      <!-- Split (2026-09-26). "Opens it" is proven: test/e2e/documents.spec.ts's "opens the project
           from the welcome screen" drives a real open through the real window. "Offers to set up" —
           hasSdlcProject()/previewSetup() (electron/main/project.ts) and SetupFlow.tsx — is built,
           but nothing anywhere in the suite touches it. -->
- [ ] The header shows the project name, the playbook it was created from, and the current stage.
      <!-- Built, not proven (2026-09-26). No test references Header.tsx anywhere. -->
- [ ] Stage navigation lists every stage with its state — signed off, current, or later — and the
      current stage is the one the project's own state file reports.
      <!-- Built, not proven (2026-09-26). No test references the stage-nav component anywhere. -->
- [ ] The chat panel is present on every screen, and states which part of the project it can see.
      <!-- Built, not proven, and worth reading carefully (2026-09-26). The literal wording holds
           structurally: Frame.tsx renders ChatPanel unconditionally and wraps every project-area
           screen, and ChatPanel's own text states what it can see ("Can see: <project>,
           <stage>"). No test asserts either half. Separately: ChatPanel's own comment says the
           actual conversation isn't wired up yet — this check is honestly about presence and
           labelling, not a working chat, and it reads that way, but it's easy to mistake "ticked"
           for "the chat works" later if this isn't kept in mind. -->
- [ ] Every command Studio runs appears in the console with its exact command line, its output and how
      long it took. Nothing runs that does not appear there.
      <!-- GENUINE, CONFIRMED GAP, not just untested (2026-09-26). commandRunner.ts's runCommand()
           is a real, single logging choke point and everything routed through it is captured
           correctly. But electron/main/tooling.ts calls execFile/execFileAsync directly for every
           startup tool-detection command (claude --version, uv --version, git --version, gh
           --version) — those run and never reach the console log at all. The check's own words
           ("nothing runs that does not appear there") are violated today, provably, every time
           Studio starts up. -->
- [ ] The console has a plain view that says what happened in a sentence, and a technical view with the
      raw command and output. No command is hidden from either.
      <!-- Built, not proven (2026-09-26). No test references the console component anywhere. -->
- [ ] A command that fails shows its error in the console and a plain-language explanation on screen,
      and leaves the project unchanged.
      <!-- Built, not proven (2026-09-26). runCommand() returns a failed ConsoleEntry rather than
           throwing or partially applying, which supports "leaves the project unchanged" by design —
           but nothing tests either half, including the on-screen explanation. -->
- [ ] Setting up a new project runs the plugin's own setup and shows exactly what it will create before
      it creates anything.
      <!-- Built, not proven (2026-09-26). runSetup()/previewSetup() (project.ts) call the plugin's
           real init_project.py — no reimplementation found — but no test drives the
           preview-before-create flow. -->
- [ ] Nothing outside the project folder is read or written, except the list of recent projects.
      <!-- Half proven, half a genuine wording mismatch (2026-09-26). Containment for anything
           inside the project is solidly proven — test/projectPaths.test.ts refuses path traversal
           and a real symlink escape. But Settings (shared/types.ts) also stores five tool-path
           overrides and all of spec 0009's per-project sync bookkeeping in Electron's own userData,
           outside any project folder — a deliberate, necessary choice (sync state is explicitly kept
           out of the repository), not a bug. The named exception in this check ("except the list of
           recent projects") is narrower than what is actually and correctly stored outside the
           project folder today — the wording needs revising to match the real, intentional design,
           not the design changing to match the wording. -->
- [ ] The application runs on Windows and macOS from the same source.
      <!-- Genuine gap, and a sharp one (2026-09-26). The code is genuinely cross-platform-aware —
           real process.platform branches for win32/darwin in index.ts, project.ts and tooling.ts —
           but .github/workflows/studio.yml runs both Studio CI jobs on ubuntu-latest only. Neither
           platform this check actually names is ever built or tested in CI — including Windows,
           despite the win32-specific code and despite Windows being where Studio is actually being
           built and used today. -->

## Risk Tier

**Tier:** MEDIUM
**Why this tier:** new software, but it only runs the plugin's own scripts against a local folder. No
personal data, no deployment, no auth of its own — that arrives with spec 0009.

## Delegation Plan
- **Scope (file patterns):** the Studio application repository only
- **Context (pattern to reuse):** the plugin's scripts as the single source of truth for project state,
  called the same way a person would call them
- **Permissions:** build, test and read auto-allowed. Adding any dependency needs confirmation.
  No network calls in this spec
- **Gated paths touched:** none

## Checking Plan

**Ladder depth:** MEDIUM
**Specifics:** grader plus a non-author approval. The reviewer should confirm that no project state is
computed in app code that a plugin script already computes.

## Decision List
- **What is the application built with?** Electron with TypeScript and React — the widest desktop
  support and the easiest path to embedding a terminal view for the console. Owner: Matt; answered
  2026-09-22.
- **Where does Studio find Claude Code and the script runner on a person's machine?** Written here as:
  detect them, and if either is missing, say so with a link rather than installing anything. Owner: Matt.
