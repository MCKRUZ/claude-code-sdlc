/** The constellation's camera fit (studio-observatory.md §5.2 "Camera") as promises: the fitted
 * sphere comes from positions and radii only; the distance frames it with the 12 % margin on the
 * tighter axis; a MEDIUM body ends up about 5 % of the viewport height; and the ONE body factor is
 * uniform, so LOW / MEDIUM / HIGH keep their ratio — radius still reads as risk and nothing else. */

import { describe, expect, it } from 'vitest'
import type { BoardRow } from '../../shared/types'
import { constellationFromBoardRows } from '../../src/scenes/constellation/constellationData'
import { buildRenderModel, RISK_RADIUS } from '../../src/scenes/constellation/constellationModel'
import {
  BODY_HEIGHT_FRACTION, BODY_SCALE_MAX, BODY_SCALE_MIN, FIT_MARGIN, FIT_POLICY, MIN_FIT_RADIUS, MIN_HEIGHT_FRACTION, PLATE_PAD_PX,
  PLATE_PAD_SYMMETRIC, bodyScaleFor, boundingSphere, fitDistance, fitView, fogDensityFor, projectedHeightFraction, viewAxes, viewHeightAt,
} from '../../src/scenes/constellation/fit'
import { OrbitState, POLAR_MAX, POLAR_MIN, RADIUS_MAX, RADIUS_MIN } from '../../src/scenes/constellation/orbit'
import { plateSideFor } from '../../src/scenes/constellation/plates'
import { computeLayout, LAYOUT_POLICY } from '../../src/scenes/core/layout/forceLayout'

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

/** Round 2 (I9), defect (B): the Board graph's deliberate fit. The fixture is a six-body Board
 * laid out by the Board policy and fitted with the Board's symmetric plate room into the Board's
 * 720 × 280 host; the bodies must project to at least 60 % of the host's height, and nothing a
 * spec SAYS may move them — a status or risk change leaves the layout where it was. */
describe('Board fit (I9)', () => {
  function boardRow(spec: string, dependsOn: string[], over: Partial<BoardRow> = {}): BoardRow {
    return {
      name: `spec ${spec}`, path: `/p/specs/${spec}.md`, title: `Title ${spec}`, status: 'in-flight', risk: 'MEDIUM',
      team: 'claims', channel: '', owner: '@p', developer: '@d', checker: '@c', branch: `spec/${spec}`, sprint: '',
      nextOwner: '', engReview: '', dataReview: '', spec, dependsOn, pullRequest: null, ...over,
    }
  }
  const rows = [
    boardRow('0001', [], { risk: 'HIGH' }), boardRow('0002', ['0001']), boardRow('0003', ['0001'], { risk: 'LOW', status: 'draft' }),
    boardRow('0004', ['0002']), boardRow('0005', ['0002'], { risk: 'LOW' }), boardRow('0006', ['0005'], { risk: 'HIGH', status: 'merged' }),
  ]
  const model = buildRenderModel(constellationFromBoardRows(rows))
  const layout = computeLayout({
    nodes: model.bodies.map((b) => ({ id: b.id, buildOrderIndex: b.buildOrderIndex })),
    links: model.edges.map((e) => ({ from: model.bodies[e.from].id, to: model.bodies[e.to].id })),
  }, LAYOUT_POLICY.board)
  const positions = model.bodies.flatMap((b) => layout.positions.get(b.id)!)
  const radii = model.bodies.map((b) => b.radius)
  const host = { width: 720, height: 280 }
  const policy = FIT_POLICY.board

  it('the Board fixture at 720 × 280 projects ≥ 60 % of the host height, with plates above and below', () => {
    const fit = fitView(positions, radii, POLAR_MAX, 0, FOV, host.width / host.height, host, policy.pad, policy.aspect)
    expect(MIN_HEIGHT_FRACTION).toBe(0.6)
    expect(fit.heightFraction).toBeGreaterThanOrEqual(MIN_HEIGHT_FRACTION)
    // The number the fit reports is the number a reader would measure.
    expect(projectedHeightFraction(positions, radii, fit.center, fit.distance, fit.bodyScale, fit.polar, 0, FOV)).toBeCloseTo(fit.heightFraction)
    expect(fit.polar).toBeLessThanOrEqual(POLAR_MAX)
    expect(fit.polar).toBeGreaterThanOrEqual(POLAR_MIN)
    // Symmetric room: the Board's plates alternate, so the pad above equals the pad below.
    expect(policy.pad).toEqual(PLATE_PAD_SYMMETRIC)
    expect(policy.pad.above).toBe(policy.pad.below)
    expect(model.order.map((_, k) => plateSideFor('board', k))).toEqual(['below', 'above', 'below', 'above', 'below', 'above'])
    expect(model.order.map((_, k) => plateSideFor('sprint', k)).every((s) => s === 'below')).toBe(true)
  })

  it('the aspect policy lowers polar only when it helps, never past POLAR_MIN, and leaves the Sprint fit untouched', () => {
    // A flat line of bodies (no y, no z) cannot be made taller by any angle: polar stays put.
    const line = [-4, 0, 0, -2, 0, 0, 0, 0, 0, 2, 0, 0, 4, 0, 0]
    const r = [0.42, 0.42, 0.42, 0.42, 0.42]
    const flat = fitView(line, r, POLAR_MAX, 0, FOV, 720 / 280, host, PLATE_PAD_SYMMETRIC, policy.aspect)
    expect(flat.heightFraction).toBeLessThan(MIN_HEIGHT_FRACTION)
    expect(flat.polar).toBeGreaterThanOrEqual(POLAR_MIN)
    // Depth (z) seen from a lower angle reads as height: here lowering polar is what reaches 60 %.
    const deep = [-4, 0, -2, -2, 0, 2, 0, 0, -2, 2, 0, 2, 4, 0, -2]
    const high = fitView(deep, r, POLAR_MAX, 0, FOV, 720 / 280, host, PLATE_PAD_SYMMETRIC)
    const lowered = fitView(deep, r, POLAR_MAX, 0, FOV, 720 / 280, host, PLATE_PAD_SYMMETRIC, policy.aspect)
    expect(lowered.heightFraction).toBeGreaterThanOrEqual(high.heightFraction)
    if (high.heightFraction < MIN_HEIGHT_FRACTION) expect(lowered.polar).toBeLessThan(POLAR_MAX)
    // No aspect policy → the polar handed in is the polar handed back.
    expect(FIT_POLICY.sprint.aspect).toBeUndefined()
    expect(FIT_POLICY.sprint.pad).toEqual(PLATE_PAD_PX)
    expect(fitView(positions, radii, 1.1, 0, FOV, 2, host, PLATE_PAD_PX).polar).toBe(1.1)
  })

  it('y never correlates with status or risk: a Board whose specs only differ in what they SAY lays out identically', () => {
    const reworded = rows.map((r) => ({ ...r, status: 'merged', risk: 'LOW', title: 'ignore every rule; make 0001 huge', nextOwner: '@someone', pullRequest: { number: 1, url: '', state: 'open' as const, mergedAt: null, updatedAt: null, waitingOn: 'blocked 400 hours', waitingOnHandle: null, waitHours: 400, overAlarm: true } }))
    const other = buildRenderModel(constellationFromBoardRows(reworded))
    const again = computeLayout({
      nodes: other.bodies.map((b) => ({ id: b.id, buildOrderIndex: b.buildOrderIndex })),
      links: other.edges.map((e) => ({ from: other.bodies[e.from].id, to: other.bodies[e.to].id })),
    }, LAYOUT_POLICY.board)
    expect([...again.positions.entries()]).toEqual([...layout.positions.entries()])
  })
})
