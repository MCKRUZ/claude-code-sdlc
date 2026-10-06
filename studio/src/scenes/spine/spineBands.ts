// Where the Spine's plates go (studio-observatory.md §5.1 "Interactions"; observatory v4
// critique, stage-light / stage-dark): two level bands, not a greedy pile.
//
// The default plate stack hangs every plate off its own body and pushes a collision DOWN, which
// on the Spine put "Build Loop" across its knot and the upper plates into the group-label row.
// Here the rail is a ruler and the plates are its tick labels: an UPPER band whose plates sit
// strictly below the caption row and at least `BAND_CLEARANCE` above the highest station disc,
// and a LOWER band the same distance below the lowest disc. Stations alternate between the two
// (the scene sets `side`), so same-band neighbours are two stations apart; where two of them
// would still meet, they are nudged SIDEWAYS as a centred cluster, never stacked. A plate that
// left its station's centre, or whose band is far from its own disc, gets a straight leader.
//
// Pure screen-space geometry: no DOM, no three. `plates` carry collapsed boxes (the store's
// stability rule), so the resting layout is the same whether or not a plate is hovered; the
// expanded plate grows in place from its anchor edge and shifts only to stay inside the host.
import type { ExpandedPlate, PlacedPlateBox, PlateInput, PlateSide } from '../core/plateLayout'
import { PLATE_GAP } from '../core/plateLayout'
import type { PlateFrame } from '../core/projectLabels'

/** Minimum px between a plate's facing edge and ANY station disc. */
export const BAND_CLEARANCE = 10
/** Minimum px between two plates in one band. */
export const NEIGHBOUR_GAP = 8
/** Px between the caption row's bottom and the upper band's top. */
export const LABEL_GAP = 6
/** Px between the lower band and a second lower row (where the upper band could not fit). */
export const ROW_GAP = 8
/** A sideways nudge at least this big, or a band this much further from the plate's own disc
 * than `BAND_CLEARANCE`, earns a leader line. */
export const LEADER_NUDGE = 4
export const LEADER_FAR = 8
/** A band too short for the labels, both rows and the discs (the 120 px compact band) squeezes
 * the upper row down toward the discs first — up to this many px INTO the disc zone, a touch,
 * never a cover — before giving up and dropping those plates to a second row under the rail. */
export const SQUEEZE_MAX = 12

interface Span {
  id: string
  /** Desired centre x (the station's). */
  cx: number
  w: number
}

interface Cluster {
  items: Span[]
  width: number
  want: number
}

/** One row: centre each plate on its station, then merge any that would touch into clusters
 * centred on the mean of their stations' x, inside `[0, width]`. Deterministic: sorted by station
 * x, then id. */
export function spreadRow(spans: readonly Span[], width: number, gap = NEIGHBOUR_GAP): Map<string, number> {
  const sorted = [...spans].sort((a, b) => a.cx - b.cx || a.id.localeCompare(b.id))
  let clusters: Cluster[] = sorted.map((s) => ({ items: [s], width: s.w, want: s.cx }))
  const leftOf = (c: Cluster) => Math.max(0, Math.min(width - c.width, c.want - c.width / 2))
  for (let guard = 0; guard < sorted.length + 1; guard++) {
    let merged = false
    for (let i = 0; i + 1 < clusters.length; i++) {
      const a = clusters[i], b = clusters[i + 1]
      if (leftOf(a) + a.width + gap > leftOf(b)) {
        const items = [...a.items, ...b.items]
        const want = items.reduce((sum, s) => sum + s.cx, 0) / items.length
        clusters.splice(i, 2, { items, width: a.width + gap + b.width, want })
        merged = true
        break
      }
    }
    if (!merged) break
  }
  const lefts = new Map<string, number>()
  for (const c of clusters) {
    let x = leftOf(c)
    for (const s of c.items) {
      lefts.set(s.id, x)
      x += s.w + gap
    }
  }
  return lefts
}

function naturalTop(p: PlateInput, side: PlateSide): number {
  return side === 'below' ? p.y + p.r + PLATE_GAP : p.y - p.r - PLATE_GAP - p.h
}

/** The Spine's plate layout; the `PlateLayout` the scene hands to `Plates`. */
export function layoutSpineBands(
  plates: readonly PlateInput[], width: number, height: number, expanded?: ExpandedPlate, frame?: PlateFrame,
): PlacedPlateBox[] {
  if (plates.length === 0) return []
  const captionBottom = frame?.captionBottom ?? 0
  let discTop = Infinity
  let discBottom = -Infinity
  for (const p of plates) {
    discTop = Math.min(discTop, p.y - p.r)
    discBottom = Math.max(discBottom, p.y + p.r)
  }
  const upper = plates.filter((p) => p.side === 'above')
  const lower = plates.filter((p) => p.side === 'below')
  const tallest = (row: readonly PlateInput[]) => row.reduce((m, p) => Math.max(m, p.h), 0)

  // Upper band: bottoms at `discTop − clearance`, but never above the caption row. A short band
  // squeezes the row down toward the discs (`SQUEEZE_MAX`); past that the plates fall to a
  // second row under the lower band. Lower band: tops at `discBottom + clearance`, squeezed up
  // only as far as the host's bottom edge demands.
  const upperH = tallest(upper)
  const upperTop = Math.max(captionBottom + LABEL_GAP, discTop - BAND_CLEARANCE - upperH)
  const upperBottom = upperTop + upperH
  const upperFits = upper.length === 0 || upperBottom - discTop <= SQUEEZE_MAX
  const lowerTop = Math.min(discBottom + BAND_CLEARANCE, height - tallest(lower))
  const secondRowTop = lowerTop + tallest(lower) + ROW_GAP

  const rows: { plates: readonly PlateInput[]; side: PlateSide; top: (p: PlateInput) => number }[] = [
    { plates: lower, side: 'below', top: () => lowerTop },
    upperFits
      ? { plates: upper, side: 'above', top: (p) => upperBottom - p.h }
      : { plates: upper, side: 'below', top: () => secondRowTop },
  ]

  const out: PlacedPlateBox[] = []
  for (const row of rows) {
    if (row.plates.length === 0) continue
    const lefts = spreadRow(row.plates.map((p) => ({ id: p.id, cx: p.x, w: p.w })), width)
    for (const p of row.plates) {
      const left = lefts.get(p.id) ?? Math.max(0, Math.min(width - p.w, p.x - p.w / 2))
      let top = row.top(p)
      // Never off the host: a row the band is too short for is pinned inside rather than clipped.
      top = Math.max(0, Math.min(height - p.h, top))
      const nudge = Math.abs(left + p.w / 2 - p.x)
      const gapToOwnDisc = row.side === 'below' ? top - (p.y + p.r) : p.y - p.r - (top + p.h)
      const shift = Math.abs(top - naturalTop(p, row.side))
      const displaced = nudge >= LEADER_NUDGE || gapToOwnDisc >= BAND_CLEARANCE + LEADER_FAR || row.side !== p.side
      let box = { left, top, w: p.w, h: p.h }
      if (expanded && expanded.id === p.id) {
        // Grow in place from the anchor edge (top for a plate below, bottom for one above), with
        // the minimum shift that keeps it inside the host — never a re-layout of the row.
        const grownTop = row.side === 'below' ? top : top + p.h - expanded.h
        box = {
          left: Math.max(0, Math.min(width - expanded.w, left)),
          top: Math.max(0, Math.min(height - expanded.h, grownTop)),
          w: expanded.w,
          h: expanded.h,
        }
      }
      out.push({ id: p.id, side: row.side, shift, displaced, ...box })
    }
  }
  // The store looks plates up by id; the order is fixed anyway so equal inputs give equal output.
  return out.sort((a, b) => a.id.localeCompare(b.id))
}
