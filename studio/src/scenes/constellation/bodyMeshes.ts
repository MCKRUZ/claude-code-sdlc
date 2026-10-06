// The instanced meshes for bodies, ghosts, warn rings and halos (studio-observatory.md §5.2
// "Geometry"). Imperative three objects owned by the scene through refs: buffers are allocated
// once per body count and REUSED while N is unchanged (a data change writes into the same
// attributes), and `disposeBodyBuffers` frees every geometry and material on unmount.
//
// Everything written here comes from `RenderModel`: radius (risk), colour token (status), the
// warn ring flag, the nextUp halo. Nothing reads a plugin row directly.
import {
  AdditiveBlending, Color, DynamicDrawUsage, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial,
  PlaneGeometry, Quaternion, TorusGeometry, Vector3,
} from 'three'
import type { BufferGeometry, Material } from 'three'
import type { ColorToken, ThemeAttr } from '../../theme/tokens'
import { getGlowTexture } from '../core/glowTexture'
import { BodyMaterial, RIM_TOKEN } from '../core/materials/BodyMaterial'
import { HALO_HOVER, HALO_NEXT_UP, HALO_SCALE, HaloMaterial } from './haloMaterial'
import type { RenderModel } from './constellationModel'

/** Every colour token the constellation reads from the theme. Stable, so `useThemeColors` memoises. */
export const CONSTELLATION_TOKENS = [
  'spec-ready', 'spec-inflight', 'spec-merged', 'spec-deferred', 'ink-2', 'ink-3', 'ink-4', 'status-warn-fill', 'accent-300', 'accent-500',
  'line-1', 'line-2', 'surface-0',
] as const satisfies readonly ColorToken[]

export type Palette = Record<(typeof CONSTELLATION_TOKENS)[number], Color>

/** Non-neighbours lerp to `ink-4` at 35 %; this is the lerp target as a weight on the base colour. */
export const DIM_WEIGHT = 0.35

/** Round 2 (I5): the hovered / focused body's selection ring — a thin `accent-500` torus OUTSIDE
 * the amber warn ring (1.3, tube .08), so the two coexist: amber is a fact, accent is attention. */
export const SELECTION_RADIUS = 1.5
export const SELECTION_TUBE = 0.045

/** Round 2 (I2): the contact pool under every body — the shared glow texture flattened 1 : 0.35,
 * `ink-3` at 12 %, additive, its size bound to the body's radius and nothing else. */
export const POOL_FLATTEN = 0.35
export const POOL_OPACITY = 0.12
/** Pool width as a multiple of the body's drawn radius. */
export const POOL_SCALE = 3.2
/** The pool sits this far under the body's lowest point (world units × the body radius). */
export const POOL_DROP = 0.35

export interface BodyBuffers {
  count: number
  ghostCount: number
  ringCount: number
  bodies: InstancedMesh<IcosahedronGeometry, BodyMaterial>
  ghosts: InstancedMesh<IcosahedronGeometry, MeshBasicMaterial>
  rings: InstancedMesh<TorusGeometry, MeshBasicMaterial>
  /** One instance: the hovered body, or `count` 0. */
  selection: InstancedMesh<TorusGeometry, MeshBasicMaterial>
  /** One per REAL body (ghosts cast none). */
  pools: InstancedMesh<PlaneGeometry, MeshBasicMaterial>
  halos: InstancedMesh<PlaneGeometry, HaloMaterial>
  glow: InstancedBufferAttribute
  haloScale: InstancedBufferAttribute
}

const scratchM = new Matrix4()
const scratchP = new Vector3()
const scratchS = new Vector3()
const scratchC = new Color()
const IDENTITY_Q = new Quaternion()
/** The torus lies in XY; tilt it to the body's equator (XZ). */
const EQUATOR_Q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2)
/** The pool plane lies in XY; lay it flat (XZ) under the body. */
const FLAT_Q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)

function counts(model: RenderModel): { real: number; ghost: number; ring: number } {
  let ring = 0
  for (const b of model.bodies) if (b.warnRing) ring += 1
  return { real: model.realCount, ghost: model.ghostCount, ring }
}

function makeInstanced<G extends BufferGeometry, M extends Material>(
  geometry: G, material: M, n: number,
): InstancedMesh<G, M> {
  const mesh = new InstancedMesh<G, M>(geometry, material, Math.max(n, 1))
  mesh.count = n
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.frustumCulled = false
  return mesh
}

export function createBodyBuffers(model: RenderModel, palette: Palette, theme: ThemeAttr = 'light'): BodyBuffers {
  const { real, ghost, ring } = counts(model)
  const ico = new IcosahedronGeometry(1, 2)
  // Matte standard material plus the v2 rim and one soft dot (`BodyMaterial`); the additive halo
  // still carries emphasis.
  const bodies = makeInstanced(ico, new BodyMaterial(palette[RIM_TOKEN[theme]], theme), real)
  bodies.instanceColor = new InstancedBufferAttribute(new Float32Array(Math.max(real, 1) * 3), 3)
  bodies.instanceColor.setUsage(DynamicDrawUsage)
  const ghosts = makeInstanced(
    ico, new MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.5, color: palette['ink-4'] }), ghost,
  )
  const rings = makeInstanced(
    // The ring is scaled with its body, so the tube is sized to stay a thin, legible line at a
    // MEDIUM body's fitted size; the earlier .03 vanished below a pixel once the camera framed
    // the whole graph. Amber (`status-warn-fill`): a warn-class fact, never red.
    new TorusGeometry(1.3, 0.08, 8, 48), new MeshBasicMaterial({ color: palette['status-warn-fill'] }), ring,
  )
  const selection = makeInstanced(
    new TorusGeometry(SELECTION_RADIUS, SELECTION_TUBE, 8, 64), new MeshBasicMaterial({ color: palette['accent-500'] }), 0,
  )
  // Pools: a flat additive sprite of the shared glow texture under each real body. `depthWrite`
  // off so the body above draws over it; `fog` off so a far pool does not tint.
  const pools = makeInstanced(
    new PlaneGeometry(1, POOL_FLATTEN),
    new MeshBasicMaterial({
      map: getGlowTexture(), color: palette['ink-3'], transparent: true, opacity: POOL_OPACITY, depthWrite: false,
      blending: AdditiveBlending, fog: false,
    }),
    real,
  )
  pools.renderOrder = 0
  const total = real + ghost
  const plane = new PlaneGeometry(1, 1)
  const glow = new InstancedBufferAttribute(new Float32Array(Math.max(total, 1)), 1)
  const haloScale = new InstancedBufferAttribute(new Float32Array(Math.max(total, 1)), 1)
  glow.setUsage(DynamicDrawUsage)
  plane.setAttribute('aGlow', glow)
  plane.setAttribute('aScale', haloScale)
  const halos = makeInstanced(plane, new HaloMaterial(getGlowTexture(), palette['accent-500']), total)
  halos.renderOrder = 2
  return { count: real, ghostCount: ghost, ringCount: ring, bodies, ghosts, rings, selection, pools, halos, glow, haloScale }
}

/** Reuse `prev` when every count matches; otherwise dispose it and allocate afresh. */
export function syncBodyBuffers(prev: BodyBuffers | null, model: RenderModel, palette: Palette, theme: ThemeAttr = 'light'): BodyBuffers {
  const { real, ghost, ring } = counts(model)
  if (prev && prev.count === real && prev.ghostCount === ghost && prev.ringCount === ring) return prev
  if (prev) disposeBodyBuffers(prev)
  return createBodyBuffers(model, palette, theme)
}

/** Theme flip: re-colour the materials that carry a token directly. */
export function applyPalette(buffers: BodyBuffers, palette: Palette, theme: ThemeAttr = 'light'): void {
  buffers.ghosts.material.color.copy(palette['ink-4'])
  buffers.rings.material.color.copy(palette['status-warn-fill'])
  buffers.selection.material.color.copy(palette['accent-500'])
  buffers.pools.material.color.copy(palette['ink-3'])
  buffers.halos.material.setColor(palette['accent-500'])
  buffers.bodies.material.setRim(palette[RIM_TOKEN[theme]], theme)
}

/** Positions are flat `[x0, y0, z0, x1, …]` indexed by `RenderBody.index`. `scale` is the ONE
 * uniform factor the camera fit chose (`fit.ts`): every body gets the same multiplier, so the
 * drawn size still reads as the risk tier and nothing else. `hovered` places the one selection
 * ring (round 2, I5) — its `count` is 1 only while something is hovered or focused. */
export function writeBodyTransforms(
  buffers: BodyBuffers, model: RenderModel, positions: ArrayLike<number>, scale = 1, hovered: number | null = null,
): void {
  let ghostI = 0
  let ringI = 0
  buffers.selection.count = 0
  for (const b of model.bodies) {
    scratchP.set(positions[b.index * 3], positions[b.index * 3 + 1], positions[b.index * 3 + 2])
    scratchS.setScalar(b.radius * scale)
    scratchM.compose(scratchP, IDENTITY_Q, scratchS)
    if (b.ghost) buffers.ghosts.setMatrixAt(ghostI++, scratchM)
    else buffers.bodies.setMatrixAt(b.index, scratchM)
    if (b.warnRing) {
      scratchM.compose(scratchP, EQUATOR_Q, scratchS)
      buffers.rings.setMatrixAt(ringI++, scratchM)
    }
    if (hovered === b.index) {
      scratchM.compose(scratchP, EQUATOR_Q, scratchS)
      buffers.selection.setMatrixAt(0, scratchM)
      buffers.selection.count = 1
    }
    if (!b.ghost) {
      // The pool: flat, under the body's lowest point, sized by the drawn radius ONLY.
      const r = b.radius * scale
      scratchP.y -= r * (1 + POOL_DROP)
      scratchS.setScalar(r * POOL_SCALE)
      scratchM.compose(scratchP, FLAT_Q, scratchS)
      buffers.pools.setMatrixAt(b.index, scratchM)
      scratchP.y += r * (1 + POOL_DROP)
    }
    scratchS.setScalar(1)
    scratchM.compose(scratchP, IDENTITY_Q, scratchS)
    buffers.halos.setMatrixAt(b.index, scratchM)
    buffers.haloScale.setX(b.index, b.radius * scale * HALO_SCALE)
  }
  buffers.bodies.instanceMatrix.needsUpdate = true
  buffers.ghosts.instanceMatrix.needsUpdate = true
  buffers.rings.instanceMatrix.needsUpdate = true
  buffers.selection.instanceMatrix.needsUpdate = true
  buffers.pools.instanceMatrix.needsUpdate = true
  buffers.halos.instanceMatrix.needsUpdate = true
  buffers.haloScale.needsUpdate = true
  buffers.bodies.computeBoundingSphere()
}

/** The pool's drawn width for a body, in world units: `radius × scale × POOL_SCALE` — a function
 * of the risk-tier radius and the one uniform fit factor, nothing else. */
export function poolWidth(radius: number, scale = 1): number {
  return radius * scale * POOL_SCALE
}

/** `weights[i]` is 1 lit … `DIM_WEIGHT` dimmed (the hover choreography tweens it). The body's
 * colour is its status token lerped toward `ink-4` by `1 − weight`. The hovered body KEEPS its
 * status colour — colour has one meaning and never changes under the pointer; emphasis is the
 * halo (`HALO_HOVER`) plus its hot tethers. `hovered` stays in the signature so the caller's
 * dirty-flag path is unchanged. */
export function writeBodyColors(
  buffers: BodyBuffers, model: RenderModel, palette: Palette, weights: ArrayLike<number>, _hovered: number | null,
): void {
  const attr = buffers.bodies.instanceColor
  if (!attr) return
  for (const b of model.bodies) {
    if (b.ghost) continue
    const base = palette[b.colorToken as keyof Palette] ?? palette['ink-3']
    const w = Math.min(1, Math.max(0, weights[b.index] ?? 1))
    scratchC.copy(palette['ink-4']).lerp(base, w)
    attr.setXYZ(b.index, scratchC.r, scratchC.g, scratchC.b)
  }
  attr.needsUpdate = true
}

/** nextUp 0.7; hovered / focused 0.6; otherwise 0 (the fragment discards). */
export function writeHalos(buffers: BodyBuffers, model: RenderModel, hovered: number | null): void {
  for (const b of model.bodies) {
    const glow = hovered === b.index ? Math.max(HALO_HOVER, b.nextUp ? HALO_NEXT_UP : 0) : b.nextUp ? HALO_NEXT_UP : 0
    buffers.glow.setX(b.index, glow)
  }
  buffers.glow.needsUpdate = true
}

export function disposeBodyBuffers(buffers: BodyBuffers): void {
  buffers.bodies.geometry.dispose()
  buffers.bodies.material.dispose()
  buffers.ghosts.material.dispose()
  buffers.rings.geometry.dispose()
  buffers.rings.material.dispose()
  buffers.selection.geometry.dispose()
  buffers.selection.material.dispose()
  buffers.pools.geometry.dispose()
  buffers.pools.material.dispose() // the glow texture is shared and never disposed
  buffers.halos.geometry.dispose()
  buffers.halos.material.dispose()
  buffers.bodies.dispose()
  buffers.ghosts.dispose()
  buffers.rings.dispose()
  buffers.selection.dispose()
  buffers.pools.dispose()
  buffers.halos.dispose()
}
