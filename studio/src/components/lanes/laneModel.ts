// The four lanes of the sprint home as a PARTITION (togo-command-center.md §3.1): every slated
// spec sits in exactly one lane or is `unplaced`, decided from plugin fields only — `status` and
// `dor` from `sprint.py status --json`, `verdicts_pending` from the same document, and the pull
// request's `waiting_on` sentence from `spec_status.py --all`, matched against that script's own
// fixed ladder strings. Nothing here reads `wait_hours`, `developer` or a date to place a row,
// and nothing counts: a lane's length is the number of plugin rows in it, never a score.
//
// Standalone or in the workflow: `buildLanes` takes the two documents as values, so a test (or
// a screen pointed at a fixture) needs no `.sdlc/` and no bridge.
import type { BoardRow, LaneId, LanePlacement, RosterPerson, SprintSlateRow, SprintVerdictPending, SprintView } from '../../../shared/types'
import { rolesHeld, samePerson } from '../../../shared/identity'
import { LANE_IDS } from '../../../shared/nav'

/** `spec_status.py compute_waiting_on` — the sentences that mean "a reviewer, not the author, is
 * the next hand". Two are templates (the plugin appends who / why), so those match on the
 * plugin's own fixed prefix; the rest match whole. "waiting for CI: …" is the author's lane. */
export const REVIEW_SENTENCES: readonly string[] = [
  'waiting for the grader to run',
  'waiting for the security review',
  'ready to merge',
]
export const REVIEW_PREFIXES: readonly string[] = [
  'waiting for a non-author approval',
  'waiting for a readable grader verdict',
]

export function isReviewSentence(waitingOn: string | null | undefined): boolean {
  if (!waitingOn) return false
  return REVIEW_SENTENCES.includes(waitingOn) || REVIEW_PREFIXES.some((p) => waitingOn.startsWith(p))
}

/** One slated spec as the lanes hold it: the slate row (sprint.py), the board row for the same
 * id (spec_status.py, null when that read is absent) and the plugin's verdict rows for it. */
export interface LaneRow {
  id: string
  slate: SprintSlateRow
  board: BoardRow | null
  lane: LanePlacement
  verdictsPending: SprintVerdictPending[]
  isNextUp: boolean
}

/** The partition rule, one row at a time. */
export function placeRow(slate: SprintSlateRow, board: BoardRow | null, verdictSpecs: ReadonlySet<string>): LanePlacement {
  const status = slate.status.trim().toLowerCase()
  if (status === 'merged') return 'merged'
  if (status === 'ready') return slate.dor === 'READY' ? 'ready' : 'unplaced'
  if (status === 'in-flight') {
    return verdictSpecs.has(slate.id) || isReviewSentence(board?.pullRequest?.waitingOn) ? 'checking' : 'building'
  }
  return 'unplaced'
}

export interface Lanes {
  lanes: Record<LaneId, LaneRow[]>
  unplaced: LaneRow[]
  all: LaneRow[]
}

/** The slate in the plugin's order, each row placed once. `board` may be null (the host read
 * failed or never ran): rows still place from the sprint document alone, minus the PR facts. */
export function buildLanes(view: SprintView, board: readonly BoardRow[] | null): Lanes {
  const byId = new Map<string, BoardRow>()
  for (const row of board ?? []) byId.set(row.spec, row)
  const verdictSpecs = new Set(view.verdictsPending.map((v) => v.spec))
  const lanes: Record<LaneId, LaneRow[]> = { ready: [], building: [], checking: [], merged: [] }
  const unplaced: LaneRow[] = []
  const all: LaneRow[] = []
  for (const slate of view.slate) {
    const boardRow = byId.get(slate.id) ?? null
    const row: LaneRow = {
      id: slate.id,
      slate,
      board: boardRow,
      lane: placeRow(slate, boardRow, verdictSpecs),
      verdictsPending: view.verdictsPending.filter((v) => v.spec === slate.id),
      isNextUp: view.nextUp === slate.id,
    }
    all.push(row)
    if (row.lane === 'unplaced') unplaced.push(row)
    else lanes[row.lane].push(row)
  }
  return { lanes, unplaced, all }
}

/** Every lane id, in board order — re-exported so a lane component imports one module. */
export { LANE_IDS }

// --- people on a row ----------------------------------------------------------------------------

export interface RowPeople {
  owner: string
  developer: string
  checker: string
  nextOwner: string
}

/** The handles a row names, from the board row where there is one and the slate's `next_owner`
 * otherwise. Empty strings are "nobody", never a person. */
export function peopleOf(row: LaneRow): RowPeople {
  return {
    owner: row.board?.owner ?? '',
    developer: row.board?.developer ?? '',
    checker: row.board?.checker ?? '',
    nextOwner: row.slate.nextOwner || row.board?.nextOwner || '',
  }
}

/** Distinct handles on a row, in role order, so the card draws each person once. */
export function distinctPeople(row: LaneRow): string[] {
  const out: string[] = []
  for (const handle of Object.values(peopleOf(row))) {
    if (handle && !out.some((h) => samePerson(h, handle))) out.push(handle)
  }
  return out
}

// --- Mine / Team / All ------------------------------------------------------------------------

export type LaneFilterMode = 'mine' | 'team' | 'all'
export const LANE_FILTER_MODES: readonly LaneFilterMode[] = ['mine', 'team', 'all']

/** Mine = I hold a role on the row or the PR is waiting on my handle — exact matches only. */
export function isMine(row: LaneRow, me: string | null | undefined): boolean {
  if (!me) return false
  if (rolesHeld(peopleOf(row), me).length > 0) return true
  return samePerson(row.board?.pullRequest?.waitingOnHandle, me)
}

/** The roster team of the signed-in person, or null when the roster does not know them. */
export function teamOf(people: readonly RosterPerson[] | null | undefined, me: string | null | undefined): string | null {
  if (!me || !people) return null
  const mine = people.find((p) => samePerson(p.handle, me))
  return mine?.team?.trim() || null
}

export function filterLane(rows: readonly LaneRow[], mode: LaneFilterMode, me: string | null, team: string | null): LaneRow[] {
  switch (mode) {
    case 'mine': return rows.filter((r) => isMine(r, me))
    case 'team': return team ? rows.filter((r) => (r.board?.team ?? '').trim() === team) : []
    case 'all': return [...rows]
  }
}

// --- the wait on a Checking card ---------------------------------------------------------------

/** Amber ONLY on the plugin's condition: a verdict waited on for more than one business day, or
 * the host's own `over_alarm`. A null wait is "no data" and never amber. */
export function waitIsLong(v: SprintVerdictPending, row: LaneRow): boolean {
  if (row.board?.pullRequest?.overAlarm === true) return true
  return v.sinceBusinessDays !== null && v.sinceBusinessDays > 1
}
