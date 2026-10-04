/** Spec 0029: a batch belongs to the project it was started in, as a spec 0027 draft does. Another
 * project's screen shows no running batch and no candidates, and Keep, Discard and Cancel from another
 * project are refused and write nothing there. Also: one batch runs at a time in the whole process. */

import { rmSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cancelBatch, discardBatch, getBatchState, keepBatch, resetBatchStateForTests, startBatch } from '../electron/main/draftBatch'
import { activeBatch } from '../electron/main/draftBatchState'
import { batchDeps, makeIntakeProject, scriptedClaude, until } from './batchHarness'
import { differences, snapshot } from './draftHarness'
import { requirePlugin } from './pluginRoot'

const PLUGIN = requirePlugin(__dirname)
const OTHER = 'That batch belongs to another project'

describe.skipIf(!PLUGIN.available)('a batch belongs to the project it was started in', () => {
  let a = ''
  let b = ''
  beforeEach(() => {
    resetBatchStateForTests()
    a = makeIntakeProject(PLUGIN)
    b = makeIntakeProject(PLUGIN)
  })
  afterEach(() => {
    resetBatchStateForTests()
    rmSync(a, { recursive: true, force: true })
    rmSync(b, { recursive: true, force: true })
  })

  const settled = (project: string) => until(
    () => getBatchState(project).job !== null && getBatchState(project).job!.phase !== 'running' && !activeBatch(), 'the batch to end')

  it("shows a finished batch's candidates to its own project and to no other", async () => {
    startBatch(a, PLUGIN.scriptsDir, 'summarise', batchDeps(scriptedClaude()))
    await settled(a)

    expect(getBatchState(a).candidates).toHaveLength(3)
    expect(getBatchState(a).job).not.toBeNull()
    expect(getBatchState(b)).toEqual({ job: null, candidates: [] })
  })

  it('shows a running batch to its own project and to no other', async () => {
    const claude = scriptedClaude({ default: { behaviour: 'hang' } })
    startBatch(a, PLUGIN.scriptsDir, 'summarise', batchDeps(claude))
    await until(() => claude.started().length === 1, 'the first run')

    expect(getBatchState(a).job?.phase).toBe('running')
    expect(getBatchState(b)).toEqual({ job: null, candidates: [] })
    cancelBatch()
    await settled(a)
  })

  it('treats two spellings of one folder as the same project', async () => {
    startBatch(a, PLUGIN.scriptsDir, 'summarise', batchDeps(scriptedClaude()))
    await settled(a)
    expect(getBatchState(`${a}/.`).candidates).toHaveLength(3)
  })

  it("refuses Keep and Discard of another project's batch, writing nothing in either project", async () => {
    startBatch(a, PLUGIN.scriptsDir, 'summarise', batchDeps(scriptedClaude()))
    await settled(a)
    const job = getBatchState(a).job!.id
    const [beforeA, beforeB] = [snapshot(a), snapshot(b)]

    const kept = await keepBatch(b, PLUGIN.scriptsDir, job, 'Matt K')
    const discarded = await discardBatch(b, PLUGIN.scriptsDir, job, 'Matt K')

    expect(kept).toEqual({ ok: false, error: OTHER, kept: [], failed: [], warnings: [] })
    expect(discarded).toEqual({ ok: false, error: OTHER, warnings: [] })
    expect(differences(beforeA, snapshot(a))).toEqual([])
    expect(differences(beforeB, snapshot(b))).toEqual([])
    expect(getBatchState(a).candidates).toHaveLength(3) // A's results are still there for A
  })

  it('refuses a cancel that names another project, and leaves the batch running', async () => {
    const claude = scriptedClaude({ default: { behaviour: 'hang' } })
    startBatch(a, PLUGIN.scriptsDir, 'summarise', batchDeps(claude))
    await until(() => claude.started().length === 1, 'the first run')

    expect(cancelBatch(b)).toEqual({ ok: false, error: OTHER })
    expect(getBatchState(a).job?.phase).toBe('running')
    expect(cancelBatch(a)).toEqual({ ok: true })
    await settled(a)
    expect(getBatchState(a).job?.phase).toBe('cancelled')
  })

  it('runs one batch at a time across projects, and says what is running', async () => {
    const claude = scriptedClaude({ default: { behaviour: 'hang' } })
    startBatch(a, PLUGIN.scriptsDir, 'summarise', batchDeps(claude))
    await until(() => claude.started().length === 1, 'the first run')

    const other = scriptedClaude()
    const refused = startBatch(b, PLUGIN.scriptsDir, 'summarise', batchDeps(other))
    expect(refused).toMatchObject({ ok: false, running: { kind: 'summarise' } })
    expect(other.log()).toEqual([])
    expect(getBatchState(b)).toEqual({ job: null, candidates: [] })
    cancelBatch()
    await settled(a)
  })

  it("lets another project start its own batch while this one's results wait, and loses none of them", async () => {
    startBatch(a, PLUGIN.scriptsDir, 'summarise', batchDeps(scriptedClaude()))
    await settled(a)
    const waiting = getBatchState(a).candidates

    expect(startBatch(b, PLUGIN.scriptsDir, 'summarise', batchDeps(scriptedClaude())).ok).toBe(true)
    await settled(b)

    expect(getBatchState(a).candidates).toEqual(waiting)
    expect(getBatchState(b).candidates).toHaveLength(3)
    const kept = await keepBatch(b, PLUGIN.scriptsDir, getBatchState(b).job!.id, 'Matt K')
    expect(kept.ok).toBe(true)
    expect(getBatchState(a).candidates).toEqual(waiting) // B's Keep did not touch A's
  })

  it('pushes every update under the project it belongs to', async () => {
    const deps = batchDeps(scriptedClaude())
    startBatch(a, PLUGIN.scriptsDir, 'summarise', deps)
    await settled(a)
    const owners = new Set(deps.sent.map((s) => (s.payload as { projectPath: string }).projectPath))
    expect([...owners]).toEqual([a])
  })

  it('shows nothing for a path that is not a string', () => {
    expect(getBatchState(undefined as unknown as string)).toEqual({ job: null, candidates: [] })
  })
})
