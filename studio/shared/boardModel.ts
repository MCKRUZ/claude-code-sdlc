// Lives in shared/ rather than beside the main process because BOTH sides use it: the
// window filters and groups with it, and it is tested directly. (Its sibling types.ts must
// stay types-only for its own reason — it is included in two separate TypeScript projects
// that have no built output to reference each other through. That rule is about that file,
// not about this directory.)
//
// The Build board's logic (spec 0011) — pure, so it can be proven directly.
//
// Nothing here reads a file or spawns a process. That is deliberate and it is the spec's own
// requirement, not a testing preference: "switching role views does not re-read the
// repository". The board is fetched ONCE and every view of it — role, search, filter,
// grouping — is a transformation of what is already in hand. If any of this needed the
// repository, switching a tab would hit the disk and the network, which is both slow and a
// different answer each time for no reason the person did anything to cause.
//
// The other rule shaping this file: Studio computes no status of its own. Every value below
// comes from a spec's own frontmatter or from its pull request, as reported by the plugin.
// The one thing computed here is "is this waiting on me", which is a comparison, not a
// judgement — and it compares handles the plugin supplies, never prose it wrote.

import type { BoardRow, BoardRole, BoardGrouping, BoardFilters } from './types'

/** Two days is the spec's own threshold for "overdue". Business days are deliberately not
 * modelled: the plugin's decision log uses plain elapsed days too, and inventing a second,
 * subtly different clock here would make two parts of the same product disagree about
 * whether the same thing is late. */
const OVERDUE_DAYS = 2

function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase()
}

export function samePerson(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return normalizeHandle(a) === normalizeHandle(b)
}

/** Every role this person holds on this spec. A person can hold more than one — Matt's
 * resolved decision is that owner and developer may be the same person, so this returns a
 * set rather than a single answer. */
export function rolesFor(row: BoardRow, account: string | null): BoardRole[] {
  if (!account) return []
  const roles: BoardRole[] = []
  if (samePerson(row.owner, account)) roles.push('owner')
  if (samePerson(row.developer, account)) roles.push('developer')
  if (samePerson(row.checker, account)) roles.push('checker')
  return roles
}

/** Is this row actually waiting on this person right now?
 *
 * Two cases, and only two, because a board that marks everything as "yours" tells nobody
 * anything:
 *
 *  1. Its pull request names them — the plugin supplies that handle structurally, so this is
 *     a comparison rather than a reading of English.
 *  2. It has no pull request yet and they own it. A spec that is still being written is
 *     waiting on the person writing it, and nothing else will say so.
 *
 * Being the checker of something that is still in CI is NOT waiting on you. That is the
 * distinction that makes the view worth opening. */
export function needsMe(row: BoardRow, account: string | null): boolean {
  if (!account) return false
  if (row.pullRequest) return samePerson(row.pullRequest.waitingOnHandle, account)
  if (row.status === 'merged') return false
  return samePerson(row.owner, account)
}

/** Days since this row last moved, or null when nothing has told us. Null is not zero: "we
 * do not know how long" and "it moved today" are different, and only one of them should ever
 * be marked overdue. */
export function daysWaiting(row: BoardRow, now: Date): number | null {
  const since = row.pullRequest?.updatedAt
  if (!since) return null
  const then = Date.parse(since)
  if (Number.isNaN(then)) return null
  return Math.floor((now.getTime() - then) / 86_400_000)
}

export function isOverdue(row: BoardRow, now: Date): boolean {
  if (row.pullRequest && (row.pullRequest.state === 'MERGED' || row.pullRequest.state === 'CLOSED')) {
    return false // finished work cannot be late
  }
  const days = daysWaiting(row, now)
  return days !== null && days >= OVERDUE_DAYS
}

function matchesSearch(row: BoardRow, search: string): boolean {
  const needle = search.trim().toLowerCase()
  if (!needle) return true
  return [row.spec, row.title, row.name, row.owner, row.developer, row.checker, row.team]
    .some((field) => (field ?? '').toLowerCase().includes(needle))
}

/** Role first, then the narrowing filters. Order matters only for readability — the result
 * is the same either way, since every predicate is independent. */
export function filterBoard(rows: BoardRow[], filters: BoardFilters, account: string | null): BoardRow[] {
  return rows.filter((row) => {
    switch (filters.role) {
      case 'needs-me': if (!needsMe(row, account)) return false; break
      case 'owner': if (!samePerson(row.owner, account)) return false; break
      case 'developer': if (!samePerson(row.developer, account)) return false; break
      case 'checker': if (!samePerson(row.checker, account)) return false; break
      case 'everything': break
    }
    if (filters.team && row.team !== filters.team) return false
    if (filters.risk && row.risk !== filters.risk) return false
    if (filters.status && row.status !== filters.status) return false
    return matchesSearch(row, filters.search ?? '')
  })
}

/** Grouped for display. Returns entries rather than an object so the order is stable and
 * chosen here, not by whatever order the keys happened to be inserted in. */
export function groupBoard(rows: BoardRow[], by: BoardGrouping): Array<{ key: string; rows: BoardRow[] }> {
  if (by === 'none') return [{ key: '', rows }]

  const keyOf = (row: BoardRow): string => {
    if (by === 'team') return row.team || 'no team'
    if (by === 'person') return row.developer || row.owner || 'unassigned'
    return row.epic || 'no epic'
  }

  const groups = new Map<string, BoardRow[]>()
  for (const row of rows) {
    const key = keyOf(row)
    const existing = groups.get(key)
    if (existing) existing.push(row)
    else groups.set(key, [row])
  }

  // Named groups alphabetically, with the catch-all bucket last wherever it appears —
  // "unassigned" sorting into the u's would hide it in the middle of real teams.
  const catchAll = ['no team', 'unassigned', 'no epic']
  return [...groups.entries()]
    .map(([key, groupRows]) => ({ key, rows: groupRows }))
    .sort((a, b) => {
      const aLast = catchAll.includes(a.key)
      const bLast = catchAll.includes(b.key)
      if (aLast !== bLast) return aLast ? 1 : -1
      return a.key.localeCompare(b.key)
    })
}

/** How many of a team's specs are in flight, against its limit. Returns null for a team with
 * no declared limit rather than inventing one — a project that has not adopted per-team
 * limits should see no limit, not a made-up default it will be measured against. */
export function teamLoad(
  rows: BoardRow[],
  limits: Record<string, { in_flight: number; wip_limit: number }> | null,
): Array<{ team: string; inFlight: number; limit: number | null; atLimit: boolean; overLimit: boolean }> {
  const teams = [...new Set(rows.map((r) => r.team).filter(Boolean))].sort()
  return teams.map((team) => {
    const inFlight = rows.filter((r) => r.team === team && r.status === 'in-flight').length
    const limit = limits?.[team]?.wip_limit ?? null
    return {
      team,
      inFlight,
      limit,
      atLimit: limit !== null && inFlight === limit,
      overLimit: limit !== null && inFlight > limit,
    }
  })
}
