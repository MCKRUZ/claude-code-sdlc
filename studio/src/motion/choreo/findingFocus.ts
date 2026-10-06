// Row #21 — Document finding focus. After `scrollIntoView`, the `[data-highlighted="true"]`
// card's ring pulses twice and rests. The ring is Tailwind's `ring-2 ring-brand-200` (classes
// unchanged — the e2e counts exactly one), so the tween drives `--tw-ring-opacity`, which the
// ring colour already reads; nothing about the classes or the DOM changes.
import type { Choreo } from '../contract'
import { timelineFor } from './_shared'

export interface FindingFocusRefs {
  card: Element | null
}

export const findingFocus: Choreo<FindingFocusRefs> = {
  name: 'findingFocus',
  play(ctx, refs) {
    const tl = timelineFor(ctx, { defaults: { ease: ctx.eases.ambient } })
    if (!refs.card || !ctx.enabled || ctx.reduced) return tl
    return tl
      .fromTo(refs.card, { '--tw-ring-opacity': 1 }, { '--tw-ring-opacity': 0.3, duration: 0.3, yoyo: true, repeat: 3 })
      .set(refs.card, { clearProps: '--tw-ring-opacity' })
  },
}
