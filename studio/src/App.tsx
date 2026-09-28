import { useCallback, useEffect, useState } from 'react'
import type { BoardRow, ClashChoice, ConsoleEntry, DocumentFocus, FileClash, ProjectStatus, RecentProject, Settings, SyncState, ToolingReport } from '../shared/types'
import { ToolingIssues } from './components/ToolingIssues'
import { WelcomeScreen } from './components/WelcomeScreen'
import { SetupFlow } from './components/SetupFlow'
import { Frame } from './components/Frame'
import { ClashScreen } from './components/ClashScreen'
import { StageHome } from './components/StageHome'
import { DocumentView } from './components/DocumentView'
import { HistoryPanel } from './components/HistoryPanel'
import { BuildBoard } from './components/BuildBoard'
import { SpecStatusView } from './components/SpecStatusView'
import { HandoffDialog } from './components/HandoffDialog'
import { SettingsScreen } from './components/SettingsScreen'
import { ExplainViews } from './components/ExplainViews'
import { FeatureCompleteScreen } from './components/FeatureCompleteScreen'
import { OpeningOverlay } from './components/OpeningOverlay'

type Screen =
  | { kind: 'loading' }
  | { kind: 'toolingIssues'; report: ToolingReport }
  | { kind: 'welcome' }
  | { kind: 'settingUp'; projectPath: string }
  | { kind: 'project'; status: ProjectStatus; projectPath: string }

/** A project being opened: what to call it on screen, and when it started, for the clock. */
interface Opening {
  projectName: string
  startedAt: number
}

/** The last folder name of a path, for "Opening token-tracker…". */
function projectName(projectPath: string): string {
  return projectPath.split(/[\/]/).filter(Boolean).pop() ?? projectPath
}

function AppScreens({ setOpening }: { setOpening: (opening: Opening | null) => void }) {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' })
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([])
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
   * spec 0011's board. Kept here rather than in a router, because there are two areas. */
  const [area, setArea] = useState<'documents' | 'build' | 'explain' | 'closing' | 'settings'>('documents')
  /** The spec whose status is open, and separately whether its hand-off is showing — a
   * hand-off is a decision taken FROM a spec, not a different place in the app. */
  const [openSpec, setOpenSpec] = useState<BoardRow | null>(null)
  const [handingOff, setHandingOff] = useState(false)

  const refreshTooling = useCallback(async () => {
    const report = await window.studio.detectTooling()
    const allFound = report.claude.found && report.uv.found && report.pluginScripts.found && report.git.found && report.gh.found
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
    window.studio.getConsoleLog().then(setConsoleEntries)
    return window.studio.onConsoleEntry((entry) => setConsoleEntries((prev) => [...prev, entry]))
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
        setScreen({ kind: 'settingUp', projectPath })
        return
      }
      if (result.status) {
        setScreen({ kind: 'project', status: result.status, projectPath })
        setOpenDoc(null)
        setOpenSpec(null)
        setHandingOff(false)
        setArea('documents')
        setViewedStageId(undefined)
        window.studio.getConnectionInfo(projectPath).then((info) => setActor(info.account ?? ''))
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

  const handleOverride = useCallback(
    async (kind: 'claude' | 'uv' | 'pluginScripts' | 'git' | 'gh', path: string) => {
      await window.studio.setToolOverride(kind, path)
      await refreshTooling().then((ok) => {
        if (ok) loadRecent().then(() => setScreen({ kind: 'welcome' }))
      })
    },
    [refreshTooling, loadRecent],
  )

  if (screen.kind === 'loading') {
    return <div className="flex h-screen items-center justify-center bg-slate-50 text-sm text-slate-400">Loading…</div>
  }

  if (screen.kind === 'toolingIssues') {
    return <ToolingIssues report={screen.report} onOverride={handleOverride} />
  }

  if (screen.kind === 'settingUp') {
    return (
      <SetupFlow
        projectPath={screen.projectPath}
        onCancel={() => setScreen({ kind: 'welcome' })}
        onConfirm={async (profileId) => {
          const result = await window.studio.runSetup(screen.projectPath, profileId)
          if (!result.ok) {
            setError(result.error ?? 'Setting up the project failed.')
            return
          }
          await openPath(screen.projectPath)
        }}
      />
    )
  }

  if (screen.kind === 'project') {
    if (pendingClashes && pendingClashes.length > 0) {
      const { projectPath } = screen
      return (
        <ClashScreen
          clashes={pendingClashes}
          onResolve={async (filePath, sectionKey, choice, combinedText) => {
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
      )
    }
    const { projectPath, status } = screen
    return (
      <Frame
        status={status}
        projectPath={projectPath}
        consoleEntries={consoleEntries}
        syncState={syncState}
        area={area}
        viewedStageId={viewedStageId}
        onNavigate={(target) => {
          setArea(target.area)
          if (target.area === 'documents') {
            setOpenDoc(null)
            setShowHistory(false)
            setViewedStageId(target.stageId)
          }
          if (target.area === 'build') {
            // Choosing Board again returns to the list, not to whichever spec was open.
            setOpenSpec(null)
            setHandingOff(false)
          }
        }}
      >
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[var(--color-command-error)]">
            {error}
          </div>
        )}
        {area === 'closing' ? (
          <FeatureCompleteScreen
            projectPath={projectPath}
            actor={actor}
            buildStage={status.stages.find((s) => s.id === 'build') ?? null}
          />
        ) : area === 'explain' ? (
          <ExplainViews projectPath={projectPath} />
        ) : area === 'settings' ? (
          <SettingsScreen projectPath={projectPath} actor={actor} />
        ) : area === 'build' ? (
          handingOff && openSpec ? (
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
          ) : openSpec ? (
            <SpecStatusView
              key={openSpec.spec}
              projectPath={projectPath}
              row={openSpec}
              onBack={() => setOpenSpec(null)}
              onHandOff={() => setHandingOff(true)}
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
          <HistoryPanel
            projectPath={projectPath}
            relPath={openDoc}
            actor={actor}
            onClose={() => setShowHistory(false)}
            // A restore rewrites the file, so the open document is stale — close back to the
            // document, which re-reads it, rather than showing content that no longer matches.
            onRestored={() => setShowHistory(false)}
          />
        ) : openDoc ? (
          <DocumentView
            key={openDoc}
            projectPath={projectPath}
            relPath={openDoc}
            actor={actor}
            focus={openDocFocus}
            onBack={() => setOpenDoc(null)}
            onShowHistory={() => setShowHistory(true)}
          />
        ) : (
          <StageHome
            projectPath={projectPath}
            stageId={viewedStageId}
            onOpenDocument={(relPath, focus) => {
              setShowHistory(false)
              setOpenDocFocus(focus)
              setOpenDoc(relPath)
            }}
          />
        )}
      </Frame>
    )
  }

  return (
    <>
      {error && (
        <div className="fixed left-1/2 top-4 z-10 -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-[var(--color-command-error)] shadow-lg">
          {error}
        </div>
      )}
      <WelcomeScreen recentProjects={recentProjects} onPickFolder={handlePickFolder} onOpenRecent={openPath} />
    </>
  )
}

/** Holds the "a project is opening" state above every screen, so the overlay covers whichever
 * screen is showing — welcome, set-up, or a project being reopened. */
function App() {
  const [opening, setOpening] = useState<Opening | null>(null)
  return (
    <>
      <AppScreens setOpening={setOpening} />
      {opening && <OpeningOverlay projectName={opening.projectName} startedAt={opening.startedAt} />}
    </>
  )
}

export default App
