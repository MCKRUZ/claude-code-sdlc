/** The readers reject anything that is not the document their script prints (null), and never
 * fill a gap with a zero (togo-command-center.md §7 P3 acceptance). Fixtures are the plugin's own
 * key names from the inventory (§1) and §2.5. */
import { describe, expect, it } from 'vitest'
import {
  parseDocument, readChannelCheck, readDecisions, readFindings, readHandOffCheck, readLadder, readReadiness, readReadinessAll,
  readRoster, readScorecard, readSlateProposal, readSprintList, readSprintLog,
} from '../../electron/main/commandCenterReaders'

/** Every shape that is NOT a given script's document. */
const NOT_IT: unknown[] = [null, undefined, 'prose', 42, [1, 2], { ok: true }, { has_data: false, note: 'x' }]

const LIST = { sprints: [{ id: 'S07', state: 'closed', goal: 'a', start: '2026-09-01', end: '2026-09-12', ordinal: 1 }, { id: 'S08', state: 'planning', goal: 'b', start: '2026-09-15', end: '2026-09-26', ordinal: 2 }], active: 'S08', count: 2 }
const LOG = { events: [{ timestamp: '2026-10-05T09:00:00+00:00', event: 'slated', spec: '0007', sprint: 'S08', by: '@priya-n', extra_key: 1 }], count: 1, since: '2026-10-05', path: '.sdlc/metrics/sprint-log.jsonl', exists: true, skipped: 0 }
const FINDINGS3 = { tracked: 2, open_debt: 1, fixed_claim_mismatches: 0 }
const FINDINGS = { ...FINDINGS3, findings: [{ fingerprint: 'security:x.md', id: 'F1', category: 'security', severity: 'HIGH', target: 'x.md', disposition: 'OPEN', detail: 'd', off_books: false, first_seen: '2026-10-01', last_seen: '2026-10-05', rounds: 2 }], recurrence: { 'security:x.md': 2 } }
const DECISIONS = { total: 3, open: 2, overdue: 1, clock_business_days: 2, open_decisions: [{ id: 'DL-01', decision: 'Pick auth', owner: '@priya-n', opened: '2026-10-05', due: '2026-10-07', status: 'open', business_days_open: 1, clock_due: '2026-10-07', overdue: false }], overdue_decisions: [], log_path: '/p/.sdlc/decision-log.md', exists: true }
const SCORECARD = { accepted_as_is_rate: null, review_wait_median_hours: 4, security_review_wait_median_hours: null, rework_revert_rate: null, bounce_back_rate: null, escaped_bugs: [], dora: { deploy_count: 0 }, totals: { merges: 0 } }
const PROPOSAL = { sprint: 'S08', target: 3, mix: 'HIGH:1', already_slated: ['0007'], candidates: 2, proposal: [{ id: '0008', name: 'x', risk: 'LOW', status: 'draft', sprint: '', dor: 'NOT READY', dor_blocking: ['a'], depends_on: [] }], mix_after: { HIGH: { target: 1, actual: 1 } }, mix_warnings: [], dependency_warnings: [] }
const READINESS = { ok: true, spec: '0007', risk: 'HIGH', status: 'ready', ready: false, blocking: [{ check: 'scope-out', passed: false, severity: 'MUST', message: 'm' }], advisory: [], passed: [], ladder: { tier: 'HIGH', touches_gated_path: false, rungs: ['CI — blocks', 'security pass — blocks'] } }
const CHANNEL = { spec: '0007', channel: 'voice', bound: true, source: 'spec', dimensions: [{ id: 'barge-in', covered: false }], uncovered: ['barge-in'], advisory: true, notes: [] }

describe('every reader answers null for a document that is not its script\'s', () => {
  const readers = { readSprintList, readSprintLog, readFindings, readDecisions, readScorecard, readRoster, readSlateProposal, readLadder, readReadiness, readReadinessAll, readChannelCheck, readHandOffCheck }
  for (const [name, read] of Object.entries(readers)) {
    it(name, () => { for (const bad of NOT_IT) expect(read(bad), `${name}(${JSON.stringify(bad)})`).toBeNull() })
  }
  it('parseDocument: one object or null', () => {
    expect(parseDocument('{"a":1}')).toEqual({ a: 1 })
    expect(parseDocument('[1]')).toBeNull()
    expect(parseDocument('')).toBeNull()
    expect(parseDocument('Sprint S07 — planning')).toBeNull()
  })
})

describe('sprint list and log', () => {
  it('camel-cases the list and keeps a malformed sprint\'s null state', () => {
    const v = readSprintList({ ...LIST, sprints: [...LIST.sprints, { id: 'S09', state: null, goal: '', start: '', end: '', ordinal: 3 }] })!
    expect(v.active).toBe('S08'); expect(v.count).toBe(2); expect(v.sprints[2]).toMatchObject({ id: 'S09', state: null, ordinal: 3 })
  })
  it('a sprint without an ordinal makes the list unreadable rather than inventing one', () => {
    expect(readSprintList({ ...LIST, sprints: [{ id: 'S07' }] })).toBeNull()
  })
  it('log lines ride verbatim — unknown keys included — and skipped is counted', () => {
    const v = readSprintLog({ ...LOG, skipped: 1 })!
    expect(v.events[0]).toEqual(LOG.events[0]); expect(v.skipped).toBe(1); expect(v.since).toBe('2026-10-05')
  })
  it('a log whose count is missing is null (never 0)', () => { expect(readSprintLog({ ...LOG, count: undefined })).toBeNull() })
})

describe('findings', () => {
  it('reads the three legacy counts alone (an older plugin) with empty rows, not a fabricated list', () => {
    expect(readFindings(FINDINGS3)).toEqual({ tracked: 2, openDebt: 1, fixedClaimMismatches: 0, findings: [], recurrence: {} })
  })
  it('reads rows and recurrence when the plugin prints them', () => {
    const v = readFindings(FINDINGS)!
    expect(v.findings[0]).toMatchObject({ fingerprint: 'security:x.md', offBooks: false, firstSeen: '2026-10-01', rounds: 2 })
    expect(v.recurrence).toEqual({ 'security:x.md': 2 })
  })
  it('a row without a fingerprint or a non-integer recurrence is null', () => {
    expect(readFindings({ ...FINDINGS, findings: [{ id: 'F1' }] })).toBeNull()
    expect(readFindings({ ...FINDINGS, recurrence: { a: 'two' } })).toBeNull()
  })
  it('attribution is read only with both counts', () => {
    expect(readFindings({ ...FINDINGS3, attribution: { method: 'scope-paths', attributed: 1, unattributed: 3 } })!.attribution).toEqual({ method: 'scope-paths', attributed: 1, unattributed: 3 })
    expect(readFindings({ ...FINDINGS3, attribution: { attributed: 1 } })!.attribution).toBeUndefined()
  })
})

describe('decisions, scorecard, roster', () => {
  it('reads the report with the plugin\'s clock fields; overdue only when the plugin says so', () => {
    const v = readDecisions(DECISIONS)!
    expect(v.openDecisions[0]).toMatchObject({ id: 'DL-01', businessDaysOpen: 1, clockDue: '2026-10-07', overdue: false }); expect(v.exists).toBe(true)
  })
  it('a report without `exists` is not the report', () => { expect(readDecisions({ ...DECISIONS, exists: undefined })).toBeNull() })
  it('the scorecard passes through as computed, nulls intact', () => {
    expect(readScorecard(SCORECARD)!.accepted_as_is_rate).toBeNull(); expect(readScorecard({ ...SCORECARD, dora: undefined })).toBeNull()
  })
  it('the roster is the settings\' roster section', () => {
    const roster = { file: '.sdlc/team.yaml', present: false, errors: [], teams: [], people: [] }
    expect(readRoster({ ok: true, roster })).toEqual(roster); expect(readRoster({ ok: true })).toBeNull()
  })
})

describe('slate proposal, readiness, ladder, channel, hand-off check', () => {
  it('reads the proposal with candidates as the COUNT the plugin reports', () => {
    const v = readSlateProposal(PROPOSAL)!
    expect(v.candidates).toBe(2); expect(v.proposal[0]).toMatchObject({ id: '0008', dor: 'NOT READY' }); expect(v.mixAfter).toEqual({ HIGH: { target: 1, actual: 1 } }); expect(v.hasData).toBe(true)
  })
  it('the no-sprint proposal document keeps hasData false and the note', () => {
    const v = readSlateProposal({ sprint: null, target: null, mix: '', already_slated: [], candidates: 0, proposal: [], mix_after: {}, mix_warnings: [], dependency_warnings: [], has_data: false, note: 'no sprint' })!
    expect(v.hasData).toBe(false); expect(v.note).toBe('no sprint'); expect(v.target).toBeNull()
  })
  it('readiness keeps the protected checker\'s findings verbatim and reads the ladder when present', () => {
    const v = readReadiness(READINESS)!
    expect(v.blocking).toEqual(READINESS.blocking); expect(v.ladder).toEqual({ tier: 'HIGH', touchesGatedPath: false, rungs: READINESS.ladder.rungs })
    const { ladder: _l, ...noLadder } = READINESS
    expect(readReadiness(noLadder)!.ladder).toBeUndefined()
  })
  it('a ladder with a non-string rung is null; an absent gated-path flag reads null (not declared)', () => {
    expect(readLadder({ tier: 'LOW', rungs: ['a', 1] })).toBeNull(); expect(readLadder({ tier: 'LOW', rungs: [] })!.touchesGatedPath).toBeNull()
  })
  it('--all reads every row or none', () => {
    expect(readReadinessAll({ ok: true, specs: [READINESS] })!.specs).toHaveLength(1); expect(readReadinessAll({ ok: true, specs: [{ nope: 1 }] })).toBeNull()
  })
  it('channel: bound flag and dimensions verbatim', () => {
    expect(readChannelCheck(CHANNEL)).toMatchObject({ bound: true, channel: 'voice', uncovered: ['barge-in'] })
    expect(readChannelCheck({ ...CHANNEL, channel: null, bound: false, dimensions: [] })).toMatchObject({ bound: false, channel: null })
  })
  it('hand-off check: a refusal keeps its kind and message; an unknown kind reads other; ok carries would{}', () => {
    expect(readHandOffCheck({ ok: false, refusal: { kind: 'not_ready', message: 'Spec is NOT READY' }, host: 'github' })).toEqual({ ok: false, refusal: { kind: 'not_ready', message: 'Spec is NOT READY' }, host: 'github' })
    expect(readHandOffCheck({ ok: false, refusal: { kind: 'new_rule', message: 'Nope.' } })).toMatchObject({ ok: false, refusal: { kind: 'other' } })
    expect(readHandOffCheck({ ok: true, would: { branch: 'spec/0007-x', developer: '@sam-k', checker: null, team: 'core', in_flight_after: 2 }, already_in_flight: false, host: 'none' }))
      .toEqual({ ok: true, alreadyInFlight: false, host: 'none', would: { branch: 'spec/0007-x', developer: '@sam-k', checker: null, team: 'core', inFlightAfter: 2 } })
    expect(readHandOffCheck({ ok: true })).toBeNull()
    // The real plugin's `host` is the provider block; its name is what the card shows.
    expect(readHandOffCheck({ ok: false, refusal: { kind: 'other', message: 'no origin' }, host: { name: 'none', source: 'default', cli: 'gh', cli_state: 'unknown', detail: 'no origin remote' } })).toMatchObject({ host: 'none' })
  })
})
