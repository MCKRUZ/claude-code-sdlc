// Row #12 — Toasts (M6). Enter slides in 12 px from the right over `dur-2` (a notification
// arrives, it does not fly in) and clears its transform. Exit fades 160 ms, then the height
// collapses 160 ms so the stack closes up — the kit keeps the node mounted until the timeline
// resolves. The progress rail is a CLOCK, not an animation: `scaleX 1→0`, linear, over the real
// ttl; the kit holds the handle and pauses it while the region is hovered or focused. A same-title
// toast arriving within the dedupe window updates in place: `toastUpdate` crossfades its text
// over 120 ms. Under a disabled context every row is an instant end state.
import type { Choreo } from '../contract'
import { TOAST_ENTER, TOAST_EXIT_S } from '../presets'
import { fadeDuration, timelineFor, transformsAllowed } from './_shared'

export const TOAST_UPDATE_S = 0.12

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
      const from = transformsAllowed(ctx) ? TOAST_ENTER.from : { opacity: 0 }
      return tl.fromTo(refs.el, from, { ...TOAST_ENTER.to, duration: fadeDuration(ctx, ctx.durations['dur-2']) })
    }
    tl.to(refs.el, { opacity: 0, duration: fadeDuration(ctx, TOAST_EXIT_S), ease: ctx.eases['dur-1'] }, 0)
    if (transformsAllowed(ctx)) {
      tl.to(refs.el, { height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, duration: TOAST_EXIT_S, ease: ctx.eases['dur-2'] }, TOAST_EXIT_S)
    }
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

export interface ToastUpdateRefs {
  /** The text block (title + detail) that just changed in place. */
  text: Element | null
}

/** A 120 ms opacity crossfade for text replaced in place (same-title dedupe). */
export const toastUpdate: Choreo<ToastUpdateRefs> = {
  name: 'toastUpdate',
  play(ctx, refs) {
    const tl = timelineFor(ctx)
    if (!refs.text) return tl
    return tl.fromTo(refs.text, { opacity: 0 }, { opacity: 1, duration: fadeDuration(ctx, TOAST_UPDATE_S), ease: ctx.eases['dur-1'], clearProps: 'opacity' })
  },
}
