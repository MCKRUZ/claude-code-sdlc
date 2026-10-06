// Row #17 — Hover plates and hover cards, after the 350 ms intent delay (the delay is the
// kit's; this row only draws the plate in).
import type { Choreo } from '../contract'
import { fadeDuration, timelineFor, transformsAllowed } from './_shared'

export const HOVER_INTENT_MS = 350

export interface HoverPlateRefs {
  el: Element | null
}

export const hoverPlate: Choreo<HoverPlateRefs> = {
  name: 'hoverPlate',
  play(ctx, refs) {
    const tl = timelineFor(ctx)
    if (!refs.el) return tl
    const y = transformsAllowed(ctx) ? 4 : 0
    return tl.fromTo(refs.el, { opacity: 0, y }, { opacity: 1, y: 0, duration: fadeDuration(ctx, ctx.durations['dur-1']), clearProps: 'transform' })
  },
}
