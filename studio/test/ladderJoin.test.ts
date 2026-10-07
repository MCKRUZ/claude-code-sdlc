/** The checking ladder joined to the host (togo-command-center.md §3.3): rungs are the plugin's
 * `required_rungs()` strings; each joins a fixed host field; colour comes only from a host
 * conclusion word; the correctness rung is always "no data"; the failing rung carries
 * `waiting_on`; no rung is green without a host word. Pure. */
import { describe, expect, it } from 'vitest'
import type { RosterPerson, SpecStatus } from '../shared/types'
import { gatedPathLabel, joinLadder, rungKind } from '../shared/ladderJoin'

// Exactly what risk_model.required_rungs() writes for each tier (scripts/risk_model.py).
const LOW = ['CI (build/test/lint/coverage) — blocks', 'grader — runs, advises', 'correctness — blocks on a defect', 'non-author approval — required (light review)']
const HIGH = ['CI (build/test/lint/coverage) — blocks', 'grader — runs, advises', 'correctness — blocks on a defect', 'security pass — blocks', 'non-author approval — required (full review)', 'named human sign-off in the PR']

function pr(over: Partial<NonNullable<SpecStatus['pull_request']>> = {}): Pick<SpecStatus, 'pull_request'> {
  return {
    pull_request: {
      number: 12, url: 'https://x/pr/12', state: 'OPEN', merged_at: null,
      checks: [], grader_ran: false, verdicts: null, verdict_error: null, security_review: null, approvals: [],
      waiting_on: 'waiting for CI: unit failed', ...over,
    },
  }
}

const ROSTER: RosterPerson[] = [
  { handle: '@sam', roles: ['developer'] },
  { handle: '@priya', email: 'priya@corp.com', roles: ['checker', 'security'] },
]

describe('rungKind', () => {
  it('reads the fixed prefixes and nothing else', () => {
    expect(HIGH.map(rungKind)).toEqual(['ci', 'grader', 'correctness', 'security', 'approval', 'signoff'])
    expect(rungKind('something new the plugin adds')).toBe('unknown')
  })
})

describe('joinLadder', () => {
  it('with no PR every rung is "no data" — nothing is green without a host word', () => {
    const rows = joinLadder(HIGH, { pull_request: null }, ROSTER)
    expect(rows).toHaveLength(6)
    for (const r of rows) {
      expect(r.state).toBe('none')
      expect(r.detail).toBe('no data')
      expect(r.reason).toBeNull()
    }
    expect(rows.map((r) => r.rung)).toEqual(HIGH)
  })

  it('with no status at all behaves the same', () => {
    for (const r of joinLadder(LOW, null)) expect(r.state).toBe('none')
    for (const r of joinLadder(LOW, undefined)) expect(r.state).toBe('none')
  })

  it('CI: names the failing check and carries waiting_on as the rung\'s reason; the others carry none', () => {
    const rows = joinLadder(LOW, pr({ checks: [{ name: 'unit', status: 'completed', conclusion: 'failure' }, { name: 'lint', status: 'completed', conclusion: 'success' }] }))
    expect(rows[0]).toMatchObject({ kind: 'ci', state: 'fail', detail: 'failing: unit', reason: 'waiting for CI: unit failed', field: 'pull_request.checks[]' })
    for (const r of rows.slice(1)) expect(r.reason).toBeNull()
  })

  it('CI: pending when any check has no success yet, pass only when every check concluded success', () => {
    expect(joinLadder(LOW, pr({ checks: [{ name: 'unit', status: 'in_progress', conclusion: null }] }))[0]).toMatchObject({ state: 'pending' })
    expect(joinLadder(LOW, pr({ checks: [{ name: 'unit', status: 'completed', conclusion: 'success' }, { name: 'lint', status: 'completed', conclusion: 'success' }] }))[0])
      .toMatchObject({ state: 'pass', detail: '2 checks passed' })
  })

  it('grader: none until it ran; pending when it ran but the verdicts are unreadable; pass with verdicts', () => {
    expect(joinLadder(LOW, pr())[1]).toMatchObject({ kind: 'grader', state: 'none', detail: 'no data' })
    expect(joinLadder(LOW, pr({ grader_ran: true, verdict_error: 'no verdicts file' }))[1]).toMatchObject({ state: 'pending', detail: 'no verdicts file' })
    expect(joinLadder(LOW, pr({ grader_ran: true, verdicts: [{ check: 'c', covered: 'yes', reason: '' }] }))[1]).toMatchObject({ state: 'pass', detail: 'ran — 1 verdict' })
  })

  it('correctness is ALWAYS no data — no host field reports it', () => {
    const full = pr({
      checks: [{ name: 'unit', status: 'completed', conclusion: 'success' }], grader_ran: true, verdicts: [],
      security_review: { conclusion: 'success' }, approvals: [{ by: '@priya', at: '2026-10-05' }], waiting_on: 'ready to merge',
    })
    const rows = joinLadder(HIGH, full, ROSTER)
    expect(rows[2]).toMatchObject({ kind: 'correctness', state: 'none', detail: 'no data' })
    expect(rows[2].field).toMatch(/no host field/)
  })

  it('security: the host\'s conclusion word colours it; anything else non-null is pending', () => {
    expect(joinLadder(HIGH, pr({ security_review: { conclusion: 'success' } }), ROSTER)[3]).toMatchObject({ state: 'pass', detail: 'success' })
    expect(joinLadder(HIGH, pr({ security_review: { conclusion: 'failure' } }), ROSTER)[3]).toMatchObject({ state: 'fail', detail: 'failure' })
    expect(joinLadder(HIGH, pr({ security_review: { conclusion: 'in_progress' } }), ROSTER)[3]).toMatchObject({ state: 'pending' })
    expect(joinLadder(HIGH, pr({ security_review: { conclusion: null } }), ROSTER)[3]).toMatchObject({ state: 'none', detail: 'no data' })
  })

  it('non-author approval: pending with a PR and no approvals, pass naming the approvers', () => {
    expect(joinLadder(LOW, pr())[3]).toMatchObject({ kind: 'approval', state: 'pending', detail: 'no approval yet' })
    expect(joinLadder(LOW, pr({ approvals: [{ by: '@sam', at: null }, { by: null, at: null }] }))[3]).toMatchObject({ state: 'pass', detail: 'approved by @sam' })
  })

  it('named human sign-off: only an approval by a roster security role counts; no roster → no data, says why', () => {
    const approved = pr({ approvals: [{ by: '@sam', at: null }] })
    expect(joinLadder(HIGH, approved, ROSTER)[5]).toMatchObject({ kind: 'signoff', state: 'pending' })
    expect(joinLadder(HIGH, pr({ approvals: [{ by: 'priya@corp.com', at: null }] }), ROSTER)[5]).toMatchObject({ state: 'pass', detail: 'signed by priya@corp.com' })
    expect(joinLadder(HIGH, approved, null)[5]).toMatchObject({ state: 'none' })
    expect(joinLadder(HIGH, approved, null)[5].detail).toMatch(/no roster/)
    expect(joinLadder(HIGH, approved, [{ handle: '@sam', roles: ['developer'] }])[5].detail).toMatch(/security role/)
  })

  it('the first failing rung alone carries waiting_on', () => {
    const rows = joinLadder(HIGH, pr({
      checks: [{ name: 'unit', status: 'completed', conclusion: 'failure' }], security_review: { conclusion: 'failure' }, waiting_on: 'waiting for CI: unit failed',
    }), ROSTER)
    expect(rows.filter((r) => r.reason !== null).map((r) => r.kind)).toEqual(['ci'])
  })

  it('gated path is a declaration, never a detection', () => {
    expect(gatedPathLabel(true)).toBe('gated path: declared')
    expect(gatedPathLabel(false)).toBe('gated path: not declared')
    expect(gatedPathLabel(null)).toBe('gated path: not declared')
    expect(gatedPathLabel(undefined)).toBe('gated path: not declared')
  })
})
