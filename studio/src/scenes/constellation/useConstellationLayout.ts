// Where the bodies sit, and how they get there (studio-observatory.md §5.2 "Performance",
// §4.2 row 18). On every data change: start positions come from the per-project cache (or a
// neighbour's cached spot, or the seeded hash — never the origin), the core force layout runs
// (sync ≤ SYNC_LAYOUT_MAX, incremental above), and the bodies TWEEN from where they are drawn now
// to the new layout through `choreo/constellationSettle`. The flat `positions` array is what the
// scene draws from each frame; `target` is where the layout wants them. No React state per frame:
// the tween mutates the array in place and flips the dirty flags.
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { ChoreoContext } from '../../motion/contract'
import { constellationSettle } from '../../motion/choreo/constellationSettle'
import { computeLayout } from '../core/layout/forceLayout'
import type { LayoutOptions, LayoutResult } from '../core/layout/forceLayout'
import { loadLayoutCache, saveLayoutCache } from '../core/layout/layoutCache'
import type { Position } from '../core/layout/layoutCache'
import { startPositions } from './constellationModel'
import type { RenderModel } from './constellationModel'

export interface DirtyFlags {
  transforms: boolean
  colors: boolean
  tethers: boolean
}

export interface LayoutHandles {
  /** Flat `[x0, y0, z0, x1, …]` by `RenderBody.index` — what is DRAWN now. Mutated in place. */
  positions: React.RefObject<number[]>
  /** Where the layout wants each body. */
  target: React.RefObject<number[]>
  dirty: React.RefObject<DirtyFlags>
  /** Advance the incremental layout, if one is running. True while still busy. */
  layoutTick: () => boolean
  /** Drag: move one body (layout only, cached on `saveCache`; never a write to the project). */
  moveBody: (index: number, x: number, y: number, z: number) => void
  saveCache: () => void
}

function flatFrom(model: RenderModel, byId: ReadonlyMap<string, Position>): number[] {
  const out = new Array<number>(model.bodies.length * 3).fill(0)
  for (const b of model.bodies) {
    const p = byId.get(b.id)
    if (!p) continue
    out[b.index * 3] = p[0]
    out[b.index * 3 + 1] = p[1]
    out[b.index * 3 + 2] = p[2]
  }
  return out
}

function byIdFrom(model: RenderModel, flat: ArrayLike<number>): Map<string, Position> {
  const out = new Map<string, Position>()
  for (const b of model.bodies) out.set(b.id, [flat[b.index * 3], flat[b.index * 3 + 1], flat[b.index * 3 + 2]])
  return out
}

export function useConstellationLayout(
  model: RenderModel,
  projectKey: string,
  getContext: () => ChoreoContext,
  invalidate: () => void,
  wake: () => void,
  /** Round 2 (I9): the host's aspect policy (`LAYOUT_POLICY[source]`). Stable per host. */
  options?: LayoutOptions,
): LayoutHandles {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const positions = useRef<number[]>([])
  const target = useRef<number[]>([])
  const dirty = useRef<DirtyFlags>({ transforms: true, colors: true, tethers: true })
  const lastModel = useRef<RenderModel | null>(null)
  const settle = useRef<{ kill(): unknown } | null>(null)
  const pending = useRef<LayoutResult | null>(null)
  const keyRef = useRef(projectKey)
  keyRef.current = projectKey

  const markMoved = useCallback(() => {
    dirty.current.transforms = true
    dirty.current.tethers = true
    invalidate()
  }, [invalidate])

  useEffect(() => {
    const cached = loadLayoutCache(projectKey)
    // Bodies already on screen keep their drawn position as the tween's start; the rest begin at
    // the cached / neighbour / seeded spot the model chooses.
    const drawn = lastModel.current ? byIdFrom(lastModel.current, positions.current) : null
    const start = startPositions(model, cached)
    if (drawn) for (const [id, p] of drawn) if (start.has(id)) start.set(id, p)

    const result = computeLayout({
      nodes: model.bodies.map((b) => ({ id: b.id, buildOrderIndex: b.buildOrderIndex })),
      links: model.edges.map((e) => ({ from: model.bodies[e.from].id, to: model.bodies[e.to].id })),
      initial: start,
    }, optionsRef.current)

    // With motion off there is no demand loop to step an incremental layout, so finish it now:
    // the first paint is the final layout, as §4.2 row 18's reduced column promises.
    if (!result.settled && result.step && !getContext().enabled) {
      while (!result.step()) { /* settle synchronously */ }
      result.settled = true
    }
    const from = flatFrom(model, start)
    const to = flatFrom(model, result.positions)
    positions.current = from
    target.current = to
    lastModel.current = model
    settle.current?.kill()
    settle.current = null
    pending.current = null

    if (result.settled) {
      settle.current = constellationSettle.play(getContext(), { positions: from, to, onUpdate: markMoved })
      saveLayoutCache(projectKey, result.positions)
    } else {
      // Incremental: positions follow the simulation directly, a few ticks per frame.
      positions.current = to.slice()
      pending.current = result
    }
    markMoved()
    wake()
    return () => {
      settle.current?.kill()
      settle.current = null
    }
    // getContext / wake / markMoved are stable refs from the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, projectKey])

  const layoutTick = useCallback((): boolean => {
    const result = pending.current
    if (!result?.step) return false
    const done = result.step()
    const model = lastModel.current
    if (model) {
      const flat = flatFrom(model, result.positions)
      target.current = flat
      positions.current = flat.slice()
      dirty.current.transforms = true
      dirty.current.tethers = true
    }
    if (done) {
      pending.current = null
      saveLayoutCache(keyRef.current, result.positions)
    }
    return !done
  }, [])

  const moveBody = useCallback((index: number, x: number, y: number, z: number) => {
    const i = index * 3
    for (const arr of [positions.current, target.current]) {
      if (i + 2 >= arr.length) continue
      arr[i] = x
      arr[i + 1] = y
      arr[i + 2] = z
    }
    markMoved()
  }, [markMoved])

  const saveCache = useCallback(() => {
    const model = lastModel.current
    if (!model) return
    saveLayoutCache(keyRef.current, byIdFrom(model, target.current))
  }, [])

  // One object for the life of the mount. The scene lists `layout` in effect and `onTick` deps;
  // a fresh literal every render made the hover effect replay its dim tween and `wake()` on every
  // settle → re-render → settle, so the demand loop never reached zero frames. Everything inside
  // is a ref or a stable callback, so the memo never needs to change.
  return useMemo(
    () => ({ positions, target, dirty, layoutTick, moveBody, saveCache }),
    [layoutTick, moveBody, saveCache],
  )
}
