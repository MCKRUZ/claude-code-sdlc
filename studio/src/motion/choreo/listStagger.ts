// Row #4 — List stagger on FIRST data arrival (`[data-reveal]` children). Not on every refresh:
// a list that re-staggers each poll turns the 2 s Workflow tick into a flicker. Cap 12.
import type { Choreo } from '../contract'
import { LIST_STAGGER, LIST_STAGGER_CAP, capTargets } from '../presets'
import { present, timelineFor, transformsAllowed } from './_shared'

export interface ListStaggerRefs {
  items: ReadonlyArray<Element | null>
}

export const listStagger: Choreo<ListStaggerRefs> = {
  name: 'listStagger',
  play(ctx, refs) {
    const tl = timelineFor(ctx)
    const items = capTargets(present(refs.items), LIST_STAGGER_CAP)
    if (items.length === 0) return tl
    const from = transformsAllowed(ctx) ? LIST_STAGGER.from : { opacity: 0 }
    return tl.fromTo(items, from, LIST_STAGGER.to)
  },
}
