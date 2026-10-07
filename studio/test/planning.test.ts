/** The planning screen's pure model and the Commit sequence (togo-command-center.md §3.2, §7 P6).
 * Orderings and lookups over plugin fields only; the Commit runs the verbs in order, shows every
 * exit code and stops at the first non-zero. */
import { describe, expect, it, vi } from 'vitest'
import type { BoardRow, ReadinessAll, SprintListView, SprintSlateRow, SprintVerbResult } from '../shared/types'
import { SKIPPED_TIER_CONFIRMATION } from '../shared/reasons'
import {
  candidateRows, dorState, highLines, mixMeter, orderBacklog, overTarget, previousSprintId, readinessById,
  setChanged, slateInOrder, SLATEABLE_STATUSES, withRole,
} from '../src/components/planning/planningModel'
import { commitSprint, commitSucceeded, type CommitApi, type CommitInput } from '../src/components/planning/commitSprint'

const row = (over: Partial<BoardRow>): BoardRow => ({
  spec: '0001', name: 'a', path: 'specs/0001-a.md', title: 'A', status: 'draft', risk: 'LOW', team: '', channel: '', owner: '',
  developer: '', checker: '', branch: '', sprint: '', nextOwner: '', engReview: '', dataReview: '', dependsOn: [], pullRequest: null, ...over,
})
const slateRow = (over: Partial<SprintSlateRow>): SprintSlateRow => ({
  id: '0001', name: 'a', risk: 'LOW', type: '', channel: '', status: 'ready', sprint: 'S08', nextOwner: '', engReview: '', dataReview: '',
  dependsOn: [], dor: 'READY', dorBlocking: [], path: '/p/specs/0001-a.md', relPath: 'specs/0001-a.md', ...over,
})

describe('planningModel: the backlog, the slate and the meter are lookups over plugin fields', () => {
  it('candidates are the plugin\'s SLATEABLE_STATUSES with no sprint — drafts included', () => {
    expect(SLATEABLE_STATUSES).toEqual(['ready', 'draft'])
    const rows = [row({ spec: '0001', status: 'draft' }), row({ spec: '0002', status: 'ready' }), row({ spec: '0003', status: 'ready', sprint: 'S08' }), row({ spec: '0004', status: 'merged' }), row({ spec: '0005', status: 'deferred' })]
    expect(candidateRows({ rows }).map((r) => r.spec)).toEqual(['0001', '0002'])
    expect(candidateRows(null)).toEqual([])
  })

  it('orders READY first, then status (ready before draft), then id; a spec the checker did not row is last and "unknown"', () => {
    const all: ReadinessAll = {
      ok: true,
      specs: [
        { ok: true, spec: '0003', risk: 'LOW', status: 'draft', ready: true, blocking: [], advisory: [], passed: [] },
        { ok: true, spec: '0001', risk: 'LOW', status: 'ready', ready: false, blocking: [{ check: 'scope-out', passed: false, severity: 'MUST', message: '## Scope Out: missing' }], advisory: [], passed: [] },
        { ok: true, spec: '0002', risk: 'LOW', status: 'ready', ready: true, blocking: [], advisory: [], passed: [] },
      ],
    }
    const by = readinessById(all)
    const ordered = orderBacklog([row({ spec: '0001', status: 'ready' }), row({ spec: '0004', status: 'draft' }), row({ spec: '0003', status: 'draft' }), row({ spec: '0002', status: 'ready' })], by)
    expect(ordered.map((r) => r.spec)).toEqual(['0002', '0003', '0001', '0004'])
    expect(dorState(by.get('0001'))).toBe('NOT READY')
    expect(dorState(by.get('0004'))).toBe('unknown')
  })

  it('the slate follows build_order verbatim; rows the order does not name follow as "order not given"', () => {
    const view = { slate: [slateRow({ id: '0001' }), slateRow({ id: '0002' }), slateRow({ id: '0003' })], buildOrder: ['0002', '0001', '0099'] }
    const { ordered, unlisted } = slateInOrder(view)
    expect(ordered.map((l) => [l.row.id, l.order])).toEqual([['0002', 1], ['0001', 2]])
    expect(unlisted.map((l) => [l.row.id, l.order])).toEqual([['0003', null]])
  })

  it('the mix meter is three bars in tier order: actual over target, last sprint as a number beside it, no bar without a target', () => {
    const bars = mixMeter(
      { LOW: { target: 1, actual: 0 }, HIGH: { target: 2, actual: 1 }, MEDIUM: { target: null, actual: 3 } },
      { HIGH: { target: 1, actual: 1 } },
    )
    expect(bars.map((b) => b.tier)).toEqual(['HIGH', 'MEDIUM', 'LOW'])
    expect(bars[0]).toMatchObject({ actual: 1, target: 2, last: 1, fill: 0.5 })
    expect(bars[1]).toMatchObject({ target: null, fill: null, last: null })
    expect(bars[2].fill).toBe(0)
    expect(mixMeter({ HIGH: { target: 1, actual: 2 } }, null)[0]).toMatchObject({ last: null, fill: 1 })
  })

  it('the HIGH line is the ladder\'s own security and sign-off rungs, verbatim', () => {
    const rungs = ['CI (lint, unit, contract) — blocks', 'grader — runs, advises', 'correctness — blocks on a defect', 'security pass — blocks', 'non-author approval — required (deep review)', 'named human sign-off in the PR']
    expect(highLines({ tier: 'HIGH', touchesGatedPath: null, rungs })).toEqual(['security pass — blocks', 'named human sign-off in the PR'])
    expect(highLines(undefined)).toEqual([])
  })

  it('the previous sprint is the one with ordinal − 1 of the active sprint — a lookup, never arithmetic on ids', () => {
    const list: SprintListView = {
      sprints: [{ id: 'S06', state: 'closed', goal: '', start: '', end: '', ordinal: 1 }, { id: 'S07', state: 'closed', goal: '', start: '', end: '', ordinal: 2 }, { id: 'S08', state: 'planning', goal: '', start: '', end: '', ordinal: 3 }],
      active: 'S08', count: 3,
    }
    expect(previousSprintId(list)).toBe('S07')
    expect(previousSprintId({ ...list, active: 'S06' })).toBeNull()
    expect(previousSprintId({ ...list, active: null })).toBeNull()
    expect(previousSprintId(null)).toBeNull()
  })

  it('set changes, roles and the over-target rule mirror the plugin\'s inputs', () => {
    expect(setChanged(['0001', '0002'], ['0002', '0001'])).toBe(false)
    expect(setChanged(['0001'], ['0001', '0002'])).toBe(true)
    expect(withRole([{ handle: '@a', roles: ['developer'] }, { handle: '@b', roles: ['checker'] }, { handle: '@c' }], 'checker').map((p) => p.handle)).toEqual(['@b'])
    expect(overTarget(null, 9)).toBe(false)
    expect(overTarget(4, 5)).toBe(true)
    expect(overTarget(4, 4)).toBe(false)
  })
})

const verb = (exitCode: number, stdout = '', stderr = ''): SprintVerbResult => ({ ok: exitCode === 0, exitCode, refused: exitCode === 2, stdout, stderr, argv: [], verb: 'slate' })

function api(over: Partial<Record<keyof CommitApi, ReturnType<typeof vi.fn>>> = {}) {
  return {
    runSprintVerb: vi.fn().mockResolvedValue(verb(0, 'ok')),
    renderSprintReport: vi.fn().mockResolvedValue({ ok: true, relOutput: '.sdlc/reports/sprint-S08-planning.html' }),
    openReport: vi.fn().mockResolvedValue({ ok: true }),
    openDecision: vi.fn().mockResolvedValue({ ok: true, id: 'DL-04', opened: '2026-10-06', due: '2026-10-08', owner: '@arjun' }),
    ...over,
  } as unknown as CommitApi & Record<keyof CommitApi, ReturnType<typeof vi.fn>>
}

const INPUT: CommitInput = {
  projectPath: '/p', sprintId: 'S08', slated: ['0001'], specs: ['0001', '0002'], unconfirmed: [{ spec: '0002', risk: 'HIGH' }], owner: '@arjun', confirmTierAvailable: true,
}

describe('commitSprint: the verbs in order, every exit shown, stopped at the first non-zero', () => {
  it('runs slate → ready → plan → open report → one decision per unconfirmed tier, each step with its exit', async () => {
    const a = api()
    const steps = await commitSprint(a, INPUT)
    expect(steps.map((s) => [s.label, s.exitCode])).toEqual([['slate', 0], ['ready', 0], ['plan', 0], ['open report', 0], ['decision for 0002', 0]])
    expect(a.runSprintVerb.mock.calls[0][1]).toEqual({ verb: 'slate', sprint: 'S08', specs: ['0001', '0002'] })
    expect(a.runSprintVerb.mock.calls[1][1]).toEqual({ verb: 'ready', sprint: 'S08' })
    expect(a.openDecision).toHaveBeenCalledWith('/p', 'Confirm risk tier for 0002 (proposed HIGH)', '@arjun')
    expect(steps[4].text).toContain('DL-04')
    expect(commitSucceeded(steps)).toBe(true)
  })

  it('skips slate when the set is unchanged, and stops at ready\'s exit 1 with the gaps verbatim — plan never runs', async () => {
    const a = api({ runSprintVerb: vi.fn().mockResolvedValue(verb(1, '', 'S08 is not ready:\n  0002: DoR NOT READY')) })
    const steps = await commitSprint(a, { ...INPUT, specs: ['0001'] })
    expect(steps.map((s) => [s.label, s.exitCode, s.heading])).toEqual([['ready', 1, 'Not done']])
    expect(steps[0].text).toContain('0002: DoR NOT READY')
    expect(a.renderSprintReport).not.toHaveBeenCalled()
    expect(commitSucceeded(steps)).toBe(false)
  })

  it('an exit 2 on slate reads "Refused by the plugin" and nothing follows', async () => {
    const a = api({ runSprintVerb: vi.fn().mockResolvedValue(verb(2, '', 'Refused: --by names an AI')) })
    const steps = await commitSprint(a, INPUT)
    expect(steps).toHaveLength(1)
    expect(steps[0].heading).toBe('Refused by the plugin')
    expect(a.runSprintVerb).toHaveBeenCalledTimes(1)
  })

  it('without confirm-tier the decision step is recorded as skipped with the reason, and no decision is opened', async () => {
    const a = api()
    const steps = await commitSprint(a, { ...INPUT, confirmTierAvailable: false })
    const last = steps[steps.length - 1]
    expect(last).toMatchObject({ label: 'tier confirmation', skipped: true, text: SKIPPED_TIER_CONFIRMATION, exitCode: null })
    expect(a.openDecision).not.toHaveBeenCalled()
    expect(commitSucceeded(steps)).toBe(true)
  })

  it('an override carries --override and the reason into the slate request', async () => {
    const a = api()
    await commitSprint(a, { ...INPUT, override: { reason: 'the HIGH item is the sprint' } })
    expect(a.runSprintVerb.mock.calls[0][1]).toMatchObject({ verb: 'slate', override: true, reason: 'the HIGH item is the sprint' })
  })
})
