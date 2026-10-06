// Closing a sprint, confirmed (togo-command-center.md §3.5, §2.4): the dialog shows the EXACT argv
// the closed table builds (`buildSprintVerbArgv`), the actor it is recorded against, the open specs
// the plugin will refuse on if undecided (its exit-1 text by id — the UI mirrors the rule, never
// greys the button on its own count), a Confirm (`data-write`), and the plugin's stdout / stderr
// verbatim under "Done" / "Not done" / "Refused by the plugin". On exit 0 the review page is
// rendered (`generate_sprint_report.py --kind review`) and opened. `closeRequest` is the pure
// builder the close screen and the test share.
import { useRef, useState } from 'react'
import type { ActorInfo, SprintVerbRequest, SprintVerbResult } from '../../shared/types'
import { buildSprintVerbArgv, describeArgv } from '../../shared/sprintVerbArgv'
import { NO_ACTOR } from '../../shared/reasons'
import { Button, Dialog, Notice } from '../ui'
import { VerbResult } from './planning/VerbResult'

export type CloseDecision = { kind: 'carry' | 'drop' | null; reason: string }

/** One `close` request from the person's per-spec decisions: carries need `carryTo`; an undecided
 * spec is simply absent — the plugin lists it with exit 1. */
export function closeRequest(sprintId: string, carryTo: string | null, decisions: Record<string, CloseDecision>): Extract<SprintVerbRequest, { verb: 'close' }> {
  const carry: Record<string, string> = {}
  const drop: Record<string, string> = {}
  for (const [spec, d] of Object.entries(decisions)) {
    if (d.kind === 'carry') carry[spec] = d.reason
    else if (d.kind === 'drop') drop[spec] = d.reason
  }
  return { verb: 'close', sprint: sprintId, carry, drop, ...(Object.keys(carry).length > 0 && carryTo ? { carryTo } : {}) }
}

export interface CloseSprintDialogProps {
  open: boolean
  projectPath: string
  request: Extract<SprintVerbRequest, { verb: 'close' }>
  actor: ActorInfo | null
  /** Open specs with no carry / drop decision — the plugin will name them. */
  undecided: string[]
  /** A carry was chosen but no target sprint picked yet: the argv has no `--carry-to`, said here. */
  missingCarryTo?: boolean
  onClose: () => void
  /** Exit 0 landed and the reads should be re-run. */
  onClosed: () => void
}

export function CloseSprintDialog({ open, projectPath, request, actor, undecided, missingCarryTo = false, onClose, onClosed }: CloseSprintDialogProps) {
  const [result, setResult] = useState<SprintVerbResult | null>(null)
  const [review, setReview] = useState<{ relOutput: string; openError: string | null } | { error: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const argv = buildSprintVerbArgv(request, actor?.name ?? '')

  const confirm = async () => {
    setBusy(true)
    try {
      const r = await window.studio.runSprintVerb(projectPath, request)
      setResult(r)
      if (r.exitCode === 0) {
        onClosed()
        const written = await window.studio.renderSprintReport(projectPath, request.sprint, 'review')
        if (!written.ok) { setReview({ error: written.error }); return }
        const opened = await window.studio.openReport(projectPath, written.relOutput)
        setReview({ relOutput: written.relOutput, openError: opened.ok ? null : (opened.error ?? 'The page could not be opened.') })
      }
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Close ${request.sprint}`} size="lg" initialFocus={confirmRef} data-testid="verb-dialog"
      description="The plugin closes the sprint; every open spec must be carried or dropped with a reason."
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{result ? 'Close' : 'Cancel'}</Button>
          {!result && (
            <Button ref={confirmRef} variant="primary" data-write="" loading={busy} loadingLabel="Closing…" disabled={!argv.ok} disabledReason={!actor ? NO_ACTOR : argv.ok ? undefined : argv.errors.join('; ')} onClick={confirm}>
              Confirm — close the sprint
            </Button>
          )}
        </div>
      )}
    >
      <div className="space-y-3 text-sm">
        <p className="font-mono text-[11px] text-ink-2" data-testid="close-argv">
          {argv.ok ? describeArgv(argv.argv) : describeArgv([request.verb, '--sprint', request.sprint, '--by', actor?.name ?? '(no actor)'])}
        </p>
        <p className="text-xs text-ink-3">
          Recorded against {actor ? <><span className="font-medium text-ink-1">{actor.name}</span> ({actor.source})</> : <span className="text-status-error-ink">{NO_ACTOR}</span>}.
        </p>
        {!argv.ok && (
          <ul className="text-xs text-status-warn-ink" aria-label="Request problems">{argv.errors.map((e) => <li key={e}>• {e}</li>)}</ul>
        )}
        {missingCarryTo && (
          <Notice tone="warn" title="No sprint to carry into">
            <p className="text-xs">A spec is marked Carry but no target sprint is picked, so the argv has no <span className="font-mono">--carry-to</span>; the plugin will say so.</p>
          </Notice>
        )}
        {undecided.length > 0 && (
          <Notice tone="warn" title="Still undecided">
            <p className="text-xs">The plugin will refuse to close while these are neither carried nor dropped: <span className="font-mono">{undecided.join(', ')}</span>. Its exit-1 text names them.</p>
          </Notice>
        )}
        {result && (
          <div data-testid="verb-result" className="space-y-2">
            <VerbResult result={result} />
            {review && 'error' in review && <Notice tone="error">{review.error}</Notice>}
            {review && 'relOutput' in review && (
              <p className="text-xs text-ink-2" data-testid="review-written">Review page written: <span className="font-mono">{review.relOutput}</span>{review.openError ? ` — ${review.openError}` : ''}</p>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}
