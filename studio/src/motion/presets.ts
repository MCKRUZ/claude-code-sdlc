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
