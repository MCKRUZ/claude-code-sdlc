// Recent picks (studio-observatory.md §6.1 "Recent"): the last eight entry ids, most recent
// first, in `localStorage['studio.palette.recent']`. Ids, not entries — an entry's `run()` is a
// closure over live screen state, so the index is rebuilt each time and recent ids are matched
// against it; an id the current index no longer has (a spec that was merged away) is skipped.
// Every access is guarded: Electron's renderer has localStorage, but the Node-environment
// tests render with renderToStaticMarkup and have none.
import { PALETTE_RECENT_MAX } from './types'

export const RECENT_STORAGE_KEY = 'studio.palette.recent'

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
  } catch {
    return null
  }
}

export function readRecent(): string[] {
  const s = storage()
  if (!s) return []
  try {
    const parsed: unknown = JSON.parse(s.getItem(RECENT_STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, PALETTE_RECENT_MAX) : []
  } catch {
    return []
  }
}

/** Move `id` to the front and trim. Returns the new list so the caller can set state without
 * a second read. */
export function pushRecent(id: string): string[] {
  const next = [id, ...readRecent().filter((x) => x !== id)].slice(0, PALETTE_RECENT_MAX)
  const s = storage()
  if (s) {
    try { s.setItem(RECENT_STORAGE_KEY, JSON.stringify(next)) } catch { /* quota or private mode: recents are a nicety */ }
  }
  return next
}
