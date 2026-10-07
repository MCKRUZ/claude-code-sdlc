// Row #18 — Constellation settle. Bodies tween from their previous (cached) positions to the new
// layout through a plain positions object the scene owns; `onUpdate` calls R3F's `invalidate`
// so a frame is drawn only while something moves. A body with no cached position starts at its
// nearest dependency's position (the model's job: it hands us a complete `from`), never at the
// origin — there is no bloom-from-origin replay.
import type { Choreo } from '../contract'
import { timelineFor } from './_shared'

export interface ConstellationSettleRefs {
  /** Flat `[x0, y0, z0, x1, …]` the scene reads each frame. Mutated in place. */
  positions: number[] | Float32Array
  to: ArrayLike<number>
  onUpdate?: () => void
  /** Tether dash offsets, redrawn alongside. */
  dash?: { offset: number } | null
}

export const constellationSettle: Choreo<ConstellationSettleRefs> = {
  name: 'constellationSettle',
  play(ctx, refs) {
    const tl = timelineFor(ctx, { defaults: { ease: ctx.eases['dur-4'] }, onUpdate: refs.onUpdate })
    const n = Math.min(refs.positions.length, refs.to.length)
    if (n === 0) return tl
    const target: Record<string, number> = {}
    for (let i = 0; i < n; i += 1) target[i] = refs.to[i] as number
    tl.to(refs.positions, { ...target, duration: 0.6, onUpdate: refs.onUpdate, onComplete: refs.onUpdate }, 0)
    if (refs.dash) tl.to(refs.dash, { offset: refs.dash.offset + 1, duration: 0.6 }, 0)
    return tl
  },
}

export interface HoverDimRefs {
  /** Per-instance opacity the scene writes into the instance colour; 1 = lit, `dim` = dimmed. */
  weights: number[] | Float32Array
  neighbours: ReadonlySet<number> | null
  dim?: number
}

/** Hover dims non-neighbours over 160 ms; `neighbours: null` restores everything. */
export const constellationHoverDim: Choreo<HoverDimRefs> = {
  name: 'constellationHoverDim',
  play(ctx, refs) {
    const tl = timelineFor(ctx)
    const target: Record<string, number> = {}
    for (let i = 0; i < refs.weights.length; i += 1) {
      target[i] = refs.neighbours === null || refs.neighbours.has(i) ? 1 : (refs.dim ?? 0.25)
    }
    return tl.to(refs.weights, { ...target, duration: 0.16, ease: ctx.eases['dur-1'] })
  },
}
