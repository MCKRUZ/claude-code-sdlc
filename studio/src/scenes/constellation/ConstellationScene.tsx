// The R3F tree of the Dependency Constellation (studio-observatory.md §5.2). Lives INSIDE the
// Canvas that `SceneShell` → `CanvasHost` creates; owns the instanced meshes through refs and
// writes them from flat arrays each demand frame — no React state per frame. Frames happen only
// while something is live: the pointer is inside (tether flow), a tween is running (settle,
// hover dim), the orbit is damping, or the incremental layout is still stepping.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Group } from 'three'
import type { PerspectiveCamera } from 'three'
import { contextFrom } from '../../motion/choreo/_shared'
import { constellationHoverDim } from '../../motion/choreo/constellationSettle'
import type { ChoreoContext } from '../../motion/contract'
import { motion } from '../../motion/motion'
import { LAYOUT_POLICY } from '../core/layout/forceLayout'
import { SceneLights } from '../core/lights'
import { Plates } from '../core/Plates'
import type { SceneDataConstellation } from '../core/types'
import { useDemandLoop, useMotionEnabled } from '../core/useDemandLoop'
import { useThemeAttr, useThemeColors } from '../core/useThemeColors'
import {
  CONSTELLATION_TOKENS, DIM_WEIGHT, applyPalette, disposeBodyBuffers, syncBodyBuffers, writeBodyColors, writeBodyTransforms, writeHalos,
} from './bodyMeshes'
import type { BodyBuffers } from './bodyMeshes'
import { neighboursOf } from './constellationModel'
import type { RenderModel } from './constellationModel'
import type { OrbitState } from './orbit'
import { platesFor } from './plates'
import {
  advanceTetherFlow, applyTetherPalette, disposeTetherBuffers, setTetherFlow, setTetherResolution, syncTetherBuffers, writeTethers,
} from './tetherMeshes'
import type { TetherBuffers } from './tetherMeshes'
import { useConstellationFit } from './useConstellationFit'
import { useConstellationLayout } from './useConstellationLayout'
import { useConstellationPointer } from './useConstellationPointer'

export interface ConstellationSceneProps {
  data: SceneDataConstellation
  model: RenderModel
  hoverId: string | null
  onHover: (id: string | null) => void
  /** From the slot: the host's own notion of live (a timeline playing, etc.). */
  live: boolean
  orbit: OrbitState
  /** Layout cache key — the project path. */
  projectKey: string
}

export const CAMERA_FOV = 40

/** The anchor-writing frame callback runs BEFORE `Plates` projects (R3F sorts `useFrame`
 * subscribers by priority, lowest first; a negative one keeps automatic rendering on). Without
 * it, both were priority 0 and ran in MOUNT order — `Plates` (a child) subscribed first and
 * projected the anchors the scene had not yet written: on a Board whose layout came from the
 * cache (no settle tween → one demand frame and the loop idles) every plate projected (0,0,0)
 * and the labels stacked in a column at the canvas centre, detached from their bodies
 * (observatory-v13-board-graph.png). */
export const ANCHOR_FRAME_PRIORITY = -1

export function ConstellationScene({ data, model, hoverId, onHover, live, orbit, projectKey }: ConstellationSceneProps) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const palette = useThemeColors(CONSTELLATION_TOKENS)
  const theme = useThemeAttr()
  const dark = theme === 'dark'
  const motionOn = useMotionEnabled()

  const group = useMemo(() => new Group(), [])
  const bodyBuf = useRef<BodyBuffers | null>(null)
  const tetherBuf = useRef<TetherBuffers | null>(null)
  const weights = useRef<number[]>([])
  // The real timeline and the stub share `kill` / `progress`; that is all the scene needs.
  const hoverTl = useRef<{ kill(): unknown; progress(): number } | null>(null)
  const hovered = useRef<number | null>(null)

  const [internalLive, setInternalLive] = useState(true)
  const [inside, setInside] = useState(false)
  const wake = useCallback(() => setInternalLive(true), [])
  const getContext = useCallback(
    (): ChoreoContext => contextFrom(gl.domElement, { enabled: motion.enabled(), reduced: motion.reduced() }, motion),
    [gl],
  )
  // Round 2 (I9): the host's aspect policy — the Board's y band and gathered x — rides the source.
  const layout = useConstellationLayout(model, projectKey, getContext, invalidate, wake, LAYOUT_POLICY[data.source])

  // Camera lens per §5.2; the fit below chooses the pose and the orbit owns it from there on.
  useEffect(() => {
    const cam = camera as PerspectiveCamera
    if (cam.isPerspectiveCamera) {
      cam.fov = CAMERA_FOV
      cam.near = 0.1
      cam.far = 80
      cam.updateProjectionMatrix()
    }
    orbit.applyTo(cam)
    invalidate()
  }, [camera, orbit, invalidate])
  const fit = useConstellationFit(model, layout, orbit, CAMERA_FOV, wake, data.source)

  // Buffers: allocate on first mount, reuse while the counts hold, recolour on theme change.
  useEffect(() => {
    const nextBodies = syncBodyBuffers(bodyBuf.current, model, palette, theme)
    const nextTethers = syncTetherBuffers(tetherBuf.current, model, palette)
    if (nextBodies !== bodyBuf.current || nextTethers !== tetherBuf.current) {
      group.clear()
      group.add(nextTethers.grid, nextBodies.pools, nextTethers.order, nextTethers.live, nextTethers.hotUp, nextTethers.hot, nextTethers.ghost, nextTethers.cones)
      group.add(nextBodies.bodies, nextBodies.ghosts, nextBodies.rings, nextBodies.selection, nextBodies.halos)
    }
    bodyBuf.current = nextBodies
    tetherBuf.current = nextTethers
    applyPalette(nextBodies, palette, theme)
    applyTetherPalette(nextTethers, palette, dark)
    if (weights.current.length !== model.bodies.length) weights.current = new Array<number>(model.bodies.length).fill(1)
    layout.dirty.current = { transforms: true, colors: true, tethers: true }
    invalidate()
  }, [model, palette, theme, dark, group, layout, invalidate])

  useEffect(() => () => {
    if (bodyBuf.current) disposeBodyBuffers(bodyBuf.current)
    if (tetherBuf.current) disposeTetherBuffers(tetherBuf.current)
    bodyBuf.current = null
    tetherBuf.current = null
    group.clear()
  }, [group])

  useEffect(() => {
    if (tetherBuf.current) setTetherResolution(tetherBuf.current, size.width, size.height)
    invalidate()
  }, [size.width, size.height, model, invalidate])

  // Hover: non-neighbours dim over 160 ms (instant when motion is off — the stub applies the end
  // state); the hovered body's incident tethers move to the two hot sets (by direction) and the
  // selection ring moves to it (a transform write).
  useEffect(() => {
    const index = hoverId === null ? null : model.bodies.findIndex((b) => b.id === hoverId)
    hovered.current = index === -1 ? null : index
    hoverTl.current?.kill()
    hoverTl.current = constellationHoverDim.play(getContext(), {
      weights: weights.current,
      neighbours: hovered.current === null ? null : neighboursOf(model, hovered.current),
      dim: DIM_WEIGHT,
    })
    layout.dirty.current.transforms = true
    layout.dirty.current.colors = true
    layout.dirty.current.tethers = true
    wake()
    invalidate()
  }, [hoverId, model, getContext, layout, wake, invalidate])

  // A key press from the figure (DOM side) reaches the orbit; with motion off it lands at once.
  useEffect(() => orbit.onWake(() => {
    if (motion.enabled()) { wake(); return }
    while (orbit.update()) { /* settle instantly */ }
    orbit.applyTo(camera)
    invalidate()
  }), [orbit, camera, wake, invalidate])

  // The dash flows while someone is looking: the pointer inside the canvas, OR a plate hovered or
  // focused (keyboard users get the same direction cue — round 2, I5). Never while idle.
  const looking = inside || hoverId !== null
  useEffect(() => {
    if (tetherBuf.current) setTetherFlow(tetherBuf.current, looking && motionOn)
    invalidate()
  }, [looking, motionOn, invalidate])

  const getMeshes = useCallback(() => (bodyBuf.current ? { bodies: bodyBuf.current.bodies, ghosts: bodyBuf.current.ghosts } : null), [])
  useConstellationPointer({ model, layout, orbit, getMeshes, onHover, setInside, wake })

  const onTick = useCallback((dt: number): boolean => {
    let busy = false
    if (orbit.update(dt)) { orbit.applyTo(camera); busy = true }
    if (layout.layoutTick()) busy = true
    const hover = hoverTl.current
    if (hover && hover.progress() < 1) { layout.dirty.current.colors = true; busy = true }
    if (looking && motionOn && tetherBuf.current) { advanceTetherFlow(tetherBuf.current, dt); busy = true }
    if (!busy && !live) {
      setInternalLive(false)
      return false
    }
    return true
  }, [orbit, camera, layout, looking, motionOn, live])
  useDemandLoop(live || looking || internalLive, { onTick })

  const items = useMemo(() => platesFor(model, data), [model, data])

  useFrame(() => {
    const bodies = bodyBuf.current
    const tethers = tetherBuf.current
    if (!bodies || !tethers) return
    const p = layout.positions.current
    const dirty = layout.dirty.current
    const scale = fit.bodyScale.current
    const wroteTransforms = dirty.transforms
    if (dirty.transforms) { writeBodyTransforms(bodies, model, p, scale, hovered.current); dirty.transforms = false }
    if (dirty.colors) { writeBodyColors(bodies, model, palette, weights.current, hovered.current); writeHalos(bodies, model, hovered.current); dirty.colors = false }
    if (dirty.tethers) { writeTethers(tethers, model, p, hovered.current, scale); dirty.tethers = false }
    // Plates hang from the body's centre; the store places them under its silhouette.
    for (const item of items) {
      const rb = model.bodies.find((b) => b.id === item.id)
      if (!rb) continue
      item.anchor.set(p[rb.index * 3], p[rb.index * 3 + 1], p[rb.index * 3 + 2])
      item.anchorRadius = rb.radius * scale
    }
    // The positions moved this frame: ask for one more, so whatever projected before this
    // callback in an earlier frame (a plate registered late, a resize) reads the final anchors.
    if (wroteTransforms) invalidate()
  }, ANCHOR_FRAME_PRIORITY)

  return (
    <>
      <SceneLights />
      <primitive object={group} />
      <Plates items={items} />
    </>
  )
}

export default ConstellationScene
