# Hook System

The SDLC plugin ships **one hook**: a session-start script that injects the project's SDLC
context (phase, artifacts, session handoff) into Claude's context at the start of every
session. It reads project state and never modifies it.

> An earlier revision of the plugin also shipped a per-edit `sdlc-phase-inject.ps1` hook
> (phase reminders on every Edit/Write). It was retired; phase guidance now lives in the
> commands and the appended CLAUDE.md SDLC section. If you find references to it elsewhere,
> they are stale.

---

## Table of Contents

1. [Hook System Overview](#1-hook-system-overview)
2. [sdlc-session-start — Session Initialization Hook](#2-sdlc-session-start--session-initialization-hook)
3. [Hook Registration in hooks/hooks.json](#3-hook-registration-in-hookshooksjson)
4. [Hook Design Principles](#4-hook-design-principles)
5. [Cross-References](#5-cross-references)

---

## 1. Hook System Overview

Hooks are scripts Claude Code executes at lifecycle events, with their stdout injected into
Claude's context as system-level reminders — visible to the model, not shown in the user's
chat. The plugin's hook fires on the `SessionStart` event.

Key properties:

- **Read-only.** The hook inspects `.sdlc/state.yaml` and related files but never writes.
- **Stdout-driven.** Every output line becomes a context reminder.
- **Gracefully degrading.** If `.sdlc/state.yaml` does not exist (SDLC not initialized),
  the hook exits silently with code 0.
- **Two implementations, one contract.** `sdlc-session-start.ps1` (PowerShell) and
  `sdlc-session-start.sh` (bash) produce the same output; registration tries `pwsh` first
  and falls back to `bash`, so hosts with either runtime work out of the box.

---

## 2. sdlc-session-start — Session Initialization Hook

**Source:** `hooks/sdlc-session-start.ps1` and `hooks/sdlc-session-start.sh` (twins).

### Trigger

Fires once when a new Claude Code session begins. The hook checks for `.sdlc/state.yaml`
in the current working directory. If the file is absent, the hook exits 0 immediately —
no output, no error.

### What It Reads

| File | Purpose |
|------|---------|
| `.sdlc/state.yaml` | Extracts `current_phase`, `phase_name`, `profile_id`, `project_name` via regex |
| `.sdlc/artifacts/<slug>/` | Counts all files recursively to report artifact progress (dir is the phase slug; `build` and `close` are non-numeric) |
| `.sdlc/artifacts/build/session-handoff.json` | Build Loop only — reads section/spec progress, blockers, and next actions |

### State Parsing

The hook does not use a full YAML parser. It extracts values with four targeted regexes:

- `current_phase:\s*"?([^"\r\n]+)"?` — phase id (0,1,2,3,build,7,8,9,close; may be non-numeric)
- `phase_name:\s*"?([^"\r\n]+)"?` — human-readable phase name
- `profile_id:\s*"?([^"\r\n]+)"?` — active profile identifier
- `project_name:\s*"?([^"\r\n]+)"?` — project display name

A built-in lookup table maps phase ids to canonical display names (Discovery, Requirements,
Design, Foundation, Build Loop, Documentation, Deployment, Monitoring, Close & Transfer).
The regex-extracted `phase_name` is used only as a fallback when the id is not in the table.

### Artifact Counting

The hook constructs the path from the phase's slug (e.g. `00-discovery`, `03-foundation`,
`build`, `close`) — not by zero-padding an int, since `build` and `close` are non-numeric —
and recursively counts all files. This count appears in the context banner so Claude knows
how much work product exists for the current phase.

### Output Format

The hook emits two mandatory lines for every initialized project:

```
[SDLC] Project: My API Service | Profile: microsoft-enterprise | Phase: Build Loop | Artifacts: 12
[SDLC] Commands: /sdlc (guidance) | /sdlc-status (dashboard) | /sdlc-gate (check) | /sdlc-next (advance)
```

The first line gives Claude situational awareness. The second reminds it which slash
commands are available.

### Session Continuity (Build Loop Special Handling)

When the current phase is the Build Loop, the hook looks for `session-handoff.json` inside
`.sdlc/artifacts/build/`. This file is maintained by the SDLC workflow to track
multi-session implementation progress across section plans.

If the file exists and is valid JSON, the hook reads:

- **sections[]** — Each section has a `status` field: `complete`, `in_progress`, `blocked`, or `pending`.
- **session_number** — Incremented each session for tracking.
- **context_for_next_session** — Free-text summary left by the previous session.
- **next_actions[]** — Array of objects with `action` and `section` fields.
- **blockers[]** — Array of blocker objects with a `resolved` boolean.

The hook outputs up to four additional lines:

```
[SDLC] Session Handoff: 3/8 sections complete, 1 in progress, 0 blocked (session #5)
[SDLC] Context: Auth service tests passing, need to wire up API gateway next.
[SDLC] Next action: Implement API gateway routes (SECTION-004)
[SDLC] WARNING: 1 active blocker(s)
```

If `session-handoff.json` is malformed (invalid JSON), the hook emits a warning and skips
handoff output rather than failing:

```
[SDLC] WARNING: session-handoff.json is malformed - skipping handoff summary
```

This design enables seamless multi-session build work. A developer can close Claude Code,
reopen it hours later, and Claude will immediately know which section was last completed,
what comes next, and whether any blockers exist.

The bash twin needs `jq` for the handoff summary (it falls back to python if `jq` is
absent); everything else is plain POSIX tooling.

---

## 3. Hook Registration in hooks/hooks.json

Registration lives in `hooks/hooks.json` (NOT in `plugin.json` — Claude Code discovers this
file by convention):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "pwsh -NoProfile -ExecutionPolicy Bypass -File \"${CLAUDE_PLUGIN_ROOT}/hooks/sdlc-session-start.ps1\" || bash \"${CLAUDE_PLUGIN_ROOT}/hooks/sdlc-session-start.sh\"",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

**Path resolution:** `${CLAUDE_PLUGIN_ROOT}` is the environment variable Claude Code sets
to the plugin's install directory.

**Runtime requirements:** PowerShell 7 (`pwsh`) *or* bash — the single-string command runs
through a shell, so if `pwsh` is missing the `||` fallback runs the bash twin. A host with
neither (rare) gets a hook error that Claude Code logs and continues past.

**Exit codes:**

- `0` — Normal operation. Stdout (if any) is injected into Claude's context.
- Non-zero — Hook failure. Claude Code may log a warning but continues operation. The
  hook prefers silent exit 0 when there is nothing to report.

---

## 4. Hook Design Principles

### Read-Only

The hook MUST NOT modify `.sdlc/state.yaml`, artifact files, or any project files. It is
an observer, not an actor. State transitions happen exclusively through the `/sdlc-next`
and `/sdlc-gate` commands via the Python scripts.

### Lightweight

The hook must execute in sub-second time. It uses regex-based YAML extraction instead of a
full YAML parser to minimize overhead. Heavy operations (network calls, large file scans)
are prohibited.

### Graceful Degradation

If `.sdlc/state.yaml` does not exist, the hook exits 0 silently. If `session-handoff.json`
is malformed, it warns and continues. No hook failure should block the user's workflow.

### Context Injection Model

Hook output goes into Claude's system context, not into the conversation. This means:

- The user does not see hook output directly in their chat.
- Claude sees it as background instructions, similar to `CLAUDE.md` content.
- Output should be terse and actionable — every line costs context window tokens.

### Idempotent

Running the hook multiple times with the same state produces the same output. There are no
side effects, no counters incremented, no files touched.

---

## 5. Cross-References

- **[Architecture](architecture.md)** — How the hook fits into the plugin anatomy alongside commands, agents, and scripts.
- **[Profiles](profiles.md)** — The profile the session banner reports.
- **[Gate System](gate-system.md)** — The gate checks that control phase transitions (the hook reports state, gates enforce it).
- **[Commands](commands.md)** — The slash commands (`/sdlc`, `/sdlc-gate`, `/sdlc-next`) referenced in the session-start banner.
