// Row #15 — Dialog / palette open and close. Scrim fades, the panel settles from a hair smaller;
// close reverses in 120 ms. Result rows (the palette) stagger in at 15 ms.
import type { Choreo } from '../contract'
import { fadeDuration, present, timelineFor, transformsAllowed } from './_shared'

export interface DialogRefs {
  scrim?: Element | null
  panel: Element | null
  rows?: ReadonlyArray<Element | null>
  direction: 'open' | 'close'
}

export const dialog: Choreo<DialogRefs> = {
  name: 'dialog',
  play(ctx, refs) {
    const tl = timelineFor(ctx, { defaults: { ease: ctx.eases['dur-3'] } })
    const move = transformsAllowed(ctx)
    if (refs.direction === 'close') {
      const d = fadeDuration(ctx, ctx.durations['dur-1'])
      if (refs.scrim) tl.to(refs.scrim, { opacity: 0, duration: d }, 0)
      if (refs.panel) tl.to(refs.panel, { opacity: 0, scale: move ? 0.98 : 1, duration: d, clearProps: 'transform' }, 0)
      return tl
    }
    if (refs.scrim) tl.fromTo(refs.scrim, { opacity: 0 }, { opacity: 1, duration: fadeDuration(ctx, ctx.durations['dur-1']) }, 0)
    if (refs.panel) {
      tl.fromTo(refs.panel, { opacity: 0, scale: move ? 0.98 : 1, y: move ? 6 : 0 },
        { opacity: 1, scale: 1, y: 0, duration: fadeDuration(ctx, ctx.durations['dur-2']), clearProps: 'transform' }, 0)
    }
    const rows = present(refs.rows ?? [])
    if (rows.length > 0) tl.fromTo(rows, { opacity: 0 }, { opacity: 1, duration: fadeDuration(ctx, ctx.durations['dur-1']), stagger: 0.015 }, 0.05)
    return tl
  },
}
