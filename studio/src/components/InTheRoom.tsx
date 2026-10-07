// "In the room" (togo-command-center.md §3.1): who holds what right now — the roster's `people[]`
// in roster order, each a 20 px ring (the signed-in person alone wears the `you-ring`) and, for
// every lane row that names them (`owner developer checker next_owner`), one lane-shaped DOT.
// Dots, never digits: presence is shown, nothing is totalled, and the honesty sweep's "no `\d`
// inside `[data-person]`" holds for anything here. Hover or focus a person → `roomStore.setLit`
// so their cards gain `data-lit` and the others dim; leaving clears it. No roster → the reasons
// sentence in the kit's dashed frame. Reads no IPC of its own.
import type { LaneId, RosterPerson, SprintView, BoardRow } from '../../shared/types'
import { samePerson } from '../../shared/identity'
import { NO_ROSTER } from '../../shared/reasons'
import { LANE_IDS, LANE_LABEL } from '../../shared/nav'
import { cn, Eyebrow } from '../ui'
import { LaneGlyph, PersonRing } from './brand/figures'
import { buildLanes, peopleOf, type LaneRow } from './lanes/laneModel'
import { initialsFor } from './lanes/LaneCard'
import { roomStore, useRoomLit } from '../stores/roomStore'

export const ROOM_SOURCE = 'project_settings.py --json · roster.people'

/** The lane rows that name this person, in lane order — a LIST (its length is never shown). */
export function holdings(person: RosterPerson, rows: readonly LaneRow[]): Array<{ row: LaneRow; lane: LaneId }> {
  const out: Array<{ row: LaneRow; lane: LaneId }> = []
  for (const lane of LANE_IDS) {
    for (const row of rows) {
      if (row.lane !== lane) continue
      if (Object.values(peopleOf(row)).some((h) => samePerson(h, person.handle))) out.push({ row, lane })
    }
  }
  return out
}

export interface InTheRoomProps {
  people: readonly RosterPerson[] | null
  view: SprintView | null
  board: readonly BoardRow[] | null
  me: string | null
  className?: string
}

export function InTheRoom({ people, view, board, me, className }: InTheRoomProps) {
  const lit = useRoomLit()
  const rows = view ? buildLanes(view, board).all : []
  return (
    // Owner's v12 item 1: ONE row under the header — the eyebrow, then every person as a pill
    // (ring · name · lane dots) wrapping only when the roster outgrows the line. Presence at a
    // glance, no column of its own, so the lanes start sooner.
    <section data-testid="in-the-room" aria-labelledby="in-the-room-title" data-room-row="" className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      <div className="flex shrink-0 items-baseline gap-2">
        <Eyebrow as="h3" id="in-the-room-title">In the room</Eyebrow>
        <span className="text-xs text-ink-3" title={ROOM_SOURCE}>presence, not totals</span>
      </div>
      {!people || people.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-2 px-3 py-1 text-xs text-ink-2" data-testid="room-empty">{NO_ROSTER}</p>
      ) : (
        <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-1" onMouseLeave={() => roomStore.setLit(null)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) roomStore.setLit(null) }}>
          {people.map((person) => {
            const held = holdings(person, rows)
            const you = samePerson(person.handle, me)
            const isLit = samePerson(lit, person.handle)
            return (
              <li key={person.handle}>
                <button
                  type="button"
                  data-person-row=""
                  data-handle={person.handle}
                  data-lit={isLit ? '' : undefined}
                  onMouseEnter={() => roomStore.setLit(person.handle)}
                  onFocus={() => roomStore.setLit(person.handle)}
                  title={`${person.handle}${person.team ? ` · ${person.team}` : ''}`}
                  className={cn(
                    'flex h-8 items-center gap-2 rounded-full border border-line-1 bg-surface-1 py-0.5 pl-1 pr-2.5 text-left transition-[background-color,opacity,border-color] duration-[120ms] hover:border-line-2 hover:bg-surface-2',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)',
                    isLit && 'border-card-lit',
                    lit !== null && !isLit && 'opacity-55',
                  )}
                  aria-label={`${person.name ?? person.handle}${you ? ' (you)' : ''}${person.team ? `, ${person.team}` : ''}`}
                >
                  <PersonRing initials={initialsFor(person.handle, people)} name={person.name ?? person.handle} you={you} lit={isLit} />
                  <span className="max-w-[12rem] truncate text-xs font-medium text-ink-1">{person.name ?? person.handle}</span>
                  <span className="flex items-center gap-0.5" aria-hidden="true" data-holdings="">
                    {held.map(({ row, lane }) => (
                      <LaneGlyph key={row.id} lane={lane} size={16} className="text-ink-3" />
                    ))}
                    {held.length === 0 && <span className="text-xs text-ink-4">·</span>}
                  </span>
                  <span className="sr-only">
                    {held.length === 0 ? 'holds nothing in the lanes' : `holds ${held.map(({ row, lane }) => `${row.id} in ${LANE_LABEL[lane]}`).join(', ')}`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
