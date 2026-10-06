/** The constellation's camera fit (studio-observatory.md §5.2 "Camera") as promises: the fitted
 * sphere comes from positions and radii only; the distance frames it with the 12 % margin on the
 * tighter axis; a MEDIUM body ends up about 5 % of the viewport height; and the ONE body factor is
 * uniform, so LOW / MEDIUM / HIGH keep their ratio — radius still reads as risk and nothing else. */

import { describe, expect, it } from 'vitest'
import { RISK_RADIUS } from '../../src/scenes/constellation/constellationModel'
import {
  BODY_HEIGHT_FRACTION, BODY_SCALE_MAX, BODY_SCALE_MIN, FIT_MARGIN, MIN_FIT_RADIUS, PLATE_PAD_PX,
  bodyScaleFor, boundingSphere, fitDistance, fitView, fogDensityFor, viewAxes, viewHeightAt,
} from '../../src/scenes/constellation/fit'
import { OrbitState, RADIUS_MAX, RADIUS_MIN } from '../../src/scenes/constellation/orbit'

const FOV = 40

describe('boundingSphere', () => {
  it('is the centroid plus the farthest body surface, never smaller than the floor', () => {
    const positions = [-3, 0, 0, 3, 0, 0]
    const s = boundingSphere(positions, [0.5, 0.5])
    expect(s.center).toEqual([0, 0, 0])
    expect(s.radius).toBeCloseTo(3.5)
    expect(boundingSphere([0, 0, 0], [0.3]).radius).toBe(MIN_FIT_RADIUS)
    expect(boundingSphere([], []).radius).toBe(MIN_FIT_RADIUS)
  })

  it('swells with the body scale', () => {
    const positions = [-3, 0, 0, 3, 0, 0]
    expect(boundingSphere(positions, [0.5, 0.5], 2).radius).toBeCloseTo(4)
  })
})

describe('fitDistance', () => {
  it('frames the sphere on the tighter axis with the margin', () => {
    // Wide canvas: the vertical half-angle is the tight one.
    const d = fitDistance(3, FOV, 2)
    expect(d).toBeCloseTo((3 * FIT_MARGIN) / Math.sin((FOV * Math.PI) / 360))
    // Tall canvas: the horizontal half-angle is tighter, so the camera backs off further.
    expect(fitDistance(3, FOV, 0.5)).toBeGreaterThan(d)
  })
})

describe('bodyScaleFor', () => {
  it('makes a MEDIUM body the target fraction of the viewport height, within the clamps', () => {
    const d = 12
    const scale = bodyScaleFor(d, FOV)
    const diameterPx = (2 * RISK_RADIUS.MEDIUM * scale) / viewHeightAt(d, FOV)
    if (scale > BODY_SCALE_MIN && scale < BODY_SCALE_MAX) expect(diameterPx).toBeCloseTo(BODY_HEIGHT_FRACTION, 3)
    expect(bodyScaleFor(1, FOV)).toBe(BODY_SCALE_MIN)
    expect(bodyScaleFor(1000, FOV)).toBe(BODY_SCALE_MAX)
  })
})

describe('fitView', () => {
  const POLAR = 1.26
  const AZIMUTH = 0

  it('view axes are orthonormal and the default orbit looks down the −z axis from above', () => {
    const { right, up, toward } = viewAxes(POLAR, AZIMUTH)
    const len = (v: number[]) => Math.hypot(...v)
    for (const v of [right, up, toward]) expect(len(v)).toBeCloseTo(1)
    expect(right[0] * up[0] + right[1] * up[1] + right[2] * up[2]).toBeCloseTo(0)
    expect(right.map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([1, 0, 0])
    expect(toward[2]).toBeGreaterThan(0)
    expect(up[1]).toBeGreaterThan(0)
  })

  it('frames six bodies in a 724 × 360 canvas: every body inside the frustum, with the margin', () => {
    const positions = [-6, 0.1, 1.6, -3, 0.1, -2.4, -2.6, 0.1, 5.3, 2.5, -0.7, 1.1, 2.7, 0.05, -3.4, 6.9, 0.4, -2.3]
    const radii = [RISK_RADIUS.HIGH, RISK_RADIUS.MEDIUM, RISK_RADIUS.LOW, RISK_RADIUS.MEDIUM, RISK_RADIUS.LOW, RISK_RADIUS.HIGH]
    const aspect = 724 / 360
    const fit = fitView(positions, radii, POLAR, AZIMUTH, FOV, aspect)
    const { right, up, toward } = viewAxes(POLAR, AZIMUTH)
    const tanV = Math.tan((FOV * Math.PI) / 360)
    const tanH = tanV * aspect
    let tightest = Infinity
    for (let i = 0; i < 6; i++) {
      const x = positions[i * 3] - fit.center[0], y = positions[i * 3 + 1] - fit.center[1], z = positions[i * 3 + 2] - fit.center[2]
      const r = right[0] * x + right[1] * y + right[2] * z
      const u = up[0] * x + up[1] * y + up[2] * z
      const f = toward[0] * x + toward[1] * y + toward[2] * z
      const rad = radii[i] * fit.bodyScale
      const seenFrom = fit.distance - f
      // Projected half-extents as fractions of the half-view at that body's depth: ≤ 1 / margin.
      const fracU = (Math.abs(u) + rad) / (seenFrom * tanV)
      const fracR = (Math.abs(r) + rad) / (seenFrom * tanH)
      expect(fracU).toBeLessThanOrEqual(1 / FIT_MARGIN + 1e-6)
      expect(fracR).toBeLessThanOrEqual(1 / FIT_MARGIN + 1e-6)
      tightest = Math.min(tightest, 1 / FIT_MARGIN - Math.max(fracU, fracR))
    }
    // Something touches the margin: the fit is tight, not merely safe.
    expect(tightest).toBeCloseTo(0, 3)
    // Uniform factor: HIGH / LOW is unchanged.
    expect((RISK_RADIUS.HIGH * fit.bodyScale) / (RISK_RADIUS.LOW * fit.bodyScale)).toBeCloseTo(RISK_RADIUS.HIGH / RISK_RADIUS.LOW)
    expect(fit.bodyScale).toBeGreaterThanOrEqual(BODY_SCALE_MIN)
    expect(fit.bodyScale).toBeLessThanOrEqual(BODY_SCALE_MAX)
    expect(fit.distance).toBeGreaterThanOrEqual(RADIUS_MIN)
    expect(fit.distance).toBeLessThanOrEqual(RADIUS_MAX)
  })

  it('centres the PROJECTED picture: a near body on one side does not push the graph off-centre', () => {
    // Two bodies on the x axis; the right one much nearer the camera (large +z).
    const positions = [-3, 0, -3, 3, 0, 3]
    const radii = [RISK_RADIUS.MEDIUM, RISK_RADIUS.MEDIUM]
    const fit = fitView(positions, radii, POLAR, AZIMUTH, FOV, 2)
    const { right, up, toward } = viewAxes(POLAR, AZIMUTH)
    const tanV = Math.tan((FOV * Math.PI) / 360), tanH = tanV * 2
    const proj = positions.length / 3
    const xs: number[] = [], ys: number[] = []
    for (let i = 0; i < proj; i++) {
      const x = positions[i * 3] - fit.center[0], y = positions[i * 3 + 1] - fit.center[1], z = positions[i * 3 + 2] - fit.center[2]
      const seen = fit.distance - (toward[0] * x + toward[1] * y + toward[2] * z)
      const rad = radii[i] * fit.bodyScale
      const r = right[0] * x + right[1] * y + right[2] * z, u = up[0] * x + up[1] * y + up[2] * z
      xs.push((r - rad) / (seen * tanH), (r + rad) / (seen * tanH))
      ys.push((u - rad) / (seen * tanV), (u + rad) / (seen * tanV))
    }
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 2)
    expect(Math.min(...ys) + Math.max(...ys)).toBeCloseTo(0, 2)
  })

  it('a single body gets the minimum air, and an empty set does not throw', () => {
    const one = fitView([0, 0, 0], [RISK_RADIUS.MEDIUM], POLAR, AZIMUTH, FOV, 2)
    expect(one.distance).toBeCloseTo((MIN_FIT_RADIUS * FIT_MARGIN) / Math.tan((FOV * Math.PI) / 360))
    expect(() => fitView([], [], POLAR, AZIMUTH, FOV, 2)).not.toThrow()
  })

  it('fog density tracks the fit distance so the bodies never dissolve', () => {
    expect(fogDensityFor(10)).toBeCloseTo(0.06)
    expect(fogDensityFor(40)).toBeLessThan(fogDensityFor(10))
  })
})

describe('orbit home', () => {
  it('applies the home on the first fit, keeps a touched orbit, and goHome returns to it', () => {
    const o = new OrbitState()
    o.setHome([1, 2, 3], 9, true)
    expect(o.target).toEqual([1, 2, 3])
    expect(o.radius).toBe(9)
    expect(o.touched).toBe(false)
    o.zoom(1.5)
    while (o.update()) { /* settle */ }
    expect(o.touched).toBe(true)
    // A resize refit while touched updates the home only.
    o.setHome([0, 0, 0], 7, !o.touched)
    expect(o.radius).toBeCloseTo(13.5)
    o.goHome()
    while (o.update()) { /* settle */ }
    expect(o.radius).toBeCloseTo(7, 3)
    expect(o.target.map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 0, 0])
    expect(o.touched).toBe(false)
  })
})

/** Plate room (observatory v4 critique, board-graph / sprint-graph): the fit frames bodies PLUS
 * the fixed-px room their plates take under and beside them, so the drawing — not the bodies
 * alone — is centred in its figure, and the bottom body's label no longer falls off the canvas. */
describe('fitView with plate room', () => {
  const POLAR = 1.26, AZIMUTH = 0
  const positions = [-6, 0.1, 1.6, -3, 0.1, -2.4, -2.6, 0.1, 5.3, 2.5, -0.7, 1.1, 2.7, 0.05, -3.4, 6.9, 0.4, -2.3]
  const radii = [RISK_RADIUS.HIGH, RISK_RADIUS.MEDIUM, RISK_RADIUS.LOW, RISK_RADIUS.MEDIUM, RISK_RADIUS.LOW, RISK_RADIUS.HIGH]
  const viewport = { width: 724, height: 360 }
  const aspect = viewport.width / viewport.height

  /** Projected extents in CSS px from the host's top-left, body silhouettes only. */
  function pxExtents(fit: ReturnType<typeof fitView>) {
    const { right, up, toward } = viewAxes(POLAR, AZIMUTH)
    const tanV = Math.tan((FOV * Math.PI) / 360), tanH = tanV * aspect
    let top = Infinity, bottom = -Infinity, left = Infinity, rightPx = -Infinity
    for (let i = 0; i < positions.length / 3; i++) {
      const x = positions[i * 3] - fit.center[0], y = positions[i * 3 + 1] - fit.center[1], z = positions[i * 3 + 2] - fit.center[2]
      const seen = fit.distance - (toward[0] * x + toward[1] * y + toward[2] * z)
      const rad = radii[i] * fit.bodyScale
      const r = right[0] * x + right[1] * y + right[2] * z, u = up[0] * x + up[1] * y + up[2] * z
      const toPxY = (v: number) => (0.5 - v / (seen * tanV) / 2) * viewport.height
      const toPxX = (v: number) => (0.5 + v / (seen * tanH) / 2) * viewport.width
      top = Math.min(top, toPxY(u + rad)); bottom = Math.max(bottom, toPxY(u - rad))
      left = Math.min(left, toPxX(r - rad)); rightPx = Math.max(rightPx, toPxX(r + rad))
    }
    return { top, bottom, left, right: rightPx }
  }

  it('zero room is byte-for-byte the plain fit', () => {
    const plain = fitView(positions, radii, POLAR, AZIMUTH, FOV, aspect)
    const padded = fitView(positions, radii, POLAR, AZIMUTH, FOV, aspect, viewport, { below: 0, above: 0, side: 0 })
    expect(padded).toEqual(plain)
  })

  it('centres bodies + plate room: the bodies sit higher by exactly the room their plates take below them', () => {
    const fit = fitView(positions, radii, POLAR, AZIMUTH, FOV, aspect, viewport)
    const e = pxExtents(fit)
    const above = e.top, below = viewport.height - e.bottom
    // The padded box is what is centred, so the silhouettes sit (below − above) px higher than
    // the frame's centre would put them — within the fit's own convergence (≈ 1 px over 8 passes).
    expect(Math.abs((below - above) - (PLATE_PAD_PX.below - PLATE_PAD_PX.above))).toBeLessThan(2)
    // And the bottom body's plate has its room: at least `below` px under the lowest silhouette.
    expect(below).toBeGreaterThanOrEqual(PLATE_PAD_PX.below - 0.5)
    // Sideways the room is symmetric, so the picture stays centred horizontally.
    expect(e.left).toBeCloseTo(viewport.width - e.right, 0)
    expect(e.left).toBeGreaterThanOrEqual(PLATE_PAD_PX.side - 0.5)
  })

  it('the room is fixed px, so a taller host gives the bodies proportionally more of the frame', () => {
    const short = fitView(positions, radii, POLAR, AZIMUTH, FOV, aspect, viewport)
    const tall = fitView(positions, radii, POLAR, AZIMUTH, FOV, aspect, { width: 1448, height: 720 })
    // Same aspect, twice the pixels: the same 30 px of room is half the fraction, so the camera
    // need not back off as far relative to the frame.
    expect(tall.distance).toBeLessThan(short.distance)
  })
})
