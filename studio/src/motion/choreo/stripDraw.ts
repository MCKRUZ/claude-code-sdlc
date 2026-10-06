// Row #32 — Strip draw (togo-command-center.md §4, visual §7). The lifecycle strip's lit rail
// draws (`stroke-dashoffset` 100 → 0 over `dur-5` `expo.inOut`; the `<line>` carries
// `pathLength="100"` so the dash maths is the same at every width and in jsdom, which has no
// `getTotalLength`) and its stations POP with `stagger-2` from a quarter second in. The strip
// registers through `frameAssemble.join()` exactly as the Spine did, so one assemble owns the
// opening and this plays at `FRAME_ASSEMBLE_JOIN_AT`.
//
// Tiers: `full` only — `quiet` and `settled` paint the strip at once (`stripDrawPlays`). Reduced
// motion: none (a draw and a pop are both transforms in all but name). Disabled / test: the
// row returns the stub without touching a node. Every tween ends in `clearProps`, so the end
// state in every tier is the cold-reload picture: a fully drawn rail, stations at scale 1, no
// inline style left behind. The one idle motion the strip keeps afterwards is the current
// station's `attachPulse`, `full` tier only, owned by `LifecycleStrip`.
import type { Choreo, FamiliarityTier } from '../contract'
import { MOTION_STAGGERS } from '../contract'
import { POP, STRIP_DRAW_EASE, STRIP_DRAW_S } from '../presets'
import { present, timelineFor, transformsAllowed } from './_shared'

export interface StripDrawRefs {
  /** The lit rail `<line>` (with `pathLength="100"`); the row draws its dash offset to 0. */
  rail: SVGGeometryElement | null
  /** The station rings in registry order (POP, `stagger-2`). */
  stations: ReadonlyArray<Element | null | undefined>
  tier?: FamiliarityTier
}

/** The strip draws on the first opens only. */
export function stripDrawPlays(tier: FamiliarityTier | undefined): boolean {
  return (tier ?? 'full') === 'full'
}

/** Where the station pops start, in seconds after the rail begins to draw. */
export const STRIP_STATIONS_AT_S = 0.25

export const stripDraw: Choreo<StripDrawRefs> = {
  name: 'stripDraw',
  play(ctx, refs) {
    const tl = timelineFor(ctx, { defaults: { ease: STRIP_DRAW_EASE, overwrite: 'auto' } })
    // Disabled, reduced, or a familiar project: nothing moves and nothing is written — the markup
    // at rest IS the end state.
    if (!ctx.enabled || !transformsAllowed(ctx) || !stripDrawPlays(refs.tier)) return tl
    if (refs.rail) {
      tl.fromTo(
        refs.rail,
        { strokeDasharray: 100, strokeDashoffset: 100 },
        { strokeDashoffset: 0, duration: STRIP_DRAW_S, clearProps: 'strokeDasharray,strokeDashoffset' },
        0,
      )
    }
    const stations = present(refs.stations)
    if (stations.length > 0) {
      tl.fromTo(
        stations,
        { ...POP.from, opacity: 0 },
        { ...POP.to, opacity: 1, stagger: MOTION_STAGGERS['stagger-2'], clearProps: 'transform,opacity' },
        STRIP_STATIONS_AT_S,
      )
    }
    return tl
  },
}
