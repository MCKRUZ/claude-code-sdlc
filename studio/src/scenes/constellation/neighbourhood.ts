// I7 — the spec's dependency neighbourhood (studio-upgrade-2 §4 P3), as a PURE function from the
// backlog store's last rows to an SVG layout: the specs this one depends on to its left, the specs
// that depend on it to its right, this spec in the middle. Owned by P3 — the one constellation
// file outside P4 — and it imports `constellationModel` read-only so the two figures share one
// vocabulary: ghost iff the id is absent from what the Board or Sprint fetched, radius by risk tier
// only, colour STRICTLY by the plugin's status word (`toneForStatus`), and a NOT READY row marked
// by a dashed amber RING (a shape cue the legend names) — never by overriding the body's colour,
// so colour is never the only signal and never means two things. No canvas: inline SVG, drawn by
// `SpecNeighbourhood.tsx`.
//
// Honesty rules kept structurally: dependents come ONLY from other rows' declared `dependsOn` (a
// spec never names its own dependents), and no string field but `risk` and `status` reaches a
// number or a colour — labels, owners, prose are carried to the node as text and never measured.
import type { ColorToken } from '../../theme/tokens'
import type { ChipTone } from '../../ui/contract'
import type { BoardRow, SprintSlateRow } from '../../../shared/types'
import { GHOST_RADIUS, GHOST_TOKEN, WARN_TOKEN, radiusForRisk, toneForStatus } from './constellationModel'

export interface NeighbourNode {
  id: string
  /** The row's title or name; a ghost has only its id (the component never invents a name). */
  label: string | null
  ghost: boolean
  /** The plugin's status word as written, null for a ghost. */
  status: string | null
  risk: string | null
  notReady: boolean
  /** SVG user units. */
  x: number
  y: number
  r: number
  colorToken: ColorToken
  chipTone: ChipTone
  /** A dashed 1 px ring in this token when the plugin says NOT READY; null otherwise. */
  ringToken: ColorToken | null
}

export interface NeighbourEdge {
  /** Dependent → dependency, as declared in the dependent's frontmatter. */
  from: string
  to: string
  ghost: boolean
}

export interface Neighbourhood {
  centre: NeighbourNode
  dependencies: NeighbourNode[]
  dependents: NeighbourNode[]
  edges: NeighbourEdge[]
  /** The SVG viewBox the layout was made for. */
  width: number
  height: number
}

/** Pixels per model unit: `RISK_RADIUS` is .32 / .42 / .54 in the 3D figure; here a HIGH body is
 * ~13 px so three rows of nodes fit a 280 px-wide rail. */
export const UNIT_PX = 24
/** The node columns sit this far inside the viewBox: room for a body AND its label (up to two
 * lines of ident text hang off the outer side), so a right-hand label is never clipped at the
 * card's edge. */
export const COLUMN_INSET = 128
export const ROW_GAP = 44
export const MIN_HEIGHT = 120
export const DEFAULT_WIDTH = 560

interface Known {
  id: string
  label: string | null
  status: string
  risk: string
  notReady: boolean
  dependsOn: readonly string[]
}

/** One map of everything the store holds, the Board row winning over the slate row for the same
 * id (it carries the title); `dor` comes from the slate, which is the only place the plugin says
 * it. Pure: the inputs are the store's arrays, never the store itself. */
function knownSpecs(rows: ReadonlyArray<BoardRow>, slate: ReadonlyArray<SprintSlateRow>): Map<string, Known> {
  const known = new Map<string, Known>()
  for (const s of slate) {
    known.set(s.id, { id: s.id, label: s.name || null, status: s.status, risk: s.risk, notReady: s.dor === 'NOT READY', dependsOn: s.dependsOn })
  }
  for (const r of rows) {
    const fromSlate = known.get(r.spec)
    known.set(r.spec, {
      id: r.spec,
      label: r.title || r.name || fromSlate?.label || null,
      status: r.status,
      risk: r.risk,
      notReady: fromSlate?.notReady ?? false,
      dependsOn: r.dependsOn.length > 0 ? r.dependsOn : (fromSlate?.dependsOn ?? r.dependsOn),
    })
  }
  return known
}

function nodeFor(id: string, known: Known | undefined, x: number, y: number): NeighbourNode {
  if (!known) {
    return { id, label: null, ghost: true, status: null, risk: null, notReady: false, x, y, r: GHOST_RADIUS * UNIT_PX, colorToken: GHOST_TOKEN, chipTone: 'neutral', ringToken: null }
  }
  const tone = toneForStatus(known.status)
  return {
    id,
    label: known.label,
    ghost: false,
    status: known.status,
    risk: known.risk,
    notReady: known.notReady,
    x,
    y,
    r: radiusForRisk(known.risk) * UNIT_PX,
    colorToken: tone.token,
    chipTone: tone.chip,
    /** The dashed ring's token: the warn class, only on the plugin's NOT READY. */
    ringToken: known.notReady ? WARN_TOKEN : null,
  }
}

/** Evenly spaced y positions for `count` nodes in a band of `height`. */
function spread(count: number, height: number): number[] {
  if (count === 0) return []
  if (count === 1) return [height / 2]
  const span = ROW_GAP * (count - 1)
  const top = (height - span) / 2
  return Array.from({ length: count }, (_, i) => top + i * ROW_GAP)
}

const byId = (a: string, b: string) => a.localeCompare(b)

/** The neighbourhood of `centre`, or null when the store holds nothing at all — the component
 * then says "Open the Board once to see this spec's neighbourhood" instead of drawing an empty
 * sky. `centreRow` is the row the spec view was opened with, so the centre draws from what the
 * screen already knows even when the store has not seen this id. */
export function buildNeighbourhood(
  centreRow: Pick<BoardRow, 'spec' | 'title' | 'name' | 'status' | 'risk' | 'dependsOn'>,
  rows: ReadonlyArray<BoardRow>,
  slate: ReadonlyArray<SprintSlateRow> = [],
  width: number = DEFAULT_WIDTH,
): Neighbourhood | null {
  if (rows.length === 0 && slate.length === 0) return null
  const known = knownSpecs(rows, slate)
  const centreKnown = known.get(centreRow.spec)
  const centreDeps = (centreKnown?.dependsOn.length ? centreKnown.dependsOn : centreRow.dependsOn)
  const dependencyIds = [...new Set(centreDeps)].filter((id) => id !== centreRow.spec).sort(byId)
  // Dependents: ONLY other specs whose declared dependsOn names this one.
  const dependentIds = [...known.values()]
    .filter((k) => k.id !== centreRow.spec && k.dependsOn.includes(centreRow.spec))
    .map((k) => k.id)
    .sort(byId)

  const height = Math.max(MIN_HEIGHT, ROW_GAP * Math.max(dependencyIds.length, dependentIds.length, 1) + 56)
  const leftYs = spread(dependencyIds.length, height)
  const rightYs = spread(dependentIds.length, height)
  const dependencies = dependencyIds.map((id, i) => nodeFor(id, known.get(id), COLUMN_INSET, leftYs[i]))
  const dependents = dependentIds.map((id, i) => nodeFor(id, known.get(id), width - COLUMN_INSET, rightYs[i]))
  const centreFacts: Known = centreKnown ?? {
    id: centreRow.spec, label: centreRow.title || centreRow.name || null, status: centreRow.status, risk: centreRow.risk, notReady: false, dependsOn: centreRow.dependsOn,
  }
  const centre = nodeFor(centreRow.spec, centreFacts, width / 2, height / 2)
  const edges: NeighbourEdge[] = [
    ...dependencies.map((d) => ({ from: centreRow.spec, to: d.id, ghost: d.ghost })),
    ...dependents.map((d) => ({ from: d.id, to: centreRow.spec, ghost: false })),
  ]
  return { centre, dependencies, dependents, edges, width, height }
}

/** An SVG path for one edge, as a gentle horizontal curve between two node centres, stopping at
 * each node's rim so the stroke never crosses a body. */
export function edgePath(from: NeighbourNode, to: NeighbourNode): string {
  const dx = to.x - from.x
  const dir = Math.sign(dx) || 1
  const x1 = from.x + dir * from.r
  const x2 = to.x - dir * to.r
  const cx = (x1 + x2) / 2
  return `M ${x1} ${from.y} C ${cx} ${from.y}, ${cx} ${to.y}, ${x2} ${to.y}`
}

/** The accessible name the component gives a node button: "Spec 0002: claim export", or
 * "Spec 0042 (not shown)" for a ghost — never a bare id as the whole name. */
export function nodeName(node: NeighbourNode): string {
  if (node.ghost || !node.label) return `Spec ${node.id} (not shown)`
  return `Spec ${node.id}: ${node.label}`
}
