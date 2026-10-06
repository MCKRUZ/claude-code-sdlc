// The R3F half of the Ambient field (studio-observatory.md §5.3; round 2 B3) — the only module
// under `src/scenes/ambient/` that imports three or fiber, and reached solely through
// `React.lazy` from `AmbientField.tsx`, after the shared CanvasHost has itself been lazily
// mounted. Two layers in three `Points` draws — far dust in ink, its accent share, near motes —
// gathered on the hero third, in a 16 × 9 × 4 slab, the core `FieldMaterial` (untouched) doing
// all the motion on the GPU. The CPU's per-frame work is: advance `uTime`, step the fade and
// the settle, nudge the camera by the parallax offset. No React state is written per frame.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Points } from 'three'
import type { PerspectiveCamera } from 'three'
import type { FamiliarityTier } from '../../motion/contract'
import { FieldMaterial } from '../core/materials/FieldMaterial'
import { useDemandLoop } from '../core/useDemandLoop'
import { useThemeAttr, useThemeColors } from '../core/useThemeColors'
import {
  APPEARANCE,
  CAMERA_FOV,
  CAMERA_Z,
  FIELD_FPS,
  buildField,
  fadeProgress,
  fadeSecondsFor,
  normalisePointer,
  parallaxOffset,
  settleScale,
  type FieldDraw,
} from './fieldModel'

const TOKENS = ['ink-4', 'accent-400'] as const

export interface AmbientPointsProps {
  /** From the host: true while the field is on screen and the document is visible. */
  live: boolean
  /** From `readFamiliarity()`: first opens arrive slowly and settle; later opens plainly fade. */
  familiarity?: FamiliarityTier
}

/** Pins the shared renderer to DPR 1 and the camera to §5.3 while this scene is mounted. The
 * CanvasHost allows up to MAX_DPR for data scenes; decoration does not need the pixels. */
function useFieldCamera(): void {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const setDpr = useThree((s) => s.setDpr)
  useEffect(() => {
    setDpr(1)
    camera.fov = CAMERA_FOV
    camera.position.set(0, 0, CAMERA_Z)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, setDpr])
}

interface Draw {
  readonly spec: FieldDraw
  readonly geometry: BufferGeometry
  readonly material: FieldMaterial
  readonly points: Points
}

export default function AmbientPoints({ live, familiarity = 'full' }: AmbientPointsProps) {
  const colors = useThemeColors(TOKENS)
  const dark = useThemeAttr() === 'dark'
  const invalidate = useThree((s) => s.invalidate)
  useFieldCamera()

  // Geometry and material per draw are created once and disposed on unmount; counts never
  // change, so no buffer is ever reallocated. `buildField` is seeded: the same field every open.
  const draws = useMemo<Draw[]>(() => {
    return buildField().map((spec) => {
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new BufferAttribute(spec.positions, 3))
      geometry.setAttribute('aSize', new BufferAttribute(spec.sizes, 1))
      geometry.computeBoundingSphere()
      const look = APPEARANCE.light[spec.name]
      const material = new FieldMaterial(colors[look.token], look.opacity, look.additive)
      const points = new Points(geometry, material)
      points.frustumCulled = false // the slab always fills the view; skip the sphere test
      return { spec, geometry, material, points }
    })
    // Created once; the effect below follows theme changes without a new program.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => () => {
    for (const d of draws) {
      d.geometry.dispose()
      d.material.dispose()
    }
  }, [draws])

  useEffect(() => {
    const theme = dark ? APPEARANCE.dark : APPEARANCE.light
    for (const d of draws) {
      const look = theme[d.spec.name]
      d.material.setAppearance(colors[look.token], look.opacity, look.additive)
    }
    invalidate()
  }, [colors, dark, draws, invalidate])

  // Pointer parallax: the window's pointer, normalised, read in useFrame. No pointer events are
  // delivered to the canvas itself (`pointer-events: none` on the host), so listen on window.
  const pointer = useRef({ nx: 0, ny: 0 })
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onMove = (e: PointerEvent) => {
      pointer.current = normalisePointer(e.clientX, e.clientY, window.innerWidth, window.innerHeight)
    }
    const onLeave = () => {
      pointer.current = { nx: 0, ny: 0 }
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerleave', onLeave)
    window.addEventListener('blur', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onLeave)
    }
  }, [])

  // Clock for the drift, the fade and the settle. Advanced by the demand loop's tick (so a
  // paused field does not jump when it resumes), consumed by useFrame.
  const elapsed = useRef(0)
  const onTick = useRef((delta: number) => {
    elapsed.current += delta
  }).current
  useDemandLoop(live, { fps: FIELD_FPS, onTick })

  const fadeSeconds = fadeSecondsFor(familiarity)
  const camera = useThree((s) => s.camera)
  useFrame(() => {
    const fade = fadeProgress(elapsed.current, fadeSeconds)
    // The size uniform doubles as the settle: DPR is pinned to 1, so 1.06 → 1 is the whole story.
    const scale = settleScale(fade, familiarity)
    for (const d of draws) {
      d.material.setTime(elapsed.current)
      d.material.setFade(fade)
      d.material.uniforms.uDpr.value = scale
    }
    const { x, y } = parallaxOffset(pointer.current.nx, pointer.current.ny)
    // Camera drifts opposite the pointer, as a background should; the lookAt keeps the slab framed.
    camera.position.x = -x
    camera.position.y = y
    camera.lookAt(0, 0, 0)
  })

  return (
    <>
      {draws.map((d) => (
        <primitive key={d.spec.name} object={d.points} />
      ))}
    </>
  )
}
