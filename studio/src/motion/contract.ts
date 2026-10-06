// The motion layer's contract (studio-observatory.md §4.1), frozen before `motion.ts`,
// `useStudioGSAP.ts` and the choreographies are written. Types plus the §2.7 token mirrors as
// readonly consts — the CSS custom properties in `src/index.css` hold the same numbers, and a test
// may compare the two so they cannot drift apart.
//
// `gsap.core.Timeline` is a global namespace type from gsap's own typings; the reference below
// makes it resolvable here without importing the runtime (this file has no runtime imports, so the
// contract can be consumed from node-env tests that never load GSAP).
/// <reference types="gsap" />
import type { DurationToken, EaseName, StaggerToken } from '../theme/tokens'

/** `localStorage['studio.motion']`. `auto` honours the OS; `on` is an explicit per-person opt-in
 * that overrides a reduced-motion OS setting (shown with a note in Settings › Appearance); `off`
 * wins over everything. */
export type MotionPreference = 'auto' | 'on' | 'off'

export const MOTION_PREFERENCES: readonly MotionPreference[] = ['auto', 'on', 'off']

/** What `motion.ts` exposes. One consistent definition of "enabled" for the whole renderer:
 * `enabled() = MODE !== 'test' && preference !== 'off' && !(reduced() && preference !== 'on')`. */
export interface MotionApi {
  /** False in `import.meta.env.MODE === 'test'`, when the preference is `off`, or when the OS asks
   * for reduced motion and nobody opted in — so every choreography is a no-op in those cases
   * without branching at its call site. */
  enabled(): boolean
  /** `matchMedia('(prefers-reduced-motion: reduce)').matches`, guarded: false when `matchMedia`
   * is not a function (jsdom before setupTests, SSR). */
  reduced(): boolean
  readonly preference: MotionPreference
  /** Persists, sets `document.documentElement.dataset.motion`, notifies subscribers. */
  setPreference(next: MotionPreference): void
  /** Fires on preference AND media-query changes. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void
  readonly durations: MotionDurations
  readonly eases: MotionEases
}

/** The value `MotionProvider` puts in context — the same facts as `MotionApi`, snapshotted so a
 * component re-renders when they change. */
export interface MotionContextValue {
  enabled: boolean
  reduced: boolean
  preference: MotionPreference
  setPreference: (next: MotionPreference) => void
}

// --- §2.7 token mirrors -----------------------------------------------------------------------

/** Durations in SECONDS (GSAP's unit). The CSS `--dur-N` holds the same value in ms. */
export const MOTION_DURATIONS = {
  'dur-1': 0.12,
  'dur-2': 0.2,
  'dur-3': 0.32,
  'dur-4': 0.56,
  'dur-5': 0.9,
} as const satisfies Record<DurationToken, number>

export type MotionDurations = typeof MOTION_DURATIONS

/** Named eases: the GSAP string for each §2.7 row. `pop` is only for elements ≤ 24 px; `ambient`
 * is the current-station breathing (yoyo, 2.4 s, max 3 cycles unless a pointer is present). */
export const MOTION_EASES = {
  'dur-1': 'power2.out',
  'dur-2': 'power2.out',
  'dur-3': 'expo.out',
  'dur-4': 'power3.inOut',
  'dur-5': 'expo.inOut',
  pop: 'back.out(1.4)',
  ambient: 'sine.inOut',
} as const satisfies Record<DurationToken | 'pop' | 'ambient', EaseName>

export type MotionEases = typeof MOTION_EASES

/** Staggers in seconds. `stagger-1` is additionally capped by `amount: 0.32` so a long list never
 * takes longer than one `dur-3` to arrive. */
export const MOTION_STAGGERS = {
  'stagger-1': 0.024,
  'stagger-2': 0.06,
} as const satisfies Record<StaggerToken, number>

export const STAGGER_1_AMOUNT_CAP = 0.32

/** Ambient breathing (§2.7): period in seconds and the cycle cap when no pointer is present. */
export const AMBIENT_PERIOD_S = 2.4
export const AMBIENT_MAX_CYCLES = 3

/** Under reduced motion an opacity crossfade may still run, capped here; under `off` it is 0. */
export const REDUCED_CROSSFADE_S = 0.12

/** The §4 global invariant on concurrent tweens. */
export const MAX_CONCURRENT_TWEENS = 30

// --- choreographies ---------------------------------------------------------------------------

/** The subset of a GSAP timeline a caller may rely on. `gsap.core.Timeline` satisfies it; so does
 * the disabled stub, which applies end states instantly and returns an already-completed
 * timeline so callers never branch on `enabled()`. */
export interface TimelineLike {
  play(from?: number | string): this
  pause(atTime?: number | string): this
  kill(): this
  progress(): number
  progress(value: number): this
  then(onFulfilled?: (value: this) => unknown): Promise<unknown>
  /** Append a child tween/timeline/callback, optionally at a label or offset — the one
   * composition verb the ceremony needs to let the Spine join at `"spine"`. */
  add(child: unknown, position?: number | string): this
  /** Label → time, for joining (the sign-off ceremony exposes `"spine"`). */
  labels: Record<string, number>
}

/** What a choreography is handed. `scope` is the subtree it may touch — nothing outside it, and
 * never an `<aside>`, the overlay root or `<main>` itself (§4 invariants). */
export interface ChoreoContext {
  scope: Element
  /** Pre-resolved so a choreography never reads `motion.enabled()` itself. */
  enabled: boolean
  reduced: boolean
  durations: MotionDurations
  eases: MotionEases
  /** Join an existing timeline at a label instead of starting a new one (ceremony + Spine). */
  parent?: gsap.core.Timeline
  parentLabel?: string
}

/** One module per catalogue row (§4.1 `motion/choreo/*.ts`): `play(ctx)` returns a timeline;
 * when `ctx.enabled` is false it returns a completed one. */
export interface Choreo<Extra = void> {
  readonly name: string
  play(ctx: ChoreoContext, extra: Extra): gsap.core.Timeline | TimelineLike
}

/** `useEnter` presets (§4.1): transforms only on the screen root ref, every tween ending with
 * `clearProps: 'transform'`. */
export type EnterPreset = 'rise' | 'fade' | 'slideRight'

/** `useCountUp(id, value)`: tween only when previous and next are both finite; `null ↔ number`
 * is a text crossfade; never 0→n. `snap` is 1 for integers, 0.1 for rates. */
export interface CountUpOptions {
  snap?: 1 | 0.1
  /** Formats the displayed number (units, tabular digits are the caller's). */
  format?: (value: number) => string
}

/** `attachPulse(el, opts)`: scale 1→1.18 yoyo on `AMBIENT_PERIOD_S`; repeats while `hold()` is
 * true, otherwise stops after `cycles`. */
export interface PulseOptions {
  cycles?: number
  hold?: () => boolean
}

// --- round 2: familiarity (M3) ----------------------------------------------------------------

/** How many times this person has opened this project, as a tier, from the hashed
 * `localStorage['studio.opens.<hash>']` counter: opens 1–3 `full`; 4–10 `quiet` (assemble at
 * `dur-4`, Welcome hero a plain fade, station pulse once); more than ten `settled` (assemble and
 * pulse skipped). A count, never a date — the tier says "familiar", not "late". */
export type FamiliarityTier = 'full' | 'quiet' | 'settled'
export const FAMILIARITY_FULL_MAX_OPENS = 3
export const FAMILIARITY_QUIET_MAX_OPENS = 10

/** What `motion.ts` adds in round 2 (P2). Callers read `motion.familiarity(key)`; the Frame
 * records one open per `projectPath`; Appearance's "Play the opening again" resets. */
export interface FamiliarityApi {
  familiarity(projectKey: string): FamiliarityTier
  recordOpen(projectKey: string): void
  resetFamiliarity(projectKey: string): void
}

// --- round 2: the ceremony registry (M1) -------------------------------------------------------

/** The Sidebar nodes the sign-off ceremony moves, registered as GETTERS so a re-render never
 * leaves a stale element behind; `fromFraction` is the progress bar's width before the sign-off. */
export interface CeremonyRegistryGetters {
  signedNode(): Element | null
  connector(): Element | null
  nextRing(): Element | null
  nowBadge(): Element | null
  bar(): Element | null
  fromFraction(): number | null
}
export type CeremonyRegistryKey = keyof CeremonyRegistryGetters
export type CeremonyRegistryRefs = { [K in CeremonyRegistryKey]: ReturnType<CeremonyRegistryGetters[K]> }

/** `src/motion/ceremonyRegistry.ts` (P2). While `hold()` is held, `sidebarProgress` applies its
 * end state instead of tweening — the ceremony owns the bar for that second. */
export interface CeremonyRegistryApi {
  /** Returns the unregister. Partial: a Sidebar without a next stage registers no `nextRing`. */
  register(getters: Partial<CeremonyRegistryGetters>): () => void
  /** Resolve every getter now; an unregistered one reads null. */
  resolve(): CeremonyRegistryRefs
  /** Returns the release. Re-entrant: held while any holder is outstanding. */
  hold(): () => void
  held(): boolean
}

// --- round 2: ref shapes of the new catalogue rows (#26–#29) ----------------------------------

/** #26 `handoffCeremony` (P2 plays, P3 passes the refs from `SpecStatusView`). Plays only when
 * `handOff` resolved `ok` AND the refreshed row arrived; a refusal plays nothing. */
export interface HandoffCeremonyRefs {
  /** The dialog panel, faded 120 ms. */
  dialog?: Element | null
  /** The BUILDS IT cell: "nobody" → the plugin's `developer`, 200 ms crossfade. */
  buildsCell?: Element | null
  /** The status chip: POP (≤ 24 px). */
  statusChip?: Element | null
  /** Branch / PR chips: rise, `stagger-2`. */
  prChips?: ReadonlyArray<Element | null | undefined>
}

/** #27 `edgeDraw` (P3): SVG edges drawn in via `stroke-dashoffset` over `EDGE_DRAW_S`. */
export interface EdgeDrawRefs {
  edges: ReadonlyArray<SVGGeometryElement | null | undefined>
}

/** #28 `spineCollapse` (P4 plays, P5 wires the chevron): the band's height between its open
 * measurement and 0, `clearProps: 'height'` at the end so a cold reload and the end state agree. */
export interface SpineCollapseRefs {
  band: Element | null
  collapsed: boolean
}

/** #29 `sceneCrossfade` (P4, inside `SceneShell`): outgoing `dur-1`, incoming `dur-2`;
 * `onOutgoingHidden` fires when the outgoing surface is fully transparent — the moment a canvas
 * may be disposed, never before (one live WebGL canvas at any instant). */
export interface SceneCrossfadeRefs {
  outgoing?: Element | null
  incoming?: Element | null
  onOutgoingHidden?: () => void
}
