// The R3F half of the Ambient field (studio-observatory.md §5.3) — the only module under
// `src/scenes/ambient/` that imports three or fiber, and reached solely through `React.lazy`
// from `AmbientField.tsx`, after the shared CanvasHost has itself been lazily mounted. 1 200
// points in a 16 × 9 × 4 slab, one `Points` draw call, the core `FieldMaterial` doing all the
// motion on the GPU. The CPU's per-frame work is: advance `uTime`, step the fade, nudge the
// camera by the parallax offset. No React state is written per frame — refs only.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Points } from 'three'
import type { PerspectiveCamera } from 'three'
import { FieldMaterial } from '../core/materials/FieldMaterial'
import { useDemandLoop } from '../core/useDemandLoop'
import { useThemeAttr, useThemeColors } from '../core/useThemeColors'
import {
  APPEARANCE,
  CAMERA_FOV,
  CAMERA_Z,
  FIELD_COUNT,
  FIELD_FPS,
  fadeProgress,
  normalisePointer,
  parallaxOffset,
  slabPositions,
  slabSizes,
} from './fieldModel'

const TOKENS = ['ink-4', 'accent-400'] as const

export interface AmbientPointsProps {
  /** From the host: true while the field is on screen and the document is visible. */
  live: boolean
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

export default function AmbientPoints({ live }: AmbientPointsProps) {
  const colors = useThemeColors(TOKENS)
  const dark = useThemeAttr() === 'dark'
  const invalidate = useThree((s) => s.invalidate)
  useFieldCamera()

  // Geometry and material are created once and disposed on unmount; N never changes, so the
  // position buffer is never reallocated.
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(slabPositions(FIELD_COUNT), 3))
    g.setAttribute('aSize', new BufferAttribute(slabSizes(FIELD_COUNT), 1))
    g.computeBoundingSphere()
    return g
  }, [])
  const material = useMemo(() => {
    const look = APPEARANCE.light
    return new FieldMaterial(colors[look.token], look.opacity, look.additive)
    // Created once; `setAppearance` below follows theme changes without a new program.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])

  useEffect(() => {
    const look = dark ? APPEARANCE.dark : APPEARANCE.light
    material.setAppearance(colors[look.token], look.opacity, look.additive)
    material.uniforms.uDpr.value = 1
    invalidate()
  }, [colors, dark, material, invalidate])

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

  // Clock for the drift and the 600 ms fade. Advanced by the demand loop's tick (so a paused
  // field does not jump when it resumes), consumed by useFrame.
  const elapsed = useRef(0)
  const onTick = useRef((delta: number) => {
    elapsed.current += delta
  }).current
  useDemandLoop(live, { fps: FIELD_FPS, onTick })

  const camera = useThree((s) => s.camera)
  useFrame(() => {
    material.setTime(elapsed.current)
    material.setFade(fadeProgress(elapsed.current))
    const { x, y } = parallaxOffset(pointer.current.nx, pointer.current.ny)
    // Camera drifts opposite the pointer, as a background should; the lookAt keeps the slab framed.
    camera.position.x = -x
    camera.position.y = y
    camera.lookAt(0, 0, 0)
  })

  const points = useMemo(() => {
    const p = new Points(geometry, material)
    p.frustumCulled = false // the slab always fills the view; skip the sphere test
    return p
  }, [geometry, material])
  return <primitive object={points} />
}
