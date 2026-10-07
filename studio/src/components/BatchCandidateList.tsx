import { useState } from 'react'
import type { BatchCandidate, BatchJob } from '../../shared/types'
import { Badge, Card, Notice } from '../ui'
import { MarkdownView } from './MarkdownView'
import { PanelButton, PanelSecondaryButton, plural } from './activityPanelBits'
import type { BatchOutcome, DraftBatchApi } from './useDraftBatch'

export const SIGN_IN_REASON = 'Sign in to keep or discard.'

/** The running total as the runs themselves reported it. No figure (or a zero, which a real run never
 * costs) is left out rather than shown as $0.00, which would read as "free". */
export function costText(costUsd: number | null, prefix: string): string | null {
  if (costUsd === null || costUsd <= 0) return null
  if (costUsd < 0.01) return `${prefix}: less than $0.01`
  return `${prefix}: $${costUsd.toFixed(2)}`
}

function progressLine(job: BatchJob): string {
  if (job.kind === 'analyse') return 'Analysing the documents'
  return `Summarising ${Math.min(job.done + 1, job.total)} of ${job.total}`
}

/** The progress, the candidates waiting for a decision, and what the last decision did (spec 0029).
 * Nothing is on disk until Keep; this component only draws the state and reports the presses. */
export function BatchCandidateList({ batch, actor }: { batch: DraftBatchApi; actor: string }) {
  const { job, candidates } = batch.state
  const { outcome, actionError } = batch
  if (!job && candidates.length === 0 && !outcome && !actionError) return null
  const running = job?.phase === 'running'
  return (
    <div data-testid="batch-view" className="mt-2 space-y-2 text-xs text-ink-2">
      {job && running && <Running job={job} elapsedMs={batch.elapsedMs} onCancel={() => void batch.cancel()} />}
      {job && !running && candidates.length > 0 && <Header job={job} candidates={candidates} />}
      {job && !running && candidates.length === 0 && !outcome && <p>The run produced no results.</p>}
      {!running && candidates.length > 0 && <Waiting batch={batch} actor={actor} />}
      {actionError && <Notice tone="error" role="alert" data-testid="batch-action-error">{actionError}</Notice>}
      {outcome && <Outcome outcome={outcome} />}
    </div>
  )
}

/** "Summarising 2 of 5" is the job's own count, swapped as text — a progress figure is a fact. */
function Running({ job, elapsedMs, onCancel }: { job: BatchJob; elapsedMs: number; onCancel: () => void }) {
  const cost = costText(job.costUsd, 'Cost so far')
  return (
    <div data-testid="batch-running" aria-busy="true" className="space-y-1">
      <p className="text-ink-1">{progressLine(job)}</p>
      {job.currentLabel && <p data-testid="batch-current">{job.currentLabel}</p>}
      <p>Working for {Math.floor(elapsedMs / 1000)} s</p>
      {cost && <p data-testid="batch-cost">{cost}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <PanelSecondaryButton data-testid="batch-cancel" onClick={onCancel}>Cancel</PanelSecondaryButton>
        <span>Finished results are kept.</span>
      </div>
    </div>
  )
}

function Header({ job, candidates }: { job: BatchJob; candidates: BatchCandidate[] }) {
  const ready = candidates.filter((c) => c.status === 'ready').length
  const failed = candidates.length - ready
  const cost = costText(job.costUsd, 'Cost')
  const text = job.phase === 'cancelled'
    ? `Cancelled — ${ready} finished ${plural(ready, 'result', 'results')} kept.`
    : `Finished: ${ready} ready${failed > 0 ? `, ${failed} failed` : ''}.`
  return (
    <div data-testid="batch-header" className="space-y-0.5">
      <p className="font-medium text-ink-1">{text}</p>
      {cost && <p data-testid="batch-cost">{cost}</p>}
    </div>
  )
}

function Waiting({ batch, actor }: { batch: DraftBatchApi; actor: string }) {
  const { candidates } = batch.state
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set())
  const ready = candidates.filter((c) => c.status === 'ready')
  const ticked = ready.filter((c) => !unticked.has(c.id)).map((c) => c.id)
  const signedIn = actor.trim() !== ''
  const blocked = batch.acting || !signedIn
  const partlyKept = (batch.outcome?.saved?.length ?? 0) > 0
  const toggle = (id: string) => setUnticked((prev) => {
    const next = new Set(prev)
    if (!next.delete(id)) next.add(id)
    return next
  })
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {candidates.map((c) => (
          <CandidateRow key={c.id} candidate={c} ticked={!unticked.has(c.id)} disabled={batch.acting} onToggle={() => toggle(c.id)} />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-1.5">
        <PanelButton data-testid="batch-keep-all" disabled={blocked || ready.length === 0} onClick={() => void batch.keep(actor)}>
          Keep all
        </PanelButton>
        <PanelSecondaryButton data-testid="batch-keep-selected" disabled={blocked || ticked.length === 0} onClick={() => void batch.keep(actor, ticked)}>
          Keep selected
        </PanelSecondaryButton>
        {partlyKept && ready.length > 0 && (
          <PanelSecondaryButton data-testid="batch-discard-rest" disabled={blocked} onClick={() => void batch.discard(actor, ready.map((c) => c.id))}>
            Discard the rest
          </PanelSecondaryButton>
        )}
        <PanelSecondaryButton data-testid="batch-discard-all" disabled={blocked} onClick={() => void batch.discard(actor)}>
          Discard all
        </PanelSecondaryButton>
        {!signedIn && <span data-testid="batch-sign-in-reason" className="text-ink-3">{SIGN_IN_REASON}</span>}
      </div>
    </div>
  )
}

interface RowProps { candidate: BatchCandidate; ticked: boolean; disabled: boolean; onToggle: () => void }

function CandidateRow({ candidate, ticked, disabled, onToggle }: RowProps) {
  if (candidate.status === 'failed') {
    return (
      <Card as="li" padding="sm" data-testid="batch-candidate" data-status="failed" className="rounded-lg">
        <p className="flex items-center gap-1.5"><span className="font-medium text-ink-1">{candidate.label}</span> <Badge kind="notReady">failed</Badge></p>
        <p data-testid="batch-candidate-error">{candidate.error ?? 'The run did not produce a result.'}</p>
      </Card>
    )
  }
  return (
    <Card as="li" tone="info" padding="sm" data-testid="batch-candidate" data-status="ready" className="rounded-lg">
      <label className="flex items-center gap-2">
        <input type="checkbox" aria-label={`Keep ${candidate.label}`} checked={ticked} disabled={disabled} onChange={onToggle} />
        <span className="font-medium text-ink-1">{candidate.label}</span>
      </label>
      <p className="break-all">{candidate.target}</p>
      {candidate.replacesExisting && <p data-testid="batch-replace-note">This replaces the existing file.</p>}
      <Preview text={candidate.text} label={candidate.label} />
    </Card>
  )
}

function Preview({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-1">
      <PanelSecondaryButton aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} preview of ${label}`} onClick={() => setOpen(!open)}>
        {open ? 'Hide preview' : 'Show preview'}
      </PanelSecondaryButton>
      {open && <div data-testid="batch-preview" className="mt-1"><MarkdownView source={text} /></div>}
    </div>
  )
}

function Outcome({ outcome }: { outcome: BatchOutcome }) {
  const saved = outcome.saved ?? []
  return (
    <div data-testid="batch-outcome" className="space-y-1">
      {saved.length > 0 && (
        <>
          <p data-testid="batch-saved" className="text-ink-1">Saved {saved.length} {plural(saved.length, 'file', 'files')}.</p>
          {saved.map((s) => <p key={s.target} className="break-all">Written: {s.target}</p>)}
        </>
      )}
      {outcome.failed.length > 0 && (
        <>
          <p className="text-ink-1">Not written:</p>
          {outcome.failed.map((f) => <p key={f.id} data-testid="batch-keep-failed">{f.label}: {f.error}</p>)}
        </>
      )}
      {outcome.discarded !== null && (
        <p data-testid="batch-discarded">Discarded {outcome.discarded} {plural(outcome.discarded, 'result', 'results')}.</p>
      )}
      {outcome.warnings.map((w) => <p key={w} className="text-ink-3">{w}</p>)}
    </div>
  )
}
