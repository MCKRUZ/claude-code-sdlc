/** The closed argv table for `report_issue.py` (shared/issueArgv.ts) — golden lines, so the dialog's
 * preview, the console's narration and the spawn all read the same words; shape refusals that never
 * spawn; and the plugin's own vocabularies mirrored, so a made-up value is refused before any spawn. */
import { describe, expect, it } from 'vitest'
import type { IssueReportRequest, IssueVerbRequest } from '../shared/types'
import {
  buildIssueArgv, buildIssueVerbArgv, describeIssueArgv, ISSUE_VERB_CAPABILITY, sketchIssueArgv, validateIssueRequest, validateIssueVerbRequest,
} from '../shared/issueArgv'

const REQ: IssueReportRequest = {
  channel: 'web', title: 'Claim total doubles after adding a second line item',
  whatHappened: 'Adding a second line item shows the claim total as twice the sum of the two lines.',
  expected: 'The total is the sum of the line items', steps: ['open claim 1042', 'add a line item of 100'],
  environment: 'test', severity: 'degraded', frequency: 'always', dataImpact: 'wrong-shown', persona: 'a claims adjuster', reporterRole: 'checker',
  spec: '0007', screenshots: ['/tmp/togo-issues/pasted-1.png'], noClientData: true,
  answers: { last_action: 'clicked Add line item', browser_device: 'Chrome 130 on Windows 11', url: '' },
  environmentPath: '/tmp/togo-issues/environment-1.json',
}

describe('buildIssueArgv — the golden line for `new`', () => {
  it('is the verb, the base fields in the plugin’s order, the answers sorted, the screenshots, the privacy flag, the facts, --by, --json', () => {
    const built = buildIssueArgv(REQ, '@arjun-m')
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.argv).toEqual([
      'new', '--title', 'Claim total doubles after adding a second line item', '--channel', 'web',
      '--what', 'Adding a second line item shows the claim total as twice the sum of the two lines.',
      '--expected', 'The total is the sum of the line items', '--steps', 'open claim 1042', '--steps', 'add a line item of 100',
      '--environment', 'test', '--severity', 'degraded', '--frequency', 'always', '--data-impact', 'wrong-shown',
      '--persona', 'a claims adjuster', '--reporter-role', 'checker', '--spec', '0007',
      '--answer', 'browser_device=Chrome 130 on Windows 11', '--answer', 'last_action=clicked Add line item',
      '--screenshot', '/tmp/togo-issues/pasted-1.png', '--no-client-data', '--env-json', '/tmp/togo-issues/environment-1.json',
      '--by', '@arjun-m', '--json',
    ])
    expect(describeIssueArgv(built.argv)).toMatch(/^Run: report_issue\.py new --title "Claim total doubles/)
    expect(describeIssueArgv(built.argv)).toContain('--by @arjun-m --json')
  })

  it('carries the product version and the escaped check when given, and an empty answer is dropped', () => {
    const built = buildIssueArgv({ ...REQ, productVersion: 'v2.3.1 (build 884)', escapedFrom: 'grader', answers: { url: '  ' } }, 'Priya N.')
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.argv).toContain('--product-version')
    expect(built.argv[built.argv.indexOf('--product-version') + 1]).toBe('v2.3.1 (build 884)')
    expect(built.argv).toContain('--escaped-from')
    expect(built.argv).not.toContain('--answer')
    expect(describeIssueArgv(built.argv)).toContain('--by "Priya N."')
  })

  it('refuses the shape gaps the plugin would also refuse — and never spawns for them', () => {
    const gaps = validateIssueRequest({ ...REQ, channel: 'mainframe', title: '', environment: 'moon', dataImpact: 'bad', reporterRole: 'tester', screenshots: [], noClientData: false, environmentPath: '', spec: '7' })
    expect(gaps).toEqual(expect.arrayContaining([
      "channel 'mainframe' is not one the plugin knows", 'title is required', "environment 'moon' is not one the plugin knows",
      "data impact 'bad' is not one the plugin knows", "role 'tester' is not one the plugin knows", 'a screenshot is required',
      'the privacy confirmation is required', 'environment facts is required', "spec '7' is not a spec id (expected four digits)",
    ]))
    expect(buildIssueArgv({ ...REQ, screenshots: [] }, '@arjun-m')).toEqual({ ok: false, errors: ['a screenshot is required'] })
    expect(buildIssueArgv(REQ, '')).toEqual({ ok: false, errors: ['no actor'] })
  })

  it('an answer key that is not a field name, or a multi-line answer where one line is expected, is refused', () => {
    expect(validateIssueRequest({ ...REQ, answers: { 'Bad Key': 'x' } })).toContain("answer key 'Bad Key' is not a field name")
    expect(validateIssueRequest({ ...REQ, answers: { last_action: 'a\nb' } })).toContain("answer 'last_action' is one line")
    expect(validateIssueRequest({ ...REQ, channel: 'api', answers: { response_excerpt: '{\n  "error": 1\n}' } })).toEqual([])
  })

  it('the sketch shows what IS known of the line and <flag?> for the gaps — never a guess', () => {
    const sketch = sketchIssueArgv({ ...REQ, title: '', screenshots: [], noClientData: false, environmentPath: '' }, '')
    expect(sketch).toContain('<title?>')
    expect(sketch).toContain('<screenshot?>')
    expect(sketch).toContain('<--no-client-data?>')
    expect(sketch).toContain('<environment?>')
    expect(sketch.slice(-3)).toEqual(['--by', '<you>', '--json'])
  })
})

describe('buildIssueVerbArgv — the lifecycle verbs', () => {
  const golden: Array<[IssueVerbRequest, string[]]> = [
    [{ verb: 'triage', issue: 'ISS-0001', verdict: 'confirmed', severity: 'blocks', dataImpact: 'exposed', reason: 'reproduced on test' },
      ['triage', '--issue', 'ISS-0001', '--verdict', 'confirmed', '--severity', 'blocks', '--data-impact', 'exposed', '--reason', 'reproduced on test', '--by', 'Sam K', '--json']],
    [{ verb: 'triage', issue: 'ISS-0001', verdict: 'needs-info', question: 'Which claim type?' },
      ['triage', '--issue', 'ISS-0001', '--verdict', 'needs-info', '--question', 'Which claim type?', '--by', 'Sam K', '--json']],
    [{ verb: 'triage', issue: 'ISS-0002', verdict: 'duplicate', of: 'ISS-0001' },
      ['triage', '--issue', 'ISS-0002', '--verdict', 'duplicate', '--of', 'ISS-0001', '--by', 'Sam K', '--json']],
    [{ verb: 'triage', issue: 'ISS-0001', verdict: 'confirmed', override: true, reason: 'team of one this sprint' },
      ['triage', '--issue', 'ISS-0001', '--verdict', 'confirmed', '--reason', 'team of one this sprint', '--override', '--by', 'Sam K', '--json']],
    [{ verb: 'prioritize', issue: 'ISS-0001', priority: 'P1', targetSprint: 'S08', reason: 'the demo is Friday' },
      ['prioritize', '--issue', 'ISS-0001', '--priority', 'P1', '--target-sprint', 'S08', '--reason', 'the demo is Friday', '--by', 'Sam K', '--json']],
    [{ verb: 'promote', issue: 'ISS-0001', risk: 'HIGH', owner: '@priya-n', team: 'claims', slate: true },
      ['promote', '--issue', 'ISS-0001', '--risk', 'HIGH', '--owner', '@priya-n', '--team', 'claims', '--slate', '--by', 'Sam K', '--json']],
    [{ verb: 'note', issue: 'ISS-0001', note: 'Motor, a comprehensive policy' }, ['note', '--issue', 'ISS-0001', '--note', 'Motor, a comprehensive policy', '--by', 'Sam K', '--json']],
    [{ verb: 'reopen', issue: 'ISS-0001', reason: 'the screen is back in S10' }, ['reopen', '--issue', 'ISS-0001', '--reason', 'the screen is back in S10', '--by', 'Sam K', '--json']],
    [{ verb: 'set-status', issue: 'ISS-0001', status: 'wont-fix', reason: 'that screen is retired in S09' },
      ['set-status', '--issue', 'ISS-0001', '--status', 'wont-fix', '--reason', 'that screen is retired in S09', '--by', 'Sam K', '--json']],
    [{ verb: 'set-status', issue: 'ISS-0001', status: 'duplicate', of: 'ISS-0002' }, ['set-status', '--issue', 'ISS-0001', '--status', 'duplicate', '--of', 'ISS-0002', '--by', 'Sam K', '--json']],
    [{ verb: 'file', issue: 'ISS-0001', dryRun: true, label: 'bug' }, ['file', '--issue', 'ISS-0001', '--label', 'bug', '--dry-run', '--by', 'Sam K', '--json']],
    [{ verb: 'file', issue: 'ISS-0001', dryRun: false, host: 'azure-devops' }, ['file', '--issue', 'ISS-0001', '--host', 'azure-devops', '--by', 'Sam K', '--json']],
  ]
  it.each(golden)('%j', (req, argv) => {
    expect(buildIssueVerbArgv(req, 'Sam K')).toEqual({ ok: true, argv })
  })

  it('sync carries no issue and no actor', () => {
    expect(buildIssueVerbArgv({ verb: 'sync' }, '')).toEqual({ ok: true, argv: ['sync', '--json'] })
  })

  it('refuses the plugin’s own shape rules before any spawn', () => {
    expect(validateIssueVerbRequest({ verb: 'triage', issue: '1', verdict: 'needs-info' })).toEqual(expect.arrayContaining([
      "issue '1' is not an issue id (expected ISS-NNNN)", 'question is required',
    ]))
    expect(validateIssueVerbRequest({ verb: 'triage', issue: 'ISS-0001', verdict: 'duplicate' })).toContain('duplicate needs the report it duplicates (ISS-NNNN)')
    expect(validateIssueVerbRequest({ verb: 'triage', issue: 'ISS-0001', verdict: 'wont-fix' })).toContain('reason is required')
    expect(validateIssueVerbRequest({ verb: 'triage', issue: 'ISS-0001', verdict: 'confirmed', override: true })).toContain('reason for the override is required')
    expect(validateIssueVerbRequest({ verb: 'prioritize', issue: 'ISS-0001', priority: 'P9' as 'P1' })).toContain("priority 'P9' is not one the plugin knows")
    expect(validateIssueVerbRequest({ verb: 'prioritize', issue: 'ISS-0001', priority: 'P1', targetSprint: 'sprint7' })).toContain("target sprint 'sprint7' is not a sprint id (S07, S12, …)")
    expect(validateIssueVerbRequest({ verb: 'promote', issue: 'ISS-0001', risk: 'SEVERE' as 'HIGH' })).toContain("risk 'SEVERE' is not one the plugin knows")
    expect(validateIssueVerbRequest({ verb: 'set-status', issue: 'ISS-0001', status: 'open' as 'fixed' })).toContain("status 'open' is not one the plugin knows")
    expect(buildIssueVerbArgv({ verb: 'note', issue: 'ISS-0001', note: 'x' }, '')).toEqual({ ok: false, errors: ['no actor'] })
    expect(buildIssueVerbArgv({ verb: 'bogus' } as unknown as IssueVerbRequest, 'Sam K')).toEqual({ ok: false, errors: ['not a verb this table knows'] })
  })

  it('every verb names the capability that gates it', () => {
    expect(ISSUE_VERB_CAPABILITY).toEqual({
      triage: 'issue-triage', prioritize: 'issue-prioritize', promote: 'issue-promote', note: 'issue-triage', reopen: 'issue-triage',
      'set-status': 'issue-triage', file: 'issue-file', sync: 'issue-sync',
    })
  })
})
