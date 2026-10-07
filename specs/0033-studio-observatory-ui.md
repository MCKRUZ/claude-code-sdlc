---
spec: "0033"
name: "studio-observatory-ui"
status: draft            # draft | ready | in-flight | merged | deferred
deferred_reason: ""      # required when status is deferred — why this spec was not built
type: feature            # feature | bugfix — a bugfix PR carries the `type:bugfix` label and
                         # must pass repro-gate: its new test FAILS against the pre-fix code
risk: MEDIUM
source: "docs/proposals/studio-observatory.md (the Observatory overhaul: tokens and dark theme, UI kit, motion rule, command palette and shortcuts, focus model, the Spine / Constellation / Ambient scenes); absorbs F11 and the accessibility basics of docs/proposals/studio-improvements.md Batch 4"
channel: ""              # optional — delivery surface (see channels/); blank = channel-agnostic
owner: "@MCKRUZ"
developer: "@MCKRUZ"
checker: ""              # non-author approval — filled at hand-off
team: "core"
harness_context: "studio/src/ui/contract.ts (studio-observatory.md §3): every visual primitive is a kit component with a typed contract, the pinned class strings and attribute orders the existing tests read are spelled out literally in the kit (Button's `type` first, `bg-brand-600` on primary), and screens compose kit parts instead of carrying their own Tailwind strings. Scenes follow the same shape through studio/src/scenes/core/SceneShell.tsx: a lazy Canvas with a Table fallback that is the real content, never a decoration."
created: "2026-10-06"
sprint: ""               # optional — sprint id (e.g. S07); written by /sdlc-sprint slate, never by hand
next_owner: ""           # optional — who holds the next action; set by `handoff`, cleared by `ack`
eng_review: ""           # optional — pending | accepted | returned; Engineering verdict, recorded by name
data_review: ""          # optional — pending | accepted | returned | n-a (n-a needs a reason); Data verdict
depends_on: ""           # optional — comma-separated spec ids this spec builds on, e.g. "0007,0009"
---

# Spec 0033 — studio-observatory-ui

<!--
  The durable per-change record of the Build loop. One spec = one branch = one PR.
  No spec, no build. The agent re-reads this every session; the grader grades against it;
  when behavior changes later, this file changes in the same PR. A stale spec is a lie.

  This spec clears the Definition of Ready before anyone builds it. Validate with:
    uv run scripts/check_spec.py --spec specs/NNNN-short-kebab-name.md
-->

## Goal
SDLC Studio has one visual system — design tokens with a light and a dark theme, a typed UI kit every screen composes from, one motion rule, a command palette with a keyboard map, a focus model — and two 3D scenes (the Lifecycle Spine and the Dependency Constellation) that draw what the plugin already reports, each with a Table twin that is the real content when graphics are off.

## Why
Studio's screens grew one spec at a time, each carrying its own Tailwind strings (771 slate, 169 amber, 78 `bg-white` usages at the count), so there was no dark theme, no shared control vocabulary, no keyboard route through the app, and nothing a screen reader could use to tell a selected tab from an unselected one. A client lead opening the Board at a workshop saw a list; the sprint's shape — which specs block which, what the risk mix is — lived only in the plugin's text. The Observatory gives every screen the same parts, lets a person pick light or dark and turn animation off, puts every destination two keystrokes away, and shows the lifecycle and the dependency graph as pictures drawn strictly from the plugin's own output, so the picture can never say more than the data does.

## Scope

### In scope
- `studio/src/theme/**` (tokens, dark remap, density, `ThemeProvider`), `studio/src/ui/**` (the kit and its `contract.ts`), `studio/src/motion/**` (the one motion rule, `useStudioGSAP`, choreographies, `useCountUp`), `studio/src/palette/**` and `studio/src/shortcuts/**` (command palette, `SHORTCUT_MAP`, the Shortcuts help), `studio/src/stores/**` (console, spine, backlog, flip, dirty), `studio/src/scenes/**` (scene core with `SceneShell` / `SceneSlot` / registry, `spine`, `constellation`, `ambient`).
- Every screen under `studio/src/components/**` moved onto the kit and tokens, including `DocumentsTab.tsx` (the last byte-pinned file) and `Frame.tsx` owning the console dock's height and close animation; `App.tsx` lazy-loading the heavy screens.
- `studio/index.html` gaining only `<div id="overlays"></div>` after `#root`; `studio/vite.config.ts` renderer chunking (`scene-core`, per-scene chunks); `studio/package.json` devDependencies already present (three, R3F, gsap, lucide, fontsource).
- Tests: `studio/test/**` — the new suites (`tokens`, `motion`, `sceneShell`, `constellationModel`, `spineModel`, `palette`, `appearance`, `dirtyStore`, `registerAll`, `bundleSize`), the DocumentsTab behaviour suite replacing the byte-equality test, the `a11y` and `constellation` real-window specs, and `board.spec`'s selected-state checks moved from class names to `aria-pressed`.
- `studio/README.md` (Appearance, shortcuts, scenes, bundle facts), `CHANGELOG.md`, `docs/proposals/studio-improvements.md` (F11 and accessibility marked absorbed), this spec.

### Out of scope
- `studio/shared/**` and `studio/electron/**`: no IPC change, no `webPreferences` or `appendSwitch`, and the Content-Security-Policy line in `index.html` is byte-identical. Any renderer file that needs a new `window.studio.*` call is **stop and ask** (`test/noNewIpcInRenderer.test.ts` fails the build otherwise).
- `studio/src/components/MarkdownView.tsx` and `ChatResizeHandle.tsx` (markup and classes are pinned by their own tests), the `WorkflowTab.tsx` root layout strings, the `Sidebar` and `ChatPanel` aside classes.
- Any status Studio would compute for itself: the Spine draws the sign-off state `stage_readiness.py` reports, the Constellation draws `depends_on` and `risk` from spec frontmatter, and a value the plugin reports as null is rendered as "no data", never a zero. No per-person totals anywhere.
- The Electron-side theme preload and window `backgroundColor` (Wave E of the design): a separate, security-gated PR because it edits `studio/electron/**`.
- Fonts or icons fetched over the network; a new window, dialog, or native menu item.

## Acceptance Checks
- [ ] `studio/test/tokens.test.ts` passes: every token named in `studio/src/theme/tokens.d.ts` resolves in both `[data-theme="light"]` and `[data-theme="dark"]`, the dark remap keeps `bg-slate-900` text usages readable (contrast ≥ 4.5:1 for ink-1 on surface-1 in both themes), and `localStorage['studio.theme']` round-trips `system | light | dark`.
- [ ] `studio/test/motion/motion.test.ts` passes: with `prefers-reduced-motion: reduce` and preference `auto`, `motion.enabled()` is false and every choreography resolves synchronously to its end state; preference `on` overrides the OS setting; preference `off` disables motion regardless; in `MODE=test` no GSAP tween is created.
- [ ] `studio/test/scenes/sceneShell.test.tsx` passes: `SceneShell` renders the Table twin (not a Canvas) when WebGL is unavailable, when the viewport is under 400 px, after a Canvas crash, and in `MODE=test`; the Graph / Table toggle is two `aria-pressed` buttons and `data-surface` reports which twin is showing.
- [ ] `studio/test/scenes/constellationModel.test.ts` passes: a node's radius depends on `risk` only (HIGH > MEDIUM > LOW, equal for equal tiers whatever the prose length), a `depends_on` id with no matching spec becomes a ghost node drawn from the id alone, and an unmerged dependency outside the slate carries the warn tone.
- [ ] `studio/test/palette/palette.test.tsx` passes: ⌘K (Ctrl+K elsewhere) opens the palette from any screen including inside an input, `/` opens it outside inputs, results rank an exact title match above a fuzzy one, Enter runs the highlighted action and Escape closes with focus returned to the element that had it; every `SHORTCUT_MAP` entry appears in the Shortcuts help with its platform keys.
- [ ] `studio/test/e2e/a11y.spec.ts` passes in the real window: a skip link is the first focusable element and moves focus to `main#main`; exactly two `<aside>` elements in sidebar-then-chat order; the sidebar reports `role="progressbar"` and offers "Search" and "Appearance" buttons; the console toggle's Plain / Technical segment reports `aria-pressed`; `vitest-axe` reports no serious or critical violation on the stage home.
- [ ] `studio/test/e2e/constellation.spec.ts` passes: on the Sprint screen the Graph / Table toggle sits outside `[data-testid=sprint-board]`, choosing Graph yields either a `<canvas>` or the notice "Graphics are not available in this window." and never a page error, and choosing Table shows the slate rows again with every `sprint-*` test id unchanged.
- [ ] `studio/test/bundleSize.test.ts` passes on `vite build --mode=test`: exactly one `dist/assets/index-*.js` under 800 KB, a `scene-core-*.js` chunk present, and the string `WebGLRenderer` absent from the main chunk; the measured numbers are recorded in `studio/README.md`.
- [ ] `studio/test/documentsTab.test.ts` is a behaviour suite (no byte comparison): rows carry `data-tone` of `neutral | warn | ok`, a document with findings shows "N to fill" in an amber / warn chip, "Not started" and "Complete" labels hold, folder and non-existent rows are disabled, a finding button's accessible name starts with the field, keeps focus on click and calls `onOpenDocument(path, { section, field })`, the sign-off checkboxes are labelled with the question, and the readiness banner reads "N document(s) still need work before this stage can be signed off." or "Every required document is present and complete."; `studio/test/e2e/documents.spec.ts` still finds `heading "Documents"` and `button /^requirements\.md/`.
- [ ] `studio/test/e2e/board.spec.ts` asserts the selected role view and the selected risk tier with `aria-pressed="true"` instead of the classes `bg-brand-600` / `bg-slate-900`; every other assertion in the file is unchanged.
- [ ] Settings › Appearance offers Theme (System / Light / Dark), Density (Comfortable / Compact), Animations (Auto / On / Off, with the note that On is an opt-in over the OS setting) and Visuals default (Graph / Table); each writes its `localStorage['studio.*']` key and takes effect without a reload (`studio/test/appearance.test.tsx`).
- [ ] `studio/test/noNewIpcInRenderer.test.ts` passes: no file under `studio/src/{ui,motion,palette,scenes,theme,shortcuts,stores}` references `window.studio`.
- [ ] `npm run typecheck` exits 0 with no errors, `STUDIO_SKIP_LIVE_MODEL=1 npx vitest run` passes with every pre-existing pinned test (studio-observatory.md §8.3) green, and `npm run test:e2e` passes with `STUDIO_SKIP_LIVE_MODEL=1`; the file and pass counts are recorded in `CHANGELOG.md`.

## Risk Tier
**Tier:** MEDIUM
**Why this tier:** this is a renderer-only change inside existing patterns (no IPC, no `electron/**`, no CSP change, no plugin script touched), which alone would read LOW; it is MEDIUM because it rewrites every screen a person uses at once, replaces a deliberate guard (the DocumentsTab byte-equality test) with a behaviour suite, and adds WebGL scenes whose failure modes (no GPU, context loss, a 400 px window) must degrade to the Table twin rather than a blank screen. Nothing here is hard to undo and nothing touches client data. The Pod Lead may raise it.

## Delegation Plan
- **Scope (file patterns):** `studio/src/**` except `MarkdownView.tsx` and `ChatResizeHandle.tsx`; `studio/test/**`; `studio/index.html` (one `<div id="overlays">` line); `studio/vite.config.ts`; `studio/README.md`; `CHANGELOG.md`; `docs/proposals/studio-improvements.md`; `docs/proposals/studio-observatory.md` §9 (measured numbers only); this spec. Everything else is out, and `studio/shared/**` and `studio/electron/**` are refused outright.
- **Context (pattern to reuse):** `studio/src/ui/contract.ts` and `studio/src/scenes/core/SceneShell.tsx` — typed kit contracts with the pinned strings spelled out literally; scenes as a lazy Canvas over a Table twin that is the real content (matches `harness_context`).
- **Permissions:** auto-allowed: reads, `npm run typecheck`, `npx vitest run`, `vite build --mode=test`, `npx playwright test`, `uv run` of plugin scripts for fixtures. Confirm-required: any `npm install`, any edit outside the scope list, any new `window.studio.*` call.
- **Gated paths touched:** none.

## Checking Plan
**Ladder depth:** MEDIUM
**Specifics:** CI runs the Studio suites (typecheck, vitest, Playwright real window, bundle budget) and the plugin suite; the grader grades against the Acceptance Checks above; a non-author Checker walks the §8.5 manual list — both themes on every screen, macOS Reduce Motion, a keyboard-only tour (palette, tabs, segmented controls, dialog, back), a 400 px window, and one `xvfb-run` pass for the WebGL-absent path — and confirms the sign-off ceremony's end state equals a cold reload.

## Decision List
- **Dark mode ships now, not in a later spec.** The ramp remap makes dark a function of the tokens rather than a second set of classes, so deferring it would only mean re-sweeping every screen later. Owner: @MCKRUZ. Answer: now.
- **The DocumentsTab byte-equality test is replaced by a named behaviour suite, written before the component changed.** The byte test was spec 0017's proof and froze the component out of the kit; the behaviour suite pins what the documents e2e and a person rely on. Owner: @MCKRUZ. Answer: rewrite, pins first.
- **The Ambient field stays, gated.** It renders only when `AMBIENT_ENABLED && motion.enabled() && canUseWebGL()`, never in `MODE=test`, and never on a project screen. Owner: @MCKRUZ. Answer: keep.
- **Animations offer an explicit On that overrides the OS reduced-motion setting.** Auto honours the OS; a person who wants motion despite it can say so, per person, in Settings. Owner: @MCKRUZ. Answer: offer the override.
- **The e2e selected-state pins move from class names to `aria-pressed`.** The kit emits the classes still, but the attribute is the semantic the tests mean. Owner: @MCKRUZ. Answer: migrate.
- **Wave E (Electron preload theme colour) is deferred to its own security-gated PR.** It edits `studio/electron/**`, which this spec refuses. Owner: @MCKRUZ. Answer: defer.
