/** buildBrief's call to the plugin (spec 0032): the exact argument list, the result mapping, and the
 * three failure modes, with the plugin stood in for. Every refusal of the selections is in
 * briefFormValidate.test.ts; the real scripts are in briefFormEndToEnd.test.ts. */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'

vi.mock('../electron/main/project', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../electron/main/project')>()),
  runPluginScript: vi.fn(),
}))

import { buildBrief } from '../electron/main/briefForm'
import { runPluginScript } from '../electron/main/project'
import {
  entry, FAILURES, json, planStandIn, PLUGIN_BUILT, PLUGIN_CANDIDATES, PROJECT, SCRIPTS, SELECTIONS, withCandidates,
} from './briefPluginFixtures'

const run = vi.mocked(runPluginScript)
const STATE = join(PROJECT, '.sdlc', 'state.yaml')

const stand = (candidates = PLUGIN_CANDIDATES as Record<string, unknown>, built: Parameters<typeof planStandIn>[1] = json(PLUGIN_BUILT)) => {
  const s = planStandIn(json(candidates), built)
  run.mockImplementation(s.impl)
  return s
}

describe('buildBrief: the arguments', () => {
  beforeEach(() => { run.mockReset() })

  it('reads the candidates once, then runs exactly the fixed build argument list', async () => {
    const s = stand()
    await buildBrief(PROJECT, SCRIPTS, SELECTIONS)

    expect(s.calls.map((c) => c.args[0])).toEqual(['candidates', 'build'])
    expect(s.calls.every((c) => c.script === 'workshop_brief.py')).toBe(true)
    expect(s.builds()[0].args).toEqual([
      'build', '--state', STATE,
      '--contradictions', 'CON-01,CON-02',
      // Q-02 and Q-05 are routed pre-workshop: not ticked, but handed over so the plugin reports them as emailed.
      '--questions', 'Q-01,Q-02,Q-03,Q-05',
      '--load-bearing', 'DOC-001,DOC-002,DOC-003',
      '--decisions-json', JSON.stringify(['Who signs off the pilot?']),
      '--logistics-json', JSON.stringify({
        client_name: 'Acme Insurance', date_time_location: '12 Oct 2026, 09:00, Leeds', duration: 'Half a day',
        attendees: [{ name: 'Sam K', role: 'Head of Claims' }], facilitator: 'Priya N',
      }),
      '--claims-json', JSON.stringify([{ text: 'Average claim takes 19 days', doc_ref: 'DOC-001' }]),
      '--json',
    ])
  })

  it('keeps the ids in the order given for contradictions and load-bearing documents', async () => {
    const s = stand()
    await buildBrief(PROJECT, SCRIPTS, { ...SELECTIONS, contradictions: ['CON-02', 'CON-01'], loadBearing: ['DOC-003', 'DOC-001', 'DOC-002'] })
    const args = s.builds()[0].args
    expect(args[args.indexOf('--contradictions') + 1]).toBe('CON-02,CON-01')
    expect(args[args.indexOf('--load-bearing') + 1]).toBe('DOC-003,DOC-001,DOC-002')
  })

  it('puts the pre-workshop ids in the candidates\' own order among the ticked ones, each once', async () => {
    const s = stand()
    await buildBrief(PROJECT, SCRIPTS, { ...SELECTIONS, questions: ['Q-10', 'Q-03', 'Q-01'] })
    const args = s.builds()[0].args
    expect(args[args.indexOf('--questions') + 1]).toBe('Q-01,Q-02,Q-03,Q-05,Q-10')
  })

  it('omits --contradictions when none are ticked, and --questions when there are none at all', async () => {
    const noPre = withCandidates({ questions: PLUGIN_CANDIDATES.questions.filter((q) => q.route === 'workshop') })
    const s = stand(noPre)
    await buildBrief(PROJECT, SCRIPTS, { ...SELECTIONS, contradictions: [], questions: [] })
    const args = s.builds()[0].args
    expect(args).not.toContain('--contradictions')
    expect(args).not.toContain('--questions')
    expect(args).toContain('--claims-json')
  })

  it('still passes --questions when only pre-workshop questions exist, so they are reported as emailed', async () => {
    const s = stand()
    await buildBrief(PROJECT, SCRIPTS, { ...SELECTIONS, questions: [] })
    const args = s.builds()[0].args
    expect(args[args.indexOf('--questions') + 1]).toBe('Q-02,Q-05')
  })

  it('passes an empty claims list as [] rather than leaving the flag off', async () => {
    const s = stand()
    await buildBrief(PROJECT, SCRIPTS, { ...SELECTIONS, claims: [] })
    const args = s.builds()[0].args
    expect(args[args.indexOf('--claims-json') + 1]).toBe('[]')
  })

  it('passes --force only when a brief exists AND the person confirmed replacing it', async () => {
    const s = stand(withCandidates({ existing_brief: true }))
    await buildBrief(PROJECT, SCRIPTS, { ...SELECTIONS, replaceExisting: true })
    expect(s.builds()[0].args.at(-1)).toBe('--force')
    expect(s.builds()[0].args.filter((a) => a === '--force')).toHaveLength(1)
  })

  it('never passes --force when there is nothing to replace, even if the box was ticked', async () => {
    const s = stand()
    await buildBrief(PROJECT, SCRIPTS, { ...SELECTIONS, replaceExisting: true })
    expect(s.builds()[0].args).not.toContain('--force')
  })

  it('puts no selection text anywhere in the argument list except the --*-json values', async () => {
    const hostile = {
      ...SELECTIONS,
      claims: [{ text: '--force --output C:\\x "; calc', docRef: 'DOC-001' }],
      decisions: ['--state C:\\elsewhere?'],
      logistics: { ...SELECTIONS.logistics, clientName: '--repo C:\\other', facilitator: '--output x' },
    }
    const s = stand()
    await buildBrief(PROJECT, SCRIPTS, hostile)
    const args = s.builds()[0].args
    const flags = args.filter((a) => a.startsWith('--'))
    expect(flags).toEqual([
      '--state', '--contradictions', '--questions', '--load-bearing', '--decisions-json', '--logistics-json', '--claims-json', '--json',
    ])
    for (const name of ['--decisions-json', '--logistics-json', '--claims-json']) {
      expect(() => JSON.parse(args[args.indexOf(name) + 1])).not.toThrow()
    }
  })
})

describe('buildBrief: the result', () => {
  beforeEach(() => { run.mockReset() })

  it('reads the plugin\'s counts, emailed-instead ids, notes and lint, with a repo-relative forward-slash path', async () => {
    stand()
    const r = await buildBrief(PROJECT, SCRIPTS, SELECTIONS)
    expect(r).toEqual({
      ok: true,
      path: '.sdlc/artifacts/00-discovery/workshop-brief.md',
      contradictionsOnPage: 2,
      questionsOnPage: 2,
      emailedInstead: ['Q-02', 'Q-05'],
      notes: ['No claims supplied.'],
      lint: [{ line: 41, message: 'does not end in a question mark: 3. Go.' }],
    })
  })

  it('shows the plugin\'s one Error line, with an absolute path reduced to its file name', async () => {
    const target = join(PROJECT, '.sdlc', 'artifacts', '00-discovery', 'workshop-brief.md')
    stand(PLUGIN_CANDIDATES, entry('', 1, `Error: ${target} already exists; pass --force to overwrite it\n`))
    expect(await buildBrief(PROJECT, SCRIPTS, SELECTIONS)).toEqual({ ok: false, error: 'workshop-brief.md already exists; pass --force to overwrite it' })
  })

  it('reduces a path that contains spaces, and a path at the end of the message', async () => {
    stand(PLUGIN_CANDIDATES, entry('', 1, 'Error: document registry not found: C:\\Users\\A B\\Code Repos\\proj\\.sdlc\\artifacts\\00-discovery\\document-registry.md\n'))
    expect(await buildBrief(PROJECT, SCRIPTS, SELECTIONS)).toEqual({ ok: false, error: 'document registry not found: document-registry.md' })
  })

  it('reduces a posix path too', async () => {
    stand(PLUGIN_CANDIDATES, entry('', 1, 'Error: question list not found: /home/me/my proj/.sdlc/question-list.md\n'))
    expect(await buildBrief(PROJECT, SCRIPTS, SELECTIONS)).toEqual({ ok: false, error: 'question list not found: question-list.md' })
  })

  it('returns only the first Error line, and keeps a plugin message with no path as it is', async () => {
    stand(PLUGIN_CANDIDATES, entry('', 1, 'Error: claim 1 has no DOC-NNN reference (every claim must cite its document)\nTraceback: more\n'))
    expect(await buildBrief(PROJECT, SCRIPTS, SELECTIONS)).toEqual({
      ok: false, error: 'claim 1 has no DOC-NNN reference (every claim must cite its document)',
    })
  })

  describe.each(FAILURES)('when the build is run and %s', (_name, failure) => {
    it('is one plain line and no counts', async () => {
      stand(PLUGIN_CANDIDATES, failure())
      const r = await buildBrief(PROJECT, SCRIPTS, SELECTIONS)
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.error).not.toMatch(/\r|\n/)
      expect(r.error.length).toBeGreaterThan(0)
      expect(r).not.toHaveProperty('contradictionsOnPage')
    })
  })

  it.each([
    ['the path is missing', { path: undefined }],
    ['a count is missing', { contradictions: {} }],
    ['emailed_instead is not a list', { questions: { total: 1, on_page: 2, ids: [], emailed_instead: 'Q-02' } }],
  ])('refuses a successful exit whose JSON lacks what the result needs (%s)', async (_name, change) => {
    stand(PLUGIN_CANDIDATES, json({ ...PLUGIN_BUILT, ...change }))
    const r = await buildBrief(PROJECT, SCRIPTS, SELECTIONS)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).not.toMatch(/\r|\n/)
  })

  it('reads the candidates failure as the whole answer: no build is started', async () => {
    const s = planStandIn(entry('', 1, 'Error: state file not found: x\n'), json(PLUGIN_BUILT))
    run.mockImplementation(s.impl)
    const r = await buildBrief(PROJECT, SCRIPTS, SELECTIONS)
    expect(r).toEqual({ ok: false, error: 'state file not found: x' })
    expect(s.builds()).toHaveLength(0)
  })

  it('does not build when the candidates say there is no analysis yet', async () => {
    const notes = ['contradiction-list.md not found: run the document analysis first.']
    const s = stand(withCandidates({ has_data: false, notes }))
    const r = await buildBrief(PROJECT, SCRIPTS, SELECTIONS)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('run the document analysis first')
    expect(s.builds()).toHaveLength(0)
  })
})
