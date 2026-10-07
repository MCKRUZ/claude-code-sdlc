// #25 toastStore: a tiny external store (read through `useSyncExternalStore`) so any module can
// call `toast()` without a provider — the main process result handlers and the stage chat both
// need it. Timers live here, not in the component, so pausing on hover is one call that freezes
// every toast's remaining time rather than N component effects guessing at each other.
// Round 2 (M6): a toast whose string title matches one shown within the last two seconds UPDATES
// that toast in place (same id, fresh detail/action, ttl restarted) instead of stacking a twin —
// a poll that fails three times says so once, loudly, not three times quietly.
import type { ToastInput, ToastItem } from './contract'

export const TOAST_TTL_MS = 6000
export const TOAST_DEDUPE_MS = 2000

interface Timer {
  handle: ReturnType<typeof setTimeout> | null
  remaining: number
  startedAt: number
}

let items: readonly ToastItem[] = []
let counter = 0
const timers = new Map<string, Timer>()
const listeners = new Set<() => void>()
let paused = false

function emit() {
  for (const l of listeners) l()
}

function arm(id: string, remaining: number) {
  const timer: Timer = { handle: null, remaining, startedAt: Date.now() }
  timer.handle = setTimeout(() => dismiss(id), remaining)
  timers.set(id, timer)
}

function disarm(id: string) {
  const timer = timers.get(id)
  if (timer?.handle) clearTimeout(timer.handle)
  timers.delete(id)
}

/** The toast a new input would update rather than duplicate: same string title, shown within
 * the dedupe window. Non-string titles never dedupe (two nodes are not comparable). */
function duplicateOf(input: ToastInput, now: number): ToastItem | undefined {
  if (typeof input.title !== 'string') return undefined
  return items.find((t) => typeof t.title === 'string' && t.title === input.title && now - t.createdAt <= TOAST_DEDUPE_MS)
}

export function toast(input: ToastInput): string {
  const now = Date.now()
  const existing = duplicateOf(input, now)
  if (existing) {
    // A fresh object (so the component sees the update) with the SAME id and birth time: the
    // dedupe window is measured from the first arrival, so a toast cannot be kept alive forever
    // by a stream of twins.
    items = items.map((t) => (t.id === existing.id ? { ...t, ...input, id: existing.id, createdAt: existing.createdAt } : t))
    // The clock restarts for the new words; a sticky update keeps no clock.
    disarm(existing.id)
    emit()
    shown(existing.id)
    return existing.id
  }
  const id = `toast-${++counter}`
  items = [...items, { ...input, id, createdAt: now }]
  emit()
  return id
}

/** The ttl starts when a toast is SHOWN, not when it is queued: the region shows at most `max`,
 * and a toast that waited its turn behind three others must still get its full six seconds.
 * `Toast` calls this on mount; a second call for the same id is a no-op. */
export function shown(id: string) {
  const item = items.find((t) => t.id === id)
  if (!item || item.sticky || timers.has(id)) return
  if (paused) timers.set(id, { handle: null, remaining: TOAST_TTL_MS, startedAt: Date.now() })
  else arm(id, TOAST_TTL_MS)
}

export function dismiss(id: string) {
  disarm(id)
  if (!items.some((t) => t.id === id)) return
  items = items.filter((t) => t.id !== id)
  emit()
}

/** Freeze every ttl (pointer or focus is on the region). */
export function pause() {
  if (paused) return
  paused = true
  const now = Date.now()
  for (const timer of timers.values()) {
    if (timer.handle) {
      clearTimeout(timer.handle)
      timer.handle = null
      timer.remaining = Math.max(0, timer.remaining - (now - timer.startedAt))
    }
  }
}

export function resume() {
  if (!paused) return
  paused = false
  for (const [id, timer] of timers) {
    if (!timer.handle) arm(id, timer.remaining)
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSnapshot(): readonly ToastItem[] {
  return items
}

/** Test seam: drop everything, including timers. */
export function clearToasts() {
  for (const timer of timers.values()) if (timer.handle) clearTimeout(timer.handle)
  timers.clear()
  paused = false
  items = []
  emit()
}
