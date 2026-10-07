// Where a plate goes once its body has been projected (studio-observatory.md §5.0 `Plates`): a
// pure screen-space layout, no DOM, no three. Each plate wants to sit just outside its body's
// silhouette — `below` the body (the constellation) or `above` it (a caption-style use). When two
// plates would overlap, the later one in the sort is pushed further out along its side's axis
// until it clears everything already placed: a greedy vertical stack. A pushed plate is marked
// `displaced` so the DOM half can draw a leader line back to its body, and a plate that would
// leave the host at the bottom flips to the other side instead of being clipped.
//
// Order matters and is deterministic: plates are laid out nearest-first (smallest `depth`), so
// the plate in front keeps its natural spot and the ones behind step aside.

export type PlateSide = 'below' | 'above'

export interface PlateInput {
  id: string
  /** The body's centre in host px. */
  x: number
  y: number
  /** The body's projected radius in px (0 for a point anchor). */
  r: number
  /** Measured plate box. */
  w: number
  h: number
  side: PlateSide
  /** 0 nearest … 1 farthest; the sort key. */
  depth: number
}

export interface PlacedPlate {
  id: string
  left: number
  top: number
  /** Which side the plate ended up on (it may have flipped). */
  side: PlateSide
  /** How far (px) the plate was pushed from its natural spot along the side axis. */
  shift: number
  displaced: boolean
}

/** Gap between a body's silhouette and its plate, and between stacked plates. */
export const PLATE_GAP = 6
/** A shift smaller than this is not worth a leader line. */
export const LEADER_MIN_SHIFT = 10
/** Give up stacking after this many pushes (a pathological pile); the plate stays where it is. */
const MAX_PUSHES = 24

interface Rect { left: number; top: number; right: number; bottom: number }

/** Two plates collide when their boxes meet with less than half a gap between them sideways —
 * so neighbours in one row never touch — or overlap at all vertically. */
function overlaps(a: Rect, b: Rect): boolean {
  const g = PLATE_GAP / 2
  return a.left - g < b.right && a.right + g > b.left && a.top < b.bottom && a.bottom > b.top
}

function naturalTop(p: PlateInput, side: PlateSide): number {
  return side === 'below' ? p.y + p.r + PLATE_GAP : p.y - p.r - PLATE_GAP - p.h
}

/** Lay every plate out inside a `width × height` host. */
export function stackPlates(plates: readonly PlateInput[], width: number, height: number): PlacedPlate[] {
  const order = [...plates].sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id))
  const placed: Rect[] = []
  const out: PlacedPlate[] = []
  for (const p of order) {
    // Keep the plate inside the host horizontally; a plate half off the edge reads as a bug.
    const left = Math.max(0, Math.min(width - p.w, p.x - p.w / 2))
    const rectAt = (top: number): Rect => ({ left, top, right: left + p.w, bottom: top + p.h })
    // Stack away from the body on `side` until clear of everything placed; report whether the
    // result is still inside the host.
    const stack = (side: PlateSide): { top: number; inside: boolean } => {
      let top = naturalTop(p, side)
      for (let pushes = 0; pushes < MAX_PUSHES; pushes++) {
        const hit = placed.find((r) => overlaps(rectAt(top), r))
        if (!hit) break
        top = side === 'below' ? hit.bottom + PLATE_GAP : hit.top - PLATE_GAP - p.h
      }
      return { top, inside: top >= 0 && top + p.h <= height }
    }
    const other: PlateSide = p.side === 'below' ? 'above' : 'below'
    let side = p.side
    let attempt = stack(side)
    if (!attempt.inside) {
      // Flip rather than clip: the other side may have room (a plate near the bottom edge, or a
      // pile that has filled the rows below the rail).
      const flipped = stack(other)
      if (flipped.inside) { side = other; attempt = flipped }
    }
    let top = attempt.top
    if (!attempt.inside) {
      // Neither side has room (an expanded plate taller than the host's half): pin it inside the
      // host on its own side rather than clip it; the leader line still finds its body.
      top = Math.max(0, Math.min(height - p.h, top))
    }
    placed.push(rectAt(top))
    const shift = Math.abs(top - naturalTop(p, side))
    out.push({ id: p.id, left, top, side, shift, displaced: shift >= LEADER_MIN_SHIFT || side !== p.side })
  }
  return out
}

/** The one plate that is expanded (hover / focus) and the box it measures expanded. */
export interface ExpandedPlate {
  id: string
  w: number
  h: number
}

/** A placed plate plus the box it occupies — collapsed for every plate but the expanded one. */
export interface PlacedPlateBox extends PlacedPlate {
  w: number
  h: number
}

/** `stackPlates` with positional stability under hover (observatory v4 critique, sprint-graph-
 * hover): `plates` carry their COLLAPSED sizes, so the resting layout is the same whether or not
 * something is hovered and no plate ever moves because a neighbour grew. The expanded plate then
 * grows in place from its anchor corner — top-left for a plate below its body, bottom-left for one
 * above — and shifts only by the minimum that keeps it inside the host. */
export function stackPlatesStable(
  plates: readonly PlateInput[], width: number, height: number, expanded?: ExpandedPlate,
): PlacedPlateBox[] {
  const sizes = new Map(plates.map((p) => [p.id, { w: p.w, h: p.h }]))
  return stackPlates(plates, width, height).map((placed) => {
    const size = sizes.get(placed.id) ?? { w: 0, h: 0 }
    if (!expanded || expanded.id !== placed.id) return { ...placed, ...size }
    let left = placed.left
    let top = placed.side === 'below' ? placed.top : placed.top + size.h - expanded.h
    // Minimum shift into the viewport, never a re-stack.
    left = Math.max(0, Math.min(width - expanded.w, left))
    top = Math.max(0, Math.min(height - expanded.h, top))
    return { ...placed, left, top, w: expanded.w, h: expanded.h }
  })
}

/** The point on the plate's edge a leader line starts from: the middle of the edge facing the
 * body. */
export function leaderStart(placed: PlacedPlate, w: number, h: number): { x: number; y: number } {
  return { x: placed.left + w / 2, y: placed.side === 'below' ? placed.top : placed.top + h }
}
