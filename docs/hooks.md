# Hook System

Hooks are PowerShell scripts that Claude Code executes at specific lifecycle events. They inject contextual reminders into Claude's system prompt without modifying any project state. The SDLC plugin ships two hooks: one that fires at session start and one that fires before every file edit.

---

## Table of Contents

1. [Hook System Overview](#1-hook-system-overview)
2. [sdlc-session-start.ps1 -- Session Initialization Hook](#2-sdlc-session-startps1--session-initialization-hook)
3. [sdlc-phase-inject.ps1 -- Phase Context Injection Hook](#3-sdlc-phase-injectps1--phase-context-injection-hook)
4. [Hook Configuration in plugin.json](#4-hook-configuration-in-pluginjson)
5. [Hook Design Principles](#5-hook-design-principles)
6. [Cross-References](#6-cross-references)

---

## 1. Hook System Overview

Hooks are PowerShell scripts registered in `plugin.json` under the `hooks` array. Claude Code invokes them at well-defined trigger points and captures their stdout. That output is injected into Claude's context as system-level reminders, visible to the model but not to the user.

Key properties:

- **Read-only.** Hooks inspect `.sdlc/state.yaml` and profile files but never write to them.
- **Stdout-driven.** Every `Write-Output` line becomes a system reminder in Claude's context window.
- **Gracefully degrading.** If `.sdlc/state.yaml` does not exist (the project has not been initialized with SDLC), both hooks exit silently with code 0.
- **Two hooks, two cadences.** `sdlc-session-start.ps1` fires once per session. `sdlc-phase-inject.ps1` fires on every file-editing tool invocation (Edit, Write, MultiEdit).

---

## 2. sdlc-session-start.ps1 -- Session Initialization Hook

**Source:** `hooks/sdlc-session-start.ps1`

### Trigger

Fires once when a new Claude Code session begins. The hook checks for `.sdlc/state.yaml` in the current working directory. If the file is absent, the hook exits 0 immediately -- no output, no error.

### What It Reads

| File | Purpose |
|------|---------|
| `.sdlc/state.yaml` | Extracts `current_phase`, `phase_name`, `profile_id`, `project_name` via regex |
| `.sdlc/artifacts/<NN>-<phase>/` | Counts all files recursively to report artifact progress |
| `.sdlc/artifacts/04-implementation/session-handoff.json` | Phase 4 only -- reads section progress, blockers, and next actions |

### State Parsing

The hook does not use a full YAML parser. It extracts values with four targeted regexes:

- `current_phase:\s*(\d+)` -- integer phase number (0-9)
- `phase_name:\s*"?([^"\r\n]+)"?` -- human-readable phase name
- `profile_id:\s*"?([^"\r\n]+)"?` -- active profile identifier
- `project_name:\s*"?([^"\r\n]+)"?` -- project display name

A built-in lookup table maps phase numbers to canonical display names (Discovery, Requirements, Design, Planning, Implementation, Quality, Testing, Documentation, Deployment, Monitoring). The regex-extracted `phase_name` is used only as a fallback when the number is not in the table.

### Artifact Counting

The hook constructs the artifact directory path as `.sdlc/artifacts/<NN>-<phaseName>` (zero-padded phase number, hyphen, phase name) and recursively counts all files with `Get-ChildItem -File -Recurse`. This count appears in the context banner so Claude knows how much work product exists for the current phase.

### Output Format

The hook emits two mandatory lines for every initialized project:

```
[SDLC] Project: My API Service | Profile: microsoft-enterprise | Phase 4: Implementation | Artifacts: 12
[SDLC] Commands: /sdlc (guidance) | /sdlc-status (dashboard) | /sdlc-gate (check) | /sdlc-next (advance)
```

The first line gives Claude situational awareness. The second reminds it which slash commands are available.

### Session Continuity (Phase 4 Special Handling)

When the current phase is 4 (Implementation), the hook looks for `session-handoff.json` inside `.sdlc/artifacts/04-implementation/`. This file is maintained by the SDLC workflow to track multi-session implementation progress across section plans.

If the file exists and is valid JSON, the hook reads:

- **sections[]** -- Each section has a `status` field: `complete`, `in_progress`, `blocked`, or `pending`.
- **session_number** -- Incremented each session for tracking.
- **context_for_next_session** -- Free-text summary left by the previous session.
- **next_actions[]** -- Array of objects with `action` and `section` fields.
- **blockers[]** -- Array of blocker objects with a `resolved` boolean.

The hook outputs up to four additional lines:

```
[SDLC] Session Handoff: 3/8 sections complete, 1 in progress, 0 blocked (session #5)
[SDLC] Context: Auth service tests passing, need to wire up API gateway next.
[SDLC] Next action: Implement API gateway routes (SECTION-004)
[SDLC] WARNING: 1 active blocker(s)
```

If `session-handoff.json` is malformed (invalid JSON), the hook emits a warning and skips handoff output rather than failing:

```
[SDLC] WARNING: session-handoff.json is malformed - skipping handoff summary
```

This design enables seamless multi-session implementation work. A developer can close Claude Code, reopen it hours later, and Claude will immediately know which section was last completed, what comes next, and whether any blockers exist.

---

## 3. sdlc-phase-inject.ps1 -- Phase Context Injection Hook

**Source:** `hooks/sdlc-phase-inject.ps1`

### Trigger

Fires on `PreToolUse` events. Claude Code calls this hook every time the model is about to invoke the **Edit**, **Write**, or **MultiEdit** tools. The hook receives two parameters:

| Parameter | Description |
|-----------|-------------|
| `$ToolName` | The tool being invoked (e.g., `Edit`, `Write`, `MultiEdit`) |
| `$FilePath` | The file path the tool will operate on |

If `$ToolName` is not in the allowed list (`Edit`, `Write`, `MultiEdit`), the hook exits 0 with no output. This means read-only operations like `Read` and `Grep` do not trigger context injection.

### What It Reads

| File | Purpose |
|------|---------|
| `.sdlc/state.yaml` | Extracts `current_phase` via regex |
| `.sdlc/profile.yaml` | Checks for convention flags (`immutability`, `no_console_log`) |

### Phase-Specific Reminders

The hook maintains a lookup table mapping each phase number to a targeted reminder:

| Phase | Reminder |
|-------|----------|
| 0 -- Discovery | Focus on understanding the problem, not writing code. |
| 1 -- Requirements | Ensure changes trace back to documented requirements. |
| 2 -- Design | Document architectural decisions as ADRs. |
| 3 -- Planning | Define section plans before implementing. |
| 4 -- Implementation | Follow section plans. Write tests first (TDD). |
| 5 -- Quality | Focus on review findings. No new features. |
| 6 -- Testing | Fill coverage gaps. Don't change architecture. |
| 7 -- Documentation | Sync docs with code. Finalize ADRs. |
| 8 -- Deployment | Prepare release. Document rollback plan. |
| 9 -- Monitoring | Configure alerts and dashboards. |

These reminders prevent phase drift during long sessions. If Claude is in Phase 5 (Quality) and starts writing new feature code, the reminder nudges it back to focusing on review findings.

### Convention Reminders from Profile

After emitting the phase reminder, the hook reads `.sdlc/profile.yaml` (the active profile copied into the project at init time) and checks for convention flags using regex:

- **`immutability: true`** triggers: `[Convention] Use immutable patterns (records, with-expressions, spread operators).`
- **`no_console_log: true`** triggers: `[Convention] No console.log in production code.`

These convention reminders fire on every file edit, reinforcing company coding standards without requiring the developer to manually remind Claude.

### Example Injection

When Claude is about to edit a file during Phase 4 with both convention flags active:

```
[SDLC Phase 4: Implementation] Follow section plans. Write tests first (TDD).
[Convention] Use immutable patterns (records, with-expressions, spread operators).
[Convention] No console.log in production code.
```

### Purpose

The phase-inject hook serves three goals:

1. **Prevents drift.** Long implementation sessions can wander from the current phase's objectives. The phase reminder anchors Claude to what matters right now.
2. **Enforces standards.** Convention reminders apply company-specific rules without relying on Claude's memory of earlier instructions.
3. **Zero user effort.** The developer does not need to repeat coding standards in every prompt. The hook does it automatically on every edit.

---

## 4. Hook Configuration in plugin.json

Hooks are registered in the top-level `hooks` array of `plugin.json`:

```json
{
  "hooks": [
    "hooks/sdlc-session-start.ps1",
    "hooks/sdlc-phase-inject.ps1"
  ]
}
```

**Path resolution:** Paths are relative to the plugin root directory. Claude Code resolves them against wherever the plugin is installed.

**Runtime requirements:**

- Windows: PowerShell 5.1+ is available natively.
- macOS/Linux: Requires PowerShell Core (`pwsh`) installed and on the PATH.

**Exit codes:**

- `0` -- Normal operation. Stdout (if any) is injected into Claude's context.
- Non-zero -- Hook failure. Claude Code may log a warning but continues operation. Hooks should avoid non-zero exits; use silent exit 0 when there is nothing to report.

---

## 5. Hook Design Principles

### Read-Only

Hooks MUST NOT modify `.sdlc/state.yaml`, artifact files, or any project files. They are observers, not actors. State transitions happen exclusively through the `/sdlc-next` and `/sdlc-gate` commands via the Python scripts.

### Lightweight

Both hooks must execute in sub-second time. They use regex-based YAML extraction instead of a full YAML parser to minimize overhead. Heavy operations (network calls, large file scans) are prohibited.

### Graceful Degradation

If `.sdlc/state.yaml` does not exist, both hooks exit 0 silently. If `session-handoff.json` is malformed, the session-start hook warns and continues. If `profile.yaml` is missing, the phase-inject hook skips convention reminders. No hook failure should block the user's workflow.

### Context Injection Model

Hook output goes into Claude's system context, not into the conversation. This means:

- The user does not see hook output directly in their chat.
- Claude sees it as background instructions, similar to `CLAUDE.md` content.
- Output should be terse and actionable -- every line costs context window tokens.

### Idempotent

Running a hook multiple times with the same state produces the same output. There are no side effects, no counters incremented, no files touched.

---

## 6. Cross-References

- **[Architecture](architecture.md)** -- How hooks fit into the plugin anatomy alongside commands, agents, and scripts.
- **[Profiles](profiles.md)** -- Convention flags (`immutability`, `no_console_log`) that the phase-inject hook reads and enforces.
- **[Gate System](gate-system.md)** -- The gate checks that control phase transitions (hooks report state, gates enforce it).
- **[Commands](commands.md)** -- The slash commands (`/sdlc`, `/sdlc-gate`, `/sdlc-next`) referenced in the session-start banner.
