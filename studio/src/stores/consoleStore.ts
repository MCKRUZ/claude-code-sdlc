// The renderer's console log as a module store (studio-observatory.md §7 Frame row, §9 "Shell
// re-renders"). Before this, `App` held the entries in `useState` and passed them down through
// `Frame`, so every entry `onConsoleEntry` delivered re-rendered the whole shell — Sidebar, the
// open screen and ChatPanel — roughly every 2 s on the Workflow tab and every 150 ms while a
// command streamed. Now only the `Console` panel (and whoever else explicitly subscribes) reads
// the entries; the rest of the shell never sees them change. `test/frame.memo.test.tsx` pins that.
//
// No IPC here: `App` still owns the `window.studio.onConsoleEntry` subscription and pushes into
// this store, so the renderer's set of `window.studio.*` call sites does not grow.
import { useSyncExternalStore } from 'react'
import type { ConsoleEntry } from '../../shared/types'
import type { ConsoleSnapshot, ConsoleStore } from './contract'
import { appendConsoleEntry } from '../consoleLog'

const EMPTY: readonly ConsoleEntry[] = Object.freeze([])

let snapshot: ConsoleSnapshot = { entries: EMPTY, open: false, mode: 'plain' }
const listeners = new Set<() => void>()

function publish(next: ConsoleSnapshot) {
  snapshot = next
  for (const listener of listeners) listener()
}

/** `appendConsoleEntry` is the single definition of the cap (500) and of replace-by-id — a
 * streaming command's interim broadcasts share one id with its finished entry and must replace
 * their own row rather than pile up. Reused rather than re-implemented so the two cannot drift. */
function append(entry: ConsoleEntry) {
  const entries = appendConsoleEntry(snapshot.entries as ConsoleEntry[], entry)
  publish({ ...snapshot, entries })
}

function replaceAll(entries: ConsoleEntry[]) {
  // The initial `getConsoleLog()` result can exceed the cap only if the main process's own cap
  // ever disagrees with ours; trimming here keeps the renderer honest about its own number.
  const capped = entries.reduce<ConsoleEntry[]>((acc, e) => appendConsoleEntry(acc, e), [])
  publish({ ...snapshot, entries: capped })
}

function setOpen(open: boolean) {
  if (open === snapshot.open) return
  publish({ ...snapshot, open })
}

function toggle() {
  publish({ ...snapshot, open: !snapshot.open })
}

function setMode(mode: ConsoleSnapshot['mode']) {
  if (mode === snapshot.mode) return
  publish({ ...snapshot, mode })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function getSnapshot(): ConsoleSnapshot {
  return snapshot
}

export const consoleStore: ConsoleStore = {
  getSnapshot,
  subscribe,
  append,
  replaceAll,
  setOpen,
  toggle,
  setMode,
}

/** Test-only reset so one file's entries never leak into the next test's assertions. Not used by
 * the app; the store lives as long as the window does. */
export function resetConsoleStore() {
  publish({ entries: EMPTY, open: false, mode: 'plain' })
}

/** The whole snapshot; a component that only needs one field should pick it below so a change to
 * another field does not re-render it. `getSnapshot` returns the same reference until something
 * changed, which is what `useSyncExternalStore` needs to skip a render. */
export function useConsoleStore(): ConsoleSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useConsoleEntries(): readonly ConsoleEntry[] {
  return useSyncExternalStore(subscribe, () => snapshot.entries, () => snapshot.entries)
}

export function useConsoleOpen(): boolean {
  return useSyncExternalStore(subscribe, () => snapshot.open, () => snapshot.open)
}
