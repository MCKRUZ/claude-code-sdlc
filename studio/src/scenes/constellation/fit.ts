// Camera fit for the Dependency Constellation (studio-observatory.md §5.2 "Camera"): pure
// numbers, no three import, so a node test can check them. The scene calls `fitView` once per
// data change (and when the canvas is resized before anyone has orbited) and hands the result to
// the orbit as its HOME pose; double-click returns there.
//
// The fit is done in VIEW space for the orbit's current angles: the bodies' extents along the
// camera's right and up axes (each swollen by its drawn radius, each corrected for how far
// forward of the centre it sits) are what must fit the frustum with a 12 % margin. A bounding
// sphere is also exported, but a flat slab seen from a low elevation is far smaller on screen
// than its sphere, and fitting the sphere left the graph a thin band in a sea of grid.
//
// Two honesty notes. Only positions and radii enter the fit, so no plugin prose can move the
// camera. `bodyScale` is ONE factor applied to every body identically: a MEDIUM body ends up
// ≈ BODY_HEIGHT_FRACTION of the viewport height at the fit distance, and LOW / HIGH keep their
// fixed ratio to it, so radius still reads as the risk tier and nothing else.
import { RISK_RADIUS } from './constellationModel'
import { POLAR_MIN } from './orbit'
import type { BodySource } from '../core/types'

/** Room around the bodies: 12 % margin on the tighter axis. */
export const FIT_MARGIN = 1.12
/** A MEDIUM body's diameter as a fraction of the viewport height once the camera has fitted. */
export const BODY_HEIGHT_FRACTION = 0.045
/** The uniform body factor is clamped so a two-body graph is not a pair of marbles and a
 * four-hundred-body one is not a wall of planets. */
export const BODY_SCALE_MIN = 0.4
export const BODY_SCALE_MAX = 1.6
/** A single body still deserves some air around it (world units of half-extent). */
export const MIN_FIT_RADIUS = 1.5

/** Room the PLATES need around the bodies, in CSS px of the host (observatory v4 critique,
 * board-graph / sprint-graph): a plate hangs `PLATE_GAP` + one collapsed row under its body, so
 * without this the bottom body's label fell off the canvas and flipped above, and the drawing sat
 * high in its figure. Sideways a plate is centred on its body and about this much wider than it. */
export interface PlatePadPx {
  below: number
  above: number
  side: number
}
export const PLATE_PAD_PX: PlatePadPx = { below: 30, above: 6, side: 32 }
/** Round 2 (I9): the Board alternates plates above / below its bodies (`plates.ts`), so its room
 * is symmetric and the padded box centres the BODIES — the asymmetric pad centred the plates and
 * left ≈ 90 px of air above the bodies in a 280 px host. */
export const PLATE_PAD_SYMMETRIC: PlatePadPx = { below: 30, above: 30, side: 32 }
const NO_PAD: PlatePadPx = { below: 0, above: 0, side: 0 }

/** Round 2 (I9): the Board's bodies must fill at least this much of the host's height. */
export const MIN_HEIGHT_FRACTION = 0.6
/** How many polar steps `fitView` tries between the orbit's polar and `polarMin`. */
const POLAR_STEPS = 8

/** Round 2 (I9): the host's aspect as a HARD input to the fit. */
export interface FitAspect {
  /** The projected (padded) height the bodies must reach, as a fraction of the host. */
  minHeightFraction: number
  /** How far the fit may lower the camera's polar angle to reach it (the orbit's `POLAR_MIN`). */
  polarMin: number
}

/** The fit policy per body source: the Sprint keeps the design's asymmetric room (plates below)
 * and no aspect demand; the Board's plates alternate, so its room is symmetric and its bodies
 * must fill `MIN_HEIGHT_FRACTION` of the host. */
export const FIT_POLICY: Readonly<Record<BodySource, { pad: PlatePadPx; aspect?: FitAspect }>> = {
  sprint: { pad: PLATE_PAD_PX },
  board: { pad: PLATE_PAD_SYMMETRIC, aspect: { minHeightFraction: MIN_HEIGHT_FRACTION, polarMin: POLAR_MIN } },
}

export type Vec3 = [number, number, number]

export interface Sphere {
  center: Vec3
  radius: number
}

export interface Fit {
  /** Where the camera looks: the middle of the bodies' on-screen extents. */
  center: Vec3
  /** Camera distance from `center` at which everything fits with `FIT_MARGIN`. */
  distance: number
  /** Uniform factor every body radius is multiplied by (see the header comment). */
  bodyScale: number
  /** The polar angle the fit settled on: the orbit's own unless a `FitAspect` lowered it. */
  polar: number
  /** The bodies' projected height (silhouettes, no pad) as a fraction of the host; NaN when no
   * viewport was given. */
  heightFraction: number
}

function centroid(positions: ArrayLike<number>): Vec3 {
  const n = Math.floor(positions.length / 3)
  if (n === 0) return [0, 0, 0]
  let cx = 0, cy = 0, cz = 0
  for (let i = 0; i < n; i++) { cx += positions[i * 3]; cy += positions[i * 3 + 1]; cz += positions[i * 3 + 2] }
  return [cx / n, cy / n, cz / n]
}

/** Bounding sphere of `positions` (flat xyz) swollen by each body's drawn radius, centred on the
 * centroid so a drag moves the centre smoothly rather than snapping it. */
export function boundingSphere(positions: ArrayLike<number>, radii: ArrayLike<number>, scale = 1): Sphere {
  const n = Math.floor(positions.length / 3)
  const center = centroid(positions)
  let r = 0
  for (let i = 0; i < n; i++) {
    const dx = positions[i * 3] - center[0], dy = positions[i * 3 + 1] - center[1], dz = positions[i * 3 + 2] - center[2]
    r = Math.max(r, Math.sqrt(dx * dx + dy * dy + dz * dz) + (radii[i] ?? 0) * scale)
  }
  return { center, radius: Math.max(MIN_FIT_RADIUS, r) }
}

/** The distance at which a sphere of `radius` fits a camera of vertical `fovDeg` and `aspect`
 * (width / height), with `margin` of slack on the tighter axis. */
export function fitDistance(radius: number, fovDeg: number, aspect: number, margin = FIT_MARGIN): number {
  const vertical = (fovDeg * Math.PI) / 360
  const horizontal = Math.atan(Math.tan(vertical) * Math.max(aspect, 1e-3))
  return (radius * margin) / Math.sin(Math.min(vertical, horizontal))
}

/** World height of the viewport at `distance` for a camera of vertical `fovDeg`. */
export function viewHeightAt(distance: number, fovDeg: number): number {
  return 2 * distance * Math.tan((fovDeg * Math.PI) / 360)
}

/** The uniform body factor that makes a MEDIUM body `BODY_HEIGHT_FRACTION` of the viewport height
 * at `distance`, clamped. */
export function bodyScaleFor(distance: number, fovDeg: number): number {
  const wanted = BODY_HEIGHT_FRACTION * viewHeightAt(distance, fovDeg)
  return Math.min(BODY_SCALE_MAX, Math.max(BODY_SCALE_MIN, wanted / (2 * RISK_RADIUS.MEDIUM)))
}

/** The camera's right / up / toward-camera unit axes for an orbit at `polar` / `azimuth` (the
 * same spherical convention as `OrbitState.position()`), looking at its target. */
export function viewAxes(polar: number, azimuth: number): { right: Vec3; up: Vec3; toward: Vec3 } {
  const sinP = Math.sin(polar)
  const toward: Vec3 = [sinP * Math.sin(azimuth), Math.cos(polar), sinP * Math.cos(azimuth)]
  // right = normalize(cross(forward, worldUp)) with forward = −toward.
  const rx = toward[2], rz = -toward[0]
  const rl = Math.hypot(rx, rz) || 1
  const right: Vec3 = [rx / rl, 0, rz / rl]
  // up = cross(right, forward)
  const f: Vec3 = [-toward[0], -toward[1], -toward[2]]
  const up: Vec3 = [right[1] * f[2] - right[2] * f[1], right[2] * f[0] - right[0] * f[2], right[0] * f[1] - right[1] * f[0]]
  return { right, up, toward }
}

const dot = (a: Vec3, bx: number, by: number, bz: number) => a[0] * bx + a[1] * by + a[2] * bz

/** Fit the camera to the bodies as seen from the orbit's current angles. Iterative, because the
 * body scale depends on the distance, the extents depend on the body scale, and — since a body
 * nearer the camera projects further from the centre than its world offset says — the centre
 * is the midpoint of the PROJECTED extents, which depend on the distance again. Eight passes
 * settle it well inside a pixel. */
export function fitView(
  positions: ArrayLike<number>, radii: ArrayLike<number>, polar: number, azimuth: number, fovDeg: number, aspect: number,
  /** Host size in CSS px; with `pad`, the plate room is a FIXED number of px whatever the
   * distance, so it is converted to tangent units here and padded onto the projected extents. */
  viewportPx?: { width: number; height: number },
  pad: PlatePadPx = viewportPx ? PLATE_PAD_PX : NO_PAD,
  /** Round 2 (I9): after the width fit, if the bodies project to less than
   * `minHeightFraction` of the host, the polar is lowered toward `polarMin` (in `POLAR_STEPS`
   * steps) and the pose that first reaches it wins; if none does, the tallest one wins. A flat
   * slab seen from a lower angle shows its depth as height — but only positions and radii
   * decide, never a plugin word. */
  aspectPolicy?: FitAspect,
): Fit {
  const first = fitViewAt(positions, radii, polar, azimuth, fovDeg, aspect, viewportPx, pad)
  if (!aspectPolicy || !viewportPx || !(first.heightFraction < aspectPolicy.minHeightFraction)) return first
  let best = first
  const lo = Math.min(polar, aspectPolicy.polarMin)
  for (let step = 1; step <= POLAR_STEPS; step++) {
    const p = polar + (lo - polar) * (step / POLAR_STEPS)
    const fit = fitViewAt(positions, radii, p, azimuth, fovDeg, aspect, viewportPx, pad)
    if (fit.heightFraction > best.heightFraction) best = fit
    if (fit.heightFraction >= aspectPolicy.minHeightFraction) return fit
  }
  return best
}

/** The fit for ONE polar angle. */
export function fitViewAt(
  positions: ArrayLike<number>, radii: ArrayLike<number>, polar: number, azimuth: number, fovDeg: number, aspect: number,
  viewportPx?: { width: number; height: number },
  pad: PlatePadPx = viewportPx ? PLATE_PAD_PX : NO_PAD,
): Fit {
  const n = Math.floor(positions.length / 3)
  const { right, up, toward } = viewAxes(polar, azimuth)
  const tanV = Math.tan((fovDeg * Math.PI) / 360)
  const tanH = tanV * Math.max(aspect, 1e-3)
  const minDistance = (MIN_FIT_RADIUS * FIT_MARGIN) / tanV
  // Plate room as tangent units: `px / half-extent-px` is the NDC fraction, × tan is tangent.
  const halfH = viewportPx && viewportPx.height > 0 ? viewportPx.height / 2 : Infinity
  const halfW = viewportPx && viewportPx.width > 0 ? viewportPx.width / 2 : Infinity
  const padDown = (pad.below / halfH) * tanV, padUp = (pad.above / halfH) * tanV, padSide = (pad.side / halfW) * tanH
  // What is left of the half-frustum for the bodies once the margin and the plate room are taken.
  const limitDown = Math.max(tanV / FIT_MARGIN - padDown, tanV * 0.25)
  const limitUp = Math.max(tanV / FIT_MARGIN - padUp, tanV * 0.25)
  const limitSide = Math.max(tanH / FIT_MARGIN - padSide, tanH * 0.25)
  let center: Vec3 = centroid(positions)
  let distance = fitDistance(MIN_FIT_RADIUS, fovDeg, aspect)
  let scale = bodyScaleFor(distance, fovDeg)
  if (n === 0) return { center, distance: minDistance, bodyScale: scale, polar, heightFraction: NaN }
  const view = (i: number) => {
    const x = positions[i * 3] - center[0], y = positions[i * 3 + 1] - center[1], z = positions[i * 3 + 2] - center[2]
    return { r: dot(right, x, y, z), u: dot(up, x, y, z), f: dot(toward, x, y, z), rad: (radii[i] ?? 0) * scale }
  }
  for (let pass = 0; pass < 8; pass++) {
    scale = bodyScaleFor(distance, fovDeg)
    // Projected extents (tangent units) at this distance, padded by the plate room on each side;
    // the centre moves to the midpoint of the PADDED box, so bodies + plates sit centred.
    let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity
    for (let i = 0; i < n; i++) {
      const b = view(i)
      const seen = Math.max(distance - b.f, 1e-3)
      minR = Math.min(minR, (b.r - b.rad) / seen - padSide); maxR = Math.max(maxR, (b.r + b.rad) / seen + padSide)
      minU = Math.min(minU, (b.u - b.rad) / seen - padDown); maxU = Math.max(maxU, (b.u + b.rad) / seen + padUp)
    }
    const shiftR = ((minR + maxR) / 2) * distance, shiftU = ((minU + maxU) / 2) * distance
    center = [center[0] + right[0] * shiftR + up[0] * shiftU, center[1] + right[1] * shiftR + up[1] * shiftU, center[2] + right[2] * shiftR + up[2] * shiftU]
    // Each body must fit from where IT sits: a body `f` toward the camera is seen from `d − f`,
    // and its extent in each direction must stay inside what the margin and plate room leave.
    let d = 0
    for (let i = 0; i < n; i++) {
      const b = view(i)
      const down = Math.max(0, -b.u + b.rad), upE = Math.max(0, b.u + b.rad), side = Math.abs(b.r) + b.rad
      d = Math.max(d, down / limitDown + b.f, upE / limitUp + b.f, side / limitSide + b.f)
    }
    distance = Math.max(d, minDistance)
  }
  return { center, distance, bodyScale: scale, polar, heightFraction: projectedHeightFraction(positions, radii, center, distance, scale, polar, azimuth, fovDeg) }
}

/** The bodies' projected height — top of the highest silhouette to the bottom of the lowest —
 * as a fraction of the host's height, for a camera at `distance` from `center`. Pure, so the
 * Board pin (≥ `MIN_HEIGHT_FRACTION` at 720 × 280) is checked on numbers, not a screenshot. */
export function projectedHeightFraction(
  positions: ArrayLike<number>, radii: ArrayLike<number>, center: Vec3, distance: number, scale: number,
  polar: number, azimuth: number, fovDeg: number,
): number {
  const n = Math.floor(positions.length / 3)
  if (n === 0) return NaN
  const { up, toward } = viewAxes(polar, azimuth)
  const tanV = Math.tan((fovDeg * Math.PI) / 360)
  let top = -Infinity, bottom = Infinity
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3] - center[0], y = positions[i * 3 + 1] - center[1], z = positions[i * 3 + 2] - center[2]
    const seen = Math.max(distance - dot(toward, x, y, z), 1e-3)
    const u = dot(up, x, y, z), rad = (radii[i] ?? 0) * scale
    top = Math.max(top, (u + rad) / (seen * tanV))
    bottom = Math.min(bottom, (u - rad) / (seen * tanV))
  }
  // Tangent units: the half-view is 1, so the full view is 2.
  return (top - bottom) / 2
}

/** Fog density that fades the far side of the fitted view into the page rather than the bodies
 * themselves: the ≈ 30 % fade the §5.2 default (density .06 at distance 10) produced. */
export function fogDensityFor(distance: number): number {
  return 0.6 / Math.max(distance, 1)
}
