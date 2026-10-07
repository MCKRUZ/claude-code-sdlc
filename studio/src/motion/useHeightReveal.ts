// M11: a list that appears under its parent row (the Sidebar's Build sub-list) grows from
// height 0 to its own height and fades in over `dur-2`, instead of snapping the rows below it
// down by 120 px. The tween ends with `clearProps: 'height'` so the element is back on `auto`
// — the end state equals a cold reload, and a later row count change needs no re-measure.
//
// The hook watches a REF, not the element's presence: the Sidebar renders the `<ul>` only while
// Build is where you are, so on the render that mounts it `open` flips true and the element is
// there; on the render that unmounts it there is nothing to shrink (the rows are gone), which is
// the honest end state too. Under the stub (test mode, motion off, reduced) `fromTo` applies the
// end state at once — `clearProps` — so the markup is what a cold reload would show.
import type { RefObject } from 'react'
import { MOTION_DURATIONS, MOTION_EASES } from './contract'
import { reduced } from './motion'
import { useStudioGSAP } from './useStudioGSAP'

export const HEIGHT_REVEAL_S = MOTION_DURATIONS['dur-2']

export function useHeightReveal(ref: RefObject<HTMLElement | null>, open: boolean): void {
  useStudioGSAP(
    (g) => {
      const el = ref.current
      if (!open || !el) return
      // Reduced motion keeps the opacity beat (capped by the stub rule) and drops the height
      // change — a growing box is a transform in all but name.
      if (reduced()) {
        g.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: MOTION_EASES['dur-1'], clearProps: 'height,opacity' })
        return
      }
      g.fromTo(
        el,
        { height: 0, opacity: 0, overflow: 'hidden' },
        { height: 'auto', opacity: 1, duration: HEIGHT_REVEAL_S, ease: MOTION_EASES['dur-2'], clearProps: 'height,opacity,overflow' },
      )
    },
    { scope: ref, dependencies: [open] },
  )
}
