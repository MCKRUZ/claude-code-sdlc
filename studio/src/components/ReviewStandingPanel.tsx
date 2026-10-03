import { useState } from 'react'
import type { ReviewMode, ReviewStanding } from '../../shared/types'
import {
  messageOf, PANEL_BUTTON, PANEL_SECONDARY_BUTTON, PanelError, plural, useLoaded, useScopedState,
} from './activityPanelBits'
import { BusyReason, PanelCandidateView } from './CandidateView'
import type { DraftJobApi } from './useDraftJob'

type Strict =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'failed'; message: string }
  | { kind: 'done'; mismatches: number }

const IDLE: Strict = { kind: 'idle' }
const STRICT_FAILED = 'The strict check could not run.'

/** Review (spec 0026, 0027): the standing picture of review findings, read-only, plus a strict check
 * that looks for a finding marked fixed whose file never changed. The strict check finding is a
 * RESULT, not an error — only a run that could not happen is an error. Given the shared draft job and
 * a stage, it also runs the review itself; the standing is read again after a Keep records findings. */
export function ReviewStandingPanel({
  projectPath, stageId, draft, actor = '',
}: { projectPath: string; stageId?: string; draft?: DraftJobApi; actor?: string }) {
  const loaded = useLoaded(
    `${projectPath}|${draft?.keptCount ?? 0}`,
    () => window.studio.getReviewStanding(projectPath),
    'The review findings could not be read.',
  )
  const [strict, setStrict, isCurrent] = useScopedState<Strict>(projectPath, IDLE)

  const check = async () => {
    setStrict({ kind: 'running' })
    try {
      const result = await window.studio.runStrictReviewCheck(projectPath)
      if (!isCurrent(projectPath)) return
      setStrict(result.ok ? { kind: 'done', mismatches: result.mismatches } : { kind: 'failed', message: result.error || STRICT_FAILED })
    } catch (err) {
      if (isCurrent(projectPath)) setStrict({ kind: 'failed', message: messageOf(err, STRICT_FAILED) })
    }
  }

  // The standing's own failure is the one error line; the strict check's failure only shows when
  // the standing loaded, so the panel never carries two.
  return (
    <div data-testid="review-standing-panel" className="mt-2 space-y-1 text-xs text-slate-600">
      {loaded.kind === 'loading' && <p>Checking…</p>}
      {loaded.kind === 'failed' && <PanelError message={loaded.message} />}
      {loaded.kind === 'ready' && <Standing standing={loaded.value} />}
      <button type="button" disabled={strict.kind === 'running'} onClick={check} className={PANEL_SECONDARY_BUTTON}>
        {strict.kind === 'running' ? 'Checking…' : 'Strict check'}
      </button>
      {strict.kind === 'failed' && loaded.kind !== 'failed' && <PanelError message={strict.message} />}
      {strict.kind === 'done' && <StrictResult mismatches={strict.mismatches} />}
      {draft && stageId !== undefined && <ReviewRun stageId={stageId} draft={draft} actor={actor} />}
    </div>
  )
}

function Standing({ standing }: { standing: ReviewStanding }) {
  const { tracked, openDebt, fixedClaimMismatches: mismatched } = standing
  if (tracked === 0) return <p>No review findings recorded yet</p>
  return (
    <p>
      {tracked} {plural(tracked, 'finding', 'findings')} tracked, {openDebt} still open, {mismatched} marked fixed without a change to{' '}
      {plural(mismatched, 'its', 'their')} file
    </p>
  )
}

function StrictResult({ mismatches }: { mismatches: number }) {
  if (mismatches === 0) return <p>No false fixed-claims found</p>
  return (
    <p>
      {mismatches} {plural(mismatches, 'finding is', 'findings are')} marked fixed but {plural(mismatches, 'its file', 'their files')} never changed
    </p>
  )
}

/** The wording is condensed from commands/sdlc-review.md (its modes and its "When to Use"). */
const MODES: Array<{ mode: ReviewMode; label: string; when: string }> = [
  { mode: 'council', label: 'Council', when: 'Seven viewpoints (Architecture, Product, Quality, Security, Design, Data, Bizreq). Use in Design to check the architecture from several angles.' },
  { mode: 'adversarial', label: 'Adversarial', when: 'A cynical QA reader who challenges every assumption. Use in the Build loop on a spec or a hardening pass.' },
  { mode: 'edge-cases', label: 'Edge cases', when: 'Walks every path looking for unhandled conditions. Use in Foundation to find gaps in the walking-skeleton spec and the risk-tier map.' },
  { mode: 'all', label: 'All', when: 'Runs all three and writes one combined report.' },
]

function ReviewRun({ stageId, draft, actor }: { stageId: string; draft: DraftJobApi; actor: string }) {
  const [mode, setMode] = useState<ReviewMode>('council')
  return (
    <div className="space-y-1.5 border-t border-slate-100 pt-2">
      <div role="radiogroup" aria-label="Review mode" className="space-y-1">
        {MODES.map((option) => (
          <label key={option.mode} className="flex items-start gap-2">
            <input
              type="radio"
              name="review-mode"
              value={option.mode}
              checked={mode === option.mode}
              onChange={() => setMode(option.mode)}
              className="mt-0.5"
            />
            <span><span className="font-medium text-slate-800">{option.label}</span> <span className="text-slate-500">{option.when}</span></span>
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={draft.busyLabel !== null}
        onClick={() => void draft.start({ kind: 'review', stageId, mode })}
        className={PANEL_BUTTON}
      >
        Run the review
      </button>
      <BusyReason label={draft.busyLabel} />
      <p>Uses Claude.</p>
      <PanelCandidateView draft={draft} actor={actor} kind="review" stageId={stageId} />
    </div>
  )
}
