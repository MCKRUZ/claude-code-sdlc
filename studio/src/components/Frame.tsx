import { type ReactNode, useState } from 'react'
import type { ConsoleEntry, ProjectStatus, SyncState } from '../../shared/types'
import { Header } from './Header'
import { StageNav } from './StageNav'
import { ChatPanel } from './ChatPanel'
import { Console } from './Console'

/** The frame every screen shares once a project is open: header, stage navigation, the
 * chat panel, and the console — spec 0008's own scope, in one place so nothing built on
 * top of it can accidentally omit a piece of it. Spec 0009 adds the sync indicator, always
 * on the Header, so it's on every one of those screens too without each having to remember. */
export function Frame({
  status,
  consoleEntries,
  syncState,
  viewedStageId,
  showViewedStage,
  onSelectStage,
  children,
}: {
  status: ProjectStatus
  consoleEntries: ConsoleEntry[]
  syncState: SyncState
  /** The stage whose home is currently showing, or undefined for the project's current stage —
   * used only to highlight the right row, since StageHome itself resolves the same default. */
  viewedStageId?: string
  /** Whether a stage's documents are on screen; false on the Build board, Settings and so on. */
  showViewedStage: boolean
  onSelectStage: (stageId: string) => void
  children: ReactNode
}) {
  const [consoleOpen, setConsoleOpen] = useState(false)

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <Header status={status} syncState={syncState} consoleOpen={consoleOpen} onToggleConsole={() => setConsoleOpen((v) => !v)} />
      <div className="flex min-h-0 flex-1">
        <StageNav status={status} viewedStageId={viewedStageId} showViewed={showViewedStage} onSelect={onSelectStage} />
        <main className="min-w-0 flex-1 overflow-auto p-6">{children}</main>
        <ChatPanel status={status} />
      </div>
      {consoleOpen && (
        <div className="h-64 shrink-0 border-t border-slate-200 bg-white">
          <Console entries={consoleEntries} />
        </div>
      )}
    </div>
  )
}
