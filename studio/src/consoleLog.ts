import type { ConsoleEntry } from '../shared/types'

/** The renderer's own copy of the console log needs the same cap the main process's log
 * already has (`commandRunner.ts`'s `MAX_LOG_ENTRIES`) — spec 0017's fix pass, bug #3.
 *
 * Before this, `App.tsx` appended every entry `onConsoleEntry` ever delivered with no limit at
 * all. That was a slow leak even before spec 0017: a long session opening documents accumulates
 * entries. Spec 0017 made it a live one — the Workflow tab's live panel now calls
 * `openDocument()` roughly every 2 seconds for as long as the current step has a document to
 * poll, so a session left open on that tab feeds this array indefinitely. Not the SAME array as
 * the main process's (this one cannot import `commandRunner.ts` — that pulls in
 * `node:child_process`, which has no place in the renderer bundle), so the number is repeated
 * here rather than shared, deliberately kept equal to it. */
export const MAX_CONSOLE_ENTRIES = 500

/** Appends one entry, keeping only the most recent `MAX_CONSOLE_ENTRIES` — oldest entries fall
 * off first, matching `commandRunner.ts`'s own `log.splice(0, log.length - MAX_LOG_ENTRIES)`.
 *
 * `commandRunner.ts` allocates a command's `id` up front specifically so a streaming command's
 * interim "pending" broadcasts and its final, finished entry share one id — the whole point
 * being that the renderer replaces that one row in place as it updates, rather than growing a
 * new row per chunk. A plain append doesn't honor that: it was only ever capping the list's
 * overall length, not deduplicating by id, so a single chat turn (which streams many chunks
 * while it runs) still left a pile of separate rows behind for the one command. Replace an
 * existing entry with the same id in place; only a genuinely new id appends a new row. */
export function appendConsoleEntry(prev: ConsoleEntry[], entry: ConsoleEntry): ConsoleEntry[] {
  const existingIndex = prev.findIndex((e) => e.id === entry.id)
  const next = existingIndex === -1
    ? [...prev, entry]
    : [...prev.slice(0, existingIndex), entry, ...prev.slice(existingIndex + 1)]
  return next.length > MAX_CONSOLE_ENTRIES ? next.slice(next.length - MAX_CONSOLE_ENTRIES) : next
}
