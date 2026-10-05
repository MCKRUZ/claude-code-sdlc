/** The workshop brief form's main-process half (spec 0032) against the REAL plugin scripts, in a project
 * made by init_project.py with the plugin's shipped fixture analysis in it: what `candidates` really
 * prints, what `build` really writes, what a refusal leaves behind, and that a person's text (quotes,
 * a backslash, an ampersand, accents) survives the trip through the command line on this platform. */

import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildBrief, getBriefCandidates } from '../electron/main/briefForm'
import { getConsoleLog } from '../electron/main/commandRunner'
import type { BriefSelections } from '../shared/types'
import { differences, makeProject, snapshot } from './draftHarness'
import { requirePlugin } from './pluginRoot'

const PLUGIN = requirePlugin(__dirname)
const FIXTURES = join(__dirname, '..', '..', 'scripts', 'tests', 'fixtures', 'documents')
const BRIEF = '.sdlc/artifacts/00-discovery/workshop-brief.md'

const SELECTIONS: BriefSelections = {
  contradictions: ['CON-01', 'CON-02'],
  questions: ['Q-01', 'Q-03', 'Q-04'],
  loadBearing: ['DOC-001', 'DOC-002', 'DOC-003'],
  claims: [{ text: 'Average claim takes 19 days', docRef: 'DOC-001' }],
  decisions: ['Who signs off the pilot scope?'],
  logistics: {
    clientName: 'Acme Insurance', dateTimeLocation: '12 Oct 2026, 09:00, Leeds', duration: 'Half a day',
    facilitator: 'Priya N', attendees: [{ name: 'Sam K', role: 'Head of Claims' }],
  },
  replaceExisting: false,
}

describe.skipIf(!PLUGIN.available)('the brief form against the real plugin scripts', () => {
  let project = ''
  const read = () => readFileSync(join(project, BRIEF), 'utf-8')
  const build = (s: BriefSelections = SELECTIONS) => buildBrief(project, PLUGIN.scriptsDir, s)

  beforeEach(() => {
    project = makeProject(PLUGIN)
    const dir = join(project, '.sdlc', 'artifacts', '00-discovery')
    mkdirSync(dir, { recursive: true })
    for (const name of ['contradiction-list.md', 'question-list.md', 'document-registry.md']) copyFileSync(join(FIXTURES, name), join(dir, name))
  })
  afterEach(() => rmSync(project, { recursive: true, force: true }))

  describe('opening the form', () => {
    it('reads what the plugin lists, with its pre-tick rule and limits, and writes nothing', async () => {
      const before = snapshot(project)
      const c = await getBriefCandidates(project, PLUGIN.scriptsDir)

      expect(c).toMatchObject({
        ok: true, hasData: true, notes: [], existingBrief: false, provisionalIds: false,
        limits: { contradictions: 5, questions: 12, decisions: [3, 5], loadBearing: [3, 5] },
      })
      if (!c.ok) throw new Error('unreachable')
      expect(c.contradictions.map((x) => [x.id, x.recommended])).toEqual([['CON-01', true], ['CON-02', true]])
      expect(c.contradictions[0].sources.map((s) => s.side)).toEqual(['A', 'B'])
      expect(c.questions.map((q) => [q.id, q.route])).toContainEqual(['Q-02', 'pre-workshop'])
      expect(c.questions.map((q) => [q.id, q.route])).toContainEqual(['Q-08', 'interview'])
      expect(c.documents.map((d) => d.id)).toEqual(['DOC-001', 'DOC-002', 'DOC-003'])
      expect(c.standingDecisions).toBeGreaterThan(0)
      expect(differences(before, snapshot(project))).toEqual([])
    })

    it('says "no data" with the plugin\'s own next step when the analysis has not run, and invents nothing', async () => {
      rmSync(join(project, '.sdlc', 'artifacts', '00-discovery', 'contradiction-list.md'))
      const c = await getBriefCandidates(project, PLUGIN.scriptsDir)
      expect(c).toMatchObject({ ok: true, hasData: false, contradictions: [], questions: [], documents: [] })
      if (c.ok) expect(c.notes.join(' ')).toContain('run the document analysis first')
    })

    it('is one plain line when the project has no state file, with no path in it', async () => {
      const r = await getBriefCandidates(join(project, 'nowhere'), PLUGIN.scriptsDir)
      expect(r).toEqual({ ok: false, error: 'state file not found: state.yaml' })
    })

    it('is one plain line when the plugin\'s script is missing', async () => {
      const r = await getBriefCandidates(project, join(PLUGIN.scriptsDir, 'no-such-dir'))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).not.toMatch(/\r|\n|Traceback|can't open/)
    })
  })

  describe('building', () => {
    it('builds from the recommended contradictions, workshop questions and three documents, and reports what was emailed instead', async () => {
      const before = getConsoleLog().length
      const r = await build()

      expect(r).toEqual({
        ok: true, path: BRIEF, contradictionsOnPage: 2, questionsOnPage: 3, emailedInstead: ['Q-02', 'Q-07'],
        notes: [], lint: [],
      })
      const text = read()
      expect(text).toContain('Acme Insurance')
      expect(text).toContain('Average claim takes 19 days (DOC-001)')
      expect(text).toContain('Who signs off the pilot scope?')
      for (const id of ['CON-01', 'CON-02', 'Q-01', 'Q-03', 'Q-04']) expect(text).toContain(`(${id})`)
      expect(text).not.toContain('(Q-02)') // emailed before the workshop, not on the page
      expect(text).not.toContain('(Q-08)') // interview: neither
      expect(getConsoleLog().slice(before).map((e) => e.args[1])).toEqual(['candidates', 'build'])
    })

    it('with nothing to say for claims, builds and lets the plugin\'s note come back', async () => {
      const r = await build({ ...SELECTIONS, claims: [] })
      expect(r).toMatchObject({ ok: true })
      if (r.ok) expect(r.notes.join(' ')).toContain('No claims supplied')
    })

    it('shows the plugin\'s lint line for a decision that is not a question', async () => {
      const r = await build({ ...SELECTIONS, decisions: ['Go ahead with the pilot'] })
      expect(r).toMatchObject({ ok: true })
      if (r.ok) expect(r.lint.map((l) => l.message).join(' ')).toContain('does not end in a question mark')
    })
  })

  describe('replacing', () => {
    it('refuses a second build until the person confirms, and leaves the first brief byte-identical', async () => {
      expect((await build()).ok).toBe(true)
      const before = snapshot(project)

      const r = await build({ ...SELECTIONS, decisions: ['Something else entirely?'] })
      expect(r).toEqual({ ok: false, error: 'A brief already exists; confirm replacing it first.' })
      expect(differences(before, snapshot(project))).toEqual([])
    })

    it('replaces it when the person confirmed', async () => {
      await build()
      const first = read()
      const r = await build({ ...SELECTIONS, decisions: ['Something else entirely?'], replaceExisting: true })
      expect(r.ok).toBe(true)
      expect(read()).not.toBe(first)
      expect(read()).toContain('Something else entirely?')
    })
  })

  describe('a refusal writes nothing', () => {
    const refused: Array<[string, BriefSelections | unknown]> = [
      ['a shape the form cannot have sent', { ...SELECTIONS, extra: 1 }],
      ['an id the lists do not have', { ...SELECTIONS, contradictions: ['CON-99'] }],
      ['a pre-workshop question ticked for the page', { ...SELECTIONS, questions: ['Q-02'] }],
      ['an interview question ticked for the page', { ...SELECTIONS, questions: ['Q-08'] }],
      ['two documents where three to five are needed', { ...SELECTIONS, loadBearing: ['DOC-001', 'DOC-002'] }],
      ['no decisions', { ...SELECTIONS, decisions: [] }],
    ]
    it.each(refused)('%s', async (_name, selections) => {
      const before = snapshot(project)
      const r = await buildBrief(project, PLUGIN.scriptsDir, selections)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).not.toMatch(/\r|\n/)
      expect(differences(before, snapshot(project))).toEqual([])
    })

    it('shows the plugin\'s own refusal as one line, and writes nothing, when the plugin objects after Studio agrees', async () => {
      const before = snapshot(project)
      const r = await build({ ...SELECTIONS, decisions: ['Who owns ${CLIENT_NAME}?'] }) // a placeholder the plugin will not leave in a brief
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.error).toContain('unfilled placeholders')
        expect(r.error).not.toMatch(/\r|\n/)
      }
      expect(differences(before, snapshot(project))).toEqual([])
    })
  })

  describe('a person\'s text survives the command line', () => {
    const TRICKY = [
      'Did he say "yes" and mean it?',
      "Isn't the owner's name Dan's?",
      'Is C:\\Program Files\\Acme\\ the install path?',
      'Does it end in a backslash \\ or a quoted "end\\"?',
      'Do we ship R&D & ops | dev > test < prod ^ %PATH% $HOME?',
      'Wird café, naïve, 日本語, and an emoji 😀 work?',
    ]

    it('reads every decision, claim and logistics value back from the built brief exactly as typed', async () => {
      const r = await build({
        ...SELECTIONS,
        decisions: TRICKY.slice(0, 3),
        claims: [{ text: 'Claims take "19 days" & cost C:\\money — said Zoë', docRef: 'DOC-002' }],
        logistics: {
          clientName: 'Acme "Big" Insurance & Sons', dateTimeLocation: 'Leeds — Room "B" at 09:00', duration: 'Half a day (4\\5 hrs)',
          facilitator: "Priya O'Neil", attendees: [{ name: 'José "Joe" Núñez', role: 'Head of R&D' }, { name: 'Sam K', role: 'Claims \\ Ops' }],
        },
      })
      expect(r.ok).toBe(true)

      const text = read()
      for (const d of TRICKY.slice(0, 3)) expect(text).toContain(d)
      expect(text).toContain('Claims take "19 days" & cost C:\\money — said Zoë (DOC-002)')
      expect(text).toContain('Acme "Big" Insurance & Sons')
      expect(text).toContain('Leeds — Room "B" at 09:00')
      expect(text).toContain('Half a day (4\\5 hrs)')
      expect(text).toContain("Priya O'Neil")
      expect(text).toContain('José "Joe" Núñez (Head of R&D), Sam K (Claims \\ Ops)')
    })

    it('does the same for the rest of the awkward characters', async () => {
      const r = await build({ ...SELECTIONS, decisions: TRICKY.slice(3) })
      expect(r.ok).toBe(true)
      for (const d of TRICKY.slice(3)) expect(read()).toContain(d)
    })
  })
})
