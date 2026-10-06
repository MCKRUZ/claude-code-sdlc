import { forwardRef, type ReactNode, type RefObject } from 'react'
import type { BoardRow } from '../../shared/types'
import { statusTone } from '../../shared/sprintModel'
import { Button, Card, Chip, DefinitionList, Eyebrow } from '../ui'

/** The sprint write verbs (`sprint.py verdict / next / ack / ready`) have no IPC yet. The slots
 * are drawn so the screen's shape is settled, and each says why it does nothing. The four labels
 * are pinned by SpecStatusView.test. */
export const SLOT_REASON = 'These arrive with a newer plugin'
export const SLOTS = ['Verdict', 'Pass next action', 'Acknowledge', 'Mark ready'] as const

/** "—" for a value the spec file does not carry — a dash is a fact ("nothing recorded"), a blank
 * cell is a question. */
const dash = <span aria-label="not recorded" className="text-ink-3">—</span>
const text = (value: string | null | undefined): ReactNode => (value ? value : dash)
const mono = (value: string | null | undefined): ReactNode => (value ? <span className="break-all font-mono text-xs">{value}</span> : dash)

/** S8 — the spec's own facts in a 280 px sticky rail beside the main column (≥ lg): what the
 * frontmatter says, read straight off the row the screen was opened with — Studio computes none
 * of it. `dependsOn` ids are buttons when the screen can open a spec and the Board or Sprint has
 * fetched that row; otherwise they are text with the reason. The M9 refs (`statusChipRef`,
 * `prChipRefs`) let `SpecStatusView` hand the status chip and the branch / PR chips to P2's
 * `handoffCeremony`. */
export const SpecFactsRail = forwardRef<HTMLElement, {
  row: BoardRow
  /** Live PR number and url when the host answered; null before or without one. */
  pullRequest: { number: number; url: string } | null
  /** Opens another spec from a `dependsOn` id; null when this screen cannot open one. */
  onOpenDependency: ((id: string) => void) | null
  /** Why a dependency cannot be opened, when `onOpenDependency` is given but the id is unknown. */
  dependencyReason: (id: string) => string | null
  statusChipRef?: RefObject<HTMLElement | null>
  prChipRefs?: RefObject<Array<HTMLElement | null>>
}>(function SpecFactsRail({ row, pullRequest, onOpenDependency, dependencyReason, statusChipRef, prChipRefs }, ref) {
  const setPrChip = (index: number) => (el: HTMLElement | null) => {
    if (prChipRefs) prChipRefs.current[index] = el
  }
  const dependsOn = row.dependsOn.length === 0 ? dash : (
    <span className="flex flex-wrap gap-1">
      {row.dependsOn.map((id) => {
        const reason = onOpenDependency ? dependencyReason(id) : 'This screen cannot open another spec.'
        return (
          <Chip
            key={id}
            as="button"
            tone="mono"
            casing="identifier"
            data-flip-id={onOpenDependency && !reason ? `spec:${id}` : undefined}
            disabled={Boolean(reason)}
            disabledReason={reason ?? undefined}
            onClick={onOpenDependency && !reason ? () => onOpenDependency(id) : undefined}
          >
            {id}
          </Chip>
        )
      })}
    </span>
  )
  return (
    // A <section>, never an <aside>: a11y.spec pins exactly two asides (sidebar, then chat).
    <section ref={ref} aria-label="Spec facts" className="space-y-3 lg:sticky lg:top-0 lg:self-start">
      <Card>
        <Eyebrow as="h3" className="mb-2">Facts</Eyebrow>
        <DefinitionList
          columns={1}
          className="text-sm"
          items={[
            {
              term: 'Status',
              detail: (
                <Chip ref={statusChipRef} tone={statusTone(row.status)} casing="state" dot data-testid="spec-status-chip">
                  {row.status || 'no status'}
                </Chip>
              ),
            },
            { term: 'Team', detail: text(row.team) },
            { term: 'Sprint', detail: row.sprint ? <Chip tone="mono" casing="identifier">{row.sprint}</Chip> : dash },
            { term: 'Channel', detail: text(row.channel) },
            { term: 'Depends on', detail: dependsOn },
            { term: 'Next owner', detail: text(row.nextOwner) },
            { term: 'Eng review', detail: text(row.engReview) },
            { term: 'Data review', detail: text(row.dataReview) },
            {
              term: 'Branch',
              detail: row.branch ? <Chip ref={setPrChip(0)} tone="mono" casing="identifier" className="max-w-full whitespace-normal break-all">{row.branch}</Chip> : dash,
            },
            {
              term: 'Pull request',
              detail: pullRequest ? (
                <a ref={setPrChip(1) as never} href={pullRequest.url} target="_blank" rel="noreferrer" className="font-mono text-xs text-accent-text hover:text-accent-text-hover hover:underline">
                  #{pullRequest.number}
                </a>
              ) : dash,
            },
            { term: 'Path', detail: mono(row.path) },
          ]}
        />
      </Card>

      {/* What you cannot do yet, last and quiet (inset). Reserved slots, drawn disabled with
          their reason (SpecStatusView.test pins all four): the note says up front that none of
          them works yet, so the row reads as a promise, not as four live controls. */}
      <Card tone="inset">
        <Eyebrow as="h3" className="mb-2">Sprint decisions</Eyebrow>
        <p className="mb-2 text-xs text-ink-3">Not available yet — these arrive with a newer plugin.</p>
        <div className="flex flex-wrap gap-2">
          {SLOTS.map((label) => (
            <Button key={label} size="sm" disabled disabledReason={SLOT_REASON}>{label}</Button>
          ))}
        </div>
      </Card>
    </section>
  )
})
