/** The lanes are a PARTITION of the slate decided from plugin fields only (togo-command-center.md
 * §3.1, P5 acceptance): every fixture row lands in exactly one lane or in `unplaced`; placement
 * never reads `wait_hours`, `developer` or a date; the Checking test matches `spec_status.py`'s
 * own sentences exactly; amber comes only from the plugin's wait or `over_alarm`. */
import { describe, expect, it } from 'vitest'
import type { BoardRow } from '../shared/types'
import {
  buildLanes, distinctPeople, filterLane, isMine, isReviewSentence, LANE_FILTER_MODES, peopleOf, placeRow, REVIEW_PREFIXES,
  REVIEW_SENTENCES, teamOf, waitIsLong,
} from '../src/components/lanes/laneModel'
import { BOARD_ROWS, boardRow, ME, ROSTER, slateRow, SPRINT } from './sprintHomeFixture'

describe('buildLanes is a partition', () => {
  const lanes = buildLanes(SPRINT, BOARD_ROWS)

  it('places every slate row in exactly one lane or unplaced', () => {
    const placed = [...lanes.lanes.ready, ...lanes.lanes.building, ...lanes.lanes.checking, ...lanes.lanes.merged, ...lanes.unplaced]
    expect(placed.map((r) => r.id).sort()).toEqual(SPRINT.slate.map((r) => r.id).sort())
    expect(new Set(placed.map((r) => r.id)).size).toBe(SPRINT.slate.length)
    expect(lanes.all).toHaveLength(SPRINT.slate.length)
  })

  it('Ready = status ready AND dor READY; the next_up row is tagged', () => {
    expect(lanes.lanes.ready.map((r) => r.id)).toEqual(['0007'])
    expect(lanes.lanes.ready[0].isNextUp).toBe(true)
  })

  it('Building = in-flight, no verdict pending, waiting_on is CI (the author\'s lane)', () => {
    expect(lanes.lanes.building.map((r) => r.id)).toEqual(['0008'])
  })

  it('Checking = in-flight AND (in verdicts_pending OR a review sentence); the plugin\'s verdict rows ride along', () => {
    expect(lanes.lanes.checking.map((r) => r.id)).toEqual(['0009'])
    expect(lanes.lanes.checking[0].verdictsPending).toEqual(SPRINT.verdictsPending)
  })

  it('Merged = status merged', () => {
    expect(lanes.lanes.merged.map((r) => r.id)).toEqual(['0010'])
  })

  it('a NOT READY ready row is unplaced (it lives in Refining), never in a lane', () => {
    expect(lanes.unplaced.map((r) => r.id)).toEqual(['0011'])
  })

  it('places rows from the sprint document alone when the board read is absent', () => {
    const noBoard = buildLanes(SPRINT, null)
    expect(noBoard.lanes.ready.map((r) => r.id)).toEqual(['0007'])
    // 0009 is in verdicts_pending → Checking even without a PR sentence to read.
    expect(noBoard.lanes.checking.map((r) => r.id)).toEqual(['0009'])
    expect(noBoard.lanes.building.map((r) => r.id)).toEqual(['0008'])
    expect(noBoard.all.every((r) => r.board === null)).toBe(true)
  })
})

describe('placeRow reads plugin fields only', () => {
  const none = new Set<string>()
  it('draft and deferred are unplaced whatever the board says', () => {
    expect(placeRow(slateRow({ status: 'draft' }), boardRow({ developer: ME }), none)).toBe('unplaced')
    expect(placeRow(slateRow({ status: 'deferred' }), null, none)).toBe('unplaced')
  })
  it('ignores wait_hours, developer and dates: two rows differing only in those place alike', () => {
    const a = boardRow({ status: 'in-flight', developer: '', pullRequest: { number: 1, url: '', state: 'OPEN', mergedAt: null, updatedAt: null, waitingOn: 'waiting for the grader to run', waitingOnHandle: null } })
    const b: BoardRow = { ...a, developer: '@sam-k', pullRequest: { ...a.pullRequest!, waitHours: 900, overAlarm: true, updatedAt: '2020-01-01T00:00:00Z' } }
    expect(placeRow(slateRow({ status: 'in-flight' }), a, none)).toBe('checking')
    expect(placeRow(slateRow({ status: 'in-flight' }), b, none)).toBe('checking')
  })
  it('an in-flight row with a null PR and no verdict pending is Building', () => {
    expect(placeRow(slateRow({ status: 'in-flight' }), boardRow({ pullRequest: null }), none)).toBe('building')
  })
})

describe('isReviewSentence matches spec_status.py\'s ladder strings exactly', () => {
  it('the three fixed sentences and the two plugin templates', () => {
    for (const s of REVIEW_SENTENCES) expect(isReviewSentence(s)).toBe(true)
    for (const p of REVIEW_PREFIXES) expect(isReviewSentence(`${p}; requested from @sam-k 2 days ago`)).toBe(true)
  })
  it('CI, draft, merged and closed sentences are not review sentences', () => {
    expect(isReviewSentence('waiting for CI: unit failed')).toBe(false)
    expect(isReviewSentence('waiting for CI: unit still running')).toBe(false)
    expect(isReviewSentence('waiting for the branch to be marked ready for review')).toBe(false)
    expect(isReviewSentence('merged')).toBe(false)
    expect(isReviewSentence('closed without merging')).toBe(false)
    expect(isReviewSentence(null)).toBe(false)
    expect(isReviewSentence('')).toBe(false)
  })
  it('never matches a sentence with the same words in a different shape', () => {
    expect(isReviewSentence('Ready to merge')).toBe(false)
    expect(isReviewSentence('still waiting for the grader to run')).toBe(false)
  })
})

describe('people and the Mine / Team / All filter', () => {
  const lanes = buildLanes(SPRINT, BOARD_ROWS)
  const by = (id: string) => lanes.all.find((r) => r.id === id)!

  it('peopleOf reads the board row\'s roles and the slate\'s next_owner; blanks are nobody', () => {
    expect(peopleOf(by('0008'))).toEqual({ owner: '@priya-n', developer: ME, checker: '@sam-k', nextOwner: '@sam-k' })
    expect(distinctPeople(by('0008'))).toEqual(['@priya-n', ME, '@sam-k'])
    expect(distinctPeople(by('0007'))).toEqual([ME])
  })

  it('Mine = a role held or the PR waiting on my handle, exact match only', () => {
    expect(isMine(by('0008'), ME)).toBe(true) // developer
    expect(isMine(by('0009'), ME)).toBe(true) // checker + waiting_on_handle
    expect(isMine(by('0010'), ME)).toBe(false)
    expect(isMine(by('0007'), 'arjun')).toBe(false) // a prefix is not a person
    expect(isMine(by('0007'), null)).toBe(false)
  })

  it('Team = the row\'s team equals my roster team; no roster or unknown me → nobody', () => {
    expect(teamOf(ROSTER.people, ME)).toBe('core')
    expect(teamOf(ROSTER.people, '@nobody')).toBeNull()
    expect(teamOf(null, ME)).toBeNull()
    expect(filterLane(lanes.all, 'team', ME, 'core').map((r) => r.id)).toEqual(['0007', '0008', '0010', '0011'])
    expect(filterLane(lanes.all, 'team', ME, null)).toEqual([])
  })

  it('All keeps every row; the three modes are the only ones', () => {
    expect(filterLane(lanes.all, 'all', null, null)).toHaveLength(lanes.all.length)
    expect(LANE_FILTER_MODES).toEqual(['mine', 'team', 'all'])
    expect(filterLane(lanes.all, 'mine', ME, null).map((r) => r.id)).toEqual(['0007', '0008', '0009'])
  })
})

describe('waitIsLong — amber only on the plugin\'s condition', () => {
  const lanes = buildLanes(SPRINT, BOARD_ROWS)
  const checking = lanes.lanes.checking[0]
  it('> 1 business day or over_alarm; null is never long', () => {
    expect(waitIsLong({ spec: '0009', lane: 'eng', sinceBusinessDays: 2 }, checking)).toBe(true)
    const calm = { ...checking, board: { ...checking.board!, pullRequest: { ...checking.board!.pullRequest!, overAlarm: false } } }
    expect(waitIsLong({ spec: '0009', lane: 'eng', sinceBusinessDays: 1 }, calm)).toBe(false)
    expect(waitIsLong({ spec: '0009', lane: 'data', sinceBusinessDays: null }, calm)).toBe(false)
    expect(waitIsLong({ spec: '0009', lane: 'data', sinceBusinessDays: null }, checking)).toBe(true) // over_alarm from the host
  })
})
