// The Spine's three.js geometry helpers (studio-observatory.md §5.1 "Geometry"): the station
// points as `Vector3`s, the CatmullRom rail and its tube, and the mapping from an index fraction
// (what `spineModel.railProgress` yields) to the tube's arc-length `u` the shader samples — the
// rail wobbles gently in y / z so its arc length is not exactly linear in x.
import { CatmullRomCurve3, PlaneGeometry, TorusGeometry, TubeGeometry, Vector3 } from 'three'
import type { GroupCaption } from './spineModel'
import { stationPoint, stationU } from './spineModel'

export const RAIL_SEGMENTS = 160
export const RAIL_RADIUS = 0.028
export const ARC_RADIUS = 0.3
/** Legacy: a guessed outer reach. The plates now measure the real disc (`spineModel.discRadius`,
 * the ring's rim or the knot's reach); the export stays for callers. */
export const STATION_HIT_RADIUS = 0.34
/** Legacy: where a group caption floated above the rail, in world units. Captions are now pinned
 * to the band's top in CSS px (`projectLabels.ts` CAPTION_TOP_PX); the export stays for callers. */
export const CAPTION_LIFT = 0.62
export const GROUND_Y = -0.5

export function stationVectors(n: number): Vector3[] {
  return Array.from({ length: n }, (_, i) => {
    const p = stationPoint(i, n)
    return new Vector3(p.x, p.y, p.z)
  })
}

export interface Rail {
  curve: CatmullRomCurve3
  geometry: TubeGeometry
  /** Arc-length fraction at each station, in order. */
  stationArc: number[]
}

/** The rail through the stations. `stationArc[i]` is what `uLit` / `uCurrent` need for station
 * `i`: `TubeGeometry` samples the curve by arc length, so its `uv.x` is an arc fraction. */
export function buildRail(points: Vector3[]): Rail {
  const n = points.length
  if (n < 2) {
    // A single station has no rail to draw; an empty tube keeps the callers uniform.
    const curve = new CatmullRomCurve3([points[0] ?? new Vector3(), (points[0] ?? new Vector3()).clone().addScalar(0.001)])
    return { curve, geometry: new TubeGeometry(curve, 1, RAIL_RADIUS, 3), stationArc: points.map(() => 0) }
  }
  const curve = new CatmullRomCurve3(points, false, 'catmullrom', 0.5)
  const geometry = new TubeGeometry(curve, RAIL_SEGMENTS, RAIL_RADIUS, 10)
  const stationArc = points.map((_, i) => arcFraction(curve, stationU(i, n)))
  return { curve, geometry, stationArc }
}

/** Curve parameter `t` (uniform in station index) → arc-length fraction along the curve. */
export function arcFraction(curve: CatmullRomCurve3, t: number): number {
  const lengths = curve.getLengths(RAIL_SEGMENTS)
  const total = lengths[lengths.length - 1]
  if (!total) return 0
  const scaled = Math.min(1, Math.max(0, t)) * (lengths.length - 1)
  const lo = Math.floor(scaled)
  const hi = Math.min(lengths.length - 1, lo + 1)
  const frac = scaled - lo
  return (lengths[lo] + (lengths[hi] - lengths[lo]) * frac) / total
}

/** Map a model fraction (`i/(n−1)` space) to the tube's arc fraction by interpolating between the
 * two nearest stations, so a lit span ends exactly at a station's ring. */
export function toArc(rail: Rail, u: number): number {
  const arcs = rail.stationArc
  const n = arcs.length
  if (n < 2) return 0
  const scaled = Math.min(1, Math.max(0, u)) * (n - 1)
  const lo = Math.floor(scaled)
  const hi = Math.min(n - 1, lo + 1)
  return arcs[lo] + (arcs[hi] - arcs[lo]) * (scaled - lo)
}

/** The partial doc arc: a thin torus sweeping `theta` radians, starting at twelve o'clock. */
export function buildArcGeometry(theta: number): TorusGeometry {
  return new TorusGeometry(ARC_RADIUS, 0.012, 8, 48, Math.max(0.0001, theta))
}

export interface GroupTick {
  label: string
  x: number
}

/** A thin tick under the rail at each boundary BETWEEN groups (none before the first). */
export function groupTicks(captions: GroupCaption[], points: Vector3[]): GroupTick[] {
  const ticks: GroupTick[] = []
  for (let g = 1; g < captions.length; g++) {
    const prev = points[captions[g - 1].to]
    const next = points[captions[g].from]
    if (!prev || !next) continue
    ticks.push({ label: captions[g].label, x: (prev.x + next.x) / 2 })
  }
  return ticks
}

/** Where a group's caption is pinned: the midpoint of its first and last stations (in all three
 * axes, so perspective skews it as little as possible — within 2 px of the two rings' screen
 * centre at every band size). Only the projected x is used on screen — the store pins the row
 * to the band's top — so FOUNDATION sits centred over stations 0–3. */
export function captionAnchor(caption: GroupCaption, points: Vector3[]): Vector3 | null {
  const a = points[caption.from]
  const b = points[caption.to]
  if (!a || !b) return null
  return a.clone().add(b).multiplyScalar(0.5)
}

export function buildTickGeometry(): PlaneGeometry {
  return new PlaneGeometry(0.02, 0.6)
}

export function buildGroundGeometry(): PlaneGeometry {
  return new PlaneGeometry(14, 6)
}
