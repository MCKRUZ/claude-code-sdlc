import { useEffect, useRef, useState } from 'react'
import type { SignOffQuestion, StageReadiness } from '../../shared/types'
import { computeWorkflowSteps, type WorkflowStep, type WorkflowStepStatus } from '../workflowSteps'
import { startDocumentPolling } from '../documentPoller'
import type { DocumentSnapshot } from '../documentSnapshot'
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
}: {
  projectPath: string
  readiness: StageReadiness
  /** Who a sign-off confirmation is recorded under; empty when nobody is signed in. */
  actor: string
  busyId: string | null
  confirmError: string | null
  onToggleSignOff: (question: SignOffQuestion, confirmed: boolean) => void
}) {
  const steps = computeWorkflowSteps(readiness)
  const current = steps.find((s) => s.status === 'current') ?? null

  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      <ol className="space-y-2 sm:w-72 sm:shrink-0">
        {steps.map((step) => <StepRow key={step.key} step={step} />)}
      </ol>

      {/* The ONLY place any step's real content appears — never inside a step's own row. That is
          what makes a locked row's absence and a done row's absence both true by construction
          rather than by care: neither status ever reaches this branch. */}
      <div className="min-w-0 flex-1">
        <CurrentStepPanel projectPath={projectPath} current={current} readiness={readiness} actor={actor} busyId={busyId} confirmError={confirmError} onToggleSignOff={onToggleSignOff} />
      </div>
    </div>
  )
}

/** What shows beside the step list: the current document step's live content, the sign-off
 * questions, a folder notice, or nothing. Pulled out of `WorkflowTab` itself so that function
 * stays a plain layout — this repo's "functions under 50 lines" convention (spec 0017's fix
 * pass, bug #10). */
function CurrentStepPanel({
  projectPath, current, readiness, actor, busyId, confirmError, onToggleSignOff,
}: {
  projectPath: string
  current: WorkflowStep | null
  readiness: StageReadiness
  actor: string
  busyId: string | null
  confirmError: string | null
  onToggleSignOff: (question: SignOffQuestion, confirmed: boolean) => void
}) {
  if (current?.kind === 'document') {
    if (current.document.folder) {
      return (
        <p className="text-sm text-slate-400">
          {current.title} is a folder of documents — open it from the Documents tab.
        </p>
      )
    }
    return <LiveDocumentPanel key={current.document.path} projectPath={projectPath} relPath={current.document.path} />
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
