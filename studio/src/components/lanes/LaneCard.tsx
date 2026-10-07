// One card in a lane (togo-command-center.md §3.1, visual §4): three lines — the id in
// `--text-ident` with the risk chip right-aligned; the name; the people as 20 px rings (the
// signed-in person alone wears the `you-ring`) plus the PR facts in `ink-3`. Everything on it is
// a plugin field shown as written: the PR number and `waiting_on` sentence from `spec_status.py
// --all`, the review-lane words from `sprint.py status`, the Checking wait as the plugin's
// `since_business_days` (tinted `today-wait-*` ONLY when `> 1` or the host's `over_alarm`). The
// "next up" card carries the accent left edge and the plugin's three words. No host → the card
// drops its PR facts and says why in the host's own sentence. The card writes nothing.
import { forwardRef, type KeyboardEvent, type MouseEvent, type RefObject } from 'react'
import type { RosterPerson, SprintVerdictPending } from '../../../shared/types'
import { samePerson } from '../../../shared/identity'
import { NEXT_UP, NO_PR_YET } from '../../../shared/reasons'
import { businessDays, laneBadge, riskTone } from '../../../shared/sprintModel'
import { Chip, cn } from '../../ui'
import { useCountUp } from '../../motion/useCountUp'
import { useRoomLit } from '../../stores/roomStore'
import { PersonRing } from '../brand/figures'
import { LANE_TONE } from '../SprintSlateTable'
import { distinctPeople, waitIsLong, type LaneRow } from './laneModel'

/** Risk chips keep the kit's tones (visual §2): HIGH error, MEDIUM warn, LOW neutral — the one
 * table in `shared/sprintModel`, re-exported for the callers that import it from here. */
export { riskTone }

/** Rings stack only when a row names FOUR or more people; up to three sit in a plain row with a
 * 4 px gap (v14: the common owner · builder · checker trio stacked, and "PN" lost its N under
 * "SK" and the you-ring — a 20 px disc has ≈ 3.5 px of letter-free edge, so any overlap plus the
 * 2 px surface gap nicks a letter; three whole rings fit a card, so they never overlap). */
export const RINGS_STACK_FROM = 4

export function ringsOverlap(count: number): boolean {
  return count >= RINGS_STACK_FROM
}

/** The people of a row for the ring strip: the signed-in person LAST. In a stack later rings sit
 * above earlier ones, and the you-ring's 4 px halo paints outside its disc — last, that halo
 * lands on the previous disc's letter-free right edge and nothing sits on top of it. */
export function ringOrder(people: readonly string[], me: string | null): string[] {
  if (me === null) return [...people]
  return [...people.filter((h) => !samePerson(h, me)), ...people.filter((h) => samePerson(h, me))]
}

/** The margin a ring in a STACK (four or more people) takes. Later rings sit above earlier ones
 * (`zIndex: i + 1`, the standard avatar stack — v13: "PN ƧK", the first ring over the second
 * clipped its first letter), so each ring's left letter stays whole and the 4 px overlap covers
 * only the previous disc's right edge. Two rings are exempt from the overlap: the FIRST ring is
 * never overlapped — the second starts 2 px after it, the width of its own `surface-1` gap ring,
 * so that gap is drawn in the gap and nothing paints over the first disc (v14: "PN" lost its N);
 * and the you-ring (always last) overlaps by 0, because its 4 px halo is drawn OUTSIDE its disc
 * and that halo, not the disc, then sits on the previous ring's last 4 px. */
export function stackedRingMargin(index: number, you: boolean): string | null {
  if (index === 0) return null
  if (you) return 'ml-0'
  return index === 1 ? 'ml-0.5' : '-ml-1'
}

/** The two letters a ring shows, from the roster NAME when the roster knows the handle (never a
 * digit from a handle — `PersonRing` strips any defensively). */
export function initialsFor(handle: string, roster: readonly RosterPerson[] | null): string {
  const person = roster?.find((p) => samePerson(p.handle, handle))
  const name = person?.name?.trim()
  if (name) return name.split(/\s+/).map((w) => w[0] ?? '').join('')
  return handle.replace(/^@/, '').split(/[-_.]/).map((w) => w[0] ?? '').join('')
}

export interface LaneCardProps {
  row: LaneRow
  me: string | null
  roster: readonly RosterPerson[] | null
  /** The host's own sentence when the PR facts cannot be read; null when they can. */
  hostReason: string | null
  /** Roving focus: only the active card is in the tab order. */
  active: boolean
  onOpen: (row: LaneRow) => void
  onFocus: (row: LaneRow) => void
}

export const LaneCard = forwardRef<HTMLButtonElement, LaneCardProps>(function LaneCard(
  { row, me, roster, hostReason, active, onOpen, onFocus }, ref,
) {
  const lit = useRoomLit()
  const people = ringOrder(distinctPeople(row), me)
  const isLit = lit !== null && people.some((h) => samePerson(h, lit))
  const dimmed = lit !== null && !isLit
  const pr = row.board?.pullRequest ?? null
  const nextUp = row.lane === 'ready' && row.isNextUp
  const showReviews = row.lane === 'building' || row.lane === 'checking'

  const open = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault()
    onOpen(row)
  }
  return (
    <button
      ref={ref}
      type="button"
      data-lane-card=""
      data-testid="lane-card"
      data-spec={row.id}
      data-lane={row.lane}
      data-flip-id={`spec:${row.id}`}
      data-lit={isLit ? '' : undefined}
      data-next-up={nextUp ? '' : undefined}
      data-reveal=""
      tabIndex={active ? 0 : -1}
      aria-label={`${row.id} ${row.slate.name}`}
      onClick={open}
      onFocus={() => onFocus(row)}
      className={cn(
        'relative block w-full rounded-[10px] border border-line-1 bg-surface-1 p-3 text-left text-ink-1',
        'transition-[border-color,box-shadow,opacity] duration-[120ms] hover:border-line-2 motion-safe:hover:shadow-1',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)',
        nextUp && 'border-l-2 border-l-today-act-line',
        isLit && 'border-card-lit',
        dimmed && 'opacity-55',
      )}
    >
      <span data-seam="" aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 h-[2px] w-full -translate-x-1/2 bg-accent-600 opacity-0" />
      <span className="flex items-center justify-between gap-2">
        <span className="font-mono text-ident tabular-nums text-ink-2" title="spec id (sprint.py status --json · slate[].id)">{row.id}</span>
        <Chip tone={riskTone(row.slate.risk)} size="xs" title="risk (slate[].risk)">{row.slate.risk || 'no tier'}</Chip>
      </span>
      <span className="mt-1 line-clamp-2 block text-sm font-medium leading-5 text-ink-1">{row.slate.name}</span>
      {nextUp && <span className="mt-1 block text-xs font-medium text-accent-text" title="sprint.py status --json · next_up">{NEXT_UP}</span>}
      <span className="mt-2 flex items-center gap-2">
        <span className={cn('flex items-center py-0.5', !ringsOverlap(people.length) && 'gap-1')} aria-label={people.length === 0 ? 'nobody named' : undefined} data-rings={ringsOverlap(people.length) ? 'stacked' : 'spaced'}>
          {people.map((handle, i) => (
            // Later rings sit ABOVE earlier ones (`stackedRingMargin` says why), the you-ring last.
            <PersonRing
              key={handle}
              initials={initialsFor(handle, roster)}
              name={handle}
              you={samePerson(handle, me)}
              lit={isLit && samePerson(handle, lit)}
              stacked={ringsOverlap(people.length)}
              className={cn('relative', ringsOverlap(people.length) && stackedRingMargin(i, samePerson(handle, me)))}
              style={{ zIndex: i + 1 }}
            />
          ))}
          {people.length === 0 && <span className="text-xs text-ink-3">nobody named</span>}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs leading-4 text-ink-3" data-pr-facts="">
          {hostReason !== null
            ? null // no host: the card drops its pull-request facts; the board says why once
            : pr
              ? <span title={`spec_status.py --all --json · pull_request`}><span className="font-mono tabular-nums">#{pr.number}</span> · {pr.waitingOn}</span>
              : row.board ? <span title="spec_status.py --all --json · pull_request: null">{NO_PR_YET}</span> : null}
        </span>
      </span>
      {showReviews && (
        <span className="mt-2 flex flex-wrap items-center gap-1" data-reviews="">
          <ReviewChip lane="eng" value={row.slate.engReview} />
          <ReviewChip lane="data" value={row.slate.dataReview} />
        </span>
      )}
      {row.lane === 'checking' && row.verdictsPending.length > 0 && (
        <span className="mt-2 flex flex-wrap gap-1" data-waits="">
          {row.verdictsPending.map((v) => <Wait key={v.lane} v={v} row={row} />)}
        </span>
      )}
    </button>
  )
})

function ReviewChip({ lane, value }: { lane: 'eng' | 'data'; value: string }) {
  const badge = laneBadge(value)
  return (
    <Chip tone={LANE_TONE[badge.tone]} size="xs" data-review-chip={lane} title={`sprint.py status --json · slate[].${lane}_review`}>
      {lane} · {badge.label}
    </Chip>
  )
}

/** The plugin's wait, tweened number→number only; null is the words "no data". */
function Wait({ v, row }: { v: SprintVerdictPending; row: LaneRow }) {
  const long = waitIsLong(v, row)
  const count = useCountUp(`wait:${row.id}:${v.lane}`, v.sinceBusinessDays, { format: (n) => businessDays(Math.round(n)) })
  return (
    <span
      data-wait={v.lane}
      data-long={long ? '' : undefined}
      title="sprint.py status --json · verdicts_pending[].since_business_days"
      className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-ident tabular-nums', long ? 'bg-today-wait-bg text-today-wait-ink' : 'bg-surface-2 text-ink-2')}
    >
      <span className="text-ink-3">{v.lane}</span>
      <span ref={count.ref as RefObject<HTMLSpanElement>}>{count.text}</span>
    </span>
  )
}
