// The Ambient field (studio-observatory.md §5.3): first-open atmosphere behind screens that have
// NO project data (Welcome, NewProject, SetupFlow, ToolingIssues). Pure decoration.
//
// Why this is not a `SceneShell`: the shell exists to guarantee every scene a DOM view of equal
// rank — its `table` prop is required so a scene without one does not compile. The field carries
// no data at all (`SceneDataById['ambient']` is `null`), so there is nothing a table could say;
// wrapping it in a shell would invent a figure, a caption and a 3D/Table toggle for a thing
// that is only weather. Its DOM equivalent is the page's own CSS radial gradients on `body`
// (`src/theme/base.css`), which are always painted and are what remains whenever this component
// renders null. It still rides the core's lazy boundary (`lazyCanvas` → `CanvasHost`), the
// one-live-canvas registry, the on-screen / page-visible activity context and the error fence,
// so it costs nothing the data scenes do not already pay for.
//
// Gate (§5.3): rendered only when `AMBIENT_ENABLED` (MODE ≠ test) AND `motion.enabled()` AND
// `canUseWebGL()`. Otherwise null — no chunk is requested, the gradient shows. This module must
// not import three or fiber: it is the entry Wave 3 registers with `React.lazy`, and the GPU
// half is a second lazy step (`./AmbientPoints`) taken only once the gate is open.
//
// Round 2 (B3): the field is two gathered layers (far dust + near motes, `fieldModel.ts`) and
// honours the person's familiarity with the Welcome screen (M3) — first opens arrive over 900 ms
// with the sizes settling, later opens plainly fade in 320 ms. The gate itself is unchanged.
//
// Entry for Wave 3: `registerScene('ambient', () => import('../ambient/AmbientField'))`. Mount it
// as a child of a `position: relative` host on the no-data screens only; unmounting it (a project
// opening) disposes the canvas, the geometry and the material.
import { Suspense, lazy, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { motion } from '../../motion/motion'
import { CanvasActivityContext } from '../core/canvasActivity'
import { claimCanvas, onCanvasReleased } from '../core/canvasRegistry'
import { loadCanvasHost } from '../core/lazyCanvas'
import { AMBIENT_ENABLED } from '../core/sceneDefaults'
import { SceneErrorBoundary } from '../core/SceneErrorBoundary'
import { useOnScreen, usePageVisible } from '../core/shellHooks'
import type { SceneSlotProps } from '../core/types'
import { canUseWebGL, onWebGLChange } from '../core/webgl'
import { readFamiliarity } from './familiarity'

const LazyCanvas = lazy(loadCanvasHost)
const LazyPoints = lazy(() => import('./AmbientPoints'))

const off = () => false

function useMotionOn(): boolean {
  return useSyncExternalStore(motion.subscribe, () => motion.enabled(), off)
}

function useWebGL(): boolean {
  return useSyncExternalStore(onWebGLChange, canUseWebGL, off)
}

/** The three gates of §5.3 as one reactive answer. */
export function useAmbientAllowed(): boolean {
  const motionOn = useMotionOn()
  const webgl = useWebGL()
  return AMBIENT_ENABLED && motionOn && webgl
}

const HOST_STYLE = {
  position: 'absolute',
  inset: 0,
  zIndex: 0,
  pointerEvents: 'none',
  overflow: 'hidden',
} as const

export type AmbientFieldProps = SceneSlotProps<'ambient'>

export default function AmbientField(_props: AmbientFieldProps) {
  const allowed = useAmbientAllowed()
  return allowed ? <AmbientHost /> : null
}

/** Mounted only once the gate is open, so the registry claim and the chunk request never
 * happen for a field that will not draw. */
function AmbientHost() {
  const ref = useRef<HTMLDivElement>(null)
  // Both hooks run on every render. `useOnScreen(ref) && usePageVisible()` would skip the second
  // hook as soon as the first reported false (the host clipped during a resize, DevTools device
  // emulation, a restore from minimised) — a different hook count on the next render, React
  // #310, and no boundary above App to catch it. Same fix as SceneShell.
  const onScreen = useOnScreen(ref)
  const pageVisible = usePageVisible()
  const active = onScreen && pageVisible

  // One live Canvas at a time (Electron's context cap): a data scene taking the slot sends the
  // field back to the gradient; when the slot frees up the field may return.
  const [evicted, setEvicted] = useState(false)
  const [crashed, setCrashed] = useState(false)
  useEffect(() => {
    if (evicted || crashed) return
    return claimCanvas(() => setEvicted(true))
  }, [evicted, crashed])
  useEffect(() => {
    if (!evicted) return
    return onCanvasReleased(() => setEvicted(false))
  }, [evicted])

  const draw = !evicted && !crashed
  // Held for the session (see `familiarity.ts`), so this reads the same tier the Welcome hero
  // read a beat earlier, before this open was counted.
  const familiarity = useRef(readFamiliarity()).current
  return (
    <div ref={ref} aria-hidden="true" data-ambient-field="" data-familiarity={familiarity} style={HOST_STYLE}>
      {draw ? (
        <CanvasActivityContext.Provider value={active}>
          <Suspense fallback={null}>
            <SceneErrorBoundary fallback={null} onError={() => setCrashed(true)}>
              <LazyCanvas>
                <LazyPoints live={active} familiarity={familiarity} />
              </LazyCanvas>
            </SceneErrorBoundary>
          </Suspense>
        </CanvasActivityContext.Provider>
      ) : null}
    </div>
  )
}
