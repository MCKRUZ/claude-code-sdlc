// Planning — left column, the refined backlog (togo-command-center.md §3.2). Candidates ordered
// READY first, each row carrying the checker's DoR state and gap lines VERBATIM, the risk chip, the
// owner's ring, `depends_on`, and three actions: "Add to slate" (ENABLED for every candidate —
// `SLATEABLE_STATUSES` admits drafts; the plugin, not the UI, lists the gaps at `ready`), "refine
// in place →" (opens the spec card), and "Confirm" (`confirmTier`; disabled with the capability
// reason without `confirm-tier`). Nothing here computes a state: READY/NOT READY is the checker's
// `ready` flag and "unknown" names the missing read.
import { useState } from 'react'
import { ArrowRightToLine, PenLine } from 'lucide-react'
import type { BoardRow, ConfirmTierResult, RosterPerson, SpecReadinessFull, SprintVerbResult } from '../../../shared/types'
import { samePerson } from '../../../shared/identity'
import { newerPlugin, WAITING_FOR_PLUGIN_ANSWER } from '../../../shared/reasons'
import { Button, Chip, Eyebrow } from '../../ui'
import { CcEmptyFigure, PersonRing } from '../brand/figures'
import { dorChipTone } from '../../../shared/sprintModel'
import { dorState, riskTone, ringFor } from './planningModel'
import { VerbResult } from './VerbResult'

export const BACKLOG_EMPTY = 'no candidates — the plugin lists 0 slateable specs outside a sprint'
export const REFINE_IN_PLACE = 'refine in place →'
export const ADD_TO_SLATE = 'Add to slate'

export interface BacklogColumnProps {
  rows: BoardRow[]
  readiness: Map<string, SpecReadinessFull>
  people: readonly RosterPerson[]
  me: string | null
  /** Why "Add to slate" is disabled (no actor, no `sprint-write`); undefined = enabled. */
  writeReason?: string
  canConfirm: boolean
  busy: boolean
  lastResult: { spec: string; result: SprintVerbResult } | null
  onAddToSlate: (spec: string) => void
  onOpenSpec: (row: BoardRow) => void
  /** Called after a confirm-tier call settled, so the host re-reads. */
  onSettled: () => void
  projectPath: string
}

export function BacklogColumn(props: BacklogColumnProps) {
  const { rows, readiness, people, me, writeReason, canConfirm, busy, lastResult, onAddToSlate, onOpenSpec, onSettled, projectPath } = props
  const [confirmed, setConfirmed] = useState<Record<string, string>>({})

  const confirm = async (row: BoardRow) => {
    const result: ConfirmTierResult = await window.studio.confirmTier(projectPath, row.path)
    const text = result.ok ? (result.message ?? (result.changed === false ? 'already confirmed' : 'confirmed')) : (result.refusal?.message ?? 'refused')
    setConfirmed((c) => ({ ...c, [row.spec]: text }))
    if (result.ok) onSettled()
  }

  return (
    <section aria-label="Refined backlog" data-testid="planning-backlog" className="flex min-w-0 flex-col rounded-[14px] bg-plan-backlog p-2">
      <header className="flex h-10 items-center justify-between border-b border-lane-line px-2">
        <Eyebrow as="h3">Refined backlog</Eyebrow>
        <span className="text-lane-count tabular-nums text-ink-1" data-stat="candidates">{rows.length}</span>
      </header>
      {rows.length === 0 ? (
        <div className="mt-2 flex flex-col items-start gap-2 rounded-xl border border-dashed border-line-2 px-5 py-6">
          <CcEmptyFigure figure="backlog-empty" />
          <p className="text-[13px] leading-[18px] text-ink-2">{BACKLOG_EMPTY}</p>
          <p className="text-xs text-ink-3">A spec at `ready` or `draft` with no `sprint:` would appear here.</p>
        </div>
      ) : (
        <ul className="mt-2 space-y-2" role="list">
          {rows.map((row) => {
            const r = readiness.get(row.spec)
            const dor = dorState(r)
            const owner = row.owner ? ringFor(people, row.owner) : null
            return (
              <li key={row.spec} data-spec={row.spec} data-dor={dor} className="rounded-[10px] border border-line-1 bg-surface-1 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-ident text-accent-text">{row.spec}</span>
                      <Chip tone={dorChipTone(dor)} casing="state" dot>
                        {dor === 'unknown' ? 'DoR unknown' : dor}
                      </Chip>
                      <Chip tone="neutral" casing="state">{row.status}</Chip>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm font-medium text-ink-1">{row.title || row.name}</p>
                  </div>
                  <Chip tone={riskTone(row.risk)} casing="identifier">{row.risk || 'no tier'}</Chip>
                </div>
                {dor === 'NOT READY' && r && (
                  <ul className="mt-2 space-y-0.5 text-xs text-ink-2" aria-label={`DoR gaps for ${row.spec}`}>
                    {r.blocking.map((f, i) => <li key={`${f.check}-${i}`}>• {f.message}</li>)}
                  </ul>
                )}
                {dor === 'unknown' && <p className="mt-2 text-xs text-ink-3">{newerPlugin('readiness-all')}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-3">
                  {owner ? <PersonRing initials={owner.initials} name={owner.name} you={samePerson(row.owner, me)} /> : <span>no owner</span>}
                  {row.dependsOn.length > 0 && (
                    <span className="font-mono text-ident">depends on {row.dependsOn.join(', ')}</span>
                  )}
                  {confirmed[row.spec] && <span className="text-ink-2" data-confirm-result="">{confirmed[row.spec]}</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" icon={ArrowRightToLine} data-write="" disabled={Boolean(writeReason) || busy} disabledReason={writeReason ?? (busy ? WAITING_FOR_PLUGIN_ANSWER : undefined)} onClick={() => onAddToSlate(row.spec)}>
                    {ADD_TO_SLATE}
                  </Button>
                  <Button size="sm" variant="ghost" icon={PenLine} data-refine="" onClick={() => onOpenSpec(row)}>{REFINE_IN_PLACE}</Button>
                  <Button size="sm" data-write="" disabled={!canConfirm || busy} disabledReason={!canConfirm ? newerPlugin('confirm-tier') : busy ? WAITING_FOR_PLUGIN_ANSWER : undefined} onClick={() => confirm(row)}>
                    Confirm tier
                  </Button>
                </div>
                {lastResult?.spec === row.spec && <VerbResult compact className="mt-2" result={lastResult.result} />}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
