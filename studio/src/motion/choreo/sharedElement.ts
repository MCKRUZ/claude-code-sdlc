// Row #8 — Shared element row → detail (and Back → row). The detail's title block takes the
// state the row stashed under the same `data-flip-id` and Flips from it; `toggleClass` lets the
// CSS lift it above siblings while in flight. Nothing stashed → the detail simply appears, which
// is also the reduced / off end state.
import { Flip } from 'gsap/Flip'
import type { Choreo } from '../contract'
import { flipStore } from '../flipStore'
import { timelineFor } from './_shared'

export interface SharedElementRefs {
  id: string
  target: Element | null
}

export const sharedElement: Choreo<SharedElementRefs> = {
  name: 'sharedElement',
  play(ctx, refs) {
    // Always consume the stash, even when disabled, so it cannot replay on a later visit.
    const stashed = flipStore.take(refs.id)
    if (!ctx.enabled || ctx.reduced || !stashed || !refs.target) return timelineFor(ctx)
    const tl = Flip.from(stashed.state, {
      targets: refs.target,
      absolute: true,
      scale: false,
      duration: 0.36,
      ease: 'power3.inOut',
      toggleClass: 'is-flipping',
    })
    if (ctx.parent) ctx.parent.add(tl, ctx.parentLabel)
    return tl
  },
}
