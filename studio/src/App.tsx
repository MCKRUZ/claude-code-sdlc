import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BoardRow, ClashChoice, DocumentFocus, FileClash, ProjectStatus, RecentProject, Settings, SyncState, ToolingReport } from '../shared/types'
import type { Area, NavTarget } from '../shared/nav'
import { BUILD_STAGE_ID, targetForBuildView, targetForStage } from '../shared/nav'
import { slateToBoardRow } from '../shared/sprintModel'
import { consoleStore } from './stores/consoleStore'
import { dirtyStore } from './stores/dirtyStore'
import { backlogStore } from './stores/backlogStore'
import { stageTabStore } from './stores/stageTabStore'
import { connectionStore, useConnection } from './stores/connectionStore'
import { Notice, ToastRegion, dismiss, toast } from './ui'
import { motion } from './motion/motion'
import { ProjectKeyProvider } from './motion/projectKey'
import { valueMemory } from './motion/valueMemory'
import { useFocusOnNavigate } from './a11y/focusOnNavigate'
import { announce } from './a11y/LiveAnnouncer'
import { useShortcuts } from './shortcuts/useShortcuts'
import { CommandPalette } from './palette/CommandPalette'
import { usePaletteIndex, usePreferenceActionHooks } from './palette/usePaletteIndex'
import type { SettingsAnchor } from './palette/types'
import { SceneSlot } from './scenes/core/SceneSlot'
import { AMBIENT_ENABLED } from './scenes/core/sceneDefaults'
import { ToolingIssues, REQUIRED_TOOLS } from './components/ToolingIssues'
import { CodeHostNotice } from './components/CodeHostNotice'
import { ClaudeIssueContext } from './components/ClaudeIssueContext'
import { claudeLacksMessage } from '../shared/claudeContract'
import { NewProjectScreen } from './components/NewProjectScreen'
import { WelcomeScreen } from './components/WelcomeScreen'
import { SetupFlow } from './components/SetupFlow'
import { Frame, type FrameShellHooks } from './components/Frame'
import { ShortcutsHelp } from './components/ShortcutsHelp'
import { StageHome } from './components/StageHome'
import { DocumentView } from './components/DocumentView'
import { BuildBoard } from './components/BuildBoard'
import { SprintScreen } from './components/SprintBoard'
import { SpecStatusView } from './components/SpecStatusView'
import { OpeningOverlay } from './components/OpeningOverlay'

// The rarely visited screens load on first use (studio-observatory.md §9): each is its own chunk,
// so the main chunk a cold start parses stays under its budget. Named exports → `default` shim.
const ClashScreen = lazy(() => import('./components/ClashScreen').then((m) => ({ default: m.ClashScreen })))
const HistoryPanel = lazy(() => import('./components/HistoryPanel').then((m) => ({ default: m.HistoryPanel })))
const HandoffDialog = lazy(() => import('./components/HandoffDialog').then((m) => ({ default: m.HandoffDialog })))
const SettingsScreen = lazy(() => import('./components/SettingsScreen').then((m) => ({ default: m.SettingsScreen })))
const ExplainViews = lazy(() => import('./components/ExplainViews').then((m) => ({ default: m.ExplainViews })))
const FeatureCompleteScreen = lazy(() => import('./components/FeatureCompleteScreen').then((m) => ({ default: m.FeatureCompleteScreen })))

/** What a lazy screen shows for the few ms its chunk takes: a bare paragraph, no wrapper — so
 * `main.firstElementChild` is still a screen-shaped root (workflow.spec:191) and nothing styled
 * flashes. Distinct from the app's "Loading…", which every e2e waits on. */
const OPENING = <p className="text-sm text-ink-4">Opening…</p>

type Screen =
  | { kind: 'loading' }
  | { kind: 'toolingIssues'; report: ToolingReport }
  | { kind: 'welcome' }
  | { kind: 'newProject' }
  | { kind: 'settingUp'; projectPath: string }
  | { kind: 'project'; status: ProjectStatus; projectPath: string }

/** A project being opened — or any other blocking, plugin-backed action, such as signing off a
 * phase — what to call it on screen, and when it started, for the clock. `title`/`subtitle` are
 * only needed for the non-opening case; omitted, the overlay uses its own opening-a-project text. */
interface Opening {
  projectName: string
  startedAt: number
  title?: string
  subtitle?: string
}

/** The last folder name of a path, for "Opening token-tracker…". */
function projectName(projectPath: string): string {
  return projectPath.split(/[\/]/).filter(Boolean).pop() ?? projectPath
}

// --- Esc's dirty guard (studio-observatory.md §6.2 Esc row [MF]) ---------------------------------
// The registry itself lives in `stores/dirtyStore.ts`; FieldEditor, HandoffDialog, ChatPanel and
// ClashScreen register there while they hold unsaved work, and `useShortcuts` below asks it.

/** Fallback for a screen that has not registered yet: a text control inside `<main>` that has
 * focus AND text in it is being edited by definition. Narrow on purpose — the chat composer is
 * in an `<aside>`, and a search box empties the moment its filter is cleared. */
function focusedMainFieldHasText(): boolean {
  if (typeof document === 'undefined') return false
  const el = document.activeElement
  if (!(el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement)) return false
  if (!el.closest('main')) return false
  return el.value.trim().length > 0
}

/** Anything open ABOVE the screen owns Esc: the palette and `Dialog`s (portalled to `#overlays`),
 * a hover card, the OpeningOverlay. Each already closes itself on Esc, so this layer only has to
 * recognise them and step aside — it reports "something is being edited" so `handleEscape` does
 * nothing and the event reaches their own listeners untouched. */
const ESC_OWNER_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="tooltip"]'

function escOwnedAbove(): boolean {
  return typeof document !== 'undefined' && document.querySelector(ESC_OWNER_SELECTOR) !== null
}

/** Frame's `useShortcuts` (the palette's) and this one share `window`, and a two-key sequence
 * only works when ONE listener sees both keys: the first to read `g` claims it with
 * `preventDefault`, and the other then ignores the whole chord. Frame has no handlers for the
 * `g` sequences, `[` `]` or back, so App must be the one that reads them — and it mounts AFTER
 * Frame's child effect. Listening in the capture phase puts it first regardless of mount order.
 * Keys App has no handler for fall through to Frame unchanged (no `preventDefault`). */
const CAPTURE_TARGET: Pick<Window, 'addEventListener' | 'removeEventListener'> | null =
  typeof window === 'undefined'
    ? null
    : {
        addEventListener: ((type: string, listener: EventListenerOrEventListenerObject) =>
          window.addEventListener(type, listener, true)) as Window['addEventListener'],
        removeEventListener: ((type: string, listener: EventListenerOrEventListenerObject) =>
          window.removeEventListener(type, listener, true)) as Window['removeEventListener'],
      }

/** The chat composer is the one element outside `<main>` a shortcut focuses. ChatPanel is
 * Frame's; reaching it by its pinned testid keeps App off its props. */
function focusChatComposer(): void {
  document.querySelector<HTMLElement>('[data-testid="chat-composer-input"]')?.focus()
}

/** What the live region says after a navigation (§6.3): the screen's own name, never a count. */
function navigationAnnouncement(args: {
  area: Area
  stages: ProjectStatus['stages']
  stageId: string | undefined
  openDoc: string | null
  showHistory: boolean
  openSpec: BoardRow | null
  handingOff: boolean
}): string {
  const { area, stages, stageId, openDoc, showHistory, openSpec, handingOff } = args
  if (area === 'documents') {
    if (openDoc) {
      const name = openDoc.split(/[\/]/).filter(Boolean).pop() ?? openDoc
      return showHistory ? `History of ${name}` : name
    }
    return stages.find((s) => s.id === stageId)?.display ?? 'Stage'
  }
  if (area === 'build' || area === 'sprint') {
    if (openSpec && handingOff) return `Hand off spec ${openSpec.spec}`
    if (openSpec) return `Spec ${openSpec.spec}`
    return area === 'build' ? 'Board' : 'Sprint'
  }
  if (area === 'explain') return 'How it is going'
  if (area === 'closing') return 'Closing'
  return 'Settings'
}

/** Scroll a Settings section into view once it exists. The Settings chunk is lazy and its sections
 * render after the settings read lands, so the element is not there when the palette row runs;
 * poll briefly rather than guess a delay. The first attempt waits past `useFocusOnNavigate`'s
 * heading focus (260 ms with motion on), which would otherwise scroll back to the top after this
 * had scrolled down. Returns a cancel for a navigation that supersedes the jump. */
function scrollToAnchorWhenMounted(anchor: string): () => void {
  const FIRST_MS = 300
  const EVERY_MS = 100
  const GIVE_UP_MS = 4000
  let cancelled = false
  const startedAt = Date.now()
  const attempt = () => {
    if (cancelled) return
    const el = document.getElementById(anchor)
    if (el) {
      el.scrollIntoView({ block: 'start' })
      // The section's own heading takes focus so a screen reader lands where the eye did.
      const heading = document.getElementById(`${anchor}-title`) ?? el
      if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1
      heading.focus({ preventScroll: true })
      return
    }
    if (Date.now() - startedAt < GIVE_UP_MS) setTimeout(attempt, EVERY_MS)
  }
  const timer = setTimeout(attempt, FIRST_MS)
  return () => { cancelled = true; clearTimeout(timer) }
}

/** The palette, the shortcuts help and the global shortcuts for the screens before a project is
 * open. The index has no stages, so only the actions group exists: preferences, the help, and —
 * on the Welcome screen — New project… / Open folder…, which are the two things that screen does. */
function PreProjectShell({ newProject, openFolder }: { newProject?: () => void; openFolder?: () => void }) {
  const [open, setOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const prefs = usePreferenceActionHooks()
  const openPalette = useCallback(() => { setHelpOpen(false); setOpen(true) }, [])
  const closePalette = useCallback(() => setOpen(false), [])
  const openShortcuts = useCallback(() => { setOpen(false); setHelpOpen(true) }, [])
  const closeShortcuts = useCallback(() => setHelpOpen(false), [])
  const host = useMemo(() => ({
    stages: [],
    currentStageId: null,
    viewedStageId: null,
    readiness: null,
    backlog: { rows: [], slate: [] },
    actions: { ...prefs.hooks, openShortcuts, newProject, openFolder },
    recentIds: [],
    area: null,
    navigate: () => {},
    openSpec: () => {},
    openDocument: () => {},
    openSettings: () => {},
  }), [prefs.hooks, openShortcuts, newProject, openFolder])
  const { entries, recentIds, remember } = usePaletteIndex(host)
  useShortcuts({
    handlers: { openPalette, openShortcuts, cycleTheme: prefs.cycleTheme, toggleMotion: prefs.toggleMotion, toggleDensity: prefs.toggleDensity },
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

/** Toasts need a region to land in; Frame mounts one for a project, this does for the screens
 * before one. A fragment, not a wrapper div, so each screen stays the root it was. The palette
 * and help are portalled dialogs, mounted only while open, so the screen stays the root too. */
function PreProject({ children, newProject, openFolder }: { children: React.ReactNode; newProject?: () => void; openFolder?: () => void }) {
  return (
    <>
      {children}
      <ToastRegion />
      <PreProjectShell newProject={newProject} openFolder={openFolder} />
    </>
  )
}

function AppScreens({ setOpening }: { setOpening: (opening: Opening | null) => void }) {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' })
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [syncState, setSyncState] = useState<SyncState>({ kind: 'idle', lastPulledAt: null })
  const [pendingClashes, setPendingClashes] = useState<FileClash[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Which stage's home the reader is looking at, from clicking the stage list — undefined
   * defers to the project's current stage, the same default the readiness script itself uses
   * when called with no --phase. */
  const [viewedStageId, setViewedStageId] = useState<string | undefined>(undefined)
  /** Which document is open within the project screen, or null for the stage home. */
  const [openDoc, setOpenDoc] = useState<string | null>(null)
  /** Which field the reader asked to be taken to, when they arrived from a readiness item
   * rather than from the document list. Undefined for an ordinary open. */
  const [openDocFocus, setOpenDocFocus] = useState<DocumentFocus | undefined>(undefined)
  const [showHistory, setShowHistory] = useState(false)
  /** Who is using Studio, for attributing saves, restores and drafts. Taken from the
   * signed-in code-host account, which is the same identity the team roster and approvals
   * already use — rather than inventing a separate Studio-only name to keep in step. */
  const [actor, setActor] = useState('')
  /** Which area of the project is showing. Documents is where spec 0010 lives; Build is
   * spec 0011's board; Sprint is the sprint the team runs on it. Kept here rather than in a
   * router, because there are so few areas. */
  const [area, setArea] = useState<Area>('documents')
  /** The spec whose status is open, and separately whether its hand-off is showing — a
   * hand-off is a decision taken FROM a spec, not a different place in the app. */
  const [openSpec, setOpenSpec] = useState<BoardRow | null>(null)
  const [handingOff, setHandingOff] = useState(false)
  /** A Settings section the palette asked for; scrolled to once Settings has mounted it. */
  const [pendingAnchor, setPendingAnchor] = useState<SettingsAnchor | null>(null)
  /** The last tooling report, kept for one derived fact: whether the installed Claude Code
   * accepts every flag Studio emits (studio-improvements F1). A missing tool blocks opening a
   * project (below); a missing FLAG does not — the project is still readable — it disables the
   * model controls with the reason, through ClaudeIssueContext. */
  const [tooling, setTooling] = useState<ToolingReport | null>(null)
  const claudeIssue = useMemo(() => {
    const missing = tooling?.claude.missingFlags ?? []
    return missing.length > 0 ? claudeLacksMessage(tooling?.claude.version, missing) : null
  }, [tooling])

  /** What the main process established about the open project's code host and its CLI
   * (code-host providers, Wave 7). Read once a project opens; the renderer never probes. The
   * banner below and the Settings rows read it; a missing CLI never blocks opening (D4). Read
   * from the store, not a second useState, so a typed sign-in made in Settings reaches the banner. */
  const connection = useConnection()
  /** Projects whose code-host banner was dismissed this session — per project, so switching to
   * one with a different problem shows that one's sentence. */
  const [dismissedHostNotice, setDismissedHostNotice] = useState<ReadonlySet<string>>(() => new Set())

  const refreshTooling = useCallback(async () => {
    const report = await window.studio.detectTooling()
    setTooling(report)
    // gh and az never block opening a project (code-host providers, D4): what a missing
    // code-host CLI costs is said per feature from ConnectionInfo.cli once a project is open.
    const allFound = REQUIRED_TOOLS.every((k) => report[k].found)
    if (!allFound) {
      setScreen({ kind: 'toolingIssues', report })
      return false
    }
    return true
  }, [])

  const loadRecent = useCallback(async () => {
    const settings: Settings = await window.studio.getSettings()
    setRecentProjects(settings.recentProjects)
  }, [])

  useEffect(() => {
    // The entries live in `consoleStore`, not in this component's state: an entry arriving here
    // used to re-render the whole shell (Sidebar, the open screen, ChatPanel) roughly every 2s on
    // the Workflow tab. Now only the Console panel subscribes. The store keeps the same cap the
    // main process's own log has (see consoleLog.ts) and replaces a streaming command's interim
    // row by id. This component still owns the one IPC subscription.
    window.studio.getConsoleLog().then(consoleStore.replaceAll)
    return window.studio.onConsoleEntry((entry) => consoleStore.append(entry))
  }, [])

  useEffect(() => window.studio.onSyncState(setSyncState), [])

  // Pulling (including on the background timer, whose result the renderer never otherwise
  // sees) can surface clashes at any time — fetch the current list whenever the sync
  // indicator reports some are pending, so the clash screen has real data to show.
  const clashCount = syncState.kind === 'clashes' ? syncState.count : null
  const openProjectPath = screen.kind === 'project' ? screen.projectPath : null
  useEffect(() => {
    if (openProjectPath === null || clashCount === null) return
    window.studio.getPendingClashes(openProjectPath).then(setPendingClashes)
  }, [clashCount, openProjectPath])

  useEffect(() => {
    refreshTooling().then((ok) => {
      if (ok) {
        loadRecent().then(() => setScreen({ kind: 'welcome' }))
      }
    })
  }, [refreshTooling, loadRecent])

  const openPath = useCallback(async (projectPath: string) => {
    setError(null)
    // Opening reads the project through the plugin and can take seconds. The overlay goes up
    // before the first await and comes down in `finally`, so it can neither be missed nor
    // strand the window behind it if the open throws.
    setOpening({ projectName: projectName(projectPath), startedAt: Date.now() })
    try {
      const result = await window.studio.openProject(projectPath)
      if (!result.hasProject) {
        valueMemory.clear()
        setScreen({ kind: 'settingUp', projectPath })
        return
      }
      if (result.status) {
        // A different project is a different set of facts: no counter may tween from the number
        // the last project showed (§4 #11). Belt and braces with the per-project id scoping in
        // `useCountUp` — this clears the memory, that keeps the ids apart even if it did not.
        valueMemory.clear()
        setScreen({ kind: 'project', status: result.status, projectPath })
        setOpenDoc(null)
        setOpenSpec(null)
        setHandingOff(false)
        setArea('documents')
        setViewedStageId(undefined)
        connectionStore.clear()
        window.studio.getConnectionInfo(projectPath).then((info) => {
          setActor(info.account ?? '')
          // Screens that read the host (BuildBoard, HandoffDialog, PipelineEvidencePanel…) take it
          // from the store rather than props, so one publish here reaches all of them.
          connectionStore.set(info)
        })
        loadRecent()
      } else {
        setError(result.error ?? "Could not read this project's status.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setOpening(null)
    }
  }, [loadRecent, setOpening])

  const handlePickFolder = useCallback(async () => {
    const folder = await window.studio.pickFolder()
    if (folder) await openPath(folder)
  }, [openPath])

  // Stable so the pre-project palette's host (memoised on it) is not rebuilt every render.
  const startNewProject = useCallback(() => { setError(null); setScreen({ kind: 'newProject' }) }, [])

  // After a phase sign-off the sidebar's stage list is stale — current_phase moved, but the
  // status this screen holds was read before that happened. Re-reads it in place, without
  // resetting the open document or view the way a fresh openPath would.
  const refreshStatus = useCallback(async () => {
    if (screen.kind !== 'project') return
    const result = await window.studio.openProject(screen.projectPath)
    if (result.hasProject && result.status) {
      setScreen({ kind: 'project', status: result.status, projectPath: screen.projectPath })
    }
  }, [screen])

  const handleOverride = useCallback(
    async (kind: 'claude' | 'uv' | 'pluginScripts' | 'git' | 'gh' | 'az', path: string) => {
      await window.studio.setToolOverride(kind, path)
      await refreshTooling().then((ok) => {
        if (ok) { connectionStore.clear(); loadRecent().then(() => setScreen({ kind: 'welcome' })) }
      })
    },
    [refreshTooling, loadRecent],
  )

  // Stable across renders so the memoised Sidebar (see Frame.tsx) is not re-rendered by a new
  // function identity every time something unrelated in this component changes. Everything it
  // touches is a state setter, which React already keeps stable.
  const handleNavigate = useCallback((target: NavTarget) => {
    setArea(target.area)
    if (target.area === 'documents') {
      setOpenDoc(null)
      setShowHistory(false)
      setViewedStageId(target.stageId)
    }
    if (target.area === 'build' || target.area === 'sprint') {
      // Choosing Board or Sprint again returns to the list, not to whichever spec was open.
      setOpenSpec(null)
      setHandingOff(false)
    }
  }, [])

  // --- palette landings: the row opens the item, not just its area --------------------------------

  /** A spec by path, from what the Board or the Sprint already fetched (`backlogStore`); a path
   * neither holds lands on the Board, which re-reads and will list it. */
  const openSpecByPath = useCallback((relPath: string) => {
    const row = backlogStore.rows.find((r) => r.path === relPath)
      ?? (() => { const s = backlogStore.slate.find((r) => r.relPath === relPath); return s ? slateToBoardRow(s) : undefined })()
    if (!row) { handleNavigate({ area: 'build' }); return }
    // A spec opened while the Sprint shows keeps Sprint behind it, as its own rows do.
    setArea((a) => (a === 'sprint' ? a : 'build'))
    setHandingOff(false)
    setOpenSpec(row)
  }, [handleNavigate])

  const openDocumentAt = useCallback((relPath: string, stageId: string | undefined) => {
    setArea('documents')
    setViewedStageId(stageId)
    setShowHistory(false)
    setOpenDocFocus(undefined)
    setOpenDoc(relPath)
  }, [])

  const openSettingsAt = useCallback((anchor: SettingsAnchor) => {
    handleNavigate({ area: 'settings' })
    setPendingAnchor(anchor)
  }, [handleNavigate])

  useEffect(() => {
    if (pendingAnchor === null || area !== 'settings') return
    const cancel = scrollToAnchorWhenMounted(pendingAnchor)
    // Cleared once scheduled so the same row picked twice scrolls twice.
    setPendingAnchor(null)
    return cancel
  }, [pendingAnchor, area])

  // --- shell wiring: shortcuts, Esc back, focus, announcement -------------------------------------

  const inProject = screen.kind === 'project'
  const stages = inProject ? screen.status.stages : null
  const currentStageId = stages?.find((s) => s.stage_state === 'current')?.id
  // Which screen is actually in <main>: the digit shortcuts and the Spine rows exist only on the
  // stage home, the Sprint surface toggle only on the Sprint list.
  const stageHomeShowing = inProject && area === 'documents' && openDoc === null && !(pendingClashes && pendingClashes.length > 0)
  const sprintShowing = inProject && area === 'sprint' && openSpec === null
  // The stage the keyboard is "at": the viewed one on Documents, Build for its four views, the
  // project's current one on Settings (which lights no stage). `[` / `]` step from here.
  const keyboardStageId = area === 'documents' || area === 'settings' ? (viewedStageId ?? currentStageId) : BUILD_STAGE_ID

  // Esc's last layer: the same `onBack` / `onClose` the screens' own Back buttons call, in the
  // order the screens stack (hand-off over spec; history over document). Undefined when the
  // list or stage home is showing — there is nothing behind it to go back to.
  const back = useMemo<(() => void) | undefined>(() => {
    if (!inProject) return undefined
    if (area === 'build' || area === 'sprint') {
      if (handingOff) return () => setHandingOff(false)
      if (openSpec) return () => setOpenSpec(null)
      return undefined
    }
    if (area === 'documents' && openDoc) {
      return showHistory ? () => setShowHistory(false) : () => setOpenDoc(null)
    }
    return undefined
  }, [inProject, area, handingOff, openSpec, openDoc, showHistory])

  const shell = useMemo<FrameShellHooks>(() => ({
    openSpec: openSpecByPath,
    openDocument: openDocumentAt,
    openSettings: openSettingsAt,
    back,
    stageHomeShowing,
    sprintShowing,
  }), [openSpecByPath, openDocumentAt, openSettingsAt, back, stageHomeShowing, sprintShowing])

  useShortcuts({
    handlers: {
      stageTab: (tab) => stageTabStore.request(tab),
      goBuildView: (view) => handleNavigate(targetForBuildView(view)),
      goStage: (stageId) => { if (stages?.some((s) => s.id === stageId)) handleNavigate(targetForStage(stageId)) },
      stepStage: (delta) => {
        if (!stages || keyboardStageId === undefined) return
        const index = stages.findIndex((s) => s.id === keyboardStageId)
        const next = index >= 0 ? stages[index + delta] : undefined
        // The ends are ends: no wrap from Close back to Phase 0.
        if (next) handleNavigate(targetForStage(next.id))
      },
      focusChat: focusChatComposer,
    },
    scopes: stageHomeShowing ? ['project', 'stageHome'] : ['project'],
    onBack: back,
    isDirty: () => escOwnedAbove() || dirtyStore.anyDirty() || focusedMainFieldHasText(),
    enabled: inProject,
    target: CAPTURE_TARGET,
  })

  // One string that changes exactly when the screen does (not when it re-renders): what §6.3
  // moves focus on and what the live region announces. Null before a project is open, so the
  // welcome screen keeps whatever focus it had.
  const navKey = inProject
    ? [area, viewedStageId ?? '', openDoc ?? '', showHistory, openSpec?.spec ?? '', handingOff].join('|')
    : null
  // Focus waits for the screen's enter choreography (§4 #3, 240 ms) so it lands on a heading
  // that has finished arriving; with motion off (every test) it moves at once.
  useFocusOnNavigate(navKey, { delayMs: motion.enabled() ? 260 : 0 })
  useEffect(() => {
    if (navKey === null || !stages) return
    announce(navigationAnnouncement({ area, stages, stageId: keyboardStageId, openDoc, showHistory, openSpec, handingOff }))
    // `navKey` is the one dependency on purpose: the announcement is about a navigation, and the
    // other values are the parts it is made of.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey])

  // Before a project is open there is no `<main>` to hold a banner, so an error is a toast —
  // sticky, because "could not open" must outlive six seconds. One toast per distinct message
  // (a screen change while the same error stands must not repeat it), dismissed the moment the
  // error clears so a stale failure never follows the reader into the project they then opened.
  const errorToast = useRef<{ text: string; id: string } | null>(null)
  useEffect(() => {
    if (error === null) {
      if (errorToast.current) dismiss(errorToast.current.id)
      errorToast.current = null
      return
    }
    if (inProject || errorToast.current?.text === error) return
    if (errorToast.current) dismiss(errorToast.current.id)
    errorToast.current = { text: error, id: toast({ tone: 'error', title: error, sticky: true }) }
  }, [error, inProject])

  if (screen.kind === 'loading') {
    return (
      <div className="relative flex h-screen flex-col items-center justify-center gap-4 bg-surface-0">
        {/* Pure decoration, so test builds never mount it; the text is what every e2e waits for. */}
        {AMBIENT_ENABLED && <SceneSlot id="ambient" data={null} onActivate={() => {}} />}
        {/* The first paint already carries the mark; the opening overlay (G1-5) then draws it.
            Static here — motion is evidence, and nothing has happened yet. Inline SVG (CSP). */}
        <svg viewBox="0 0 64 64" aria-hidden="true" className="relative h-10 w-10 text-accent-600">
          <rect x="17" y="9" width="30" height="7" rx="3.5" fill="currentColor" />
          <circle cx="32" cy="38.5" r="17.5" fill="currentColor" />
        </svg>
        <span className="relative text-sm text-ink-3">Loading…</span>
      </div>
    )
  }

  if (screen.kind === 'toolingIssues') {
    return <ToolingIssues report={screen.report} onOverride={handleOverride} />
  }

  if (screen.kind === 'newProject') {
    return (
      <PreProject>
        <NewProjectScreen
          onCancel={() => { connectionStore.clear(); setScreen({ kind: 'welcome' }) }}
          // The new folder has no .sdlc yet, so opening it lands in the same setup wizard an
          // existing folder without one goes through — one path, not a second one for new projects.
          onCreated={(projectPath) => { void openPath(projectPath) }}
        />
      </PreProject>
    )
  }

  if (screen.kind === 'settingUp') {
    return (
      <PreProject>
        <SetupFlow
          projectPath={screen.projectPath}
          onCancel={() => { connectionStore.clear(); setScreen({ kind: 'welcome' }) }}
          onConfirm={async (profileId) => {
            const result = await window.studio.runSetup(screen.projectPath, profileId)
            if (!result.ok) {
              setError(result.error ?? 'Setting up the project failed.')
              return
            }
            await openPath(screen.projectPath)
          }}
        />
      </PreProject>
    )
  }

  if (screen.kind === 'project') {
    if (pendingClashes && pendingClashes.length > 0) {
      const { projectPath } = screen
      return (
        <ProjectKeyProvider value={projectPath}>
        <Suspense fallback={OPENING}>
        <ClashScreen
          clashes={pendingClashes}
          onResolve={async (filePath, sectionKey, choice: ClashChoice, combinedText) => {
            const result = await window.studio.resolveClash(projectPath, filePath, sectionKey, choice, combinedText)
            if (!result.ok) {
              setError(result.error ?? 'Could not resolve this clash.')
              return
            }
            const remaining = await window.studio.getPendingClashes(projectPath)
            setPendingClashes(remaining)
          }}
          onCombine={async (localText, remoteText) => {
            const result = await window.studio.combineWithClaude(projectPath, localText, remoteText)
            if ('error' in result) throw new Error(result.error)
            return result.combined
          }}
          onDone={() => setPendingClashes(null)}
        />
        </Suspense>
        </ProjectKeyProvider>
      )
    }
    const { projectPath, status } = screen
    return (
      <ProjectKeyProvider value={projectPath}>
      <ClaudeIssueContext.Provider value={claudeIssue}>
      <Frame
        status={status}
        projectPath={projectPath}
        syncState={syncState}
        area={area}
        viewedStageId={viewedStageId}
        actor={actor}
        onNavigate={handleNavigate}
        shell={shell}
      >
        {/* Inline, never also a toast (§6.6): a hard error stays where the reader can re-read it.
            Rendered only while one stands, so the screen root is still `<main>`'s first child. */}
        {error && (
          <Notice tone="error" role="alert" className="mb-4">
            {error}
          </Notice>
        )}
        {/* Non-blocking (D4): the project is open; this says what its code-host CLI cannot do
            right now, in the §7.1 sentence. Same placement rule as the error above — rendered
            only while there is something to say and not yet dismissed. The Board and a spec
            page carry their own host notice, so the banner steps aside there: one sentence per screen. */}
        {!dismissedHostNotice.has(projectPath) && area !== 'build' && !openSpec && (
          <CodeHostNotice
            connection={connection}
            onDismiss={() => setDismissedHostNotice((prev) => new Set(prev).add(projectPath))}
          />
        )}
        {area === 'closing' ? (
          <Suspense fallback={OPENING}>
            <FeatureCompleteScreen
              projectPath={projectPath}
              actor={actor}
              status={status}
              onNavigate={handleNavigate}
              buildStage={status.stages.find((s) => s.id === 'build') ?? null}
            />
          </Suspense>
        ) : area === 'explain' ? (
          <Suspense fallback={OPENING}><ExplainViews projectPath={projectPath} /></Suspense>
        ) : area === 'settings' ? (
          <Suspense fallback={OPENING}><SettingsScreen projectPath={projectPath} actor={actor} connection={connection} /></Suspense>
        ) : area === 'build' || area === 'sprint' ? (
          // A spec opened from the sprint's slate is the same spec view the board opens, and
          // Back returns to wherever it was opened from.
          handingOff && openSpec ? (
            <Suspense fallback={OPENING}>
              <HandoffDialog
                projectPath={projectPath}
                row={openSpec}
                onClose={() => setHandingOff(false)}
                onHandedOff={() => {
                  // Back to the board, and forget the spec — its row is now stale, and the
                  // board re-reads on mount rather than showing what used to be true.
                  setHandingOff(false)
                  setOpenSpec(null)
                }}
              />
            </Suspense>
          ) : openSpec ? (
            <SpecStatusView
              key={openSpec.spec}
              projectPath={projectPath}
              row={openSpec}
              onBack={() => setOpenSpec(null)}
              onHandOff={() => setHandingOff(true)}
            />
          ) : area === 'sprint' ? (
            <SprintScreen
              projectPath={projectPath}
              onOpenSpec={(row) => {
                setHandingOff(false)
                setOpenSpec(row)
              }}
            />
          ) : (
            <BuildBoard
              projectPath={projectPath}
              account={actor || null}
              onOpenSpec={(row) => {
                setHandingOff(false)
                setOpenSpec(row)
              }}
            />
          )
        ) : openDoc && showHistory ? (
          <Suspense fallback={OPENING}>
            <HistoryPanel
              projectPath={projectPath}
              relPath={openDoc}
              actor={actor}
              onClose={() => setShowHistory(false)}
              // A restore rewrites the file, so the open document is stale — close back to the
              // document, which re-reads it, rather than showing content that no longer matches.
              onRestored={() => setShowHistory(false)}
            />
          </Suspense>
        ) : openDoc ? (
          <DocumentView
            key={openDoc}
            projectPath={projectPath}
            relPath={openDoc}
            actor={actor}
            focus={openDocFocus}
            onBack={() => setOpenDoc(null)}
            onShowHistory={() => setShowHistory(true)}
            onOpenDocument={(next) => openDocumentAt(next, viewedStageId)}
          />
        ) : (
          <StageHome
            projectPath={projectPath}
            stageId={viewedStageId}
            status={status}
            onNavigate={handleNavigate}
            actor={actor}
            setOpening={setOpening}
            onSignedOff={refreshStatus}
            onGoToClosing={() => setArea('closing')}
            onOpenDocument={(relPath, focus) => {
              setShowHistory(false)
              setOpenDocFocus(focus)
              setOpenDoc(relPath)
            }}
          />
        )}
      </Frame>
      </ClaudeIssueContext.Provider>
      </ProjectKeyProvider>
    )
  }

  return (
    <PreProject newProject={startNewProject} openFolder={handlePickFolder}>
      <WelcomeScreen
        recentProjects={recentProjects}
        onPickFolder={handlePickFolder}
        onNewProject={startNewProject}
        onOpenRecent={openPath}
      />
    </PreProject>
  )
}

/** Holds the "a project is opening" state above every screen, so the overlay covers whichever
 * screen is showing — welcome, set-up, or a project being reopened. */
function App() {
  const [opening, setOpening] = useState<Opening | null>(null)
  return (
    <>
      <AppScreens setOpening={setOpening} />
      {opening && (
        <OpeningOverlay
          projectName={opening.projectName}
          startedAt={opening.startedAt}
          title={opening.title}
          subtitle={opening.subtitle}
        />
      )}
    </>
  )
}

export default App
