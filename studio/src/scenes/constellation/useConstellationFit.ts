// Fits the camera to the bodies (studio-observatory.md §5.2 "Camera"): on every data change the
// orbit's HOME becomes the pose that frames the bodies' on-screen extents with a 12 % margin, and
// the camera jumps there; on a resize the home is recomputed and applied only while nobody has
// orbited away from it (otherwise the person's view is kept and double-click returns home). The
// same fit chooses the ONE uniform body factor (`bodyScale`) the scene multiplies every radius
// by, and the fog density that fades the far side of the sphere rather than the bodies.
//
// Reads the layout's TARGET positions (where the bodies will settle), not the drawn ones, so the
// camera is right for the final picture and the settle tween plays inside a steady frame.
import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { FogExp2 } from 'three'
import type { PerspectiveCamera } from 'three'
import type { BodySource } from '../core/types'
import type { RenderModel } from './constellationModel'
import { FIT_POLICY, fitView, fogDensityFor } from './fit'
import type { OrbitState } from './orbit'
import type { LayoutHandles } from './useConstellationLayout'

export interface FitHandles {
  /** The uniform body factor the last fit chose. Read each frame by the writers. */
  bodyScale: React.RefObject<number>
}

export function useConstellationFit(
  model: RenderModel,
  layout: LayoutHandles,
  orbit: OrbitState,
  fovDeg: number,
  wake: () => void,
  /** Round 2 (I9): which host — chooses the plate room and whether the host's aspect is a hard
   * input (the Board's bodies must fill 60 % of its figure). Default: the Sprint's slab. */
  source: BodySource = 'sprint',
): FitHandles {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const scene = useThree((s) => s.scene)
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const bodyScale = useRef(1)
  const fittedModel = useRef<RenderModel | null>(null)

  useEffect(() => {
    const aspect = size.height > 0 ? size.width / size.height : 1
    const radii = model.bodies.map((b) => b.radius)
    // The host size goes in so the plates' room (fixed px under and beside each body) is part of
    // what is centred and framed — the drawing, not the bodies alone, sits centred in its figure.
    const policy = FIT_POLICY[source]
    const fit = fitView(layout.target.current, radii, orbit.polar, orbit.azimuth, fovDeg, aspect, { width: size.width, height: size.height }, policy.pad, policy.aspect)
    bodyScale.current = fit.bodyScale
    // A new data set always refits; a resize only moves a camera nobody has touched.
    const dataChanged = fittedModel.current !== model
    fittedModel.current = model
    const apply = dataChanged || !orbit.touched
    orbit.setHome(fit.center, fit.distance, apply)
    // The aspect policy may have chosen a lower polar than the orbit's; it is part of the home pose.
    if (apply) orbit.polar = fit.polar
    orbit.applyTo(camera)
    if (camera.isPerspectiveCamera) {
      camera.far = Math.max(80, fit.distance * 4)
      camera.updateProjectionMatrix()
    }
    const fog = scene.fog
    if (fog instanceof FogExp2) fog.density = fogDensityFor(fit.distance)
    layout.dirty.current = { transforms: true, colors: true, tethers: true }
    wake()
    invalidate()
    // `layout.target` is a ref the layout effect (registered earlier in the scene) has already
    // filled for this model by the time this effect runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, size.width, size.height, fovDeg, source])

  return { bodyScale }
}
