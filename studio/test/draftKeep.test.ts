/** Keep and Discard (spec 0027) against the REAL plugin scripts in a project init_project.py made: what
 * lands on disk, what the version history holds, and which ledger lines were written. The model is the
 * stand-in `claude`; nothing here calls the live one. */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { keepCandidate } from '../electron/main/draftKeep'
import { discardDraft, getDraftState, keepDraft, resetDraftStateForTests, startDraft } from '../electron/main/draftDocuments'
import type { DraftCandidate } from '../shared/types'
import {
  deps, differences, fakeClaude, GATE_RESULTS_REPORT, makeProject, NARRATIVE_REL, REVIEW_REL, snapshot, SOURCE_REL,
} from './draftHarness'
import { requirePlugin } from './pluginRoot'

const PLUGIN = requirePlugin(__dirname)

const jsonl = (project: string, name: string): Array<Record<string, unknown>> => {
  const path = join(project, '.sdlc', 'metrics', name)
  return existsSync(path) ? readFileSync(path, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []
}

function versions(project: string, rel: string): Array<{ hash: string; present: boolean; event: string; actor: string }> {
  const out = execFileSync(PLUGIN.python, [
    join(PLUGIN.scriptsDir, 'audit_artifacts.py'), 'version', 'list', rel, '--json', '--state', join(project, '.sdlc', 'state.yaml'),
  ], { encoding: 'utf-8' })
  return JSON.parse(out).versions
}

describe.skipIf(!PLUGIN.available)('Keep and Discard against the real plugin scripts', () => {
  let project = ''
  beforeEach(() => {
    resetDraftStateForTests()
    project = makeProject(PLUGIN)
  })
  afterEach(() => rmSync(project, { recursive: true, force: true }))

  const enhance = { kind: 'enhance' as const, stageId: '1', document: SOURCE_REL }
  const review = { kind: 'review' as const, stageId: '1', mode: 'council' as const }

  async function candidateFor(request: typeof enhance | typeof review, text: string): Promise<DraftCandidate> {
    const started = await startDraft(project, PLUGIN.scriptsDir, request, deps(fakeClaude('success', { text })))
    if (!started.ok) throw new Error(`setup: ${started.error}`)
    return started.candidate
  }

  describe('keeping a summary', () => {
    it('creates the file beside its source, and records the change and the outcome', async () => {
      const candidate = await candidateFor(enhance, '# Requirements, in plain words\n\nIt must exist.')
      expect(existsSync(join(project, NARRATIVE_REL))).toBe(false)

      const result = await keepDraft(project, PLUGIN.scriptsDir, candidate.jobId, 'Matt K')

      expect(result).toEqual({ ok: true, written: NARRATIVE_REL })
      expect(readFileSync(join(project, NARRATIVE_REL), 'utf-8')).toBe('# Requirements, in plain words\n\nIt must exist.\n')
      expect(getDraftState(project).candidate).toBeNull()

      const change = jsonl(project, 'artifact-log.jsonl').filter((e) => e.artifact === NARRATIVE_REL)
      expect(change.at(-1)).toMatchObject({ event: 'created', actor: 'Matt K', reason: 'Drafted by Claude' })

      expect(jsonl(project, 'draft-log.jsonl')).toEqual([
        expect.objectContaining({
          artifact: NARRATIVE_REL, outcome: 'accepted', actor: 'Matt K',
          chars_offered: candidate.text.length, chars_kept: candidate.text.length + 1,
        }),
      ])
    })

    it('replaces an existing summary only after the old text is in the version history', async () => {
      const OLD = '# Hand-corrected summary\n\nA person fixed this by hand.\n'
      writeFileSync(join(project, NARRATIVE_REL), OLD)
      const candidate = await candidateFor(enhance, '# Fresh summary\n\nWritten by Claude.')
      expect(candidate.replacesExisting).toBe(true)

      const result = await keepDraft(project, PLUGIN.scriptsDir, candidate.jobId, 'Priya N')

      expect(result).toMatchObject({ ok: true, written: NARRATIVE_REL })
      expect(readFileSync(join(project, NARRATIVE_REL), 'utf-8')).toBe('# Fresh summary\n\nWritten by Claude.\n')

      const history = versions(project, NARRATIVE_REL)
      const oldHash = `sha256:${(await import('node:crypto')).createHash('sha256').update(OLD).digest('hex').slice(0, 16)}`
      expect(history.some((v) => v.hash === oldHash && v.present)).toBe(true) // the old text can be rolled back to
      expect(history.at(-1)).toMatchObject({ event: 'revised', actor: 'Priya N' })
      expect(history.at(-1)?.hash).not.toBe(oldHash)
    })

    it('still captures the old text when the shared ledger already knows its hash but this machine never stored it', async () => {
      const OLD = '# Summary a teammate wrote\n'
      writeFileSync(join(project, NARRATIVE_REL), OLD)
      execFileSync(PLUGIN.python, [join(PLUGIN.scriptsDir, 'audit_artifacts.py'), 'record', '--scan', '--state', join(project, '.sdlc', 'state.yaml')])
      rmSync(join(project, '.sdlc', 'versions'), { recursive: true, force: true }) // a fresh clone: ledger yes, bytes no

      const candidate = await candidateFor(enhance, 'New text.')
      const result = await keepDraft(project, PLUGIN.scriptsDir, candidate.jobId, 'Matt K')

      expect(result.ok).toBe(true)
      const oldHash = `sha256:${(await import('node:crypto')).createHash('sha256').update(OLD).digest('hex').slice(0, 16)}`
      expect(versions(project, NARRATIVE_REL).some((v) => v.hash === oldHash && v.present)).toBe(true)
    })

    it('refuses a job id that is not the waiting one, and an empty name, and writes nothing', async () => {
      const candidate = await candidateFor(enhance, 'Text.')
      const before = snapshot(project)

      expect(await keepDraft(project, PLUGIN.scriptsDir, 'not-the-job', 'Matt K')).toMatchObject({ ok: false, error: 'That draft is no longer waiting.' })
      expect(await keepDraft(project, PLUGIN.scriptsDir, candidate.jobId, '   ')).toMatchObject({ ok: false })
      expect(await keepDraft(project, PLUGIN.scriptsDir, candidate.jobId, undefined)).toMatchObject({ ok: false })

      expect(differences(before, snapshot(project))).toEqual([])
      expect(getDraftState(project).candidate?.jobId).toBe(candidate.jobId) // still waiting
    })

    it('cannot keep the same draft twice', async () => {
      const candidate = await candidateFor(enhance, 'Text.')
      expect((await keepDraft(project, PLUGIN.scriptsDir, candidate.jobId, 'Matt K')).ok).toBe(true)
      expect(await keepDraft(project, PLUGIN.scriptsDir, candidate.jobId, 'Matt K')).toMatchObject({ ok: false })
    })
  })

  describe('refusing a target it must not write', () => {
    const candidate = (target: string): DraftCandidate => ({
      jobId: 'j', kind: 'enhance', stageId: '1', target, text: 'x', costUsd: null, replacesExisting: false,
    })

    it.each([
      ['a file that is not on the allowlist', 'notes/readme.md'],
      ['the project state file', '.sdlc/state.yaml'],
      ['a spec', 'specs/0001-x.md'],
      ['an allowlisted folder but not a document', '.sdlc/artifacts/01-requirements/data.json'],
      ['a path with ..', '.sdlc/artifacts/01-requirements/../../../outside.md'],
      ['a path that climbs out of the project', '../outside.md'],
      ['an absolute path', join(tmpdir(), 'outside.md')],
    ])('refuses %s with one line and writes nothing', async (_name, target) => {
      const before = snapshot(project)
      const result = await keepCandidate(project, PLUGIN.scriptsDir, candidate(target), 'Matt K')
      expect(result.ok).toBe(false)
      expect(result.error?.split('\n')).toHaveLength(1)
      expect(differences(before, snapshot(project))).toEqual([])
    })

    it('refuses a target that resolves outside the project through a link', async () => {
      const outside = mkdtempSync(join(tmpdir(), 'studio-outside-'))
      try {
        try {
          symlinkSync(outside, join(project, '.sdlc', 'artifacts', '99-escape'), 'junction')
        } catch {
          return // a link cannot be made here, so there is nothing to test
        }
        const result = await keepCandidate(project, PLUGIN.scriptsDir, candidate('.sdlc/artifacts/99-escape/x.md'), 'Matt K')
        expect(result.ok).toBe(false)
        expect(existsSync(join(outside, 'x.md'))).toBe(false)
      } finally {
        rmSync(outside, { recursive: true, force: true })
      }
    })
  })

  describe('a ledger that cannot be written never costs the document', () => {
    /** Replaces .sdlc/metrics with a FILE, so every ledger append fails. */
    function breakLedgers() {
      rmSync(join(project, '.sdlc', 'metrics'), { recursive: true, force: true })
      writeFileSync(join(project, '.sdlc', 'metrics'), 'not a folder')
    }

    it('keeps a new document and says what was not recorded', async () => {
      const candidate = await candidateFor(enhance, 'Text.')
      breakLedgers()

      const result = await keepDraft(project, PLUGIN.scriptsDir, candidate.jobId, 'Matt K')

      expect(result.ok).toBe(true)
      expect(result.written).toBe(NARRATIVE_REL)
      expect(result.warning).toMatch(/not (added|recorded)/)
      expect(readFileSync(join(project, NARRATIVE_REL), 'utf-8')).toBe('Text.\n')
    })

    it('does not replace an existing document it could not put in the history first', async () => {
      writeFileSync(join(project, NARRATIVE_REL), 'precious hand-written text\n')
      const candidate = await candidateFor(enhance, 'Text.')
      // The version store is a FILE, so no blob can be stored: the old text cannot be captured.
      rmSync(join(project, '.sdlc', 'versions'), { recursive: true, force: true })
      writeFileSync(join(project, '.sdlc', 'versions'), 'not a folder')

      const result = await keepDraft(project, PLUGIN.scriptsDir, candidate.jobId, 'Matt K')

      expect(result.ok).toBe(false)
      expect(result.error).toMatch(/history first/)
      expect(readFileSync(join(project, NARRATIVE_REL), 'utf-8')).toBe('precious hand-written text\n')
      expect(getDraftState(project).candidate?.jobId).toBe(candidate.jobId) // the person can still discard it
    })

    it('reports a discard whose outcome could not be recorded, without failing it', async () => {
      const candidate = await candidateFor(enhance, 'Text.')
      breakLedgers()
      const result = await discardDraft(project, PLUGIN.scriptsDir, candidate.jobId, 'Matt K')
      expect(result).toMatchObject({ ok: true, warning: expect.stringMatching(/not recorded/) })
      expect(getDraftState(project).candidate).toBeNull()
    })
  })

  describe('keeping a review', () => {
    it('writes review-report.md, then records its findings', async () => {
      const candidate = await candidateFor(review, GATE_RESULTS_REPORT)
      const result = await keepDraft(project, PLUGIN.scriptsDir, candidate.jobId, 'Matt K')

      expect(result).toEqual({ ok: true, written: REVIEW_REL, findingsRecorded: true })
      expect(readFileSync(join(project, REVIEW_REL), 'utf-8')).toBe(GATE_RESULTS_REPORT)
      expect(jsonl(project, 'findings-log.jsonl')).toEqual([
        expect.objectContaining({ id: 'F-1', severity: 'HIGH', report: 'review-report.md', disposition: 'OPEN' }),
      ])
      expect(jsonl(project, 'artifact-log.jsonl').filter((e) => e.artifact === REVIEW_REL).at(-1)).toMatchObject({ event: 'created' })
    })

    it('still writes a report with no Gate Results table, and says no findings were recorded', async () => {
      const candidate = await candidateFor(review, '# A review with only prose\n\nLooks fine.')
      const result = await keepDraft(project, PLUGIN.scriptsDir, candidate.jobId, 'Matt K')

      expect(result).toMatchObject({ ok: true, written: REVIEW_REL, findingsRecorded: false, warning: expect.stringMatching(/no Gate Results table/) })
      expect(readFileSync(join(project, REVIEW_REL), 'utf-8')).toBe('# A review with only prose\n\nLooks fine.\n')
      expect(jsonl(project, 'findings-log.jsonl')).toEqual([])
    })

    it('replacing last round\'s report captures it first, so the earlier review stays recoverable', async () => {
      writeFileSync(join(project, REVIEW_REL), '# Last round\n')
      const candidate = await candidateFor(review, GATE_RESULTS_REPORT)
      expect(candidate.replacesExisting).toBe(true)

      expect((await keepDraft(project, PLUGIN.scriptsDir, candidate.jobId, 'Matt K')).ok).toBe(true)

      const history = versions(project, REVIEW_REL)
      expect(history.filter((v) => v.present).length).toBeGreaterThanOrEqual(2)
      expect(history.at(-1)?.event).toBe('revised')
    })
  })

  describe('discarding', () => {
    it('records the outcome discarded with the artifact, the person and the sizes, and writes no document', async () => {
      const candidate = await candidateFor(enhance, 'A draft nobody wanted.')
      const result = await discardDraft(project, PLUGIN.scriptsDir, candidate.jobId, 'Matt K')

      expect(result).toEqual({ ok: true })
      expect(existsSync(join(project, NARRATIVE_REL))).toBe(false)
      expect(jsonl(project, 'draft-log.jsonl')).toEqual([
        expect.objectContaining({
          artifact: NARRATIVE_REL, outcome: 'discarded', actor: 'Matt K',
          chars_offered: candidate.text.length, chars_kept: 0,
        }),
      ])
      expect(jsonl(project, 'artifact-log.jsonl').filter((e) => e.artifact === NARRATIVE_REL)).toEqual([])
    })

    it('cannot discard a draft that is not the waiting one', async () => {
      await candidateFor(enhance, 'Text.')
      expect(await discardDraft(project, PLUGIN.scriptsDir, 'other', 'Matt K')).toMatchObject({ ok: false })
      expect(jsonl(project, 'draft-log.jsonl')).toEqual([])
    })
  })
})
