// Recording a verdict (togo-command-center.md §3.1 `v`, §5): the dialog shows the exact argv the
// closed table will run, the actor and its source, the plugin's rule for `n-a` (data lane only,
// with a reason), a Confirm, and then the plugin's stdout / stderr VERBATIM under the heading its
// exit code earns — Done / Not done / Refused by the plugin. It enforces nothing of its own: the
// one rule it mirrors before spawning is the request's SHAPE (`validateSprintVerbRequest`). When
// the card's developer is the signed-in person it shows a NOTE (`OWN_BUILD_VERDICT`), never a
// disabled button — the author-never-approves rule is the code host's and the plugin's, and a
// UI-only refusal would be a rule enforced nowhere. The eng lane never offers `n-a`.
import { useEffect, useRef, useState } from 'react'
import type { ActorInfo, SprintVerbRequest, SprintVerbResult, VerdictLane, VerdictValue } from '../../../shared/types'
import { samePerson } from '../../../shared/identity'
import { CAPABILITIES, DATA_VERDICT_NO_DISCIPLINE, exitHeading, NO_ACTOR, newerPlugin, OWN_BUILD_VERDICT } from '../../../shared/reasons'
import { buildSprintVerbArgv, describeArgv, validateSprintVerbRequest } from '../../../shared/sprintVerbArgv'
import { Button, cn, Dialog, Field, Input, Notice, Segmented } from '../../ui'
import { TypedActorForm } from '../TypedActorForm'
import { peopleOf, type LaneRow } from './laneModel'

export const VERDICT_VALUES: readonly VerdictValue[] = ['accepted', 'returned', 'pending', 'n-a']

/** The verdicts a lane may record — the plugin's rule: `n-a` is data-lane only. */
export function verdictOptionsFor(lane: VerdictLane): VerdictValue[] {
  return lane === 'data' ? [...VERDICT_VALUES] : VERDICT_VALUES.filter((v) => v !== 'n-a')
}

export function confirmReason(actor: ActorInfo | null, capabilities: readonly string[]): string | null {
  if (!capabilities.includes(CAPABILITIES.sprintWrite)) return newerPlugin(CAPABILITIES.sprintWrite)
  if (!actor) return NO_ACTOR
  return null
}

export interface VerdictDialogProps {
  row: LaneRow | null
  actor: ActorInfo | null
  capabilities: readonly string[]
  /** For the TypedActorForm when nobody is identified; absent → the form is not offered. */
  projectPath?: string
  boardSpecIds?: readonly string[]
  onClose: () => void
  onRun: (request: SprintVerbRequest) => Promise<SprintVerbResult>
  /** Exit 0: the host re-reads before anything moves, then seals the card. */
  onRecorded?: (spec: string, lane: VerdictLane, verdict: VerdictValue) => void
}

export function VerdictDialog({ row, actor, capabilities, projectPath, boardSpecIds, onClose, onRun, onRecorded }: VerdictDialogProps) {
  const [lane, setLane] = useState<VerdictLane>('eng')
  const [verdict, setVerdict] = useState<VerdictValue>('accepted')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SprintVerbResult | null>(null)
  const [shapeErrors, setShapeErrors] = useState<string[]>([])
  const first = useRef<HTMLButtonElement>(null)

  // A new card → a fresh form; the eng lane cannot hold n-a.
  useEffect(() => { setLane('eng'); setVerdict('accepted'); setReason(''); setResult(null); setShapeErrors([]) }, [row?.id])
  useEffect(() => { if (lane === 'eng' && verdict === 'n-a') setVerdict('accepted') }, [lane, verdict])

  if (!row) return null
  const request: SprintVerbRequest = { verb: 'verdict', spec: row.id, lane, verdict, reason: reason.trim() || undefined }
  const disabledReason = confirmReason(actor, capabilities)
  const preview = actor ? buildSprintVerbArgv(request, actor.name, boardSpecIds) : null
  const ownBuild = samePerson(peopleOf(row).developer, actor?.name)

  const confirm = async () => {
    const errors = validateSprintVerbRequest(request, boardSpecIds)
    setShapeErrors(errors)
    if (errors.length > 0 || disabledReason || busy) return
    setBusy(true)
    try {
      const res = await onRun(request)
      setResult(res)
      if (res.ok) onRecorded?.(row.id, lane, verdict)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Verdict · ${row.id}`} description={row.slate.name} size="md" initialFocus={first} data-testid="verdict-dialog">
      <div className="space-y-4 text-sm">
        {ownBuild && <Notice tone="info" role="status" data-testid="own-build-note">{OWN_BUILD_VERDICT}</Notice>}
        <Field label="Lane">
          <Segmented<VerdictLane> label="Lane" tone="neutral" size="sm" value={lane} onChange={setLane} options={[{ value: 'eng', label: 'eng' }, { value: 'data', label: 'data' }]} />
        </Field>
        <Field label="Verdict">
          <Segmented<VerdictValue> label="Verdict" tone="neutral" size="sm" value={verdict} onChange={setVerdict} options={verdictOptionsFor(lane).map((v) => ({ value: v, label: v }))} data-testid="verdict-values" />
        </Field>
        {lane === 'data' && <p className="text-xs text-ink-3" data-testid="data-lane-note">{DATA_VERDICT_NO_DISCIPLINE}</p>}
        {(verdict === 'n-a' || verdict === 'returned') && (
          <Field label={verdict === 'n-a' ? 'Reason (the plugin requires one for n-a)' : 'Reason (optional)'}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="in the plugin's record, after --reason" data-testid="verdict-reason" />
          </Field>
        )}
        <div className="rounded-lg border border-line-1 bg-surface-2 px-3 py-2 font-mono text-code text-ink-2" data-testid="verdict-argv">
          {preview?.ok ? describeArgv(preview.argv) : actor ? preview?.errors.join(' · ') : NO_ACTOR}
          <p className="mt-1 font-sans text-xs text-ink-3">
            {actor ? <>as <span className="font-medium text-ink-2">{actor.name}</span> · {actor.source}</> : 'no actor'}
            {' · '}the plugin checks: lane, the spec is in a sprint, the name is a person
          </p>
        </div>
        {!actor && projectPath && <TypedActorForm projectPath={projectPath} />}
        {shapeErrors.length > 0 && <Notice tone="warn" title="Not sent — the request is not one the plugin accepts">{shapeErrors.join(' · ')}</Notice>}
        {result && (
          <div data-testid="verb-result" data-verdict-result="" data-exit={result.exitCode ?? 'null'} className={cn('rounded-lg border px-3 py-2', result.ok ? 'border-status-ok-line bg-status-ok-bg text-status-ok-ink' : result.refused ? 'border-today-late-line bg-today-late-bg text-today-late-ink' : 'border-status-warn-line bg-status-warn-bg text-status-warn-ink')}>
            <p className="font-medium">{exitHeading(result.exitCode)}</p>
            <pre className="mt-1 whitespace-pre-wrap font-mono text-code">{[result.stdout, result.stderr].filter(Boolean).join('\n') || `exit ${result.exitCode}`}</pre>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{result?.ok ? 'Close' : 'Cancel'}</Button>
          <Button ref={first} variant="primary" data-write="" loading={busy} disabled={disabledReason !== null} disabledReason={disabledReason ?? undefined} onClick={confirm}>
            Confirm
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
