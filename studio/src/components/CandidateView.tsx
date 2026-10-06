import type { DraftCandidate, DraftKind } from '../../shared/types'
import { Card, Eyebrow, Notice } from '../ui'
import { MarkdownView } from './MarkdownView'
import { PanelButton, PanelSecondaryButton } from './activityPanelBits'
import { draftStateFor, type DraftJobApi, type DraftUiState } from './useDraftJob'

const baseName = (path: string) => path.split('/').pop() ?? path

/** The cost as the run reported it. No figure (or a zero, which a real run never costs) is left out
 * rather than shown as $0.00, which would read as "free". */
export function costLine(costUsd: number | null): string | null {
  if (costUsd === null || costUsd <= 0) return null
  if (costUsd < 0.01) return 'Cost: less than $0.01'
  return `Cost: $${costUsd.toFixed(2)}`
}

export interface CandidateViewProps {
  state: DraftUiState
  /** False when nobody is signed in: Keep and Discard are recorded under a person's name. */
  signedIn: boolean
  onCancel: () => void
  onKeep: () => void
  onDiscard: () => void
  onRetry: () => void
}

/** The progress, candidate, saved line or error of the one model job (spec 0027). Nothing is on
 * disk until Keep; this component only draws the state and reports the button presses. */
export function CandidateView({ state, signedIn, onCancel, onKeep, onDiscard, onRetry }: CandidateViewProps) {
  if (state.phase === 'idle' && state.notice === null) return null
  return (
    <div data-testid="candidate-view" className="mt-2 space-y-1.5 text-xs text-ink-2">
      {state.phase === 'idle' && <p>{state.notice}</p>}
      {state.phase === 'running' && <Running state={state} onCancel={onCancel} />}
      {state.phase === 'candidate' && (
        <Candidate
          candidate={state.candidate}
          acting={state.acting}
          actionError={state.actionError}
          signedIn={signedIn}
          onKeep={onKeep}
          onDiscard={onDiscard}
        />
      )}
      {state.phase === 'saved' && <Saved state={state} />}
      {state.phase === 'error' && (
        <>
          <Notice tone="error" role="alert" data-testid="draft-error">{state.message}</Notice>
          <PanelSecondaryButton onClick={onRetry}>Try again</PanelSecondaryButton>
        </>
      )}
    </div>
  )
}

/** The elapsed seconds are the job's own clock (useDraftJob's 1 s tick), not a counter animation:
 * a running figure is a fact, so it changes by text swap. */
function Running({ state, onCancel }: { state: Extract<DraftUiState, { phase: 'running' }>; onCancel: () => void }) {
  return (
    <div data-testid="draft-running" aria-busy="true" className="space-y-1">
      <p className="text-ink-1">{state.activity ?? 'Starting…'}</p>
      <p>Working for {Math.floor(state.elapsedMs / 1000)} s</p>
      <PanelSecondaryButton data-testid="draft-cancel" onClick={onCancel}>Cancel</PanelSecondaryButton>
    </div>
  )
}

function Candidate({
  candidate, acting, actionError, signedIn, onKeep, onDiscard,
}: {
  candidate: DraftCandidate
  acting: boolean
  actionError: string | null
  signedIn: boolean
  onKeep: () => void
  onDiscard: () => void
}) {
  const cost = costLine(candidate.costUsd)
  const blocked = acting || !signedIn
  return (
    <Card tone="info" padding="sm" className="rounded-lg">
      <Eyebrow className="text-accent-800">Drafted by Claude</Eyebrow>
      <div data-testid="candidate-text" className="mt-1"><MarkdownView source={candidate.text} /></div>
      {cost && <p data-testid="candidate-cost" className="mt-2">{cost}</p>}
      {candidate.replacesExisting && (
        <p data-testid="draft-replace-note" className="mt-1">
          This will replace the existing {candidate.kind === 'review' ? 'report' : 'summary'}.
        </p>
      )}
      {actionError && (
        <Notice tone="error" role="alert" data-testid="draft-action-error" className="mt-2">{actionError}</Notice>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <PanelButton data-testid="draft-keep" disabled={blocked} onClick={onKeep}>Keep</PanelButton>
        <PanelSecondaryButton data-testid="draft-discard" disabled={blocked} onClick={onDiscard}>Discard</PanelSecondaryButton>
        {!signedIn && <span data-testid="draft-sign-in-reason" className="text-ink-3">Sign in to keep or discard.</span>}
      </div>
    </Card>
  )
}

function Saved({ state }: { state: Extract<DraftUiState, { phase: 'saved' }> }) {
  const findings = state.scope.kind !== 'review' || state.findingsRecorded === undefined
    ? ''
    : state.findingsRecorded ? ' Findings recorded.' : ' No findings table was found, so no findings were recorded.'
  return (
    <>
      <p data-testid="draft-saved" className="text-ink-1">Saved {baseName(state.written)}.{findings}</p>
      {state.warning && <p data-testid="draft-warning" className="text-ink-3">{state.warning}</p>}
    </>
  )
}

/** The one progress / candidate area a panel draws, bound to the shared job: it shows only the job
 * that belongs to this panel's kind and stage, and signs Keep / Discard with the person's name. */
export function PanelCandidateView({
  draft, actor, kind, stageId,
}: { draft: DraftJobApi; actor: string; kind: DraftKind; stageId: string }) {
  const state = draftStateFor(draft.state, kind, stageId)
  if (state === null) return null
  return (
    <CandidateView
      state={state}
      signedIn={actor.trim() !== ''}
      onCancel={() => void draft.cancel()}
      onKeep={() => void draft.keep(actor)}
      onDiscard={() => void draft.discard(actor)}
      onRetry={() => void draft.retry()}
    />
  )
}

/** Why the start buttons are off: another job is running, or one is waiting for Keep / Discard. */
export function BusyReason({ label }: { label: string | null }) {
  if (label === null) return null
  return <p data-testid="draft-busy-reason" className="text-ink-3">Already drafting {label}</p>
}
