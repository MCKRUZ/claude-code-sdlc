import { useEffect, useRef, useState } from 'react'
import type { OpenDocumentResult, SignOffQuestion, StageReadiness } from '../../shared/types'
import { computeWorkflowSteps, type WorkflowStep, type WorkflowStepStatus } from '../workflowSteps'
import { MarkdownView } from './MarkdownView'
import { SignOffQuestions } from './SignOffQuestions'

/** How often the live panel re-reads the current step's document. Each poll is a real
 * subprocess round trip through `openDocument()`'s shape-library CLI, not a cheap read — spec
 * 0017's own Decision List calls this a deliberate cost/freshness tradeoff, not a default to
 * shrink later without noticing the cost. */
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
        {current?.kind === 'document' && (
          current.document.folder ? (
            <p className="text-sm text-slate-400">
              {current.title} is a folder of documents — open it from the Documents tab.
            </p>
          ) : (
            <LiveDocumentPanel
              key={current.document.path}
              projectPath={projectPath}
              relPath={current.document.path}
            />
          )
        )}

        {current?.kind === 'sign-off' && (
          readiness.judgement.length > 0 ? (
            <SignOffQuestions
              questions={readiness.judgement}
              actor={actor}
              busyId={busyId}
              error={confirmError}
              onToggle={onToggleSignOff}
            />
          ) : (
            <p className="text-sm text-slate-400">
              Nothing further needs confirming before this stage can be signed off.
            </p>
          )
        )}

        {!current && <p className="text-sm text-slate-400">Nothing is currently in progress on this stage.</p>}
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

/** The exact string `electron/main/documents.ts`'s `openDocument()` returns for a document that
 * has not been created yet — matched precisely rather than guessed at, so a real error is never
 * mistaken for "still waiting", and vice versa. */
function notCreatedError(relPath: string): string {
  return `${relPath} does not exist`
}

/** The current step's real file, read through the exact same `openDocument()` the structured
 * editor uses, polled while this panel is mounted — which is to say, while the Workflow tab is
 * showing and this is the current step. Leaving the tab (or the current step moving on) unmounts
 * this panel and stops the polling with it; there is no separate visibility flag to fall out of
 * sync with that. Read-only: nothing here writes, edits, or offers to. */
function LiveDocumentPanel({ projectPath, relPath }: { projectPath: string; relPath: string }) {
  const [doc, setDoc] = useState<OpenDocumentResult | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastJson = useRef<string>('')

  useEffect(() => {
    let cancelled = false
    lastJson.current = ''

    const poll = async () => {
      const result = await window.studio.openDocument(projectPath, relPath)
      if (cancelled) return

      if (!result.ok) {
        if (result.error === notCreatedError(relPath)) {
          setWaiting(true)
          setError(null)
        } else {
          setError(result.error ?? 'Could not open this document.')
        }
        return
      }

      setWaiting(false)
      setError(null)
      // Only replace what is on screen when the content actually changed. Every poll is still
      // a real call through the shape library — this only stops an unchanged answer from
      // flickering the panel or resetting a reader's scroll position.
      const json = JSON.stringify(result)
      if (json !== lastJson.current) {
        lastJson.current = json
        setDoc(result)
      }
    }

    poll()
    const id = window.setInterval(poll, POLL_MS)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [projectPath, relPath])

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[var(--color-command-error)]">
        {error}
      </div>
    )
  }
  if (waiting) {
    return (
      <p className="text-sm text-slate-400">
        Not started yet — this will appear here as soon as it is created.
      </p>
    )
  }
  if (!doc) {
    return <p className="text-sm text-slate-400">Opening…</p>
  }

  const shown = doc.sections.filter((s) => s.text.trim() !== '')

  return (
    <div data-testid="live-document-panel" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      {shown.length > 0 ? (
        shown.map((s) => <MarkdownView key={s.key} source={s.text} />)
      ) : (
        <p className="text-sm text-slate-400">This document is still empty.</p>
      )}
    </div>
  )
}
