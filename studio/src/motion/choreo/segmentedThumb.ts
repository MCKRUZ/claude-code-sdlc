// Row #7 — Segmented thumb / Tabs underline, for a HOST timeline. The kit's own default is the
// CSS transition in `ui/Segmented.tsx` / `ui/Tabs.tsx` (`transition-[transform,width]`, zero JS
// per frame, zeroed by `[data-motion="off"]`); this row exists for a host that needs the slide
// sequenced on a parent timeline (a sign-off ceremony moving the window picker, say). It tweens
// `x` and `width` directly from measured `{ left, width }` pairs — no Flip plugin, so the host
// pays nothing it did not ask for.
import { gsap } from 'gsap'
import type { Choreo } from '../contract'
import { timelineFor, transformsAllowed } from './_shared'

export interface ThumbRect {
  left: number
  width: number
}

export interface SegmentedThumbRefs {
  thumb: Element | null
  from: ThumbRect
  to: ThumbRect
}

export const segmentedThumb: Choreo<SegmentedThumbRefs> = {
  name: 'segmentedThumb',
  play(ctx, refs) {
    const tl = timelineFor(ctx)
    if (!refs.thumb || !transformsAllowed(ctx)) {
      // Reduced: the thumb is simply placed, nothing slides. Off: the stub timeline, and the kit's
      // own CSS (already zeroed) has put the thumb where it belongs — gsap is never touched.
      if (refs.thumb && ctx.enabled) gsap.set(refs.thumb, { x: refs.to.left, width: refs.to.width })
      return tl
    }
    return tl.fromTo(
      refs.thumb,
      { x: refs.from.left, width: refs.from.width },
      { x: refs.to.left, width: refs.to.width, duration: 0.18, ease: 'power3.inOut' },
    )
  },
}
