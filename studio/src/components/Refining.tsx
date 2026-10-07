// "Refining for the next sprint" (togo-command-center.md §3.1): the candidates the plugin's own
// slate rule admits — Board rows with a `SLATEABLE_STATUSES` status (`ready`, `draft`) and no
// `sprint` (the plugin reports `candidates` as a COUNT; the rows are read from `spec_status.py
// --all`) — plus the Board's `deferred` rows with their reason. Per row: the DoR verdict from
// `spec_readiness.py --all --json` (`blocking[].message` VERBATIM; "arrives with a newer plugin"
// without `readiness-all`), the risk chip, "Confirm tier" (only when `confirm-tier` exists — no
// "unconfirmed" state is invented; the plugin answers `changed:false` when already confirmed),
// `depends_on`, the owner, and "refine in place →" which opens the card. A deferred row never
// shows a blank: the plugin's `deferred_reason` when the read carries it, else the pointer line.
import { useState } from 'react'
import { ArrowRight, PenLine } from 'lucide-react'
import type { ActorInfo, BoardRow, ConfirmTierResult, ReadinessAll, SpecReadinessFull } from '../../shared/types'
import { CAPABILITIES, DEFERRED_REASON_RECORDED, NO_ACTOR, newerPlugin, TIER_CONFIRMATION_ARRIVES } from '../../shared/reasons'
import { Button, Chip, cn, Eyebrow } from '../ui'
import { CcEmptyFigure, PersonRing } from './brand/figures'
import { dorChipTone, riskTone } from '../../shared/sprintModel'
import { initialsFor } from './lanes/LaneCard'
import { useIsLit } from '../stores/roomStore'
import { samePerson } from '../../shared/identity'
import type { RosterPerson } from '../../shared/types'

/** `sprint_model.SLATEABLE_STATUSES` — the plugin's rule, spelled once here. */
export const SLATEABLE_STATUSES: readonly string[] = ['ready', 'draft']
export const REFINING_SOURCE = 'spec_status.py --all --json · rows with status in (ready, draft) and sprint ""'

/** The read may carry fields P0's row type does not name yet (P2 adds `deferred_reason`); they are
 * read as optional and never assumed. */
type RowExtras = { deferredReason?: string; riskConfirmedBy?: string }

export function candidateRows(rows: readonly BoardRow[]): BoardRow[] {
  return rows.filter((r) => SLATEABLE_STATUSES.includes(r.status.trim().toLowerCase()) && r.sprint.trim() === '')
}
export function deferredRows(rows: readonly BoardRow[]): BoardRow[] {
  return rows.filter((r) => r.status.trim().toLowerCase() === 'deferred')
}

/** The readiness row for a spec, by its path or its `NNNN-` file prefix — a lookup, not a join. */
export function readinessFor(all: ReadinessAll | null, row: BoardRow): SpecReadinessFull | null {
  if (!all) return null
  const base = (p: string) => p.split(/[\\/]/).pop() ?? p
  return all.specs.find((s) => s.spec === row.path || base(s.spec).startsWith(`${row.spec}-`)) ?? null
}

export function deferredReasonText(row: BoardRow): string {
  const extra = row as BoardRow & RowExtras
  return extra.deferredReason?.trim() || DEFERRED_REASON_RECORDED
}

export function confirmTierReason(actor: ActorInfo | null, capabilities: readonly string[]): string | null {
  if (!capabilities.includes(CAPABILITIES.confirmTier)) return TIER_CONFIRMATION_ARRIVES
  if (!actor) return NO_ACTOR
  return null
}

export interface RefiningProps {
  rows: readonly BoardRow[] | null
  readiness: ReadinessAll | null
  roster: readonly RosterPerson[] | null
  actor: ActorInfo | null
  capabilities: readonly string[]
  /** "for the sprint after S08" — the active sprint's id, or null. */
  afterSprint: string | null
  onOpen: (row: BoardRow) => void
  onConfirmTier?: (row: BoardRow) => Promise<ConfirmTierResult>
  className?: string
}

export function Refining({ rows, readiness, roster, actor, capabilities, afterSprint, onOpen, onConfirmTier, className }: RefiningProps) {
  const candidates = candidateRows(rows ?? [])
  const deferred = deferredRows(rows ?? [])
  const hasReadiness = capabilities.includes(CAPABILITIES.readinessAll)
  const confirmReason = confirmTierReason(actor, capabilities)
  return (
    <section data-testid="refining" aria-labelledby="refining-title" className={cn('space-y-3', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Eyebrow as="h3" id="refining-title">Refining{afterSprint ? ` · for the sprint after ${afterSprint}` : ''}</Eyebrow>
        {!capabilities.includes(CAPABILITIES.confirmTier) && <span className="text-xs text-ink-3">{TIER_CONFIRMATION_ARRIVES}</span>}
      </div>
      {candidates.length === 0 && deferred.length === 0 ? (
        <div className="flex items-center gap-4 rounded-xl border border-dashed border-line-2 px-5 py-6" data-testid="refining-empty">
          <CcEmptyFigure figure="backlog-empty" />
          <div>
            <p className="text-sm text-ink-2" title={REFINING_SOURCE}>{rows === null ? 'the backlog could not be read' : 'no candidate for the next sprint'}</p>
            <p className="text-xs text-ink-3">a spec with status ready or draft and no sprint would appear here</p>
          </div>
        </div>
      ) : (
        <ul className="space-y-2" title={REFINING_SOURCE}>
          {candidates.map((row) => (
            <RefiningRow key={row.spec} row={row} readiness={hasReadiness ? readinessFor(readiness, row) : null} readinessMissing={!hasReadiness} roster={roster} actor={actor} confirmReason={confirmReason} onOpen={onOpen} onConfirmTier={onConfirmTier} />
          ))}
          {deferred.map((row) => (
            <li key={row.spec} data-testid="refining-deferred" data-spec={row.spec} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line-1 bg-surface-1 px-3 py-2 text-xs text-ink-2">
              <span className="font-mono text-ident tabular-nums text-ink-2">{row.spec}</span>
              <span className="text-ink-1">{row.name}</span>
              <Chip tone="neutral" size="xs">deferred</Chip>
              {/* The reason whole (owner's rule: never truncate meaning) — it wraps, the row grows. */}
              <span className="min-w-0 flex-1 text-ink-3 [overflow-wrap:anywhere]" title="spec frontmatter · deferred_reason">{deferredReasonText(row)}</span>
              <Button size="sm" variant="link" iconEnd={ArrowRight} onClick={() => onOpen(row)}>open the spec</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function RefiningRow({ row, readiness, readinessMissing, roster, actor, confirmReason, onOpen, onConfirmTier }: {
  row: BoardRow; readiness: SpecReadinessFull | null; readinessMissing: boolean; roster: readonly RosterPerson[] | null; actor: ActorInfo | null
  confirmReason: string | null; onOpen: (row: BoardRow) => void; onConfirmTier?: (row: BoardRow) => Promise<ConfirmTierResult>
}) {
  const lit = useIsLit(row.owner)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ConfirmTierResult | null>(null)
  const confirm = async () => {
    if (!onConfirmTier || confirmReason || busy) return
    setBusy(true)
    try { setResult(await onConfirmTier(row)) } finally { setBusy(false) }
  }
  const dor = readinessMissing
    ? { label: newerPlugin(CAPABILITIES.readinessAll), tone: 'neutral' as const, lines: [] as string[] }
    : readiness === null
      ? { label: 'DoR · no data', tone: 'neutral' as const, lines: [] }
      : readiness.ready
        ? { label: 'READY', tone: dorChipTone('READY'), lines: [] }
        : { label: 'NOT READY', tone: dorChipTone('NOT READY'), lines: readiness.blocking.map((b) => b.message) }
  return (
    <li data-testid="refining-row" data-spec={row.spec} data-lit={lit ? '' : undefined} className={cn('space-y-1 rounded-[10px] border bg-surface-1 px-3 py-2 text-xs', lit ? 'border-card-lit' : 'border-line-1')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-ident tabular-nums text-ink-2">{row.spec}</span>
        <span className="min-w-0 flex-1 text-sm font-medium text-ink-1 [overflow-wrap:anywhere]">{row.name}</span>
        <Chip tone={riskTone(row.risk)} size="xs" title="spec frontmatter · risk">{row.risk || 'no tier'}</Chip>
        <Chip tone={dor.tone} size="xs" data-dor="" title="spec_readiness.py --all --json · ready / blocking">{dor.label}</Chip>
        {row.owner && <PersonRing initials={initialsFor(row.owner, roster)} name={row.owner} you={samePerson(row.owner, actor?.name)} lit={lit} />}
      </div>
      {dor.lines.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-ink-2" data-testid="refining-gaps">
          {dor.lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2 text-ink-3">
        <span>status {row.status}</span>
        {row.dependsOn.length > 0 && <span className="font-mono text-ident">depends on {row.dependsOn.join(', ')}</span>}
        <span className="flex-1" />
        <Button size="sm" variant="secondary" data-write="" loading={busy} disabled={confirmReason !== null} disabledReason={confirmReason ?? undefined} onClick={confirm} title={confirmReason ?? `Run: spec_transition.py --spec ${row.path} --json confirm-tier --by ${actor?.name ?? ''}`}>
          Confirm tier
        </Button>
        <Button size="sm" variant="link" icon={PenLine} data-refine="" onClick={() => onOpen(row)}>refine in place →</Button>
      </div>
      {result && (
        <p data-testid="confirm-tier-result" className={cn('rounded-md px-2 py-1', result.ok ? 'bg-status-ok-bg text-status-ok-ink' : 'bg-status-warn-bg text-status-warn-ink')}>
          {result.ok ? (result.message ?? (result.changed === false ? 'already confirmed' : 'confirmed')) : result.refusal?.message ?? 'Not done'}
        </p>
      )}
    </li>
  )
}
