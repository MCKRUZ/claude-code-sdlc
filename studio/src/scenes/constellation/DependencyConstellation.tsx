// The Dependency Constellation's entry (studio-observatory.md §5.2, §11 Wave 2 S2): the default
// export Wave 3 registers for BOTH `constellation-sprint` and `constellation-board`. Renders a
// `SceneShell` whose table is what the host passes (`table`, else `children`) — on the Sprint
// screen the existing SlateTable region, on the Board the grouped list — and whose R3F child is
// the lazily imported scene, so three.js is never fetched while the table is showing.
//
// This module must not import three statically: it sits in the scene chunk but is evaluated as
// soon as the slot mounts, table or graph. Everything three-flavoured is behind `lazy()`.
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { SCENE_SCOPE_ATTR, SCENE_SCOPE_VALUE, sceneCommandFor } from '../../shortcuts/shortcutMap'
import type { SceneCommand } from '../../shortcuts/shortcutMap'
import { backlogStore } from '../../stores/backlogStore'
import type { PreferenceStorageKey } from '../../theme/tokens'
import { Notice } from '../../ui/Notice'
import { PlateInteractionProvider } from '../core/canvasActivity'
import { registerSceneActions } from '../core/sceneActions'
import { DEFAULT_SURFACE } from '../core/sceneDefaults'
import { SceneShell } from '../core/SceneShell'
import type { SceneDataConstellation, SceneSlotProps, SceneSurface } from '../core/types'
import { canUseWebGL } from '../core/webgl'
import { buildRenderModel } from './constellationModel'
import type { RenderModel } from './constellationModel'
import { KEY_STEP, KEY_ZOOM, ORBIT_KEYSHORTCUTS, OrbitState } from './orbit'

const LazyScene = lazy(() => import('./ConstellationScene'))

export type ConstellationSceneId = 'constellation-sprint' | 'constellation-board'

export type DependencyConstellationProps = SceneSlotProps<ConstellationSceneId> & {
  /** The DOM surface of equal rank. Falls back to `children`, then to a one-line pointer at the
   * host's own list — never a second table (the sprint spec counts NOT READY cells). */
  table?: ReactNode
  children?: ReactNode
  /** Controlled surface; when absent the Sprint remembers `studio.sprint.surface`, the Board
   * opens on Graph (its own List | Graph segmented decides whether this slot mounts at all). */
  surface?: SceneSurface
  onSurfaceChange?: (next: SceneSurface) => void
  /** Layout-cache key; defaults to the backlog store's project path. */
  projectKey?: string
  /** Render `dependencyGaps` as a warn Notice under the figure (default: only when `table` is
   * given, since the Sprint board already shows its own gaps card). */
  showGaps?: boolean
  height?: number
  className?: string
  /** False when the host owns an equivalent control (the Board's List | Graph segmented). */
  showToggle?: boolean
  'data-testid'?: string
}

export const CONSTELLATION_TITLE = 'Dependency constellation'
export const CONSTELLATION_LEGEND =
  "Bodies are specs sized by risk tier; edges are depends_on as declared; x follows the plugin's build order and the thin accent path joins the slate in that order; y and z carry no meaning."
export const GHOST_NOUN: Record<SceneDataConstellation['source'], string> = { sprint: 'not in this sprint', board: 'not shown' }
/** On the Sprint screen the slate below IS the table surface, so with the drawing hidden the figure
 * is just its header and the one legend line — a second sentence here read as graph prose with
 * no graph (observatory v2 critique, shot 7). The sr-only summary still says what the figure holds. */
export const FALLBACK_TABLE_NOTE = ''

const SPRINT_SURFACE_KEY: PreferenceStorageKey = 'studio.sprint.surface'

function readStoredSurface(): SceneSurface | null {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(SPRINT_SURFACE_KEY)
    return raw === 'graph' || raw === 'table' ? raw : null
  } catch {
    return null
  }
}

function storeSurface(next: SceneSurface): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SPRINT_SURFACE_KEY, next)
  } catch {
    // Not remembered this time.
  }
}

/** The figure's `aria-label` sentence: counts the data carries, nothing derived. */
export function summaryFor(data: SceneDataConstellation, model: RenderModel): string {
  const parts = [`${model.realCount} spec${model.realCount === 1 ? '' : 's'}`]
  const edges = model.edges.filter((e) => !e.ghost).length
  parts.push(`${edges} depends_on edge${edges === 1 ? '' : 's'}`)
  if (model.ghostCount > 0) parts.push(`${model.ghostCount} ${GHOST_NOUN[data.source]}`)
  const notReady = model.bodies.filter((b) => b.notReady).length
  // "not yet ready", not the checker's literal "NOT READY": this sentence sits in the DOM as the
  // figure's sr-only summary, and the sprint e2e counts "NOT READY" texts to prove the slate is
  // the one table — the figure must add none to that count.
  if (notReady > 0) parts.push(`${notReady} not yet ready`)
  parts.push(data.nextUp ? `next up: ${data.nextUp}` : 'no next up named')
  return parts.join('; ')
}

/** The sr-only line inside the figure (I6): the keys a keyboard user needs, said once. */
export const SCENE_KEYS_HINT = 'Shift+arrows orbit; Home fits the graph; n focuses the next spec up; + and − zoom.'

/** ↑ / ↓ walk the build order (the plates' DOM order). From the figure itself (nothing focused
 * inside), ↓ lands on the first plate and ↑ on the last. */
function movePlateFocus(root: HTMLElement, from: HTMLElement, delta: 1 | -1): boolean {
  const plates = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-plate-id] button'))
  if (plates.length === 0) return false
  const i = plates.indexOf(from as HTMLButtonElement)
  const next = i === -1 ? (delta === 1 ? plates[0] : plates[plates.length - 1]) : plates[i + delta]
  if (!next) return false
  next.focus()
  return true
}

/** Focus the plate the plugin named next up; false when it named none or it is not drawn. */
function focusPlate(root: HTMLElement, id: string | null): boolean {
  if (id === null) return false
  const plate = Array.from(root.querySelectorAll<HTMLElement>('[data-plate-id]')).find((el) => el.dataset.plateId === id)
  const button = plate?.querySelector<HTMLButtonElement>('button')
  if (!button) return false
  button.focus()
  return true
}

export function DependencyConstellation(props: DependencyConstellationProps) {
  const { id, data, hoverId, onHover, onActivate, live } = props
  const root = useRef<HTMLDivElement>(null)
  const orbit = useMemo(() => new OrbitState(), [])
  const model = useMemo(() => buildRenderModel(data), [data])

  const isSprint = id === 'constellation-sprint'
  const [ownSurface, setOwnSurface] = useState<SceneSurface>(() => (isSprint ? readStoredSurface() ?? DEFAULT_SURFACE : 'graph'))
  const surface = props.surface ?? ownSurface
  const onSurfaceChange = useCallback((next: SceneSurface) => {
    if (isSprint) storeSurface(next)
    setOwnSurface(next)
    props.onSurfaceChange?.(next)
  }, [isSprint, props.onSurfaceChange]) // eslint-disable-line react-hooks/exhaustive-deps
  // The command palette's "Graph / Table" action writes `studio.sprint.surface` and dispatches a
  // same-window `storage` event (paletteActions.toggleSurfacePreference). Only the Sprint remembers
  // a surface, and a host-controlled `surface` prop stays the host's call, so the Board ignores it.
  useEffect(() => {
    if (!isSprint || typeof window === 'undefined') return
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SPRINT_SURFACE_KEY) return
      if (e.newValue === 'graph' || e.newValue === 'table') setOwnSurface(e.newValue)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [isSprint])

  // The graph's commands (I6): one table (`SCENE_BINDINGS`) read by this keydown, the window
  // listener and the help dialog. The figure runs them itself so they work with no host wiring.
  const run = useCallback((command: SceneCommand, from: HTMLElement | null): boolean => {
    const el = root.current
    switch (command) {
      case 'clear': onHover(null); return false
      case 'fit': orbit.goHome(); return true
      case 'nextUp': return el ? focusPlate(el, data.nextUp) : false
      case 'stepNext': return el && from ? movePlateFocus(el, from, 1) : false
      case 'stepPrev': return el && from ? movePlateFocus(el, from, -1) : false
      case 'orbitLeft': orbit.rotate(KEY_STEP, 0); return true
      case 'orbitRight': orbit.rotate(-KEY_STEP, 0); return true
      case 'orbitUp': orbit.rotate(0, -KEY_STEP); return true
      case 'orbitDown': orbit.rotate(0, KEY_STEP); return true
      case 'zoomIn': orbit.zoom(1 / KEY_ZOOM); return true
      case 'zoomOut': orbit.zoom(KEY_ZOOM); return true
    }
  }, [orbit, onHover, data.nextUp])

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
    const command = sceneCommandFor(e)
    if (command === null) return
    // Escape clears the hover and is left for the window's own Escape chain (close a dialog…).
    if (run(command, target)) e.preventDefault()
  }, [run])

  // The palette's two graph rows (I6) read these while a graph is on screen — screen callbacks.
  const effectiveSurface: SceneSurface = model.tableOnly ? 'table' : surface
  const graphShown = data.hasData && effectiveSurface === 'graph'
  useEffect(() => {
    // Only while a graph can actually be on screen: no WebGL means the table, and "Fit the graph"
    // would be a row that does nothing.
    if (!graphShown || !canUseWebGL()) return
    return registerSceneActions({
      fitGraph: () => { run('fit', null) },
      focusNextUp: () => run('nextUp', null),
    })
  }, [graphShown, run])

  if (!data.hasData) return null

  const projectKey = props.projectKey ?? backlogStore.getSnapshot().projectPath ?? 'unknown-project'
  const hostTable = props.table ?? props.children
  const showGaps = props.showGaps ?? props.table !== undefined
  const table = (
    <>
      {hostTable ?? null}
      {model.tableOnly ? <Notice tone="info" role="none" className="mt-2">{model.tableOnly}</Notice> : null}
    </>
  )

  return (
    <div
      ref={root}
      tabIndex={0}
      role="group"
      aria-label="Dependency graph. Shift with the arrow keys orbits; plus and minus zoom."
      aria-keyshortcuts={ORBIT_KEYSHORTCUTS}
      onKeyDown={onKeyDown}
      // A visible ring when the figure itself has focus (I6); the global ring is `--ring`.
      className="rounded-[8px] outline-none focus-visible:[box-shadow:var(--ring)]"
      data-constellation={id}
      {...{ [SCENE_SCOPE_ATTR]: SCENE_SCOPE_VALUE }}
    >
      <span className="sr-only">{SCENE_KEYS_HINT}</span>
      <PlateInteractionProvider value={{ hoverId, onHover, onActivate }}>
        <SceneShell
          id={id}
          title={CONSTELLATION_TITLE}
          summary={summaryFor(data, model)}
          legend={CONSTELLATION_LEGEND}
          surface={effectiveSurface}
          onSurfaceChange={model.tableOnly ? () => {} : onSurfaceChange}
          table={table}
          height={props.height ?? 360}
          className={props.className}
          showToggle={props.showToggle}
          data-testid={props['data-testid'] ?? id}
        >
          <Suspense fallback={null}>
            <LazyScene data={data} model={model} hoverId={hoverId} onHover={onHover} live={live} orbit={orbit} projectKey={projectKey} />
          </Suspense>
        </SceneShell>
      </PlateInteractionProvider>
      {showGaps && data.dependencyGaps.length > 0 ? (
        <Notice tone="warn" className="mt-2" data-testid="constellation-gaps">
          <ul className="m-0 list-none p-0">
            {data.dependencyGaps.map((gap, i) => <li key={i}>{gap}</li>)}
          </ul>
        </Notice>
      ) : null}
    </div>
  )
}

export default DependencyConstellation
