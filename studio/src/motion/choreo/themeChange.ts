// Row #25 — Theme / density change. The colour transition itself is CSS (`html.theme-switching`
// in index.css); this row adds the class, removes it after 200 ms, and plays the density Flip
// the caller captured on its lists. Instant when disabled: the class is still added and removed
// so the CSS half, which has its own reduced-motion rule, decides.
import { Flip } from 'gsap/Flip'
import type { Choreo } from '../contract'
import { timelineFor } from './_shared'

export const THEME_SWITCHING_CLASS = 'theme-switching'

export interface ThemeChangeRefs {
  html?: HTMLElement | null
  listState?: Flip.FlipState | null
  listTargets?: ArrayLike<Element> | null
}

export const themeChange: Choreo<ThemeChangeRefs> = {
  name: 'themeChange',
  play(ctx, refs) {
    const tl = timelineFor(ctx)
    const html = refs.html ?? (typeof document === 'undefined' ? null : document.documentElement)
    if (html) {
      html.classList.add(THEME_SWITCHING_CLASS)
      tl.call(() => html.classList.remove(THEME_SWITCHING_CLASS), [], ctx.enabled ? 0.26 : 0)
    }
    if (ctx.enabled && !ctx.reduced && refs.listState && refs.listTargets) {
      tl.add(Flip.from(refs.listState, { targets: refs.listTargets, duration: 0.3, ease: 'power3.inOut', scale: false, nested: true }) as never, 0)
    }
    return tl
  },
}
