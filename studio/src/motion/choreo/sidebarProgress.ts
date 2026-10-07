// Row #9 — Sidebar progress + Now badge. Trigger: `status.stages` changed after `refreshStatus`.
// The bar tweens from the previous REAL fraction (the caller passes both; neither is invented),
// the Now chip Flips from the old row to the new, the new current ring pops.
import { Flip } from 'gsap/Flip'
import type { Choreo } from '../contract'
import { POP } from '../presets'
import { timelineFor, transformsAllowed } from './_shared'

export interface SidebarProgressRefs {
  bar?: Element | null
  /** 0..1, both measured from `status.stages`. `null` previous → the bar is set, not tweened. */
  fromFraction: number | null
  toFraction: number
  nowState?: Flip.FlipState | null
  nowBadge?: Element | null
  newRing?: Element | null
}

export const sidebarProgress: Choreo<SidebarProgressRefs> = {
  name: 'sidebarProgress',
  play(ctx, refs) {
    const tl = timelineFor(ctx, { defaults: { ease: ctx.eases['dur-4'] } })
    if (refs.bar) {
      const to = `${Math.round(refs.toFraction * 100)}%`
      if (refs.fromFraction === null || !ctx.enabled) tl.set(refs.bar, { width: to }, 0)
      else tl.fromTo(refs.bar, { width: `${Math.round(refs.fromFraction * 100)}%` }, { width: to, duration: 0.42 }, 0)
    }
    if (ctx.enabled && !ctx.reduced && refs.nowState && refs.nowBadge) {
      tl.add(Flip.from(refs.nowState, { targets: refs.nowBadge, duration: 0.3, ease: 'power3.inOut', scale: false }) as never, 0.1)
    }
    if (refs.newRing && transformsAllowed(ctx)) tl.fromTo(refs.newRing, POP.from, POP.to, 0.2)
    return tl
  },
}
