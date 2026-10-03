/** Spec 0029's Keep and Discard against the REAL plugin scripts: Keep all, Keep selected, Discard all, the
 * analysis pair, a target Keep must refuse, and what the change history and the draft ledger end up holding. */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { discardBatch, getBatchState, keepBatch, resetBatchStateForTests, startBatch } from '../electron/main/draftBatch'
import { activeBatch } from '../electron/main/draftBatchState'
import type { BatchState } from '../shared/types'
import {
  batchDeps, makeIntakeProject, scriptedClaude, UNFILLED_SUMMARY, until, writeSummary, type ScriptEntry,
} from './batchHarness'
import { differences, snapshot } from './draftHarness'
import { requirePlugin } from './pluginRoot'

const PLUGIN = requirePlugin(__dirname)
const CONTRADICTIONS = '.sdlc/artifacts/00-discovery/contradiction-list.md'
const QUESTIONS = '.sdlc/artifacts/00-discovery/question-list.md'
const A = '.sdlc/context/intake/DOC-001-a.md'
const B = '.sdlc/context/intake/DOC-002-b.md'
const C3 = '.sdlc/context/intake/DOC-003-c.md'

const jsonl = (project: string, name: string): Array<Record<string, unknown>> => {
  const path = join(project, '.sdlc', 'metrics', name)
  return existsSync(path) ? readFileSync(path, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []
}
const hashOf = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex').slice(0, 16)}`
function versions(project: string, rel: string): Array<{ hash: string; present: boolean; event: string; actor: string }> {
  const out = execFileSync(PLUGIN.python, [
    join(PLUGIN.scriptsDir, 'audit_artifacts.py'), 'version', 'list', rel, '--json', '--state', join(project, '.sdlc', 'state.yaml'),
  ], { encoding: 'utf-8' })
  return JSON.parse(out).versions
}

describe.skipIf(!PLUGIN.available)('Keep and Discard for a batch, against the real plugin scripts', () => {
  let project = ''
  beforeEach(() => {
    resetBatchStateForTests()
    project = makeIntakeProject(PLUGIN, { files: { 'a.md': '# a\n', 'b.md': '# b\n', 'c.md': '# c\n' } })
  })
  afterEach(() => {
    resetBatchStateForTests()
    rmSync(project, { recursive: true, force: true })
  })

  const state = (): BatchState => getBatchState(project)
  const settled = () => until(() => state().job !== null && state().job!.phase !== 'running' && !activeBatch(), 'the batch to end')
  const keep = (ids?: string[], actor = 'Matt K') => keepBatch(project, PLUGIN.scriptsDir, state().job!.id, actor, ids)
  const discard = (ids?: string[], actor = 'Matt K') => discardBatch(project, PLUGIN.scriptsDir, state().job!.id, actor, ids)

  async function summarised(script: Record<string, ScriptEntry> = {}) {
    const deps = batchDeps(scriptedClaude(script))
    startBatch(project, PLUGIN.scriptsDir, 'summarise', deps)
    await settled()
    return deps
  }
  async function analysed() {
    writeSummary(project, 'DOC-001', 'a')
    writeSummary(project, 'DOC-002', 'b')
    const deps = batchDeps(scriptedClaude())
    startBatch(project, PLUGIN.scriptsDir, 'analyse', deps)
    await settled()
  }
  function breakLedgers() {
    rmSync(join(project, '.sdlc', 'metrics'), { recursive: true, force: true })
    writeFileSync(join(project, '.sdlc', 'metrics'), 'not a folder')
  }

  describe('Keep all', () => {
    it('writes every summary through the audited write, records each created with the person, and each accepted', async () => {
      await summarised()
      const texts = Object.fromEntries(state().candidates.map((c) => [c.target, c.text]))
      expect(Object.keys(texts)).toEqual([A, B, C3])

      const result = await keep()

      expect(result).toEqual({ ok: true, kept: ['DOC-001', 'DOC-002', 'DOC-003'], failed: [], warnings: [] })
      for (const [target, text] of Object.entries(texts)) expect(readFileSync(join(project, target), 'utf-8')).toBe(`${text.trimEnd()}\n`)

      const log = jsonl(project, 'artifact-log.jsonl')
      for (const target of [A, B, C3]) {
        expect(log.filter((e) => e.artifact === target).at(-1)).toMatchObject({ event: 'created', actor: 'Matt K', reason: 'Drafted by Claude' })
      }
      expect(jsonl(project, 'draft-log.jsonl')).toEqual([A, B, C3].map((artifact) =>
        expect.objectContaining({ artifact, outcome: 'accepted', actor: 'Matt K', chars_kept: expect.any(Number) })))
    })

    it('leaves the batch over: no job, no candidates, and the window is told', async () => {
      const deps = await summarised()
      await keep()
      expect(state()).toEqual({ job: null, candidates: [] })
      const last = deps.sent.at(-1)!.payload as { projectPath: string; state: BatchState }
      expect(last).toEqual({ projectPath: project, state: { job: null, candidates: [] } })
    })

    it('writes the summary where the registry will find it: a filled DOC-NNN file', async () => {
      await summarised()
      await keep()
      const registry = execFileSync(PLUGIN.python, [
        join(PLUGIN.scriptsDir, 'intake_documents.py'), '--state', join(project, '.sdlc', 'state.yaml'), '--registry', '--json',
      ], { encoding: 'utf-8' })
      expect(JSON.parse(registry)).toMatchObject({ documents: 3, summarised: 3, missing_summaries: [] })
    })

    it('does not write a failed result, and leaves it listed', async () => {
      await summarised({ 'DOC-002': { behaviour: 'exit1' } })
      const result = await keep()
      expect(result).toMatchObject({ ok: true, kept: ['DOC-001', 'DOC-003'], failed: [] })
      expect(existsSync(join(project, B))).toBe(false)
      expect(state().candidates.map((c) => [c.id, c.status])).toEqual([['DOC-002', 'failed']])
      expect(jsonl(project, 'draft-log.jsonl')).toHaveLength(2)
    })

    it('refuses when there is nothing ready to keep', async () => {
      await summarised({ default: { behaviour: 'exit1' } })
      const before = snapshot(project)
      expect(await keep()).toEqual({ ok: false, error: 'There is nothing to keep.', kept: [], failed: [], warnings: [] })
      expect(differences(before, snapshot(project))).toEqual([])
    })
  })

  describe('Keep selected', () => {
    it('writes only the named ones, records only those, and leaves the rest waiting', async () => {
      await summarised()
      const result = await keep(['DOC-001', 'DOC-003'])

      expect(result).toMatchObject({ ok: true, kept: ['DOC-001', 'DOC-003'], failed: [] })
      expect(existsSync(join(project, A)) && existsSync(join(project, C3))).toBe(true)
      expect(existsSync(join(project, B))).toBe(false)
      expect(state().candidates.map((c) => c.id)).toEqual(['DOC-002'])
      expect(state().job).not.toBeNull()
      // The others are NOT recorded as discarded until the person presses "Discard the rest".
      expect(jsonl(project, 'draft-log.jsonl').map((e) => [e.artifact, e.outcome])).toEqual([[A, 'accepted'], [C3, 'accepted']])
    })

    it('then "Discard the rest" records the remaining one as discarded and ends the batch', async () => {
      await summarised()
      await keep(['DOC-001', 'DOC-003'])
      const result = await discard()

      expect(result).toEqual({ ok: true, warnings: [] })
      expect(existsSync(join(project, B))).toBe(false)
      expect(jsonl(project, 'draft-log.jsonl').map((e) => [e.artifact, e.outcome])).toEqual([[A, 'accepted'], [C3, 'accepted'], [B, 'discarded']])
      expect(state()).toEqual({ job: null, candidates: [] })
    })

    it.each([
      ['an id that is not a candidate', ['DOC-099']],
      ['an empty selection', []],
      ['something that is not a list of ids', 'DOC-001' as unknown as string[]],
      ['a list holding a non-string', [1] as unknown as string[]],
    ])('refuses %s and writes nothing', async (_name, ids) => {
      await summarised()
      const before = snapshot(project)
      const result = await keep(ids)
      expect(result.ok).toBe(false)
      expect(result.kept).toEqual([])
      expect(differences(before, snapshot(project))).toEqual([])
      expect(state().candidates).toHaveLength(3)
    })

    it('refuses to keep a failed result by name', async () => {
      await summarised({ 'DOC-002': { behaviour: 'exit1' } })
      const before = snapshot(project)
      expect((await keep(['DOC-002'])).ok).toBe(false)
      expect(differences(before, snapshot(project))).toEqual([])
    })
  })

  describe('Discard all', () => {
    it('writes no document and records every candidate as discarded in the draft ledger', async () => {
      await summarised()
      const before = snapshot(project)

      expect(await discard()).toEqual({ ok: true, warnings: [] })

      // The one file a discard may touch is the draft ledger, as in spec 0027.
      expect(differences(before, snapshot(project))).toEqual(['.sdlc/metrics/draft-log.jsonl'])
      expect(jsonl(project, 'draft-log.jsonl')).toEqual([A, B, C3].map((artifact) =>
        expect.objectContaining({ artifact, outcome: 'discarded', actor: 'Matt K', chars_kept: 0 })))
      expect(jsonl(project, 'artifact-log.jsonl').filter((e) => [A, B, C3].includes(e.artifact as string))).toEqual([])
      expect(state()).toEqual({ job: null, candidates: [] })
    })

    it('does not record a run that produced no draft, but still removes it', async () => {
      await summarised({ 'DOC-002': { behaviour: 'exit1' } })
      await discard()
      expect(jsonl(project, 'draft-log.jsonl').map((e) => e.artifact)).toEqual([A, C3])
      expect(state()).toEqual({ job: null, candidates: [] })
    })

    it('reports a ledger that could not be written as a warning, without failing the discard', async () => {
      await summarised()
      breakLedgers()
      const result = await discard()
      expect(result.ok).toBe(true)
      expect(result.warnings).toHaveLength(3)
      expect(result.warnings[0]).toMatch(/^DOC-001 · a\.md: .*not recorded/)
      expect(state()).toEqual({ job: null, candidates: [] })
    })

    it('lets a new batch start afterwards', async () => {
      await summarised()
      await discard()
      expect(startBatch(project, PLUGIN.scriptsDir, 'summarise', batchDeps(scriptedClaude())).ok).toBe(true)
      await settled()
    })
  })

  describe('replacing what is already there', () => {
    it('puts the old text in the version history before the new text lands, and records revised', async () => {
      const OLD = UNFILLED_SUMMARY('DOC-001')
      writeSummary(project, 'DOC-001', 'a', OLD)
      await summarised()
      expect(state().candidates.find((c) => c.id === 'DOC-001')?.replacesExisting).toBe(true)

      expect((await keep()).ok).toBe(true)

      const history = versions(project, A)
      expect(history.some((v) => v.hash === hashOf(OLD) && v.present)).toBe(true) // the old text can be rolled back to
      expect(history.at(-1)).toMatchObject({ event: 'revised', actor: 'Matt K' })
      expect(readFileSync(join(project, A), 'utf-8')).toContain('A stand-in summary of DOC-001.')
    })

    it('does not replace a file it could not put in the history first, and still writes the others', async () => {
      writeSummary(project, 'DOC-001', 'a', 'precious ${hand} written text\n')
      await summarised()
      rmSync(join(project, '.sdlc', 'versions'), { recursive: true, force: true })
      writeFileSync(join(project, '.sdlc', 'versions'), 'not a folder') // no blob can be stored

      const result = await keep()

      expect(result.ok).toBe(false)
      expect(result.kept).toEqual(['DOC-002', 'DOC-003'])
      expect(result.failed).toEqual([{ id: 'DOC-001', label: 'DOC-001 · a.md', error: expect.stringMatching(/history first/) }])
      expect(readFileSync(join(project, A), 'utf-8')).toBe('precious ${hand} written text\n')
      expect(state().candidates.map((c) => c.id)).toEqual(['DOC-001']) // still waiting: the person can discard it
    })
  })

  describe('the two analysis documents', () => {
    it('are both written by Keep, each recorded created and accepted', async () => {
      await analysed()
      const texts = state().candidates.map((c) => c.text)
      const result = await keep()

      expect(result).toEqual({ ok: true, kept: ['contradiction-list', 'question-list'], failed: [], warnings: [] })
      expect(readFileSync(join(project, CONTRADICTIONS), 'utf-8')).toBe(`${texts[0]}\n`)
      expect(readFileSync(join(project, QUESTIONS), 'utf-8')).toBe(`${texts[1]}\n`)
      const log = jsonl(project, 'artifact-log.jsonl')
      for (const target of [CONTRADICTIONS, QUESTIONS]) expect(log.filter((e) => e.artifact === target).at(-1)).toMatchObject({ event: 'created', actor: 'Matt K' })
      expect(jsonl(project, 'draft-log.jsonl').map((e) => [e.artifact, e.outcome])).toEqual([[CONTRADICTIONS, 'accepted'], [QUESTIONS, 'accepted']])
    })

    it('capture what they replace first', async () => {
      mkdirSync(join(project, '.sdlc', 'artifacts', '00-discovery'), { recursive: true })
      writeFileSync(join(project, CONTRADICTIONS), '# A hand-corrected contradiction list\n')
      await analysed()
      expect((await keep()).ok).toBe(true)
      expect(versions(project, CONTRADICTIONS).some((v) => v.hash === hashOf('# A hand-corrected contradiction list\n') && v.present)).toBe(true)
    })

    it('leave the first written when the second write fails, name both files, and record only the written one', async () => {
      await analysed()
      // The second target is a non-empty FOLDER, so it can be neither captured nor replaced.
      mkdirSync(join(project, QUESTIONS))
      writeFileSync(join(project, QUESTIONS, 'keep.txt'), 'x')

      const result = await keep()

      expect(result.ok).toBe(false)
      expect(result.kept).toEqual(['contradiction-list'])
      expect(result.failed.map((f) => f.id)).toEqual(['question-list'])
      expect(result.error).toBe(`Written: contradiction-list.md. Not written: question-list.md (${result.failed[0].error})`)
      expect(result.error!.split('\n')).toHaveLength(1)
      expect(existsSync(join(project, CONTRADICTIONS))).toBe(true) // the first stays written
      expect(jsonl(project, 'draft-log.jsonl').map((e) => [e.artifact, e.outcome])).toEqual([[CONTRADICTIONS, 'accepted']])
      expect(state().candidates.map((c) => c.id)).toEqual(['question-list']) // still waiting
    })

    it('are not half-written when the FIRST write fails: the second is not even attempted', async () => {
      await analysed()
      mkdirSync(join(project, CONTRADICTIONS))
      writeFileSync(join(project, CONTRADICTIONS, 'keep.txt'), 'x')

      const result = await keep()

      expect(result.ok).toBe(false)
      expect(result.kept).toEqual([])
      expect(result.failed.map((f) => f.id)).toEqual(['contradiction-list', 'question-list'])
      expect(result.failed[1].error).toMatch(/^Not written/)
      expect(existsSync(join(project, QUESTIONS))).toBe(false)
      expect(jsonl(project, 'draft-log.jsonl')).toEqual([])
      expect(state().candidates).toHaveLength(2)
    })
  })

  describe('a ledger that cannot be written never costs a document', () => {
    it('keeps the files and says what was not recorded', async () => {
      await summarised()
      breakLedgers()
      const result = await keep()
      expect(result.ok).toBe(true)
      expect(result.kept).toEqual(['DOC-001', 'DOC-002', 'DOC-003'])
      expect(result.warnings.length).toBeGreaterThanOrEqual(3)
      expect(result.warnings[0]).toMatch(/^DOC-001 · a\.md: .*(not added|not recorded)/)
      expect(readFileSync(join(project, A), 'utf-8')).toContain('stand-in summary')
    })
  })

  describe('who and which', () => {
    it.each([['an empty name', '   '], ['no name', null as unknown as string]])('refuses %s and writes nothing', async (_name, actor) => {
      await summarised()
      const before = snapshot(project)
      expect((await keep(undefined, actor)).ok).toBe(false)
      expect((await discard(undefined, actor)).ok).toBe(false)
      expect(differences(before, snapshot(project))).toEqual([])
      expect(state().candidates).toHaveLength(3)
    })

    it('refuses a job id that is not the waiting one', async () => {
      await summarised()
      const before = snapshot(project)
      expect(await keepBatch(project, PLUGIN.scriptsDir, 'not-the-job', 'Matt K')).toMatchObject({ ok: false, error: 'That batch is no longer waiting.' })
      expect(await discardBatch(project, PLUGIN.scriptsDir, 'not-the-job', 'Matt K')).toMatchObject({ ok: false })
      expect(differences(before, snapshot(project))).toEqual([])
    })

    it('cannot keep the same results twice', async () => {
      await summarised()
      const job = state().job!.id
      expect((await keep()).ok).toBe(true)
      expect(await keepBatch(project, PLUGIN.scriptsDir, job, 'Matt K')).toMatchObject({ ok: false })
    })

    it('refuses to decide while the batch is still running', async () => {
      const claude = scriptedClaude({ 'DOC-002': { behaviour: 'hang' } })
      startBatch(project, PLUGIN.scriptsDir, 'summarise', batchDeps(claude))
      await until(() => claude.started().length === 2, 'the second run')
      const before = snapshot(project)
      expect(await keep()).toMatchObject({ ok: false, error: 'Wait for the batch to finish, or cancel it, first.' })
      expect(await discard()).toMatchObject({ ok: false })
      expect(differences(before, snapshot(project))).toEqual([])
    })
  })
})
