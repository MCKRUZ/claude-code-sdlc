/** Every refusal buildBrief makes before it starts a build (spec 0032): the renderer is untrusted, so the
 * main process re-checks each selection against the candidates it has just read. A refusal is one plain
 * line, starts no build, and the ones that need no candidates start no process at all. */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../electron/main/project', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../electron/main/project')>()),
  runPluginScript: vi.fn(),
}))

import { buildBrief } from '../electron/main/briefForm'
import { runPluginScript } from '../electron/main/project'
import { json, planStandIn, PLUGIN_BUILT, PLUGIN_CANDIDATES, PROJECT, SCRIPTS, SELECTIONS, withCandidates } from './briefPluginFixtures'

const run = vi.mocked(runPluginScript)

const L = SELECTIONS.logistics
const withLogistics = (change: Record<string, unknown>) => ({ ...SELECTIONS, logistics: { ...L, ...change } })
const ids = (prefix: string, from: number, count: number) => Array.from({ length: count }, (_, i) => `${prefix}-${String(from + i).padStart(2, '0')}`)
const long = (n: number) => 'x'.repeat(n)

/** [name, selections, message the person is shown (part), whether the candidates were read to decide it] */
const REFUSALS: Array<[string, unknown, RegExp, boolean]> = [
  // --- shape: decided with no process at all ---
  ['selections that are not an object', 'CON-01', /not in a shape/i, false],
  ['selections that are null', null, /not in a shape/i, false],
  ['an array instead of the selections', [], /not in a shape/i, false],
  ['a missing field', { ...SELECTIONS, claims: undefined }, /not in a shape/i, false],
  ['an extra field', { ...SELECTIONS, force: true }, /not in a shape/i, false],
  ['a contradictions list that is not a list', { ...SELECTIONS, contradictions: 'CON-01' }, /not in a shape/i, false],
  ['a replaceExisting that is not a boolean', { ...SELECTIONS, replaceExisting: 'true' }, /not in a shape/i, false],
  ['logistics that is not an object', { ...SELECTIONS, logistics: 'Acme' }, /not in a shape/i, false],
  ['an extra logistics field', withLogistics({ output: 'C:\\x' }), /not in a shape/i, false],
  ['an attendee with an extra field', withLogistics({ attendees: [{ name: 'a', role: 'b', email: 'c' }] }), /not in a shape/i, false],
  ['a claim with an extra field', { ...SELECTIONS, claims: [{ text: 'a', docRef: 'DOC-001', extra: 1 }] }, /not in a shape/i, false],
  // --- ids ---
  ['a contradiction id of the wrong form', { ...SELECTIONS, contradictions: ['CON-01', '--force'] }, /--force.*not a contradiction id/i, false],
  ['a contradiction id with trailing text', { ...SELECTIONS, contradictions: ['CON-01 '] }, /not a contradiction id/i, false],
  ['a question id of the wrong form', { ...SELECTIONS, questions: ['Q-01,Q-02'] }, /not a question id/i, false],
  ['a document id of the wrong form', { ...SELECTIONS, loadBearing: ['DOC-001', 'doc-002', 'DOC-003'] }, /not a document id/i, false],
  ['an id that is not a string', { ...SELECTIONS, contradictions: [1] }, /not a contradiction id/i, false],
  ['a repeated contradiction', { ...SELECTIONS, contradictions: ['CON-01', 'CON-01'] }, /CON-01.*more than once/i, false],
  ['a repeated question', { ...SELECTIONS, questions: ['Q-01', 'Q-01'] }, /Q-01.*more than once/i, false],
  ['a repeated load-bearing document', { ...SELECTIONS, loadBearing: ['DOC-001', 'DOC-002', 'DOC-001'] }, /DOC-001.*more than once/i, false],
  ['a contradiction the candidates do not have', { ...SELECTIONS, contradictions: ['CON-99'] }, /CON-99.*not in the contradiction list/i, true],
  ['a question the candidates do not have', { ...SELECTIONS, questions: ['Q-99'] }, /Q-99.*not in the question list/i, true],
  ['a document the candidates do not have', { ...SELECTIONS, loadBearing: ['DOC-001', 'DOC-002', 'DOC-099'] }, /DOC-099.*not in the document registry/i, true],
  // --- limits ---
  ['six contradictions', { ...SELECTIONS, contradictions: ids('CON', 1, 6) }, /6 contradictions.*limit is 5/i, true],
  ['thirteen questions', { ...SELECTIONS, questions: ['Q-01', 'Q-03', ...ids('Q', 10, 11)] }, /13 questions.*limit is 12/i, true],
  ['two load-bearing documents', { ...SELECTIONS, loadBearing: ['DOC-001', 'DOC-002'] }, /2 load-bearing documents.*3 to 5/i, true],
  ['six load-bearing documents', { ...SELECTIONS, loadBearing: ids('DOC', 1, 6).map((d) => d.replace('-', '-0')) }, /6 load-bearing documents.*3 to 5/i, true],
  ['no decisions (2 standing + 0 is below 3)', { ...SELECTIONS, decisions: [] }, /2 standing.*3 to 5/i, true],
  ['four decisions (2 standing + 4 is above 5)', { ...SELECTIONS, decisions: ['a?', 'b?', 'c?', 'd?'] }, /2 standing.*3 to 5/i, true],
  // --- question routes ---
  ['a pre-workshop question ticked for the page', { ...SELECTIONS, questions: ['Q-01', 'Q-02'] }, /Q-02 is emailed before the workshop, not placed on the page/, true],
  ['an interview question ticked', { ...SELECTIONS, questions: ['Q-04'] }, /Q-04 is neither in the room nor emailed/, true],
  // --- text ---
  ['an empty decision', { ...SELECTIONS, decisions: ['Who signs?', '   '] }, /decision.*empty/i, false],
  ['a decision that is not a string', { ...SELECTIONS, decisions: [7] }, /decision.*not text/i, false],
  ['a decision with a line break', { ...SELECTIONS, decisions: ['Who signs?\nAnd when?'] }, /decision.*one line/i, false],
  ['a decision with a unicode line separator', { ...SELECTIONS, decisions: ['Who signs?\u2028And when?'] }, /decision.*one line/i, false],
  ['a decision of 501 characters', { ...SELECTIONS, decisions: [long(501)] }, /decision.*500/i, false],
  ['a claim with no text', { ...SELECTIONS, claims: [{ text: ' ', docRef: 'DOC-001' }] }, /claim 1.*empty/i, false],
  ['a claim with a line break', { ...SELECTIONS, claims: [{ text: 'a\r\nb', docRef: 'DOC-001' }] }, /claim 1.*one line/i, false],
  ['a claim of 501 characters', { ...SELECTIONS, claims: [{ text: long(501), docRef: 'DOC-001' }] }, /claim 1.*500/i, false],
  ['a claim with no document', { ...SELECTIONS, claims: [{ text: 'a', docRef: '' }] }, /claim 1.*document/i, false],
  ['a claim whose document is not an id', { ...SELECTIONS, claims: [{ text: 'a', docRef: 'the RFP' }] }, /claim 1.*document/i, false],
  ['a claim citing a document that is not in the registry', { ...SELECTIONS, claims: [{ text: 'a', docRef: 'DOC-050' }] }, /claim 1.*DOC-050.*not in the document registry/i, true],
  ['an empty client name', withLogistics({ clientName: '' }), /client name.*empty/i, false],
  ['a blank date, time and place', withLogistics({ dateTimeLocation: '  ' }), /date, time and place.*empty/i, false],
  ['an empty duration', withLogistics({ duration: '' }), /duration.*empty/i, false],
  ['an empty facilitator', withLogistics({ facilitator: '' }), /facilitator.*empty/i, false],
  ['a client name with a line break', withLogistics({ clientName: 'Acme\nInc' }), /client name.*one line/i, false],
  ['a client name of 201 characters', withLogistics({ clientName: long(201) }), /client name.*200/i, false],
  ['no attendees', withLogistics({ attendees: [] }), /attendee/i, false],
  ['an attendee with no name', withLogistics({ attendees: [{ name: '', role: 'Head' }] }), /attendee 1.*name.*empty/i, false],
  ['an attendee with no role', withLogistics({ attendees: [{ name: 'Sam', role: ' ' }] }), /attendee 1.*role.*empty/i, false],
  ['an attendee name with a line break', withLogistics({ attendees: [{ name: 'Sam\nK', role: 'Head' }] }), /attendee 1.*name.*one line/i, false],
  ['an attendee role of 201 characters', withLogistics({ attendees: [{ name: 'Sam', role: long(201) }] }), /attendee 1.*role.*200/i, false],
]

describe('buildBrief refuses a selection the renderer should never have sent', () => {
  beforeEach(() => { run.mockReset() })

  it.each(REFUSALS)('%s', async (_name, selections, message, readsCandidates) => {
    const s = planStandIn(json(PLUGIN_CANDIDATES), json(PLUGIN_BUILT))
    run.mockImplementation(s.impl)

    const r = await buildBrief(PROJECT, SCRIPTS, selections)

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(message)
    expect(r.error).not.toMatch(/\r|\n/)
    expect(s.builds()).toHaveLength(0)
    expect(s.calls).toHaveLength(readsCandidates ? 1 : 0)
  })

  it('refuses to replace an existing brief until the person confirms, and starts no build', async () => {
    const s = planStandIn(json(withCandidates({ existing_brief: true })), json(PLUGIN_BUILT))
    run.mockImplementation(s.impl)
    const r = await buildBrief(PROJECT, SCRIPTS, SELECTIONS)
    expect(r).toEqual({ ok: false, error: 'A brief already exists; confirm replacing it first.' })
    expect(s.builds()).toHaveLength(0)
  })

  it('accepts exactly the edge of every limit', async () => {
    const edge = {
      ...SELECTIONS,
      contradictions: ids('CON', 1, 5),
      questions: ['Q-01', 'Q-03', ...ids('Q', 10, 10)], // 12 on the page
      loadBearing: ['DOC-001', 'DOC-002', 'DOC-003', 'DOC-004', 'DOC-005'],
      decisions: ['a?', 'b?', 'c?'], // 2 standing + 3 = 5
      claims: [{ text: long(500), docRef: 'DOC-006' }],
      logistics: { ...L, clientName: long(200), attendees: [{ name: long(200), role: long(200) }] },
    }
    const s = planStandIn(json(PLUGIN_CANDIDATES), json(PLUGIN_BUILT))
    run.mockImplementation(s.impl)
    expect((await buildBrief(PROJECT, SCRIPTS, edge)).ok).toBe(true)
    expect(s.builds()).toHaveLength(1)
  })

  it('accepts the lower edge of the ranges: 3 load-bearing documents, 1 decision on top of 2 standing, and no claims', async () => {
    const s = planStandIn(json(PLUGIN_CANDIDATES), json(PLUGIN_BUILT))
    run.mockImplementation(s.impl)
    const r = await buildBrief(PROJECT, SCRIPTS, { ...SELECTIONS, claims: [], contradictions: [], questions: [] })
    expect(r.ok).toBe(true)
  })

  it('does not take a project that is not a string, and starts nothing', async () => {
    const s = planStandIn(json(PLUGIN_CANDIDATES), json(PLUGIN_BUILT))
    run.mockImplementation(s.impl)
    expect((await buildBrief(42 as unknown as string, SCRIPTS, SELECTIONS)).ok).toBe(false)
    expect(s.calls).toHaveLength(0)
  })
})
