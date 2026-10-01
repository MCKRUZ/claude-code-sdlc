import { useEffect, useState } from 'react'
import type { DocumentFocus, SignOffQuestion } from '../../shared/types'
import { stageHomeKey } from '../stageHomeKey'
import { DocumentsTab } from './DocumentsTab'
import { SignOffPanel } from './SignOffPanel'
import { WorkflowTab } from './WorkflowTab'
import { useStageReadiness } from './StageReadinessContext'

type StageTab = 'workflow' | 'documents'

// Duplicated from App.tsx/SignOffPanel.tsx rather than imported — neither exports it, and this
// file follows the pattern already established there rather than introducing a new shared type
// as a side effect of reconnecting this feature.
interface Opening {
  projectName: string
  startedAt: number
  title?: string
  subtitle?: string
}

/** The stage's home page: a title, then a Workflow / Documents tab pair, in that order, in the
 * same tab-bar location on every stage (spec 0017).
 *
 * Workflow — a step-by-step guide to the stage, its steps' status derived from the exact same
 * readiness data the Documents tab reads — is the default view. Documents is the flat list spec
 * 0010 shipped, unchanged, in its own component. Read-only by construction — there is nothing
 * here that changes a document. */
export function StageHome({
  projectPath,
  stageId,
  actor,
  setOpening,
  onSignedOff,
  onOpenDocument,
}: {
  projectPath: string
  stageId?: string
  /** Who a confirmation is recorded under; empty when nobody is signed in. */
  actor: string
  setOpening: (opening: Opening | null) => void
  onSignedOff: () => void
  onOpenDocument: (relPath: string, focus?: DocumentFocus) => void
}) {
  const { readiness, loading, refresh } = useStageReadiness()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [tab, setTab] = useState<StageTab>('workflow')

  // Opening a DIFFERENT stage — or a different PROJECT — is opening a home page fresh, and
  // Workflow is what a fresh opening lands on (spec 0017), even if the reader had switched to
  // Documents on the stage (or project) they came from. StageHome itself never remounts on
  // either of those (App.tsx keeps it mounted and only changes `projectPath`/`stageId`), so the
  // default has to be re-asserted here rather than left to the initial state, which only fires
  // once. Keyed on BOTH, via `stageHomeKey`, not `stageId` alone: `viewedStageId` resets to
  // `undefined` on every project open (App.tsx's `openPath`), which is not a change at all when
  // the reader never picked a specific stage in the PREVIOUS project either — that was bug #2,
  // where an `undefined`-to-`undefined` "switch" silently kept the reader on Documents.
  useEffect(() => { setTab('workflow') }, [stageHomeKey(projectPath, stageId)])

  const toggle = async (question: SignOffQuestion, confirmed: boolean) => {
    if (!readiness) return
    setBusyId(question.id)
    setConfirmError(null)
    const result = await window.studio.setJudgementConfirmation(projectPath, readiness.stageId, question.id, confirmed, actor)
    if (!result.ok) setConfirmError(result.error ?? 'The confirmation was not recorded.')
    await refresh()
    setBusyId(null)
  }

  if (loading && !readiness) {
    return <p className="text-sm text-slate-400">Checking this stage…</p>
  }
  if (!readiness?.ok) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[var(--color-command-error)]">
        {readiness?.error ?? 'Could not read this stage.'}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{readiness.display}</h2>
        {readiness.description && <p className="mt-1 text-sm text-slate-500">{readiness.description}</p>}
      </div>

      <div role="tablist" aria-label="Stage view" className="flex gap-1 border-b border-slate-200">
        <TabButton label="Workflow" active={tab === 'workflow'} onClick={() => setTab('workflow')} />
        <TabButton label="Documents" active={tab === 'documents'} onClick={() => setTab('documents')} />
      </div>

      {tab === 'workflow' ? (
        <WorkflowTab
          projectPath={projectPath}
          readiness={readiness}
          actor={actor}
          busyId={busyId}
          confirmError={confirmError}
          onToggleSignOff={toggle}
          onOpenDocument={onOpenDocument}
        />
      ) : (
        <DocumentsTab
          readiness={readiness}
          actor={actor}
          busyId={busyId}
          confirmError={confirmError}
          onOpenDocument={onOpenDocument}
          onToggle={toggle}
        />
      )}

      {/* The action itself — sign off and advance — is a whole-stage decision, not a tab's
          content, so it renders once here rather than inside either tab. Same gate as before
          spec 0017 introduced tabs: this is the CURRENT stage, every document is ready, and
          every judgement question has actually been confirmed. Signing off a stage that is not
          current, or that still has open work, is not a decision this button should be able to
          make look easy. */}
      {readiness.isCurrent && readiness.ready && readiness.judgement.every((q) => q.confirmation) && (
        <SignOffPanel
          projectPath={projectPath}
          readiness={readiness}
          actor={actor}
          setOpening={setOpening}
          onSignedOff={onSignedOff}
        />
      )}
    </div>
  )
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
        active ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'
      }`}
    >
      {label}
    </button>
  )
}
