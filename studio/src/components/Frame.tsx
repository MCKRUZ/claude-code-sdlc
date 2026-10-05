import { type ReactNode, useEffect, useState } from 'react'
import type { ConsoleEntry, ProjectStatus, SyncState } from '../../shared/types'
import type { Area, DocProgress, NavTarget } from '../../shared/nav'
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
 * `ChatPanel` (its direct sibling) — see `studio/src/App.tsx` — so it wraps them in
 * `StageReadinessProvider` (see that file for why the single shared fetch exists). `FrameBody` is
 * split out only because a value a `Context.Provider` holds can be read by a descendant, never by
 * the component that renders the provider itself. */
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
  currentStageId,
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
  currentStageId: string | undefined
  actor: string
  onNavigate: (target: NavTarget) => void
  children: ReactNode
}) {
  const [consoleOpen, setConsoleOpen] = useState(false)
  const { readiness } = useStageReadiness()
  // Sidebar's doc-count line is always about the ACTUAL current stage, regardless of which
  // stage is being viewed (it only ever renders under the row whose own stage_state is
  // 'current' — see Sidebar.tsx) — true before spec 0019 (the old `useCurrentStageDocs` hook
  // always fetched the current stage directly) and unchanged by it (that spec's Out-of-Scope
  // section promises no UI-visible behavior change). The shared fetch above is for the VIEWED
  // stage, which IS the current stage in the common case (no stage picked) — then this line
  // reads that same fetch, no second call. When the two genuinely differ (e.g. browsing a
  // signed-off stage's documents while a later stage is current), `stage_readiness.py` answers
  // for exactly one stage per call, so the current stage's real count cannot be derived from the
  // viewed stage's fetch — `useOtherCurrentStageDocs` below runs its own small, independent
  // fetch for just that case, the same shape the old hook used, so the line still shows a real
  // count rather than silently falling back to "In progress" (that fallback stays reserved for
  // before data has arrived at all).
  const viewedStageDocs = readiness?.ok && readiness.stageId === currentStageId
    ? { complete: readiness.documents.filter((d) => d.ready).length, total: readiness.documents.length }
    : null
  const otherCurrentDocs = useOtherCurrentStageDocs(projectPath, currentStageId, stageId)
  const currentDocs = viewedStageDocs ?? otherCurrentDocs

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      {/* Column below sm, row at sm+ — spec 0018's document panel and chat need to stack at
          phone width, and Sidebar/main/ChatPanel are unconditional row siblings here rather
          than inside WorkflowTab, so the wrap has to happen at this level. */}
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
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

/** The sidebar's current-stage doc-count line, for the one case the shared fetch above cannot
 * cover: the viewed stage is not the current stage. Runs its own `getStageReadiness` call for
 * `currentStageId` only while that is true — the same shape as the pre-spec-0019
 * `useCurrentStageDocs` hook this replaced, narrowed to just this gap. Null while unknown or on
 * a failure, so the sidebar falls back to its documented "In progress" placeholder. */
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
