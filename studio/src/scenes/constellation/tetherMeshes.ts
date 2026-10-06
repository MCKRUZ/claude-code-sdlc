// Tethers, direction cones, the build-order path and the slab grid (studio-observatory.md §5.2
// "Geometry" → Tethers). `LineSegments2` + `LineSegmentsGeometry` from `three/examples/jsm/lines`
// (plain JS, no fetch, no worker) carry four segment sets: live edges at linewidth 1.25, the
// edges incident to the hovered body at 2.0, ghost edges dashed with no flow, and the ORDER path —
// a thin static-dashed accent polyline joining the slate in the plugin's `buildOrder` (a fact the
// plugin reported, drawn only when it reported one; the Board has none). Positions are rewritten in place while
// the segment count is unchanged (the settle tween moves every frame) and reallocated only when
// the edge set changes. Cones sit at 82 % of the way dependent → dependency, pointing at the
// dependency, so "depends on" is readable without the legend.
import {
  ConeGeometry, DynamicDrawUsage, GridHelper, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3,
} from 'three'
import type { Color, InterleavedBufferAttribute, LineBasicMaterial } from 'three'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { TetherMaterial } from '../core/materials/TetherMaterial'
import type { RenderModel } from './constellationModel'
import type { Palette } from './bodyMeshes'

export const CONE_AT = 0.82
/** Edges recede so bodies and the order path lead. */
export const LINE_WIDTH = 1.25
export const LINE_WIDTH_HOT = 2.0
export const LINE_WIDTH_ORDER = 1.0
export const ORDER_OPACITY = 0.45
/** Round 2 (I2): the slab grid is theme-aware the way the Spine's ground is — `line-2` in light,
 * `ink-4` in dark, each with enough alpha to be a depth cue and never a scale. */
export const GRID_OPACITY = { light: 0.28, dark: 0.48 } as const
export const GRID_TOKEN = { light: 'line-2', dark: 'ink-4' } as const
export const CONE_RADIUS = 0.06
export const CONE_LENGTH = 0.16

export interface TetherBuffers {
  edgeCount: number
  live: LineSegments2
  /** The hovered body's DEPENDENTS (edges into it): the accent set. */
  hot: LineSegments2
  /** The hovered body's DEPENDENCIES (edges out of it): full `ink-2`. */
  hotUp: LineSegments2
  ghost: LineSegments2
  order: LineSegments2
  liveMaterial: TetherMaterial
  hotMaterial: TetherMaterial
  hotUpMaterial: TetherMaterial
  ghostMaterial: TetherMaterial
  orderMaterial: TetherMaterial
  cones: InstancedMesh<ConeGeometry, MeshBasicMaterial>
  grid: GridHelper
}

const UP = new Vector3(0, 1, 0)
const scratchA = new Vector3()
const scratchB = new Vector3()
const scratchD = new Vector3()
const scratchQ = new Quaternion()
const scratchS = new Vector3()
const scratchM = new Matrix4()

function segments(material: TetherMaterial): LineSegments2 {
  const geometry = new LineSegmentsGeometry()
  geometry.setPositions([0, 0, 0, 0, 0, 0])
  const line = new LineSegments2(geometry, material)
  line.frustumCulled = false
  return line
}

export function createTetherBuffers(model: RenderModel, palette: Palette): TetherBuffers {
  const liveMaterial = new TetherMaterial(palette['ink-4'], { linewidth: LINE_WIDTH, opacity: 0.8 })
  const hotMaterial = new TetherMaterial(palette['accent-500'], { linewidth: LINE_WIDTH_HOT, opacity: 1 })
  const hotUpMaterial = new TetherMaterial(palette['ink-2'], { linewidth: LINE_WIDTH_HOT, opacity: 1 })
  const ghostMaterial = new TetherMaterial(palette['ink-4'], { linewidth: LINE_WIDTH, opacity: 0.45 })
  ghostMaterial.setGhost(true)
  // The order path: static 2:1 dash, no flow, under the tethers (renderOrder 1 < halos' 2).
  const orderMaterial = new TetherMaterial(palette['accent-500'], { linewidth: LINE_WIDTH_ORDER, opacity: ORDER_OPACITY })
  orderMaterial.setGhost(true, 2 / 3)
  const order = segments(orderMaterial)
  order.renderOrder = 1
  const edgeCount = model.edges.length
  // Cones follow the live tether's colour (`ink-4`), so an edge is one object, not two.
  const cones = new InstancedMesh(new ConeGeometry(CONE_RADIUS, CONE_LENGTH, 8), new MeshBasicMaterial({ color: palette['ink-4'] }), Math.max(edgeCount, 1))
  cones.count = edgeCount
  cones.instanceMatrix.setUsage(DynamicDrawUsage)
  cones.frustumCulled = false
  // The slab grid is a depth cue, not the subject: a hairline well below the bodies, faint in
  // light and a touch brighter in dark (`line-1` on `surface-0` is invisible there).
  const grid = new GridHelper(16, 16, palette[GRID_TOKEN.light], palette[GRID_TOKEN.light])
  grid.position.y = -2.0
  const gm = grid.material as LineBasicMaterial
  gm.transparent = true
  gm.opacity = GRID_OPACITY.light
  gm.depthWrite = false
  return {
    edgeCount, live: segments(liveMaterial), hot: segments(hotMaterial), hotUp: segments(hotUpMaterial), ghost: segments(ghostMaterial), order,
    liveMaterial, hotMaterial, hotUpMaterial, ghostMaterial, orderMaterial, cones, grid,
  }
}

export function syncTetherBuffers(prev: TetherBuffers | null, model: RenderModel, palette: Palette): TetherBuffers {
  if (prev && prev.edgeCount === model.edges.length) return prev
  if (prev) disposeTetherBuffers(prev)
  return createTetherBuffers(model, palette)
}

export function applyTetherPalette(buffers: TetherBuffers, palette: Palette, dark = false): void {
  buffers.liveMaterial.color.copy(palette['ink-4'])
  buffers.hotMaterial.color.copy(palette['accent-500'])
  buffers.hotUpMaterial.color.copy(palette['ink-2'])
  buffers.ghostMaterial.color.copy(palette['ink-4'])
  buffers.orderMaterial.color.copy(palette['accent-500'])
  buffers.cones.material.color.copy(palette['ink-4'])
  const c: Color = palette[GRID_TOKEN[dark ? 'dark' : 'light']]
  const gm = buffers.grid.material as LineBasicMaterial
  gm.color.copy(c)
  gm.opacity = dark ? GRID_OPACITY.dark : GRID_OPACITY.light
}

/** LineMaterial needs the drawing-buffer size for its screen-space width. */
export function setTetherResolution(buffers: TetherBuffers, width: number, height: number): void {
  buffers.liveMaterial.resolution.set(width, height)
  buffers.hotMaterial.resolution.set(width, height)
  buffers.hotUpMaterial.resolution.set(width, height)
  buffers.ghostMaterial.resolution.set(width, height)
  buffers.orderMaterial.resolution.set(width, height)
}

/** Write a segment list, reusing the interleaved buffer when its length already matches. An
 * empty list draws one degenerate segment so the object stays valid. */
function writeSegments(line: LineSegments2, data: number[]): void {
  const positions = data.length ? data : [0, 0, 0, 0, 0, 0]
  const geometry = line.geometry as LineSegmentsGeometry
  const start = geometry.attributes.instanceStart as InterleavedBufferAttribute | undefined
  if (start && start.data.array.length === positions.length) {
    ;(start.data.array as Float32Array).set(positions)
    start.data.needsUpdate = true
  } else {
    geometry.setPositions(positions)
  }
  line.visible = data.length > 0
}

/** Partition the edges by state and write positions + cones. Called on data change, on hover
 * change and on every settle frame — never allocates while the counts hold. Each segment stops
 * at the body's surface (radius × `scale`) so a tether never pierces the sphere it points at,
 * and the cone sits just outside the dependency's surface. */
export function writeTethers(buffers: TetherBuffers, model: RenderModel, positions: ArrayLike<number>, hovered: number | null, scale = 1): void {
  const live: number[] = []
  const hot: number[] = []
  const hotUp: number[] = []
  const ghost: number[] = []
  model.edges.forEach((e, i) => {
    scratchA.set(positions[e.from * 3], positions[e.from * 3 + 1], positions[e.from * 3 + 2])
    scratchB.set(positions[e.to * 3], positions[e.to * 3 + 1], positions[e.to * 3 + 2])
    scratchD.subVectors(scratchB, scratchA)
    const len = scratchD.length()
    if (len < 1e-6) scratchD.set(0, 1, 0)
    else scratchD.divideScalar(len)
    // Trim both ends to the surfaces; a very short edge keeps a sliver so it never inverts.
    const rFrom = model.bodies[e.from].radius * scale
    const rTo = model.bodies[e.to].radius * scale
    const coneLen = CONE_LENGTH * scale
    if (len > rFrom + rTo + coneLen + 0.05) {
      scratchA.addScaledVector(scratchD, rFrom)
      scratchB.addScaledVector(scratchD, -rTo)
    }
    // Direction split (I5): out of the hovered body = what it depends on; into it = its dependents.
    const bucket = e.ghost ? ghost : hovered === null ? live : e.from === hovered ? hotUp : e.to === hovered ? hot : live
    bucket.push(scratchA.x, scratchA.y, scratchA.z, scratchB.x, scratchB.y, scratchB.z)

    scratchQ.setFromUnitVectors(UP, scratchD)
    // The cone's tip touches the dependency's surface; its base points back at the dependent.
    scratchA.copy(scratchB).addScaledVector(scratchD, -coneLen / 2)
    scratchS.setScalar(scale)
    scratchM.compose(scratchA, scratchQ, scratchS)
    buffers.cones.setMatrixAt(i, scratchM)
  })
  writeSegments(buffers.live, live)
  writeSegments(buffers.hot, hot)
  writeSegments(buffers.hotUp, hotUp)
  writeSegments(buffers.ghost, ghost)
  writeSegments(buffers.order, orderPath(model, positions, scale))
  buffers.cones.instanceMatrix.needsUpdate = true
}

/** The build-order polyline: bodies with a `buildOrderIndex`, in `model.order` (which already
 * puts them first, in that order), each segment trimmed to the two body surfaces like a tether.
 * Empty when the plugin listed no order — nothing is invented for the Board. */
export function orderPath(model: RenderModel, positions: ArrayLike<number>, scale = 1): number[] {
  const out: number[] = []
  const indices = model.order.filter((i) => model.bodies[i]?.buildOrderIndex !== null && !model.bodies[i]?.ghost)
  for (let k = 1; k < indices.length; k++) {
    const a = indices[k - 1], b = indices[k]
    scratchA.set(positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2])
    scratchB.set(positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2])
    scratchD.subVectors(scratchB, scratchA)
    const len = scratchD.length()
    if (len < 1e-6) continue
    scratchD.divideScalar(len)
    const rA = model.bodies[a].radius * scale
    const rB = model.bodies[b].radius * scale
    if (len > rA + rB + 0.05) {
      scratchA.addScaledVector(scratchD, rA)
      scratchB.addScaledVector(scratchD, -rB)
    }
    out.push(scratchA.x, scratchA.y, scratchA.z, scratchB.x, scratchB.y, scratchB.z)
  }
  return out
}

/** The dash travels only while live (motion on, pointer inside). Ghosts never flow. */
export function setTetherFlow(buffers: TetherBuffers, flowing: boolean): void {
  buffers.liveMaterial.setFlowing(flowing)
  buffers.hotMaterial.setFlowing(flowing)
  buffers.hotUpMaterial.setFlowing(flowing)
}

export function advanceTetherFlow(buffers: TetherBuffers, deltaSeconds: number): void {
  // Slow: the flow is a direction hint, not a conveyor belt.
  buffers.liveMaterial.advanceFlow(deltaSeconds * 0.35)
  buffers.hotMaterial.advanceFlow(deltaSeconds * 0.35)
  buffers.hotUpMaterial.advanceFlow(deltaSeconds * 0.35)
}

export function disposeTetherBuffers(buffers: TetherBuffers): void {
  for (const line of [buffers.live, buffers.hot, buffers.hotUp, buffers.ghost, buffers.order]) line.geometry.dispose()
  buffers.liveMaterial.dispose()
  buffers.hotMaterial.dispose()
  buffers.hotUpMaterial.dispose()
  buffers.ghostMaterial.dispose()
  buffers.orderMaterial.dispose()
  buffers.cones.geometry.dispose()
  buffers.cones.material.dispose()
  buffers.cones.dispose()
  buffers.grid.geometry.dispose()
  ;(buffers.grid.material as LineBasicMaterial).dispose()
}
