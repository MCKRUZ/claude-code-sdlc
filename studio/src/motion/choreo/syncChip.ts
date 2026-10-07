// Row #23 — Sync chip. Trigger: `syncState.kind` changed. The `StatusDot` and the label
// crossfade; no MorphSVG — the chip has no path to morph. Under reduced motion the crossfade is
// the one tween that still runs (capped at 120 ms); off → swap.
import type { Choreo } from '../contract'
import { fadeDuration, present, timelineFor } from './_shared'

export interface SyncChipRefs {
  dot?: Element | null
  label?: Element | null
}

export const syncChip: Choreo<SyncChipRefs> = {
  name: 'syncChip',
  play(ctx, refs) {
    const tl = timelineFor(ctx)
    const targets = present([refs.dot, refs.label])
    if (targets.length === 0) return tl
    return tl.fromTo(targets, { opacity: 0 }, { opacity: 1, duration: fadeDuration(ctx, ctx.durations['dur-2']) })
  },
}
