# Tōgō — before and after, for Matt

Written 2026-10-06 on `feat/togo-overhaul` (the Command Center committed at 98e257a, the cockpit round on top). Paths are relative to the repository root; `studio/` is the Electron app, `scripts/` the plugin. Everything below was measured on this checkout; nothing is quoted from a plan.

## What the app was at 04d611d (2026-10-05)

"SDLC Studio": a desktop **shell over the plugin's scripts**. A left **sidebar** listed the nine stages and the Build views; the stage area showed a stage home (Workflow · Documents · Guide tabs), a document editor with Keep / Discard drafts, a Build **Board** that read `spec_status.py --all`, a spec page, a Sprint table that rendered `sprint.py status --json` read-only, Settings, the Console and the chat. Every screen was a *view of one script's output*; sprint work (slating, hand-offs, verdicts, planning, closing) still happened on the command line. 70 renderer source files, 150 test files, no UI primitive library, README sections: Quick Start · Scripts · Structure · Security · Status.

## What it is now

A **command center** organised around the Build loop (`docs/proposals/togo-command-center.md`):

- **Shell.** The sidebar is gone. A top band (mark + project name · the **omnibar** trigger "⌘K · a spec id, a verb, or a place" · needs-you chip · sync chip · Console · Appearance · Settings · `…`) and an SVG **lifecycle strip** of the nine stations (the Build station reads "Build Loop · S07 · 7th sprint") replace it. Two homes, chosen once per open by `homeFor()`: a Build-loop project lands on the **sprint home**, everything else on the **lifecycle home**.
- **The sprint home is a cockpit.** Four lanes — Ready · Building · Checking · Merged — in ONE row with Today as a 300 px right rail, sized to the window so every lane is visible without scrolling at 1440×900 (cards scroll inside a lane; the window never scrolls — only `<main>` does). The business-day bar spans the header; a mix short of target is an amber "measured gap" chip, not an error. The chat starts collapsed to a 40 px rail here and on planning (band toggle, `…`, ⌘\ reopen it). Below the fold: In the room, Refining (next sprint's candidates with the checker's DoR gaps), How it is going, and the dependency constellation with its Table twin.
- **Verbs.** ⌘K takes plain words — `verdict 0002 accepted`, `hand 0006 to Sam`, `defer 0003 to S08 because …`, `decide DL-02 …`, `close S07` — and previews the exact `sprint.py` argv before one Confirm. Lane keys: `j`/`k`/`↵`/`h`/`v`.
- **Planning** (`g p`): refined backlog · the slate in the plugin's build order with Builder/Checker pickers (every row names its id and spec) · what the plugin says · its proposal · one Commit that runs `slate → ready → plan → report` and stops at the first non-zero exit.
- **The spec card**, opened in place: Definition of Ready verbatim, the checking ladder coloured only by the code host, the findings ledger, and a Hand off foot disabled in `handoff.py --check`'s own words.
- **Close and steering.** A close screen (outcomes · kept · each open spec carried or dropped with a reason). **Steering mode** (`g t`): the standard's numbers on 56 px tiles, paged so no tile straddles the fold, read-only, no chat, no console, zero write controls.
- **Plugin, additively:** `sprint.py list|log|carry|edit`, `spec_transition.py confirm-tier|assign`, `handoff.py --check`, `spec_readiness.py --all` + `ladder[]`, `record_findings.py report --json findings[]`, `spec_status.py` row + `deferred_reason`, ten `capabilities.py` entries — every existing verb's text and exit codes byte-identical.
- **Kit:** Radix primitives under Dialog · Tooltip · HoverCard · Tabs · the `…` menu, `cmdk` under the palette; one Escape-owner list; 32 choreography rows that quieten with familiarity and whose end state equals a cold reload.

## The honesty rules kept (each one is a test)

1. **The plugin is the only truth.** The renderer never spawns, never joins across sources, never derives a status. Main assembles one `CommandCenter` read model with per-block provenance (`source`, `fetchedAt`, `ok`, `data`); `noNewIpcInRenderer.test` fails if `ui/ motion/ palette/ scenes/ theme/ shortcuts/ stores/` ever reach `window.studio`.
2. **Writes go through a closed argv table** (`shared/sprintVerbArgv.ts`) with the signed-in person as `--by` from `electron/main/actor.ts`; no actor → the write refuses before spawning. Exit 0 / 1 / 2 read **Done** / **Not done** / **Refused by the plugin**, stdout/stderr verbatim. Screens re-read only after an exit 0 (`cockpit.spec`: a lane changes only when the plugin's fresh read says so).
3. **"no data" is never a fabricated zero** — a count of zero recorded events reads "none recorded in this window", the plugin's own words (`reasonsSweep.test`, `steering.spec`).
4. **No activity metrics, no per-person totals.** Velocity, points, PR counts, lines, hours appear nowhere but `reasons.ts`; In the room draws dots, never digits.
5. **A disabled control always carries its reason** as tooltip and `aria-describedby` — a `reasons.ts` sentence or the plugin's own (`reasonsSweep.test`; the spec card's Hand off quotes `handoff.py`).
6. **Protected core untouched** — `check_spec.py`, `check_gates.py`, `scorecard.py`, `generate_status.py`, `phase_model.py`, `new_spec.py`, `advance_phase.py`, `harness/**`, `phase-registry.yaml`, `state-init.yaml`, `section-evaluator`, `/sdlc-coach`, `/sdlc-spec`: `git status --porcelain` on the list prints nothing.
7. **CSP unchanged**, main chunk ≤ 800 KB, motion off under test / reduced motion, every canvas keeps a DOM twin, the root never scrolls (`rootNeverScrolls.test`, `overlap.spec`).
8. **Pinned tests stay green or change with evidence** — every moved pin is recorded in the plan's §8 with the screenshot that justified it.

## The suites, this checkout

| Suite | Result |
|---|---|
| `npm run typecheck` | clean |
| vitest (`STUDIO_SKIP_LIVE_MODEL=1 npx vitest run`) | 300 files · 3351 passed · 7 skipped |
| pytest (`uv run --project scripts python -m pytest scripts/tests -q`) | 3622 passed · 19 skipped · protected list clean |
| Playwright (`npm run pretest && npx playwright test`) | 173 passed · 3 skipped (176, one worker) |
| Capture `observatory-v20` (1280×800 · 1440×900 · 1680×1000, light + dark) | 59 shots · 0 GPU console lines (24 warnings, all `THREE.Clock` deprecation) · overlap probe: every shot clean, exit 0 |
| Ghost probe (band above the sprint header at 1.2 / 1.6 / 2.0 / 2.5 s) | 0 deviating rows at every time, worst 1/255 |
| Bundle (`--mode=test` main chunk) | 772.7 kB in Vite's report (754.6 KiB) · production 773.3 kB (755.2 KiB, gzip 234.2 kB) · budget 800 |

## Screenshots to look at (`studio/test/screenshots/observatory-v20-*.png`)

The cockpit at three widths, light and dark: `sprint-home@1280`, `sprint-home@1440`, `sprint-home@1680` (+ `-dark@…`) — four lanes in one row, Today a rail, wells and rail ending on one line above the fold, chat as a rail. `planning@1440` / `planning-dark@1440` — the slate names every row. `spec-card@1440` — the Hand off foot with no sliver under it. `lifecycle-home@1440`. Then the walk: `sprint-home`, `sprint-home-dark`, `omnibar`, `planning`, `spec-card`, `lifecycle-home`, `review`, `review-dark`, `closing`, `closing-dark` (the shell un-offset), `steering`, `steering-light`, `board-list`, `board-graph` (plates under bodies), `sprint-graph`, `sprint-table`, `spec-view`, `stage-light`, `stage-dark-hover`, `palette`, `settings`, `welcome`, `welcome-dark`. The guide `docs/guide/togo-user-guide.html` is built from this series.

## What I still see in v17 (honest list)

Every v17 shot was opened. Steering mode is one board now — Outcomes, Delivery and the actions on
the first screen at 1440×900 with nothing under the fold (the two-page version had left room under
Outcomes and hidden half the standard behind a scroll). One leftover remains:

1. **Console**: `THREE.Clock: This module has been deprecated` warnings come from
   react-three-fiber 9.8.1's own `new THREE.Clock()`, not from Tōgō's code; the capture reports
   0 GPU-related lines. Clears when R3F moves to `THREE.Timer`.
