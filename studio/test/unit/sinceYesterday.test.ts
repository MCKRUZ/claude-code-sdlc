/** `sinceYesterday` (togo-command-center.md §2.3): ledger events verbatim plus PRs merged in the
 * window, each tagged by origin, newest first by the source's timestamp, undated rows last and
 * labelled. The window is a filter date main passes as `--since`, never a reported number. */
import { describe, expect, it } from 'vitest'
import { sinceDateFor, sinceYesterday } from '../../electron/main/commandCenter'
import { UNDATED } from '../../shared/reasons'
import type { BoardRow, SourcedBlock, SprintLogView } from '../../shared/types'

const block = <T>(source: string, data: T | null): SourcedBlock<T> => ({ source, fetchedAt: 't', ok: data !== null, data, error: data === null ? 'no' : null })
const row = (spec: string, mergedAt: string | null): BoardRow => ({
  spec, name: 'a', path: `specs/${spec}-a.md`, title: '', status: 'merged', risk: 'LOW', team: '', channel: '', owner: '', developer: '', checker: '', branch: '',
  sprint: 'S08', nextOwner: '', engReview: '', dataReview: '', dependsOn: [],
  pullRequest: { number: Number(spec), url: 'u', state: 'MERGED', mergedAt, updatedAt: null, waitingOn: 'merged', waitingOnHandle: null },
})
const log = (events: SprintLogView['events']): SprintLogView => ({ events, count: events.length, since: '2026-10-05', path: 'p', exists: true, skipped: 0 })

describe('sinceDateFor', () => {
  it('counts business days back, skipping the weekend', () => {
    expect(sinceDateFor(1, new Date(2026, 9, 6))).toBe('2026-10-05')   // Tue → Mon
    expect(sinceDateFor(1, new Date(2026, 9, 5))).toBe('2026-10-02')   // Mon → Fri
    expect(sinceDateFor(3, new Date(2026, 9, 6))).toBe('2026-10-01')   // Tue → Thu last week
  })
})

describe('sinceYesterday', () => {
  const events = [
    // The plugin's ledger key is `ts` (sprint_model.make_event); a `timestamp` line is read too.
    { ts: '2026-10-05T09:00:00+00:00', event: 'slated', spec: '0007', sprint: 'S08', by: '@priya-n' },
    { event: 'ack', spec: '0003', by: '@sam-k' },
    { timestamp: '2026-10-06T08:30:00+00:00', event: 'verdict', spec: '0007', lane: 'eng', verdict: 'accepted', by: '@matt' },
  ]
  const board = { rows: [row('0001', '2026-10-05T17:00:00Z'), row('0002', '2026-09-20T10:00:00Z'), row('0003', null)], codeHostAvailable: true, error: null, teamLimits: null, warnings: [] }

  it('orders newest first by the source timestamp, undated last and labelled', () => {
    const rows = sinceYesterday({ log: block('sprint.py log --since 2026-10-05 --json', log(events)), board: block('b', board), since: '2026-10-05' })
    expect(rows.map((r) => `${r.origin}:${r.event}:${r.spec}`)).toEqual(['log:verdict:0007', 'board:merged:0001', 'log:slated:0007', 'log:ack:0003'])
    expect(rows[3].at).toBeNull(); expect(rows[3].text).toContain(UNDATED)
    expect(rows.slice(0, 3).every((r) => !r.text.includes(UNDATED))).toBe(true)
  })

  it('keeps the ledger line verbatim in raw and keys a row by timestamp+event+spec', () => {
    const rows = sinceYesterday({ log: block('l', log(events)), board: block('b', board), since: '2026-10-05' })
    const verdict = rows.find((r) => r.event === 'verdict')!
    expect(verdict.raw).toEqual(events[2]); expect(verdict.key).toBe('2026-10-06T08:30:00+00:00+verdict+0007'); expect(verdict.by).toBe('@matt')
  })

  it('a PR merged before the window is not in the stream; a PR without mergedAt never is', () => {
    const rows = sinceYesterday({ log: block('l', log([])), board: block('b', board), since: '2026-10-05' })
    expect(rows.map((r) => r.spec)).toEqual(['0001']); expect(rows[0]).toMatchObject({ origin: 'board', text: 'PR #1 merged', at: '2026-10-05T17:00:00Z' })
  })

  it('a log block that failed (older plugin) leaves the board\'s merged rows alone', () => {
    const rows = sinceYesterday({ log: block('l', null), board: block('b', board), since: '2026-10-05' })
    expect(rows).toHaveLength(1); expect(rows[0].origin).toBe('board')
  })

  it('no aggregate: the result is rows, nothing counted', () => {
    expect(Array.isArray(sinceYesterday({ log: block('l', log(events)), board: block('b', null), since: '2026-10-05' }))).toBe(true)
  })
})
