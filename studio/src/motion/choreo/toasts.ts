// Row #12 — Toasts. Enter slides in 12 px from the right (a notification arrives, it does not
// fly in); exit fades and collapses its height so the
// stack closes up. The progress rail's shrink over the ttl is a separate tween the kit can pause
// on hover / focus — `toastRail` returns it so the kit holds the handle.
import type { Choreo } from '../contract'
import { fadeDuration, timelineFor, transformsAllowed } from './_shared'

export interface ToastRefs {
  el: Element | null
  direction: 'enter' | 'exit'
}

export const toasts: Choreo<ToastRefs> = {
  name: 'toasts',
  play(ctx, refs) {
    const tl = timelineFor(ctx, { defaults: { ease: ctx.eases['dur-3'] } })
    if (!refs.el) return tl
    if (refs.direction === 'enter') {
      const x = transformsAllowed(ctx) ? 12 : 0
      return tl.fromTo(refs.el, { x, opacity: 0 }, { x: 0, opacity: 1, duration: fadeDuration(ctx, ctx.durations['dur-2']), clearProps: 'transform' })
    }
    tl.to(refs.el, { opacity: 0, duration: fadeDuration(ctx, 0.16) }, 0)
    if (transformsAllowed(ctx)) tl.to(refs.el, { height: 0, marginTop: 0, marginBottom: 0, duration: 0.16 }, 0.04)
    return tl
  },
}

export interface ToastRailRefs {
  rail: Element | null
  ttlSeconds: number
}

/** `scaleX 1→0` over the ttl, linear — the rail is a clock, not an animation. */
export const toastRail: Choreo<ToastRailRefs> = {
  name: 'toastRail',
  play(ctx, refs) {
    const tl = timelineFor(ctx)
    if (!refs.rail) return tl
    return tl.fromTo(refs.rail, { scaleX: 1, transformOrigin: 'left' }, { scaleX: 0, duration: refs.ttlSeconds, ease: 'none' })
  },
}
