/** Spec 0029: the exact set of documents Keep may write for a batch, and the refusal of everything else. */

import { existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { keepCandidate } from '../electron/main/draftKeep'
import { ANALYSIS_TARGETS, isBatchTarget, isDraftTarget, isKeepableTarget } from '../electron/main/draftTargets'
import { intakePath, makeIntakeProject } from './batchHarness'
import { differences, snapshot } from './draftHarness'
import { requirePlugin } from './pluginRoot'

const PLUGIN = requirePlugin(__dirname)
const CONTRADICTIONS = '.sdlc/artifacts/00-discovery/contradiction-list.md'
const QUESTIONS = '.sdlc/artifacts/00-discovery/question-list.md'
const A = '.sdlc/context/intake/DOC-001-a.md'
const B = '.sdlc/context/intake/DOC-002-b.md'

describe.skipIf(!PLUGIN.available)('the targets Keep may write', () => {
  let project = ''
  beforeEach(() => {
    project = makeIntakeProject(PLUGIN, { files: { 'a.md': '# a\n', 'b.md': '# b\n' } })
  })
  afterEach(() => rmSync(project, { recursive: true, force: true }))
  const subject = (target: string) => ({ target, text: 'x' })

  it('are exactly a DOC-NNN summary under context/intake and the two analysis files', () => {
    expect(ANALYSIS_TARGETS).toEqual([CONTRADICTIONS, QUESTIONS])
    for (const ok of [A, B, '.sdlc/context/intake/DOC-1234-some-long-name-2.md', CONTRADICTIONS, QUESTIONS]) {
      expect(isBatchTarget(ok), ok).toBe(true)
      expect(isKeepableTarget(ok), ok).toBe(true)
    }
    expect(isDraftTarget(A)).toBe(false) // the summary target joins Keep's set; it is not a spec 0027 draft target
  })

  it.each([
    ['the catalogue itself', '.sdlc/context/intake/catalog.json'],
    ['the index', '.sdlc/context/intake/index.md'],
    ['a summary with an upper-case slug', '.sdlc/context/intake/DOC-001-Name.md'],
    ['a summary with a dot in the slug', '.sdlc/context/intake/DOC-001-a.b.md'],
    ['a summary in a sub-folder', '.sdlc/context/intake/sub/DOC-001-a.md'],
    ['a summary with no slug', '.sdlc/context/intake/DOC-001-.md'],
    ['a summary with no number', '.sdlc/context/intake/DOC-x-a.md'],
    ['another discovery document', '.sdlc/artifacts/00-discovery/constitution.md'],
    ['a review report', '.sdlc/artifacts/01-requirements/review-report.md'],
    ['the project state', '.sdlc/state.yaml'],
    ['a spec', 'specs/0001-x.md'],
    ['a path with ..', '.sdlc/context/intake/../../../outside.md'],
    ['a summary name with ..', '.sdlc/context/intake/DOC-001-..a.md'],
    ['a path that climbs out', '../outside.md'],
    ['an absolute path', join(tmpdir(), 'outside.md')],
  ])('refuse %s with one line and write nothing', async (_name, target) => {
    const before = snapshot(project)
    const result = await keepCandidate(project, PLUGIN.scriptsDir, subject(target), 'Matt K', isBatchTarget)
    expect(result.ok).toBe(false)
    expect(result.error?.split('\n')).toHaveLength(1)
    expect(differences(before, snapshot(project))).toEqual([])
  })

  it('still include everything spec 0027 could write, for a single-document draft', async () => {
    const result = await keepCandidate(project, PLUGIN.scriptsDir, { ...subject('.sdlc/artifacts/01-requirements/x.narrative.md'), kind: 'enhance' }, 'Matt K')
    expect(result.ok).toBe(true)
  })

  it('refuse a summary target that is a link out of the project', async () => {
    const outside = join(tmpdir(), `studio-outside-${Date.now()}`)
    mkdirSync(outside)
    try {
      try {
        symlinkSync(outside, intakePath(project, 'DOC-002-b.md'), 'junction')
      } catch {
        return // a link cannot be made here, so there is nothing to test
      }
      expect((await keepCandidate(project, PLUGIN.scriptsDir, subject(B), 'Matt K', isBatchTarget)).ok).toBe(false)
      expect(existsSync(join(outside, 'DOC-002-b.md'))).toBe(false)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })
})
