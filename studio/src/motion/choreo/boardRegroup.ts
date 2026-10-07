// Row #6 — Board regroup / filter Flip. The caller captured `Flip.getState` of the
// `[data-flip-id^="spec:"]` rows and group headers before the fact changed; this row plays it
// inside the list container (the positioned, scrolled ancestor — never `<main>`).
import { Flip } from 'gsap/Flip'
import { gsap } from 'gsap'
import type { Choreo } from '../contract'
import { timelineFor } from './_shared'

export interface BoardRegroupRefs {
  state: Flip.FlipState | null
  container: Element | null
  selector?: string
}

export const boardRegroup: Choreo<BoardRegroupRefs> = {
  name: 'boardRegroup',
  play(ctx, refs) {
    if (!ctx.enabled || ctx.reduced || !refs.state || !refs.container) return timelineFor(ctx)
    const targets = refs.container.querySelectorAll(refs.selector ?? '[data-flip-id^="spec:"]')
    const duration = 0.4
    const ease = 'power3.inOut'
    const tl = Flip.from(refs.state, {
      targets,
      absolute: true,
      nested: true,
      scale: false,
      duration,
      ease,
      stagger: 0.012,
      onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration, ease, clearProps: 'transform' }),
      onLeave: (els) => gsap.to(els, { opacity: 0, duration: duration / 2 }),
    })
    if (ctx.parent) ctx.parent.add(tl, ctx.parentLabel)
    return tl
  },
}
