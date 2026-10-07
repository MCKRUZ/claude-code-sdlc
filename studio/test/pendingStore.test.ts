// @vitest-environment jsdom
/** Truthful pending states (Q4): a write is `sending` with its argv, then the plugin's answer
 * verbatim, then — exit 0 only — `rereading` until the host's refreshed read settles it. The
 * store never holds a next state of any card; the toast follows the same three words. */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  answerPending, beginPending, pendingStore, pendingText, resetPendingStore, settlePending, settleReread, targetOf, trackVerb,
  usePendingVerb, usePendingVerbs,
} from '../src/stores/pendingStore'
import { REREADING, SENDING } from '../src/stores/toastWording'
import { clearToasts, getSnapshot as toasts } from '../src/ui/toastStore'
import { EXIT_HEADING } from '../shared/reasons'

const ARGV = 'Run: sprint.py verdict --spec 0002 --lane eng --verdict accepted --by @arjun'
beforeEach(() => { resetPendingStore(); clearToasts() })
afterEach(() => { resetPendingStore(); clearToasts() })

describe('the lifecycle', () => {
  it('sending → answered(0) is rereading → settled; the record says only what each phase allows', () => {
    const key = beginPending('verdict', ARGV, { spec: '0002' })
    let [p] = pendingStore.getSnapshot()
    expect(p).toMatchObject({ verb: 'verdict', argvLine: ARGV, target: { spec: '0002' }, phase: 'sending', answer: null })
    expect(pendingText(p)).toBe(SENDING)
    answerPending(key, { exitCode: 0, stdout: 'Recorded: eng verdict accepted on 0002', stderr: '' })
    ;[p] = pendingStore.getSnapshot()
    expect(p.phase).toBe('rereading')
    expect(p.answer).toEqual({ exitCode: 0, heading: EXIT_HEADING[0], line: 'Recorded: eng verdict accepted on 0002' })
    expect(pendingText(p)).toBe(REREADING)
    settleReread()
    expect(pendingStore.getSnapshot()).toEqual([])
  })
  it('a non-zero answer stays `answered` with the plugin\'s words until settled explicitly', () => {
    const key = beginPending('handoff', ARGV, { spec: '0006' })
    answerPending(key, { exitCode: 2, stdout: '', stderr: 'REFUSED: --by must name a person' })
    const [p] = pendingStore.getSnapshot()
    expect(p.phase).toBe('answered')
    expect(pendingText(p)).toBe(`${EXIT_HEADING[2]} — REFUSED: --by must name a person`)
    settleReread()
    expect(pendingStore.getSnapshot()).toHaveLength(1)
    settlePending(key)
    expect(pendingStore.getSnapshot()).toEqual([])
  })
  it('holds no next state: the record has no field for a lane, a chip, a count or a card position', () => {
    beginPending('ack', ARGV, { spec: '0006' })
    const keys = Object.keys(pendingStore.getSnapshot()[0]).sort()
    expect(keys).toEqual(['answer', 'argvLine', 'key', 'phase', 'startedAt', 'target', 'verb'])
  })
})

describe('the toast follows the phases', () => {
  it('sticky "sending" → sticky re-reading on exit 0 → the plugin\'s Done line, no longer sticky, on settle', () => {
    const key = beginPending('verdict', ARGV, { spec: '0002' })
    expect(toasts()).toHaveLength(1)
    expect(toasts()[0]).toMatchObject({ title: SENDING, detail: ARGV, sticky: true })
    answerPending(key, { exitCode: 0, stdout: 'Recorded.', stderr: '' })
    expect(toasts()).toHaveLength(1)
    expect(toasts()[0]).toMatchObject({ title: REREADING, sticky: true })
    settlePending(key)
    expect(toasts()).toHaveLength(1)
    expect(toasts()[0]).toMatchObject({ tone: 'ok', title: EXIT_HEADING[0], detail: 'Recorded.', sticky: false })
  })
  it('a refusal replaces the sending toast with the plugin\'s words, sticky; settling removes it', () => {
    const key = beginPending('verdict', ARGV, { spec: '0002' })
    answerPending(key, { exitCode: 1, stdout: '', stderr: 'spec 0002 is not slated' })
    expect(toasts()[0]).toMatchObject({ tone: 'warn', title: EXIT_HEADING[1], detail: 'spec 0002 is not slated', sticky: true })
    settlePending(key)
    expect(toasts()).toEqual([])
  })
  it('withToast=false shows nothing', () => {
    beginPending('ack', ARGV, { spec: '0006' }, false)
    expect(toasts()).toEqual([])
  })
})

describe('targetOf', () => {
  it('a spec verb is about its spec; slate about its first spec and sprint; a sprint verb about the sprint', () => {
    expect(targetOf({ verb: 'verdict', spec: '0002', lane: 'eng', verdict: 'accepted' })).toEqual({ spec: '0002' })
    expect(targetOf({ verb: 'slate', sprint: 'S08', specs: ['0005', '0006'] })).toEqual({ spec: '0005', sprint: 'S08' })
    expect(targetOf({ verb: 'ready', sprint: 'S08' })).toEqual({ sprint: 'S08' })
  })
})

describe('the hooks', () => {
  it('usePendingVerb(target) sees the write out on that spec and nothing else; no target → the latest', () => {
    const { result } = renderHook(() => ({ mine: usePendingVerb('0002'), other: usePendingVerb({ spec: '0009' }), latest: usePendingVerb(), all: usePendingVerbs() }))
    expect(result.current.mine).toBeNull()
    act(() => { beginPending('verdict', ARGV, { spec: '0002' }, false) })
    expect(result.current.mine?.phase).toBe('sending')
    expect(result.current.other).toBeNull()
    expect(result.current.latest?.target).toEqual({ spec: '0002' })
    expect(result.current.all).toHaveLength(1)
  })
})

describe('trackVerb', () => {
  it('wraps a run: the result comes back untouched and the record reflects the answer', async () => {
    const { key, result } = await trackVerb('ack', ARGV, { spec: '0006' }, async () => ({ exitCode: 0, stdout: 'Acknowledged: 0006', stderr: '', ok: true }), false)
    expect(result.ok).toBe(true)
    expect(pendingStore.getSnapshot().find((p) => p.key === key)?.phase).toBe('rereading')
  })
  it('a thrown run is recorded as Studio\'s own "Not run" and rethrown — never shown as the plugin\'s answer', async () => {
    await expect(trackVerb('ack', ARGV, { spec: '0006' }, async () => { throw new Error('bridge missing') }, false)).rejects.toThrow('bridge missing')
    const [p] = pendingStore.getSnapshot()
    expect(p.answer).toEqual({ exitCode: null, heading: 'Not run', line: 'bridge missing' })
  })
})
