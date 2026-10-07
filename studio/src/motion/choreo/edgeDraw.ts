// Row #27 — Edge draw (I7). The spec neighbourhood's SVG edges draw in over `EDGE_DRAW_S`
// (220 ms): each path's `strokeDasharray` is set to its own length and `strokeDashoffset` tweens
// length → 0, so the line appears to be drawn from the dependent toward the dependency. Under
// reduced motion the edges simply appear (opacity ≤ 120 ms, no dash); off → the stub applies the
// end state, which is the same DOM a cold reload paints (no dash attributes left behind).
import type { Choreo, EdgeDrawRefs } from '../contract'
import { EDGE_DRAW_S } from '../presets'
import { fadeDuration, present, timelineFor, transformsAllowed } from './_shared'

export type { EdgeDrawRefs }

/** `getTotalLength` needs layout; jsdom has none, so a missing method reads as "no dash" and the
 * edge falls back to the opacity path — the same thing reduced motion does. */
function lengthOf(edge: SVGGeometryElement): number | null {
  if (typeof edge.getTotalLength !== 'function') return null
  try {
    const length = edge.getTotalLength()
    return Number.isFinite(length) && length > 0 ? length : null
  } catch {
    return null
  }
}

export const edgeDraw: Choreo<EdgeDrawRefs> = {
  name: 'edgeDraw',
  play(ctx, refs) {
    const tl = timelineFor(ctx)
    const edges = present(refs.edges)
    if (edges.length === 0) return tl
    if (!transformsAllowed(ctx)) {
      // Reduced: opacity only, capped; off: the stub sets opacity 1 at once.
      return tl.fromTo(edges, { opacity: 0 }, { opacity: 1, duration: fadeDuration(ctx, EDGE_DRAW_S), ease: ctx.eases['dur-1'] })
    }
    for (const [i, edge] of edges.entries()) {
      const length = lengthOf(edge)
      if (length === null) {
        tl.fromTo(edge, { opacity: 0 }, { opacity: 1, duration: EDGE_DRAW_S, ease: ctx.eases['dur-1'] }, i * 0.02)
        continue
      }
      tl.fromTo(
        edge,
        { strokeDasharray: length, strokeDashoffset: length, opacity: 1 },
        { strokeDashoffset: 0, duration: EDGE_DRAW_S, ease: ctx.eases['dur-3'], clearProps: 'strokeDasharray,strokeDashoffset' },
        i * 0.02,
      )
    }
    return tl
  },
}
