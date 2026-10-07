// The Lifecycle Spine's entry module (studio-observatory.md §5.1, §11 Wave 2 S1). Wave 3 registers
// it: `registerScene('spine', () => import('../scenes/spine/LifecycleSpine'))`, so this file is the
// only one `SceneSlot` reaches and the three/fiber chunk under `SpineScene` loads on first graph
// mount only. It renders a `SceneShell` with the DOM table of equal rank and the R3F tree as
// children; the band's collapsed state and its height are the HOST's (StageHome) concern.
//
// The surface choice is remembered per person in `localStorage['studio.spine.surface']`; the
// default is `DEFAULT_SURFACE` (table in test builds), so a screen's e2e pins see the list first.
import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { PlateInteractionProvider } from '../core/canvasActivity'
import { DEFAULT_SURFACE } from '../core/sceneDefaults'
import { SceneShell } from '../core/SceneShell'
import type { SceneSlotProps, SceneSurface } from '../core/types'
import { SPINE_CAPTION, SPINE_TITLE, spineSummary } from './spineModel'
import { reticleIndex, SPINE_RETICLE_LEGEND } from './spineReticle'
import { SpineTable } from './SpineTable'

// The R3F tree (and three under it) is a second lazy seam: SceneShell renders its children only
// when the graph is actually shown, so on the table surface this import never happens.
const LazySpineScene = lazy(() => import('./SpineScene'))

export const SPINE_SURFACE_KEY = 'studio.spine.surface'

function readSurface(): SceneSurface {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(SPINE_SURFACE_KEY)
    return raw === 'graph' || raw === 'table' ? raw : DEFAULT_SURFACE
  } catch {
    return DEFAULT_SURFACE
  }
}

function storeSurface(next: SceneSurface): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SPINE_SURFACE_KEY, next)
  } catch {
    // Not remembered this time; the choice still holds for this session.
  }
}

export type LifecycleSpineProps = SceneSlotProps<'spine'> & {
  /** Body height in px; the host passes 168 / 120 / 200 per its density and screen. */
  height?: number
  className?: string
  /** The band's collapse chevron, drawn in the figure's header so there is one header row. */
  headerExtra?: ReactNode
}

export function LifecycleSpine(props: LifecycleSpineProps) {
  const { data, hoverId, onHover, onActivate, height, className, headerExtra } = props
  const [surface, setSurface] = useState<SceneSurface>(readSurface)
  const onSurfaceChange = useCallback((next: SceneSurface) => {
    setSurface(next)
    storeSurface(next)
  }, [])
  // The command palette's "Graph / Table" action writes the same key and dispatches a same-window
  // `storage` event (paletteActions.toggleSurfacePreference); without this subscription the toggle
  // would persist for next time and change nothing on screen now.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SPINE_SURFACE_KEY) return
      if (e.newValue === 'graph' || e.newValue === 'table') setSurface(e.newValue)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const table = <SpineTable data={data} onActivate={onActivate} hoverId={hoverId} onHover={onHover} />
  // Round 2 (S3 / I3): the figcaption is the condensed line; the reticle sentence joins it only
  // while a stage is being viewed (never on Closing, where the host passes null).
  const legend = reticleIndex(data) === null ? SPINE_CAPTION : `${SPINE_CAPTION} ${SPINE_RETICLE_LEGEND}`

  return (
    <PlateInteractionProvider value={{ hoverId, onHover, onActivate }}>
      <SceneShell
        id="spine"
        title={SPINE_TITLE}
        summary={spineSummary(data)}
        legend={legend}
        surface={surface}
        onSurfaceChange={onSurfaceChange}
        table={table}
        height={height}
        className={className}
        headerExtra={headerExtra}
        data-testid="lifecycle-spine"
      >
        <Suspense fallback={null}>
          <LazySpineScene id={props.id} data={data} hoverId={hoverId} onHover={onHover} onActivate={onActivate} live={props.live} />
        </Suspense>
      </SceneShell>
    </PlateInteractionProvider>
  )
}

export default LifecycleSpine
