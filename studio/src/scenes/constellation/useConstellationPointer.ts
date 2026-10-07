// Pointer input on the canvas (studio-observatory.md §5.2 "Camera / controls", "Interactions"):
// move → raycast against the instanced bodies at ≤ 60 Hz and share the hover id with the plates;
// drag on empty space → orbit; drag on a body → re-position it (layout only, cached — never a
// write to the project); wheel → zoom; double-click → back to the fitted home pose.
// Native listeners on the renderer's own element, so nothing here depends on R3F's event system
// and the DOM plates beside the canvas keep their own pointer events.
import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Plane, Vector2, Vector3 } from 'three'
import type { InstancedMesh } from 'three'
import type { RenderModel } from './constellationModel'
import type { OrbitState } from './orbit'
import type { LayoutHandles } from './useConstellationLayout'

export interface PointerOptions {
  model: RenderModel
  layout: LayoutHandles
  orbit: OrbitState
  getMeshes: () => { bodies: InstancedMesh; ghosts: InstancedMesh } | null
  onHover: (id: string | null) => void
  /** Pointer inside the canvas: drives the demand loop and the tether flow. */
  setInside: (inside: boolean) => void
  wake: () => void
}

const RAYCAST_INTERVAL_MS = 1000 / 60
const ndc = new Vector2()
const plane = new Plane()
const hit = new Vector3()
const normal = new Vector3()

export function useConstellationPointer(options: PointerOptions): void {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const raycaster = useThree((s) => s.raycaster)
  const latest = useRef(options)
  latest.current = options

  useEffect(() => {
    const el = gl.domElement
    let lastCast = 0
    let drag: { kind: 'orbit'; x: number; y: number } | { kind: 'body'; index: number } | null = null
    let hoverIndex: number | null = null

    const toNdc = (e: PointerEvent | MouseEvent) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    }

    const pick = (): number | null => {
      const meshes = latest.current.getMeshes()
      if (!meshes) return null
      raycaster.setFromCamera(ndc, camera)
      const { model } = latest.current
      const real = raycaster.intersectObject(meshes.bodies, false)[0]
      if (real?.instanceId !== undefined && real.instanceId < model.realCount) return real.instanceId
      const ghost = raycaster.intersectObject(meshes.ghosts, false)[0]
      if (ghost?.instanceId !== undefined) {
        // Ghost instance i is the i-th ghost body in model order.
        let seen = 0
        for (const b of model.bodies) if (b.ghost && seen++ === ghost.instanceId) return b.index
      }
      return null
    }

    const setHover = (index: number | null) => {
      if (index === hoverIndex) return
      hoverIndex = index
      latest.current.onHover(index === null ? null : latest.current.model.bodies[index]?.id ?? null)
    }

    const onMove = (e: PointerEvent) => {
      toNdc(e)
      if (drag?.kind === 'orbit') {
        latest.current.orbit.dragBy(e.clientX - drag.x, e.clientY - drag.y)
        drag.x = e.clientX
        drag.y = e.clientY
        return
      }
      if (drag?.kind === 'body') {
        raycaster.setFromCamera(ndc, camera)
        if (raycaster.ray.intersectPlane(plane, hit)) latest.current.layout.moveBody(drag.index, hit.x, hit.y, hit.z)
        return
      }
      const now = performance.now()
      if (now - lastCast < RAYCAST_INTERVAL_MS) return
      lastCast = now
      setHover(pick())
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      toNdc(e)
      const index = pick()
      if (index !== null) {
        const p = latest.current.layout.positions.current
        camera.getWorldDirection(normal)
        plane.setFromNormalAndCoplanarPoint(normal, hit.set(p[index * 3], p[index * 3 + 1], p[index * 3 + 2]))
        drag = { kind: 'body', index }
      } else {
        drag = { kind: 'orbit', x: e.clientX, y: e.clientY }
      }
      el.setPointerCapture(e.pointerId)
      latest.current.wake()
    }

    const onUp = (e: PointerEvent) => {
      if (drag?.kind === 'body') latest.current.layout.saveCache()
      drag = null
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }

    const onEnter = () => latest.current.setInside(true)
    const onLeave = () => {
      latest.current.setInside(false)
      setHover(null)
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      latest.current.orbit.wheel(e.deltaY)
    }
    const onDouble = () => {
      latest.current.orbit.goHome()
      latest.current.wake()
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('pointerenter', onEnter)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('dblclick', onDouble)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('pointerenter', onEnter)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('dblclick', onDouble)
    }
  }, [gl, camera, raycaster])
}
