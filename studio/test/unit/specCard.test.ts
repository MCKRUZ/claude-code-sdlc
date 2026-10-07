/** The spec card's read and writes against canned output (togo-command-center.md §2.2, §3.3):
 * sourced blocks, the ladder from the plugin or the honest reason, channel null when unbound,
 * hand-off check only with a developer and the capability, confirm-tier / assign gated and
 * carrying `--by`. */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../electron/main/project', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../electron/main/project')>()),
  runPluginScript: vi.fn(),
}))

import { assignRoles, confirmTier, getReadinessAll, getSpecCard } from '../../electron/main/specCard'
import { invalidateCommandCenter } from '../../electron/main/commandCenter'
import { runPluginScript } from '../../electron/main/project'
import { NO_ACTOR, newerPlugin } from '../../shared/reasons'
import type { ConsoleEntry } from '../../shared/types'

const run = vi.mocked(runPluginScript)
const SCRIPTS = '/plugin/scripts'
const ACTOR = { name: '@priya-n', source: 'roster' as const }
const entry = (exitCode: number, stdout = '', stderr = ''): ConsoleEntry => ({ id: 'x', command: 'py', args: [], cwd: '', startedAt: '', durationMs: 0, exitCode, stdout, stderr, ok: exitCode === 0 })
const json = (v: unknown, exitCode = 0) => entry(exitCode, JSON.stringify(v))

const READINESS = { ok: true, spec: '0007', risk: 'HIGH', status: 'ready', ready: true, blocking: [], advisory: [], passed: [] }
const LADDER = { tier: 'HIGH', touches_gated_path: null, rungs: ['CI — blocks', 'grader — runs, advises', 'security pass — blocks'] }
const STATUS = { spec: '0007', branch: 'spec/0007-x', code_host_available: false, local_status: 'ready', error: 'no host', pull_request: null, host: 'none' }
const FINDINGS = { tracked: 1, open_debt: 1, fixed_claim_mismatches: 0 }
const CHANNEL_UNBOUND = { spec: '0007', channel: null, bound: false, source: 'spec', dimensions: [], uncovered: [], advisory: true, notes: ['No channel bound'] }
const CHANNEL_VOICE = { ...CHANNEL_UNBOUND, channel: 'voice', bound: true, dimensions: [{ id: 'barge-in', covered: false }], uncovered: ['barge-in'], notes: [] }

let project = ''
let caps: string[] = []
let full = ''

function plugin(over: Partial<Record<string, ConsoleEntry>> = {}) {
  run.mockImplementation(async (_d, script, args) => {
    if (over[script]) return over[script]!
    switch (script) {
      case 'generate_status.py': return json({ capabilities: caps })
      case 'spec_readiness.py': return json(args.includes('--all') ? { ok: true, specs: [READINESS] } : { ...READINESS, ...(caps.includes('readiness-all') ? { ladder: LADDER } : {}) })
      case 'spec_status.py': return json(STATUS)
      case 'record_findings.py': return json(FINDINGS)
      case 'check_channel.py': return json(CHANNEL_UNBOUND)
      case 'handoff.py': return json({ ok: false, refusal: { kind: 'not_ready', message: 'Spec 0007 is NOT READY' }, host: 'none' }, 1)
      case 'spec_transition.py': return json({ ok: true, changed: true, risk: 'HIGH', confirmed_by: '@priya-n', developer: '@sam-k', checker: '@matt', message: 'done' })
    }
    return entry(2, '', `no script ${script}`)
  })
}
const calls = (script: string) => run.mock.calls.filter((c) => c[1] === script).map((c) => c[2])

beforeEach(() => {
  run.mockReset(); caps = []
  project = mkdtempSync(join(tmpdir(), 'card-'))
  mkdirSync(join(project, '.sdlc')); mkdirSync(join(project, 'specs'))
  writeFileSync(join(project, '.sdlc', 'state.yaml'), 'x: 1\n'); writeFileSync(join(project, 'specs', '0007-x.md'), '---\nspec: "0007"\n---\n')
  // resolveProjectDocument answers the real path (macOS: /private/var for a /var temp folder).
  full = realpathSync.native(join(project, 'specs', '0007-x.md'))
  invalidateCommandCenter(project, 'all')
})
afterEach(() => rmSync(project, { recursive: true, force: true }))

describe('getSpecCard', () => {
  it('reads the four blocks with fixed argv; no developer → handoffCheck null; unbound → channel null', async () => {
    plugin()
    const card = await getSpecCard(project, SCRIPTS, 'specs/0007-x.md')
    expect(card.spec).toBe('0007'); expect(card.readiness.ok && card.status.ok && card.findings.ok).toBe(true)
    expect(card.channel).toBeNull(); expect(card.handoffCheck).toBeNull()
    expect(calls('spec_readiness.py')).toEqual([['--spec', full, '--state', `${project}/.sdlc/state.yaml`, '--json']])
    expect(calls('check_channel.py')).toEqual([['--spec', full, '--json']])   // never --state: that would log
    expect(calls('record_findings.py')).toEqual([['report', '--repo', project, '--json']])
    expect(calls('handoff.py')).toEqual([])
  })
  it('without readiness-all the ladder block is disabled with the reason, the readiness block still ok', async () => {
    plugin()
    const card = await getSpecCard(project, SCRIPTS, 'specs/0007-x.md')
    expect(card.ladder).toMatchObject({ ok: false, data: null, error: newerPlugin('readiness-all') }); expect(card.readiness.data!.ladder).toBeUndefined()
  })
  it('with readiness-all the ladder is the plugin\'s rungs verbatim; with findings-json the ledger is scoped by --spec', async () => {
    caps = ['readiness-all', 'findings-json']; plugin()
    const card = await getSpecCard(project, SCRIPTS, 'specs/0007-x.md')
    expect(card.ladder.data).toEqual({ tier: 'HIGH', touchesGatedPath: null, rungs: LADDER.rungs })
    expect(calls('record_findings.py')).toEqual([['report', '--repo', project, '--json', '--spec', full]]); expect(card.findings.source).toBe('record_findings.py report --json --spec')
  })
  it('a bound channel is a block with the plugin\'s dimensions', async () => {
    plugin({ 'check_channel.py': json(CHANNEL_VOICE) })
    const card = await getSpecCard(project, SCRIPTS, 'specs/0007-x.md')
    expect(card.channel!.data).toMatchObject({ bound: true, channel: 'voice', uncovered: ['barge-in'] })
  })
  it('a developer named + handoff-check runs the dry run and carries the refusal verbatim; without the capability the block says so and nothing spawns', async () => {
    caps = ['handoff-check']; plugin()
    const card = await getSpecCard(project, SCRIPTS, 'specs/0007-x.md', '@sam-k')
    expect(card.handoffCheck!.data).toEqual({ ok: false, refusal: { kind: 'not_ready', message: 'Spec 0007 is NOT READY' }, host: 'none' })
    expect(calls('handoff.py')).toEqual([['--repo', project, '--spec', full, '--developer', '@sam-k', '--check', '--json']])
    caps = []; invalidateCommandCenter(project, 'all'); run.mockClear(); plugin()
    const older = await getSpecCard(project, SCRIPTS, 'specs/0007-x.md', '@sam-k')
    expect(older.handoffCheck).toMatchObject({ ok: false, data: null, error: newerPlugin('handoff-check') }); expect(calls('handoff.py')).toEqual([])
  })
  it('one block failing leaves the others ok', async () => {
    plugin({ 'spec_status.py': entry(1, '', 'boom') })
    const card = await getSpecCard(project, SCRIPTS, 'specs/0007-x.md')
    expect(card.status).toMatchObject({ ok: false, data: null, error: 'boom' }); expect(card.readiness.ok).toBe(true)
  })
  it('a path outside the project is refused in every block without a spawn', async () => {
    plugin()
    const card = await getSpecCard(project, SCRIPTS, '../etc/passwd')
    expect(card.readiness.ok).toBe(false); expect(run.mock.calls.filter((c) => c[1] !== 'generate_status.py')).toEqual([])
  })
})

describe('getReadinessAll', () => {
  it('is one spawn with --all when the plugin has it, and {ok:false, specs:[]} when it does not', async () => {
    plugin()
    expect(await getReadinessAll(project, SCRIPTS)).toEqual({ ok: false, specs: [] }); expect(calls('spec_readiness.py')).toEqual([])
    caps = ['readiness-all']; invalidateCommandCenter(project, 'all')
    expect((await getReadinessAll(project, SCRIPTS)).specs).toHaveLength(1)
    expect(calls('spec_readiness.py')).toEqual([['--all', '--state', `${project}/.sdlc/state.yaml`, '--json']])
  })
})

describe('confirmTier and assignRoles', () => {
  it('confirm-tier runs with --by the actor and reads the plugin\'s keys', async () => {
    plugin()
    const r = await confirmTier(project, SCRIPTS, 'specs/0007-x.md', ACTOR, ['confirm-tier'])
    expect(r).toEqual({ ok: true, changed: true, message: 'done', risk: 'HIGH', confirmedBy: '@priya-n' })
    expect(calls('spec_transition.py')).toEqual([['--spec', full, '--state', `${project}/.sdlc/state.yaml`, '--json', 'confirm-tier', '--by', '@priya-n']])
  })
  it('no actor or no capability refuses before any spawn', async () => {
    plugin()
    expect(await confirmTier(project, SCRIPTS, 'specs/0007-x.md', null, ['confirm-tier'])).toEqual({ ok: false, refusal: { kind: 'no_actor', message: NO_ACTOR } })
    expect((await confirmTier(project, SCRIPTS, 'specs/0007-x.md', ACTOR, [])).refusal!.message).toBe(newerPlugin('confirm-tier'))
    expect(calls('spec_transition.py')).toEqual([])
  })
  it('assign carries only the roles given and refuses an empty or non-handle request', async () => {
    plugin()
    const r = await assignRoles(project, SCRIPTS, 'specs/0007-x.md', { checker: '@matt' }, ACTOR, ['assign-roles'])
    expect(r).toMatchObject({ ok: true, developer: '@sam-k', checker: '@matt' })
    expect(calls('spec_transition.py')).toEqual([['--spec', full, '--state', `${project}/.sdlc/state.yaml`, '--json', 'assign', '--checker', '@matt', '--by', '@priya-n']])
    expect((await assignRoles(project, SCRIPTS, 'specs/0007-x.md', {}, ACTOR, ['assign-roles'])).refusal!.kind).toBe('nothing_to_assign')
    expect((await assignRoles(project, SCRIPTS, 'specs/0007-x.md', { developer: 'sam k' }, ACTOR, ['assign-roles'])).refusal!.kind).toBe('not_a_handle')
  })
  it('the plugin\'s refusal keeps its kind and message', async () => {
    plugin({ 'spec_transition.py': json({ ok: false, refusal: { kind: 'not_a_person', message: 'Refused: Claude reads as an AI' } }, 1) })
    expect(await confirmTier(project, SCRIPTS, 'specs/0007-x.md', ACTOR, ['confirm-tier'])).toEqual({ ok: false, refusal: { kind: 'not_a_person', message: 'Refused: Claude reads as an AI' } })
  })
})
