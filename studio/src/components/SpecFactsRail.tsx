import { forwardRef, type ReactNode, type RefObject } from 'react'
import type { ActorInfo, BoardRow, SprintVerb } from '../../shared/types'
import { statusTone } from '../../shared/sprintModel'
import { CAPABILITIES, newerPlugin, NO_ACTOR } from '../../shared/reasons'
import { Button, Card, Chip, DefinitionList, Eyebrow } from '../ui'

/** The sprint verbs a spec can take from its own page (togo-command-center.md §2.4, §3.6): each
 * slot hands a verb and the row to the host (`onVerb`), whose VerbDialog shows the argv and runs it
 * through the closed table. Without a host wiring — or without `sprint-write` / an actor — the slot
 * is drawn disabled with its reason in `reasons.ts` words. The four labels are pinned by
 * SpecStatusView.test. */
export const SLOT_REASON = newerPlugin(CAPABILITIES.sprintWrite)
export const SLOTS = ['Verdict', 'Pass next action', 'Acknowledge', 'Mark ready'] as const
export type SlotLabel = (typeof SLOTS)[number]
/** Slot → the `sprint.py` verb it opens. "Mark ready" is the SPRINT's `ready`, on the row's sprint. */
export const SLOT_VERB: Record<SlotLabel, SprintVerb> = { Verdict: 'verdict', 'Pass next action': 'handoff', Acknowledge: 'ack', 'Mark ready': 'ready' }

/** Why a slot is disabled, or undefined when the host wired it and the plugin can run it. */
export function slotReason(capabilities: string[] | undefined, actor: ActorInfo | null | undefined, wired: boolean): string | undefined {
  if (capabilities !== undefined && !capabilities.includes(CAPABILITIES.sprintWrite)) return SLOT_REASON
  if (actor === null) return NO_ACTOR
  return wired ? undefined : SLOT_REASON
}

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
  /** What the installed plugin declares; undefined = not known yet. */
  capabilities?: string[]
  /** The signed-in person, resolved in main; null = nobody (every slot then says `NO_ACTOR`). */
  actor?: ActorInfo | null
  /** The host's VerbDialog opener. Absent → the slots are disabled with their reason. */
  onVerb?: (verb: SprintVerb, row: BoardRow) => void
}>(function SpecFactsRail({ row, pullRequest, onOpenDependency, dependencyReason, statusChipRef, prChipRefs, capabilities, actor, onVerb }, ref) {
  const reason = slotReason(capabilities, actor, Boolean(onVerb))
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

      {/* The sprint verbs, last and quiet (inset). Live when the host wired its VerbDialog and the
          plugin declares `sprint-write`; otherwise drawn disabled with the reason (SpecStatusView.test
          pins all four). Every live slot carries `data-write`: the dialog, not this rail, runs it. */}
      <Card tone="inset">
        <Eyebrow as="h3" className="mb-2">Sprint decisions</Eyebrow>
        <p className="mb-2 text-xs text-ink-3">{reason ? `Not available here — ${reason}.` : 'Each opens the verb dialog with this spec filled in; the plugin answers.'}</p>
        <div className="flex flex-wrap gap-2">
          {SLOTS.map((label) => (
            <Button key={label} size="sm" data-write={reason ? undefined : ''} disabled={Boolean(reason)} disabledReason={reason} onClick={reason ? undefined : () => onVerb?.(SLOT_VERB[label], row)}>{label}</Button>
          ))}
        </div>
      </Card>
    </section>
  )
})
