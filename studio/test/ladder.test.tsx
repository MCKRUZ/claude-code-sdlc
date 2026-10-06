// @vitest-environment jsdom
/** The checking ladder (togo-command-center.md §3.3, §7 P6): rungs verbatim from the plugin; no rung
 * green without a host conclusion; the correctness rung always "no data"; the failing rung carries
 * `waiting_on`; "gated path: not declared" unless the frontmatter said so. */
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { SpecLadder, SpecStatus } from '../shared/types'
import { GATED_PATH_NOT_DECLARED, newerPlugin } from '../shared/reasons'
import { Ladder } from '../src/components/SpecCard/Ladder'

const LADDER: SpecLadder = {
  tier: 'HIGH', touchesGatedPath: null,
  rungs: ['CI (lint, unit, contract) — blocks', 'grader — runs, advises', 'correctness — blocks on a defect', 'security pass — blocks', 'non-author approval — required (deep review)', 'named human sign-off in the PR'],
}
const PR: NonNullable<SpecStatus['pull_request']> = {
  number: 12, url: 'https://x/12', state: 'OPEN', merged_at: null,
  checks: [{ name: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'lint', status: 'COMPLETED', conclusion: 'FAILURE' }],
  grader_ran: true, verdicts: [{ check: 'a', covered: 'covered', reason: '' }], verdict_error: null,
  security_review: { conclusion: 'SUCCESS' }, approvals: [{ by: '@priya-n', at: null }], waiting_on: 'waiting for CI: lint failed',
}
const ROSTER = [{ handle: '@priya-n', name: 'Priya N', roles: ['checker', 'security'] }]

afterEach(cleanup)
const rung = (kind: string) => document.querySelector(`[data-rung="${kind}"]`)!

describe('Ladder', () => {
  it('draws every rung verbatim, coloured only by the host; correctness is always "no data"; the failing rung carries waiting_on', () => {
    render(<Ladder ladder={LADDER} status={{ pull_request: PR }} roster={ROSTER} />)
    for (const r of LADDER.rungs) expect(screen.getByText(r)).toBeTruthy()
    expect(rung('ci').getAttribute('data-rung-state')).toBe('fail')
    expect(within(rung('ci') as HTMLElement).getByText('waiting for CI: lint failed')).toBeTruthy()
    expect(rung('ci').textContent).toContain('failing: lint')
    expect(rung('grader').getAttribute('data-rung-state')).toBe('pass')
    expect(rung('correctness').getAttribute('data-rung-state')).toBe('none')
    expect(rung('correctness').textContent).toContain('no data')
    expect(rung('security').getAttribute('data-rung-state')).toBe('pass')
    expect(rung('approval').getAttribute('data-rung-state')).toBe('pass')
    expect(rung('signoff').getAttribute('data-rung-state')).toBe('pass')
    expect(rung('signoff').textContent).toContain('signed by @priya-n')
    expect(screen.getByTestId('gated-path').textContent).toBe(GATED_PATH_NOT_DECLARED)
    // One reason only, on the failing rung.
    expect(document.querySelectorAll('[data-rung-reason]')).toHaveLength(1)
  })

  it('with no pull request nothing is green: every rung is "no data" except the fixed sentences the join gives', () => {
    render(<Ladder ladder={LADDER} status={{ pull_request: null }} roster={ROSTER} />)
    expect(document.querySelectorAll('[data-rung-state="pass"]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-rung-state="none"]').length).toBe(LADDER.rungs.length)
    expect(document.querySelectorAll('[data-rung-reason]')).toHaveLength(0)
  })

  it('a declared gated path reads so; a missing ladder names the capability or the block\'s error', () => {
    render(<Ladder ladder={{ ...LADDER, touchesGatedPath: true }} status={null} />)
    expect(screen.getByTestId('gated-path').textContent).toBe('gated path: declared')
    cleanup()
    render(<Ladder ladder={null} status={null} hasLadderCapability={false} />)
    expect(screen.getByTestId('ladder-empty').textContent).toBe(newerPlugin('readiness-all'))
    cleanup()
    render(<Ladder ladder={null} ladderError="spec_readiness.py: unreadable frontmatter" status={null} />)
    expect(screen.getByTestId('ladder-empty').textContent).toBe('spec_readiness.py: unreadable frontmatter')
  })

  it('every rung names the host field it read (provenance), and a pending check is pending, not red', () => {
    const pending = { ...PR, checks: [{ name: 'ci', status: 'IN_PROGRESS', conclusion: null }], waiting_on: 'waiting for CI' }
    render(<Ladder ladder={LADDER} status={{ pull_request: pending }} />)
    expect(rung('ci').getAttribute('data-rung-state')).toBe('pending')
    expect(rung('ci').textContent).toContain('pull_request.checks[]')
    expect(rung('security').textContent).toContain('pull_request.security_review.conclusion')
    expect(rung('signoff').textContent).toContain('no roster')
  })
})
