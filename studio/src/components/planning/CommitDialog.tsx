// "Commit the sprint", confirmed (togo-command-center.md §3.2, §2.4, §3.6): before anything runs
// the dialog lists the verbs it will run, in order, with the exact `sprint.py` lines the closed
// argv table builds for the slate and `ready` steps and the actor they are recorded against; one
// Confirm (`data-write`); then every step as it lands — `data-testid="commit-step"` — headed by
// its exit code with the plugin's words verbatim, stopping at the first non-zero. Nothing runs
// before Confirm; the host re-reads after the dialog closes if any step ran.
import { useRef, useState } from 'react'
import type { ActorInfo, SprintVerbRequest } from '../../../shared/types'
import { buildSprintVerbArgv, describeArgv } from '../../../shared/sprintVerbArgv'
import { NO_ACTOR, SKIPPED_TIER_CONFIRMATION } from '../../../shared/reasons'
import { Button, Dialog, Notice } from '../../ui'
import { setChanged } from './planningModel'
import type { CommitStep } from './commitSprint'

export const COMMIT_CONFIRM = 'Confirm — commit the sprint'

export interface CommitDialogProps {
  open: boolean
  sprintId: string
  /** What is slated now and what the commit will slate (the same set → no `slate` step). */
  slated: string[]
  specs: string[]
  override?: { reason: string }
  actor: ActorInfo | null
  confirmTierAvailable: boolean
  /** The steps so far, owned by the screen (so the column keeps the record after the dialog closes). */
  steps: CommitStep[]
  committing: boolean
  onConfirm: () => void
  onClose: () => void
}

/** The lines the dialog previews, pure for the test: one per step the sequence will attempt. */
export function commitPreview(input: Pick<CommitDialogProps, 'sprintId' | 'slated' | 'specs' | 'override' | 'confirmTierAvailable'>, actor: string): string[] {
  const line = (req: SprintVerbRequest, boardSpecIds?: readonly string[]) => {
    const r = buildSprintVerbArgv(req, actor, boardSpecIds)
    return r.ok ? describeArgv(r.argv) : `Run: sprint.py ${req.verb} — the table refuses: ${r.errors.join('; ')}`
  }
  const lines: string[] = []
  if (setChanged(input.slated, input.specs)) {
    lines.push(line({ verb: 'slate', sprint: input.sprintId, specs: input.specs, ...(input.override ? { override: true, reason: input.override.reason } : {}) }, input.specs))
  }
  lines.push(line({ verb: 'ready', sprint: input.sprintId }))
  lines.push(`Run: sprint.py plan --sprint ${input.sprintId} --json`)
  lines.push('openReport(rel_output) — the planning page, on this computer')
  lines.push(input.confirmTierAvailable ? 'track_decisions.py open — one decision per unconfirmed tier' : `tier confirmation: ${SKIPPED_TIER_CONFIRMATION}`)
  return lines
}

export function CommitDialog({ open, sprintId, slated, specs, override, actor, confirmTierAvailable, steps, committing, onConfirm, onClose }: CommitDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const [started, setStarted] = useState(false)
  const preview = commitPreview({ sprintId, slated, specs, override, confirmTierAvailable }, actor?.name ?? '(no actor)')
  const confirm = () => { setStarted(true); onConfirm() }
  const finished = started && !committing
  return (
    <Dialog open={open} onClose={onClose} title={`Commit ${sprintId}`} size="lg" initialFocus={confirmRef} data-testid="verb-dialog"
      description="Runs the verbs in order and stops at the first non-zero exit. Each step shows what the plugin answered."
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{finished ? 'Close' : 'Cancel'}</Button>
          {!started && (
            <Button ref={confirmRef} variant="primary" data-write="" disabled={!actor} disabledReason={!actor ? NO_ACTOR : undefined} onClick={confirm}>
              {COMMIT_CONFIRM}
            </Button>
          )}
        </div>
      )}
    >
      <div className="space-y-3 text-sm">
        <ol className="space-y-1 font-mono text-[11px] text-ink-2" aria-label="The plugin will run" data-testid="commit-preview">
          {preview.map((line, i) => <li key={i}>{i + 1}. {line}</li>)}
        </ol>
        <p className="text-xs text-ink-3">
          Recorded against {actor ? <><span className="font-medium text-ink-1">{actor.name}</span> ({actor.source})</> : <span className="text-status-error-ink">{NO_ACTOR}</span>}.
        </p>
        {committing && <p role="status" aria-busy="true" className="text-xs text-ink-3">Committing…</p>}
        {steps.length > 0 && (
          <ol className="space-y-1" aria-label="Commit steps">
            {steps.map((s, i) => (
              <li key={`${s.label}-${i}`} data-testid="commit-step" className="rounded-md bg-surface-2 px-2 py-1.5 text-xs" data-step={s.label} data-exit-code={s.exitCode ?? 'none'}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink-1">{s.label}</span>
                  <span className={s.skipped ? 'text-ink-3' : s.exitCode === 0 ? 'text-status-ok-ink' : s.exitCode === 2 ? 'text-status-error-ink' : 'text-status-warn-ink'}>
                    {s.heading}{s.exitCode !== null ? <span className="font-mono text-ident text-ink-3"> · exit {s.exitCode}</span> : null}
                  </span>
                </div>
                {s.text && <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-ink-2">{s.text}</pre>}
                <p className="mt-0.5 font-mono text-[10px] text-ink-3">{s.source}</p>
              </li>
            ))}
          </ol>
        )}
        {finished && steps.length > 0 && steps[steps.length - 1].exitCode !== 0 && !steps[steps.length - 1].skipped && (
          <Notice tone="warn">Stopped at the first non-zero exit; the steps after it never ran.</Notice>
        )}
      </div>
    </Dialog>
  )
}
