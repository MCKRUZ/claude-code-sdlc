// Row #22 — Clash resolve. The resolved card leaves to the left, the next arrives from the
// right; the "(N left)" counter follows rule #11 through `useCountUp`, not here.
import type { Choreo } from '../contract'
import { fadeDuration, timelineFor, transformsAllowed } from './_shared'

export interface ClashResolveRefs {
  outgoing?: Element | null
  incoming?: Element | null
}

export const clashResolve: Choreo<ClashResolveRefs> = {
  name: 'clashResolve',
  play(ctx, refs) {
    const tl = timelineFor(ctx, { defaults: { ease: ctx.eases['dur-2'] } })
    const move = transformsAllowed(ctx)
    const d = fadeDuration(ctx, ctx.durations['dur-2'])
    if (refs.outgoing) tl.to(refs.outgoing, { x: move ? -12 : 0, opacity: 0, duration: d }, 0)
    if (refs.incoming) tl.fromTo(refs.incoming, { x: move ? 12 : 0, opacity: 0 }, { x: 0, opacity: 1, duration: d, clearProps: 'transform' }, refs.outgoing ? d : 0)
    return tl
  },
}
