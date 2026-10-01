import { type ReactNode, useState } from 'react'
import type { ConsoleEntry, ProjectStatus, SyncState } from '../../shared/types'
import type { Area, NavTarget } from '../../shared/nav'
import { Sidebar } from './Sidebar'
import { ChatPanel } from './ChatPanel'
import { Console } from './Console'
import { StageReadinessProvider, useStageReadiness } from './StageReadinessContext'

/** The frame every screen shares once a project is open: the sidebar (the only navigation, which
 * also carries the project's name and the sync indicator), the chat panel, and the console —
 * spec 0008's own scope, in one place so nothing built on top of it can accidentally omit a
 * piece of it. Spec 0009's sync indicator sits in the sidebar's footer, so it is on every one of
 * those screens without each having to remember.
 *
 * Spec 0019: Frame is the common ancestor of both `StageHome` (rendered as its `children`) and
 * `ChatPanel` (its direct sibling) — see `studio/src/App.tsx` — so it owns the ONE
 * `getStageReadiness` fetch for the stage on screen and shares it downward through
 * `StageReadinessProvider`, rather than each descendant (plus Frame's own sidebar doc-count
 * line) fetching independently. `FrameBody` is split out only because a value a
 * `Context.Provider` holds can be read by a descendant, never by the component that renders the
 * provider itself. */
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
  // The ONE resolved stage every consumer below needs — the picked stage, or the project's own
  // current one, the same default stage_readiness.py itself uses when called with no --phase.
  const stageId = viewedStageId ?? status.stages.find((s) => s.stage_state === 'current')?.id

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
        actor={actor}
        onNavigate={onNavigate}
      >
        {children}
      </FrameBody>
    </StageReadinessProvider>
  )
}

function FrameBody({
  status,
  projectPath,
  consoleEntries,
  syncState,
  area,
  viewedStageId,
  stageId,
  actor,
  onNavigate,
  children,
}: {
  status: ProjectStatus
  projectPath: string
  consoleEntries: ConsoleEntry[]
  syncState: SyncState
  area: Area
  viewedStageId?: string
  stageId: string | undefined
  actor: string
  onNavigate: (target: NavTarget) => void
  children: ReactNode
}) {
  const [consoleOpen, setConsoleOpen] = useState(false)
  const { readiness } = useStageReadiness()
  const currentStageId = status.stages.find((s) => s.stage_state === 'current')?.id
  // Sidebar's doc-count line is always about the ACTUAL current stage, regardless of which
  // stage is being viewed (it only ever renders under the row whose own stage_state is
  // 'current' — see Sidebar.tsx). The shared fetch above is for the VIEWED stage, which is the
  // current stage in the common case (no stage picked) but can genuinely differ from it — e.g.
  // browsing a signed-off stage's documents while a later stage is current. Gated like this, the
  // line shows a real count whenever it is accurate and falls back to "In progress" (the same
  // fallback it already used before data arrived) rather than ever showing another stage's count
  // mislabeled as the current one's.
  const currentDocs = readiness?.ok && readiness.stageId === currentStageId
    ? { complete: readiness.documents.filter((d) => d.ready).length, total: readiness.documents.length }
    : null

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
        <ChatPanel status={status} projectPath={projectPath} actor={actor} stageId={stageId ?? null} />
      </div>
      {consoleOpen && (
        <div className="h-64 shrink-0 border-t border-slate-200 bg-white">
          <Console entries={consoleEntries} />
        </div>
      )}
    </div>
  )
}
