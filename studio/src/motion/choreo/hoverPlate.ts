// Row #17 — Hover plates, hover cards and tooltips (M7). After the kit's 350 ms intent delay the
// plate ARRIVES: opacity 0→1, y 4→0, `dur-1` `power2.out`, transform cleared at the end. It
// leaves in 80 ms (opacity only) — the kit keeps the node mounted, `role="tooltip"` and
// `pointer-events: none` intact, until this resolves; Escape skips the fade and closes at once.
// Under a disabled context both directions are an instant end state.
import type { Choreo } from '../contract'
import { fadeDuration, timelineFor, transformsAllowed } from './_shared'

export const HOVER_INTENT_MS = 350
export const HOVER_CLOSE_S = 0.08

export interface HoverPlateRefs {
  el: Element | null
  /** Default `in`. */
  direction?: 'in' | 'out'
}

export const hoverPlate: Choreo<HoverPlateRefs> = {
  name: 'hoverPlate',
  play(ctx, refs) {
    const tl = timelineFor(ctx)
    if (!refs.el) return tl
    if (refs.direction === 'out') {
      return tl.to(refs.el, { opacity: 0, duration: fadeDuration(ctx, HOVER_CLOSE_S), ease: ctx.eases['dur-1'] })
    }
    const y = transformsAllowed(ctx) ? 4 : 0
    return tl.fromTo(refs.el, { opacity: 0, y }, { opacity: 1, y: 0, duration: fadeDuration(ctx, ctx.durations['dur-1']), ease: ctx.eases['dur-1'], clearProps: 'transform' })
  },
}
