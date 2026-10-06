/** The closed argv table (togo-command-center.md §2.4, §7 P0 acceptance): one golden argv per
 * verb, bad ids rejected, `--field` never present, the actor appended as `--by` by the table
 * and never by the caller. Pure — nothing is spawned. */
import { describe, expect, it } from 'vitest'
import type { SprintVerbRequest } from '../shared/types'
import {
  BY_FLAG, buildSprintVerbArgv, describeArgv, SPEC_ID, validateSprintVerbRequest, VERB_CAPABILITY, WRITE_VERBS,
} from '../shared/sprintVerbArgv'

const ACTOR = '@arjun'
const BOARD = ['0001', '0002', '0006']

function argv(req: SprintVerbRequest, actor = ACTOR, board?: readonly string[]): string[] {
  const r = buildSprintVerbArgv(req, actor, board)
  if (!r.ok) throw new Error(r.errors.join('; '))
  return r.argv
}

describe('golden argv per verb', () => {
  const GOLDEN: Array<[SprintVerbRequest, string[]]> = [
    [{ verb: 'slate', sprint: 'S08', specs: ['0001', '0002'] }, ['slate', '--sprint', 'S08', '--spec', '0001', '--spec', '0002', '--by', ACTOR]],
    [{ verb: 'slate', sprint: 'S08', specs: ['0006'], override: true, reason: 'one more fits' }, ['slate', '--sprint', 'S08', '--spec', '0006', '--override', '--reason', 'one more fits', '--by', ACTOR]],
    [{ verb: 'unslate', spec: '0002', reason: 'blocked on vendor' }, ['unslate', '--spec', '0002', '--reason', 'blocked on vendor', '--by', ACTOR]],
    [{ verb: 'handoff', spec: '0006', to: '@sam' }, ['handoff', '--spec', '0006', '--to', '@sam', '--by', ACTOR]],
    [{ verb: 'handoff', spec: '0006', to: '@sam', note: 'please check the 409 path' }, ['handoff', '--spec', '0006', '--to', '@sam', '--note', 'please check the 409 path', '--by', ACTOR]],
    [{ verb: 'ack', spec: '0006' }, ['ack', '--spec', '0006', '--by', ACTOR]],
    [{ verb: 'verdict', spec: '0002', lane: 'eng', verdict: 'accepted' }, ['verdict', '--spec', '0002', '--lane', 'eng', '--verdict', 'accepted', '--by', ACTOR]],
    [{ verb: 'verdict', spec: '0002', lane: 'data', verdict: 'n-a', reason: 'no data surface' }, ['verdict', '--spec', '0002', '--lane', 'data', '--verdict', 'n-a', '--reason', 'no data surface', '--by', ACTOR]],
    [{ verb: 'ready', sprint: 'S08' }, ['ready', '--sprint', 'S08', '--by', ACTOR]],
    [{ verb: 'close', sprint: 'S08', carryTo: 'S09', carry: { '0002': 'review not finished' }, drop: { '0006': 'descoped' } },
      ['close', '--sprint', 'S08', '--carry-to', 'S09', '--carry', '0002=review not finished', '--drop', '0006=descoped', '--by', ACTOR]],
    [{ verb: 'close', sprint: 'S08', carry: {}, drop: {} }, ['close', '--sprint', 'S08', '--by', ACTOR]],
    [{ verb: 'new', sprint: 'S09', goal: 'Adjusters file without a phone call', start: '2026-10-13', days: 10, target: 3, mix: 'HIGH:1,MEDIUM:2' },
      ['new', '--sprint', 'S09', '--goal', 'Adjusters file without a phone call', '--start', '2026-10-13', '--days', '10', '--target', '3', '--mix', 'HIGH:1,MEDIUM:2', '--by', ACTOR]],
    [{ verb: 'new', sprint: 'S09', goal: 'g', start: '2026-10-13', end: '2026-10-24', target: 0, boardRef: 'build-board.md' },
      ['new', '--sprint', 'S09', '--goal', 'g', '--start', '2026-10-13', '--end', '2026-10-24', '--target', '0', '--board-ref', 'build-board.md', '--by', ACTOR]],
    [{ verb: 'carry', spec: '0002', to: 'S09', reason: 'vendor API slipped' }, ['carry', '--spec', '0002', '--to', 'S09', '--reason', 'vendor API slipped', '--by', ACTOR]],
    [{ verb: 'edit', sprint: 'S08', goal: 'A sharper goal' }, ['edit', '--sprint', 'S08', '--goal', 'A sharper goal', '--by', ACTOR]],
  ]

  it.each(GOLDEN)('%j', (req, expected) => {
    expect(argv(req, ACTOR, BOARD)).toEqual(expected)
  })

  it('covers every write verb, and every verb names the capability it needs', () => {
    const verbs = new Set(GOLDEN.map(([req]) => req.verb))
    for (const v of WRITE_VERBS) expect(verbs.has(v), v).toBe(true)
    for (const v of WRITE_VERBS) expect(VERB_CAPABILITY[v], v).toMatch(/^sprint-(write|carry|edit)$/)
  })

  it('always ends with --by <actor> and never contains --field', () => {
    for (const [req] of GOLDEN) {
      const a = argv(req, ACTOR, BOARD)
      expect(a.slice(-2)).toEqual([BY_FLAG, ACTOR])
      expect(a).not.toContain('--field')
      expect(a.filter((x) => x === BY_FLAG)).toHaveLength(1)
    }
  })
})

describe('refusals before any spawn — shape only, never a judgement', () => {
  it('rejects a spec id that is not four digits, and one not on the board when a board is given', () => {
    expect(validateSprintVerbRequest({ verb: 'ack', spec: '6' })).toEqual(["spec '6' is not a spec id (expected four digits)"])
    expect(validateSprintVerbRequest({ verb: 'ack', spec: '0006; rm -rf' })).toHaveLength(1)
    expect(validateSprintVerbRequest({ verb: 'ack', spec: '0099' }, BOARD)).toEqual(["spec '0099' is not on the board"])
    expect(validateSprintVerbRequest({ verb: 'ack', spec: '0006' }, BOARD)).toEqual([])
    expect(SPEC_ID.test('0006')).toBe(true)
    expect(SPEC_ID.test('00061')).toBe(false)
  })

  it('rejects a sprint id the plugin would not accept', () => {
    expect(validateSprintVerbRequest({ verb: 'ready', sprint: 's8' })).toEqual(["sprint 's8' is not a sprint id (expected S07, S12, ...)"])
    expect(validateSprintVerbRequest({ verb: 'carry', spec: '0002', to: 'next', reason: 'r' })).toEqual(["to 'next' is not a sprint id (expected S07, S12, ...)"])
  })

  it('mirrors the plugin\'s n-a rule so the dialog can show the reason field: data lane only, reason required', () => {
    expect(validateSprintVerbRequest({ verb: 'verdict', spec: '0002', lane: 'eng', verdict: 'n-a', reason: 'x' })).toEqual(['n-a is a data-lane verdict only'])
    expect(validateSprintVerbRequest({ verb: 'verdict', spec: '0002', lane: 'data', verdict: 'n-a' })).toEqual(['n-a needs a reason'])
    expect(validateSprintVerbRequest({ verb: 'verdict', spec: '0002', lane: 'data', verdict: 'accepted' })).toEqual([])
  })

  it('requires the reasons the plugin requires, an override reason, and a carry-to when carrying', () => {
    expect(validateSprintVerbRequest({ verb: 'unslate', spec: '0002', reason: '  ' })).toEqual(['reason is required'])
    expect(validateSprintVerbRequest({ verb: 'slate', sprint: 'S08', specs: ['0001'], override: true })).toEqual(['an override needs a reason'])
    expect(validateSprintVerbRequest({ verb: 'slate', sprint: 'S08', specs: [] })).toEqual(['at least one spec is required'])
    expect(validateSprintVerbRequest({ verb: 'close', sprint: 'S08', carry: { '0002': 'r' }, drop: {} })).toEqual(['carrying a spec needs --carry-to'])
    expect(validateSprintVerbRequest({ verb: 'new', sprint: 'S09', goal: 'g', start: 'd', end: 'e', days: 10, target: 1 })).toEqual(['give end or days, not both'])
  })

  it('refuses with no actor — the renderer never fills --by, and the table never spawns without one', () => {
    const r = buildSprintVerbArgv({ verb: 'ack', spec: '0006' }, '')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors).toEqual(['no actor'])
  })
})

describe('describeArgv', () => {
  it('is the palette row and the dialog preview, one spelling', () => {
    expect(describeArgv(argv({ verb: 'verdict', spec: '0002', lane: 'eng', verdict: 'accepted' })))
      .toBe('Run: sprint.py verdict --spec 0002 --lane eng --verdict accepted --by @arjun')
    expect(describeArgv(['edit', '--sprint', 'S08', '--goal', 'two words', '--by', ACTOR]))
      .toBe('Run: sprint.py edit --sprint S08 --goal "two words" --by @arjun')
  })
})
