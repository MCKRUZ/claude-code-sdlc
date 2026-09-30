/** Spec 0017's fix pass, bug #3: the renderer's own console-entries array (`App.tsx`) had no
 * cap, unlike the main process's own log (`commandRunner.ts`'s `MAX_LOG_ENTRIES`) — and the
 * Workflow tab's live panel now feeds it a new entry roughly every 2 seconds for as long as a
 * document step is current, turning what used to be a slow leak into a fast one.
 */

import { describe, expect, it } from 'vitest'
import type { ConsoleEntry } from '../shared/types'
import { appendConsoleEntry, MAX_CONSOLE_ENTRIES } from '../src/consoleLog'

function entry(id: string): ConsoleEntry {
  return {
    id, command: 'echo', args: [], cwd: '/', startedAt: '2026-09-29T00:00:00.000Z',
    durationMs: 1, exitCode: 0, stdout: '', stderr: '', ok: true,
  }
}

describe('appendConsoleEntry', () => {
  it('appends normally under the cap', () => {
    const result = [entry('1'), entry('2')].reduce(appendConsoleEntry, [] as ConsoleEntry[])
    expect(result.map((e) => e.id)).toEqual(['1', '2'])
  })

  it('never grows past MAX_CONSOLE_ENTRIES, dropping the OLDEST entries first', () => {
    let entries: ConsoleEntry[] = []
    for (let i = 0; i < MAX_CONSOLE_ENTRIES + 250; i++) {
      entries = appendConsoleEntry(entries, entry(String(i)))
    }
    expect(entries).toHaveLength(MAX_CONSOLE_ENTRIES)
    // The most recent MAX_CONSOLE_ENTRIES survive — proves it trims from the front, not the back.
    expect(entries[0].id).toBe(String(250))
    expect(entries.at(-1)!.id).toBe(String(MAX_CONSOLE_ENTRIES + 250 - 1))
  })

  it('simulating a long session\'s worth of ~2s polling entries never exceeds the cap', () => {
    // The exact scenario bug #3 names: a session left on the Workflow tab, polling once every
    // ~2s, for far longer than MAX_CONSOLE_ENTRIES * 2 seconds.
    let entries: ConsoleEntry[] = []
    const pollCount = MAX_CONSOLE_ENTRIES * 3
    for (let i = 0; i < pollCount; i++) entries = appendConsoleEntry(entries, entry(`poll-${i}`))
    expect(entries.length).toBeLessThanOrEqual(MAX_CONSOLE_ENTRIES)
  })
})
