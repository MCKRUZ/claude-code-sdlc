// Row #5 — Skeleton → content. Two opacity tweens in the same box; no layout morph, because the
// skeleton was sized to the content it stands in for.
import type { Choreo } from '../contract'
import { fadeDuration, timelineFor } from './_shared'

export interface SkeletonSwapRefs {
  skeleton: Element | null
  content: Element | null
}

export const skeletonSwap: Choreo<SkeletonSwapRefs> = {
  name: 'skeletonSwap',
  play(ctx, refs) {
    const tl = timelineFor(ctx)
    if (refs.skeleton) tl.to(refs.skeleton, { opacity: 0, duration: fadeDuration(ctx, ctx.durations['dur-1']) }, 0)
    if (refs.content) tl.fromTo(refs.content, { opacity: 0 }, { opacity: 1, duration: fadeDuration(ctx, ctx.durations['dur-2']) }, 0)
    return tl
  },
}
