// Row #20 — Console open / close and row expand. The wrapper keeps its `h-64` class; the tween
// drives `height` 0→256 and clears it afterwards so the class is the resting truth again. A row
// expands to `height: 'auto'` while its `<pre>` fades in.
import type { Choreo } from '../contract'
import { fadeDuration, timelineFor, transformsAllowed } from './_shared'

export const CONSOLE_HEIGHT_PX = 256

export interface ConsoleToggleRefs {
  wrapper: Element | null
  direction: 'open' | 'close'
}

export const consoleToggle: Choreo<ConsoleToggleRefs> = {
  name: 'consoleToggle',
  play(ctx, refs) {
    const tl = timelineFor(ctx, { defaults: { ease: ctx.eases['dur-3'] } })
    if (!refs.wrapper) return tl
    const d = fadeDuration(ctx, 0.24)
    if (!transformsAllowed(ctx)) {
      return tl.fromTo(refs.wrapper, { opacity: refs.direction === 'open' ? 0 : 1 }, { opacity: refs.direction === 'open' ? 1 : 0, duration: d })
    }
    if (refs.direction === 'open') {
      return tl.fromTo(refs.wrapper, { height: 0, opacity: 0 }, { height: CONSOLE_HEIGHT_PX, opacity: 1, duration: 0.24, clearProps: 'height' })
    }
    return tl.to(refs.wrapper, { height: 0, opacity: 0, duration: 0.24 })
  },
}

export interface ConsoleRowRefs {
  row: Element | null
  pre?: Element | null
}

export const consoleRowExpand: Choreo<ConsoleRowRefs> = {
  name: 'consoleRowExpand',
  play(ctx, refs) {
    const tl = timelineFor(ctx, { defaults: { ease: ctx.eases['dur-2'] } })
    if (refs.row && transformsAllowed(ctx)) tl.fromTo(refs.row, { height: 0 }, { height: 'auto', duration: 0.2, clearProps: 'height' }, 0)
    if (refs.pre) tl.fromTo(refs.pre, { opacity: 0 }, { opacity: 1, duration: fadeDuration(ctx, 0.2) }, 0.05)
    return tl
  },
}
