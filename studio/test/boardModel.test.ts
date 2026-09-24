/** The Build board's logic (spec 0011).
 *
 * These are the acceptance checks that can actually be pinned down: who a row is waiting on,
 * what counts as overdue, what each role view contains, and how a team's load compares to its
 * limit. All pure, all fast, and all of them things that would be quietly wrong in a way
 * nobody notices — a board that marks everything as "yours" looks fine and tells you nothing.
 */

import { describe, expect, it } from 'vitest'
import type { BoardRow } from '../shared/types'
import {
  daysWaiting, filterBoard, groupBoard, isOverdue, needsMe, rolesFor, samePerson, teamLoad,
} from '../shared/boardModel'

const NOW = new Date('2026-09-24T12:00:00Z')

function row(over: Partial<BoardRow> = {}): BoardRow {
  return {
    spec: '0001', name: 'a-thing', path: 'specs/0001-a-thing.md', title: 'A thing',
    status: 'draft', risk: 'MEDIUM', team: 'core', channel: '',
    owner: '@matt', developer: '', checker: '', branch: 'spec/0001-a-thing',
    pullRequest: null,
    ...over,
  }
}

function pr(over: Partial<NonNullable<BoardRow['pullRequest']>> = {}) {
  return {
    number: 1, url: 'https://x/1', state: 'OPEN',
    mergedAt: null, updatedAt: '2026-09-24T11:00:00Z',
    waitingOn: 'waiting for a non-author approval', waitingOnHandle: null,
    ...over,
  }
}

describe('samePerson', () => {
  it('ignores the @ and the casing, because a roster and a code host disagree about both', () => {
    expect(samePerson('@Matt', 'matt')).toBe(true)
    expect(samePerson('matt', '@MATT')).toBe(true)
    expect(samePerson(' @matt ', 'matt')).toBe(true)
  })

  it('never matches when either side is missing', () => {
    // An unassigned checker must not accidentally equal an unknown account.
    expect(samePerson('', '')).toBe(false)
    expect(samePerson(null, null)).toBe(false)
    expect(samePerson('@matt', null)).toBe(false)
  })

  it('does not match a different person whose name merely contains the other', () => {
    expect(samePerson('@matt', '@matthew')).toBe(false)
  })
})

describe('rolesFor', () => {
  it('returns every role the person holds, since one person can hold more than one', () => {
    const r = row({ owner: '@matt', developer: '@matt', checker: '@priya' })
    expect(rolesFor(r, '@matt')).toEqual(['owner', 'developer'])
  })

  it('is empty for someone who holds none, and for nobody signed in', () => {
    expect(rolesFor(row(), '@priya')).toEqual([])
    expect(rolesFor(row(), null)).toEqual([])
  })
})

describe('needsMe', () => {
  it('is true when the pull request names this person', () => {
    const r = row({ pullRequest: pr({ waitingOnHandle: '@priya' }) })
    expect(needsMe(r, '@priya')).toBe(true)
  })

  it('is FALSE for the checker while it is still in CI', () => {
    // The distinction that makes this view worth opening. A board that shows the checker
    // everything they will eventually check is just the everything view with extra steps.
    const r = row({ checker: '@priya', pullRequest: pr({ waitingOnHandle: null }) })
    expect(needsMe(r, '@priya')).toBe(false)
  })

  it('is true for the owner of a spec that has no pull request yet', () => {
    // Nothing else will say so: an unwritten spec is waiting on whoever is writing it.
    expect(needsMe(row({ owner: '@matt' }), '@matt')).toBe(true)
  })

  it('is false for the owner once it has merged', () => {
    expect(needsMe(row({ owner: '@matt', status: 'merged' }), '@matt')).toBe(false)
  })

  it('is false for everyone when nobody is signed in', () => {
    expect(needsMe(row({ pullRequest: pr({ waitingOnHandle: '@priya' }) }), null)).toBe(false)
  })
})

describe('daysWaiting and isOverdue', () => {
  it('counts whole days since it last moved', () => {
    expect(daysWaiting(row({ pullRequest: pr({ updatedAt: '2026-09-22T11:00:00Z' }) }), NOW)).toBe(2)
    expect(daysWaiting(row({ pullRequest: pr({ updatedAt: '2026-09-24T11:00:00Z' }) }), NOW)).toBe(0)
  })

  it('is null — not zero — when nothing has told us', () => {
    // "We do not know how long" and "it moved today" are different, and only one of them
    // should ever be marked overdue.
    expect(daysWaiting(row(), NOW)).toBeNull()
    expect(daysWaiting(row({ pullRequest: pr({ updatedAt: null }) }), NOW)).toBeNull()
    expect(daysWaiting(row({ pullRequest: pr({ updatedAt: 'not a date' }) }), NOW)).toBeNull()
    expect(isOverdue(row(), NOW)).toBe(false)
  })

  it('marks two days or more as overdue, and one day as not', () => {
    expect(isOverdue(row({ pullRequest: pr({ updatedAt: '2026-09-22T11:00:00Z' }) }), NOW)).toBe(true)
    expect(isOverdue(row({ pullRequest: pr({ updatedAt: '2026-09-23T11:00:00Z' }) }), NOW)).toBe(false)
  })

  it('never marks finished work as late', () => {
    const old = '2026-01-01T00:00:00Z'
    expect(isOverdue(row({ pullRequest: pr({ state: 'MERGED', updatedAt: old }) }), NOW)).toBe(false)
    expect(isOverdue(row({ pullRequest: pr({ state: 'CLOSED', updatedAt: old }) }), NOW)).toBe(false)
  })
})

describe('filterBoard', () => {
  const rows = [
    row({ spec: '0001', owner: '@matt', team: 'core', risk: 'HIGH', status: 'draft' }),
    row({ spec: '0002', owner: '@priya', developer: '@matt', team: 'claims', risk: 'LOW', status: 'in-flight' }),
    row({ spec: '0003', owner: '@priya', checker: '@matt', team: 'claims', risk: 'MEDIUM', status: 'ready',
          title: 'Duplicate claim handling' }),
  ]

  it('each role view contains only that role', () => {
    expect(filterBoard(rows, { role: 'owner' }, '@matt').map((r) => r.spec)).toEqual(['0001'])
    expect(filterBoard(rows, { role: 'developer' }, '@matt').map((r) => r.spec)).toEqual(['0002'])
    expect(filterBoard(rows, { role: 'checker' }, '@matt').map((r) => r.spec)).toEqual(['0003'])
    expect(filterBoard(rows, { role: 'everything' }, '@matt')).toHaveLength(3)
  })

  it('filters narrow without the role view losing its meaning', () => {
    expect(filterBoard(rows, { role: 'everything', team: 'claims' }, '@matt')).toHaveLength(2)
    expect(filterBoard(rows, { role: 'everything', risk: 'HIGH' }, '@matt')).toHaveLength(1)
    expect(filterBoard(rows, { role: 'everything', status: 'ready' }, '@matt')).toHaveLength(1)
    expect(filterBoard(rows, { role: 'checker', team: 'claims' }, '@matt').map((r) => r.spec)).toEqual(['0003'])
  })

  it('search looks at the number, the title and the people', () => {
    expect(filterBoard(rows, { role: 'everything', search: 'duplicate' }, '@matt').map((r) => r.spec)).toEqual(['0003'])
    expect(filterBoard(rows, { role: 'everything', search: '0002' }, '@matt').map((r) => r.spec)).toEqual(['0002'])
    expect(filterBoard(rows, { role: 'everything', search: 'priya' }, '@matt')).toHaveLength(2)
    expect(filterBoard(rows, { role: 'everything', search: '   ' }, '@matt')).toHaveLength(3)
  })

  it('a signed-out person sees nothing in a role view rather than everything', () => {
    // Failing open here would show one person's board to whoever opened the app.
    expect(filterBoard(rows, { role: 'owner' }, null)).toHaveLength(0)
    expect(filterBoard(rows, { role: 'needs-me' }, null)).toHaveLength(0)
  })
})

describe('groupBoard', () => {
  const rows = [
    row({ spec: '0001', team: 'core', developer: '@sam' }),
    row({ spec: '0002', team: 'claims', developer: '@sam' }),
    row({ spec: '0003', team: '', developer: '' }),
  ]

  it('groups by team, with the unnamed bucket last', () => {
    expect(groupBoard(rows, 'team').map((g) => g.key)).toEqual(['claims', 'core', 'no team'])
  })

  it('groups by person, falling back to the owner when there is no developer', () => {
    const grouped = groupBoard([row({ developer: '', owner: '@matt' })], 'person')
    expect(grouped[0].key).toBe('@matt')
  })

  it('keeps every row — grouping must never lose one', () => {
    for (const by of ['none', 'team', 'person', 'epic'] as const) {
      const total = groupBoard(rows, by).reduce((n, g) => n + g.rows.length, 0)
      expect(total, `grouping by ${by} lost a row`).toBe(rows.length)
    }
  })
})

describe('teamLoad', () => {
  const rows = [
    row({ team: 'core', status: 'in-flight' }),
    row({ team: 'core', status: 'in-flight' }),
    row({ team: 'core', status: 'draft' }),
    row({ team: 'claims', status: 'in-flight' }),
  ]

  it('counts only in-flight work against the limit', () => {
    const load = teamLoad(rows, { core: { in_flight: 2, wip_limit: 2 }, claims: { in_flight: 1, wip_limit: 3 } })
    expect(load.find((t) => t.team === 'core')).toMatchObject({ inFlight: 2, limit: 2, atLimit: true, overLimit: false })
    expect(load.find((t) => t.team === 'claims')).toMatchObject({ inFlight: 1, limit: 3, atLimit: false, overLimit: false })
  })

  it('marks a team over its limit', () => {
    const load = teamLoad(rows, { core: { in_flight: 2, wip_limit: 1 } })
    expect(load.find((t) => t.team === 'core')).toMatchObject({ overLimit: true })
  })

  it('a team with no declared limit gets null, not an invented default', () => {
    // A project that has not adopted per-team limits must not be measured against one.
    const load = teamLoad(rows, null)
    expect(load.every((t) => t.limit === null && !t.atLimit && !t.overLimit)).toBe(true)
  })
})
