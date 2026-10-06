// Reusable tween shapes (§4.1 `presets.ts`): the enter presets `useEnter` applies to a screen
// root, the row / card staggers, the "pop" for small elements, and the §4 tween budget. Each
// preset is a pair of `from` / `to` vars rather than a function that tweens, so a choreography
// can place it on its own timeline and the stub can read the end state off `to`.
import type { EnterPreset } from './contract'
import { MAX_CONCURRENT_TWEENS, MOTION_DURATIONS, MOTION_EASES, REDUCED_CROSSFADE_S } from './contract'
import { staggerFor } from './tokens'
import { gsap } from 'gsap'

export interface TweenPair {
  from: gsap.TweenVars
  to: gsap.TweenVars
}

/** Screen enter (catalogue row #3): 240 ms `power3.out`. Every transform preset ends with
 * `clearProps: 'transform'` so the screen root keeps no residual `translate(0, 0)` — a leftover
 * transform would make it a containing block for the fixed-position overlays. */
export const ENTER_PRESETS: Record<EnterPreset, TweenPair> = {
  rise: {
    from: { y: 6, opacity: 0 },
    to: { y: 0, opacity: 1, duration: 0.24, ease: 'power3.out', clearProps: 'transform' },
  },
  fade: {
    from: { opacity: 0 },
    to: { opacity: 1, duration: 0.24, ease: 'power3.out' },
  },
  slideRight: {
    from: { x: -12, opacity: 0 },
    to: { x: 0, opacity: 1, duration: 0.24, ease: 'power3.out', clearProps: 'transform' },
  },
}

/** The same preset with the §2.7 reduced rule applied: transforms dropped, opacity capped at
 * 120 ms. The `off` case never reaches here — the stub handles it. */
export function enterPreset(preset: EnterPreset, reduced: boolean): TweenPair {
  const pair = ENTER_PRESETS[preset]
  if (!reduced) return pair
  return {
    from: { opacity: 0 },
    to: { opacity: 1, duration: REDUCED_CROSSFADE_S, ease: MOTION_EASES['dur-1'], clearProps: 'transform' },
  }
}

/** Row #4 list stagger: `li` / `tr` y 4→0, `amount: 0.18`, cap 12 items — past twelve the rest
 * are shown at once, a longer reveal would only delay the table. */
export const LIST_STAGGER_CAP = 12
export const LIST_STAGGER: TweenPair = {
  from: { y: 4, opacity: 0 },
  to: { y: 0, opacity: 1, duration: MOTION_DURATIONS['dur-3'], ease: MOTION_EASES['dur-3'], stagger: { amount: 0.18 }, clearProps: 'transform' },
}

/** Rows and chips (`stagger-1`), cards and stations (`stagger-2`). */
export const ROW_STAGGER = staggerFor('stagger-1')
export const CARD_STAGGER = staggerFor('stagger-2')

/** "Pop" (§2.7): `back.out(1.4)` from scale .6, ONLY for elements ≤ 24 px — a ring, a chip, a
 * node filling in. On anything larger the overshoot reads as a wobble. */
export const POP: TweenPair = {
  from: { scale: 0.6 },
  to: { scale: 1, duration: MOTION_DURATIONS['dur-3'], ease: MOTION_EASES.pop, clearProps: 'transform' },
}

// --- round 2 shared shapes -------------------------------------------------------------------

/** M1 the seam: a 2 px accent line drawing from the card's top-centre outward — the Macron's
 * GESTURE, not its shape (brand §7). `scaleX` from the centre, 0.3 s; plays at 0.3–0.6 s. */
export const SEAM: TweenPair = {
  from: { scaleX: 0, transformOrigin: '50% 50%', opacity: 1 },
  to: { scaleX: 1, duration: 0.3, ease: MOTION_EASES['dur-3'], clearProps: 'transform' },
}

/** M1 card rise (the success card, the stage summary): y 6→0, 240 ms `power3.out`. */
export const CARD_RISE: TweenPair = ENTER_PRESETS.rise

/** M6 toast enter: x 12→0, `dur-2` `expo.out`. Exit is opacity 160 ms then height 160 ms. */
export const TOAST_ENTER: TweenPair = {
  from: { x: 12, opacity: 0 },
  to: { x: 0, opacity: 1, duration: MOTION_DURATIONS['dur-2'], ease: MOTION_EASES['dur-3'], clearProps: 'transform' },
}
export const TOAST_EXIT_S = 0.16

/** I8 / M5 crossfades: outgoing `dur-1`, incoming `dur-2`. Opacity only, so reduced motion
 * keeps them (capped by `fadeDuration`). */
export const CROSSFADE_OUT: TweenPair = {
  from: { opacity: 1 },
  to: { opacity: 0, duration: MOTION_DURATIONS['dur-1'], ease: MOTION_EASES['dur-1'] },
}
export const CROSSFADE_IN: TweenPair = {
  from: { opacity: 0 },
  to: { opacity: 1, duration: MOTION_DURATIONS['dur-2'], ease: MOTION_EASES['dur-2'] },
}

/** I7 edge draw: `strokeDashoffset` length→0 over 220 ms. The caller sets `strokeDasharray`. */
export const EDGE_DRAW_S = 0.22

/** The Flip settings the two shared-element moves use. `scale: false` everywhere — a Flip that
 * scales text reads as a zoom, not a move. */
export const FLIP_SHARED = { duration: 0.36, ease: 'power3.inOut', scale: false, absolute: true } as const
export const FLIP_PLATE = { duration: 0.18, ease: MOTION_EASES['dur-2'], scale: false } as const

/** CSS mirrors (base.css) so a test can hold the two in step: the press scale, the focus
 * ring-in length and the M10 theme reveal. */
export const PRESS_SCALE = 0.985
export const RING_IN_S = MOTION_DURATIONS['dur-1']
export const THEME_REVEAL_S = 0.42

/** Caps a target list for a stagger so one long list cannot blow the tween budget. */
export function capTargets<T>(targets: readonly T[], cap: number): T[] {
  return targets.slice(0, cap)
}

/** The §4 global invariant: ≤ 30 concurrent tweens. A choreography that would start more than
 * the remaining budget allows should fall back to applying its end state. Counts only tweens
 * (not timelines) that are actively running on the global timeline. */
export function activeTweenCount(): number {
  if (typeof window === 'undefined') return 0
  return gsap.globalTimeline.getChildren(true, true, false).filter((t) => t.isActive()).length
}

export function underTweenBudget(wanted: number): boolean {
  return activeTweenCount() + wanted <= MAX_CONCURRENT_TWEENS
}
