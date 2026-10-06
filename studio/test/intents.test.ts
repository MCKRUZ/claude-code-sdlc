/** The omnibar's grammar (togo-command-center.md §3.6, §7 P4: ≥ 25 phrases incl. misses). The
 * parser resolves ids and names ONLY against the rows and roster it is handed; a verb row's title
 * is the exact `describeArgv` line; a match never spawns — `run()` hands the intent to the host. */
import { describe, expect, it, vi } from 'vitest'
import { intentEntries, parseIntent, type IntentContext } from '../src/palette/intents'
import { newerPlugin } from '../shared/reasons'

const CTX: IntentContext = {
  rows: [
    { spec: '0001', status: 'ready', sprint: 'S08', path: 'specs/0001-a.md' },
    { spec: '0002', status: 'draft', sprint: 'S08', path: 'specs/0002-b.md' },
    { spec: '0005', status: 'ready', sprint: '', path: 'specs/0005-e.md' },
    { spec: '0006', status: 'in-flight', sprint: 'S08', path: 'specs/0006-f.md' },
  ],
  roster: [{ handle: '@sam-k', name: 'Sam K' }, { handle: '@priya-n', name: 'Priya N' }],
  activeSprint: 'S08',
  sprintIds: ['S07', 'S08', 'S09'],
  capabilities: ['sprint-status', 'sprint-write', 'sprint-carry', 'confirm-tier'],
  actor: '@arjun',
}

const kind = (text: string, ctx = CTX) => parseIntent(text, ctx)?.intent.kind ?? null
const title = (text: string, ctx = CTX) => parseIntent(text, ctx)?.title ?? null
const request = (text: string, ctx = CTX) => { const m = parseIntent(text, ctx); return m?.intent.kind === 'sprint' ? m.intent.request : null }

describe('parseIntent: the grammar, phrase by phrase', () => {
  it('verdict → sprint.py verdict with the lane defaulting to eng, the reason after "because"', () => {
    expect(title('verdict 0002 accepted')).toBe('Run: sprint.py verdict --spec 0002 --lane eng --verdict accepted --by @arjun')
    expect(request('verdict 0002 returned data because flaky fixture')).toEqual({ verb: 'verdict', spec: '0002', lane: 'data', verdict: 'returned', reason: 'flaky fixture' })
    expect(request('VERDICT 0002 n-a data because no data touched')).toMatchObject({ verdict: 'n-a', lane: 'data' })
    expect(request('verdict 0002 na eng')).toMatchObject({ verdict: 'n-a', lane: 'eng' })
    expect(request('verdict 0002 pending')).toMatchObject({ verdict: 'pending' })
  })

  it('hand NNNN to NAME resolves the person against the roster; a stranger is a gap, not a guess', () => {
    const sam = parseIntent('hand 0006 to Sam', CTX)!
    expect(sam.intent).toMatchObject({ kind: 'sprint', request: { verb: 'handoff', spec: '0006', to: '@sam-k' }, recipient: { handle: '@sam-k' } })
    expect(sam.title).toBe('Run: sprint.py handoff --spec 0006 --to @sam-k --by @arjun')
    expect(request('hand off 0006 to @PRIYA-N note after the fixture lands')).toEqual({ verb: 'handoff', spec: '0006', to: '@priya-n', note: 'after the fixture lands' })
    const stranger = parseIntent('hand 0006 to Zed', CTX)!
    expect(stranger.intent).toMatchObject({ kind: 'sprint', recipient: { handle: null, unresolved: 'Zed' } })
    expect(stranger.subtitle).toContain('not on the roster')
    // What IS known of the line previews; the gap is a placeholder, never a guess.
    expect(stranger.title).toBe('Run: sprint.py handoff --spec 0006 --to <to?> --by @arjun')
  })

  it('ack · unslate · defer-to (carry) · defer (leave Build)', () => {
    expect(request('ack 0006')).toEqual({ verb: 'ack', spec: '0006' })
    expect(request('unslate 0002 because scope moved')).toEqual({ verb: 'unslate', spec: '0002', reason: 'scope moved' })
    expect(request('defer 0002 to s09 because blocked on DL-03')).toEqual({ verb: 'carry', spec: '0002', to: 'S09', reason: 'blocked on DL-03' })
    expect(parseIntent('defer 0002 because the upstream slipped', CTX)!.intent).toEqual({ kind: 'defer', spec: '0002', path: 'specs/0002-b.md', reason: 'the upstream slipped' })
  })

  it('pull: slated + READY hands off; slated draft says not READY; unslated adds to the slate first', () => {
    expect(parseIntent('pull 0001', CTX)!.intent).toEqual({ kind: 'pull', spec: '0001', path: 'specs/0001-a.md', slated: true, ready: true, sprint: 'S08' })
    expect(title('pull 0001')).toContain('hand it off')
    expect(title('pull 0002')).toContain('not READY')
    expect(parseIntent('pull 0005', CTX)!.intent).toMatchObject({ kind: 'pull', slated: false, ready: true })
    expect(title('pull 0005')).toContain('add it to the slate')
  })

  it('decide · decision · confirm tier · ready · close · new sprint', () => {
    expect(parseIntent('decide dl-04 fail closed', CTX)!.intent).toEqual({ kind: 'decide', id: 'DL-04', resolution: 'fail closed' })
    expect(parseIntent('decision Fail open or closed?', CTX)!.intent).toEqual({ kind: 'decision', text: 'Fail open or closed?' })
    expect(parseIntent('confirm tier 0001', CTX)!.intent).toEqual({ kind: 'confirm-tier', spec: '0001', path: 'specs/0001-a.md' })
    expect(request('ready S08')).toEqual({ verb: 'ready', sprint: 'S08' })
    expect(parseIntent('close s08', CTX)!.intent).toEqual({ kind: 'close', sprint: 'S08' })
    expect(kind('new sprint')).toBe('new-sprint')
    expect(kind('  New   Sprint ')).toBe('new-sprint')
  })

  it('misses: an id not on the board, a sprint the plugin never listed, a verb with no object, nonsense, a prefix', () => {
    expect(parseIntent('verdict 0003 accepted', CTX)).toBeNull()
    expect(parseIntent('pull 9999', CTX)).toBeNull()
    expect(parseIntent('ack 0001 please', CTX)).toBeNull()
    expect(parseIntent('verdict 0001 maybe', CTX)).toBeNull()
    expect(parseIntent('defer 0001', CTX)).toBeNull()
    expect(parseIntent('ready S1', CTX)).toBeNull()
    expect(parseIntent('close S99', CTX)).toBeNull()
    expect(parseIntent('hand 0006', CTX)).toBeNull()
    expect(parseIntent('decide DL04 x', CTX)).toBeNull()
    expect(parseIntent('open the board', CTX)).toBeNull()
    expect(parseIntent('', CTX)).toBeNull()
    expect(intentEntries('>verdict 0002 accepted', CTX, vi.fn())).toEqual([])
    expect(intentEntries('#0002', CTX, vi.fn())).toEqual([])
  })

  it('an unknown sprint list accepts any well-formed id; an unknown actor previews <you>', () => {
    const noList = { ...CTX, sprintIds: [], actor: null }
    expect(request('ready S42', noList)).toEqual({ verb: 'ready', sprint: 'S42' })
    expect(title('ack 0006', noList)).toBe('Run: sprint.py ack --spec 0006 --by <you>')
  })

  it('a plugin that lacks the verb\'s capability keeps the row and names the gap; unknown capabilities disable nothing', () => {
    const old = { ...CTX, capabilities: ['sprint-status'] }
    expect(parseIntent('verdict 0002 accepted', old)!.disabledReason).toBe(newerPlugin('sprint-write'))
    expect(parseIntent('defer 0002 to S09 because x', old)!.disabledReason).toBe(newerPlugin('sprint-carry'))
    expect(parseIntent('confirm tier 0001', old)!.disabledReason).toBe(newerPlugin('confirm-tier'))
    expect(parseIntent('pull 0005', old)!.disabledReason).toBe(newerPlugin('sprint-write'))
    expect(parseIntent('pull 0001', old)!.disabledReason).toBeUndefined()
    expect(parseIntent('verdict 0002 accepted', { ...CTX, capabilities: null })!.disabledReason).toBeUndefined()
  })
})

describe('intentEntries: one row in the verbs group that opens the dialog and spawns nothing', () => {
  it('returns the match as the first-group row; run() hands the match to the host', () => {
    const onIntent = vi.fn()
    const rows = intentEntries('verdict 0002 accepted', CTX, onIntent)
    expect(rows).toHaveLength(1)
    expect(rows[0].group).toBe('verbs')
    expect(rows[0].title).toBe('Run: sprint.py verdict --spec 0002 --lane eng --verdict accepted --by @arjun')
    rows[0].run()
    expect(onIntent).toHaveBeenCalledWith(expect.objectContaining({ intent: expect.objectContaining({ kind: 'sprint' }) }))
    expect(intentEntries('nothing here', CTX, onIntent)).toEqual([])
    // The disabled reason rides the subtitle so the row says why before the dialog opens.
    const gated = intentEntries('new sprint', { ...CTX, capabilities: [] }, onIntent)
    expect(gated[0].subtitle).toContain(newerPlugin('sprint-write'))
  })
})
