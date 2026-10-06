// Where each body sits (studio-observatory.md §5.0 `layout/forceLayout.ts`), by d3-force-3d.
//
// The forces are the design's, verbatim: links at distance 2.2 (strength .7) hold a dependency
// near its dependents; many-body −3.5 keeps bodies apart; centre keeps the cloud in frame; a firm
// `forceZ(0)` (plus a hard clamp on read) flattens it to a shallow slab so perspective cannot
// resize a body by depth, a weaker `forceY(0)` leans it wide rather than tall
// (the figure is twice as wide as it is high); and `forceOrderX` pulls each body's x toward its
// place in the plugin's build order so the graph reads left → right in the order the plugin gave.
// y and z are therefore meaningless, and the figcaption says so. Starting positions are seeded by
// hashing ids (see `hash.ts`), so the same backlog always lays out the same way.
//
// Up to SYNC_LAYOUT_MAX nodes the 240 ticks run synchronously (≈ 5–15 ms). Above it, 60 ticks run
// now and the caller advances the rest with `step()` across frames — no worker, because the CSP
// forbids blob workers and a few frames of settling is cheap enough.
import { forceCenter, forceLink, forceManyBody, forceSimulation, forceY, forceZ } from 'd3-force-3d'
import type { Force, SimulationLink, SimulationNode } from 'd3-force-3d'
import { SYNC_LAYOUT_MAX } from '../sceneDefaults'
import { fnv1a, mulberry32, seededPosition } from './hash'
import type { Position } from './layoutCache'

export interface LayoutNode {
  id: string
  /** Position in the plugin's build order, or null when it listed none for this id. */
  buildOrderIndex: number | null
}

/** A `depends_on` edge, dependent → dependency. Edges whose ends are not in `nodes` are dropped. */
export interface LayoutLink {
  from: string
  to: string
}

export interface LayoutInput {
  nodes: LayoutNode[]
  links: LayoutLink[]
  /** Carried positions (from the cache or the previous layout) win over the seeded start. */
  initial?: ReadonlyMap<string, Position> | null
}

export interface LayoutOptions {
  /** Test hook; defaults to `SYNC_LAYOUT_MAX`. */
  syncMax?: number
}

export interface LayoutResult {
  positions: Map<string, Position>
  /** False when the incremental path still has ticks to run. */
  settled: boolean
  /** Only on the incremental path: runs `INCREMENTAL_PER_STEP` ticks, refreshes `positions`,
   * returns true once settled or the step budget is spent. */
  step?: () => boolean
}

export const SYNC_TICKS = 240
export const INCREMENTAL_FIRST = 60
export const INCREMENTAL_PER_STEP = 20
/** ≈ 2 s at 30 fps. */
export const INCREMENTAL_MAX_STEPS = 60

export const ORDER_SPACING = 2.2
export const ORDER_STRENGTH = 0.6
export const FLATTEN_Y_STRENGTH = 0.3
export const FLATTEN_Z_STRENGTH = 0.6
/** Every z is clamped to this slab after the layout settles. Perspective resizes bodies by depth,
 * and radius must read as the risk tier alone — a LOW near the camera must never look HIGH. */
export const Z_CLAMP = 0.6

interface SimNode extends SimulationNode {
  id: string
  order: number | null
  x: number
  y: number
  z: number
}

type SimLink = SimulationLink<SimNode>

/** Pull x toward `(buildOrderIndex − mid) · spacing`. Nodes without an order are left alone. */
export function forceOrderX(spacing = ORDER_SPACING, strength = ORDER_STRENGTH): Force<SimNode> {
  let nodes: SimNode[] = []
  let mid = 0
  const force: Force<SimNode> = (alpha) => {
    for (const n of nodes) {
      if (n.order === null) continue
      n.vx = (n.vx ?? 0) + ((n.order - mid) * spacing - n.x) * strength * alpha
    }
  }
  force.initialize = (ns) => {
    nodes = ns
    const orders = ns.filter((n) => n.order !== null).map((n) => n.order as number)
    mid = orders.length ? (Math.min(...orders) + Math.max(...orders)) / 2 : 0
  }
  return force
}

function toSimNodes(input: LayoutInput): SimNode[] {
  return input.nodes.map((n) => {
    const [x, y, z] = input.initial?.get(n.id) ?? seededPosition(n.id)
    return { id: n.id, order: n.buildOrderIndex, x, y, z }
  })
}

function readPositions(nodes: SimNode[], into: Map<string, Position>): Map<string, Position> {
  for (const n of nodes) into.set(n.id, [n.x, n.y, Math.max(-Z_CLAMP, Math.min(Z_CLAMP, n.z))])
  return into
}

export function computeLayout(input: LayoutInput, options: LayoutOptions = {}): LayoutResult {
  const syncMax = options.syncMax ?? SYNC_LAYOUT_MAX
  const nodes = toSimNodes(input)
  const known = new Set(nodes.map((n) => n.id))
  const links: SimLink[] = input.links
    .filter((l) => known.has(l.from) && known.has(l.to) && l.from !== l.to)
    .map((l) => ({ source: l.from, target: l.to }))

  // Seeded from the id set, so the jiggle d3 adds to coincident nodes is reproducible too.
  const seed = fnv1a(input.nodes.map((n) => n.id).join('\u0000'))
  const sim = forceSimulation<SimNode>(nodes, 3)
    .randomSource(mulberry32(seed))
    .force('link', forceLink<SimNode, SimLink>(links).id((n) => n.id).distance(2.2).strength(0.7))
    .force('charge', forceManyBody<SimNode>().strength(-3.5))
    .force('center', forceCenter<SimNode>())
    .force('z', forceZ<SimNode>(0).strength(FLATTEN_Z_STRENGTH))
    .force('y', forceY<SimNode>(0).strength(FLATTEN_Y_STRENGTH))
    .force('orderX', forceOrderX())
    .stop()

  const positions = new Map<string, Position>()

  if (nodes.length <= syncMax) {
    sim.tick(SYNC_TICKS)
    return { positions: readPositions(nodes, positions), settled: true }
  }

  sim.tick(INCREMENTAL_FIRST)
  readPositions(nodes, positions)
  let steps = 0
  const step = (): boolean => {
    if (steps >= INCREMENTAL_MAX_STEPS || sim.alpha() < sim.alphaMin()) return true
    sim.tick(INCREMENTAL_PER_STEP)
    steps += 1
    readPositions(nodes, positions)
    return steps >= INCREMENTAL_MAX_STEPS || sim.alpha() < sim.alphaMin()
  }
  return { positions, settled: false, step }
}
