import { useCallback, useEffect, useState } from 'react'
import type { BoardRow, ClashChoice, ConsoleEntry, FileClash, ProjectStatus, RecentProject, Settings, SyncState, ToolingReport } from '../shared/types'
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

type Screen =
  | { kind: 'loading' }
  | { kind: 'toolingIssues'; report: ToolingReport }
  | { kind: 'welcome' }
  | { kind: 'settingUp'; projectPath: string }
  | { kind: 'project'; status: ProjectStatus; projectPath: string }

function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' })
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([])
  const [syncState, setSyncState] = useState<SyncState>({ kind: 'idle', lastPulledAt: null })
  const [pendingClashes, setPendingClashes] = useState<FileClash[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Which document is open within the project screen, or null for the stage home. */
  const [openDoc, setOpenDoc] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  /** Who is using Studio, for attributing saves, restores and drafts. Taken from the
   * signed-in code-host account, which is the same identity the team roster and approvals
   * already use — rather than inventing a separate Studio-only name to keep in step. */
  const [actor, setActor] = useState('')
  /** Which area of the project is showing. Documents is where spec 0010 lives; Build is
   * spec 0011's board. Kept here rather than in a router, because there are two areas. */
  const [area, setArea] = useState<'documents' | 'build' | 'settings'>('documents')
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
      window.studio.getConnectionInfo(projectPath).then((info) => setActor(info.account ?? ''))
      loadRecent()
    } else {
      setError(result.error ?? 'Could not read this project\'s status.')
    }
  }, [loadRecent])

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
      <Frame status={status} consoleEntries={consoleEntries} syncState={syncState}>
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[var(--color-command-error)]">
            {error}
          </div>
        )}
        <div className="mb-4 flex gap-1">
          {([['documents', 'Documents'], ['build', 'Build'], ['settings', 'Settings']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setArea(value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                area === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {area === 'settings' ? (
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
            onBack={() => setOpenDoc(null)}
            onShowHistory={() => setShowHistory(true)}
          />
        ) : (
          <StageHome
            projectPath={projectPath}
            stageId={status.current_phase.id}
            onOpenDocument={(relPath) => {
              setShowHistory(false)
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

export default App
