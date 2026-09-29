import { type ReactNode, useEffect, useState } from 'react'
import type { ConsoleEntry, ProjectStatus, SyncState } from '../../shared/types'
import type { Area, DocProgress, NavTarget } from '../../shared/nav'
import { Sidebar } from './Sidebar'
import { ChatPanel } from './ChatPanel'
import { Console } from './Console'

/** The frame every screen shares once a project is open: the sidebar (the only navigation, which
 * also carries the project's name and the sync indicator), the chat panel, and the console —
 * spec 0008's own scope, in one place so nothing built on top of it can accidentally omit a
 * piece of it. Spec 0009's sync indicator sits in the sidebar's footer, so it is on every one of
 * those screens without each having to remember. */
export function Frame({
  status,
  projectPath,
  consoleEntries,
  syncState,
  area,
  viewedStageId,
  actor,
  onNavigate,
  children,
}: {
  status: ProjectStatus
  projectPath: string
  consoleEntries: ConsoleEntry[]
  syncState: SyncState
  area: Area
  /** The stage whose documents were picked, or undefined for the project's current stage. */
  viewedStageId?: string
  /** Who is using Studio — spec 0016's chat needs this to attribute an accepted or discarded
   * proposal through the SAME draft ledger a structured-editor draft already uses. */
  actor: string
  onNavigate: (target: NavTarget) => void
  children: ReactNode
}) {
  const [consoleOpen, setConsoleOpen] = useState(false)
  const currentDocs = useCurrentStageDocs(projectPath, status, area, viewedStageId)
  // The chat panel is scoped to whichever stage's documents are showing — the picked stage, or
  // the project's own current one, the same default stage_readiness.py itself uses.
  const chatStageId = viewedStageId ?? status.stages.find((s) => s.stage_state === 'current')?.id ?? null

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <div className="flex min-h-0 flex-1">
        <Sidebar
          status={status}
          area={area}
          viewedStageId={viewedStageId}
          currentDocs={currentDocs}
          syncState={syncState}
          consoleOpen={consoleOpen}
          onToggleConsole={() => setConsoleOpen((v) => !v)}
          onNavigate={onNavigate}
        />
        <main className="min-w-0 flex-1 overflow-auto p-6">{children}</main>
        <ChatPanel status={status} projectPath={projectPath} actor={actor} stageId={chatStageId} />
      </div>
      {consoleOpen && (
        <div className="h-64 shrink-0 border-t border-slate-200 bg-white">
          <Console entries={consoleEntries} />
        </div>
      )}
    </div>
  )
}

/** How many of the current stage's documents are complete, for the line under it in the sidebar.
 * One readiness call, for the current stage only — asking for all nine on every open would be nine
 * plugin calls to draw a list. Re-read when the screen changes, since finishing a document happens
 * on another screen. Null until known, and on a failure: the sidebar then says "In progress". */
function useCurrentStageDocs(
  projectPath: string, status: ProjectStatus, area: Area, viewedStageId: string | undefined,
): DocProgress | null {
  const [docs, setDocs] = useState<DocProgress | null>(null)
  const currentId = status.stages.find((s) => s.stage_state === 'current')?.id

  useEffect(() => {
    if (!currentId) return
    let cancelled = false
    window.studio.getStageReadiness(projectPath, currentId)
      .then((r) => {
        if (cancelled || !r.ok) return
        setDocs({ complete: r.documents.filter((d) => d.ready).length, total: r.documents.length })
      })
      .catch(() => { /* the sidebar simply keeps saying "In progress" */ })
    return () => { cancelled = true }
  }, [projectPath, currentId, area, viewedStageId])

  return docs
}
