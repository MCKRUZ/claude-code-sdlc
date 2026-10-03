import type { ReviewStanding } from '../../shared/types'
import {
  messageOf, PANEL_SECONDARY_BUTTON, PanelError, plural, useLoaded, useScopedState,
} from './activityPanelBits'

type Strict =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'failed'; message: string }
  | { kind: 'done'; mismatches: number }

const IDLE: Strict = { kind: 'idle' }
const STRICT_FAILED = 'The strict check could not run.'

/** Review (spec 0026): the standing picture of review findings, read-only, plus a strict check that
 * looks for a finding marked fixed whose file never changed. The strict check finding is a RESULT,
 * not an error — only a run that could not happen is an error. */
export function ReviewStandingPanel({ projectPath }: { projectPath: string }) {
  const loaded = useLoaded(projectPath, () => window.studio.getReviewStanding(projectPath), 'The review findings could not be read.')
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
