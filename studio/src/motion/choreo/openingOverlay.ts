// Row #16 — Opening overlay. The root (`fixed inset-0`) only fades: its geometry is never
// animated so the `coversWindow` e2e pin holds from the first paint. The card settles; the ring
// sweep is a CSS keyframe and the mono clock ticks as today (`\d+s` pin) — neither is here.
import type { Choreo } from '../contract'
import { fadeDuration, timelineFor, transformsAllowed } from './_shared'

export interface OpeningOverlayRefs {
  root: Element | null
  card?: Element | null
}

export const openingOverlay: Choreo<OpeningOverlayRefs> = {
  name: 'openingOverlay',
  play(ctx, refs) {
    const tl = timelineFor(ctx)
    if (refs.root) tl.fromTo(refs.root, { opacity: 0 }, { opacity: 1, duration: fadeDuration(ctx, 0.15) }, 0)
    if (refs.card) {
      const move = transformsAllowed(ctx)
      tl.fromTo(refs.card, { opacity: 0, scale: move ? 0.96 : 1, y: move ? 8 : 0 },
        { opacity: 1, scale: 1, y: 0, duration: fadeDuration(ctx, 0.22), ease: 'power3.out', clearProps: 'transform' }, 0.05)
    }
    return tl
  },
}
