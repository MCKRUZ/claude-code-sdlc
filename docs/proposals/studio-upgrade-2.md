# Tōgō — Upgrade round 2 master plan (studio-upgrade-2)

Synthesised 2026-10-06 from five lens proposals (instrument, motion, screens, craft, brand) and two
judges. Inputs: `studio-observatory.md` (§3 kit rules, §5 scenes, §8.3 pins, §13 decisions), the
twelve `test/screenshots/observatory-v7-*.png` production captures, `studio/README.md`, `CLAUDE.md`.
Paths below are relative to `studio/` unless they start with `docs/`.

**Status (2026-10-06):** built and committed on `feat/studio-improvements` (P0–P7, adversarial review, fix pass, a final five-defect polish and a GLSL reserved-word fix in the ground shader). Verified at the commit: `npm run typecheck` clean; vitest 237 files / 2657 passed / 7 skipped; pytest 3495 passed / 19 skipped (plugin untouched); Playwright 112 passed / 3 skipped; production main chunk ≈ 642 KB; ghost probe 0 deviating rows at 1.2/1.6/2.0/2.5 s; production series `observatory-v10-*` (17 shots) critiqued.

## 0. In five lines

1. Every item scoring ≥ 24/30 (both judges summed) is in, duplicates merged, nothing a `must_not` names.
2. The owner's wants are honoured: the **solid Macron stays the mark**; a **Depth** gradient variant
   (`#6FD1D4 → #0A3F47`, theme-aware) exists at **≥ 48 px, hero and icon only**; "solid upgrades" and
   "MAJOR polish" are the two halves of the plan (instrument/motion vs craft/screens).
3. **MUI is not adopted** (§2). Three.js and GSAP are used heavily; nothing new is installed.
4. Two mandatory defects have owners: **(A) the ghost strip** (P3) and **(B) the Board graph air** (P4).
5. Eight packages with strict disjoint file ownership; P0 lands first, P1–P6 run in parallel, P7 closes.

## 1. Measured ground (so the plan argues from facts)

| Fact | Measured | Consequence |
|---|---|---|
| Main chunk `dist/assets/index-*.js` | **612.0 KB** (not 575) | 188 KB of headroom under the 800 KB `bundleSize.test` ceiling |
| `scene-core-*.js` | 964.9 KB | lazy, first canvas mount only; untouched |
| `build/icon.png` | md5 `0811d873…` ≠ `docs/brand/togo/exports/tile-256.png`; `electron-builder.json` has no `icon` key | the dock still shows electron-vite's purple atom |
| Dark `--color-accent-700` | `#0b6470`, used as *text* in 12 places | dark links ≈ 2.5:1 — the biggest correctness gap in the shots |
| `--text-2xs` | weight 600 + 0.08 em tracking by default | Welcome path and Console meta render letter-spaced semibold |
| `EYEBROW_CLASS` / group labels | `ink-4` `#94a3b8` on `#f8fafc` = 2.45:1 | every section label fails AA |
| Ghost strip (A) | `STICKY_HEADER_CLASS` paints an opaque `surface-0` 25 px band; `LIST_STAGGER` tweens `y:4→0` + `clearProps:'transform'` on `<tr data-reveal>` inside `overflow-x-auto`; strip present only on the GRAPH surface (live canvas) at 1.2–2.5 s, gone after any pointer move | two defects share the name: A1 the band cut out of the body glow, A2 the 1 px glyph strip (compositing) |
| Board graph (B) | `height={280}`; layout slab `Z_CLAMP 0.6`, `FLATTEN_Y_STRENGTH 0.3`, `ORDER_SPACING 2.2` → six bodies ≈ 11 × 1.2 units; `fitView` is width-tight; camera clamps at `POLAR_MAX 1.25` | projected bodies+plates ≈ 92 px of a 280 px host; the air shows above because plates hang below |
| `frameAssemble`, `dialog.ts`, `toasts.ts`, `skeletonSwap.ts` | exist in `motion/choreo`, consumed by nothing | several motion items are wiring, not new choreography |

## 2. The MUI decision

**Not adopted.** In the owner's terms: Tōgō just got one coherent look — one set of colours, radii,
focus rings and spacing in `tokens.css` that flips light/dark and compact/comfortable in one place.
MUI brings its own second set (an Emotion theme that cannot read `[data-theme]`), so every screen
would have two visual grammars that drift apart, and its controls put `<input>`s into the shell that
our tests forbid and change the two class literals the e2e suite pins (`bg-brand-600`, `bg-slate-900`).
It would also add ~300 KB to a main chunk that has 188 KB of room. Nothing below needs a primitive
the kit lacks: the three new primitives (`PageHeader`, `Disclosure`, `Gauge`-class SVG for the spec
neighbourhood) are under 80 lines each. The "feel free" is honoured by using the other two —
three.js for the instrument (materials, lighting, reticle, ledger plates) and GSAP for every ceremony.

## 3. The plan — 43 items (score = both judges, impact+feasibility+fit, /30)

Merged: brand 2 ⊕ screens 12 ⊕ craft 12 → **B2**; screens 6 ⊕ craft 10 → **S6**; motion 1 ⊕ brand 7 →
**M1**; inst 13 ⊕ motion 12 (crossfade, band) → **I8**; brand 3 ⊕ inst 12 (field only) → **B3**.
Pulled up from 23 with a reason: C7 (toast over the composer is a §6.6 requirement), C8 (the `▶`
triangles are in three shots), M10 (CSS-only, near-zero cost, the most memorable 420 ms available).

| Id | Item | Score | Pkg | Id | Item | Score | Pkg |
|---|---|---|---|---|---|---|---|
| B1 | Tōgō tile as the app icon | 28 | P6 | S1 | `PageHeader` with area eyebrow, every screen | 24 | P1→all |
| B2 | Mark A — **Depth** (the owner's gradient) | 28 | P6 | S2 | Stage summary strip under the title | 26 | P5 |
| B3 | Welcome hero 56 px Depth + gathered two-layer field | 25 | P6 | S3 | Spine band: short labels, condensed caption | 29 | P4 |
| B4 | Brand asset pipeline script | 24 | P6 | S4 | Honest, useful empty step panel | 24 | P5 |
| B5 | Brandbook and guide audit | 26 | P6 | S5 | Document outline rail with gap markers | 24 | P5 |
| B6 | Empty-state figures in the product's vocabulary | 26 | P1 | S6 | Board rows as columns, one-line notice, two-row filter bar | 26 | P3 |
| C1 | Accent-text tokens; dark link sweep | 28 | P0+all | S7 | Sprint: title first, fact strip, grouped verdicts | 25 | P3 |
| C2 | Ink-4 is decoration; `--color-eyebrow` | 28 | P0+all | S8 | Spec page facts rail | 25 | P3 |
| C3 | Split `text-2xs` from the eyebrow voice | 28 | P0+all | S9 | Chat empty/failed state at the top | 25 | P2 |
| C4 | **(A) Ghost strip** — band + root cause | 28 | P3 | I1 | Body materials v2 (fresnel rim, shaded rings/rail) | 25 | P4 |
| C5 | Control states: icon sizes, focus clip, double-dim, jargon | 26 | P1+P2 | I2 | Lighting rig, contact pools, theme-aware grid | 25 | P4 |
| C6 | `shared/format.ts` — plurals, dates, hours | 26 | P1→all | I3 | Viewing reticle on the Spine | 26 | P4+P5 |
| C7 | Toasts anchored over `<main>` | 23↑ | P1+P2 | I4 | Closing ledger plates (signer subtitle) | 26 | P4+P5 |
| C8 | `Disclosure` summary (chevron, no `::marker`) | 23↑ | P1→all | I5 | Hover/focus affordances v2 in 3D | 27 | P4 |
| M1 | Sign-off ceremony as one timeline + seam | 26 | P2+P4 | I6 | "In a graph" shortcut scope + palette actions | 27 | P4 |
| M2 | Frame assemble wired | 24 | P2+P4 | I7 | Spec dependency neighbourhood (SVG) | 26 | P3 |
| M3 | Calm-by-day-30 familiarity | 26 | P2 | I8 | Scene arrival: prefetch, crossfades, animated band | 25 | P4+P2 |
| M4 | Shared-element Flip back + focus restore | 26 | P3 | I9 | **(B) Board graph deliberate fit** | — | P4 |
| M5 | Dialog and palette choreography | 27 | P1 | M8 | Universal press and focus-arrive | 27 | P0+all |
| M6 | Toasts enter/exit, rail as a clock | 27 | P1 | M9 | Hand-off ceremony on the plugin's `ok` | 26 | P2+P3 |
| M7 | Hover cards arrive | 24 | P1+P4 | M10 | Theme "dusk" reveal via view transition | 23↑ | P2 |
| M11 | Sidebar Build sub-list height reveal | 24 | P2 | | | | |

**Deferred (below the cut or named by a must_not), with the reason:** inst 4 station seal shader (22; M1
owns the ceremony), inst 5 satellites (23; sub-10 px targets), inst 7 camera follows change (23),
inst 11 gauges (21; wait bars fabricate a scale), inst 12's 3D mesh mark (must_not: one gradient
mechanism), motion 5/6 (21/19; sticky-header collision), motion 7 sweep (must_not: idle loop), motion
10 skeleton morph (23; `skeletonSwap.ts` exists — wire-only follow-up), screens 9 (21; denominator rule),
screens 10/11/14 (23), craft 5 radii (23), craft 8 shell edges (20; three pinned files), brand 4 Flip
(22), brand 5/9a/10 (must_not: `studio/electron/**` is the security-gated WE PR), brand 8 (22).

## 4. Work breakdown — eight packages, strict disjoint file ownership

Rules: a file has exactly one owner; anything another package needs from it is a **contract** the
owner delivers first (P0) or exposes by name (compiles independently). No package edits a pinned
class string, text, testid or attribute order (§6). P7 is the only package allowed to reopen files.

### P0 — Contracts and tokens (sequential, lands first) · size S

**Goal:** freeze every shared name so P1–P6 compile in parallel.
**Owns:** `src/theme/{tokens.css,dark.css,type.css,base.css,tokens.d.ts}`, `src/ui/{contract.ts,contract-data.ts,index.ts}`,
`src/motion/{contract.ts,presets.ts}`, `src/motion/choreo/{index.ts,_shared.ts}`, `src/scenes/core/types.ts`.
**Delivers:**
- C1 tokens `--color-accent-text` (light `#0b6470`, dark `#6fd1d4`), `--color-accent-text-hover` (light `#0b505a`, dark `#a7e6e7`); C2 `--color-eyebrow` (= ink-3 both themes), dark `--color-ink-4` → `#6b7a94`; comment on ink-4 rewritten: "decoration only — placeholders, dividers, aria-hidden glyphs; never a word".
- C3 `--text-2xs` → 10.5/14, weight 450, **no tracking**; `--text-eyebrow` unchanged (600 / 0.08 em).
- B2 `--mark-depth-a/--mark-depth-b`: light `#6FD1D4 → #0A3F47`, dark `#6FD1D4 → #0E7C86` (so the mark never sinks into `#0b1120`; the dark accent ramp is inverted, so a token-ramp gradient is wrong by construction).
- C4/A1 `base.css`: the two radial glows move from `body` to `#root::before` (fixed, inset 0, `pointer-events:none`, `z-index:-1`); dark glow `.09/.05`.
- M8 `[data-pressable]:active { transform: scale(.985); transition: transform 80ms var(--ease-out) }` and `:focus-visible` `ring-in` 120 ms keyframe growing the ring spread from 0 — the static `box-shadow: var(--ring)` stays as the end state (forced-colours and the a11y `box-shadow !== 'none'` pin). Both zeroed by the existing `[data-motion="off"]` and reduced-motion rules.
- M4 `.is-flipping { position: relative; z-index: 1 }`. M10 `::view-transition-old/new(root)` rules (clip-path circle, 420 ms `--ease-expo-out`); `html.theme-switching` suppressed while `html[data-view-transition]`.
- Selection: `::selection` / `mark` take tokens (light `accent-200`/`ink-1`; dark `#0f4a50`/`#e6edf7`; `mark` = `status-warn-bg/ink`).
- Contracts: `PageHeaderProps { eyebrow?, title, lede?, actions?, sticky?, headingProps? }`; `DisclosureProps`; `EmptyStateProps.figure?: 'rail'|'constellation'|'page'|'conversation'|'prompt'|'aligned'`; `TogoMarkProps.variant?: 'flat'|'depth'`; `ChipProps.casing?: 'identifier'|'state'|'label'`; `SceneDataSpine` gains `viewedStageId: string | null`, `ledger?: boolean`; `SceneHostExtras` unchanged. Catalogue rows (names + ref types only; stubs return a completed timeline): `ceremonyRegistry` beats in `signOffCeremony`, `handoffCeremony`, `edgeDraw`, `spineCollapse`, `sceneCrossfade`. `CATALOGUE` length asserted once here.
**Acceptance:** `test/tokens.test.ts` lists the new names in `tokens.d.ts`; new `test/ui/tokenContrast.test.ts` parses `tokens.css`/`dark.css` and fails under 4.5:1 for `accent-text`/`surface-{0,1,raised}`, `eyebrow`/`surface-0`, `ink-3`/`surface-2`, every `status-*-ink`/`status-*-bg`; new `test/ui/typeTokens.test.ts` asserts `--text-2xs--font-weight`/`--letter-spacing` absent and `--text-eyebrow--*` present; `test/motion/catalogue` row count updated; typecheck green with every new type unused.

### P1 — Kit, overlays and primitives · size M

**Goal:** every control feels finished; three new primitives the screens adopt.
**Owns:** `src/ui/*` except P0's three files; new `src/ui/{PageHeader,Disclosure,emptyFigures}.tsx`; `src/motion/choreo/{dialog,toasts,hoverPlate}.ts`; `src/palette/{CommandPalette,PaletteOption}.tsx`; new `shared/format.ts`; `src/ui/Preferences.tsx`.
**Items and visual spec:**
- **S1 `PageHeader`**: eyebrow (`Eyebrow`, `--color-eyebrow`) · `h2 data-page-heading tabIndex=-1` · lede `max-w-[64ch] text-ink-3` · right-aligned actions · `sticky` variant emits `STICKY_HEADER_CLASS` (imported from P3's `useStuck.ts` by name) and calls `useStuck`. The screen passes the heading **text byte-identical** to today. Stays inside the screen root.
- **C8 `Disclosure`**: keeps `<summary>` as the tag and the children text nodes untouched; hides `::marker`; lucide `ChevronRight` rotating 90° on `[open]`; `aria-expanded` mirrors open.
- **B6 `EmptyState figure`**: six ≤ 120×72 inline SVGs in `line-2` hairlines, at most one `accent-400` dot, `aria-hidden`, no `<text>`, no digit, deterministic path data; a rail with hollow dashed stations, three hollow bodies + one dashed tether, a page of rows, two speech hairlines, a prompt caret, two pages in register. The Scorecard gets none.
- **C1/C2/C3 inside the kit**: `Button variant=link` → `text-accent-text hover:text-accent-text-hover`; `Toast` actions likewise; `Eyebrow`, `DataTable` th, `DefinitionList` dt, `NoData`, `StatTile` label, `Kbd` → `text-ink-3`/`text-eyebrow`; `DataTable` row hover `hover:bg-surface-2`, chip cells `align-baseline`.
- **C5**: `Icon` size union gains 12; `Badge` drops the `h-3 w-3` override; `Segmented` disabled dims once (group only); `IconButton` disabled stays `opacity-50` only.
- **M5**: `Dialog` consumes `motion/choreo/dialog.ts`: scrim 0→1 `dur-1`, panel `scale .98→1, y 6→0` `dur-2 expo.out`, `clearProps:'transform'`, reverse 120 ms before unmount, focus restore unchanged; `scrollBody` slot `max-h-[min(60vh,560px)]`, footer `rounded-b-[inherit]`. Palette: rows stagger 15 ms (cap 8) on first open only; re-rank Flips `data-flip-id="palette:<id>"` 160 ms; empty state uses `Kbd`; group labels and footer → `text-ink-3`.
- **M6 + C7**: `Toast` enter `x 12→0` `dur-2 expo.out`, exit opacity 160 ms then height collapse 160 ms; rail `scaleX 1→0` linear over the real ttl, paused by `data-paused`; same-title within 2 s updates in place with a 120 ms text crossfade. `ToastRegion` anchors `right-[calc(var(--chat-width,0px)+16px)]` and `bottom-[calc(var(--console-height,0px)+16px)]`, reading variables **P2 sets on the Frame root** (contract below); stays a `<section>`, never inside an `<aside>`.
- **M7**: `HoverCard`/`Tooltip` arrive `opacity 0→1, y 4→0` `dur-1 power2.out` after the existing 350 ms intent delay, close 80 ms, `role="tooltip"` and `pointer-events:none` kept through the fade, Escape closes synchronously.
- **M8**: `data-pressable` added to `Segmented` options, `Tabs`, `Chip` buttons, `DataTable` row buttons, `PaletteOption` — attribute only, class strings untouched (`bg-brand-600 text-white` / `bg-slate-900 text-white` literals survive).
- **C6 `shared/format.ts`**: `plural(n, one, many)` via `Intl.PluralRules`, `formatDate`, `formatDateTime`, `formatTime`, `formatHours` (< 10 h → one decimal, else whole), `formatRelative` with days. Formats plugin values, never derives one.
**Contract consumed from P2:** `--chat-width` and `--console-height` on the Frame root, `data-chat-hidden` when the chat is closed.
**Acceptance:** `test/pageHeader.test.tsx`, `test/ui/disclosure.test.tsx`, `test/ui/emptyState.test.tsx` (figures `aria-hidden`, no digit, byte-identical on re-render), `test/ui/dialog.test.tsx` (no residual transform; trap/Esc/restore), `test/palette/palette.test.tsx` (closed → zero `<input>`, DOM order = ranked order), `test/ui/toast.test.tsx` (rail paused on hover, dedupe in place, exit removes node), `test/ui/toastRegion.test.tsx` (reads the width variable; never in an `<aside>`), `test/ui/segmented.test.tsx` (one dim; `tone=accent` still emits `bg-brand-600 text-white`), `test/ui/icon.test.tsx`, `test/format.test.ts`; existing `test/ui/*` green.

### P2 — Shell, ceremonies, theme and frame motion · size M

**Goal:** the three ceremony-grade moments play as one timeline each; the shell opens as one thing.
**Owns:** `src/App.tsx`, `src/components/{Frame,Sidebar,ChatPanel,ChatResizeHandle,SignOffPanel,SignOffQuestions,HandoffDialog,AppearanceSection,FeatureCompletePanels}.tsx`, `src/chatConnectingSteps.ts`, `src/motion/{motion.ts,MotionProvider.tsx,useHeightReveal.ts(new),ceremonyRegistry.ts(new)}`, `src/motion/choreo/{signOffCeremony,sidebarProgress,frameAssemble,handoffCeremony(new),themeChange}.ts`, `src/theme/{theme.ts,ThemeProvider.tsx,useTheme.ts}`.
**Items and visual spec:**
- **M1**: Sidebar registers getters (`signedNode, connector, nextRing, nowBadge, bar, fromFraction`) in `ceremonyRegistry`; SignOffPanel plays tick 300 ms → card rise 240 ms `power3.out` → **seam** (2 px accent line drawing from the card's top-centre outward, 0.3–0.6 s — the Macron's gesture, not its shape) → node POP `back.out(1.4)` 320 ms → connector `scaleY` 450 ms → next ring POP → Now Flip 300 ms → bar 420 ms → `"spine"` label at 0.9 s (P4's `playSpineCeremony` joins there). `sidebarProgress` applies its end state while the registry flag is held. Signer line in the card set `text-lg` 650 −0.02 em; a `completed`-without-a-name sign-off shows the hollow ring and "no name recorded". Reduced: opacity beats ≤ 120 ms; off: stub; end state equals a cold reload.
- **M2**: `frameAssemble` played once per `projectPath` after the overlay unmounts: sidebar header 180 ms, stage rows `x −8→0` stagger 24 ms (cap 0.32 s), `<main>`'s **first child** `rise` 240 ms, chat **inner wrapper** `x 12→0` (never the `<aside>`); P4's Spine joins at 0.1 s via `frameAssemble.join(fn)`. `clearProps:'transform'` on everything; a `refreshStatus` re-render never replays.
- **M3**: `motion.familiarity(projectKey)` from a hashed `localStorage['studio.opens.<hash>']` counter: opens 1–3 full; 4–10 assemble at `dur-4`, Welcome hero a plain fade, station pulse once; > 10 assemble and pulse skipped. Appearance gains the note "Opening flourishes quieten after the first ten opens" and a ghost `Button` "Play the opening again".
- **M9**: `handoffCeremony` plays only when `handOff` resolved `ok` **and** the refreshed row arrived: dialog fades 120 ms; BUILDS IT crossfades "nobody" → the plugin's `developer` 200 ms; status chip POP ≤ 24 px; branch/PR chips rise `stagger-2`; toast names the plugin's value. Refusal: `Notice` in the plugin's words, nothing plays. (P3 wires the refs in `SpecStatusView`.)
- **M10**: when `motion.enabled() && !reduced && 'startViewTransition' in document`, `theme.ts` runs the attribute flip inside `document.startViewTransition`, origin = last `pointerdown` (module-level capture listener) or the window centre for ⌘⇧D; otherwise the existing 200 ms crossfade. Widths never animate.
- **M11**: `useHeightReveal(ref, open)` on the Sidebar Build `<ul>` only (height 0→auto + opacity `dur-2`, `clearProps:'height'`); the `<aside>` and its `max-h-[50vh] sm:max-h-none` string untouched.
- **S9**: failed/empty chat renders an `EmptyState figure="conversation"` at the **top** of the list region: the sentence as is, then stage · document (`currentDocumentTitle`) · "read-only until you accept a proposal", then the retry hint; header "Helping with:" becomes a `Chip` so the filename appears once.
- **C1/C2/C5 sweeps** in owned files: Sidebar group labels → `Eyebrow`-equivalent classes with `text-eyebrow text-eyebrow` (attribute-additive; the `>Foundation<`, `data-node`, `max-h` pins stay); ChatPanel quick-replies and "you" → `accent-text`, hard `bg-white` dropped (bubble literals at the pinned lines stay); `ChatResizeHandle` loses `focus-visible:outline-none`; "Needs Batch 4 F15 cancel" → "Stopping a reply is not available yet". Sidebar rows get `data-pressable`.
- **I8 (host half)**: Frame calls P4's `prefetchCanvasHost()` in `requestIdleCallback` after `openProject`, only when `MODE !== 'test'`, the Spine is not collapsed and the stored default surface is `graph`.
**Contracts delivered:** Frame root carries `style="--chat-width: <px>; --console-height: <px>"` and `data-chat-hidden`; `ceremonyRegistry` API; `motion.familiarity()`; `frameAssemble.join()`.
**Acceptance:** `test/motion/signOffCeremony.test.ts` (labels/positions; seam only with `refs.seam`, 0.3–0.6 s; `"spine"` at 0.9; disabled → completed stub), `test/motion/frameAssemble.test.ts` (once per key; no residual transform), `test/frame.memo.test.tsx` (zero extra Sidebar/ChatPanel renders), `test/motion/motion.test.ts` (familiarity tiers; counter once per open; reset), `test/motion/handoffCeremony.test.ts` (only on `ok && refreshed`), `test/theme/theme.test.ts` (sync flip without `startViewTransition`; never called under off/reduced), `test/motion/useHeightReveal.test.tsx`, `test/sidebar.test.ts` static-markup pins unchanged, `test/ChatPanel.test.tsx` (sentence inside the card above the composer; document name once; className pins), `test/chatResizeHandle.test.tsx` unchanged; e2e `a11y.spec` (two asides, one `aria-current`, focus ring, 380) and `documents.spec` green.

### P3 — Build screens: Board, Sprint, Spec · owner of **(A)** · size L

**Goal:** the most-opened screens read in the right order, and the ghost strip is gone for a known reason.
**Owns:** `src/components/{BuildBoard,SprintBoard,SprintSlateTable,SprintPages,SpecStatusView,SpecReadinessPanel,CodeHostNotice,useStuck.ts}`, new `src/components/{SpecNeighbourhood,SpecFactsRail}.tsx`, new `src/scenes/constellation/neighbourhood.ts` (pure; the only constellation file outside P4), `src/stores/backlogStore.ts`, `src/motion/choreo/{sharedElement,boardRegroup,edgeDraw(new)}.ts`, `shared/{sprintModel,boardModel}.ts`, `src/hostReasons.ts`, `test/screenshots/capture-observatory-v2.mjs` (probe only; P7 owns the v8 run).
**Items and visual spec:**
- **C4 / (A1) the band**: `STICKY_HEADER_CLASS` becomes transparent at rest and **opaque `surface-0` only when `data-stuck`** (header and its 25 px `::before` band alike) plus the existing hairline. No translucent wash, no backdrop blur (the v4 Settings shot showed ghost text through a 90 % wash). The glows now live on `#root::before` (P0), so the stuck band composites over the same ground it covers.
- **C4 / (A2) the glyph strip — find it, do not paper over it.** Protocol, in `capture-observatory-v2.mjs` under `SHOT_PROBE=ghost`: navigate to Sprint on the GRAPH surface, do **not** move the pointer, capture at 1.2 / 1.6 / 2.0 / 2.5 s, crop the 25 px band above the Sprint header across the main column, report the max per-channel deviation from `surface-0` per capture (ghost = any row > 8/255). Then bisect, one `page.addStyleTag` per run via `GHOST_BISECT=<n>`: (1) `[data-reveal]{transform:none!important;opacity:1!important}` — kills the row stagger; (2) `[aria-label="Sprint slate, scrolls sideways"]{overflow:visible!important}` — the scroller; (3) the header `position:static!important` — sticky layer promotion; (4) the `::before` band `display:none`; (5) TABLE surface (already known clean — the live canvas is a necessary condition). Prior: **H1** stale compositor tiles from transform-animated `<tr>` layers being demoted by `clearProps` under a GPU-composited page (timing matches `dur-3` + 0.18 s stagger after the ~1 s fetch; a hover repaint invalidates the tiles, which is why any pointer move clears it). Fix by cause: H1 → stagger rows by **opacity only** and move the `y` tween to an inner wrapper (`DataTable` renders cells; the `<tr>` keeps `data-reveal`/`data-spec`), plus `isolation:isolate; contain:paint` on the slate scroller so row layers never composite into the header's stacking context; H3 → the sticky header owns a stable layer (`will-change: transform`); H4 → a real element replaces the pseudo band. Whatever the cause, the write-up goes in the `useStuck.ts` header comment with the probe numbers before/after.
- **S6 Board**: rows a 6-column grid — id (mono) · title + people line · risk `Chip casing=identifier` · **status `Chip`** (`statusTone` moved to `shared/sprintModel.ts`) · PR / waiting-on with "last moved" via `formatRelative` right-aligned `tabular-nums` · mine `Chip`. The amber Notice becomes one line with the disclosure inline and the team-load chips on its right; text still contains "Showing what the spec files say.". Filter bar is a **deliberate two-row wrap**: row 1 role `Segmented` + List|Graph `ml-auto`; row 2 search `flex-1 min-w-48` + four `Select size=sm`; both rows `data-filter-row`; Refresh joins the header actions. Adopts `PageHeader` (eyebrow "BUILD · BOARD", title "Build").
- **S7 Sprint**: `SprintScreen` renders `PageHeader` ("BUILD · SPRINT S07", h2 **"Sprint"** exactly once, lede) first, then the `SceneSlot`, then the board; `SprintBoardBody` drops its h2 and keeps Refresh inside the sprint Card (the three-button pin). Header Card → one-row fact strip: state `Chip` · goal · dates → remaining (mono) · target · mix chips · WIP. Readiness lists "id — first gap" per line, rest behind a `Disclosure` that is **closed by default**; Verdicts pending grouped per spec by `groupVerdicts` (grouping only, no new number); `0 business days` reads "today". Slate: `NOT READY` cell `min-w-[7rem] whitespace-nowrap`, `<summary>` tag and text kept; `th title` when clipped.
- **S8 Spec**: ≥ lg the page is main column + 280 px sticky `SpecFactsRail` (`DefinitionList`: status `Chip`, team, sprint, channel, depends on as mono buttons → `onOpenSpec`, next owner, eng/data review, branch mono, path; "—" for empty, never blank); the Sprint-decisions slots move to the rail foot with their disabled reasons reworded ("These arrive with a newer plugin"); the second amber notice collapses to one line. `data-flip-id="spec:…"` on the title, `/Owns it/`, the path text and the four slot labels unchanged.
- **I7 Neighbourhood**: `neighbourhood.ts` derives dependencies/dependents from `backlogStore`'s last rows through `constellationModel` (ghost iff id absent, radius by risk, tone by status, NOT READY amber); `SpecNeighbourhood` renders inline SVG — left deps → this spec → right dependents; nodes are `<button aria-label="Spec 0002: claim export">` opening with the Flip; edges draw in 220 ms via `edgeDraw` (stroke-dashoffset); empty store → "Open the Board once to see this spec's neighbourhood". No canvas.
- **M4**: Back stashes the title under `spec:<id>`; BuildBoard/SprintBoard `take` on mount and `Flip.from` the row (360 ms `power3.inOut`, `absolute:true`, `scale:false`), siblings fade `dur-1`, focus moves to the recorded opener; TTL prevents stale replay.
- **M9 wiring**: `SpecStatusView` passes `{ buildsCell, statusChip, prChips }` refs to P2's `handoffCeremony`.
- **C1/C3/C6/C8 sweeps** in owned files (spec id links, slate links, `text-amber-700/800` → `text-status-warn-ink`, dates/plurals via `format.ts`; `SprintBoard.tsx` keeps the word `amber`).
**Acceptance:** `test/useStuck.test.tsx` (no `bg-surface-0` without `data-stuck`; gains it when the sentinel stops intersecting — mocked `IntersectionObserver`); ghost probe reports 0 deviating rows at all four times on the GRAPH surface (P7 re-runs it in the v8 capture); `test/BuildBoard.test.tsx` (status chip per row; one-line notice with `<details>`; two `[data-filter-row]`; `${N} specs`, "1 shown", `span.rounded-full`); `test/SprintBoard.test.tsx` (heading once; verdicts grouped; "today"; `amber` at :104); `test/SpecStatusView.test.tsx` (rail facts, "—" for empty, slot labels disabled with reason, no `<input>`); `test/scenes/neighbourhood.test.ts` (dependents only from others' `dependsOn`; no string field affects layout); `test/SpecNeighbourhood.test.tsx` (empty-store sentence; no bare-id name); `test/motion/sharedElementBack.test.tsx`; e2e `board.spec` (:127,148 `bg-brand-600`; :189 inputs 0; :215-229 `bg-slate-900`; :253 unchanged), `sprint.spec` (:104; :115 NOT READY ×3; :117 `details[open]`=1; :135 three buttons; :142 strict names), `constellation.spec:106`, `workflow.spec:191` + a new `scrollWidth` re-check after scrolling 200 px.

### P4 — Scenes and the instrument · owner of **(B)** · size L

**Goal:** the instrument reads as 3D, the rail becomes a map, and the Board graph looks deliberate.
**Owns:** `src/scenes/core/*` (all, incl. `materials/*`, `layout/*`), `src/scenes/spine/*`, `src/scenes/constellation/*` except `neighbourhood.ts`, `src/scenes/registerAll.ts`, `src/shortcuts/*`, `src/palette/paletteActions.ts`, `src/components/{ShortcutsHelp.tsx,sprintSceneData.ts}`, `src/stores/spineStore.ts`, `src/motion/choreo/{constellationSettle,spineParallax,spineCollapse(new),sceneCrossfade(new)}.ts`.
**Items and visual spec:**
- **I9 / (B) Board graph.** Cause: a 6-body slab ≈ 11 units wide × 1.2 deep, width-fitted into a 720×280 host at `POLAR_MAX`, projects to ≈ 92 px; the padded box is centred, plates hang 30 px below, so ≈ 90 px of air sits above the bodies. Fix, in order: (1) `forceLayout` gains a **per-host aspect policy** — y (which carries no meaning) is spread by a weaker flatten (`FLATTEN_Y_STRENGTH` 0.3 → 0.08 for the Board) within a clamp `Y_CLAMP ±1.4`, seeded by id as today, so the six bodies form a band, not a line; x stays monotonic in build order. (2) `plateLayout` alternates plates **above/below** per body on the Board (as the Spine does) so `PLATE_PAD_PX` is symmetric and the padded box centres the bodies, not the plates. (3) `fitView` gets the host aspect as a hard input: after the width fit, if the projected padded height is < 60 % of the host, the fit lowers `polar` toward `POLAR_MIN` within the clamp until it is, before the distance is final. (4) Fallback if the v8 capture still reads thin: `BuildBoard` passes `height={240}`. Pin: `constellationFit.test` — Board fixture at 720×280 projects ≥ 60 % of the host height; y never correlates with status or risk (`FIELD_ALLOW_LIST` extended, not bypassed).
- **I1**: `BodyMaterial` via `onBeforeCompile` on the standard material: fresnel rim in the body's own status colour (light darkens toward `ink-2`, dark lifts additively toward `accent-300`), a soft specular dot; `NoToneMapping` kept. `RingMaterial`/`RailMaterial` gain `uShade` 0.18 fixed-key lambert that **only darkens**, so the token colour is the brightest pixel (sidebar green = rail green). Pins: shader strings carry `uRim`/`uShade`; `FLAT` span still between `uLit` and `uCurrent`; "brightest pixel == token", "body centre within ±2".
- **I2**: `lights.tsx` three-point rig (hemisphere + warm key `(4,6,5)` + cool rim `(-5,3,-4)` in `accent-300` .25 dark / `ink-4` .15 light); additive contact pool sprite under every body (glow texture flattened 1:0.35, `ink-3` 12 %, scale bound to `radius` only); constellation grid theme-aware (`line-2` .28 light / `ink-4` .48 dark); fog colour = theme surface token so far bodies never change status hue.
- **I3**: thin `accent-500` reticle ring (`RING_RADIUS + 0.09`, tube .012) around the **viewed** station (`SceneDataSpine.viewedStageId`, P0 type; P5 passes it), sliding along the rail 320 ms on change; camera yaw ≤ 0.06 rad; null on Closing. Table twin row gets `data-viewing` + a `Badge kind="current"`-styled marker — **never `aria-current`, never `kind="now"`**. Legend: "The accent ring marks the stage you are viewing."
- **I4**: `PlateItem.subtitle`; when `SceneDataSpine.ledger` is true (Closing, P5 passes it) every plate carries `signed off · <name> · <date>` / `completed · no name recorded` / `not started` word for word from `signerText`/`formatStageDate`; `spineBands` measures the taller plate; camera opens 8 % further back, settles 900 ms on first data, then still.
- **I5**: expanded plate `<li>` raised `z-index 2`, siblings fade to .55 for 160 ms; hovered/focused body gets a thin `accent-500` selection ring (instanced sibling of the warn ring — amber and accent coexist); incident tethers split by direction (depends-on in full `line-1`, dependents in the hot accent set), from declared edges only; tether flow on keyboard focus too. Plate list `overflow-visible` + `clip-path: inset(-8px)` so the 4 px ring is not clipped.
- **I6**: `shortcutMap.ts` scope `scene` (`Home` fit, `n` next up, `Shift+arrows` orbit, `+`/`−` zoom, `↑/↓` build order, `Esc` clear) active only while the figure has focus; `ShortcutsHelp` renders the "In a graph" group from the same data and adopts `Dialog scrollBody`; palette gains "Fit the graph" / "Focus next up" as screen callbacks (zero `window.studio`); figure gets a visible focus ring and an `sr-only` "Shift+arrows orbit".
- **I8 (scene half)**: `lazyCanvas.prefetchCanvasHost()` (guarded dynamic import; no-op under `MODE==='test'`); `SceneShell` crossfades table → canvas 180 ms with the table underneath (the e2e "canvas or notice" poll holds) and Graph ↔ Table inside its fixed-height body (outgoing `dur-1`, incoming `dur-2`; the canvas is disposed **after** the fade and only once `claimCanvas` has handed over — never two live canvases); `data-surface` flips synchronously under the stub. `spineCollapse` animates the band height (P5 wires the chevron).
- **S3**: station plates use `shortName` (exported from `spineModel.ts` as `STAGE_SHORT_LABEL`, covering every registry stage) in `text-2xs`, full name on hover and on the current station; figcaption → `SPINE_CAPTION` = "Lit rail = finished stages. Height and depth carry no meaning." (contains "carry no meaning"); the long sentence moves to the Table twin's caption.
- **M1/M2 joins**: `playSpineCeremony` is called from the `"spine"` label; the rail draw + station POPs join `frameAssemble` at 0.1 s; pulse honours `motion.familiarity()`.
- **M7**: `Plates.tsx` expansion via `Flip.from` (180 ms, `scale:false`); plate "Open ↵" and meta → `accent-text`/`ink-3`; plate ribbon `rounded-1`.
**Contracts delivered:** `prefetchCanvasHost`, `STAGE_SHORT_LABEL`, `SPINE_CAPTION`, `spineCollapse`, scene shortcut scope ids.
**Acceptance:** `test/scenes/{bodyMaterial(new),constellationModel,constellationFit,constellationPlates,constellationLoop,spineModel,spineBands,spineTable,sceneShell,plateLayout}.test.*` as pinned above plus: pool count = body count and pool scale ∝ radius only; selection index = hovered only; upstream/downstream = the declared `dependsOn` partition; reticle follows `viewedStageId`, null on Closing; `spineTable.test` zero `aria-current`, one `data-viewing`; ledger subtitle word-for-word; short-label map covers every registry stage; `sceneShell.test` lazy factory never invoked in jsdom, prefetch no-op in test mode, toggle flips `data-surface` same tick; `shortcuts.test` scene bindings only with the figure focused; `palette.test` two new actions, zero `window.studio`; `bundleSize.test` (`WebGLRenderer` absent from main); e2e `constellation.spec`, `stepAuthoring` 400 px green.

### P5 — Stage home, documents, settings, closing · size M

**Goal:** the stage home answers "where is this stage, what is next, who signs" without scrolling.
**Owns:** `src/components/{StageHome,StageSummaryStrip(new),WorkflowTab,ActivitiesPanel,DocumentView,DocumentOutline(new),DocumentSections,DocumentsTab,GuideTab,FeatureCompleteScreen,FeatureCompleteControls,ExplainScorecard,ExplainFoundation,ExplainGates,ExplainViews,SettingsScreen,SettingsSections,PipelineEvidencePanel,HistoryPanel,Console,ClashScreen,ClashDiff,ToolingIssues,briefBits,activityPanelBits,screenMotion.ts}`, `src/workflowSteps.ts`, `shared/{activityControls,sections,stageLabel}.ts`, `src/stores/stageTabStore.ts`.
**Items and visual spec:**
- **S1 adoption** on StageHome ("FOUNDATION · STAGE 1 OF 4" from `groupStages` ordinal), Scorecard/Foundation/Gates ("BUILD · HOW IT IS GOING"), Closing ("BUILD · CLOSING"; gains lede and actions), Document view, Settings ("PROJECT · SETTINGS") — every heading text byte-identical; header inside the screen root.
- **S2**: hairline strip between the h2 and the tabs with four facts from `StageReadiness`: documents "N of M complete" (`Chip ok/warn`), current step title, sign-off state ("signed off by X" / "N confirmations still needed" / "not current"; `"no name recorded"` for a null signer), Foundation's pipeline-evidence summary when gathered. Each fact is a button routed through `stageTabStore`'s tab request. Nothing computed.
- **S4**: the empty step panel keeps "Not started yet — this will appear here as soon as it is created.", adds the template description, a "How it gets created" list from `readiness.activities[].creates` + `slashCommand` + "ask in Chat", the **Start from template** control only when a matching `create` activity is `available` (reusing `ActivitiesPanel`'s exported `ensureDocumentFromTemplate` handler; never on locked/done rows; a blocked activity shows its reason and no button), then a quiet "Up next" outline. `workflowTab.test:184,218` nodes untouched.
- **S5**: ≥ xl a 220 px sticky `<nav aria-label="Document outline">` (never an `<aside>`) listing `doc.sections` with a `warn` dot and "N to fill" from `readiness.findings` per section; click scrolls and plays the existing `findingFocus` (one `[data-highlighted="true"]`); "Where this is read" line from the registry.
- **I3/I4/I8 host halves**: StageHome passes `viewedStageId` in the Spine data and wires the chevron to `spineCollapse` (motion stub applies end state); `FeatureCompleteScreen` passes `ledger: true` and adopts the `EmptyState figure` where it has one.
- **C1/C2/C3/C5/C6/C8 sweeps** in owned files: `text-accent-700/brand-700` → `accent-text`; `text-amber-*` → `status-warn-ink`; `text-2xs` call sites that wanted caps → `Eyebrow`; `briefBits` `focus:outline-none` removed; six `<summary>` sites in owned files → `Disclosure`; dates/plurals via `format.ts` ("N thing(s)" strings keep their rendered text for n ≠ 1); `Console` meta line plain `text-2xs`.
**Acceptance:** `test/stageSummaryStrip.test.tsx` (counts match fixture readiness; "no name recorded" never blank; buttons call the tab request), `test/workflowEmptyStep.test.tsx` (sentence present; control only with an available matching activity; blocked → reason, no button), `test/documentOutline.test.tsx` (one link per section; counts; click focuses the card), `test/stageHomeTabs.test.tsx` (unchanged + `main.firstElementChild` is still the screen root), `test/documentsTab.test.ts`, `test/workflowTab.test.ts:184,218`, `test/appearance.test.tsx` labels, `scorecardExport.test`, `consoleAz.test.tsx` wording; e2e `documents.spec` (tab `aria-selected` Workflow, `[data-highlighted="true"]` = 1, one `aria-current`), `workflow.spec:191`, `stepAuthoring`, heading pins `Phase 0: Discovery` / `Settings` / `How Build is going` / `Declaring Build finished`.

### P6 — Brand and entry screens · size M

**Goal:** the first thing the owner sees (dock, Welcome, overlay) is Tōgō, and the gradient has one sanctioned home.
**Owns:** `src/components/brand/*`, `src/components/{WelcomeScreen,OpeningOverlay,NewProjectScreen,SetupFlow,entryScreenBits}.tsx`, `src/motion/choreo/{openingOverlay,welcomeOpen}.ts`, `src/scenes/ambient/*` (not `scenes/core/materials/FieldMaterial.ts`, which stays as is), `electron-builder.json` (packaging config at the studio root — **not** `studio/electron/**`), `build/*`, `public/brand/*`, `docs/brand/togo/**`, `docs/guide/**`.
**Items and visual spec:**
- **B2 Depth**: `TogoMark variant="depth"` fills bar and disc from **one** `<linearGradient gradientUnits="userSpaceOnUse" x1=17 y1=9 x2=47 y2=56>` (bar top-left → disc bottom-right, one light direction), stops `var(--mark-depth-a)`/`var(--mark-depth-b)`, id via `useId()`; `draw` works with Depth (`data-mark-bar`/`data-mark-disc` kept, the traced outline strokes with the gradient). Rule in the component and the brandbook: two steps of the one accent, **carries no meaning, never below 48 px, never on a control, chip, status, data body or behind text**. Sidebar and `TogoLockup` stay flat `currentColor` at 24 px.
- **B3 Welcome**: mark 56 px Depth (`h-14`), 28 px gap, h1 `text-display`; kanji line and subtitle unchanged. Field: two layers — far dust (900 points, size .6–1.1, `ink-4` 30 %) and near motes (120, 1.4–1.8) — density Gaussian on the hero third (σ ≈ 0.35 width), ~8 % `accent-400` in light, sizes settle 1.06× → 1× over the existing fade, ≤ 2 % pointer parallax, seeded and identical every open, still gated `AMBIENT_ENABLED && motion.enabled() && canUseWebGL()`. Honours `motion.familiarity()` (opens 4–10: plain 320 ms fade). Recent card `shadow-2` on hover only.
- **Overlay**: card mark 48 px Depth with the existing draw-in (bar from centre, disc traced then filled); the "Loading…" branch shows a static 48 px Depth mark above the pinned text. Root class, `role="alertdialog"`, `aria-busy`, `aria-modal`, testid, clock and ring untouched. No Flip (brand 4 deferred).
- **B1 + B4**: `docs/brand/togo/build-assets.mjs` rasterises every mark, `tile.svg` and a new `tile-depth.svg` at 16–1024 px with Playwright's Chromium (fixed `deviceScaleFactor`), writes `exports/` and `public/brand/`, assembles `build/icon.ico` (PNG-in-ICO, ~60 lines, no dependency) and `build/icon.icns` via `iconutil` when present; **flat accent-600 tile at 16/32 px, Depth at ≥ 64 px**; `icon.png` = `tile-depth-256`. `electron-builder.json` gains `"icon": "build/icon"` for mac and win.
  **As built (recorded by the fixer, 2026-10-06):** the pipeline rasterises with the system `rsvg-convert` (librsvg), not Playwright's Chromium — still no npm dependency, but the §5 recipe now has a prerequisite (`brew install librsvg` / `apt install librsvg2-bin`) and cross-machine determinism rests on the librsvg version rather than the pinned Playwright build. The ICO's 48 px member is **flat** (`DEPTH_FROM_PX = 64`, consistent with the ≥ 64 rule above; the brandbook §9 rows now say so and `brandbookConsistency.test` derives them from the constants). Separately, `electron-builder.json` in the same working tree also carries `"appId": "com.splashthree.togo"` (was `com.mckruz.sdlc-studio`) — that is the Tōgō marketplace rename (root `CHANGELOG.md`, `.claude-plugin/*`, README install lines), **not** a P6 item: a new bundle id is a new app identity to the OS (dock/taskbar pins, Keychain / Credential-store entries, the `userData` path), so it must land in its own commit, before this round's, with an install-continuity note.
- **B5**: brandbook §2 adds Mark A — Depth (construction, both theme pairs), §4 "48 px+ · Depth allowed", Welcome hero 56 px; §8 "No gradients" → "No gradients below 48 px, on controls, chips, data or behind text — Depth only" (figure flips from don't to do); "Do not animate the mark" → "the first-open assemble and the overlay draw-in; the gesture, not the shape, may be reused (§7 Signature motion)"; §9 inventory adds `studio/build/icon.*`. User guide gains "Appearance and About" with `welcome-dark` shots; `build-user-guide.mjs` `SHOT_PREFIX` → `observatory-v8`.
- **C3** on Welcome: the recent path renders plain `text-2xs` (no tracking, no semibold).
**Acceptance:** `test/togoMark.test.tsx` (flat emits two `currentColor` shapes and no `<defs>`; depth emits one `<linearGradient userSpaceOnUse>` with the 17/9/47/56 vector referenced by both shapes; two marks have distinct ids; `draw+depth` keeps `data-mark-disc` with `stroke-dashoffset="100"`; `MARK_GEOMETRY` unchanged); `test/brandAssets.test.ts` (node: `build/icon.png` sha256 = `tile-depth-256.png`; `.ico`/`.icns` carry ≥ 5 sizes and the 16 px member's centre pixel is `#0E7C86` ± 2; builder config names `build/icon`; `public/brand/mark-a-macron.svg` byte-identical to the docs source); `test/brandbookConsistency.test.ts` (names `mark-a-macron-depth.svg`, `tile-depth.svg`, `studio/build/icon`; no `aria-label="Don't: gradient"`; guide references exactly the shots the capture produces); `test/scenes/{ambient,fieldModel}.test.*` (two layers; density in the hero third ≥ 2× the far third; accent share 6–10 %; deterministic for a seed; gate unchanged); `test/welcomeScreen.test.tsx` (one `h1` "Tōgō", mark `aria-hidden`, no `<input>`, no `uppercase|tracking` on the path); `openingOverlay.test.ts` root pins + one `<linearGradient>`; e2e `documents.spec` `coversWindow` and `\d+s`; `a11y.spec` one `h1`.

### P7 — Integration, capture v8, docs (sequential, last; may reopen files) · size M

**Goal:** one green tree, one honest README, sixteen v8 shots critiqued against v7.
**Owns:** `studio/README.md` (Appearance table, shortcut table incl. "In a graph", Scenes, Bundle numbers re-measured, Security unchanged), `CLAUDE.md` studio paragraph (one sentence on the round), this document's status line, the v8 run of `capture-observatory-v2.mjs` (adds `welcome-dark`, `palette-dark`, `spec-view-dark`, `settings-dark`, `board-graph`, `closing`), and any file a package left red.

### 4.1 Ownership check — the files more than one lens wanted, and who got them

| File | Owner | Everyone else gets |
|---|---|---|
| `src/theme/*.css`, `tokens.d.ts` | P0 | token and utility names, frozen before P1–P6 start |
| `src/ui/{contract,contract-data,index}.ts` | P0 | prop types and exports; P1 implements the files behind them |
| `src/scenes/core/types.ts` | P0 | `SceneDataSpine.viewedStageId` / `ledger`; P4 reads, P5 writes the data |
| `src/scenes/core/*` (rest), `spine/*`, `constellation/*` | P4 | `prefetchCanvasHost`, `STAGE_SHORT_LABEL`, `SPINE_CAPTION`, `spineCollapse` by import |
| `src/scenes/constellation/neighbourhood.ts` (new) | P3 | the one constellation file outside P4; imports `constellationModel` read-only |
| `src/components/useStuck.ts` | P3 | `STICKY_HEADER_CLASS` + `useStuck` by name (P1's `PageHeader`, P5's screens) |
| `src/components/{Frame,Sidebar,ChatPanel,App}` | P2 | `--chat-width` / `--console-height` / `data-chat-hidden` on the Frame root; `ceremonyRegistry` |
| `src/components/{SpecStatusView,HandoffDialog}` | P3 / P2 | P2 ships `handoffCeremony(ctx, refs)` (type in P0); P3 passes the refs |
| `src/components/{StageHome,FeatureCompleteScreen}` | P5 | P4's Spine props flow through the data object only |
| `src/motion/choreo/index.ts`, `_shared.ts`, `presets.ts` | P0 | catalogue rows + stubs; each choreo file has one owner (P1/P2/P3/P4/P6 as listed) |
| `src/palette/{CommandPalette,PaletteOption}` / `paletteActions.ts` | P1 / P4 | P4 adds actions as screen callbacks; P1 owns the surface |
| `src/components/ShortcutsHelp.tsx`, `src/shortcuts/*` | P4 | adopts P1's `Dialog scrollBody` by prop |
| `studio/README.md`, `CLAUDE.md` | P7 | each package lists its README delta in its commit body; P7 applies them |
| `test/screenshots/capture-observatory-v2.mjs` | P3 (probe), P7 (v8 run + dark shots) | sequential, so no overlap |

Order: P0 → {P1, P2, P3, P4, P5, P6 in parallel} → P7. A package that needs something not in its
contract list stops and asks rather than editing a file it does not own.

## 5. Acceptance — the full verification recipe

> **Superseded for the command center (2026-10-06):** the shell this recipe pins (the sidebar, the Sprint view) was reorganised by `togo-command-center.md`; its §8 is the recipe and pin list that holds now, including the recorded pin changes (#1–#4). The `observatory-v11-*` series replaces v10.

```sh
cd studio
npm run typecheck && npm run typecheck:test
npm test                          # pretest → vite build --mode=test → vitest (bundleSize: main < 800 KB, no WebGLRenderer, scene-core present)
cd .. && uv run --project scripts python -m pytest scripts/tests -q   # the plugin is untouched; this proves it
cd studio && npm run test:e2e     # Playwright; also: xvfb-run -a npx playwright test for the WebGL-absent path
SHOT_PREFIX=observatory-v8 SHOT_SETTLE=1800 node test/screenshots/capture-observatory-v2.mjs
SHOT_PREFIX=observatory-v8 SHOT_PROBE=ghost node test/screenshots/capture-observatory-v2.mjs   # band deviation 0 at 1.2/1.6/2.0/2.5 s
node docs/brand/togo/build-assets.mjs && git status --porcelain docs/brand studio/build studio/public   # deterministic: clean on a re-run; needs rsvg-convert (brew install librsvg)
```

Visual critique (P7, with the Read tool, every v8 shot beside its v7 twin): the Sprint band shows no
strip at any settle; the Board graph bodies fill ≥ 60 % of the figure with plates above and below;
dark links are readable (spec id, slate links, "Open ↵"); eyebrows are `ink-3`-dark; the Welcome
path is plain; the mark is Depth only at 48 px+; no `▶` default markers; every heading has an
eyebrow and lede; no fabricated zero anywhere ("no data", "no name recorded", "today").

**Pinned tests that must stay green (every package routes around them):**
`a11y.spec` — no `<input>` in the shell, exactly two `<aside>`s sidebar-then-chat, one `aria-current="page"`, one `h1`, chat 380 px, focus `box-shadow !== 'none'`, Escape closes the palette · `board.spec:127,148` `bg-brand-600` · `:189` inputs 0 on the spec view · `:215-229` `bg-slate-900` · `:253` "What Build inherited" (default landing unchanged) · `sprint.spec:104` Sprint `aria-current` · `:115` `NOT READY` ×3 · `:117` `details[open]` = 1 · `:135` three buttons inside `sprint-board` · `:142` strict spec-id names · `constellation.spec:106` and "canvas or notice" · `chatLook` exact 380, `strong≥3`, `li=4`, separator "Resize chat" · `chatAuthoring` `.bg-slate-100`, `.border-dashed`, `aside button.rounded-full` · `documents.spec` overlay `coversWindow`, `\d+s`, tab `aria-selected` Workflow, `[data-highlighted="true"]` = 1, `:208` one `aria-current` · `stepAuthoring` 400 px no overflow, `aside.first()` is the sidebar · `workflow.spec:191` `main.firstElementChild.scrollWidth` · unit: `workflowTab.test:184,218`, `sidebar.test` static markup, `openingOverlay.test` root attributes, `ChatPanel.test` classes and `--chat-width` 380/404/520, `chatResizeHandle.test` `hidden sm:block` + aria-values, `SprintBoard.test:104` `amber`, `stageHomeTabs`, `documentsTab`, `noNewIpcInRenderer`, `bundleSize`, `constellationModel.test` `FIELD_ALLOW_LIST`.

**Sanctioned pin change (recorded by the fixer, 2026-10-06) — `constellation.spec:106`.** The page-wide `page.getByText('NOT READY')` ×3 count is now counted inside `[data-testid=sprint-slate]`, exactly as the untouched pin `sprint.spec:115` already does. Two reasons, both verified: the assertion had never run (it sat behind the Wave 3 `test.skip` guard, now removed, so it passed vacuously for several waves), and it was already false page-wide at HEAD — the readiness card below the slate renders the plugin's own gap line (`0008: DoR NOT READY; status is draft`), which Playwright's case-insensitive substring match counts as a fourth hit; hiding the plugin's wording to satisfy the old locator is not an honest option. In the same file the `LEGEND` figcaption string gained "and the thin accent path joins the slate in that order" because the figure now draws the plugin's `buildOrder` path (`tetherMeshes.ts` `orderPath()`) — the caption describes what is drawn, nothing fabricated. The 1440 px viewport and the removed skip guard stay. No other pin moved.

## 6. Non-negotiables carried from the house rules

CSP verbatim (no remote fonts/scripts, no `blob:`, no workers, no drei); nothing under `studio/electron/**`;
one live WebGL canvas at any instant; every canvas keeps its DOM Table twin; motion off under test and
reduced motion, every choreo's end state equals a cold reload; no idle motion on a project screen beyond
the Ambient field and the current-station pulse; no geometry, brightness or size from time, people or
activity; no fabricated zero; no per-person totals; the renderer never spawns; the plugin's protected
core is byte-for-byte unchanged (pytest proves it).

## 7. For the owner, in plain words

1. You get both marks: the solid Macron everywhere in the app, and the teal gradient version — "Depth" — at hero size on Welcome, the opening card and the dock icon, with the brandbook rewritten to say exactly where it may live.
2. The dock icon stops being the scaffold's purple atom; a script now regenerates every brand asset so this cannot drift again.
3. The ghost strip gets found, not hidden: a probe measures it, a bisect names the cause, the header is transparent at rest and solid only when you have scrolled.
4. The Board graph stops floating in air — bodies spread into a band, labels sit above and below, and the camera fits the figure.
5. Spheres look like spheres: rim light, contact shadows, a lit grid; the rail shows which stage you are reading, and the Closing rail names who signed what.
6. Dark mode becomes readable everywhere a link was invisible, and every small label passes contrast.
7. Signing off, handing off and opening a project each play as one deliberate animation; flourishes quieten after your tenth open.
8. Board, Sprint and Spec read in the right order — title first, the facts in one strip, status as a chip, the spec's own facts in a rail, and where it sits among its dependencies.
9. Keyboard users get the whole graph (a listed "In a graph" shortcut group), the palette and dialogs animate, toasts stop covering the chat.
10. No MUI, no electron changes, no new dependencies; every pinned test stays green and the plugin's protected core (`scripts/`, `phases/`, `templates/`, `agents/`, `commands/`, `hooks/`, `profiles/`, `references/`) is untouched — pytest proves it. (The `.claude-plugin/` manifest, root `README.md`/`CHANGELOG.md` and `harness/README.md` are modified in the same working tree by the separate Tōgō marketplace rename; that batch is committed on its own, before this round's.)
