// The console store (studio-observatory.md §7 Frame row): the renderer's copy of the console log,
// moved out of App's state so a new entry re-renders only the Console panel. These tests pin the
// two facts the shell relies on — the cap matches `consoleLog.ts`'s 500 and a streaming command's
// interim entry replaces its own row by id — plus the subscribe / notify contract
// `useSyncExternalStore` depends on (same reference until a change; one notify per change).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConsoleEntry } from '../../shared/types'
import { MAX_CONSOLE_ENTRIES } from '../../src/consoleLog'
import { consoleStore, resetConsoleStore } from '../../src/stores/consoleStore'

function entry(id: string, overrides: Partial<ConsoleEntry> = {}): ConsoleEntry {
  return {
    id,
    command: 'uv run x',
    args: [],
    cwd: '/p',
    startedAt: '2026-10-05T00:00:00Z',
    durationMs: 1000,
    exitCode: 0,
    stdout: '',
    stderr: '',
    ok: true,
    ...overrides,
  }
}

beforeEach(() => {
  resetConsoleStore()
})

describe('consoleStore', () => {
  it('starts empty, closed, and in plain mode', () => {
    const snap = consoleStore.getSnapshot()
    expect(snap.entries).toEqual([])
    expect(snap.open).toBe(false)
    expect(snap.mode).toBe('plain')
  })

  it('appends in arrival order and keeps the same reference until something changes', () => {
    const before = consoleStore.getSnapshot()
    expect(consoleStore.getSnapshot()).toBe(before)
    consoleStore.append(entry('a'))
    consoleStore.append(entry('b'))
    const after = consoleStore.getSnapshot()
    expect(after).not.toBe(before)
    expect(after.entries.map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('replaces an entry with the same id in place (a streaming command is one row)', () => {
    consoleStore.append(entry('a'))
    consoleStore.append(entry('b', { stdout: 'pending' }))
    consoleStore.append(entry('c'))
    consoleStore.append(entry('b', { stdout: 'done' }))
    const ids = consoleStore.getSnapshot().entries.map((e) => e.id)
    expect(ids).toEqual(['a', 'b', 'c'])
    expect(consoleStore.getSnapshot().entries[1].stdout).toBe('done')
  })

  it(`caps at ${MAX_CONSOLE_ENTRIES}, dropping the oldest first`, () => {
    for (let i = 0; i < MAX_CONSOLE_ENTRIES + 25; i++) consoleStore.append(entry(`e${i}`))
    const entries = consoleStore.getSnapshot().entries
    expect(entries).toHaveLength(MAX_CONSOLE_ENTRIES)
    expect(entries[0].id).toBe('e25')
    expect(entries[entries.length - 1].id).toBe(`e${MAX_CONSOLE_ENTRIES + 24}`)
  })

  it('replaceAll takes the initial getConsoleLog() result, still capped', () => {
    const many = Array.from({ length: MAX_CONSOLE_ENTRIES + 3 }, (_, i) => entry(`r${i}`))
    consoleStore.replaceAll(many)
    expect(consoleStore.getSnapshot().entries).toHaveLength(MAX_CONSOLE_ENTRIES)
    expect(consoleStore.getSnapshot().entries[0].id).toBe('r3')
  })

  it('notifies each subscriber once per change and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = consoleStore.subscribe(listener)
    consoleStore.append(entry('a'))
    consoleStore.toggle()
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    consoleStore.append(entry('b'))
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('open / mode are the panel UI state; setting the same value again does not notify', () => {
    const listener = vi.fn()
    consoleStore.subscribe(listener)
    consoleStore.setOpen(true)
    consoleStore.setOpen(true)
    consoleStore.setMode('technical')
    consoleStore.setMode('technical')
    expect(consoleStore.getSnapshot().open).toBe(true)
    expect(consoleStore.getSnapshot().mode).toBe('technical')
    expect(listener).toHaveBeenCalledTimes(2)
    consoleStore.toggle()
    expect(consoleStore.getSnapshot().open).toBe(false)
  })

  it('an entries change does not touch the open flag (the two are independent fields)', () => {
    consoleStore.setOpen(true)
    consoleStore.append(entry('a'))
    expect(consoleStore.getSnapshot().open).toBe(true)
  })
})
