/** The fan-out against canned plugin output (togo-command-center.md §2.3, §7 P3 acceptance): each
 * block names its source; one block failing leaves the others ok; `track_specs` exit 1 is a WIP
 * finding (ok + warnings); the host block keeps a 60 s TTL; local blocks go on invalidation; a
 * missing capability disables a block with `newerPlugin(cap)` and never spawns the verb. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../electron/main/project', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../electron/main/project')>()),
  runPluginScript: vi.fn(),
}))

import { HOST_TTL_MS, cachedBoardSpecIds, getCommandCenter, invalidateCommandCenter, SOURCES } from '../../electron/main/commandCenter'
import { runPluginScript } from '../../electron/main/project'
import { newerPlugin } from '../../shared/reasons'
import type { ConsoleEntry } from '../../shared/types'

const run = vi.mocked(runPluginScript)
const SCRIPTS = '/plugin/scripts'
const entry = (stdout: string, exitCode = 0, stderr = ''): ConsoleEntry => ({ id: 'x', command: 'py', args: [], cwd: '', startedAt: '', durationMs: 0, exitCode, stdout, stderr, ok: exitCode === 0 })
const json = (v: unknown, exitCode = 0) => entry(JSON.stringify(v), exitCode)

const STATUS = { sprint: null, slate: [], readiness: { ready: 0, total: 0, gaps: [] }, verdicts_pending: [], handoffs_open: [{ spec: '0007', to: '@priya-n', since_business_days: 1 }], mix: {}, mix_warnings: [], wip: { in_flight: 0, cap: null }, build_order: [], next_up: null, dependency_gaps: [], decisions: null, carried_in: [], has_data: false, note: 'no sprint' }
const ALL = { code_host_available: false, error: null, specs: [{ spec: '0007', name: 'x', path: 'specs/0007-x.md', status: 'ready', risk: 'HIGH', owner: '@priya-n', risk_confirmed_by: '' }, { spec: '0008', name: 'y', path: 'specs/0008-y.md', status: 'draft', risk: 'LOW' }], host: 'none' }
const TRACK = { total: 2, by_status: {}, in_flight: [], wip_by_team: { core: { in_flight: 3, wip_limit: 2 } }, sprint_filter: null, warnings: ['Team core is over its WIP limit: 3 in-flight, limit 2'] }
const DECISIONS = { total: 0, open: 0, overdue: 0, clock_business_days: 2, open_decisions: [], overdue_decisions: [], log_path: 'p', exists: false }
const FINDINGS = { tracked: 0, open_debt: 0, fixed_claim_mismatches: 0 }
const SCORECARD = { accepted_as_is_rate: null, review_wait_median_hours: null, security_review_wait_median_hours: null, rework_revert_rate: null, bounce_back_rate: null, escaped_bugs: [], dora: {}, totals: {} }
const SETTINGS = { ok: true, roster: { file: '.sdlc/team.yaml', present: true, errors: [], teams: [], people: [{ handle: '@priya-n' }] } }
const LIST = { sprints: [], active: null, count: 0 }
const LOG = { events: [{ timestamp: '2026-10-05T09:00:00+00:00', event: 'slated', spec: '0007' }], count: 1, since: '2026-10-05', path: 'p', exists: true, skipped: 0 }

let project = ''
let caps: string[] = ['sprint-status', 'sprint-list', 'sprint-log']

/** Answers each script the way the plugin would; `broken` names scripts that fail. */
function plugin(broken: Partial<Record<string, ConsoleEntry>> = {}) {
  run.mockImplementation(async (_dir, script, args) => {
    if (broken[script]) return broken[script]!
    switch (script) {
      case 'generate_status.py': return json({ project_name: 'p', current_phase: { id: 'build' }, stages: [], capabilities: caps })
      case 'sprint.py': return args[0] === 'status' ? json(STATUS) : args[0] === 'list' ? json(LIST) : args[0] === 'log' ? json(LOG) : entry('', 1, 'unexpected verb')
      case 'spec_status.py': return json(ALL)
      case 'track_specs.py': return json(TRACK, 1)
      case 'track_decisions.py': return json(DECISIONS)
      case 'record_findings.py': return json(FINDINGS)
      case 'scorecard.py': return json(SCORECARD)
      case 'project_settings.py': return json(SETTINGS)
    }
    return entry('', 2, `no such script ${script}`)
  })
}
const calls = (script: string) => run.mock.calls.filter((c) => c[1] === script).map((c) => c[2])
const noActor = { actor: null }

beforeEach(() => {
  run.mockReset()
  project = mkdtempSync(join(tmpdir(), 'cc-'))
  mkdirSync(join(project, '.sdlc'))
  writeFileSync(join(project, '.sdlc', 'state.yaml'), 'current_phase: build\n')
  invalidateCommandCenter(project, 'all')
  caps = ['sprint-status', 'sprint-list', 'sprint-log']
})
afterEach(() => { vi.useRealTimers(); rmSync(project, { recursive: true, force: true }) })

describe('getCommandCenter', () => {
  it('fans out once per read verb, every block ok and named by its literal source', async () => {
    plugin()
    const cc = await getCommandCenter(project, SCRIPTS, 1, { ...noActor, now: new Date(2026, 9, 6) })
    for (const key of ['sprint', 'sprints', 'board', 'decisions', 'findings', 'scorecard', 'roster', 'log'] as const) expect(cc[key].ok, key).toBe(true)
    expect(cc.sprint.source).toBe(SOURCES.sprint); expect(cc.board.source).toBe(SOURCES.board); expect(cc.log.source).toBe('sprint.py log --since 2026-10-05 --json')
    expect(calls('sprint.py').map((a) => a[0]).sort()).toEqual(['list', 'log', 'status'])
    expect(calls('sprint.py').find((a) => a[0] === 'log')).toEqual(['log', '--state', join(project, '.sdlc', 'state.yaml'), '--since', '2026-10-05', '--json'])
    expect(calls('track_decisions.py')).toEqual([['--state', join(project, '.sdlc', 'state.yaml'), '--json']])
    expect(calls('record_findings.py')).toEqual([['report', '--state', join(project, '.sdlc', 'state.yaml'), '--json']])
    expect(calls('scorecard.py')).toEqual([['report', '--state', join(project, '.sdlc', 'state.yaml'), '--json']])
    expect(cc.capabilities).toEqual(caps); expect(cc.since).toBe(1)
  })

  it('track_specs exit 1 is a WIP finding: board ok:true with the plugin\'s warnings and limits', async () => {
    plugin()
    const cc = await getCommandCenter(project, SCRIPTS, 1, noActor)
    expect(cc.board.ok).toBe(true); expect(cc.board.data!.warnings).toEqual(TRACK.warnings); expect(cc.board.data!.teamLimits).toEqual(TRACK.wip_by_team)
    expect(cc.board.data!.rows.map((r) => r.spec)).toEqual(['0007', '0008'])
  })

  it('one block failing leaves the others ok, with the plugin\'s stderr verbatim on the failed one', async () => {
    plugin({ 'track_decisions.py': entry('', 1, 'Traceback: boom') })
    const cc = await getCommandCenter(project, SCRIPTS, 1, noActor)
    expect(cc.decisions).toMatchObject({ ok: false, data: null, error: 'Traceback: boom' })
    expect(cc.sprint.ok && cc.board.ok && cc.findings.ok && cc.scorecard.ok && cc.roster.ok).toBe(true)
  })

  it('a document that is not the script\'s is "no data", never a zeroed shape', async () => {
    plugin({ 'scorecard.py': json({ ok: true }) })
    const cc = await getCommandCenter(project, SCRIPTS, 1, noActor)
    expect(cc.scorecard.ok).toBe(false); expect(cc.scorecard.data).toBeNull()
  })

  it('a missing capability disables its block with newerPlugin(cap) and never spawns the verb', async () => {
    caps = ['sprint-status']
    plugin()
    const cc = await getCommandCenter(project, SCRIPTS, 1, noActor)
    expect(cc.sprints).toMatchObject({ ok: false, data: null, error: newerPlugin('sprint-list') })
    expect(cc.log).toMatchObject({ ok: false, data: null, error: newerPlugin('sprint-log') })
    expect(calls('sprint.py').map((a) => a[0])).toEqual(['status'])
    expect(cc.sinceYesterday).toEqual([])
  })

  it('needsYou is assembled from the blocks for the actor given; its chip is the list length', async () => {
    plugin()
    const cc = await getCommandCenter(project, SCRIPTS, 1, { actor: { name: '@priya-n', source: 'roster' } })
    expect(cc.actor).toEqual({ name: '@priya-n', source: 'roster' })
    expect(cc.needsYou.map((i) => `${i.kind}:${i.spec}`)).toEqual(['ack:0007']); expect(cc.needsYouReason).toBeNull()
    caps.push('confirm-tier'); invalidateCommandCenter(project, 'all')
    const withCap = await getCommandCenter(project, SCRIPTS, 1, { actor: { name: 'priya-n', source: 'host' } })
    expect(withCap.needsYou.map((i) => `${i.kind}:${i.spec}`)).toEqual(['ack:0007', 'confirm-tier:0007'])
  })

  it('a second read is served from the cache; a local invalidation re-reads local blocks but keeps the host block', async () => {
    plugin()
    await getCommandCenter(project, SCRIPTS, 1, noActor)
    const first = run.mock.calls.length
    await getCommandCenter(project, SCRIPTS, 1, noActor)
    expect(run.mock.calls.length).toBe(first)
    invalidateCommandCenter(project)
    await getCommandCenter(project, SCRIPTS, 1, noActor)
    expect(calls('spec_status.py')).toHaveLength(1); expect(calls('track_decisions.py')).toHaveLength(2); expect(calls('generate_status.py')).toHaveLength(2)
    expect(cachedBoardSpecIds(project)).toEqual(['0007', '0008'])
  })

  it('the host block expires after 60 s and carries its own fetchedAt', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-06T10:42:00Z') })
    plugin()
    const a = await getCommandCenter(project, SCRIPTS, 1, noActor)
    vi.setSystemTime(new Date('2026-10-06T10:42:30Z')); invalidateCommandCenter(project)
    const b = await getCommandCenter(project, SCRIPTS, 1, noActor)
    expect(calls('spec_status.py')).toHaveLength(1); expect(b.board.fetchedAt).toBe(a.board.fetchedAt)
    vi.setSystemTime(new Date(Date.parse('2026-10-06T10:42:00Z') + HOST_TTL_MS + 1)); invalidateCommandCenter(project)
    const c = await getCommandCenter(project, SCRIPTS, 1, noActor)
    expect(calls('spec_status.py')).toHaveLength(2); expect(c.board.fetchedAt).not.toBe(a.board.fetchedAt)
  })

  it('"Refresh this screen" (refresh:true) drops the host block too', async () => {
    plugin()
    await getCommandCenter(project, SCRIPTS, 1, noActor)
    await getCommandCenter(project, SCRIPTS, 1, { ...noActor, refresh: true })
    expect(calls('spec_status.py')).toHaveLength(2)
  })

  it('a project with no state file has no capabilities Studio can read: gated blocks disabled, nothing fabricated', async () => {
    rmSync(join(project, '.sdlc', 'state.yaml'))
    plugin()
    const cc = await getCommandCenter(project, SCRIPTS, 3, noActor)
    expect(cc.capabilities).toEqual([]); expect(calls('generate_status.py')).toEqual([])
    expect(cc.sprints.error).toBe(newerPlugin('sprint-list'))
    expect(calls('sprint.py')[0]).toEqual(['status', '--repo', project, '--json'])
  })

  it('the document carries no per-person key', async () => {
    plugin()
    const cc = await getCommandCenter(project, SCRIPTS, 1, noActor) as unknown as Record<string, unknown>
    expect(Object.keys(cc).some((k) => /perPerson|byPerson|per_person/i.test(k))).toBe(false)
  })
})
