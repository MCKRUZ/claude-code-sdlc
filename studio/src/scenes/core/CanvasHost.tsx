// The ONLY file that imports `Canvas` (studio-observatory.md §5.0 `CanvasHost`). Loaded lazily
// through `./lazyCanvas`, so this module — and three.js under it — enters the page on first graph
// mount and never in a `--mode=test` build unless a test toggles the graph.
//
// Renderer settings are chosen so a hex token renders as exactly that hex: `flat` + NoToneMapping
// + sRGB output; clear alpha 0 so the page's own surface shows through; `powerPreference:
// 'low-power'` because this is a dashboard, not a game; dpr capped at MAX_DPR. The canvas wrapper
// is aria-hidden — the plates beside it and the shell's table carry every word.
import { useContext, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import type { RootState } from '@react-three/fiber'
import { NoToneMapping, SRGBColorSpace } from 'three'
import { PlateInteractionContext, PlateLayerContext } from './canvasActivity'
import { PlateLayer } from './Plates'
import { PlateStore } from './projectLabels'
import { MAX_DPR } from './sceneDefaults'
import { useThemeColors } from './useThemeColors'
import { markWebGLLost, markWebGLRestored } from './webgl'

export interface CanvasHostProps {
  children?: ReactNode
}

const GL = { antialias: true, alpha: true, powerPreference: 'low-power' as const, preserveDrawingBuffer: false }
const RESIZE = { debounce: 50 }

function onCreated({ gl }: RootState): void {
  gl.setClearAlpha(0)
  gl.toneMapping = NoToneMapping
  gl.outputColorSpace = SRGBColorSpace
}

/** Tells `webgl.ts` when the GPU takes the context away or hands it back. `preventDefault` on
 * the lost event is what makes a later restore possible. */
function ContextLossWatcher() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const el = gl.domElement
    const lost = (e: Event) => {
      e.preventDefault()
      markWebGLLost()
    }
    const restored = () => markWebGLRestored()
    el.addEventListener('webglcontextlost', lost)
    el.addEventListener('webglcontextrestored', restored)
    return () => {
      el.removeEventListener('webglcontextlost', lost)
      el.removeEventListener('webglcontextrestored', restored)
    }
  }, [gl])
  return null
}

const FOG_TOKENS = ['surface-0'] as const

/** Distance fade into the page's own surface colour, so far geometry dissolves into the card. */
function SceneFog() {
  const colors = useThemeColors(FOG_TOKENS)
  return <fogExp2 attach="fog" args={[colors['surface-0'], 0.06]} />
}

export function CanvasHost({ children }: CanvasHostProps) {
  const store = useMemo(() => new PlateStore(), [])
  const { hoverId, onHover, onActivate } = useContext(PlateInteractionContext)
  return (
    <PlateLayerContext.Provider value={store}>
      <div className="relative h-full min-h-40 w-full">
        <div aria-hidden="true" className="absolute inset-0">
          <Canvas frameloop="demand" dpr={[1, MAX_DPR]} flat gl={GL} resize={RESIZE} onCreated={onCreated}>
            <ContextLossWatcher />
            <SceneFog />
            {children}
          </Canvas>
        </div>
        <PlateLayer store={store} hoverId={hoverId} onHover={onHover} onActivate={onActivate} />
      </div>
    </PlateLayerContext.Provider>
  )
}

export default CanvasHost
