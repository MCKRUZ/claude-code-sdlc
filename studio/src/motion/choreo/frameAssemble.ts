// Row #2 — Project open, Frame assemble. Trigger: `openProject` resolved and the Frame mounted.
// Only INNER content moves: the `<aside>` elements and `<main>` are never transformed (§4
// invariants), so the caller passes the chat panel's inner wrapper, not the aside. The Spine's
// rail is a shader uniform, so it is driven through a plain object the scene reads back.
import type { Choreo } from '../contract'
import { POP } from '../presets'
import { present, timelineFor, transformsAllowed } from './_shared'

export interface FrameAssembleRefs {
  sidebarHeader?: Element | null
  stageRows?: Element[]
  titleChars?: Element[]
  screenRoot?: Element | null
  chatInner?: Element | null
  /** `{ draw: 0..1 }`; the scene's material reads `draw` as `uDraw` each frame. */
  rail?: { draw: number; onUpdate?: () => void } | null
  stations?: Element[]
}

export const frameAssemble: Choreo<FrameAssembleRefs> = {
  name: 'frameAssemble',
  play(ctx, refs) {
    const tl = timelineFor(ctx, { defaults: { ease: ctx.eases['dur-5'], overwrite: 'auto' } })
    const move = transformsAllowed(ctx)
    if (refs.sidebarHeader) tl.fromTo(refs.sidebarHeader, { opacity: 0 }, { opacity: 1, duration: 0.18 }, 0)
    const rows = present(refs.stageRows ?? [])
    if (rows.length > 0) {
      tl.fromTo(rows, { x: move ? -8 : 0, opacity: 0 }, { x: 0, opacity: 1, duration: ctx.durations['dur-3'], stagger: 0.024, clearProps: 'transform' }, 0.05)
    }
    const chars = refs.titleChars ?? []
    if (chars.length > 0) tl.fromTo(chars, { opacity: 0 }, { opacity: 1, duration: ctx.durations['dur-3'], stagger: { amount: 0.2 } }, 0.1)
    if (refs.screenRoot) {
      tl.fromTo(refs.screenRoot, { y: move ? 6 : 0, opacity: 0 }, { y: 0, opacity: 1, duration: 0.24, ease: 'power3.out', clearProps: 'transform' }, 0.15)
    }
    if (refs.chatInner) {
      tl.fromTo(refs.chatInner, { x: move ? 12 : 0, opacity: 0 }, { x: 0, opacity: 1, duration: ctx.durations['dur-3'], clearProps: 'transform' }, 0.2)
    }
    if (refs.rail) {
      const rail = refs.rail
      tl.fromTo(rail, { draw: 0 }, { draw: 1, duration: 0.7, ease: ctx.eases['dur-4'], onUpdate: () => rail.onUpdate?.() }, 0.1)
    }
    const stations = present(refs.stations ?? [])
    if (stations.length > 0) {
      tl.fromTo(stations, { ...POP.from, opacity: 0 }, { ...POP.to, opacity: 1, stagger: 0.06 }, 0.5)
    }
    return tl
  },
}
