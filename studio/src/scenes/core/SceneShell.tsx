// The one component a screen imports to show a scene, and the only place a Canvas is created
// (studio-observatory.md §5.0 `SceneShell`).
//
// Two surfaces of equal rank: the DOM `table` (required — a scene with no DOM equivalent does
// not compile) and the R3F `children`. The graph is shown only when the person chose it, WebGL
// is available, and the host is wide enough; in every other case the table renders alone and
// three.js is never `import()`ed — `./lazyCanvas` is the seam a test spies on to prove it.
//
// This file must not statically import three or fiber: it is in the main bundle, and the whole
// point of the lazy boundary below is that the ≈ 800 KB scene chunk loads on first Canvas mount.
import { Suspense, lazy, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { Eyebrow } from '../../ui/Eyebrow'
import { Notice } from '../../ui/Notice'
import { Surface3DToggle } from '../../ui/Surface3DToggle'
import { CanvasActivityContext } from './canvasActivity'
import { claimCanvas, onCanvasReleased } from './canvasRegistry'
import { loadCanvasHost } from './lazyCanvas'
import { MIN_GRAPH_WIDTH } from './sceneDefaults'
import { SceneErrorBoundary } from './SceneErrorBoundary'
import { useHostWidth, useOnScreen, usePageVisible } from './shellHooks'
import type { SceneShellProps } from './types'
import { canUseWebGL, onWebGLChange } from './webgl'

const LazyCanvas = lazy(loadCanvasHost)

// On the server there is no GL; the client snapshot is the memoised probe.
const noWebGL = () => false

const WEBGL_NOTICE = 'Showing this as a list; hardware graphics are unavailable here.'
const CRASH_NOTICE = 'The graph could not be drawn; showing the list instead.'
const NARROW_REASON = `Widen the window to at least ${MIN_GRAPH_WIDTH} px to show the graph.`
const WEBGL_REASON = 'Graphics are not available in this window.'

export function SceneShell(props: SceneShellProps) {
  const { id, title, summary, legend, surface, onSurfaceChange, table, children, height, className, headerExtra, showToggle = true } = props
  const ref = useRef<HTMLElement>(null)
  const titleId = useId()
  const summaryId = useId()
  const captionId = useId()

  const webgl = useSyncExternalStore(onWebGLChange, canUseWebGL, noWebGL)
  const width = useHostWidth(ref)
  const narrow = width !== null && width < MIN_GRAPH_WIDTH
  // Both hooks run on every render. `useOnScreen(ref) && usePageVisible()` short-circuited the
  // second call whenever the figure was off-screen, so the hook count changed between renders
  // and React threw #311, unmounting the whole window. jsdom never showed it (its inert
  // IntersectionObserver keeps "on screen" constant); the real window did, on the first scroll.
  const onScreen = useOnScreen(ref)
  const pageVisible = usePageVisible()
  const active = onScreen && pageVisible

  // Did another shell take the single live-canvas slot, or did our own Canvas throw? Either
  // way the table takes over; eviction clears itself when the slot is released, a crash does not
  // (re-mounting a renderer that just threw would most likely throw again).
  const [evicted, setEvicted] = useState(false)
  const [crashed, setCrashed] = useState(false)
  const onCrash = useCallback(() => setCrashed(true), [])

  const wantsGraph = surface === 'graph' && webgl && !narrow && !crashed

  useEffect(() => {
    if (!wantsGraph || evicted) return
    return claimCanvas(() => setEvicted(true))
  }, [wantsGraph, evicted])

  useEffect(() => {
    if (!evicted) return
    return onCanvasReleased(() => setEvicted(false))
  }, [evicted])

  const showGraph = wantsGraph && !evicted

  // The honest fallback is said once, where the reader is looking: above the table. The crash
  // notice stays an error tone — a tool failure, not a plugin fact.
  let notice: ReactNode = null
  if (surface === 'graph' && !webgl) {
    notice = <Notice tone="info" role="none" className="mb-2 py-1.5 text-xs">{WEBGL_NOTICE}</Notice>
  } else if (crashed) {
    notice = <Notice tone="error" role="none" className="mb-2 py-1.5 text-xs">{CRASH_NOTICE}</Notice>
  }

  const tableBody = (
    <div data-scene-surface="table">
      {notice}
      {table}
    </div>
  )

  const disabledReason = !webgl ? WEBGL_REASON : narrow ? NARROW_REASON : undefined

  return (
    <figure
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={`${summaryId} ${captionId}`}
      data-scene={id}
      data-surface={showGraph ? 'graph' : 'table'}
      data-testid={props['data-testid']}
      className={['m-0 flex min-w-0 flex-col', className].filter(Boolean).join(' ')}
    >
      <div className="flex items-center justify-between gap-3">
        <Eyebrow id={titleId}>{title}</Eyebrow>
        <div className="flex items-center gap-1.5">
          {showToggle ? (
            <Surface3DToggle
              value={surface}
              onChange={onSurfaceChange}
              disabled={disabledReason !== undefined}
              disabledReason={disabledReason}
            />
          ) : null}
          {headerExtra}
        </div>
      </div>
      <p id={summaryId} className="sr-only">{summary}</p>
      {showGraph ? (
        // The Canvas wrapper is aria-hidden: the plates (DOM buttons portalled beside the canvas)
        // and the table carry every word, so AT never meets an unlabeled <canvas>.
        <div className="relative min-w-0" style={height !== undefined ? { height } : undefined}>
          <CanvasActivityContext.Provider value={active}>
            <Suspense fallback={tableBody}>
              <SceneErrorBoundary fallback={tableBody} onError={onCrash}>
                <LazyCanvas>{children}</LazyCanvas>
              </SceneErrorBoundary>
            </Suspense>
          </CanvasActivityContext.Provider>
        </div>
      ) : (
        tableBody
      )}
      {/* A narrow host says why the graph is not drawn in the caption too, not only in the
          disabled toggle's tooltip. */}
      <figcaption id={captionId} className="mt-2 text-xs text-ink-3">{narrow ? `${legend} ${NARROW_REASON}` : legend}</figcaption>
    </figure>
  )
}
