# Studio Observatory — master design for the SDLC Studio UI and interaction overhaul

> **Name:** on 2026-10-05 the product (plugin + desktop app) was named **Tōgō** (TOH-goh, 統合 — integration). "Studio" below is the desktop app now shipped as Tōgō; file paths (`studio/`) and the `window.studio` bridge keep their names. Brand: `docs/brand/togo/`.

Status: design, synthesised from three judged concepts (Orrery / spatial, Meridian / motion, Plumb / system) and two judge panels. No code is written by this document.
Studio root `S` = `studio/` inside the nested repo `claude-code-sdlc/`. Renderer paths are relative to `S` unless absolute.
Sources: `scratchpad/inventory-{renderer,constraints,data}.md`, `scratchpad/concept-{spatial,motion,system}.md`, both judge verdicts, and the working tree re-checked on 2026-10-05 (`package.json`, `test/setupTests.ts`, `src/components/SprintBoard.tsx`, `test/e2e/{sprint,workflow,board}.spec.ts`, `shared/types.ts`, `src/index.css`, `vite.config.ts`, `index.html`).

Spine: **Orrery (spatial)** won panel 1 and placed a close second in panel 2. Its scene infrastructure, Lifecycle Spine, Dependency Constellation and day-30 calm rules are the backbone here. **Meridian** contributes the governing motion rule, the GSAP stub pattern, the shared-element Flip, the dark-mode ramp bridge with explicit exceptions, and the CI size and no-new-IPC guards. **Plumb** contributes the honest empty state, the figure/figcaption pattern, `disabledReason`, the SprintScreen wrapper placement, FocusedActivityHost (F11) and the integrator-owned Wave 3. Every judge must-fix is resolved and marked **[MF]** where it changed the design.

Two inventory facts were stale and shorten Wave 0: all renderer libraries (gsap, @gsap/react, three, @types/three, @react-three/fiber, d3-force-3d, lucide-react, clsx, tailwind-merge, @fontsource-variable/inter, @fontsource-variable/jetbrains-mono) are already in `devDependencies`, and `test/setupTests.ts` already stubs `matchMedia` and `ResizeObserver`. `src/types/d3-force-3d.d.ts` already exists.

---

## 0. In three lines

| Line | Statement |
|---|---|
| What | Studio becomes an **instrument**: one accent, light and dark themes from one token set, a shared component kit, a GSAP motion system that moves only when a plugin fact changed, and two data-true Three.js scenes (the **Lifecycle Spine** on StageHome and the **Dependency Constellation** on Sprint and Board) plus a data-free Ambient Field on the pre-project screens. |
| Guardrails | Every scene has a DOM table of equal rank and will not compile without one; "no data" is text, never a zero or a count-up; nothing is drawn from plugin prose; no activity metrics or per-person totals anywhere; Waves 0–3 add zero `window.studio.*` calls and never touch `studio/electron/`; every pinned test either stays byte-identical or is listed with its exact change. |
| Batch 3 / 4 | Nothing in Batch 3 or Batch 4 is built yet and D4 / D5 are still open (§14). This overhaul absorbs F11 (focused activity in the main slot), accessibility basics, and the Stop-button slot for F15; it leaves `locks.ts`, timeouts, atomic settings, `userData` cwd, soft-require gh, Windows `.cmd`, and every sprint write verb to their batches. |

---

## 1. Vision and design language — **Observatory**

An observatory watches a system it does not control and reports exactly what it sees. That is Studio's job with the plugin.

| Trait | On screen | Never becomes |
|---|---|---|
| Instrument, not dashboard | One accent hue (today's brand blue). Paper-light surfaces by day; deep glass by night. Tabular numerals. Hairlines, not shadows. Motion short and physical. | Gradient-splashed analytics; glow everywhere; sparklines of activity. |
| Motion is evidence (Meridian) | An element may animate only when a fact it displays changed (navigation, data arrival, a write the plugin confirmed) or to acknowledge direct input. Exceptions: the first-open assemble and the current-stage pulse, and the pulse itself stops after three cycles unless the pointer is in the sidebar (Orrery). | Idle sparkle; attention theft while someone edits a field; loops. |
| Spatial memory (Orrery) | The nine phases are places on a rail you can see from StageHome; hovering a sidebar row lights the same station. Specs are bodies in a constellation whose arrangement is stable between visits (seeded layout, positions cached per project). | A different 3D toy on every screen. The Spine lives in exactly two places (StageHome, FeatureCompleteScreen) **[MF]**; the Constellation in two (Sprint, Board); Ambient only where there is no project data. |
| Honest surface (Plumb) | Signed-off and completed-without-a-name look different in 3D exactly as in the sidebar. Null renders as the words "no data" plus the sentence saying what would produce some. `dependencyGaps` prose is shown verbatim as a Notice, never drawn as geometry **[MF]**. Every canvas sits in a `<figure>` whose `<figcaption>` states what the axes do and do not mean. | Dimmed "future" bars that imply a plan; a red that the plugin called amber **[MF]**; a ghost body parsed out of a sentence. |
| Day-30 calm | `frameloop="demand"`, zero idle frames; entrances ≤ 320 ms; ceremonies ≤ 900 ms and only on real sign-off or merge; a Settings "Animations" switch; density compact. | A tool that feels busy in week five. |
| First-open impression | Welcome: a slow particle field settles behind a set-type title. Opening a project: sidebar rows cascade, the Spine draws its rail and lights the signed stations, the current station breathes three times. Sprint › Graph: the Constellation tweens from its cached layout into place and settles. | A spinner. |

### 1.1 Spatial vocabulary (used by every scene file)

| Term | Definition |
|---|---|
| Station | A phase on the Spine: ring + core + DOM plate. |
| Rail | The tube connecting stations, lit up to the last signed-off station; flat line to the current station; dashed beyond **[MF]**. |
| Body | A spec in the Constellation (instanced icosphere). Radius bound to `risk` alone. |
| Tether | A `dependsOn` edge, drawn dependency → dependent. |
| Ghost | A body for a `dependsOn` id that is not in the slate (wireframe, dashed tether, `ink-4`). Derived from ids only **[MF]**. |
| Halo | Additive sprite behind a body or station for current, next-up, hover, focus. |
| Plate | A real DOM `<li><button>` projected onto a 3D position: clickable, focusable, readable. |

---

## 2. Tokens

All tokens live in `src/index.css`. Semantic variables are plain custom properties on `:root` and `[data-theme="dark"]`; Tailwind reads them through `@theme inline` so `bg-surface-1`, `text-ink-2`, `border-line-1` are real utilities that flip with the theme and never need a `dark:` prefix. The existing `--color-brand-*`, `--color-stage-*`, `--color-command-*` names stay as aliases (23 `text-[var(--color-command-error)]` usages and several tests reference them). Dark variant for new code: `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));`.

### 2.1 Theme mechanics

| Piece | Specification |
|---|---|
| Attribute | `<html data-theme="light\|dark">` set by `src/theme/theme.ts` from `localStorage['studio.theme'] ∈ system\|light\|dark` (default `system`); `system` resolves via `matchMedia('(prefers-color-scheme: dark)')`, guarded (absent → light). Applied synchronously in `src/main.tsx` before `createRoot` so dark never flashes light. |
| `color-scheme` | `:root { color-scheme: light }`, `[data-theme="dark"] { color-scheme: dark }` so native scrollbars, `<select>` popups and form controls follow. |
| Theme-switch transition | Transient `html.theme-switching * { transition: background-color 200ms, border-color 200ms, color 200ms }` for 260 ms, then removed. Widths are never in that list (chatLook exact-380 pin). |
| Density | `<html data-density="comfortable\|compact">` from `localStorage['studio.density']`. Compact redefines `--pad-card 12px`, `--pad-row 8px`, `--gap-list 4px`, `--text-sm 12.5px`. Sidebar width becomes `w-[288px]` (px, so density never moves the nav); chat width is already px via `--chat-width`. |
| Motion flag | `<html data-motion="on\|off">` set by `src/motion/motion.ts`; `[data-motion="off"] *, [data-motion="off"] *::before, [data-motion="off"] *::after { transition-duration: 0ms !important; animation-duration: 0ms !important; animation-iteration-count: 1 !important }`. `@media (prefers-reduced-motion: reduce)` duplicates the rule for the moment before React mounts. |
| Fonts | `@import "@fontsource-variable/inter/wght.css"` and `@import "@fontsource-variable/jetbrains-mono/wght.css"` (latin subsets, ≈100 KB + ≈60 KB woff2) **[MF]**; Vite emits them as assets served by `font-src 'self'` in both `vite dev` and packaged `file://`. `font-display: swap`. `font-feature-settings: "cv11", "ss01"` on Inter; `font-variant-numeric: tabular-nums` on every number via `.tabular-nums`. SplitText waits on `document.fonts.ready`. |
| Preferences storage | theme, density, motion, scene surface, sidebar collapse, constellation positions all in `localStorage` (Plumb). Nothing new in `settings.json` (Batch 4 F15 stays small). |

### 2.2 Colour — semantic roles

| Token | Light | Dark | Utility | Use |
|---|---|---|---|---|
| `--color-surface-0` | `#f8fafc` | `#0b1120` | `bg-surface-0` | App canvas, sidebar (today `bg-slate-50`) |
| `--color-surface-1` | `#ffffff` | `#111a2b` | `bg-surface-1` | Cards, chat aside, panels (today `bg-white`) |
| `--color-surface-2` | `#f1f5f9` | `#172236` | `bg-surface-2` | Inset wells, free-text sections, code pills |
| `--color-surface-3` | `#e8edf4` | `#1e2a42` | `bg-surface-3` | Hover, pressed, skeleton base, progress track |
| `--color-surface-raised` | `#ffffff` | `#1d2838` | `bg-surface-raised` | Popover, palette, toast |
| `--color-surface-code` | `#0f172a` | `#05080f` | `bg-surface-code` | `<pre>` stdout and diff (stays dark in both themes) |
| `--color-surface-code-error` | `#450a0a` | `#1a0b0b` | `bg-surface-code-error` | `<pre>` stderr |
| `--color-scrim` | `rgb(15 23 42 / .40)` | `rgb(2 6 23 / .60)` | `bg-scrim` | Overlay and dialog backdrop |
| `--color-ink-1` | `#0f172a` | `#e6edf7` | `text-ink-1` | Primary text |
| `--color-ink-2` | `#334155` | `#b7c3d6` | `text-ink-2` | Body text |
| `--color-ink-3` | `#64748b` | `#8392aa` | `text-ink-3` | Secondary, meta |
| `--color-ink-4` | `#94a3b8` | `#5b6a84` | `text-ink-4` | Eyebrows, placeholders, the words "no data" |
| `--color-ink-inverse` | `#f8fafc` | `#0b1120` | `text-ink-inverse` | Text on accent fills and inverse pills |
| `--color-line-1` | `#e2e8f0` | `#22304a` | `border-line-1` | Hairlines (today `border-slate-200`) |
| `--color-line-2` | `#cbd5e1` | `#2d3d5c` | `border-line-2` | Inputs, hover borders |
| `--color-line-3` | `#94a3b8` | `#44515f` | `border-line-3` | Emphasised |
| `--color-focus` | `#2563eb` | `#60a5fa` | ring | Universal focus ring |
| `--color-accent-50…900` | `#eff6ff #dbeafe #bfdbfe #93c5fd #60a5fa #3b82f6 #2563eb #1d4ed8 #1e40af #1e3a8a` | `#0f1f3d #13284f #1a3a6e #2a56a3 #3b82f6 #5b9bff #3b82f6 #2563eb #93c5fd #bfdbfe` | `bg-accent-600` … | The one accent |
| `--color-brand-50…900` | same as accent (completes the scale) | same | existing `bg-brand-600` etc. | **Fixes the bug**: `brand-200/300/800/900` are used 14× with no CSS emitted today (`CandidateView:78`, `AiProposalCard:23`, `BatchCandidateList:125`, `DocumentSections:67`, `ChatPanel:486`, `SettingsScreen:134-159`, `ActivitiesPanel:244`, `SprintBoard:261`, `PhaseReportPanel:72`) |

Contrast: every ink on its surface ≥ 4.5:1 (light `ink-3` on `surface-1` 4.6:1; dark `ink-3` on `surface-1` 5.1:1). Dark `text-white` on dark `bg-brand-600` (`#3b82f6`) 4.6:1.

### 2.3 Stage and status colours (the plugin's vocabulary; four values each: fill / bg / ink / line)

| Group | Light | Dark | Used by |
|---|---|---|---|
| `stage-signed` | `#16a34a / #f0fdf4 / #15803d / #bbf7d0` | `#34d399 / #0b2a1e / #86efac / #14532d` | Sidebar node, Spine station, progress fill, Complete badge |
| `stage-completed` | ring only in `stage-signed` fill, hollow core | same | Signed off with no name recorded (`nodeKind()` from `shared/nav.ts`, never re-derived). Same hue as signed on purpose: the cue is shape, not colour |
| `stage-current` | `#2563eb / #eff6ff / #1d4ed8 / #bfdbfe` | `#5b9bff / #0f1f3d / #93c5fd / #1e40af` | Now badge, current ring, current workflow step |
| `stage-later` | `#94a3b8 / #f8fafc / #64748b / #e2e8f0` | `#5b6a84 / #111a2b / #7c8a9a / #2e3947` | Dashed later ring, Locked badge (finally used by the Spine) |
| `status-ok` | `#16a34a / #f0fdf4 / #15803d / #bbf7d0` | `#4ade80 / #0b2a1e / #86efac / #14532d` | Command ok, checks passed, READY |
| `status-warn` (amber) | `#d97706 / #fffbeb / #b45309 / #fde68a` | `#fbbf24 / #2a1f06 / #fcd34d / #78350f` | Notices, NOT READY, waiting-on, mix warnings, `dependencyGaps`, `overAlarm`. The word `amber` stays in the warn classes (`SprintBoard.test.tsx:104` pins it) |
| `status-error` | `#dc2626 / #fef2f2 / #b91c1c / #fecaca` | `#f87171 / #2d0f0f / #fca5a5 / #7f1d1d` | Hard errors, refusals, stderr |
| `status-running` | `#0ea5e9 / #f0f9ff / #0369a1 / #bae6fd` | `#38bdf8 / #082f49 / #7dd3fc / #0c4a6e` | Console pending rows, draft running, overlay ring. Running is not a warning, so it leaves amber (Meridian). `--color-command-running` becomes an alias |
| `spec-ready / -inflight / -merged / -deferred / -notready` | `#2563eb #0ea5e9 #16a34a #94a3b8 #b45309` | `#5b9bff #38bdf8 #4ade80 #5b6a84 #fbbf24` | Constellation body colour and Chip tone, same meanings as the `SprintBoard` `CHIP` map |

### 2.4 Dark-mode bridge for pinned and untouched markup

771 slate, 169 amber, 41 red, 78 `bg-white` and 36 `text-white` usages live in files that are byte-pinned (`DocumentsTab`), class-pinned (`WorkflowTab`, `Sidebar`, `ChatPanel`, `OpeningOverlay`, `SprintBoard` amber) or simply not migrated yet. Tailwind 4 compiles `bg-slate-900` to `var(--color-slate-900)`, so under `[data-theme="dark"]` the palette variables are remapped and every such class flips without a class-name change. The remap favours **text** usage of a step; the exceptions below fix the handful of **background** usages. The table enumerates every step actually in use in `src/` (grep on 2026-10-05) **[MF]**.

| Legacy var (usages) | Light | Dark remap | Effect |
|---|---|---|---|
| `--color-white` (`bg-white` 78, `text-white` 36) | `#fff` | **unchanged `#fff`** **[MF]** | `text-white` stays white on accent fills and inverse pills. `bg-white` is handled by an exception, not by remapping white |
| `--color-slate-50` (27 bg) / `100` (16 bg) | `#f8fafc` / `#f1f5f9` | `#0f172a` / `#172236` | App and sidebar bg, step cards, assistant bubbles (`bg-slate-100` pinned by chatAuthoring e2e; class unchanged) |
| `--color-slate-200` (133 border, 9 divide, 3 bg, 3 bg/50) / `300` (30 border) | `#e2e8f0` / `#cbd5e1` | `#22304a` / `#2d3d5c` | Hairlines, sub-agent dashed border, input borders |
| `--color-slate-400` (135 text, 1 border) / `500` (132 text) | `#94a3b8` / `#64748b` | `#5b6a84` / `#8392aa` | Eyebrows, meta |
| `--color-slate-600` (67) / `700` (59) | `#475569` / `#334155` | `#a9b6cb` / `#c3cde0` | Body text |
| `--color-slate-800` (53) / `900` (81 text, 6 bg, 1 bg/40) / `100` as text (3) | `#1e293b` / `#0f172a` | `#dbe3f0` / `#e6edf7` | Headings. Backgrounds fixed by exceptions |
| `--color-amber-50` (33 bg) / `100` (2) / `200` (25 border, 2 bg) / `300` (11 border) | tints | `#2a1f06` / `#3a2a08` / `#5a3a08` / `#6b4609` | Notice fills and borders |
| `--color-amber-500/600/700` as bg (1/5/2) | `#f59e0b #d97706 #b45309` | `#f59e0b #d97706 #b45309` **unchanged** | These are solid chips with white text; keep them |
| `--color-amber-600` (1 text) / `700` (21 text) / `800` (27 text) / `900` (39 text) | `#d97706 #b45309 #92400e #78350f` | `#fbbf24 #fbbf24 #fcd34d #fde68a` | Warning text on dark tints: `#fcd34d` on `#2a1f06` 10.5:1 |
| `--color-red-50` (13 bg) / `100` (1 bg, 1 text) / `200` (11 border) / `300` (1) | tints | `#2a0f0f` / `#3a1414` / `#5a1c1c` / `#6b2222` | Error fills and borders. `text-red-100` is only used inside `bg-red-950` stderr, handled by the exception below so it stays readable |
| `--color-red-500` (2 bg) | `#ef4444` | unchanged | Solid dot |
| `--color-red-700` (9 text) / `800` (1) / `900` (1) / `950` (1 bg) | `#b91c1c #991b1b #7f1d1d #450a0a` | `#f87171 #fca5a5 #fecaca` / bg exception | Error text |
| `--color-green-100/500/800`, `--color-emerald-50/700`, `--color-sky-50/200/700` | defaults | `#0b2a1e / #22c55e / #86efac`, `#0b2a1e / #34d399`, `#082f49 / #0c4a6e / #7dd3fc` | OK chips, "Your version" header |
| `--color-brand-50/100/500/600/700` | as today | `#0f1f3d #13284f #5b9bff #3b82f6 #2563eb` | `bg-brand-600` (e2e pin) stays a vivid fill with white ink |

Unlayered dark exceptions (eight selectors, listed in full so the sweep is finite) **[MF]**:

| Selector | Dark value | Why |
|---|---|---|
| `[data-theme=dark] .bg-white` | `var(--color-surface-1)` | 78 card and list backgrounds flip without remapping `--color-white` |
| `[data-theme=dark] .bg-slate-900` | `#05080f` | `Console.tsx:98`, `HistoryPanel.tsx:147,158` `<pre>` blocks stay dark with their `text-slate-100` (remapped to `#dbe3f0`) |
| `[data-theme=dark] .bg-slate-900.text-white` | `background: #e6edf7; color: #0b1120` | Inverse pills (`ExplainViews.tsx:32,131`, `SpecReadinessPanel.tsx:125`) invert to a light pill with dark ink. `bg-slate-900` class still present for `board.spec:215-229` |
| `[data-theme=dark] .bg-slate-900\/40` | `var(--color-scrim)` | `OpeningOverlay.tsx:49` scrim stays a dark wash |
| `[data-theme=dark] .bg-red-950` | `#1a0b0b` | `Console.tsx:103` stderr; `text-red-100` remaps to `#3a1414`, so this selector also sets `color: #fecaca` |
| `[data-theme=dark] .bg-slate-50` on roots (`Frame`, `Sidebar` aside) | `var(--color-surface-0)` | Same as remap; stated explicitly because it is the app canvas |
| `[data-theme=dark] .bg-slate-200\/50` | `rgb(45 61 92 / .5)` | Three progress tracks |
| `[data-theme=dark] .border-dashed.border-slate-300` | `#3b4d70` | Sub-agent bubble border stays visible on `bg-slate-50` → `#0f172a` |

Dark verification list (manual, both themes, before Wave 2 closes): HIGH-tier selected segment, user chat bubble, assistant bubble, sub-agent bubble, Console stdout and stderr, HistoryPanel diff, OpeningOverlay scrim, Documents tab "N to fill" chip, Sprint mix warnings, Clash "Your / Their version" headers.

### 2.5 Type scale

| Token | Size / line / tracking / weight | Tailwind | Use |
|---|---|---|---|
| `--text-2xs` | 10.5 / 14 / +0.09em upper / 600 | `text-2xs` (new) | Sidebar group labels (replaces `text-[10.5px]`, `text-[11px]`, `text-[11.5px]`) |
| `--text-xs` | 12 / 16 | `text-xs` (366 uses) | Meta, chips, table cells, eyebrows |
| `--text-sm` | 13 / 18 | `text-sm` (204 uses, retuned from 14) | Body default in dense UI |
| `--text-base` | 14 / 20 | `text-base` | Document prose |
| `--text-md` | 15 / 20 / −0.005em / 600 | `text-md` (new) | Sidebar project name (today `text-[15px]`), spec title |
| `--text-lg` | 18 / 24 / −0.01em / 600 | `text-lg` | Panel titles |
| `--text-xl` | 22 / 28 / −0.015em / 600 | `text-xl` | Screen h2 (`readiness.display`, "Build", "Sprint") |
| `--text-2xl` | 28 / 34 / −0.02em / 650 | `text-2xl` | Welcome h1 |
| `--text-display` | 40 / 44 / −0.025em / 650 | `text-display` (new) | Spine hover plate display name, sign-off ceremony title |
| Mono | JetBrains Mono Variable 12 / 16 / 450 | `font-mono text-code` | Ids, paths, `<pre>` |

Eyebrow pattern `text-xs font-medium uppercase tracking-wide text-slate-400` (28×) becomes `<Eyebrow>` in owned files; `DocumentsTab` keeps the literal string.

### 2.6 Spacing, radii, elevation

| Token | Value | Use |
|---|---|---|
| Spacing grid | 4 px base; rhythm 2 / 4 / 6 / 8 / 12 / 16 / 20 / 24 / 32 / 48 | Control `px-3 py-1.5`; card `px-4 py-3`; screen `p-6` (unchanged on `<main>`, e2e measures depend on it); section gap `space-y-6` |
| `--radius-1` | 6 px | Chips, kbd, inline code |
| `--radius-2` | 10 px | Controls, sidebar rows (today `rounded-[10px]`) |
| `--radius-3` | 14 px | Cards |
| `--radius-4` | 20 px | Dialogs, Welcome card |
| `--radius-pill` | 9999 | Pills, nodes |
| `--radius-lg` → 10 px, `--radius-xl` → 14 px | remaps Tailwind `rounded-lg` (122×) and `rounded-xl` (85×) | Upgrades 207 usages without touching pinned markup (byte tests compare class names, not computed radii) (Plumb) |
| `--shadow-1` | `0 1px 2px rgb(15 23 42 / .06), inset 0 0 0 1px var(--color-line-1)` | Active sidebar row |
| `--shadow-2` | `0 8px 24px -8px rgb(15 23 42 / .18), 0 0 0 1px var(--color-line-1)` | Hover cards, popovers, palette |
| `--shadow-3` | `0 24px 64px -16px rgb(15 23 42 / .35)` | Dialogs, overlay card, toasts |
| Dark elevation | shadows → `0 0 0 1px rgb(255 255 255 / .06)` rim + one surface step lighter | Depth by rim light, not blur |
| `--ring` | `0 0 0 2px var(--color-surface-0), 0 0 0 4px var(--color-focus)` | Universal `:focus-visible { box-shadow: var(--ring) }` in `@layer base`; `TEXT_INPUT` loses `outline-none` |

### 2.7 Motion tokens (`src/motion/tokens.ts` mirrors the CSS)

| Token | Value | GSAP ease | CSS equivalent | Use |
|---|---|---|---|---|
| `--dur-1` | 120 ms | `power2.out` | `cubic-bezier(.2,.7,.3,1)` | Hover, press, toggle, hover-plate |
| `--dur-2` | 200 ms | `power2.out` | same | Control state, tab underline, toast, bubble |
| `--dur-3` | 320 ms | `expo.out` | `cubic-bezier(.16,1,.3,1)` | Screen enter, list stagger window, skeleton swap |
| `--dur-4` | 560 ms | `power3.inOut` | `cubic-bezier(.65,0,.35,1)` | Flip regroup, shared-element Flip, camera settle, constellation re-layout |
| `--dur-5` | 900 ms | `expo.inOut` | | Ceremonies (sign-off), rail draw, first-open assemble |
| `--stagger-1` | 24 ms, capped by `amount: 0.32` | | | Rows, chips |
| `--stagger-2` | 60 ms | | | Cards, stations |
| Pop | `back.out(1.4)` | | | Only elements ≤ 24 px (chips, Now badge, a node filling in) |
| Ambient | `sine.inOut`, yoyo, 2.4 s, max 3 cycles unless pointer present | | | Current-station breathing |
| Reduced / off | all durations → 0; staggers → 0; opacity crossfades capped at 120 ms when reduced, 0 when off; ambient off | | `[data-motion="off"]` rule in §2.1 | |

---

## 3. Component kit — `src/ui/*`

Rules for every primitive: built with `cn()` (`src/ui/cn.ts` = `twMerge(clsx(...))`), `forwardRef`, `...rest` spread last, `type="button"` emitted first on buttons (keeps the pinned attribute order `<button type="button" disabled=""…>` in `workflowTab.test.ts:218`), icons `aria-hidden` unless labelled, `data-testid` and `data-*` pass-through, SSR-safe (no `window` at module top level, since node-env tests use `renderToStaticMarkup`). Every control accepts `disabledReason?: string` which renders `title` plus visually-hidden text, matching the existing `activity-disabled-reason` convention and ready for Batch 4 D4 (Plumb). Counts come from inventory-renderer §3 and a grep of `src/components/*.tsx` on 2026-10-05.

| # | Component (file) | Props sketch | Replaces | Count | A11y and pins |
|---|---|---|---|---|---|
| 1 | `Button.tsx` | `variant: primary\|secondary\|ghost\|danger\|link`, `size: sm\|md`, `loading?`, `loadingLabel?`, `icon?`, `iconEnd?`, `block?`, `disabledReason?` | Inline primary string `rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40`; `PANEL_BUTTON`, `PANEL_SECONDARY_BUTTON` (`activityPanelBits.tsx:6-9`), `BUTTON` (`ActivitiesPanel.tsx:134`); ~40 secondary strings; disabled opacity 40/50/60 → one `disabled:opacity-50` | ~45 | Primary **always emits literal `bg-brand-600`** (`board.spec.ts:127,148`). `aria-busy` when loading. Press `scale .98` 120 ms via `motion-safe:active:` |
| 2 | `IconButton.tsx` | `label` (required → `aria-label`), `icon`, `size`, `pressed?` | Sidebar footer SVG buttons, History Close, Mark as seen | ~10 | lucide 16 px stroke 1.75 |
| 3 | `Card.tsx` | `tone: default\|inset\|warn\|error\|ok\|info`, `padding: none\|sm\|md`, `interactive?`, `as?`, `header?/footer?` | `rounded-xl border border-slate-200 bg-white` ×32 and ~60 variants | ~93 | `data-flip-id` pass-through for Flip |
| 4 | `Notice.tsx` | `tone: warn\|error\|ok\|info`, `title?`, `icon?`, `actions?`, `role?: alert\|status\|none` | Amber notice ×18 (`border-amber-200 bg-amber-50 … text-amber-800` ×25 grep); red banners ×9; could-not-reach / refused cards | ~30 | `warn` classes **include the word `amber`** (`SprintBoard.test.tsx:104`). `error` defaults `role="alert"`, `warn` is `role="status"`. Testids `plugin-behind`, `document-error`, `activities-warning`, `template-gaps` pass through |
| 5 | `NoData.tsx` | `what: string` (the sentence saying what would produce data) | Scorecard "no data" (`ExplainViews:301`), alarms "— no data", sprint "cap not set" | ~15 | Renders the literal words "no data" in `ink-4` plus `what`. Never a 0 (Plumb) |
| 6 | `Eyebrow.tsx` | `as?: p\|h3\|span` | `text-xs font-medium uppercase tracking-wide text-slate-400` ×28 | 28 (36 grep) | Heading semantics via `as` |
| 7 | `Field.tsx` + `Input.tsx`, `Textarea.tsx`, `Select.tsx` | `label`, `hint?`, `error?`, `required?`, `mono?`, `size`; `Select options \| roster` | `TEXT_INPUT` (`briefBits.tsx:5`), ~20 inline inputs (ToolingIssues path, project name `id="new-project-name"` kept, Developer, authoriser, Board search `placeholder="Search"` kept, team limit, four Board `<select>`s, Playbook select) | ~25 | `useId` label association, `aria-describedby`, `aria-invalid`; removes `outline-none`; **never mounted in the persistent shell** (`board.spec:189` page-wide `input` = 0 on the spec view) |
| 8 | `Segmented.tsx` | `options[{value,label,icon?,disabled?}]`, `value`, `onChange`, `tone: accent\|inverse\|neutral`, `size`, `label` | BuildBoard roles (active `bg-brand-600`), ExplainViews pill (`bg-slate-900`), Scorecard 14/30/90 (`bg-slate-900`), Console Plain/Technical, Risk tier LOW/MEDIUM/HIGH (`bg-slate-900`), plus new Graph/Table, theme, density, motion toggles | 5 today + 5 new | Each option `aria-pressed`; group `role="group" aria-label`; ←/→/Home/End roving; `tone=accent` emits literally `bg-brand-600 text-white`, `tone=inverse` emits `bg-slate-900 text-white` (dark handled by the `.bg-slate-900.text-white` exception in §2.4) **[MF]**; a Flipped thumb `<span>` behind the active option (§4 #7) |
| 9 | `Tabs.tsx` (`TabList`, `Tab`, `TabPanel`) | `value`, `onChange`, `label` | StageHome `TabButton` (`role="tablist" aria-label="Stage view"` kept) | 1 | Roving `tabIndex`, ←/→/Home/End, `aria-controls` / `aria-labelledby`, `TabPanel role="tabpanel" tabIndex=-1`, underline Flips. **Never used in Sidebar** (`sidebar.test:98` forbids `role="tab"`) |
| 10 | `Chip.tsx` | `tone: neutral\|accent\|ok\|warn\|error\|signed\|current\|later\|mono`, `size: xs\|sm`, `dot?`, `as?: span\|button` | `sprint-chip`, risk pills, roles pill, team-load chips, mix chips, state chip, `SyncChip` pill, chat question pills (`Chip as="button"` keeps `rounded-full` for the chatAuthoring `aside button.rounded-full` pin), "Now" badge | ~20 | Colour never the only signal: `dot` or icon + text |
| 11 | `Badge.tsx` | `kind: complete\|current\|locked\|now\|ready\|notReady` | WorkflowTab step badges, "Now" | 4 | Text always rendered |
| 12 | `StatusDot.tsx` | `status: ok\|warn\|error\|running\|idle`, `pulse?` | Console row dots, draft running, sync states | ~8 | `pulse` only when motion enabled; `aria-hidden` with sibling text |
| 13 | `Skeleton.tsx` (`Line`, `Block`, `Rows`, `Tile`) | `width?`, `lines?`, `rows?` (fixed counts, never implying how many will arrive) | ~40 grey one-liners get a skeleton **beside** the kept text ("Checking this stage…", "Reading the sprint…", "Opening…"); tests find the text | 40 | `aria-hidden`; parent `aria-busy="true"`; shimmer is a CSS `background-position` keyframe gated by `[data-motion]` |
| 14 | `EmptyState.tsx` | `icon?`, `title`, `body?`, `action?` | "Nothing is currently in progress…", "Not started yet — …", `sprint-empty`, no recent projects | ~8 | Existing sentences verbatim |
| 15 | `StatTile.tsx` | `label`, `value: number\|null`, `unit?`, `hint`, `previous?: number\|null`, `id` | ExplainViews measure tiles (`grid-cols-2`) | 8 | `null` → `NoData`; number → `useCountUp` only from a known previous number (§4 #11) |
| 16 | `ProgressBar.tsx` | `value: number\|null`, `max`, `label` | Sidebar `h-1.5` bar, readiness `ready/total` | 2 | `role="progressbar"` + `aria-valuetext="3 of 9 stages done"`; width tween only between two real values; null → hairline, no fill |
| 17 | `DataTable.tsx` | `columns`, `rows`, `rowKey`, `rowProps(row)`, `renderDetails?`, `stickyHeader`, `dense` | SprintBoard `SlateTable` (10 cols), History versions, Settings people/teams | 3 | `<table>` semantics, `scope="col"`, sticky `<thead>` inside its own scroll box; `data-testid="sprint-slate-row"` + `data-spec` via `rowProps`; DoR `<details>` kept (`sprint.spec:114` `details[open]` = 1) |
| 18 | `DefinitionList.tsx` | `items[{term, detail}]`, `columns 1-4` | `DocumentSections` `<dl>`, SpecStatusView 4-col, HandoffDialog 3-col | 3 | `<dl>/<dt>/<dd>` |
| 19 | `Dialog.tsx` | `open`, `onClose`, `title`, `description?`, `size`, `initialFocus?`, `returnFocus=true`, `footer?` | New: palette shell, shortcuts help, HistoryPanel restore confirm (ack checkbox + "Restore as a new version" text kept), appearance sheet. **Not** HandoffDialog (stays inline in `<main>`) | 4 | Portal to `#overlays` (a `<div>` sibling of `#root` added to `index.html`; CSP line untouched); never an `<aside>`; `role="dialog" aria-modal`; focus trap; Escape; scroll lock; focus restore |
| 20 | `Popover.tsx` / `HoverCard.tsx` | `trigger`, `content`, `placement`, `openDelay 350`, `closeDelay 120` | `title=` attributes; new hover cards (§6.5) | — | Opens on hover **and** `focus-visible`; Escape closes; `role="tooltip"` when text-only; `pointer-events: none`; **never contains a write control** |
| 21 | `Tooltip.tsx` | `label`, `kbd?` | resize handle `title` | ~5 | `role="tooltip"`, 500 ms delay |
| 22 | `Kbd.tsx` | `keys: string[]` | New: palette rows, shortcuts help; renders ⌘ or Ctrl by platform | — | `<kbd>` semantics |
| 23 | `BackLink.tsx` | `label` | "← Back to the stage", "← Back to the board", "← Back to Workflow" | 3 | Keeps the exact visible text including the arrow character (tests locate by text) |
| 24 | `Icon.tsx` | `icon: LucideIcon`, `size 14\|16\|18`, `label?` | Unicode glyphs ✓ ☑ ☐ • – ▸ ▾ where no test pins the visible text; the 4 inline SVG paths in Sidebar. Kept: ClashDiff ▸/▾ (test pins `aria-expanded` + text), "←" in back links | ~20 | `aria-hidden` unless `label` (then `role="img"`) |
| 25 | `Toast.tsx` + `ToastRegion.tsx` + `toastStore.ts` + `useToast` | `toast({tone, title, detail?, action?, sticky?})`, ttl 6000 | App's pre-project fixed red toast; transient "Saved" / "Exported" / "Signed off" confirmations | ~6 | `<section role="region" aria-label="Notifications">`, `aria-live="polite"` (errors `assertive`), **not an `<aside>`**; max 3; progress rail pauses on hover/focus |
| 26 | `Spinner.tsx` / `ProgressRing.tsx` | `size`, `label` | The single `animate-spin` (overlay), "…" button labels | 1 | CSS keyframe; static ring under motion-off; the overlay element keeps an `animate-spin` class for parity |
| 27 | `VisuallyHidden.tsx`, `SkipLink.tsx` | — | New | — | Skip link is an `<a href="#main">`, first child of `#root` |
| 28 | `Surface3DToggle.tsx` | `value: graph\|table`, `onChange`, `disabledReason?` | New; used by every `SceneShell` | 2 hosts | `Segmented` of exactly two buttons "Graph" / "Table" with `aria-pressed`; **rendered by the scene host, never inside `[data-testid=sprint-board]`** **[MF]** |
| 29 | `ThemeToggle.tsx`, `DensityToggle.tsx`, `MotionToggle.tsx` (`Preferences.tsx`) | — | New; Settings › Appearance, Sidebar footer popover, palette | — | `Segmented` with `aria-pressed`; buttons only (no `<input>`) |
| 30 | `FocusedActivityHost.tsx` (`src/components/`) | `activity`, `onClose` | New; renders the picked activity panel in WorkflowTab's **right (main) slot** instead of the 288 px column (**Batch 4 F11 delivered here**, Plumb) | — | Column keeps the `<ol>`; root class strings of WorkflowTab untouched |
| 31 | `RosterPicker.tsx` (`src/components/`) | `roster`, `value`, `onChange`, `allowFreeText` | HandoffDialog Developer free text (Batch 3 roster pickers, UI half only) | 1 | `role="combobox"`; still an `<input>` inside `<main>` only |

Deliberately omitted: a `Stack` layout primitive (layout stays Tailwind utilities so the two pinned layout strings `flex flex-col gap-6 sm:flex-row` and `flex flex-wrap items-center justify-between gap-2` remain literal). Files the kit never touches in Waves 0–2: `DocumentsTab.tsx` (byte-equal), `WorkflowTab.tsx` root strings, `Sidebar.tsx` aside class, `ChatPanel.tsx` aside class, `ChatResizeHandle.tsx`, `OpeningOverlay.tsx` root attributes, `MarkdownView.tsx`.

Icon set (lucide-react, ESM named imports, ~45 icons ≈ 25 KB): `ArrowLeft ArrowRight Check CheckCircle2 Circle CircleDashed ChevronRight ChevronDown Settings2 SquareTerminal MessageSquare Search Command Sun Moon Monitor Rows3 Rows4 Sparkles GitBranch GitPullRequest ShieldCheck AlertTriangle XCircle Clock History Pencil Save RefreshCw FileText Folder Table2 Orbit Pause Play Eye EyeOff Keyboard Info ExternalLink Square StopCircle`.

---

## 4. Motion system and choreography catalogue — `src/motion/*`

Governing rule (Meridian): **motion is evidence**. A tween may run only when a fact it displays changed or to acknowledge direct input. The two exceptions are the first-open assemble and the current-station pulse, and the pulse stops after three cycles unless the pointer is in the sidebar.

### 4.1 Architecture

| File | Responsibility |
|---|---|
| `motion/motion.ts` | `enabled()` = `import.meta.env.MODE !== 'test'` **and** `preference !== 'off'` **and** `!(reduced() && preference !== 'on')`. Preference `localStorage['studio.motion'] ∈ auto\|on\|off`, default `auto`. `auto` honours the OS; `on` is an explicit per-person opt-in shown with a note in Settings › Appearance; `off` wins over everything **[MF: one consistent definition]**. `reduced()` guards `typeof window.matchMedia === 'function'`. Sets `document.documentElement.dataset.motion`. `subscribe(cb)` for media and preference changes. Exposes `durations` / `eases` mirrors of §2.7. |
| `motion/register.ts` | `gsap.registerPlugin(useGSAP, Flip)`; `gsap.defaults({ ease: 'power2.out', duration: 0.2, overwrite: 'auto' })`; `gsap.ticker.lagSmoothing(500, 33)`; pauses `gsap.globalTimeline` on `visibilitychange` hidden and resumes on visible. Imported once from `main.tsx`. SplitText, MorphSVG, DrawSVG and Observer are `await import()`ed by the choreographies that use them. `gsap.matchMedia` and ScrollTrigger are never imported (ESLint `no-restricted-imports`). |
| `motion/useStudioGSAP.ts` | `useStudioGSAP(callback, { scope, dependencies })` wraps `@gsap/react` `useGSAP`. When `!enabled()` the callback receives a gsap-shaped **stub** whose `to / from / fromTo / timeline / set` apply the end state instantly with `gsap.set` and return a completed timeline, so callers never branch (Meridian). Context reverts on cleanup (StrictMode-safe). |
| `motion/useEnter.ts` | Enter-only transitions on a **ref to the screen root**, no wrapper element: presets `rise` (y 6→0, opacity), `fade`, `slideRight`. Keeps `main.firstElementChild` the real screen (`workflow.spec.ts:191`) **[MF]**. Every transform tween ends with `clearProps: 'transform'` so no element keeps a residual `translate(0,0)` **[MF]**. |
| `motion/useFlipGroup.ts` + `flipStore.ts` | `const {capture, play} = useFlipGroup(containerRef, '[data-flip-id]')`: `Flip.getState` before the state change, `Flip.from` in `useLayoutEffect` after commit with `absolute: true` scoped to the list container, `nested: true`, `scale: false`, cap 80 targets else no-op. `flipStore` is a module `Map<string, {state, opener: HTMLElement}>` with `stash(id)` / `take(id)` for cross-screen shared elements. The Flip container is the positioned, scrolled ancestor (the list itself, not `<main>`) so the stashed state is not offset by `<main>`'s scroll **[MF]**. |
| `motion/useCountUp.ts` + `valueMemory.ts` | `useCountUp(id, value: number\|null)`; `valueMemory: Map<id, number>`. First mount renders the value as text; tween only when previous and next are both finite; `null ↔ number` is a 120 ms text crossfade; **never 0→n**. `snap: 1` for integers, 0.1 for rates. |
| `motion/pulse.ts` | `attachPulse(el, { cycles: 3, hold: () => pointerInSidebar })`: scale 1→1.18 yoyo 2.4 s `sine.inOut`; repeats while `hold()` is true, otherwise stops after `cycles`; restarts on a `status.stages` change. Paused when hidden. |
| `motion/presets.ts` and `motion/choreo/*.ts` | One module per catalogue row; each exports `play(ctx) → Timeline` (the stub returns a completed timeline when disabled). The sign-off ceremony is one labelled `gsap.timeline` so the Spine joins at the `"spine"` label. |
| `motion/splitTitle.ts` | `const { SplitText } = await import('gsap/SplitText')`, `type: 'chars'`, `aria: 'auto'` so AT reads the whole string **[MF]**; waits on `document.fonts.ready`; `revert()` on unmount. Used only on the Welcome h1, the ceremony title and the overlay title. Never on `MarkdownView`, any `data-testid` text, or any heading a Playwright spec locates (grep before adding a target). |
| `motion/MotionProvider.tsx` | Context `{ enabled, reduced, preference, setPreference }`; surfaced in Settings and the palette. |
| CSS half | `[data-motion="off"]` rule and `@media (prefers-reduced-motion: reduce)` duplicate in `index.css` (§2.1). |

Global invariants: ≤ 30 concurrent tweens; every `useStudioGSAP` is scoped and reverts on unmount; the `<aside>` elements, the overlay root and `<main>` itself are never transformed; widths are never tweened.

### 4.2 Choreography catalogue

| # | Name | Trigger (the fact that changed) | Elements | GSAP plugin | Duration / ease | Reduced / off |
|---|---|---|---|---|---|---|
| 1 | Welcome open | `screen.kind` becomes `welcome` | Ambient Field canvas opacity 0→1 (600 ms); h1 chars via SplitText y 14→0 opacity, stagger 18 ms amount ≤ 0.25 s; subtitle y 8→0 at +120 ms; two buttons stagger 60 ms; recent rows stagger 24 ms | core + SplitText (lazy) | 600 ms `expo.out`; rows 320 ms | Static final state; canvas fades 0 ms |
| 2 | Project open, Frame assemble | `openProject` resolved and Frame mounted (overlay already down) | Sidebar header opacity (180 ms); stage `<li>` rows x −8→0 opacity stagger 24 ms; project-name h1 SplitText chars (320 ms, `aria:'auto'`); `<main>` screen root `rise`; chat **inner content** x 12→0 (never the `<aside>`); Spine rail draw (`uDraw` 0→1, 700 ms) then stations pop in order (scale .6→1 `back.out(1.4)`, stagger 60 ms); current station breathes 3 cycles | core + SplitText + scene timeline | ≈ 1.0 s `expo.inOut`, interruptible (`overwrite:'auto'`) | Rows and stations appear; rail fully drawn; no pulse |
| 3 | Screen enter | `area`, `openDoc`, `openSpec`, `viewedStageId`, `tab` change | The new screen root via `useEnter(ref, 'rise')`: y 6→0, opacity 0→1, `clearProps:'transform'`; then focus moves to the h2 (§6.3) | core | 240 ms `power3.out` | Opacity-only 120 ms when reduced; nothing when off; focus still moves |
| 4 | List stagger | First data arrival for a list (`[data-reveal]` children) | `li` / `tr` y 4→0 opacity, stagger `amount: 0.18`, cap 12 items | core | ≤ 320 ms | None |
| 5 | Skeleton → content | Loading flag flips | Skeleton opacity → 0 (120 ms) while content opacity 0→1 (200 ms) in the same box, no layout morph | core | 320 ms | Swap |
| 6 | Board regroup / filter Flip | Grouping select, role segment, search, team/risk/status filter change on BuildBoard | `[data-flip-id^="spec:"]` rows and group headers; `onEnter` fade from y 6, `onLeave` fade out; `absolute:true` within the list container, `nested:true`, `scale:false`, stagger 12 ms | Flip | 400 ms `power3.inOut` | Rows re-render in place |
| 7 | Segmented thumb / Tabs underline | Value change | A single absolutely positioned `<span>` Flipped between options | Flip | 180 ms `power3.inOut` | Thumb jumps |
| 8 | Shared element row → detail | Click a spec row (Board or Sprint slate) → `SpecStatusView`; Back → row | Row header `data-flip-id="spec:0008"` stashed in `flipStore`; detail title block with the same id does `Flip.from(stashed, { absolute:true, toggleClass:'is-flipping' })`; the Flip container is the list's positioned ancestor | Flip + flipStore | 360 ms `power3.inOut` | Detail simply appears; end state identical |
| 9 | Sidebar progress + Now badge | `status.stages` changed after `refreshStatus` | `ProgressBar` width tween from previous **real** fraction; "Now" chip `data-flip-id="now"` Flips from old row to new; new current ring scale .6→1 `back.out(1.4)`; `attachPulse` restarts for 3 cycles | core + Flip | 420 ms + 300 ms | Instant; no pulse |
| 10 | Sign-off ceremony | `signOffStage` returned `ok` **and** the refreshed `ProjectStatus` arrived (both facts real) | One labelled timeline: (a) overlay down; (b) Sign-off button tick draws via `strokeDashoffset` on an inline SVG path (300 ms) **[MF: no MorphSVG; the button has no icon today]**; (c) success card rises (240 ms); (d) sidebar node fills `stage-signed` scale .6→1 `back.out(1.4)` (320 ms); (e) connector `scaleY 0→1` origin top (450 ms `power2.inOut`); (f) next ring scale .6→1; (g) Now badge Flip (300 ms); (h) progress tween (420 ms); (i) label `"spine"`: Spine station halo bloom 0→1→0.4 and `uLit` advances k/8 → (k+1)/8 (600 ms); (j) toast "Phase N signed off · by {signed_off_by}" naming the plugin's value | core + Flip + scene timeline | ≈ 900 ms total `expo.inOut` | State applied instantly; toast and live announcement still made |
| 11 | Counters | A `StatTile` / `ProgressBar` / "N of M" / "(N left)" value changed and `valueMemory` holds a previous finite value | Text node, `snap` | core | 560 ms `power3.out` | Text swap |
| 12 | Toasts | `toast()` | Enter x 16→0 opacity (200 ms); exit opacity + height collapse (160 ms); progress rail shrinks over ttl, pauses on hover/focus | core | 200 ms `expo.out` | Opacity 120 ms; ttl still applies |
| 13 | Chat message arrival | `messages.length` grew | New `li` bubble y 8→0 scale .98→1 opacity; sub-agent dashed border colour accent → `line-2` (600 ms); typing indicator 3 dots `sine.inOut` 900 ms loop only while `busy` | core | 220 ms `back.out(1.2)` | Bubble appears; dots static "…"; scroll-to-bottom unchanged |
| 14 | Chat question pills / proposal resolve | Message with `questions[]` renders; `onResolveProposal` returns | Pills x 6→0 stagger 40 ms; accepted card border flashes `status-ok` then height collapses (Flip on the list); discarded opacity .4 | core + Flip | 180 / 320 ms | Instant |
| 15 | Dialog / palette | Open / close | Scrim opacity 0→1 (120 ms); panel scale .98→1 y 6→0 (200 ms `expo.out`); close reverses in 120 ms; result rows stagger 15 ms | core | 200 ms | Appears |
| 16 | Opening overlay | `opening` set / cleared | Root `fixed inset-0` opacity 0→1 only (150 ms), geometry never animated so `coversWindow` holds from first paint; card scale .96→1 y 8→0 (220 ms `power3.out`); `ProgressRing` arc sweeps via CSS keyframe 1.6 s; mono clock ticks as today | core + CSS | 150 / 220 ms | Root instant; ring static; clock still ticks (`\d+s` pin) |
| 17 | Hover plates and hover cards | Pointer enter / focus-visible after 350 ms | Opacity 0→1 y 4→0 | core | 120 ms | Instant |
| 18 | Constellation settle | Scene mount with a cached layout; data change | Bodies tween **from previous (cached) positions to new** via `gsap.to(positionsRef, …, onUpdate: invalidate)`; a body with no cached position starts at its nearest dependency's position, not at the origin **[MF: no bloom-from-origin replay]**; tethers redraw via `dashOffset`; hover dims non-neighbours (instance colour lerp 160 ms) | core on R3F refs | 600 ms `power3.inOut` | Final layout immediately; hover dim instant |
| 19 | Spine parallax | Pointer move over the Spine band | Camera yaw/pitch ±0.08 rad via `gsap.quickTo`, `invalidate()` per update | core | 300 ms `power2.out` | Fixed camera |
| 20 | Console open / close and row expand | Footer toggle; row click | Wrapper `div.h-64` height 0→256 opacity (240 ms); row `height:'auto'` (200 ms) and `<pre>` fade | core | 240 / 200 ms | Instant |
| 21 | Document finding focus | `DocumentView` opened from a "What is missing" finding | After `scrollIntoView`, the `[data-highlighted="true"]` card's ring opacity pulses twice 1→.3→1 then rests; `ring-2 ring-brand-200` classes unchanged (e2e count-1 pin; brand-200 now defined so the ring renders) | core | 2 × 600 ms `sine.inOut` | Static ring |
| 22 | Clash resolve | A clash card resolved | Out x −12 opacity (200 ms); next card in x 12→0 (200 ms); "(N left)" counter rule #11 | core | 200 ms | Instant |
| 23 | Sync chip | `syncState.kind` changed | `StatusDot` crossfade and label crossfade (no MorphSVG: the chip has no path to morph) | core | 200 ms | Swap |
| 24 | Resize handle | Hover / focus | Accent grip opacity 0→1 only; **no width transition** (chatLook exact 380 on double-click) | CSS | 120 ms | Instant |
| 25 | Theme / density change | Toggle | `html.theme-switching` colour transition 200 ms; lists Flip on density | CSS + Flip | 260 / 300 ms | Instant |

---

## 5. Three.js scenes — `src/scenes/*`

### 5.0 Shared scene infrastructure (`src/scenes/core/`)

| File | Responsibility |
|---|---|
| `webgl.ts` | `canUseWebGL(): boolean`, memoised: `document.createElement('canvas').getContext('webgl2') ?? getContext('webgl')` in try/catch; false in jsdom (null) and after a `webglcontextlost` was observed (module flag; `onWebGLChange` subscription). No env var is read: the renderer runs with `sandbox: true` and `contextIsolation`, so a process env var cannot reach it **[MF]**. |
| `sceneDefaults.ts` | `DEFAULT_SURFACE: 'graph' \| 'table'` = `'table'` when `import.meta.env.MODE === 'test'` (both vitest and `vite build --mode=test`), else `'graph'`. `AMBIENT_ENABLED = MODE !== 'test'` **[MF: Ambient gated in test builds]**. `MAX_DPR = 1.5`. `MAX_BODIES = 400` (above → Table with a notice). `SYNC_LAYOUT_MAX = 150` (above → incremental ticks). |
| `SceneShell.tsx` | The only component screens import, and the only place a `<Canvas>` is created. Props: `id`, `title`, `summary` (sentence for `aria-label`), `legend` (the honesty line), `surface`, `onSurfaceChange`, `table: ReactNode` (**required**; a scene without a DOM equivalent does not compile), `children` (the R3F tree). Renders `<figure aria-labelledby={titleId}>` → header row (`Eyebrow` title + `Surface3DToggle`) → body → `<figcaption>` = legend. Body: when `surface === 'table' \|\| !canUseWebGL() \|\| width < 640` → `table` only (three is never `import()`ed). Else `<Suspense fallback={table}><ErrorBoundary fallback={table + Notice}><LazyCanvas/></ErrorBoundary></Suspense>`, `LazyCanvas = React.lazy(() => import('./CanvasHost'))`. Guards: `IntersectionObserver` (guarded, falls back to visible) pauses offscreen; `visibilitychange` pauses; a **module-level registry allows one live Canvas at a time** (Electron's 16-context cap): mounting a second disposes the first's loop and shows its table; `webglcontextlost` → table + notice; `webglcontextrestored` → remount. Canvas wrapper `aria-hidden="true"`; the Plates and the table carry the text. Never an `<aside>`, never `aria-current`, never an `<input>`. |
| `CanvasHost.tsx` | `<Canvas frameloop="demand" dpr={[1, MAX_DPR]} flat gl={{ antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: false }} resize={{ debounce: 50 }} onCreated={({gl}) => { gl.setClearAlpha(0); gl.toneMapping = NoToneMapping; gl.outputColorSpace = SRGBColorSpace }}>` so hex tokens render exactly. `<fogExp2 attach="fog" args={[surface0, 0.06]}/>`. Registers `webglcontextlost`. |
| `useThemeColors.ts` | Reads `getComputedStyle(document.documentElement).getPropertyValue('--color-…')` into `THREE.Color` via `setStyle` (ColorManagement converts sRGB → linear); re-reads on a `MutationObserver` for `data-theme` on `<html>` and calls `invalidate()`. |
| `useDemandLoop.ts` | `useDemandLoop(live: boolean)`: while `motion.enabled()` and the scene is live (pointer inside, a scene timeline playing, orbit damping unsettled) it calls `invalidate()` at ≤ 30 fps from `gsap.ticker`; an idle scene renders **zero** frames. Also the mechanism for orbit damping: `controls.update()` runs inside this loop until the velocity drops below 1e-4 **[MF]**. |
| `glowTexture.ts` | 64×64 `DataTexture` radial falloff (`a = smoothstep(1, 0, r)^2.2`), `SRGBColorSpace`, generated once. The only texture in the app; additive sprites give bloom without post-processing. |
| `Plates.tsx` + `projectLabels.ts` | `useProjectedPositions(anchors: Vector3[])` → `{x, y, visible, depth}` per anchor, recomputed in `useFrame` (demand) and written to refs (no React state per frame). `Plates` renders a DOM `<ul>` of absolutely positioned `<li><button>` labels **outside** the canvas: real buttons, clickable, focusable, readable; `transform: translate3d()`; depth → opacity .55…1 and scale .9…1. Accessible names are never a bare spec id: `aria-label="Spec 0002: claim export"` so `getByRole('button', {name: '0002', exact: true})` (`sprint.spec:142`) can never match a plate **[MF]**. Hovering or focusing a plate sets the shared `hoverId`, so keyboard users see the same 3D emphasis. |
| `materials/` | `RailMaterial.ts`, `RingMaterial.ts`, `TetherMaterial.ts`, `FieldMaterial.ts`: `ShaderMaterial` wrappers with typed uniforms; shaders are inline strings (not CSP-governed). |
| `layout/forceLayout.ts` | `d3-force-3d` (`src/types/d3-force-3d.d.ts` already present): `forceLink(dependsOn).distance(2.2).strength(.7)`, `forceManyBody(-3.5)`, `forceCenter()`, `forceZ(0).strength(.15)` for a shallow slab, plus `forceOrderX` pulling `x → (buildOrderIndex − mid) · 0.9` (strength .6) so the plugin's order reads left → right. Seeded by hashing spec ids to initial positions. Synchronous 240 ticks for N ≤ 150 (≈ 5–15 ms); above that 60 ticks then 20 incremental ticks per frame for ≤ 2 s with `invalidate()` **[MF]**. Positions cached per project in `localStorage['studio.constellation.<hash(projectPath)>']` (layout only, never judgement). No worker (CSP). |
| `lights.tsx` | `<hemisphereLight args={[surface0, surface3, 0.9]}/>` + `<directionalLight position={[4, 6, 5]} intensity={0.7}/>`; dark swaps hemisphere colours and lowers intensity to 0.6. |
| `spineStore.ts` (`src/stores/`) | Tiny `useSyncExternalStore` store `{ hover: stageId \| null }` written by Sidebar row hover and read by the Spine, so spatial memory works without touching the pinned sidebar markup. |
| `backlogStore.ts` (`src/stores/`) | Last `Board.rows` and `SprintView.slate` written by BuildBoard / SprintBoard on fetch; read by the palette index (§6.1). No IPC. |

### 5.1 Lifecycle Spine — `src/scenes/spine/`

| Aspect | Specification |
|---|---|
| Purpose | Make the nine-phase journey a *place*: where the project is, what a named person signed, what completed without a name, what is later. The same facts as the sidebar, as an instrument. |
| Location | **StageHome** hero band above the h2 (168 px comfortable / 120 px compact, full `<main>` width, collapsible via chevron, state in `localStorage['studio.spine.collapsed']`, auto-collapsed below `md` and in compact density), and the **FeatureCompleteScreen** header (200 px). Nowhere else **[MF: not in Settings or SetupFlow]**. Sidebar untouched; hovering a sidebar row sets `spineStore.hover`. |
| Exact plugin data | `ProjectStatus.stages[]` → `id` (station key and order), `display` (plate), `stage_state` (`signed_off \| current \| later` → ring), `signed_off_by` (plate; `null` or blank → "no name recorded" and the hollow **completed** look via `nodeKind()` from `shared/nav.ts`, never re-derived), `entered_at` / `completed_at` (plate text as dates or "—"; never a length), `artifact_count` (plate "N artifacts"). `ProjectStatus.current_phase.id` (which station breathes). `currentDocs {complete, total}` from `StageReadinessContext` for the current station only → partial arc, only when both are numbers. `groupStages()` → captions Foundation / Build / Ship / Close. `BUILD_STAGE_ID` station is a loop (torus knot) because Build is continuous; its plate lists the five `BUILD_VIEWS`. Nothing else. |
| Geometry | Rail: `CatmullRomCurve3` through 9 points `x = (i−4)·1.15, y = sin(i·0.55)·0.18, z = cos(i·0.4)·0.25` → `TubeGeometry(curve, 160, 0.035, 10)`. Station: `TorusGeometry(0.22, 0.028, 12, 48)` ring + `CircleGeometry(0.16, 32)` core + `Sprite` halo (glowTexture, size 1.1, additive). Build station: `TorusKnotGeometry(0.18, 0.025, 64, 8, 2, 3)`. Partial doc arc: thin torus with `thetaLength = 2π · complete/total`. Group ticks: thin `PlaneGeometry` under the rail; captions are DOM. Ground: `PlaneGeometry(14, 6)` with a distance-faded grid shader. ≈ 2.6 k triangles. |
| Materials / shaders | `RailMaterial`: uniforms `uLit` (fraction of rail from start to the last signed station, from the ordered `stage_state` list), `uCurrent` (u of the current station), `uDraw` (0→1 for the first-open draw), `uLine`, `uSigned`. Fragment: `vUv.x ≤ uLit` → `uSigned` with emissive lift; `uLit < vUv.x ≤ uCurrent` → **flat `uLine`, no gradient** (a between-stations progress cue the plugin never reported) **[MF]**; beyond `uCurrent` → dashed `step(.5, fract(vUv.x·48))` in `uLine` at 60 % alpha. `RingMaterial`: `signed` = filled ring + core in `stage-signed`; `completed` = ring in `stage-signed`, core hollow; `current` = ring `stage-current`, core breathing via `uPulse`, halo 0.5; `later` = dashed ring (`discard` on `fract(atan(y,x)/6.283·24) > .5`) in `stage-later`. `NoToneMapping`. |
| Camera / lights | `PerspectiveCamera fov 24, position (0, 2.0, 8.6), lookAt (0, −0.1, 0)`; parallax ±0.08 rad (§4 #19); no orbit. Lights per `lights.tsx`. |
| Interactions | Hover station or plate → plate expands (display, `stageStateLabel`, signed-off-by, entered / completed, artifacts; Build adds the five views); halo 0.5→0.8. Click plate → `onNavigate(targetForStage(id))`. Keyboard: plates are buttons in DOM order; Tab walks stations; Enter / Space navigate; `[` / `]` global. Sidebar hover ⇄ station highlight via `spineStore`. |
| DOM-equivalent (Table) | `<ol aria-label="Lifecycle">` of 9 rows, each a `<button>`: display · state label · signed-off by or "no name recorded" · entered · completed · artifacts; group header rows; current row with `Badge now`. Same click targets. This also feeds the `summary` ("Phase 3 of 9 current; 3 signed off; next: Build"). It lives in `<main>`, never inside the sidebar `<aside>` (`sidebar.test` `data-node` assertions run on sidebar markup only). |
| WebGL fallback | The Table plus `Notice tone=info` "Showing the journey as a list; hardware graphics are unavailable here." Default surface in `--mode=test` builds. |
| Performance | One Canvas; `frameloop="demand"`; renders only on hover, parallax, data change, ceremony; `dpr ≤ 1.5`; no shadows; disposed on collapse / unmount; `IntersectionObserver` pause when scrolled out of `<main>`. |
| Honesty notes | Lit rail length = count of signed stations, never time. Equal station spacing (time is not a length). Later stations are dashed and carry no date, no ETA, no "planned". `completed` and `signed` differ in shape and plate text. The only percentage is the sidebar's existing `done of total`. The arc appears only when `currentDocs` is known. Never reads `check_gates.py`. Figcaption (as built): "Nine stages in the plugin's order; the lit rail counts finished stages — signed off, or completed with no name recorded. Height and depth carry no meaning." |

### 5.2 Dependency Constellation — `src/scenes/constellation/`

| Aspect | Specification |
|---|---|
| Purpose | Show the backlog as the dependency structure it is: what depends on what, the plugin's build order, what is next up, which specs are NOT READY, and (as text) where the plugin says the gaps are. |
| Location | **Sprint screen**: mounted by `SprintScreen` (`SprintBoard.tsx:47`, already a wrapper that returns `<SprintBoard>`) **above** `<SprintBoard>`, so the `SceneShell` and its `Surface3DToggle` sit **outside** `[data-testid="sprint-board"]` (`SprintBoard.tsx:33` puts the testid on the whole screen) and `sprint.spec:135`'s exact button list `['Planning page','Refresh','Review page']` is untouched **[MF]**. Default surface per `sceneDefaults` (Table in test builds, Graph otherwise; remembered in `studio.sprint.surface`). Not in the compact ActivitiesPanel variant. **Build Board**: same scene behind a `List \| Graph` toggle in the filter bar, **List default always** (`board.spec` clicks `main li button`); Graph shows the constellation of the currently filtered rows. |
| Exact plugin data | Sprint bodies: `SprintView.slate[]` → `id`, `name` (plate), `status` (body colour via the `SprintBoard` `CHIP` tone map), `risk` (**body radius**: LOW .32 / MEDIUM .42 / HIGH .54), `type`, `channel` (plate), `dor` + `dorBlocking[]` (NOT READY → thin **amber** equator ring in `status-warn` **[MF: not red]**; blocking items on plate), `sprint`, `nextOwner`, `engReview`, `dataReview` (plate, verbatim), `dependsOn[]` (tethers). `SprintView.buildOrder[]` → numbered plate badge and keyboard order. `SprintView.nextUp` → halo 0.8 + "Next up" ribbon. `SprintView.dependencyGaps[]` (`string[]`, `shared/types.ts:1460`) → **rendered verbatim as a `Notice tone=warn` under the figure, never parsed, never drawn** **[MF]**. `SprintView.hasData === false` → no scene; the `note` or `NoData` text. Board bodies: `BoardRow` → `spec`, `title`, `status`, `risk`, `team`, `sprint`, `dependsOn[]`, `pullRequest?.waitingOn` (plate sentence), `pullRequest?.overAlarm` (plate chip in warn tone; `waitHours` text only). **Not** `daysWaiting`, `isOverdue`, `teamLoad`, `teamLimits` (Studio-side helpers in `boardModel.ts`; never re-encoded spatially). |
| Ghosts | A body is a Ghost when a `dependsOn` id is **absent from the slate (or from the filtered Board rows)**. That is the only rule: data, not prose **[MF]**. Ghost = same icosphere, `wireframe: true`, `ink-4` at 50 %, dashed tether in `ink-4`, plate shows the id and "not in this sprint" (Sprint) or "not shown" (Board, filtered out). |
| Geometry | Bodies: one `InstancedMesh(IcosahedronGeometry(1, 2), MeshStandardMaterial{ roughness .55, metalness .1 }, N)` with per-instance matrix (position, radius) and `instanceColor`. Rings (NOT READY, overAlarm): `InstancedMesh(TorusGeometry(1.15, .03, 8, 40))` for the flagged subset. Halos: `InstancedMesh(PlaneGeometry(1,1))` billboarded in the vertex shader, additive glowTexture, per-instance `aGlow` (nextUp 0.8, hover / focus 0.6, else 0). Tethers: `LineSegments2` + `LineMaterial` from `three/examples/jsm/lines/*` (plain JS, no fetch, no worker), `linewidth 1.6`, `worldUnits false`; direction cones `InstancedMesh(ConeGeometry(.08, .22, 8))` at 82 % along each edge. Slab bed: faint grid plane. |
| Materials / shaders | `TetherMaterial` extends `LineMaterial` via `onBeforeCompile` adding `uFlow` so the dash travels dependency → dependent only while motion is on and the pointer is inside; ghost tethers dashed, no flow. Body colour by `status`; hover: non-neighbours lerp to `ink-4` at 35 % over 160 ms; selection ring in `accent-500`. Fog as 5.1. |
| Camera / controls | `PerspectiveCamera fov 40, position (0, 3.5, 11)`; hand-rolled orbit (`orbit.ts`: spherical coords, damping .12 driven by `useDemandLoop`, polar clamp 0.35…1.4 rad, radius clamp 6…24; drag = orbit, wheel = zoom, double-click = recentre on `nextUp` or the centroid). Shift+arrows orbit and `+`/`−` zoom when the figure is focused. |
| Interactions | Hover body / plate → plate expands, neighbours stay lit, others dim, incident tethers thicken to 2.4. Click plate → `onOpenSpec(row)` (Board row, or the Sprint slate mapped to a `BoardRow`-shaped row exactly as today) with the shared-element Flip (§4 #8). Keyboard: plates are buttons in `buildOrder` order; Tab walks them; `↑/↓` jump previous / next in build order; Enter opens; Esc clears hover. Drag a body → re-position (layout only, cached; never a write, §6.4). |
| DOM-equivalent (Table) | **Sprint: the existing `SlateTable` (`sprint-slate`, 10 columns) plus the "Build order", "Next up" and "Dependency gaps" section cards are the Table surface**; the toggle only hides or shows the Canvas and the data path is unchanged. No second table, so `sprint.spec:112` (`getByText('NOT READY')` count 3) and `sprint.spec:142` (strict `getByRole('button', {name: specId})`) hold **[MF]**. Board: the grouped list is the Table surface. |
| WebGL fallback | Table surface plus the info notice; `N > MAX_BODIES` → Table with "Too many specs for the graph (N); showing the table". |
| Performance | ≤ 400 bodies in 2 instanced draws + 1 line draw + 1 cone draw; layout once per data change (sync ≤ 150, incremental above); `frameloop="demand"`; flow dash and hover drive `invalidate()` at ≤ 30 fps only while live; raycast against the instanced mesh on `pointermove` throttled to 60 Hz; buffers reused when N is unchanged; disposed on unmount; positions cached. |
| Honesty notes | Radius = `risk` tier only. No size or brightness for age, wait, points, PR count or LOC. `nextUp`, `buildOrder`, `dor`, `dependencyGaps` are verbatim from `sprint.py status --json`; the scene never derives "blocked" or "critical path"; a cycle is only ever the plugin's prose. x follows `buildOrder`; **y and z carry no meaning** and the figcaption says so. No per-person grouping in 3D (grouping stays a list-view select). Edge direction is "depends on" and the legend states it. Figcaption (as built): "Bodies are specs sized by risk tier; edges are depends_on as declared; x follows the plugin's build order and the thin accent path joins the slate in that order; y and z carry no meaning." |

### 5.3 Ambient Field — `src/scenes/ambient/`

| Aspect | Specification |
|---|---|
| Purpose | First-open atmosphere on screens with **no project data**: Welcome, NewProject, SetupFlow, ToolingIssues. Pure decoration; carries no information. |
| Data | None, deliberately. |
| Gate | Rendered only when `AMBIENT_ENABLED` (MODE ≠ test) **and** `motion.enabled()` **and** `canUseWebGL()`; otherwise the CSS radial gradients already in `index.css body` show (an `.ambient-fallback` div) **[MF]**. Under xvfb e2e the chunk is never loaded. |
| Visual | `Points` (1 200) in a 16×9×4 slab; `FieldMaterial`: `gl_PointSize = 1.6 · (1.5/−mvPosition.z) · dpr`, soft disc alpha `smoothstep(.5, .2, length(gl_PointCoord − .5))`, colour `ink-4` at 35 % (dark: `accent-300` at 25 %), additive in dark; 3-octave value-noise drift in the vertex shader (amplitude 0.02 u/s). Camera fov 35 at z 10. Fades in over 600 ms. Pointer parallax ≤ 2 %. |
| Interactions / DOM / fallback | `pointer-events: none`; `aria-hidden="true"`; no DOM equivalent needed; fallback is the CSS gradient. |
| Performance | One draw call; `frameloop="demand"` with `useDemandLoop` invalidating at 24 fps from `gsap.ticker` while visible **[MF: not `always` with a skipped callback]**; DPR 1; paused on hidden; unmounted when a project opens. |

### 5.4 Honesty rules common to every scene (enforced structurally)

| Rule | Enforcement |
|---|---|
| No fabricated zero | Null → absent geometry (no arc, no body, no bar) + `NoData` text on the plate; `useCountUp` never starts from 0 |
| No Studio-computed status | Scenes consume `ProjectStatus`, `SprintView`, `Board` as typed; the only derivations are positions, the signed-fraction of the rail by ordered state, and colours via tone maps already in `SprintBoard` / `nav.ts` |
| No parsing of plugin prose | `dependencyGaps`, `note`, `waitingOn`, `dorBlocking` are rendered as text only; `constellationModel.test.ts` asserts no string field influences geometry or colour |
| No per-person totals | Plates show handles the plugin returned for that one spec; no grouping, counting or ranking by person in 3D |
| No activity metrics | Radius / brightness bound only to `risk`, `status`, `nextUp`, `dor`, `overAlarm`; a unit test asserts the scene reads only an allow-list of fields |
| Equivalent DOM view of equal rank | `SceneShell` requires `table`; the toggle is a Segmented of equal rank, not a fallback link; the figure's caption is read by AT |
| Amber stays amber | Warn-class facts (NOT READY, gaps, overAlarm) use `status-warn`; `status-error` is reserved for hard errors and refusals |

### 5.5 Optional extras (separate, security-gated PR "WE"; new read-only IPC)

| Extra | IPC (read-only, pollable) | Script | Where | Form | Honesty |
|---|---|---|---|---|---|
| Artifact Impact drawer | `getArtifactImpact(projectPath, idOrPath) → {target, downstream[{node, path[], confidence}]}` | `audit_artifacts.py impact --json` (exists) | DocumentView header "Impact" button → drawer | **2D SVG tree** drawn with DrawSVG: `declared` solid, `coarse` dashed, depth ≤ 3 (more legible than 3D) | Shows only reported downstream; no staleness verdict computed |
| Decision Clock | `getDecisions(projectPath) → track_decisions --json shape` | `track_decisions.py --json` (exists) | Sprint `sprint-decisions` card; sidebar footer badge | SVG arc per open decision = `business_days_open / clock_business_days`; `overdue` flag is the plugin's | `business_days_open: null` → no arc, `NoData` |
| Gate Audit ledger | `getGateAudit(projectPath) → audit_gates --json shape` | `audit_gates.py --repo --json` (read-only; never `check_gates.py`) | ExplainViews › Gates | `DataTable` with stacked runs / passes / fails / manual bar in `surface-3`; `fail_rate` text | `enough_data: false` → "Not enough phases yet"; `fail_rate: null` → `NoData` |

The Spine, Constellation and Ambient Field need **no** new IPC.

---

## 6. Interaction mechanics

### 6.1 Command palette — `src/palette/*`

| Facet | Specification |
|---|---|
| Open | ⌘K / Ctrl+K anywhere (also inside inputs); `/` when focus is not in an editable element; a `Button variant=ghost` "Search or jump… ⌘K" in the Sidebar footer (a `<button>`, no `<input>`). |
| Shell | `Dialog` portal into `#overlays`; `role="dialog" aria-modal aria-label="Command palette"`; `<input role="combobox" aria-expanded aria-controls="palette-list" aria-activedescendant aria-autocomplete="list">`; `<ul role="listbox">` grouped with `role="group" aria-labelledby`; `li role="option" aria-selected`; `aria-live="polite"` count "7 results". **The `<input>` exists only while open** (`board.spec:189`, `sprint.spec:136` count 0). Rendered **only while open**; never an `<aside>`. |
| Index (`paletteIndex.ts`, pure; built from renderer state; **the palette never calls `window.studio.*`**) | **Stages** (`status.stages[]` → "Go to Phase N: Display", `targetForStage`, state chip) · **Build views** (`BUILD_VIEWS` → Board / Sprint / How it is going / Closing / Documents) · **Specs** (`backlogStore` rows → "Open spec 0008 — title"; empty group reads "Open the Board once to index specs") · **Documents** (`readiness.documents[]` of the viewed stage → "Open requirements.md"; findings → "Go to FR-002 in Requirements") · **Settings** (section anchors: Repository, Gate approvals, Connection, People, Build limits, Change approval, Tooling, Fixed rules, Appearance) · **Actions** (Toggle theme System/Light/Dark, Toggle density, Toggle animations, Toggle console, Toggle chat, Collapse/expand Spine, Graph/Table for the visible scene, **Refresh this screen**, Copy project path, Keyboard shortcuts, Back, New project…, Open folder…) · **Recent** (last 8 picks, `localStorage['studio.palette.recent']`). |
| "Refresh this screen" | Defined as **P-class reads only**: re-runs the current screen's own refresh (`getStageReadiness` via `StageReadinessContext.refresh`, `getSprintStatus` via SprintBoard's reload, `getBoard` via BuildBoard's reload). It **never** calls `openProject` or `pull` (both W-class and unmutexed until Batch 4 F9) **[MF]**. |
| Never does | Execute a write. No "Pull now", no "Refresh project status", no "Switch to recent project" until `locks.ts` exists. "Sign off", "Hand off", "Mark ready" are navigation entries only and stay on their screens with their guards. |
| Prefix filters | `>` actions · `#` specs · `/` documents · `@` stages. **No people search** (no per-person views). |
| Matching | `score.ts`: dependency-free subsequence scorer with word-start and mono-id-prefix bonuses and a recency boost; max 12 results; ties by group order; unit-tested. |
| Keyboard | ↑/↓ wrap, Home/End, Enter run, Tab/Shift+Tab cycle groups, Esc close and restore focus to the opener, Backspace on empty clears the prefix. |

### 6.2 Keyboard shortcut map — `src/shortcuts/useShortcuts.ts` (one `window` keydown listener in Frame; ignores events from input / textarea / select / contenteditable unless the binding is `inInputs: true`; chords in an 800 ms window; modifier by `navigator.platform`)

| Keys (mac / win) | Action | Scope | Conflict check |
|---|---|---|---|
| ⌘K / Ctrl+K (`inInputs`) | Command palette | global | none |
| `/` | Command palette | outside inputs | Board search is reachable from the palette |
| ⌘/ or `?` | Shortcuts help `Dialog` | global / outside inputs | none |
| ⌘J / Ctrl+J (`inInputs`) | Toggle console | project | none |
| ⌘⇧C | Focus chat composer | project | none |
| ⌘, | Settings | project | macOS convention |
| ⌘⇧D | Cycle theme system → light → dark | global | not an Electron default |
| ⌘⇧M | Toggle animations | global | none |
| ⌘⇧L | Toggle density | global | none |
| ⌘\ | Toggle chat panel visibility (width unchanged; the `<aside>` stays in the DOM order) | project ≥ `sm` | chatLook pins width, not visibility |
| `g` then `b` / `s` / `h` / `c` / `d` | Board / Sprint / How it is going / Closing / Build documents | project, outside inputs | GitHub-style sequence |
| `g` then `0`–`9`, `g` `.` | Go to stage by phase id (`.` = close) | project | none |
| `[` / `]` | Previous / next stage home | project, outside inputs | none |
| `1` / `2` / `3` | Workflow / Documents / Guide tab on StageHome | StageHome, outside inputs | none |
| Alt+↑ / Alt+↓ | Previous / next document in the stage | DocumentView | none |
| ⌘S | "Save field" when a `FieldEditor` is open; no-op otherwise | DocumentView | none |
| Esc | Layered: close dialog / palette / hover card → clear 3D hover → clear Board search → **back** (`onBack` of DocumentView / SpecStatusView, `onClose` of HandoffDialog) **only when nothing is being edited** (no `FieldEditor` draft, no hand-off form with text, no open AI proposal) **[MF]** | project | overlay keeps its own capture-phase blocker |
| Enter / Space on a spec row | Open spec (rows are already `<button>`s) | Board, slate | none |
| ↑/↓ in Board list | Roving focus between spec row buttons | Board | none |
| ←/→, Home/End | Tabs, Segmented, palette, plates | component | none |
| ←/→ on resize handle | Existing (`KEY_STEP` 24) | chat | none |
| Avoided | ⌘W / Q / R / 1–9, F-keys | — | Electron and OS defaults |

### 6.3 Focus model

| Situation | Behaviour |
|---|---|
| Navigation (area, stage, document, spec, back) | After `useEnter` resolves (or immediately when off) focus moves to the screen's `<h2 tabIndex={-1} data-page-heading>` with no visible ring on programmatic focus (`:focus:not(:focus-visible)`); one polite live region in Frame announces "Phase 2: Design — Workflow" / "Spec 0008". |
| Back | Focus returns to the element that opened the detail (`flipStore` keeps the opener ref: the document row, spec row or finding button). |
| Skip link | `<a href="#main">Skip to content</a>` first in `#root`; `<main id="main" tabIndex={-1}>`. An `<a>`, not an `<aside>` (`stepAuthoring` `aside.first()` remains the sidebar). |
| Dialogs / palette | Trap (Tab / Shift+Tab wrap), Esc, restore to opener. |
| OpeningOverlay | Keeps the capture-phase Tab / Enter / Space blocker and the blur; **adds** focus into the card (`tabIndex=-1`) so AT announces `aria-label`, and restore of the previously focused element on unmount. Root attributes unchanged (`openingOverlay.test.ts`). Navigation focus is deferred until the overlay unmounts. |
| Focus rings | Global `:focus-visible { box-shadow: var(--ring) }`; the two bespoke overrides (`TEXT_INPUT` `outline-none`, handle `focus-visible:bg-brand-100`) are removed in favour of the ring. |
| Segmented / Tabs | `aria-pressed` / `aria-selected`, roving `tabIndex`, arrows. |
| 3D | Plates are DOM buttons; the figure wrapper has `tabIndex={0}` only for orbit / zoom keys, with `aria-keyshortcuts`. |
| Sign-off checkbox | After confirming a judgement, focus stays on the checkbox; when `SignOffPanel` appears it is announced, not focused. |
| Chat composer | `Enter` sends unchanged; composer focus on "Talk it through" unchanged. |

### 6.4 Drag and drop — only where a write verb exists

| Gesture | Maps to | Writes? | Status |
|---|---|---|---|
| Chat resize handle drag / double-click | Existing `useChatWidth` (`localStorage`) | No | Unchanged; `Kbd` hint in tooltip |
| Console height handle drag | New local pref `studio.consoleHeight` (default 256), same `role="separator"` pattern | No | New |
| Constellation body drag | Layout position only (`studio.constellation.<hash>`) | **No** (no position verb exists; drag never changes `status`, `sprint`, `dor`) | New |
| Constellation orbit / zoom | Camera only | No | New (pointer; GSAP `Observer` lazy for unified pointer / wheel) |
| Drag a spec onto a sprint / lane / person | would need `sprint.py slate --json` + IPC | — | **Not offered.** Batch 3 lists verdict / next / ack / ready / close, not slate; those are decisions needing a named human and a reason, which a drop gesture hides. `DropZone.tsx` is reserved behind a capability flag and renders nothing until the IPC exists |
| Risk tier | `setSpecRisk` exists | Yes | Stays a `Segmented`; drag adds nothing |
| Reorder slate, sidebar, document sections | Order is the plugin's | — | Never |
| Hand-off Developer | `handOff` exists | Yes | `RosterPicker` combobox replaces free text (UI half of Batch 3 roster pickers) |

### 6.5 Hover cards

| Trigger | Content (row or stage data only; never aggregates) |
|---|---|
| Spec row (Board, slate, plate) | mono id, title, status chip, risk, team, sprint, owner / developer / checker ("you" when `samePerson`), `dependsOn` chips, PR `waitingOn` sentence + `waitHours` as reported, `nextOwner` |
| Stage row (sidebar, plate) | `display`, state label, `signed_off_by` or "no name recorded", `entered_at`, `completed_at`, `artifact_count` |
| Document row | `description`, `findingCount`, `path` |
| Gate row (Gates view) | `fires_on`, `blocks`, `optional`, `state`, `detail`, `differs` |
| `SyncChip` | `lastPulledAt`, approver / checks state |
| Sprint chip | `id`, `goal`, `state`, `days.remaining` (null → "unknown") |
| Console row | command, duration, exit code |

Hover cards open on `mouseenter` (350 ms) **and** `focus-visible` (350 ms), close on leave / blur / Esc, are `role="tooltip"` when text-only or a non-modal `role="dialog"` when they contain a link, and **never contain a control that writes**.

### 6.6 Density, sticky headers, loading, empty, error, toasts

| Mechanic | Specification |
|---|---|
| Density | `data-density` on `<html>`; Sidebar footer popover, Settings › Appearance, palette, ⌘⇧L; kit reads `--pad-*`; tables drop zebra at compact; legacy class strings unaffected |
| Sticky headers | `sticky top-0 z-10 -mx-6 px-6 bg-surface-0/85 backdrop-blur` inside the screen root (`<main>` is the scroll container): StageHome title + tabs, DocumentView header, BuildBoard filter bar, SprintBoard header card, SpecStatusView title, Settings edit bar. `DataTable` headers sticky inside their own scroll box. **Not** WorkflowTab (pinned strings). The sticky wrapper is inside the screen root so `workflow.spec`'s `scrollWidth` compare is neutral |
| Loading | `Skeleton` shapes mirroring the final layout (3 rows / 2 tiles / 9 dots + a line for the Spine; fixed counts) with the original sentence kept as `role="status"` text; §4 #5 on arrival; `aria-busy` on the region; no spinner except the overlay |
| Empty | `EmptyState` with the original sentence verbatim; action when one exists ("Create", "Open the Board") |
| No data | `NoData what="…"`: "no data" + the producing sentence ("Run `sprint.py close` on a sprint to see rework") |
| Error | `Notice tone=error role=alert` (red banner) with Retry where a refetch exists; refusals and could-not-reach → `Notice tone=warn` in the plugin's words; `document-error` / `plugin-behind` testids preserved; errors are never duplicated as toasts |
| Toasts | Sign-off recorded (naming `signed_off_by`); hand-off done; field saved; restore done; export written (path + "Reveal"); clash resolved; "Copied". `ToastRegion` bottom-right over `<main>`, not over chat; max 3; hard errors stay inline |

---

## 7. Per-screen treatment

Every screen from inventory-renderer §1. "Pins" names the tests whose selectors or strings the row must preserve.

| Screen / component (file) | What changes | Motion (§4 #) | 3D | Tests to update |
|---|---|---|---|---|
| Loading (`App.tsx`) | Text "Loading…" unchanged (every e2e waits for it); centred on `surface-0`; Ambient behind only when `AMBIENT_ENABLED` | 1 (fade) | Ambient (gated) | none |
| ToolingIssues | `Card` + `Notice warn` per tool; `Field` path; `Button`; prepared for D4: becomes a non-blocking Notice on Welcome with per-feature `disabledReason` when F14 lands | 4 | Ambient (gated) | none (text pins) |
| WelcomeScreen | Two columns ≥ `sm`: title block (`text-2xl` SplitText h1, subtitle, primary "New project…", secondary "Open folder…" `rounded-xl` kept), Recent as `Card interactive` rows with path mono + hover card; theme toggle corner; `Kbd` hint ⌘K | 1 | Ambient (gated) | none |
| NewProjectScreen | `Card radius-4`; `Field label="Project name" id="new-project-name"` (id, autoFocus, Enter kept); `data-testid="new-project-target"` kept; errors `Notice error role=alert` | 15 | Ambient (gated) | `newProjectScreen.test.tsx` none |
| SetupFlow | `Card`; Playbook `Select`; "This will create" mono well `surface-2`. **No Spine preview** **[MF]** | 4 | Ambient (gated) | none |
| ClashScreen / ClashDiff | `Card` pair ("Your version" accent / "Their version" warn text tones); `<mark>` kept; fold toggles keep ▸/▾ text + `aria-expanded`; combined-draft `Notice info`; "(N left)" via `useCountUp` | 22, 11 | — | `clashScreen.test` none |
| OpeningOverlay | Root `fixed inset-0 z-50 … bg-slate-900/40` and `role="alertdialog" aria-modal aria-busy` + testid **unchanged**; card `radius-4 shadow-3`; spinner → `ProgressRing` (element keeps `animate-spin` class); focus into card + restore; renders in place (not portal) so `renderToStaticMarkup` sees it | 16 | — | `openingOverlay.test.ts` none; documents.spec coversWindow + `\d+s` none |
| **Frame** | `#overlays` portal root; `SkipLink`; `<main id="main" tabIndex=-1>` keeps class `min-w-0 flex-1 overflow-auto p-6` and **renders `{children}` directly** (no wrapper) **[MF]**; `ToastRegion`; `<CommandPalette/>` slot; `useShortcuts()`; live regions; `React.memo(Sidebar)`, `React.memo(ChatPanel)`; `consoleEntries` leaves props → `src/stores/consoleStore.ts` (`useSyncExternalStore`) subscribed by `Console` only (prop kept optional for the two jsdom tests mounting Frame); `onNavigate` `useCallback` in App; still exactly two `<aside>` in the same order | 2, 3 | — | `documentEditRefresh.test.tsx`, `stageReadinessSharing.test.tsx` pass (setupTests stubs; **zero new `window.studio.*` calls**) |
| **Sidebar** | Aside class **unchanged** (`w-72 … max-h-[50vh] sm:max-h-none`); markup shape unchanged (`renderToStaticMarkup` tests). Classes → tokens; `ProgressBar` keeps the `h-1.5` bar markup + adds `role="progressbar"`; `data-node` kept; "Now" chip gets `data-flip-id="now"`; lucide icons replace the 4 inline SVG paths; footer gains "Search ⌘K" and "Appearance" `<button>`s (no `<input>`, no `aria-current`, no `role=tab`); row hover writes `spineStore.hover`; `attachPulse` on the current node | 2, 9, 10 | — | `sidebar.test.ts`: still one `aria-current="page"`, `>Foundation<`, `data-node`, `max-h`, no `role="tab"`; **add** cases for `role="progressbar"` and footer `>Search<` / `>Appearance<` |
| **StageHome** | Spine hero band (collapsible) above the h2; h2 `text-xl data-page-heading tabIndex=-1`; `Tabs` kit (roving, `aria-controls`, `tabpanel`; `role="tablist" aria-label="Stage view"` kept); sticky title + tabs; Foundation `PipelineEvidencePanel`, Build "Build ends from Closing" card (`build-ends-from-closing`), `SignOffPanel` placement unchanged; "Checking this stage…" + skeleton; error `Notice` | 3, 7, 10 | **Spine** | `stageHomeTabs.test.tsx`: tablist / tab / aria-selected hold; **add** ←/→ and `aria-controls` cases; documents.spec `tab[aria-selected=true]` "Workflow" holds |
| **WorkflowTab** | Root class **exactly** `flex flex-col gap-6 sm:flex-row`; header string `flex flex-wrap items-center justify-between gap-2…` kept; Previous / Next keep attribute order `type="button" disabled=""`; locked / done rows contain no `<button` / `<a `; step cards → `Card interactive` keeping `workflow-step`, `data-step-key`, `data-step-status`, badge texts via `Badge`; **F11**: `FocusedActivityHost` renders the picked activity in the right (main) slot, left `sm:w-72` column keeps only the `<ol>` + `ActivitiesPanel` list; live panel `SectionCard`s | 4 (via parent ref), 5 | — | `workflowTab.test.ts` none (strings preserved); `workflowDocumentPanel`, `activities*` selectors hold; **new** `focusedActivityHost.test.tsx` |
| **DocumentsTab** | **Byte-for-byte unchanged in Waves 0–2** (dark via ramp remap). Wave 3: migrate to `Card` / `Chip` / `Button` and **replace `documentsTab.test.ts` with a named behaviour suite** that pins, before the rewrite: `data-tone` on rows, the "N to fill" amber chip, Not started / Complete labels, disabled folder / non-existent rows, finding buttons calling `onOpenDocument` with focus, `SignOffQuestions`, readiness banner **[MF]** | 4 (Wave 3) | — | Wave 3 only: `documentsTab.test.ts` rewritten; documents.spec e2e still green |
| GuideTab | `Card` for markdown (`guide-markdown` kept); `guide-activity` rows with `<code>` kept | 4 | — | `GuideTab.test` none |
| **DocumentView** | Sticky header (`BackLink` "← Back to the stage", filename h2 `data-page-heading`, mono path, History / Edit / Done `Button`s); notices → `Notice` (testids `plugin-behind`, `template-gaps`, `document-error` kept); "Changed since you last looked" `Notice info` + "Mark as seen"; Alt+↑/↓; ⌘S; **Impact drawer** (WE, optional) | 3, 21 | Impact SVG (WE) | `documentEditRefresh.test.tsx` text pins; e2e `[data-highlighted="true"]` count 1 holds |
| SectionCard / FieldRow (`DocumentSections.tsx`) | Free-text → `Card tone=inset`; shaped → `Card`; `<dl>` via `DefinitionList` + `Eyebrow`; highlight `border-brand-500 ring-2 ring-brand-200` kept; `data-section-key`, `data-highlighted` kept | 21 | — | none |
| FieldEditor | `Field` / `Select` / `Textarea mono`; `AiProposalCard`; "Save field" / "Revert" / "Ask Claude to draft" texts kept; save → toast | 15 | — | `aiProposalCard.test` none |
| HistoryPanel | `DataTable` versions; diff `<pre>` → `bg-surface-code text-slate-100`; restore confirm → `Dialog` (ack checkbox + "Restore as a new version" text kept) | 4, 15 | — | none |
| **BuildBoard** | Sticky filter bar; `Segmented tone=accent` roles (emits `bg-brand-600`); `Field` search (`placeholder="Search"`, inside `<main>`, unmounted on the spec view so `board.spec:189` holds); 4 `Select`s; grouped lists → `Card` + rows `<li><button data-flip-id="spec:…">` (`main li button` holds); hover cards; roving ↑/↓; **List \| Graph** toggle (List default) in the filter bar; team-load chips unchanged (text) | 4, 6, 8 | **Constellation** (Graph) | `board.spec` none (`bg-brand-600`, `bg-slate-900`, `input` 0, `main li button` hold); **new** `constellation.spec` toggles Graph |
| SpecStatusView | `BackLink` "← Back to the board"; title block `data-flip-id` target; 4-col `DefinitionList` in a `Card`; PR `Card` with `GitPullRequest` icon; checks / grader / security / approvals as `Chip` + `StatusDot` rows, texts kept; **reserved Batch-3 action slots** (Verdict, Pass next action, Acknowledge, Mark ready) rendered as `Button disabledReason="needs plugin sprint write verbs (Batch 3)"` until the IPC exists | 3, 8 | — | none |
| SpecReadinessPanel | Status `Card`; `Segmented tone=inverse` LOW/MEDIUM/HIGH (emits `bg-slate-900 text-white` on selected + `aria-pressed`); authoriser `Field`; "Still needed" / "Worth a look" `Notice`s; `<details>` passed checks kept | 7 | — | `board.spec:215-229` holds |
| HandoffDialog | Stays inline in `<main>`; roles `DefinitionList 3` in a `Card`; Developer → `RosterPicker` (an `<input>` inside `<main>` only); refusal `Notice warn`; "Hand off" / "Hand off anyway" / "Back to the board" texts kept; success → toast | 3, 12 | — | none |
| **SprintScreen / SprintBoard** | `SprintScreen` (`SprintBoard.tsx:47`) renders `<SceneShell id="constellation">` with its `Surface3DToggle` **above** `<SprintBoard>`, outside `[data-testid=sprint-board]`; SprintBoard body: header `Card` with `Chip`s (all `sprint-*` testids kept); `SlateTable` → `DataTable` keeping `sprint-slate-row`, `data-spec`, the DoR `<details>`; 7 section cards → `Card` in `md:grid-cols-2`; warnings keep an `amber` class; `dependencyGaps` card stays prose; `SprintPages` buttons unchanged; compact variant unchanged | 4, 18 | **Constellation** | `SprintBoard.test.tsx:104` (`amber`) holds; `sprint.spec:112/114/135/136/142` **unchanged** by construction |
| FeatureCompleteScreen | Spine band (200 px) on top; blocker cards `Notice warn` per team; Defer form `Field`s; per-team "@lead" confirm `Button`s; "Declare Build complete" `Button primary` always visible; declared view counters | 3, 4, 10 (on advance) | **Spine** | none (text pins) |
| ExplainViews | `Segmented tone=inverse` pill (`bg-slate-900` kept); Scorecard tiles → `StatTile` + `NoData` ("no data" text kept); 14/30/90 segmented; DORA `DefinitionList`; escaped bugs `Card`; "Not measured here, on purpose" `Notice info`; Gates `DataTable` (+ Gate Audit ledger, WE) | 7, 11, 4 | — | `scorecardExport.test.ts` none |
| SettingsScreen | Sticky edit bar; sections → `Card` + `Eyebrow`; Edit toggle `aria-pressed`; controls still absent outside edit mode; **Appearance** section new: Theme (System / Light / Dark), Density, Animations (auto / on / off with the opt-in note), Visuals default (Graph / Table); `tooling-facts` kept; People roster table (no totals). **No Spine preview** **[MF]** | 4, 7 | — | none; **new** `appearance.test.tsx` |
| GateAuthPanel | `Notice` / `Button`; refusal sentences verbatim | — | — | none |
| **ChatPanel** | `<aside>` classes kept (`w-full sm:w-[var(--chat-width)] max-h-[35vh] sm:max-h-none`); **no width transition**; h2 "Chat" + "Helping with:" kept; bubbles keep literal `bg-brand-600 text-white` (user), `bg-slate-100 text-slate-800` (assistant), `border border-dashed border-slate-300 bg-slate-50` (sub-agent); question pills `Chip as=button` keep `rounded-full`; composer `Textarea` keeps `data-testid="chat-composer-input"`; Send `Button`; **Stop slot** (`Button disabledReason="needs Batch 4 F15 cancel"`); `ConnectingChecklist` keeps `data-step-done` | 2 (inner), 13, 14 | — | `ChatPanel.test.tsx` className pins hold; chatLook 380 / `separator` / `strong≥3` / `li=4` hold; chatAuthoring `.bg-slate-100` / `.border-dashed` / `button.rounded-full` hold |
| ChatResizeHandle | Class keeps `hidden … sm:block`; `separator` + aria-values kept; adds a `::before` grip visible on hover / focus | 24 | — | `chatResizeHandle.test.tsx` none |
| Console | Header `Segmented` Plain / Technical (`aria-pressed`); rows `StatusDot`; expand §4 #20; stdout `bg-slate-900 text-slate-100` and stderr `bg-red-950 text-red-100` classes kept (dark exceptions handle them); pending rows `status-running`; new height handle | 20 | — | none |
| SyncChip | `Chip` + `StatusDot pulse` for pulling / saving; hover card; 30 s re-render kept | 23 | — | `sidebar.test` sync text pins hold |
| ActivitiesPanel + panels (PhaseReport, Intake, Batch*, Candidate*, Brief*, Narrative, Review, Pipeline, Registry, Sprint compact) | `Button size=sm` for `PANEL_BUTTON`; `Notice`; `Skeleton` beside kept texts; every `data-testid` and heading ("Also in this stage") kept; row `activity-row` + `data-activity-*` kept; `useDraftJob` / `useDraftBatch` 1 s clocks untouched (fake-timer tests; GSAP is off in MODE=test); panels open in `FocusedActivityHost`; **no new `window.studio.*` calls** (partial mocks) | 4, 5 | — | component tests none (texts / testids identical) |
| PipelineEvidencePanel, SignOffPanel, SignOffQuestions, TemplateGapsNotice, MarkdownView, AiProposalCard, RegistryResultView | Token / kit restyle; `MarkdownView` **untouched** (markup pinned); checkbox `aria-label` = question kept; `SignOffPanel` fires the ceremony after `signOffStage` ok **and** `refreshStatus` lands | 10 | Spine joins | `signOffPanel`, `signOffQuestions`, `markdownView`, `templateGapsNotice` tests none |
| Error banners (`App.tsx`) | In-project red banner → `Notice tone=error role=alert`; pre-project fixed toast → `Toast` | 12 | — | none |

---

## 8. Test and verification strategy

### 8.1 `test/setupTests.ts` — state and additions

| Stub | State today | Change |
|---|---|---|
| `afterEach(cleanup)`; `Element.prototype.scrollTo` | present | keep |
| `window.matchMedia` → inert `{matches:false, …}` | **already present** | keep |
| `ResizeObserver` inert class (window + globalThis) | **already present** | keep |
| `IntersectionObserver` inert class | absent | add, guarded |
| `HTMLCanvasElement.prototype.getContext` → explicit `null` for `webgl` / `webgl2` | jsdom returns null and logs "not implemented" | add the explicit stub so `canUseWebGL() === false` is deterministic and the console stays quiet |
| `document.fonts` → `{ ready: Promise.resolve() }` when undefined | absent | add (SplitText gate) |
| `localStorage` | present in jsdom | clear in `afterEach` |
| `requestAnimationFrame` | present (`pretendToBeVisual`) | leave |

Node-env tests (`renderToStaticMarkup`) never touch `window`; the kit stays SSR-safe.

### 8.2 Motion, theme and scene defaults in test mode

| Mode | Mechanism |
|---|---|
| vitest | `import.meta.env.MODE === 'test'` → `motion.enabled() === false`; every `useStudioGSAP` applies end state synchronously via the stub; no GSAP timers, so fake-timer tests (PipelineEvidencePanel, chatActivityLine, useDraftJob, useDraftBatch) are unaffected. `index.test` still sees `NODE_ENV === 'test'`. |
| Playwright (`vite build --mode=test`) | Same flag at build time → `data-motion="off"`, zero animation, geometry pins (380, coversWindow, 400 px, aside order) see the final layout immediately; a dedicated e2e asserts `document.documentElement.dataset.motion === 'off'` so the pin is explicit. |
| Scenes | `DEFAULT_SURFACE === 'table'` and `AMBIENT_ENABLED === false` in test builds; no Canvas mounts unless a test toggles Graph; under xvfb SwiftShader the toggled path is exercised by `constellation.spec` which accepts canvas **or** notice. |
| Theme | `data-theme` set only from a stored preference or `matchMedia` → light in jsdom and in e2e unless `appearance.spec` sets it. |
| WebGL in jsdom | `canUseWebGL()` false (null context); `sceneShell.test` spies on the lazy import factory and asserts it is never invoked. |

### 8.3 Pinned tests — change ledger (every pin; "unchanged" means preserved by construction in §7)

| Test | Pin | Decision |
|---|---|---|
| `test/documentsTab.test.ts` | byte-equal markup | Unchanged through Wave 2. Wave 3: `DocumentsTab` migrates to the kit and this test is **rewritten as a named behaviour suite** with the semantics in §7 listed as assertions first |
| `test/workflowTab.test.ts:184,218` | two class strings; attribute order; no `<button` in locked rows | Unchanged |
| `test/sidebar.test.ts` | one `aria-current`, `>Foundation<`, `data-node`, `max-h-[…] sm:max-h-none`, no `role="tab"`, Sprint pattern | Unchanged; **additions**: `role="progressbar"`, footer `>Search<` / `>Appearance<` |
| `test/openingOverlay.test.ts` | `fixed inset-0`, `aria-busy`, `aria-modal`, testid | Unchanged |
| `test/ChatPanel.test.tsx` | `max-h-[35vh] sm:max-h-none`, `--chat-width` 380/404/520 | Unchanged |
| `test/chatResizeHandle.test.tsx` | `hidden sm:block`, separator aria-values | Unchanged |
| `test/SprintBoard.test.tsx:104` | className contains `amber` | Unchanged (`Notice tone=warn` emits `amber` classes) |
| `test/stageHomeTabs.test.tsx` | tablist / tab / aria-selected | **Extended**: ←/→ and Home/End move `aria-selected`; `aria-controls` present |
| `test/documentEditRefresh.test.tsx`, `test/stageReadinessSharing.test.tsx` | mount real Frame with partial `window.studio` mocks | Pass: Frame adds zero `window.studio.*` calls; `consoleEntries` prop optional |
| `test/markdownView.test`, `signOffPanel`, `signOffQuestions`, `clashScreen`, `templateGapsNotice`, `newProjectScreen`, `GuideTab`, `activities*`, `brief*`, `intake*`, `batch*`, `candidate*` | texts / aria / testids | Unchanged |
| e2e `board.spec:127,148` | `bg-brand-600` on active segment | Unchanged (Wave 4 follow-up: migrate to `aria-pressed="true"`) |
| e2e `board.spec:215-229` | `bg-slate-900` on selected risk | Unchanged |
| e2e `board.spec:189` | page-wide `input` = 0 on the spec view | Unchanged: palette unmounted when closed; Board search unmounts with the list; shell has no inputs |
| e2e `sprint.spec:112` | `getByText('NOT READY')` count 3 | Unchanged: Sprint Table surface is the existing SlateTable; no second DoR column |
| e2e `sprint.spec:114` | `details[open]` = 1 | Unchanged |
| e2e `sprint.spec:135` | buttons inside `sprint-board` exactly Planning page / Refresh / Review page | **Unchanged**: toggle rendered by `SprintScreen` outside the testid |
| e2e `sprint.spec:136` | `main input` = 0 | Unchanged |
| e2e `sprint.spec:142` | strict `getByRole('button', {name: specId, exact: true})` | Unchanged: plates are not mounted in test builds and their names are never a bare id |
| e2e `chatLook` | exact 380 after double-click; drag ≤ 60 %; `strong≥3`; `li=4`; `separator` "Resize chat" | Unchanged: no width transition; MarkdownView untouched |
| e2e `chatAuthoring` | `aside … .bg-slate-100`, `.border-dashed`, `aside button.rounded-full` | Unchanged |
| e2e `documents.spec` | overlay covers window; `\d+s`; `tab[aria-selected=true]` "Workflow"; `[data-highlighted="true"]` = 1; one `aria-current` across nav + aside | Unchanged |
| e2e `stepAuthoring` | 400 px no horizontal overflow; `aside.first()` is the sidebar above the Chat aside | Unchanged: scenes `w-full min-w-0`, canvas `max-width:100%`, Spine collapses below `md`; dialogs / toasts / scenes are never `<aside>` |
| e2e `workflow.spec:191` | `main.firstElementChild.scrollWidth` between tabs | Unchanged: `<main>` renders the screen root directly |
| `test/index.test` | `NODE_ENV === 'test'` | Unchanged |

### 8.4 New tests

| File | Covers |
|---|---|
| `test/motion/motion.test.ts` (node) | `enabled()` false in MODE=test; `auto` / `on` / `off` precedence against a mocked `reduced()`; `data-motion` attribute; stub `to/from/fromTo/timeline` apply end state synchronously; safe without `matchMedia` |
| `test/motion/useCountUp.test.tsx` (jsdom) | first mount renders the value; `null` renders "no data" with no tween; number→number tweens (fake timers, motion forced on); never 0→n; null↔number crossfade only |
| `test/motion/useFlipGroup.test.tsx` | no-op when disabled; capture / play call shape with a mocked `Flip`; cap at 80 |
| `test/motion/useEnter.test.tsx` | animates the ref target, not a wrapper; leaves no residual `transform` |
| `test/theme/theme.test.ts` | resolution system / light / dark; `data-theme`; `color-scheme`; persistence; no `matchMedia` → light; applied before first paint |
| `test/tokens.test.ts` | compiled CSS defines `--color-brand-200/300/800/900`, the `[data-theme="dark"]` block, `@custom-variant dark`, and every §2.4 exception selector |
| `test/ui/*.test.tsx` (≈ 30) | per primitive: roles, `aria-pressed` exactly one true, `disabledReason` title + hidden text, `Button` primary emits `bg-brand-600` with `type` before `disabled`, `Notice warn` contains `amber`, `NoData` renders the literal words and never a number, `Skeleton` keeps status text, `Tabs` roving + `aria-controls`, `Dialog` trap + Esc + restore, `ToastRegion` is a `section`, `Segmented tone=inverse` emits `bg-slate-900 text-white` |
| `test/palette/palette.test.tsx` | closed → no `<input>` in document; ⌘K opens; prefix filters; fuzzy order; ↑↓ Enter calls `onNavigate` with `targetForBuildView('sprint')`; Esc restores focus; `window.studio` mock asserts **zero calls**; "Refresh this screen" invokes the screen's refresh callback only |
| `test/palette/score.test.ts` (node) | scorer ordering, mono-id prefix, recency boost |
| `test/shortcuts.test.tsx` | chord machine; suppression while typing; Esc layering with a dirty `FieldEditor` (no back) |
| `test/focusOnNavigate.test.tsx` | heading receives focus after an area change; deferred while the overlay is mounted |
| `test/stores/consoleStore.test.ts` | cap 500; subscribe / notify |
| `test/frame.memo.test.tsx` | a console entry push does not re-render Sidebar or ChatPanel (render-count probe) |
| `test/scenes/sceneShell.test.tsx` | jsdom → renders `table` + notice; lazy factory never invoked; toggle `aria-pressed`; `figure` + `figcaption` present; one-canvas registry evicts the first host to its table; `webglcontextlost` → table |
| `test/scenes/spineModel.test.ts` (node) | `stages → stations`: ring kind via `nodeKind`; lit fraction = signed count / 8; arc only when `currentDocs` known; equal spacing |
| `test/scenes/spineTable.test.tsx` | 9 rows, group headers, "no name recorded" for null, click → `onNavigate` |
| `test/scenes/constellationModel.test.ts` (node) | bodies / tethers / ghosts from `SprintView` and `Board` fixtures; **radius depends on `risk` alone**; ghost iff `dependsOn` id absent from the slate; **no string field (`dependencyGaps`, `note`, `waitingOn`) influences geometry or colour**; field allow-list enforced; cap 400; seeded layout determinism; NOT READY ring tone is warn |
| `test/scenes/forceLayout.test.ts` (node) | deterministic seed; ≤ 20 ms for 60 nodes; x order follows `buildOrder`; incremental path above 150 |
| `test/focusedActivityHost.test.tsx` | picked activity renders in the main slot; column keeps the `<ol>`; WorkflowTab root string unchanged |
| `test/noNewIpcInRenderer.test.ts` (node) | greps `src/ui`, `src/motion`, `src/palette`, `src/scenes`, `src/theme`, `src/shortcuts`, `src/stores` for `window.studio` → zero matches |
| `test/bundleSize.test.ts` (node, runs after `pretest`) | `dist/assets/index-*.js` < 760 KB and does not contain the string `WebGLRenderer`; a `scene-core-*.js` chunk exists |
| e2e `test/e2e/palette.spec.ts` | ⌘K → type "Sprint" → Enter → Sprint button `aria-current="page"` and exactly one `aria-current`; Esc → `input` count 0 |
| e2e `test/e2e/appearance.spec.ts` | Settings › Appearance → `html[data-theme=dark]`, body background changes, persists across relaunch (userData); density sets `data-density`; `data-motion="off"` in the test build; 400 px no overflow in compact |
| e2e `test/e2e/constellation.spec.ts` | Sprint: `figure` present with the table by default; toggle Graph → either `canvas` or the WebGL notice, no `pageerror`; toggle Table → `sprint-slate` present; `sprint-board` button list still the three verbs |
| e2e `test/e2e/a11y.spec.ts` | exactly one `aria-current="page"` across shell; every `button` has an accessible name; exactly one `h1`; skip link lands in `main`; tablist arrows; Escape closes the palette; computed focus ring (`box-shadow` not `none`) on the focused element |

### 8.5 Run-book per wave

`npm run typecheck` (add `tsconfig.test.json` in Wave 0 so `test/` is finally typechecked **[MF]**) → `npx vitest run` with `STUDIO_SKIP_LIVE_MODEL=1` → `npm run test:e2e` locally (first run downloads Electron) → `bundleSize.test` → manual: both themes on every §7 screen (dark list in §2.4), macOS Reduce Motion, keyboard-only tour (palette, tabs, segmented, dialog, back), 400 px width, `xvfb-run -a npx playwright test` for the WebGL-absent path, sign-off ceremony end state equals a cold reload.

---

## 9. Performance budget and CSP notes

| Item | Today | Budget | How |
|---|---|---|---|
| Main chunk `dist/assets/index-*.js` | 603 KB min (34 KB CSS) | **≤ 760 KB** (estimate +130 KB: gsap core ≈ 70, @gsap/react 2, clsx 1, tailwind-merge ≈ 18, ≈ 45 lucide icons ≈ 25, kit + motion + palette + theme ≈ 30). Flip ≈ 20 KB stays in main (used on Board and sidebar); SplitText ≈ 25, DrawSVG ≈ 8, Observer ≈ 12 lazy | `bundleSize.test`; `manualChunks` in the renderer `build.rolldownOptions.output` of `vite.config.ts` (today only main / preload have `rolldownOptions`): `scene-core` = `three`, `@react-three/fiber`, `d3-force-3d`, `three/examples/jsm/lines/*`; per-scene chunks via `React.lazy`; `chunkSizeWarningLimit: 900` |
| Scene chunk | 0 | `scene-core` ≈ 800 KB min (three ≈ 640, R3F ≈ 120, d3-force-3d ≈ 35), loaded on first Canvas mount only; spine / constellation / ambient ≈ 20–40 KB each | `import()` inside `SceneShell` only. Prefetch with `requestIdleCallback` after project open **only when the Spine is not collapsed and the default surface is graph** **[MF]** |
| CSS | 34 KB | ≤ 60 KB | tokens + kit; Tailwind 4 purge |
| Fonts | 0 (system fallback) | Inter Variable latin ≈ 100 KB + JetBrains Mono Variable latin ≈ 60 KB woff2 as assets **[MF]** | `@fontsource-variable/*/wght.css`; `font-display: swap` |
| Shell re-renders | whole shell per console entry (≈ 2 s on Workflow; 150 ms while streaming) | 0 Sidebar / ChatPanel re-renders per entry | `consoleStore` + `React.memo` + `useCallback(onNavigate)`; proven by `frame.memo.test` |
| Idle GPU | n/a | **0 frames/s** with no pointer and no change; ≤ 30 fps while live; Ambient ≤ 24 fps | `frameloop="demand"` + `useDemandLoop`; one live Canvas |
| DPR | — | `min(devicePixelRatio, 1.5)`; Ambient fixed at 1 | `dpr={[1, 1.5]}` |
| Force layout | — | sync ≤ 15 ms for 150 nodes (240 ticks); incremental above, ≤ 2 s total | `forceLayout.ts`; cached positions |
| Scene memory | — | Spine ≈ 2.6 k tris; Constellation ≤ 400 × 320 tris instanced; buffers disposed on unmount | `useDisposable`; `SceneShell` registry |
| Tweens | 1 CSS spin | ≤ 30 concurrent; global timeline paused when hidden | scoped `useStudioGSAP` |
| Timers | unchanged | no new polling; theme / density / motion event-driven | — |
| Electron | — | No `appendSwitch`, no `webPreferences` change, no edits under `studio/electron/` in Waves 0–3. Optional `backgroundColor` and preload loader recolour (`#0b1120` / `#f8fafc` from `localStorage['studio.theme']`) are `electron/` changes → only inside the WE PR | security gate stays quiet |
| React / R3F peers | `@react-three/fiber@9.8.1` peers `react >=19 <19.4`; installed 19.3.0 | pin `react` / `react-dom` to `~19.3` until fiber widens; `npm ls` in CI | `package.json` |

**Re-baselined after Wave 3 (2026-10-05, `vite build --mode=test`):** main `index-*.js` 574.8 KB against a measured ceiling of **800 KB** (`bundleSize.test`; the 760 KB above was the estimate), `scene-core-*.js` 941.8 KB, per-scene chunks `LifecycleSpine` 4 KB / `SpineScene` 11 KB / `DependencyConstellation` 9 KB / `ConstellationScene` 18 KB / `AmbientField` 2 KB, shared `gsap` 68 KB + `presets` 32 KB + `choreo` 26 KB, CSS 60 KB.

CSP (`index.html:25`, **unchanged, verbatim**): `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none';`. Satisfied because: fonts are bundled woff2 under `font-src 'self'`; the glow `DataTexture` needs no `img-src`; shaders are inline strings compiled by WebGL (not CSP-governed); `LineSegments2` from `three/examples/jsm` is plain JS; no workers (no drei, no troika, no Draco / Basis / KTX); no `blob:` (no GLB, no `URL.createObjectURL`); no `eval` / WASM; GSAP plugins are plain JS; icons are inline SVG components. Nothing adds a network request. `index.html` gains only `<div id="overlays"></div>` after `#root`.

---

## 10. Dependencies

All renderer libraries are **already in `devDependencies`** (verified in `studio/package.json`): Vite bundles them into the renderer, `dependencies` are externalised for main / preload and copied into the asar (three alone would add 20 MB, lucide 36 MB). No installs are needed in Wave 0.

| Package | Version | Dev / prod | Why | Why not the alternative |
|---|---|---|---|---|
| `gsap` | 3.15 (all plugins free under the Standard licence) | dev (bundled) | Core tweens, Flip, SplitText, DrawSVG, Observer; one choreography vocabulary across React boundaries | framer-motion: no Flip across unmounted screens, no SplitText, heavier main chunk |
| `@gsap/react` | 2.1 | dev | `useGSAP` context cleanup, StrictMode-safe | hand-rolled contexts leak under double-invoke |
| `three` + `@types/three` | 0.186 | dev | Renderer, geometries, `LineSegments2`, shader materials | — |
| `@react-three/fiber` | 9.8.1 (peers react <19.4) | dev | Declarative scene tree, `frameloop="demand"`, `invalidate()`; pulls zustand 5, react-use-measure, its-fine | raw three: more imperative code, harder disposal |
| `@react-three/drei` | — | **not used** | — | `Environment` presets fetch remote (CSP), `Text` uses troika blob workers (CSP), `detect-gpu` fetches remote (CSP), pulls `three-stdlib`, `camera-controls`, `hls.js`, `mediapipe`. Everything needed is hand-rolled: Plates (DOM labels), orbit, glow sprite, lights |
| `d3-force-3d` | current | dev | Seeded 3D force layout, sync and incremental | a worker-based layout is blocked by CSP |
| `lucide-react` | 1.52 | dev | ≈ 45 tree-shaken icons | Unicode glyphs where tests pin text |
| `clsx` + `tailwind-merge` | current | dev | `cn()` for the kit | — |
| `@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono` | current | dev | Bundled latin woff2 under `font-src 'self'` | the names in `index.css` today load nothing |
| `vitest-axe` | — | **owner's call** (§13) | optional a11y assertions in kit tests | — |
| Removed / unchanged | `react-markdown`, `remark-gfm` stay the only prod deps | prod | — | — |

---

## 11. Work breakdown — waves with strict disjoint file ownership

Rules: waves run in order; packages inside a wave run in parallel; **a file appears in exactly one package per wave** ("Owns" is the complete write-set); a package may import another package's *contract* file from Wave 0-0 but never edit it; the wave closes with `npm run typecheck && npx vitest run` green before the next wave starts. Sizes: S ≤ 300 LOC, M 300–900, L 900–1 800. Frozen in every wave: `shared/**`, `electron/**`, `index.html` CSP line, `DocumentsTab.tsx` (until Wave 3), `MarkdownView.tsx`, `ChatResizeHandle.tsx` (classes), `WorkflowTab.tsx` root strings.

### Wave 0-0 — contracts (one agent, sequential, S, lands first) **[MF: token names frozen before the kit]**

| Owns | Exposes | Acceptance |
|---|---|---|
| `src/theme/tokens.d.ts` (the token-name list of §2 as a TS union), `src/ui/contract.ts` (prop types for every §3 primitive, no implementations), `src/motion/contract.ts` (`MotionApi`, `Choreo` types, token mirrors), `src/scenes/core/types.ts` (`SceneId`, `SceneShellProps` with required `table`, `Station`, `Body`, `Tether`, `Ghost`, `SceneDataSpine`, `SceneDataConstellation`, `SceneSlotProps`), `src/palette/types.ts` (`PaletteEntry`, `PaletteGroup`, `PaletteIndexInput`), `src/stores/contract.ts` (store shapes), `tsconfig.test.json` (includes `test/**`), `package.json` (`"typecheck"` adds `tsc --noEmit -p tsconfig.test.json`; pin `react` / `react-dom` `~19.3`) | Every later package types against these files and never edits them | `npm run typecheck` green; `test/` now typechecked |

### Wave 0 — foundation (6 packages, parallel)

| Pkg | Owns (write-set) | Exposes | Consumes | Size | Acceptance |
|---|---|---|---|---|---|
| W0-A Tokens + theme | `src/index.css`, `src/theme/{theme.ts,ThemeProvider.tsx,useTheme.ts,density.ts}`, `test/theme/theme.test.ts`, `test/tokens.test.ts` | §2 tokens, `@theme inline`, `@custom-variant dark`, ramp remap + 8 exceptions, brand-200/300/800/900, fonts, density vars, motion-off CSS, focus ring, `applyTheme()`, `useTheme()` | `tokens.d.ts` | M | `tokens.test` proves the CSS defines every token and exception; theme test proves `data-theme`, `color-scheme`, persistence; dark checklist (§2.4) reviewed on screenshots |
| W0-B Motion core | `src/motion/**` except `contract.ts` (`motion.ts`, `register.ts`, `tokens.ts`, `useStudioGSAP.ts`, `useEnter.ts`, `useFlipGroup.ts`, `flipStore.ts`, `useCountUp.ts`, `valueMemory.ts`, `pulse.ts`, `splitTitle.ts`, `presets.ts`, `choreo/*.ts`, `MotionProvider.tsx`), `test/motion/**` | §4.1 API; every catalogue row as `play(ctx)`; the stub | `motion/contract.ts` | L | `motion.test` proves `enabled()` false in test, stub applies end state, `clearProps` on transforms; `useCountUp.test` proves never 0→n |
| W0-C UI kit | `src/ui/**` except `contract.ts` (every §3 primitive #1–#29 incl. `Surface3DToggle`, `cn.ts`), `test/ui/**` | §3 components | `ui/contract.ts`, `tokens.d.ts`, `motion/contract.ts` (Segmented thumb and Dialog enter call through the contract) | L | ≈ 30 kit tests: roles, `aria-pressed`, `disabledReason`, `bg-brand-600` on primary, `bg-slate-900 text-white` on inverse, `amber` in warn, `NoData` literal, `type` before `disabled`, Toast is a `section` |
| W0-D Scene core | `src/scenes/core/**` except `types.ts` (`webgl.ts`, `sceneDefaults.ts`, `SceneShell.tsx`, `SceneSlot.tsx`, `sceneRegistry.ts` (empty map), `CanvasHost.tsx`, `useThemeColors.ts`, `useDemandLoop.ts`, `glowTexture.ts`, `Plates.tsx`, `projectLabels.ts`, `lights.tsx`, `materials/*.ts`, `layout/forceLayout.ts`), `src/stores/spineStore.ts`, `test/scenes/{sceneShell,forceLayout}.test.*` | `SceneShell` (requires `table`), `SceneSlot` (renders the registered scene for an id or nothing), `canUseWebGL`, `DEFAULT_SURFACE`, `AMBIENT_ENABLED`, one-canvas registry, Plates, materials, layout | `scenes/core/types.ts`, `tokens.d.ts` | L | `sceneShell.test`: table in jsdom, lazy factory never invoked, registry eviction, `figure`/`figcaption`, toggle `aria-pressed`; `forceLayout.test`: determinism, timing, order |
| W0-E Palette + shortcuts + a11y | `src/palette/**` except `types.ts` (`CommandPalette.tsx`, `paletteIndex.ts`, `score.ts`, `usePaletteIndex.ts`), `src/shortcuts/{useShortcuts.ts,shortcutMap.ts}`, `src/a11y/{focusOnNavigate.ts,LiveAnnouncer.tsx}`, `test/palette/**`, `test/shortcuts.test.tsx`, `test/focusOnNavigate.test.tsx` | `<CommandPalette entries onRun/>`, `buildIndex(input)`, `useShortcuts(map)`, `focusHeading()`, `<LiveAnnouncer/>` | `palette/types.ts`, `ui/contract.ts` (Dialog, Kbd), `stores/contract.ts` (backlogStore shape) | M | palette tests: closed = no input, prefixes, no `window.studio` calls, Esc restores focus; shortcuts: chords, input suppression, Esc layering |
| W0-F Build, stores, test harness, shell wiring | `vite.config.ts` (renderer `manualChunks`, `chunkSizeWarningLimit`), `src/stores/{consoleStore.ts,backlogStore.ts}`, `test/setupTests.ts` (IntersectionObserver, `getContext` null, `document.fonts`, localStorage clear), `test/stores/consoleStore.test.ts`, `test/noNewIpcInRenderer.test.ts`, `test/bundleSize.test.ts`, `test/frame.memo.test.tsx`, `index.html` (`#overlays` only), `src/main.tsx` (font imports, `applyTheme()` before `createRoot`, `register.ts` import, providers), `src/App.tsx` (consoleStore, `useCallback(onNavigate)`, overlay focus restore hook-up), `src/components/Frame.tsx` (`React.memo` boundaries, `consoleEntries` optional, `<main id="main" tabIndex=-1>`, `SkipLink`, `<div id="overlays">` usage, `LiveAnnouncer`, `ToastRegion`, `<CommandPalette/>` + `useShortcuts()` slots) | Chunking, stores, stubs, lint tests, a Frame that mounts the Wave 0 pieces | `stores/contract.ts`, `ui/contract.ts`, `palette/types.ts`, `motion/contract.ts` | M | `frame.memo.test` proves no shell re-render per console entry; `noNewIpcInRenderer` zero matches; `bundleSize` passes after `pretest`; the two Frame-mounting jsdom tests still pass |

### Wave 1 — screens (8 packages, parallel; each leaves a `SceneSlot` where a scene will mount)

| Pkg | Owns | Delivers | Consumes | Size | Acceptance |
|---|---|---|---|---|---|
| P1 Shell | `src/components/{Sidebar,SyncChip,Console,OpeningOverlay}.tsx`, `test/sidebar.test.ts` (additions), `test/e2e/a11y.spec.ts` | Sidebar tokens + icons + footer Search / Appearance buttons + `spineStore.hover` + pulse + Now Flip + progressbar; SyncChip chip; Console segmented + height handle + expand motion; overlay card motion + focus restore | kit, motion, spineStore | M | `sidebar.test` additions green; pins unchanged; `a11y.spec` invariants |
| P2 Stage family | `src/components/{StageHome,WorkflowTab,GuideTab,SignOffPanel,SignOffQuestions,FocusedActivityHost,TemplateGapsNotice}.tsx`, `test/stageHomeTabs.test.tsx` (additions), `test/focusedActivityHost.test.tsx` | Tabs kit, sticky header, `<SceneSlot id="spine" data={…}/>` above the h2, h2 focus target, **F11 FocusedActivityHost**, ceremony trigger after `signOffStage` ok + `refreshStatus` | kit, motion (`choreo/signOff`), `SceneSlot` | L | WorkflowTab strings byte-identical; tabs arrow test; focused host test |
| P3 Documents | `src/components/{DocumentView,DocumentSections,FieldEditor,HistoryPanel}.tsx` | Sticky header, notices, highlight pulse, Alt+↑/↓, ⌘S, restore `Dialog`, `DefinitionList` | kit, motion, shortcuts | M | `documentEditRefresh` + `workflowDocument*` tests unchanged |
| P4 Build family | `src/components/{BuildBoard,SpecStatusView,SpecReadinessPanel,HandoffDialog,RosterPicker}.tsx` | Segmented roles, Flip regroup, shared-element Flip, roving rows, hover cards, `backlogStore` writes, List \| Graph `SceneSlot id="constellation-board"` (List default), reserved Batch-3 slots, RosterPicker | kit, motion, flipStore, backlogStore, `SceneSlot` | L | `board.spec` unchanged |
| P5 Sprint, Closing, Explain, Settings | `src/components/{SprintBoard,FeatureCompleteScreen,ExplainViews,SettingsScreen,GateAuthPanel}.tsx`, `test/appearance.test.tsx` | `SprintScreen` renders `<SceneSlot id="constellation-sprint"/>` above `<SprintBoard>` (outside the testid); `DataTable` slate; `backlogStore` writes; FeatureComplete `<SceneSlot id="spine"/>`; `StatTile` + `NoData`; **Appearance** section | kit, motion, `SceneSlot`, theme | L | `SprintBoard.test` unchanged; sprint.spec pins unchanged; appearance test |
| P6 Chat + activities | `src/components/{ChatPanel,ChatActivityLine,ConnectingChecklist,AiProposalCard,ActivitiesPanel,PhaseReportPanel,IntakePanel,BatchActions,BatchCandidateList,CandidateView,BriefForm,BriefPicks,BriefWriting,BriefLogistics,BriefResultView,NarrativeCoveragePanel,ReviewStandingPanel,PipelineEvidencePanel,RegistryResultView,activityPanelBits,briefBits}.tsx` | Kit swap with every text / testid preserved; bubble motion; Stop slot; panels render through `FocusedActivityHost` via the existing activity selection callback | kit, motion | L | all component tests unchanged; `noNewIpcInRenderer` still zero |
| P7 Entry screens | `src/components/{WelcomeScreen,NewProjectScreen,SetupFlow,ToolingIssues,ClashScreen,ClashDiff}.tsx` | Kit migration, SplitText title, `<SceneSlot id="ambient"/>` behind each pre-project screen, clash counter + resolve motion | kit, motion, `SceneSlot` | M | `newProjectScreen`, `clashScreen` tests unchanged |
| P8 App wiring | `src/App.tsx` (palette entries from state, shortcut map wiring, `Esc` back with dirty guard, `onNavigate` focus, Notice / Toast for errors) | App-level glue for the Wave 0 slots | palette, shortcuts, a11y, kit | M | `palette.spec` passes once scenes land; `focusOnNavigate` test |

### Wave 2 — scenes (3 packages, parallel; no screen file is edited)

| Pkg | Owns | Delivers | Consumes | Size | Acceptance |
|---|---|---|---|---|---|
| S1 Lifecycle Spine | `src/scenes/spine/{spineModel.ts,SpineScene.tsx,SpineTable.tsx,LifecycleSpine.tsx}`, `test/scenes/{spineModel,spineTable}.test.*` | `LifecycleSpine` (a `SceneShell` with `table={<SpineTable/>}`), `RailMaterial` use, pulse, ceremony label `"spine"` | scene core, spineStore, motion | L | model and table tests; flat unsigned span asserted in the shader uniform test |
| S2 Dependency Constellation | `src/scenes/constellation/{constellationModel.ts,ConstellationScene.tsx,orbit.ts,DependencyConstellation.tsx}`, `test/scenes/constellationModel.test.ts`, `test/e2e/constellation.spec.ts` | `DependencyConstellation` for Sprint (table = children passed by the slot: the existing SlateTable region) and Board (table = the list) | scene core, backlogStore, flipStore, motion | L | model test (risk-only radius, ghosts from ids only, no prose influence, warn tone); e2e |
| S3 Ambient Field | `src/scenes/ambient/{AmbientField.tsx,FieldMaterial.ts}`, `test/scenes/ambient.test.tsx` | `AmbientField` gated by `AMBIENT_ENABLED && motion.enabled() && canUseWebGL()` | scene core, motion | S | test proves nothing renders in MODE=test |

### Wave 3 — integration, verification, docs (one agent, sequential; the only package allowed to reopen Wave 1 and 2 files)

| Owns | Delivers | Acceptance |
|---|---|---|
| `src/scenes/core/sceneRegistry.ts` (map `spine` / `constellation-sprint` / `constellation-board` / `ambient` → lazy components), `src/components/DocumentsTab.tsx` + `test/documentsTab.test.ts` (behaviour-suite rewrite with the §7 pins listed first), `test/e2e/{palette,appearance}.spec.ts`, `test/e2e/sprint.spec.ts` (**no change expected**; re-verify), `vite.config.ts` tuning, `studio/README.md` (Appearance, shortcuts, scenes), `docs/proposals/studio-improvements.md` (link + "absorbed by Observatory" marks on F11 and accessibility) | Scenes mounted through the registry; dark sweep; reduced-motion pass; 400 px pass; xvfb pass; bundle report | Full `npm run typecheck`, `npx vitest run`, `npm run test:e2e`, `bundleSize.test`; §8.5 manual checklist signed |

### Wave E — optional, separate PR, security-gated (`studio/electron/` changes)

| Owns | Delivers |
|---|---|
| `electron/main/auditRead.ts` (new), `electron/main/index.ts` (register 3 channels), `electron/preload/index.ts` (3 methods; loader colour from stored theme), `electron/main/index.ts` `backgroundColor`, `shared/types.ts` (3 read-only shapes), `src/components/{ImpactDrawer,DecisionClock,GateLedger}.tsx` + their mount edits, `test/auditRead.test.ts` | `getArtifactImpact`, `getDecisions`, `getGateAudit` (all P-class, pollable) and the §5.5 views |

Totals: Wave 0 ≈ 4 000 LOC, Wave 1 ≈ 4 500 LOC of edits, Wave 2 ≈ 2 000 LOC, Wave 3 ≈ 1 000 LOC, Wave E ≈ 1 200 LOC.

### Module tree after Wave 3 (renderer only)

```
src/
  a11y/        focusOnNavigate.ts · LiveAnnouncer.tsx
  motion/      contract.ts · motion.ts · register.ts · tokens.ts · useStudioGSAP.ts · useEnter.ts · useFlipGroup.ts
               flipStore.ts · useCountUp.ts · valueMemory.ts · pulse.ts · splitTitle.ts · presets.ts · MotionProvider.tsx · choreo/*.ts
  palette/     types.ts · CommandPalette.tsx · paletteIndex.ts · score.ts · usePaletteIndex.ts
  scenes/
    core/      types.ts · webgl.ts · sceneDefaults.ts · SceneShell.tsx · SceneSlot.tsx · sceneRegistry.ts · CanvasHost.tsx
               useThemeColors.ts · useDemandLoop.ts · glowTexture.ts · Plates.tsx · projectLabels.ts · lights.tsx
               materials/{RailMaterial,RingMaterial,TetherMaterial,FieldMaterial}.ts · layout/forceLayout.ts
    spine/     spineModel.ts · SpineScene.tsx · SpineTable.tsx · LifecycleSpine.tsx
    constellation/ constellationModel.ts · ConstellationScene.tsx · orbit.ts · DependencyConstellation.tsx
    ambient/   AmbientField.tsx · FieldMaterial.ts
  shortcuts/   useShortcuts.ts · shortcutMap.ts
  stores/      contract.ts · consoleStore.ts · backlogStore.ts · spineStore.ts
  theme/       tokens.d.ts · theme.ts · ThemeProvider.tsx · useTheme.ts · density.ts
  types/       d3-force-3d.d.ts (existing)
  ui/          contract.ts · cn.ts · Button IconButton Card Notice NoData Eyebrow Field Input Textarea Select Segmented Tabs Chip Badge
               StatusDot Skeleton EmptyState StatTile ProgressBar DataTable DefinitionList Dialog Popover HoverCard Tooltip Kbd
               BackLink Icon Toast ToastRegion toastStore useToast Spinner ProgressRing VisuallyHidden SkipLink Surface3DToggle Preferences
  components/  (existing) + FocusedActivityHost.tsx · RosterPicker.tsx
```

---

## 12. Risks and mitigations

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| 1 | A partial `window.studio` mock throws because a kit, shell or scene component calls a new IPC | Med / High | Rule: Waves 0–3 add **zero** `window.studio.*` calls; `test/noNewIpcInRenderer.test.ts` greps `src/ui`, `src/motion`, `src/palette`, `src/scenes`, `src/theme`, `src/shortcuts`, `src/stores`; the palette index is built from state only |
| 2 | e2e geometry pins (380, coversWindow, 400 px, aside order, `main.firstElementChild`) | Med / High | Motion off in `--mode=test`; never transform an `<aside>`, the overlay root or `<main>`; `useEnter` animates the screen root via ref with `clearProps`; dialogs / toasts / scenes are never `<aside>`; Spine collapses below `md` |
| 3 | `sprint.spec` pins (three buttons, NOT READY ×3, strict spec-id button) | Med / Med | Toggle and scene mounted by `SprintScreen` outside `[data-testid=sprint-board]`; the Sprint Table surface **is** the existing SlateTable; plates are named "Spec NNNN: title"; `constellation.spec` re-asserts the three-button list after toggling |
| 4 | Dark ramp remap produces an unreadable pair somewhere | Med / Med | The remap enumerates every step in use; eight explicit exceptions; `text-white` never remapped; §2.4 checklist of ten known hot spots reviewed on screenshots before Wave 2 closes; new code uses semantic tokens only |
| 5 | `@react-three/fiber@9` peer `react <19.4` | Low / Med | Pin `react` / `react-dom` `~19.3`; `npm ls` in CI; scenes are lazy behind an ErrorBoundary, so a peer break degrades to the table, never a blank app |
| 6 | WebGL unavailable or lost (xvfb, remote desktop, GPU reset, 16-context cap) | Med / Low | `canUseWebGL()`, `webglcontextlost` → table, one-canvas registry, Table default in test builds; the DOM view is a first-class toggle |
| 7 | three leaks into the main chunk via an accidental static import | Med / Med | Only `CanvasHost` and the scene modules import three, reached through `React.lazy` inside `SceneShell`; `bundleSize.test` asserts < 760 KB and no `WebGLRenderer` string |
| 8 | Counters or progress bars animate from a fabricated zero | Med / High (house rule) | `useCountUp` requires `id` and a previous finite value; first mount sets text; unit test asserts no intermediate values; `ProgressBar` null → no fill |
| 9 | A scene implies meaning the plugin never reported (prose-derived ghosts, red for amber, gradient progress, size by wait) | Med / High (house rule) | `constellationModel.test` allow-list + "no string field influences geometry"; `spineModel.test` flat unsigned span; figcaptions state what y/z mean; `status-warn` for every warn-class fact |
| 10 | GSAP Flip on large lists janks or fights sticky headers and `overflow-auto` | Med / Med | `useFlipGroup` cap 80 else swap; `absolute:true` only inside the list container; `scale:false`; headers excluded from targets; Flip only on grouping / filter changes, never on poll refreshes |
| 11 | Shared-element Flip offset by `<main>` scroll | Med / Low | Flip container is the list's positioned ancestor; the detail title block is measured after layout; tested in `useFlipGroup.test` with a scrolled container |
| 12 | SplitText on text a test reads by exact string, or before fonts load | Low / Med | Only the Welcome h1, ceremony title, overlay title; `aria:'auto'`; await `document.fonts.ready`; `revert()` on unmount; grep Playwright specs before adding a target |
| 13 | New global key handlers swallow typing (`?`, `g s`, `/`) or clash with Electron accelerators | Med / Med | Handlers ignore editable targets unless `inInputs`; chords only outside inputs; ⌘W/Q/R/1–9 avoided; `navigator.platform` modifier detection |
| 14 | Esc-as-back discards an edit | Low / High | Dirty guard: no back while a `FieldEditor` draft, hand-off form text or open proposal exists (`shortcuts.test` covers it) |
| 15 | Memoising the shell hides a needed re-render | Med / Med | Stable callbacks via `useCallback`; `StageReadinessContext` still drives data; e2e navigation coverage; React DevTools profile in Wave 3 |
| 16 | Parallel agents collide on shared files | Med / Med | Wave 0-0 contracts land first; one file per package per wave; screens render `SceneSlot`s and scenes never edit screens; Wave 3 is the sole integrator and runs alone |
| 17 | Palette actions touch W-class IPC before `locks.ts` exists | Low / High | Palette is navigation-only plus P-class "Refresh this screen"; "Pull now" / "Refresh project status" / "Switch project" are explicitly excluded until Batch 4 F9; `palette.test` asserts zero `window.studio` calls |
| 18 | Density `--spacing` change moves fixed layout and breaks the 400 px e2e | Med / Med | Sidebar `w-[288px]`; chat width already px; `appearance.spec` asserts no horizontal overflow at 400 px in compact |
| 19 | Spine band steals vertical space on small windows | Med / Low | Collapsible and remembered; auto-collapsed below `md` and in compact |
| 20 | `electron/` edits (loader colour, `backgroundColor`, read-only IPC) trip the security gate | Certain for WE / Low | Isolated in the WE PR; Waves 0–3 never touch `studio/electron/` |
| 21 | Animations make the tool feel busy on day 30 | Med / Med | "Motion is evidence"; pulse stops after 3 cycles; Settings Animations switch; no loops but the pulse and the typing dots while `busy` |
| 22 | `d3-force-3d` CJS / ESM interop under rolldown | Low / Low | Import the ESM entry; `forceLayout.test` runs the layout in node |
| 23 | Lucide tree-shaking fails (36 MB package) | Low / Med | ESM named imports; `bundleSize.test` catches it |
| 24 | `DocumentsTab` rewrite in Wave 3 loses a semantic the documents e2e relies on | Med / Med | Behaviour suite written **before** the rewrite from the §7 pin list; documents.spec stays in the gate |
| 25 | Motion preference `on` overriding OS reduce-motion read as ignoring a11y | Low / Med | Default `auto` honours the OS; `on` is a per-person opt-in with an explanatory note in Settings; tests cover `auto` |

---

## 13. Decisions for the owner (only the genuine ones)

| # | Decision | Recommendation | Why it is yours |
|---|---|---|---|
| D-A | Ship dark mode with the ramp bridge in Wave 0 (pinned markup rides the remap) or hold dark until Wave 3 has migrated every pinned file | Ship in Wave 0 with the §2.4 checklist | Trade-off between an early dark theme and a short window where the Documents tab is bridged rather than redesigned |
| D-B | `DocumentsTab` byte-equality test: rewrite as a behaviour suite in Wave 3, or keep the component frozen indefinitely | Rewrite in Wave 3 with the pins listed first | The byte test was the reference-markup proof for spec 0017; replacing it is a change to a deliberate guard |
| D-C | Welcome Ambient Field: keep (gated, pre-project screens only) or drop and rely on the CSS gradient | Keep | It is the one purely decorative element; some owners prefer none |
| D-D | Motion preference `on` (explicit override of OS reduce-motion) | Offer it, default `auto` | Some teams forbid any override of OS accessibility settings |
| D-E | Add `vitest-axe` as a devDependency for kit tests | Yes, Wave 3 | New dependency |
| D-F | Build the Wave E read-only IPC extras (Impact drawer, Decision Clock, Gate Audit ledger) in this cycle | Defer until Batch 3 lands `track_decisions` wiring; keep the designs | Touches `studio/electron/` and the security gate; overlaps Batch 3 RefinementAgenda inputs |
| D-G | Migrate the `board.spec` class pins (`bg-brand-600`, `bg-slate-900`) to `aria-pressed` | Yes, in Wave 3 as a follow-up commit | Changes two deliberate e2e pins |

Not decisions (already settled by house rules or judges): no drei; no palette write actions; ghosts from ids only; amber stays amber; the Sprint Table surface is the existing SlateTable; the toggle lives outside `sprint-board`; `text-white` is never remapped; scenes live in two places each.

---

## 14. Appendix — Batch 3 / 4 remaining scope and what this overhaul absorbs

Verbatim rows from `docs/proposals/studio-improvements.md` §3 as recorded in inventory-data §C, cross-checked against the code on 2026-10-05. **Nothing in Batch 3 or 4 is built. D4 and D5 are OPEN.**

| Batch | Item (verbatim scope) | Code state today | Observatory | Left to the batch |
|---|---|---|---|---|
| 3 | `sprint.py --json` on write verbs → `{ok, changed, refusal:{kind,message}, gaps}`; capabilities for them | Write verbs have **no** `--json` (only `slate --json` proposal mode, `plan --json`, `status --json`); exit 1 Illegal / DRIFT / ready-with-gaps printed as prose; exit 2 Refused; no capabilities for write verbs | — | All (plugin) |
| 3 | Studio verdict / "Pass the next action to…" / Acknowledge / Mark ready on the spec view; renderer-untrusted validation like `briefValidate.ts`; `--by` = signed-in actor; scoped `save()` | No sprint write IPC; `save()` scopes **one** path (`onlyPath`) but sprint writes touch spec + ledger (+ record) → multi-path scope or a result naming changed files needed | **Reserved slots** on `SpecStatusView` rendered `disabledReason` until the IPC exists; `Dialog`, `Toast`, `RosterPicker`, `Segmented` are the primitives the verbs will use | IPC, validation, save scope, wiring |
| 3 | `RefinementAgenda.tsx` composing `sprint.py status` + `track_decisions.py` + `audit_artifacts.py report` in `/sdlc-refine` order (1 NOT READY · 2 vague-line · 3 upstream drift · 4 stale layers · 5 verdicts pending · 6 handoffs unacknowledged · 7 overdue decisions · 8 next review) | Not written; joins (drift, "touches slated spec", next review) belong in a plugin `--json` (e.g. `sprint.py agenda --json`); `track_decisions.py --json` and `audit_artifacts.py report --json` have no IPC | `DataTable`, `Notice`, `NoData`, `Chip` ready; Wave E `getDecisions` design | Plugin agenda verb, IPC, screen |
| 3 | Roster pickers | Only `BriefLogistics` `RosterShortcut`; `HandoffDialog` free text | **`RosterPicker` component shipped and used in HandoffDialog (UI half)** | Reuse in verdict / next-action / sign-off controls |
| 4 | F9 per-project async mutex (`locks.ts`); timer skips a tick while held | No `locks.ts`; 2-min pull, save, clash resolution, PR polling, chat turns unserialised | Palette deliberately excludes every W-class action so nothing new interleaves | All (main process) |
| 4 | F15 Stop button + timeouts for chat / drafts / combine / sign-off | `runCommand` supports `timeoutMs` + `signal` (tree kill) but chat, `draftField`, combine, sign-off set neither | **Stop slot** in the ChatPanel composer (`disabledReason` until `cancelChat` exists) | `AbortSignal` threading, timeouts, the IPC |
| 4 | F15 atomic + partitioned persistence; cwd under `userData` | `settings.json` non-atomic, one file, defaults on parse error (wipes recents / transcripts); `claudeWorkingDirectory` and chat MCP config in `os.tmpdir()` | All new renderer preferences live in `localStorage`, so `settings.json` gains nothing | All (main process) |
| 4 | F14 / D4 soft-require `gh` (and `claude`); disable features with a reason | `App.tsx` `refreshTooling` hard-requires claude, uv, pluginScripts, git **and gh**; without gh `actor` is empty so `needsMe` is false and every `--by` write must disable | `disabledReason` prop on every kit control; ToolingIssues designed to become a non-blocking Notice | The `allFound` change, per-feature disabling, D4 decision |
| 4 | F11 focused-activity main-slot layout | `WorkflowTab` left column still `sm:w-72`; panels render in the 288 px column; only Sprint got a `BUILD_VIEWS` entry | **Delivered**: `FocusedActivityHost` renders the picked activity in the main slot (P2, Wave 1) | — |
| 4 | Accessibility basics | 1 `aria-pressed` (Console footer); tablist without arrow keys; no focus management; no Escape; no reduced-motion | **Delivered**: `aria-pressed` on every segmented control, roving tabs with `aria-controls`, focus-on-navigate, skip link, live regions, Escape layering, focus trap + restore, universal focus ring, reduced-motion + Animations switch, `figure` / `figcaption` on every canvas, `a11y.spec` | Optional `vitest-axe` (D-E) |
| 4 | Windows `.cmd` resolution for `claude` / `uv` | `.cmd` resolution only for `git` / `gh` | — | All (main process) |
| 4 | F12 remainder: per-phase `activities.yaml` warnings (only the FIRST problem surfaces and blanks every stage) | Partly built (Batch 1) | `ActivitiesPanel` renders `warnings[]` through `Notice` when the plugin emits them | Plugin-side per-phase warnings |
| — | D4 soft-require gh / claude | OPEN (recommended yes) | Prepared (`disabledReason`) | Decision + implementation |
| — | D5 write verbs from Studio, `--by` always the signed-in account | OPEN (recommended yes) | Reserved slots only; no write verb is invented here | Decision, then Batch 3 |

Also noted from inventory-data §C and not changed here: `types.ts` places the "read can commit" note on `getSpecReadiness` but it belongs on `getSpecStatus`; `boardModel.ts` counts calendar days while `track_decisions.py` counts business days (Board overdue and decision-log overdue can disagree); `ProjectStatus` omits `capabilities`. The Constellation does not re-encode `boardModel.ts`'s `daysWaiting` / `isOverdue` / `teamLoad`.
