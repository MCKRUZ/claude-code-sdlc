import { useEffect, useRef, useState } from 'react'
import type { DocumentFocus, SignOffQuestion, StageReadiness } from '../../shared/types'
import {
  computeWorkflowSteps, type DocumentWorkflowStep, type WorkflowStep, type WorkflowStepStatus,
} from '../workflowSteps'
import { startDocumentPolling } from '../documentPoller'
import type { DocumentSnapshot } from '../documentSnapshot'
import { stageHomeKey } from '../stageHomeKey'
import { ActivitiesPanel } from './ActivitiesPanel'
import { SectionCard } from './DocumentSections'
import { SignOffQuestions } from './SignOffQuestions'

/** How often the live panel re-reads the current step's document. Each poll is a real
 * subprocess round trip through `openDocument()`'s shape-library CLI, not a cheap read — spec
 * 0017's own Decision List calls this a deliberate cost/freshness tradeoff, not a default to
 * shrink later without noticing the cost. Paused while the window/tab is not visible — see
 * `documentPoller.ts`. */
const POLL_MS = 2000

/** A stage's home page, redrawn as a guided sequence (spec 0017): one step per required
 * document in the stage's own declared order, plus a trailing Sign-off step, with the current
 * step's real content shown live beside the list — steps above the file at phone width.
 *
 * Step status comes from `computeWorkflowSteps`, the same function the shared-source
 * acceptance check depends on, so this component makes no decision of its own about what is
 * done, current or locked — it only draws what that function already decided. Read-only by
 * construction: nothing here edits a document, that stays the structured editor and chat. */
export function WorkflowTab({
  projectPath,
  readiness,
  actor,
  busyId,
  confirmError,
  onToggleSignOff,
  onOpenDocument,
  onRefresh,
}: {
  projectPath: string
  readiness: StageReadiness
  /** Who a sign-off confirmation is recorded under; empty when nobody is signed in. */
  actor: string
  busyId: string | null
  confirmError: string | null
  onToggleSignOff: (question: SignOffQuestion, confirmed: boolean) => void
  /** Opens the same structured editor the Documents tab's rows open — the document panel's own
   * Edit control (spec 0018) reuses this exact callback, never a second write path. */
  onOpenDocument: (relPath: string, focus?: DocumentFocus) => void
  /** Re-reads the stage after an activity changed the project (starting documents). */
  onRefresh?: () => Promise<void>
}) {
  const steps = computeWorkflowSteps(readiness)
  const current = steps.find((s) => s.status === 'current') ?? null

  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      <div className="sm:w-72 sm:shrink-0">
        <ol className="space-y-2">
          {steps.map((step) => <StepRow key={step.key} step={step} />)}
        </ol>
        {/* Keyed on stage + project so one stage's result line never shows under another. */}
        <ActivitiesPanel
          key={stageHomeKey(projectPath, readiness.stageId)}
          projectPath={projectPath}
          readiness={readiness}
          actor={actor}
          onOpenDocument={onOpenDocument}
          onRefresh={onRefresh}
        />
      </div>

      {/* The ONLY place any step's real content appears — never inside a step's own row. That is
          what makes a locked row's absence and a done row's absence both true by construction
          rather than by care: neither status ever reaches this branch. */}
      <div className="min-w-0 flex-1">
        <CurrentStepPanel
          projectPath={projectPath}
          current={current}
          steps={steps}
          readiness={readiness}
          actor={actor}
          busyId={busyId}
          confirmError={confirmError}
          onToggleSignOff={onToggleSignOff}
          onOpenDocument={onOpenDocument}
          onRefresh={onRefresh}
        />
      </div>
    </div>
  )
}

/** What shows beside the step list: the current document step's live content, the sign-off
 * questions, a folder notice, or nothing. Pulled out of `WorkflowTab` itself so that function
 * stays a plain layout — this repo's "functions under 50 lines" convention (spec 0017's fix
 * pass, bug #10). */
function CurrentStepPanel({
  projectPath, current, steps, readiness, actor, busyId, confirmError, onToggleSignOff, onOpenDocument, onRefresh,
}: {
  projectPath: string
  current: WorkflowStep | null
  steps: WorkflowStep[]
  readiness: StageReadiness
  actor: string
  busyId: string | null
  confirmError: string | null
  onToggleSignOff: (question: SignOffQuestion, confirmed: boolean) => void
  onOpenDocument: (relPath: string, focus?: DocumentFocus) => void
  onRefresh?: () => Promise<void>
}) {
  if (current?.kind === 'document') {
    return (
      <DocumentStepPanel
        projectPath={projectPath}
        current={current}
        steps={steps}
        stageKey={stageHomeKey(projectPath, readiness.stageId)}
        onOpenDocument={onOpenDocument}
        onRefresh={onRefresh}
      />
    )
  }

  if (current?.kind === 'sign-off') {
    if (readiness.judgement.length === 0) {
      return <p className="text-sm text-slate-400">Nothing further needs confirming before this stage can be signed off.</p>
    }
    return (
      <SignOffQuestions
        questions={readiness.judgement}
        actor={actor}
        busyId={busyId}
        error={confirmError}
        onToggle={onToggleSignOff}
      />
    )
  }

  return <p className="text-sm text-slate-400">Nothing is currently in progress on this stage.</p>
}

/** The current step, once it IS a document (spec 0018): a header (Back to Workflow / Previous /
 * Next / Edit) above the live content.
 *
 * `viewedKey` is deliberately separate from `current` — Previous/Next lets a person browse an
 * ADJACENT document in the stage's own declared order without that changing what the workflow
 * itself considers current (`computeWorkflowSteps`'s done/current/locked stays exactly as it
 * was). "Back to Workflow" snaps the view back to the real current step; so does the current
 * step itself moving on, or the stage changing underneath — the same reset-on-switch pattern
 * StageHome already uses for its own tab (`stageHomeKey`). The step LIST stays exactly as spec
 * 0017 left it: its rows are not a second way to navigate here, only Previous/Next in this
 * header is.
 *
 * The reset effect keys on `stageKey` (`stageHomeKey(projectPath, readiness.stageId)`) ALONGSIDE
 * `current.key`, not `current.key` alone (PR #76 review finding #6): `current.key` is just the
 * current document's own PATH, and two different stages' (or two different projects', browsing
 * the same profile's templates) current documents can share that exact string — when they do,
 * switching between them leaves `current.key` unchanged, so an effect keyed on it alone never
 * re-fires, and a document the person had browsed to in the OLD stage keeps showing even though
 * the workflow itself has moved on underneath. */
function DocumentStepPanel({
  projectPath, current, steps, stageKey, onOpenDocument, onRefresh,
}: {
  projectPath: string
  current: DocumentWorkflowStep
  steps: WorkflowStep[]
  stageKey: string
  onOpenDocument: (relPath: string, focus?: DocumentFocus) => void
  onRefresh?: () => Promise<void>
}) {
  const documentSteps = steps.filter((s): s is DocumentWorkflowStep => s.kind === 'document')
  const [viewedKey, setViewedKey] = useState(current.key)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  useEffect(() => { setViewedKey(current.key) }, [current.key, stageKey])
  // A different document is a fresh start: its predecessor's refusal does not belong to it.
  useEffect(() => { setStartError(null) }, [viewedKey, stageKey])

  const viewedIndex = documentSteps.findIndex((s) => s.key === viewedKey)
  const viewed = viewedIndex >= 0 ? documentSteps[viewedIndex] : current

  /** Creates the document from the plugin's template, re-reads the stage, then opens it. A refusal
   * is shown and nothing opens. Never overwrites (the main process refuses to). */
  const start = async () => {
    if (starting) return
    setStarting(true)
    setStartError(null)
    const result = await window.studio.startDocument(projectPath, viewed.document.path)
    if (!result.ok) {
      setStartError(result.error ?? 'This document could not be started.')
      setStarting(false)
      return
    }
    await onRefresh?.()
    setStarting(false)
    onOpenDocument(viewed.document.path)
  }

  return (
    <div className="space-y-3">
      <DocumentPanelHeader
        title={viewed.title}
        onBack={() => setViewedKey(current.key)}
        onPrevious={() => setViewedKey(documentSteps[viewedIndex - 1].key)}
        onNext={() => setViewedKey(documentSteps[viewedIndex + 1].key)}
        previousDisabled={viewedIndex <= 0}
        nextDisabled={viewedIndex === -1 || viewedIndex >= documentSteps.length - 1}
        onEdit={() => onOpenDocument(viewed.document.path)}
        editDisabled={viewed.document.folder}
        // Edit on a document that is not there only ever failed; offer to start it instead.
        onStart={!viewed.document.exists && !viewed.document.folder ? start : undefined}
        starting={starting}
      />
      {startError && <p role="alert" className="text-sm text-[var(--color-command-error)]">{startError}</p>}
      {viewed.document.folder ? (
        <p className="text-sm text-slate-400">
          {viewed.title} is a folder of documents — open it from the Documents tab.
        </p>
      ) : (
        <LiveDocumentPanel key={viewed.document.path} projectPath={projectPath} relPath={viewed.document.path} />
      )}
    </div>
  )
}

/** Back to Workflow / Previous / Next / Edit — the document panel's own header (spec 0018's
 * acceptance check). `flex-wrap` is the same accommodation spec 0017's own responsive bar held
 * itself to: these controls do not force new horizontal overflow of their own at phone width. */
function DocumentPanelHeader({
  title, onBack, onPrevious, onNext, previousDisabled, nextDisabled, onEdit, editDisabled, onStart, starting,
}: {
  title: string
  onBack: () => void
  onPrevious: () => void
  onNext: () => void
  previousDisabled: boolean
  nextDisabled: boolean
  onEdit: () => void
  editDisabled: boolean
  /** Set only for a document that does not exist yet: replaces Edit with Start this document. */
  onStart?: () => void
  starting: boolean
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
      <div className="min-w-0">
        <button type="button" onClick={onBack} className="text-xs font-medium text-slate-500 hover:text-slate-800">
          ← Back to Workflow
        </button>
        <h3 className="mt-0.5 truncate text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button
          type="button"
          onClick={onPrevious}
          disabled={previousDisabled}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 disabled:opacity-40"
        >
          Next
        </button>
        <button
          type="button"
          onClick={onStart ?? onEdit}
          disabled={onStart ? starting : editDisabled}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
        >
          {onStart ? (starting ? 'Starting…' : 'Start this document') : 'Edit'}
        </button>
      </div>
    </div>
  )
}

function StepRow({ step }: { step: WorkflowStep }) {
  return (
    <li
      data-testid="workflow-step"
      data-step-key={step.key}
      data-step-status={step.status}
      className={`rounded-xl border px-4 py-3 ${
        step.status === 'current' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        {/* min-w-0 so this can actually shrink below its content's natural width at a narrow
            viewport, instead of forcing the row (and the page) wider — the same pattern
            DocumentsTab already uses for a document's name. Without it, a flex item's default
            min-width is its own content size, and "requirements.md" has nowhere to wrap. */}
        <span className="min-w-0 truncate text-sm font-medium text-slate-900">{step.title}</span>
        <StepBadge status={step.status} />
      </div>
      {step.description && <p className="mt-0.5 text-xs text-slate-500">{step.description}</p>}
    </li>
  )
}

function StepBadge({ status }: { status: WorkflowStepStatus }) {
  if (status === 'done') {
    return <span className="shrink-0 text-xs font-medium text-[var(--color-command-ok)]">Complete</span>
  }
  if (status === 'current') {
    return <span className="shrink-0 text-xs font-medium text-brand-700">Current</span>
  }
  return <span className="shrink-0 text-xs font-medium text-slate-400">Locked</span>
}

/** The current step's real file, read through the exact same `openDocument()` the structured
 * editor uses, polled while this panel is mounted, the tab is visible, and this is the current
 * step. Leaving the tab (or the current step moving on) unmounts this panel and stops the
 * polling with it — see `documentPoller.ts` for the pause-while-hidden and
 * discard-stale-response guarantees. Read-only: nothing here writes, edits, or offers to. */
function LiveDocumentPanel({ projectPath, relPath }: { projectPath: string; relPath: string }) {
  const [snapshot, setSnapshot] = useState<DocumentSnapshot | null>(null)
  const lastJson = useRef<string>('')

  useEffect(() => {
    lastJson.current = ''
    setSnapshot(null)

    return startDocumentPolling({
      openDocument: window.studio.openDocument,
      projectPath,
      relPath,
      intervalMs: POLL_MS,
      setInterval: (cb, ms) => window.setInterval(cb, ms),
      clearInterval: (id) => window.clearInterval(id as number),
      isHidden: () => document.hidden,
      onVisibilityChange: (cb) => {
        document.addEventListener('visibilitychange', cb)
        return () => document.removeEventListener('visibilitychange', cb)
      },
      onSnapshot: (next) => {
        // Only replace what is on screen when the content actually changed. Every poll is
        // still a real call through the shape library — this only stops an unchanged answer
        // from flickering the panel or resetting a reader's scroll position.
        const json = JSON.stringify(next)
        if (json !== lastJson.current) {
          lastJson.current = json
          setSnapshot(next)
        }
      },
    })
  }, [projectPath, relPath])

  return <LiveDocumentPanelContent snapshot={snapshot} />
}

/** Renders one `DocumentSnapshot` — split out of `LiveDocumentPanel` so that function stays
 * about SCHEDULING (spec 0017's fix pass, bug #10) and this one stays about DISPLAY. */
function LiveDocumentPanelContent({ snapshot }: { snapshot: DocumentSnapshot | null }) {
  if (!snapshot) return <p className="text-sm text-slate-400">Opening…</p>

  if (snapshot.kind === 'error') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[var(--color-command-error)]">
        {snapshot.message}
      </div>
    )
  }
  if (snapshot.kind === 'waiting') {
    return (
      <p className="text-sm text-slate-400">
        Not started yet — this will appear here as soon as it is created.
      </p>
    )
  }

  const { sections } = snapshot.doc
  return (
    <div data-testid="live-document-panel" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      {sections.length > 0 ? (
        // The SAME field-by-field rendering DocumentView uses (bug #9) — an unfilled field
        // reads "Empty", a field the shape declares but the document lacks reads "Not in this
        // document.", never raw placeholder text. Read-only: no `editing`, no `onSaveField`.
        sections.map((s) => <SectionCard key={s.key} section={s} />)
      ) : (
        <p className="text-sm text-slate-400">This document is still empty.</p>
      )}
    </div>
  )
}
