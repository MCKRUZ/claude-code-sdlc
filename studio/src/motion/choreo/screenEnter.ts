// Row #3 — Screen enter, as a timeline for callers outside `useEnter` (which is the normal path).
// Same preset table, same `clearProps: 'transform'` rule; focus moving to the h2 is the caller's.
import type { Choreo, EnterPreset } from '../contract'
import { enterPreset } from '../presets'
import { timelineFor } from './_shared'

export interface ScreenEnterRefs {
  root: Element | null
  preset?: EnterPreset
}

export const screenEnter: Choreo<ScreenEnterRefs> = {
  name: 'screenEnter',
  play(ctx, refs) {
    const tl = timelineFor(ctx)
    if (!refs.root) return tl
    const pair = enterPreset(refs.preset ?? 'rise', ctx.reduced)
    return tl.fromTo(refs.root, pair.from, { ...pair.to, overwrite: 'auto' })
  },
}
