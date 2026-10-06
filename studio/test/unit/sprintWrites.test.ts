/** The closed argv table's spawn side (togo-command-center.md §2.4): exactly one spawn with the
 * golden argv and `--by <actor>`; exit 0 Done / 1 Not done / 2 Refused, stdout and stderr
 * verbatim; no actor or a bad request refuses BEFORE any spawn; `--field` can never appear; every
 * spawn invalidates the command center's local blocks. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../electron/main/project', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../electron/main/project')>()),
  runPluginScript: vi.fn(),
}))
vi.mock('../../electron/main/commandCenter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../electron/main/commandCenter')>()),
  invalidateCommandCenter: vi.fn(),
  cachedBoardSpecIds: vi.fn(() => undefined),
}))

import { runSprintVerb, sprintVerbArgv } from '../../electron/main/sprintWrites'
import { runPluginScript } from '../../electron/main/project'
import { cachedBoardSpecIds, invalidateCommandCenter } from '../../electron/main/commandCenter'
import { NO_ACTOR, newerPlugin } from '../../shared/reasons'
import type { ConsoleEntry, SprintVerbRequest } from '../../shared/types'

const run = vi.mocked(runPluginScript)
const PROJECT = '/work/proj'   // no .sdlc/state.yaml here on any machine → --repo
const SCRIPTS = '/plugin/scripts'
const ACTOR = { name: '@priya-n', source: 'roster' as const }
const entry = (exitCode: number, stdout = '', stderr = ''): ConsoleEntry => ({ id: 'x', command: 'py', args: [], cwd: '', startedAt: '', durationMs: 0, exitCode, stdout, stderr, ok: exitCode === 0 })

beforeEach(() => { run.mockReset(); vi.mocked(invalidateCommandCenter).mockClear(); vi.mocked(cachedBoardSpecIds).mockReturnValue(undefined) })
afterEach(() => vi.useRealTimers())

describe('sprintVerbArgv', () => {
  it('is the table\'s argv with the project source spliced after the verb', () => {
    const r = sprintVerbArgv(PROJECT, { verb: 'verdict', spec: '0002', lane: 'eng', verdict: 'accepted' }, '@priya-n')
    expect(r).toEqual({ ok: true, argv: ['verdict', '--repo', PROJECT, '--spec', '0002', '--lane', 'eng', '--verdict', 'accepted', '--by', '@priya-n'] })
  })
  it('never contains --field, whatever the request carries', () => {
    const req = { verb: 'slate', sprint: 'S08', specs: ['0001'], field: 'points=3', extras: ['--field', 'points=3'] } as unknown as SprintVerbRequest
    const r = sprintVerbArgv(PROJECT, req, 'x')
    expect(r.ok && r.argv.join(' ')).not.toContain('--field')
  })
})

describe('runSprintVerb', () => {
  it('exit 0 is Done: ok, not refused, stdout verbatim, the argv that ran', async () => {
    run.mockResolvedValue(entry(0, 'Slated 0001, 0002 into S08 (by @priya-n)\n'))
    const r = await runSprintVerb(PROJECT, SCRIPTS, { verb: 'slate', sprint: 'S08', specs: ['0001', '0002'] }, ACTOR)
    expect(r).toEqual({ ok: true, exitCode: 0, refused: false, stdout: 'Slated 0001, 0002 into S08 (by @priya-n)\n', stderr: '', verb: 'slate', argv: ['slate', '--repo', PROJECT, '--sprint', 'S08', '--spec', '0001', '--spec', '0002', '--by', '@priya-n'] })
    expect(run).toHaveBeenCalledTimes(1); expect(run).toHaveBeenCalledWith(SCRIPTS, 'sprint.py', r.argv)
    expect(invalidateCommandCenter).toHaveBeenCalledWith(PROJECT)
  })
  it('exit 1 is Not done, stderr verbatim, not refused', async () => {
    run.mockResolvedValue(entry(1, '', 'Error: S08 is closed\n'))
    const r = await runSprintVerb(PROJECT, SCRIPTS, { verb: 'ready', sprint: 'S08' }, ACTOR)
    expect(r).toMatchObject({ ok: false, exitCode: 1, refused: false, stderr: 'Error: S08 is closed\n' })
  })
  it('exit 2 is Refused by the plugin', async () => {
    run.mockResolvedValue(entry(2, '', "Refused: --by 'Claude' reads as an AI/automation"))
    const r = await runSprintVerb(PROJECT, SCRIPTS, { verb: 'ack', spec: '0001' }, { name: 'Claude', source: 'typed' })
    expect(r).toMatchObject({ ok: false, exitCode: 2, refused: true, stderr: expect.stringContaining('Refused') })
    expect(invalidateCommandCenter).toHaveBeenCalled()
  })
  it('no actor refuses before spawning with NO_ACTOR and exitCode null (Studio did not ask)', async () => {
    const r = await runSprintVerb(PROJECT, SCRIPTS, { verb: 'ack', spec: '0001' }, null)
    expect(r).toEqual({ ok: false, exitCode: null, refused: false, stdout: '', stderr: NO_ACTOR, argv: [], verb: 'ack' })
    expect(run).not.toHaveBeenCalled(); expect(invalidateCommandCenter).not.toHaveBeenCalled()
  })
  it('a bad id never reaches a spawn; the mirrored rule is the stderr', async () => {
    const r = await runSprintVerb(PROJECT, SCRIPTS, { verb: 'verdict', spec: '12', lane: 'eng', verdict: 'accepted' }, ACTOR)
    expect(r.exitCode).toBeNull(); expect(r.stderr).toMatch(/not a spec id/); expect(run).not.toHaveBeenCalled()
    const na = await runSprintVerb(PROJECT, SCRIPTS, { verb: 'verdict', spec: '0001', lane: 'data', verdict: 'n-a' }, ACTOR)
    expect(na.stderr).toBe('n-a needs a reason'); expect(run).not.toHaveBeenCalled()
  })
  it('a spec the cached board does not list is refused before spawning; with no board cached the plugin decides', async () => {
    vi.mocked(cachedBoardSpecIds).mockReturnValue(['0001'])
    const r = await runSprintVerb(PROJECT, SCRIPTS, { verb: 'ack', spec: '0009' }, ACTOR)
    expect(r.stderr).toBe("spec '0009' is not on the board"); expect(run).not.toHaveBeenCalled()
    vi.mocked(cachedBoardSpecIds).mockReturnValue(undefined); run.mockResolvedValue(entry(1, '', 'Error: unknown spec 0009'))
    expect((await runSprintVerb(PROJECT, SCRIPTS, { verb: 'ack', spec: '0009' }, ACTOR)).exitCode).toBe(1)
  })
  it('a verb the plugin lacks is refused with newerPlugin(cap) when capabilities are known', async () => {
    const r = await runSprintVerb(PROJECT, SCRIPTS, { verb: 'carry', spec: '0001', to: 'S09', reason: 'slipped' }, ACTOR, ['sprint-status', 'sprint-write'])
    expect(r.stderr).toBe(newerPlugin('sprint-carry')); expect(run).not.toHaveBeenCalled()
    run.mockResolvedValue(entry(0, 'Carried'))
    expect((await runSprintVerb(PROJECT, SCRIPTS, { verb: 'carry', spec: '0001', to: 'S09', reason: 'slipped' }, ACTOR, ['sprint-carry'])).ok).toBe(true)
  })
  it('something that is not a sprint verb is refused, never spawned', async () => {
    const r = await runSprintVerb(PROJECT, SCRIPTS, { verb: 'status' } as unknown as SprintVerbRequest, ACTOR)
    expect(r.ok).toBe(false); expect(run).not.toHaveBeenCalled()
  })
  it('close carries one --carry/--drop per open spec and --carry-to', async () => {
    run.mockResolvedValue(entry(0))
    const r = await runSprintVerb(PROJECT, SCRIPTS, { verb: 'close', sprint: 'S08', carryTo: 'S09', carry: { '0001': 'blocked on DL-03' }, drop: { '0002': 'descoped' } }, ACTOR)
    expect(r.argv).toEqual(['close', '--repo', PROJECT, '--sprint', 'S08', '--carry-to', 'S09', '--carry', '0001=blocked on DL-03', '--drop', '0002=descoped', '--by', '@priya-n'])
  })
})
