/** A draft belongs to the project it was made from (spec 0027, found by the correctness review of
 * PR #91). The job and the waiting candidate used to be process-wide, with no project on them, so after
 * a project switch the other project's screen adopted the candidate and Keep wrote project A's summary
 * (and ledger lines) into project B. The state now answers per project, and Keep and Discard refuse a
 * draft that is not from the project they are given. */

import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cancelDraft, discardDraft, getDraftState, keepDraft, resetDraftStateForTests, startDraft } from '../electron/main/draftDocuments'
import { deps, fakeClaude, makeProject, NARRATIVE_REL, SOURCE_REL } from './draftHarness'
import { requirePlugin } from './pluginRoot'

const PLUGIN = requirePlugin(__dirname)

describe.skipIf(!PLUGIN.available)('a draft belongs to the project it was made from', () => {
  let a = ''
  let b = ''
  beforeEach(() => {
    resetDraftStateForTests()
    a = makeProject(PLUGIN)
    b = makeProject(PLUGIN)
  })
  afterEach(() => {
    cancelDraft()
    rmSync(a, { recursive: true, force: true })
    rmSync(b, { recursive: true, force: true })
  })

  const request = { kind: 'enhance' as const, stageId: '1', document: SOURCE_REL }

  it('shows the waiting candidate to its own project and to no other', async () => {
    const started = await startDraft(a, PLUGIN.scriptsDir, request, deps(fakeClaude('success')))
    expect(started.ok).toBe(true)

    expect(getDraftState(a).candidate?.target).toBe(NARRATIVE_REL)
    expect(getDraftState(b)).toEqual({ running: null, candidate: null })
  })

  it('shows a running job to its own project and to no other', async () => {
    const fake = fakeClaude('hang')
    const run = startDraft(a, PLUGIN.scriptsDir, request, deps(fake))
    await new Promise((r) => setTimeout(r, 400))

    expect(getDraftState(a).running?.target).toBe(NARRATIVE_REL)
    expect(getDraftState(b).running).toBeNull()

    cancelDraft()
    await run
  })

  it('refuses Keep from another project, writes nothing there, and leaves the draft waiting for its own', async () => {
    const started = await startDraft(a, PLUGIN.scriptsDir, request, deps(fakeClaude('success')))
    if (!started.ok) throw new Error('setup failed')

    const kept = await keepDraft(b, PLUGIN.scriptsDir, started.candidate.jobId, 'Matt K')
    expect(kept).toMatchObject({ ok: false, error: expect.stringMatching(/another project/i) })
    expect(existsSync(join(b, NARRATIVE_REL))).toBe(false)
    expect(existsSync(join(b, '.sdlc', 'metrics', 'draft-log.jsonl'))).toBe(false)

    expect(getDraftState(a).candidate?.jobId).toBe(started.candidate.jobId)
  })

  it('refuses Discard from another project and records nothing there', async () => {
    const started = await startDraft(a, PLUGIN.scriptsDir, request, deps(fakeClaude('success')))
    if (!started.ok) throw new Error('setup failed')

    const discarded = await discardDraft(b, PLUGIN.scriptsDir, started.candidate.jobId, 'Matt K')
    expect(discarded).toMatchObject({ ok: false, error: expect.stringMatching(/another project/i) })
    expect(existsSync(join(b, '.sdlc', 'metrics', 'draft-log.jsonl'))).toBe(false)
    expect(getDraftState(a).candidate).not.toBeNull()
  })

  it('still keeps it in its own project, and the same path spelled differently counts as the same project', async () => {
    const started = await startDraft(a, PLUGIN.scriptsDir, request, deps(fakeClaude('success')))
    if (!started.ok) throw new Error('setup failed')

    const kept = await keepDraft(`${a}${process.platform === 'win32' ? '\\' : '/'}.`, PLUGIN.scriptsDir, started.candidate.jobId, 'Matt K')
    expect(kept.ok).toBe(true)
    expect(readFileSync(join(a, NARRATIVE_REL), 'utf-8').length).toBeGreaterThan(0)
  })
})
