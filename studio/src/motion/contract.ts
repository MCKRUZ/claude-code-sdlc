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
