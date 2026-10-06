// The Spine scene's in-canvas hooks (studio-observatory.md §5.1 "Camera", §4.2 row 19): the
// camera that frames the whole rail at every band size (`spineCamera.ts`) with its ±0.08 rad
// parallax, the pointer listener that drives it through the `spineParallax` choreography, and
// the plate and caption lists derived from the stations. Each must run inside a Canvas (they
// read `useThree`).
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, Spherical, Vector3 } from 'three'
import { contextFrom } from '../../motion/choreo/_shared'
import { spineParallax } from '../../motion/choreo/spineParallax'
import { MOTION_DURATIONS, MOTION_EASES } from '../../motion/contract'
import { motion } from '../../motion/motion'
import type { CaptionItem, PlateItem } from '../core/projectLabels'
import type { SceneDataSpine } from '../core/types'
import { CAMERA_FOV, ELEVATION, spinePose } from './spineCamera'
import { captionAnchor } from './spineGeometry'
import { discRadius, groupCaptions, plateLines } from './spineModel'

export { CAMERA_FOV }

export interface ParallaxState {
  yaw: number
  pitch: number
}

/** fov 24 on an orbit whose distance and look-at come from the band's size and the station count
 * (`spinePose`), re-placed each demand frame with the current yaw / pitch offset, so the
 * parallax tween only has to write numbers and a resize simply reframes. */
export function useSpineCamera(parallax: ParallaxState, stationCount: number): void {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const scratch = useMemo(() => ({ offset: new Vector3(), spherical: new Spherical(), target: new Vector3() }), [])

  useEffect(() => {
    if (camera instanceof PerspectiveCamera) {
      camera.fov = CAMERA_FOV
      camera.near = 0.1
      camera.far = 60
      camera.updateProjectionMatrix()
    }
    invalidate()
  }, [camera, invalidate, size.width, size.height])

  useFrame(() => {
    const pose = spinePose(stationCount, size.width, size.height)
    const { offset, spherical, target } = scratch
    target.set(pose.target[0], pose.target[1], pose.target[2])
    offset.set(0, Math.sin(ELEVATION) * pose.distance, Math.cos(ELEVATION) * pose.distance)
    spherical.setFromVector3(offset)
    spherical.theta += parallax.yaw
    spherical.phi = Math.min(Math.PI - 0.05, Math.max(0.05, spherical.phi + parallax.pitch))
    offset.setFromSpherical(spherical)
    camera.position.copy(target).add(offset)
    camera.lookAt(target)
  })
}

/** Pointer position over the canvas → `spineParallax.play` (±0.08 rad, `overwrite: 'auto'`);
 * leaving eases back to centre. Returns whether the pointer is inside, which keeps the demand
 * loop live while someone is looking. Reduced / off motion: the choreography returns a completed
 * stub and the camera stays fixed. */
export function useParallaxPointer(parallax: ParallaxState): boolean {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const [inside, setInside] = useState(false)
  const insideRef = useRef(false)

  useEffect(() => {
    const el = gl.domElement
    const play = (nx: number, ny: number) => {
      const ctx = contextFrom(
        el,
        { enabled: motion.enabled(), reduced: motion.reduced() },
        { durations: MOTION_DURATIONS, eases: MOTION_EASES },
      )
      spineParallax.play(ctx, { camera: parallax, nx, ny, onUpdate: invalidate })
    }
    const move = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1
      if (!insideRef.current) {
        insideRef.current = true
        setInside(true)
      }
      // Pointer right → camera swings right (negative theta); pointer down → camera dips.
      play(-nx, ny)
    }
    const leave = () => {
      insideRef.current = false
      setInside(false)
      play(0, 0)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
    }
  }, [gl, invalidate, parallax])

  return inside
}

/** One plate per station, alternating below / above the rail: `layoutSpineBands` turns the two
 * sides into two level bands, so same-band neighbours are two stations apart. `anchorRadius` is
 * the station's real disc edge (the knot's reach for Build), which is what a plate keeps clear
 * of. `kind: 'Stage'` so the accessible name is "Stage <id>: <display>", never a bare id; the
 * expanded lines are the sidebar's words and the plugin's facts verbatim. */
export function usePlateItems(data: SceneDataSpine, points: Vector3[]): PlateItem[] {
  return useMemo(
    () =>
      data.stations.map((station, i) => {
        const p = points[i] ?? new Vector3()
        return {
          id: station.id,
          kind: 'Stage',
          title: station.display,
          anchor: p.clone(),
          anchorRadius: discRadius(station.isBuild),
          side: i % 2 === 0 ? ('below' as const) : ('above' as const),
          lines: plateLines(station, station.isCurrent ? data.currentDocs : null),
          badge: station.isCurrent ? 'now' : undefined,
          muted: station.kind === 'later',
        }
      }),
    [data, points],
  )
}

/** Foundation / Build / Ship / Close as small DOM captions over the middle of each group. Only the
 * anchor's x is used on screen (the store pins the row to the band's top), so the anchor sits on
 * the rail plane itself. */
export function useCaptionItems(data: SceneDataSpine, points: Vector3[]): CaptionItem[] {
  return useMemo(
    () =>
      groupCaptions(data).flatMap((g) => {
        const anchor = captionAnchor(g, points)
        return anchor ? [{ id: `group:${g.label}`, label: g.label, anchor }] : []
      }),
    [data, points],
  )
}
