/** The Issues view's pure model (src/components/issues/issuesModel.ts): a button's one disabled
 * reason comes from the plugin (`show --json`'s sentence), a capability a newer plugin brings, or
 * `NO_ACTOR` — never a judgement Studio made; the forms become requests with nothing invented; the
 * plugin's proposals are pre-selected and marked. */
import { describe, expect, it } from 'vitest'
import type { IssueDetail } from '../shared/types'
import { NO_ACTOR } from '../shared/reasons'
import { ACTION_ORDER, actionReason, countsLine, initialForm, previewVerb, requestFor, statusTone, visibleRows, EMPTY_FORM } from '../src/components/issues/issuesModel'

const DETAIL: IssueDetail = {
  issue: 'ISS-0001', title: 'Claim total doubles after adding a second line item', status: 'new', channel: 'web', environment: 'test', product_version: null,
  severity: 'degraded', frequency: 'always', data_impact: 'wrong-shown', persona: 'a claims adjuster', reporter_role: 'checker', spec: null,
  priority: null, target_sprint: null, triaged_by: null, triage_verdict: null, prioritized_by: null, duplicate_of: null, bugfix_spec: null,
  reported_by: 'Priya N.', reported_at: '2026-10-07T07:00:00+00:00', screenshots: 1, filed_host: null, filed_url: null, escaped_from: null,
  path: '.sdlc/issues/ISS-0001-x.md', proposed_risk: 'MEDIUM', proposed_priority: 'P2', sections: {}, screenshot_paths: [],
  actions: {
    triage: { ok: true, reason: null, to: 'triaged' },
    prioritize: { ok: false, reason: 'ISS-0001 is new — a report is prioritized once it has been reviewed and confirmed (`triage --verdict confirmed`)', to: null },
    promote: { ok: false, reason: 'ISS-0001 is new — review it first (`triage`), then prioritize it; a bugfix spec is scaffolded only from a prioritized report', to: null },
    fixed: { ok: false, reason: 'ISS-0001 is new — nobody has confirmed the bug yet; triage it before calling it fixed', to: null },
    'wont-fix': { ok: true, reason: null, to: 'wont-fix' }, duplicate: { ok: true, reason: null, to: 'duplicate' },
    reopen: { ok: false, reason: 'ISS-0001 is new, not closed — nothing to reopen', to: null },
    file: { ok: true, reason: null, to: null }, note: { ok: true, reason: null, to: null },
  },
}
const CAPS = ['issue-triage', 'issue-prioritize', 'issue-promote', 'issue-file', 'issue-sync']

describe('actionReason — the one disabled reason, in the plugin’s words', () => {
  it('no actor first, then a capability a newer plugin brings, then the lifecycle’s own sentence', () => {
    expect(actionReason('triage', DETAIL, null, CAPS)).toBe(NO_ACTOR)
    expect(actionReason('triage', DETAIL, 'Sam K', ['issue-list'])).toBe('arrives with a newer plugin: lacks issue-triage')
    expect(actionReason('promote', DETAIL, 'Sam K', ['issue-list'])).toBe('arrives with a newer plugin: lacks issue-promote')
    expect(actionReason('promote', DETAIL, 'Sam K', CAPS)).toMatch(/review it first/)
    expect(actionReason('triage', DETAIL, 'Sam K', CAPS)).toBeNull()
    expect(actionReason('file', DETAIL, 'Sam K', CAPS)).toBeNull()
    expect(actionReason('reopen', DETAIL, 'Sam K', CAPS)).toMatch(/nothing to reopen/)
  })

  it('with the capabilities unknown nothing is disabled on their account', () => {
    expect(actionReason('triage', DETAIL, 'Sam K', null)).toBeNull()
  })

  it('the buttons sit next-step first', () => {
    expect(ACTION_ORDER.slice(0, 3)).toEqual(['triage', 'prioritize', 'promote'])
  })
})

describe('initialForm and requestFor — the proposal pre-selected, nothing invented', () => {
  it('prioritize opens on the proposed priority; promote on the proposed tier, slating when a target sprint exists', () => {
    expect(initialForm('prioritize', DETAIL).priority).toBe('P2')
    expect(initialForm('promote', DETAIL).risk).toBe('MEDIUM')
    expect(initialForm('promote', DETAIL).slate).toBe(false)
    expect(initialForm('promote', { ...DETAIL, target_sprint: 'S08' }).slate).toBe(true)
    expect(initialForm('triage', DETAIL)).toMatchObject({ severity: 'degraded', dataImpact: 'wrong-shown', verdict: 'confirmed' })
  })

  it('a recorded priority wins over the proposal when the report already has one', () => {
    expect(initialForm('prioritize', { ...DETAIL, priority: 'P1' }).priority).toBe('P1')
  })

  it('each kind becomes exactly its verb’s request', () => {
    expect(requestFor('triage', 'ISS-0001', { ...EMPTY_FORM, verdict: 'needs-info', question: 'Which claim type?' })).toEqual({ verb: 'triage', issue: 'ISS-0001', verdict: 'needs-info', question: 'Which claim type?' })
    expect(requestFor('triage', 'ISS-0001', { ...EMPTY_FORM, verdict: 'confirmed', severity: 'blocks', dataImpact: 'exposed', reason: ' ok ' })).toEqual({ verb: 'triage', issue: 'ISS-0001', verdict: 'confirmed', severity: 'blocks', dataImpact: 'exposed', reason: 'ok' })
    expect(requestFor('triage', 'ISS-0002', { ...EMPTY_FORM, verdict: 'duplicate', of: 'iss-0001' })).toEqual({ verb: 'triage', issue: 'ISS-0002', verdict: 'duplicate', of: 'ISS-0001' })
    expect(requestFor('prioritize', 'ISS-0001', { ...EMPTY_FORM, priority: 'P1', targetSprint: 'S08' })).toEqual({ verb: 'prioritize', issue: 'ISS-0001', priority: 'P1', targetSprint: 'S08' })
    expect(requestFor('promote', 'ISS-0001', { ...EMPTY_FORM, risk: 'HIGH', owner: '@priya-n', slate: true })).toEqual({ verb: 'promote', issue: 'ISS-0001', risk: 'HIGH', owner: '@priya-n', slate: true })
    expect(requestFor('fixed', 'ISS-0001', EMPTY_FORM)).toEqual({ verb: 'set-status', issue: 'ISS-0001', status: 'fixed' })
    expect(requestFor('wont-fix', 'ISS-0001', { ...EMPTY_FORM, reason: 'retired screen' })).toEqual({ verb: 'set-status', issue: 'ISS-0001', status: 'wont-fix', reason: 'retired screen' })
    expect(requestFor('duplicate', 'ISS-0001', { ...EMPTY_FORM, of: 'ISS-0002' })).toEqual({ verb: 'set-status', issue: 'ISS-0001', status: 'duplicate', of: 'ISS-0002' })
    expect(requestFor('note', 'ISS-0001', { ...EMPTY_FORM, note: 'Motor' })).toEqual({ verb: 'note', issue: 'ISS-0001', note: 'Motor' })
    expect(requestFor('reopen', 'ISS-0001', { ...EMPTY_FORM, reason: 'still there' })).toEqual({ verb: 'reopen', issue: 'ISS-0001', reason: 'still there' })
    expect(requestFor('file', 'ISS-0001', { ...EMPTY_FORM, dryRun: true, label: 'bug' })).toEqual({ verb: 'file', issue: 'ISS-0001', dryRun: true, label: 'bug' })
  })

  it('the preview is the golden line, or the table’s refusal as words', () => {
    expect(previewVerb({ verb: 'triage', issue: 'ISS-0001', verdict: 'confirmed' }, 'Sam K')).toEqual({ line: 'Run: report_issue.py triage --issue ISS-0001 --verdict confirmed --by "Sam K" --json', errors: [] })
    expect(previewVerb({ verb: 'triage', issue: 'ISS-0001', verdict: 'needs-info' }, 'Sam K').errors).toEqual(['question is required'])
  })
})

describe('the queue', () => {
  const rows = [
    { issue: 'ISS-0003', status: 'new' }, { issue: 'ISS-0002', status: 'prioritized' }, { issue: 'ISS-0001', status: 'fixed' },
  ] as unknown as Parameters<typeof visibleRows>[0]
  it('filters keep the plugin’s order and never re-sort', () => {
    expect(visibleRows(rows, 'queue').map((r) => r.issue)).toEqual(['ISS-0003'])
    expect(visibleRows(rows, 'open').map((r) => r.issue)).toEqual(['ISS-0003', 'ISS-0002'])
    expect(visibleRows(rows, 'all').map((r) => r.issue)).toEqual(['ISS-0003', 'ISS-0002', 'ISS-0001'])
  })
  it('the counts line names only the statuses with reports, in the plugin’s words', () => {
    expect(countsLine({ new: 2, triaged: 0, fixed: 1 }, { new: 'New — awaiting review', fixed: 'Fixed' })).toBe('2 new · 1 fixed')
    expect(countsLine({ new: 0 })).toBe('')
  })
  it('status tones: amber for a decision owed, teal for in flight, green for fixed, grey for closed', () => {
    expect([statusTone('new'), statusTone('triaged'), statusTone('fixed'), statusTone('wont-fix')]).toEqual(['warn', 'accent', 'ok', 'neutral'])
  })
})
