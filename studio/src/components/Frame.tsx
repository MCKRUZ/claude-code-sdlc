import { memo, type CSSProperties, type MutableRefObject, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConsoleEntry, ProjectStatus, SyncState } from '../../shared/types'
import type { Area, DocProgress, NavTarget } from '../../shared/nav'
import { Sidebar } from './Sidebar'
import { ChatPanel } from './ChatPanel'
import { Console, readStoredConsoleHeight } from './Console'
import { ShortcutsHelp } from './ShortcutsHelp'
import { readSurfaceDefault } from './AppearanceSection'
import { consoleToggle, frameAssemble } from '../motion/choreo'
import { motion } from '../motion/motion'
import { useStudioGSAP } from '../motion/useStudioGSAP'
import { choreoContext } from './entryScreenBits'
import { CHAT_DEFAULT_WIDTH, readStoredChatWidth } from '../chatWidth'
import { StageReadinessProvider, useStageReadiness } from './StageReadinessContext'
import { consoleStore, useConsoleEntries, useConsoleOpen } from '../stores/consoleStore'
import { useBacklogStore } from '../stores/backlogStore'
import { stageTabStore } from '../stores/stageTabStore'
import { SkipLink } from '../ui/VisuallyHidden'
import { ToastRegion } from '../ui/ToastRegion'
import { toast } from '../ui/toastStore'
import { LiveAnnouncer } from '../a11y/LiveAnnouncer'
import { CommandPalette } from '../palette/CommandPalette'
import { toggleSurfacePreference } from '../palette/paletteActions'
import { usePaletteIndex, usePreferenceActionHooks } from '../palette/usePaletteIndex'
import type { PaletteActionHooks, SettingsAnchor } from '../palette/types'
import { useShortcuts } from '../shortcuts/useShortcuts'
import { useSceneActions } from '../scenes/core/sceneActions'
import { joinSpineAssemble } from '../scenes/spine/spineCeremony'

/** What App knows and Frame does not: where a spec, a document or a Settings section opens, what
 * "back" means on the current screen, and which screen is showing. Every field is optional so a
 * test (frame.memo.test) can mount Frame without it; an absent hook means the palette row for it
 * is absent, never inert. App memoises the object. */
export interface FrameShellHooks {
  /** Open a spec by its repo-relative path (what the Board and the palette's "#" rows carry). */
  openSpec?: (relPath: string) => void
  /** Open a document, with the stage its readiness belongs to so the sidebar lights that stage. */
  openDocument?: (relPath: string, stageId: string | undefined) => void
  /** Go to Settings and scroll to a section once it has mounted. */
  openSettings?: (anchor: SettingsAnchor) => void
  /** The screen's own Back, when there is something behind it. */
  back?: () => void
  /** True while StageHome is the screen: enables the Spine toggle and the readiness refresh. */
  stageHomeShowing?: boolean
  /** True while the Sprint view (with its constellation) is the screen. */
  sprintShowing?: boolean
  /** A screen's own P-class refresh, where App has one; never openProject or pull. */
  refreshScreen?: () => void
}

/** The frame every screen shares once a project is open: the sidebar (the only navigation, which
 * also carries the project's name and the sync indicator), the chat panel, and the console —
 * spec 0008's own scope, in one place so nothing built on top of it can accidentally omit a
 * piece of it. Spec 0009's sync indicator sits in the sidebar's footer, so it is on every one of
 * those screens without each having to remember.
 *
 * Spec 0019: Frame is the common ancestor of both `StageHome` (rendered as its `children`) and
 * `ChatPanel` (its direct sibling) — see `studio/src/App.tsx` — so it wraps them in
 * `StageReadinessProvider` (see that file for why the single shared fetch exists). `FrameBody` is
 * split out only because a value a `Context.Provider` holds can be read by a descendant, never by
 * the component that renders the provider itself.
 *
 * Observatory (§7 Frame row): the Wave 0 pieces mount here once — skip link, live region, toasts,
 * palette + shortcuts — and the two heavy siblings get a `React.memo` boundary. Console entries no
 * longer travel through props: they live in `consoleStore` and only the Console panel subscribes,
 * so an entry every 2 s (Workflow tab) or 150 ms (streaming) re-renders that panel alone. */
export function Frame({
  status,
  projectPath,
  consoleEntries,
  syncState,
  area,
  viewedStageId,
  actor,
  onNavigate,
  shell,
  children,
}: {
  status: ProjectStatus
  projectPath: string
  /** Optional, for a test that mounts Frame with a fixed list; the app leaves it unset and the
   * Console reads `consoleStore`. */
  consoleEntries?: ConsoleEntry[]
  syncState: SyncState
  area: Area
  /** The stage whose documents were picked, or undefined for the project's current stage. */
  viewedStageId?: string
  /** Who is using Studio — spec 0016's chat needs this to attribute an accepted or discarded
   * proposal through the SAME draft ledger a structured-editor draft already uses. */
  actor: string
  onNavigate: (target: NavTarget) => void
  shell?: FrameShellHooks
  children: ReactNode
}) {
  // Computed ONCE here and handed down, rather than each of Frame and FrameBody re-deriving its
  // own `.find()` over the same stage list for the same answer.
  const currentStageId = status.stages.find((s) => s.stage_state === 'current')?.id
  // The ONE resolved stage every consumer below needs — the picked stage, or the project's own
  // current one, the same default stage_readiness.py itself uses when called with no --phase.
  const stageId = viewedStageId ?? currentStageId

  return (
    <StageReadinessProvider projectPath={projectPath} stageId={stageId}>
      <FrameBody
        status={status}
        projectPath={projectPath}
        consoleEntries={consoleEntries}
        syncState={syncState}
        area={area}
        viewedStageId={viewedStageId}
        stageId={stageId}
        currentStageId={currentStageId}
        actor={actor}
        onNavigate={onNavigate}
        shell={shell}
      >
        {children}
      </FrameBody>
    </StageReadinessProvider>
  )
}

/** Memo boundaries live here, not in Sidebar.tsx / ChatPanel.tsx, so those files and their
 * `renderToStaticMarkup` tests are untouched. `onNavigate` is a `useCallback` in App and
 * `onToggleConsole` a module function, so nothing happening in FrameBody reaches them. */
const MemoSidebar = memo(Sidebar)
const MemoChatPanel = memo(ChatPanel)

const EMPTY_SHELL: FrameShellHooks = {}

function FrameBody({
  status,
  projectPath,
  consoleEntries,
  syncState,
  area,
  viewedStageId,
  stageId,
  currentStageId,
  actor,
  onNavigate,
  shell = EMPTY_SHELL,
  children,
}: {
  status: ProjectStatus
  projectPath: string
  consoleEntries?: ConsoleEntry[]
  syncState: SyncState
  area: Area
  viewedStageId?: string
  stageId: string | undefined
  currentStageId: string | undefined
  actor: string
  onNavigate: (target: NavTarget) => void
  shell?: FrameShellHooks
  children: ReactNode
}) {
  // Open/closed is store state so the palette's "Toggle console" and ⌘J flip the same flag the
  // sidebar button does; the sidebar's button needs the flag, the dock below subscribes on its own.
  const consoleOpen = useConsoleOpen()
  const { readiness } = useStageReadiness()
  // ⌘\ hides the chat without unmounting it: the aside keeps its place in DOM order (the a11y
  // pins count two asides, sidebar then chat) and its composer keeps whatever was typed.
  const [chatHidden, setChatHidden] = useState(false)
  const toggleChat = useCallback(() => setChatHidden((h) => !h), [])
  // The palette's open flag lives in ShellPalette so opening it re-renders that component alone;
  // the sidebar's Search button reaches it through this ref, which ShellPalette fills on mount.
  const openPaletteRef = useRef<(() => void) | null>(null)
  const onOpenPalette = useCallback(() => openPaletteRef.current?.(), [])
  // Sidebar's doc-count line is always about the ACTUAL current stage (it only renders under the
  // row whose stage_state is 'current' — see Sidebar.tsx; spec 0019 kept that). The shared fetch
  // is for the VIEWED stage, which is the current one unless a stage was picked — then this line
  // reads that same fetch. When the two differ, `stage_readiness.py` answers for one stage per
  // call, so `useOtherCurrentStageDocs` runs its own small fetch for just that case rather than
  // falling back to "In progress" (reserved for before data has arrived at all).
  const viewedComplete = readiness?.ok && readiness.stageId === currentStageId
    ? readiness.documents.filter((d) => d.ready).length
    : null
  const viewedTotal = readiness?.ok && readiness.stageId === currentStageId ? readiness.documents.length : null
  // Memoised on the two numbers — a fresh object per render would defeat MemoSidebar for nothing.
  const viewedStageDocs = useMemo<DocProgress | null>(
    () => (viewedComplete !== null && viewedTotal !== null ? { complete: viewedComplete, total: viewedTotal } : null),
    [viewedComplete, viewedTotal],
  )
  const otherCurrentDocs = useOtherCurrentStageDocs(projectPath, currentStageId, stageId)
  const currentDocs = viewedStageDocs ?? otherCurrentDocs

  // The Frame root carries `--chat-width` / `--console-height` and `data-chat-hidden` (the
  // round-2 shell contract, read by screens that lay out beside the chat or above the console).
  // Both numbers live in the panels that own them; they REPORT here through stable callbacks and
  // the root's inline style is written imperatively, so a drag never re-renders FrameBody and
  // the memoised siblings keep their props. The refs make React's view of `style` match the DOM.
  const rootRef = useRef<HTMLDivElement>(null)
  const chatWidthRef = useRef<number>(readStoredChatWidth() ?? CHAT_DEFAULT_WIDTH)
  const consoleHeightRef = useRef<number>(consoleOpen ? readStoredConsoleHeight() : 0)
  const onChatWidth = useCallback((px: number) => {
    chatWidthRef.current = px
    rootRef.current?.style.setProperty('--chat-width', `${px}px`)
  }, [])
  const onConsoleHeight = useCallback((px: number) => {
    consoleHeightRef.current = px
    rootRef.current?.style.setProperty('--console-height', `${px}px`)
  }, [])
  const rootStyle = {
    '--chat-width': `${chatWidthRef.current}px`,
    '--console-height': `${consoleHeightRef.current}px`,
  } as CSSProperties

  useFrameAssemble(rootRef, projectPath)
  usePrefetchCanvasHost(projectPath)

  return (
    <div ref={rootRef} data-frame-root="" data-chat-hidden={chatHidden ? '' : undefined} style={rootStyle} className="flex h-screen flex-col bg-slate-50">
      <SkipLink />
      <LiveAnnouncer />
      {/* Column below sm, row at sm+ — spec 0018's document panel and chat need to stack at
          phone width, and Sidebar/main/ChatPanel are unconditional row siblings here rather
          than inside WorkflowTab, so the wrap has to happen at this level. */}
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <MemoSidebar
          status={status}
          area={area}
          viewedStageId={viewedStageId}
          currentDocs={currentDocs}
          syncState={syncState}
          consoleOpen={consoleOpen}
          onToggleConsole={consoleStore.toggle}
          onNavigate={onNavigate}
          onOpenPalette={onOpenPalette}
        />
        {/* `id="main"` is the skip link's target; `tabIndex={-1}` takes programmatic focus without
            joining the tab order. Children render directly — no wrapper (§7 Frame row [MF]). */}
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 overflow-auto p-6">{children}</main>
        <MemoChatPanel status={status} projectPath={projectPath} actor={actor} stageId={stageId ?? null} hidden={chatHidden} onWidthChange={onChatWidth} />
      </div>
      <ConsoleDock entries={consoleEntries} onHeightReport={onConsoleHeight} />
      <ToastRegion />
      <ShellPalette
        status={status}
        projectPath={projectPath}
        currentStageId={currentStageId}
        viewedStageId={stageId}
        area={area}
        onNavigate={onNavigate}
        toggleChat={toggleChat}
        shell={shell}
        openRef={openPaletteRef}
      />
    </div>
  )
}

/** The console's dock: Frame owns the element whose height the preference and choreography #20
 * move, so it owns the height too. The stored `studio.consoleHeight` is the first paint's inline
 * height (the `h-64` class stays as the resting truth, pinned by frame.memo.test); the separator
 * inside Console reports a new height through a prop. Open plays the grow half on mount; close
 * keeps the dock mounted for the shrink half and unmounts when the timeline ends — synchronously
 * under the stub, so with motion off (every test) the dock is gone on the same tick. */
function ConsoleDock({ entries, onHeightReport }: { entries?: ConsoleEntry[]; onHeightReport?: (px: number) => void }) {
  const open = useConsoleOpen()
  const [rendered, setRendered] = useState(open)
  const [height, setHeight] = useState(readStoredConsoleHeight)
  const heightRef = useRef(height)
  heightRef.current = height
  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => { if (open) setRendered(true) }, [open])
  // The Frame root's `--console-height`: the dock's height while it is on screen, 0 once gone.
  useEffect(() => {
    onHeightReport?.(rendered ? height : 0)
  }, [onHeightReport, rendered, height])

  useStudioGSAP(() => {
    const el = wrapper.current
    if (!el || !rendered) return
    const tl = consoleToggle.play(choreoContext(el), { wrapper: el, direction: open ? 'open' : 'close' })
    // The open tween ends with `clearProps: 'height'`, which also drops React's inline height;
    // put the preference back once the resting height has landed. The close tween ends with the
    // dock gone — unmounting is what releases the layout, not a zero height left in place.
    tl.add(open ? () => { el.style.height = `${heightRef.current}px` } : () => setRendered(false))
  }, { scope: wrapper, dependencies: [open, rendered] })

  if (!rendered) return null
  return (
    <div ref={wrapper} className="h-64 shrink-0 border-t border-slate-200 bg-white" style={{ height }}>
      <ConsolePanel entries={entries} height={height} onHeightChange={setHeight} />
    </div>
  )
}

/** The one subscriber to the console's entries. A test-supplied prop wins over the store so the
 * two jsdom tests that mount Frame with `consoleEntries={[]}` see exactly what they passed. */
function ConsolePanel({ entries, height, onHeightChange }: {
  entries?: ConsoleEntry[]
  height: number
  onHeightChange: (height: number) => void
}) {
  const stored = useConsoleEntries()
  return <Console entries={entries ?? (stored as ConsoleEntry[])} height={height} onHeightChange={onHeightChange} />
}

/** The clipboard is the renderer's own; a failure (no permission, no clipboard in a test) is a
 * toast saying so, never a silent nothing. */
function copyProjectPath(projectPath: string): void {
  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
  if (!clipboard?.writeText) {
    toast({ tone: 'error', title: 'Could not reach the clipboard' })
    return
  }
  clipboard.writeText(projectPath)
    .then(() => toast({ tone: 'ok', title: 'Project path copied' }))
    .catch(() => toast({ tone: 'error', title: 'Could not copy the project path' }))
}

/** Palette + shortcuts help + the shell's shortcuts, isolated so opening either re-renders this
 * component and nothing above it. The index is built from what Frame already holds; nothing
 * here calls the bridge. */
function ShellPalette({ status, projectPath, currentStageId, viewedStageId, area, onNavigate, toggleChat, shell, openRef }: {
  status: ProjectStatus
  projectPath: string
  currentStageId: string | undefined
  viewedStageId: string | undefined
  area: Area
  onNavigate: (target: NavTarget) => void
  toggleChat: () => void
  shell: FrameShellHooks
  openRef: MutableRefObject<(() => void) | null>
}) {
  const [open, setOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const { readiness, refresh } = useStageReadiness()
  // Subscribe, do not just reference: `buildIndex` copies rows/slate at build time, so a host
  // memoised on the store OBJECT froze the "#" specs group at whatever the Board had fetched when
  // some other host field last changed — "Open the Board once to index specs" with 40 rows on
  // screen. The snapshot changes identity on every `setRows`/`setSlate`, so the index follows.
  const backlog = useBacklogStore()
  const prefs = usePreferenceActionHooks()
  // I6: the mounted graph's own two commands (fit, focus next up), or null while no graph is on
  // screen — plain callbacks from `sceneActions`, zero IPC; the rows appear and vanish with it.
  const scene = useSceneActions()
  const openPalette = useCallback(() => { setHelpOpen(false); setOpen(true) }, [])
  const closePalette = useCallback(() => setOpen(false), [])
  // The help closes the palette first: two dialogs stacked would both claim Esc and the focus trap.
  const openShortcuts = useCallback(() => { setOpen(false); setHelpOpen(true) }, [])
  const closeShortcuts = useCallback(() => setHelpOpen(false), [])
  useEffect(() => {
    openRef.current = openPalette
    return () => { openRef.current = null }
  }, [openRef, openPalette])

  const { openSpec, openDocument, openSettings, back, stageHomeShowing, sprintShowing, refreshScreen } = shell
  const readinessStageId = readiness?.ok ? readiness.stageId : undefined
  const actions = useMemo<PaletteActionHooks>(() => ({
    ...prefs.hooks,
    toggleConsole: consoleStore.toggle,
    toggleChat,
    // Only while the thing the row names is on screen: the Spine band is StageHome's, the two
    // scenes with a Graph / Table choice are the Spine and the Sprint constellation.
    toggleSpine: stageHomeShowing ? stageTabStore.toggleSpineCollapsed : undefined,
    toggleSurface: stageHomeShowing ? () => toggleSurfacePreference('spine') : sprintShowing ? () => toggleSurfacePreference('sprint') : undefined,
    // StageHome's refresh is the shared readiness read Frame already owns; other screens pass
    // their own through App, or the row is absent.
    refreshScreen: stageHomeShowing ? () => { void refresh() } : refreshScreen,
    fitGraph: scene?.fitGraph,
    focusNextUp: scene ? () => { scene.focusNextUp() } : undefined,
    copyProjectPath: () => copyProjectPath(projectPath),
    openShortcuts,
    back,
  }), [prefs.hooks, toggleChat, stageHomeShowing, sprintShowing, refresh, refreshScreen, scene, projectPath, openShortcuts, back])

  const host = useMemo(() => ({
    stages: status.stages,
    currentStageId: currentStageId ?? null,
    viewedStageId: viewedStageId ?? null,
    readiness,
    backlog,
    actions,
    recentIds: [],
    area,
    navigate: onNavigate,
    // App's openers land ON the item; the area is the honest fallback when App passed none.
    openSpec: openSpec ?? (() => onNavigate({ area: 'build' })),
    openDocument: openDocument
      ? (path: string) => openDocument(path, readinessStageId ?? viewedStageId)
      : () => onNavigate({ area: 'documents', stageId: viewedStageId }),
    openSettings: openSettings ?? (() => onNavigate({ area: 'settings' })),
  }), [status.stages, currentStageId, viewedStageId, readiness, readinessStageId, backlog, actions, area, onNavigate, openSpec, openDocument, openSettings])
  const { entries, recentIds, remember } = usePaletteIndex(host)
  // The shell's own bindings; a screen adds its scope (stageHome, documentView, board) with its
  // own `useShortcuts` call. Esc's outermost layers here are the two dialogs this component owns.
  useShortcuts({
    handlers: {
      openPalette,
      openShortcuts,
      toggleConsole: consoleStore.toggle,
      toggleChat,
      cycleTheme: prefs.cycleTheme,
      toggleMotion: prefs.toggleMotion,
      toggleDensity: prefs.toggleDensity,
      openSettings: () => onNavigate({ area: 'settings' }),
      goStage: (stageId) => { if (status.stages.some((s) => s.id === stageId)) onNavigate({ area: 'documents', stageId }) },
    },
    scopes: ['project'],
    escLayers: [
      () => { if (!open) return false; setOpen(false); return true },
      () => { if (!helpOpen) return false; setHelpOpen(false); return true },
    ],
  })
  return (
    <>
      <CommandPalette open={open} onClose={closePalette} entries={entries} recentIds={recentIds} onRun={(e) => remember(e.id)} />
      <ShortcutsHelp open={helpOpen} onClose={closeShortcuts} />
    </>
  )
}

/** M2 / M3: the shell opens as one thing. Played ONCE per `projectPath` from the Frame root the
 * moment it mounts (the overlay unmounted in the same commit — App sets the screen and clears
 * the opening together), never again on a `refreshStatus` re-render: `frameAssemble.playOnce`
 * keys on the path and this effect only re-runs when the path changes. Each mount is one OPEN of
 * the project: the familiarity counter is bumped first and the tier read second, so opens 1–3
 * play in full, 4–10 at `dur-4`, and past ten nothing plays. Only inner content is handed over —
 * the sidebar's header, its stage rows, `<main>`'s first child and the chat's inner wrapper —
 * never an `<aside>` or `<main>` itself (§4 invariants). P4's Spine joins through
 * `frameAssemble.join`. Under the stub (test mode, off) nothing moves and nothing is written. */
function useFrameAssemble(rootRef: MutableRefObject<HTMLDivElement | null>, projectPath: string) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    motion.recordOpen(projectPath)
    const tier = motion.familiarity(projectPath)
    // M2: a mounted Spine adds its rail draw and station pops INSIDE this assemble at the join
    // point; with no scene mounted yet (the canvas is lazy) `joinSpineAssemble` is a no-op and
    // the Spine plays its own draw when it arrives. Joiners run only under a real timeline.
    const unjoin = frameAssemble.join((_ctx, tl) => { joinSpineAssemble(tl as unknown as gsap.core.Timeline) })
    const tl = frameAssemble.playOnce(projectPath, choreoContext(root), {
      sidebarHeader: root.querySelector('[data-sidebar-header]'),
      stageRows: Array.from(root.querySelectorAll('nav[aria-label="Project"] ol > li')),
      screenRoot: root.querySelector('main#main > :first-child'),
      chatInner: root.querySelector('[data-chat-inner]'),
      tier,
    })
    return () => {
      unjoin()
      tl?.kill()
      frameAssemble.forget(projectPath)
    }
  }, [rootRef, projectPath])
}

/** I8 (host half): warm the scene chunk while the window is idle, so the first Graph surface
 * does not pay the import on click. Only when it is likely to be wanted — not in a test build,
 * not when the Spine band is collapsed, and only when the stored default surface is `graph`. The
 * import is of P4's `lazyCanvas` module and tolerates a build where `prefetchCanvasHost` has not
 * landed yet (it is read as optional). */
function usePrefetchCanvasHost(projectPath: string) {
  useEffect(() => {
    if (import.meta.env.MODE === 'test') return
    if (stageTabStore.spineCollapsed || readSurfaceDefault() !== 'graph') return
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void) => number
      cancelIdleCallback?: (id: number) => void
    }
    let cancelled = false
    const run = () => {
      if (cancelled) return
      void import('../scenes/core/lazyCanvas').then((m) => {
        if (cancelled) return
        ;(m as { prefetchCanvasHost?: () => unknown }).prefetchCanvasHost?.()
      }).catch(() => { /* the chunk arrives on first use instead */ })
    }
    const idle = typeof w.requestIdleCallback === 'function' ? w.requestIdleCallback(run) : null
    const timer = idle === null ? setTimeout(run, 400) : null
    return () => {
      cancelled = true
      if (idle !== null && typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(idle)
      if (timer !== null) clearTimeout(timer)
    }
  }, [projectPath])
}

/** The sidebar's current-stage doc-count line for the one case the shared fetch cannot cover: the
 * viewed stage is not the current one. Runs its own `getStageReadiness` for `currentStageId` only
 * while that holds (the pre-spec-0019 `useCurrentStageDocs` shape, narrowed to this gap). Null
 * while unknown or on failure, so the sidebar shows its documented "In progress" placeholder. */
function useOtherCurrentStageDocs(
  projectPath: string, currentStageId: string | undefined, viewedStageId: string | undefined,
): DocProgress | null {
  const [docs, setDocs] = useState<DocProgress | null>(null)
  const needsOwnFetch = currentStageId !== undefined && currentStageId !== viewedStageId

  useEffect(() => {
    if (!needsOwnFetch) return
    let cancelled = false
    window.studio.getStageReadiness(projectPath, currentStageId)
      .then((r) => {
        if (cancelled || !r.ok) return
        setDocs({ complete: r.documents.filter((d) => d.ready).length, total: r.documents.length })
      })
      .catch(() => { /* the sidebar simply keeps saying "In progress" */ })
    return () => { cancelled = true }
  }, [projectPath, currentStageId, needsOwnFetch])

  return needsOwnFetch ? docs : null
}
