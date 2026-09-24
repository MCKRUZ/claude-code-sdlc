import { useCallback, useEffect, useState } from 'react'
import type { ConsoleEntry, ProjectStatus, RecentProject, Settings, ToolingReport } from '../shared/types'
import { ToolingIssues } from './components/ToolingIssues'
import { WelcomeScreen } from './components/WelcomeScreen'
import { SetupFlow } from './components/SetupFlow'
import { Frame } from './components/Frame'

type Screen =
  | { kind: 'loading' }
  | { kind: 'toolingIssues'; report: ToolingReport }
  | { kind: 'welcome' }
  | { kind: 'settingUp'; projectPath: string }
  | { kind: 'project'; status: ProjectStatus }

function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' })
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  const refreshTooling = useCallback(async () => {
    const report = await window.studio.detectTooling()
    const allFound = report.claude.found && report.uv.found && report.pluginScripts.found
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
      setScreen({ kind: 'project', status: result.status })
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
    async (kind: 'claude' | 'uv' | 'pluginScripts', path: string) => {
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
    return (
      <Frame status={screen.status} consoleEntries={consoleEntries}>
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[var(--color-command-error)]">
            {error}
          </div>
        )}
        <p className="text-sm text-slate-400">
          Documents, specs, settings and the board aren't built yet — later specs.
        </p>
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
