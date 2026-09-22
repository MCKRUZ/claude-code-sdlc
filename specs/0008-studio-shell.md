---
spec: "0008"
name: "studio-shell"
status: draft
type: feature
risk: MEDIUM
source: "SDLC Studio canvas — screens 1, 14, 17"
channel: "ag-ui"
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
- [ ] The header shows the project name, the playbook it was created from, and the current stage.
- [ ] Stage navigation lists every stage with its state — signed off, current, or later — and the
      current stage is the one the project's own state file reports.
- [ ] The chat panel is present on every screen, and states which part of the project it can see.
- [ ] Every command Studio runs appears in the console with its exact command line, its output and how
      long it took. Nothing runs that does not appear there.
- [ ] The console has a plain view that says what happened in a sentence, and a technical view with the
      raw command and output. No command is hidden from either.
- [ ] A command that fails shows its error in the console and a plain-language explanation on screen,
      and leaves the project unchanged.
- [ ] Setting up a new project runs the plugin's own setup and shows exactly what it will create before
      it creates anything.
- [ ] Nothing outside the project folder is read or written, except the list of recent projects.
- [ ] The application runs on Windows and macOS from the same source.

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
