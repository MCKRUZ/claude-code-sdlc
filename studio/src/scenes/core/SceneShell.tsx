// The one component a screen imports to show a scene, and the only place a Canvas is created
// (studio-observatory.md §5.0 `SceneShell`).
//
// Two surfaces of equal rank: the DOM `table` (required — a scene with no DOM equivalent does
// not compile) and the R3F `children`. The graph is shown only when the person chose it, WebGL
// is available, and the host is wide enough; in every other case the table renders alone and
// three.js is never `import()`ed — `./lazyCanvas` is the seam a test spies on to prove it.
//
// Round 2 (I8): a surface change is a CROSSFADE inside the fixed-height body (`sceneCrossfade`,
// outgoing `dur-1`, incoming `dur-2`), table → canvas with the table underneath. The canvas is
// disposed only after its fade (`onOutgoingHidden`) and it holds the single live-canvas slot until
// then, so there is never a second live WebGL canvas; an eviction, a lost context or a crash drop
// it at once instead. `data-surface` is the INTENT and flips synchronously, stub or not.
//
// This file must not statically import three or fiber: it is in the main bundle, and the whole
// point of the lazy boundary below is that the ≈ 800 KB scene chunk loads on first Canvas mount.
import { Suspense, lazy, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { contextFrom } from '../../motion/choreo/_shared'
import { sceneCrossfade } from '../../motion/choreo/sceneCrossfade'
import { motion } from '../../motion/motion'
import { Eyebrow } from '../../ui/Eyebrow'
import { Notice } from '../../ui/Notice'
import { Surface3DToggle } from '../../ui/Surface3DToggle'
import { CanvasActivityContext } from './canvasActivity'
import { claimCanvas, onCanvasReleased } from './canvasRegistry'
import { loadCanvasHost, prefetchCanvasHost } from './lazyCanvas'
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

/** Which layers are in the DOM. Both during a crossfade; one at rest. */
interface Layers {
  canvas: boolean
  table: boolean
}

export function SceneShell(props: SceneShellProps) {
  const { id, title, summary, legend, surface, onSurfaceChange, table, children, height, className, headerExtra, showToggle = true } = props
  const ref = useRef<HTMLElement>(null)
  const canvasLayer = useRef<HTMLDivElement>(null)
  const tableLayer = useRef<HTMLDivElement>(null)
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

  const canDraw = webgl && !narrow && !crashed && !evicted
  const wantsGraph = surface === 'graph' && canDraw
  const showGraph = wantsGraph

  // The layers follow the intent through a crossfade: a canvas joins at once (over the table),
  // leaves after its fade — unless it can no longer draw, when it leaves at once.
  const [layers, setLayers] = useState<Layers>(() => ({ canvas: showGraph, table: !showGraph }))
  useEffect(() => {
    setLayers((prev) => {
      if (showGraph) return prev.canvas ? prev : { canvas: true, table: true }
      if (!prev.canvas) return prev
      return canDraw ? { canvas: true, table: true } : { canvas: false, table: true }
    })
  }, [showGraph, canDraw])

  // The crossfade runs when both layers are in the DOM; it ends by dropping the outgoing one.
  // Under the stub (`MODE=test`, `off`) `onOutgoingHidden` fires synchronously, so a toggle in
  // jsdom lands in one commit and the DOM is never touched.
  const fading = layers.canvas && layers.table
  useLayoutEffect(() => {
    if (!fading) return
    const scope = ref.current
    if (!scope) return
    const ctx = contextFrom(scope, { enabled: motion.enabled(), reduced: motion.reduced() }, motion)
    let alive = true
    const tl = sceneCrossfade.play(ctx, {
      outgoing: showGraph ? tableLayer.current : canvasLayer.current,
      incoming: showGraph ? canvasLayer.current : tableLayer.current,
      onOutgoingHidden: () => { if (alive) setLayers(showGraph ? { canvas: true, table: false } : { canvas: false, table: true }) },
    })
    return () => { alive = false; tl.kill() }
  }, [fading, showGraph])

  // The slot is held for as long as a canvas is MOUNTED — through its fade-out — never two.
  useEffect(() => {
    if (!layers.canvas || evicted) return
    return claimCanvas(() => setEvicted(true))
  }, [layers.canvas, evicted])

  useEffect(() => {
    if (!evicted) return
    return onCanvasReleased(() => setEvicted(false))
  }, [evicted])

  // The honest fallback is said once, where the reader is looking: above the table. The crash
  // notice stays an error tone — a tool failure, not a plugin fact.
  let notice: ReactNode = null
  if (surface === 'graph' && !webgl) {
    notice = <Notice tone="info" role="none" className="mb-2 py-1.5 text-xs">{WEBGL_NOTICE}</Notice>
  } else if (crashed) {
    notice = <Notice tone="error" role="none" className="mb-2 py-1.5 text-xs">{CRASH_NOTICE}</Notice>
  }

  // Alone, the table sits in the flow; under or over a canvas it fills the fixed body (clipped
  // for the length of the fade).
  const tableBody = (
    <div ref={tableLayer} data-scene-surface="table" className={layers.canvas ? 'absolute inset-0 overflow-hidden' : undefined}>
      {notice}
      {table}
    </div>
  )

  const disabledReason = !webgl ? WEBGL_REASON : narrow ? NARROW_REASON : undefined
  // Warm the scene chunk when the pointer reaches the header: the first Graph is then one frame
  // away. Only where a graph could draw at all (no chunk for a window without WebGL).
  const prefetch = useCallback(() => { if (webgl && !narrow) prefetchCanvasHost() }, [webgl, narrow])

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
      <div className="flex items-center justify-between gap-3" onPointerEnter={prefetch}>
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
      {layers.canvas ? (
        // The Canvas wrapper is aria-hidden: the plates (DOM buttons portalled beside the canvas)
        // and the table carry every word, so AT never meets an unlabeled <canvas>.
        <div className="relative min-w-0" style={height !== undefined ? { height } : undefined}>
          {layers.table ? tableBody : null}
          <div ref={canvasLayer} data-scene-surface="graph" className="absolute inset-0">
            <CanvasActivityContext.Provider value={active}>
              <Suspense fallback={layers.table ? null : tableBody}>
                <SceneErrorBoundary fallback={tableBody} onError={onCrash}>
                  <LazyCanvas>{children}</LazyCanvas>
                </SceneErrorBoundary>
              </Suspense>
            </CanvasActivityContext.Provider>
          </div>
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
