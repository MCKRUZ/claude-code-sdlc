import { fetchDocumentSnapshot, type DocumentSnapshot } from './documentSnapshot'
import type { OpenDocumentResult } from '../shared/types'

export interface DocumentPollerOptions {
  openDocument: (projectPath: string, relPath: string) => Promise<OpenDocumentResult>
  projectPath: string
  relPath: string
  intervalMs: number
  onSnapshot: (snapshot: DocumentSnapshot) => void
  /** Injectable so this can be proven with fake time and fake visibility, with no real
   * `document`/`window` at all — `LiveDocumentPanel` supplies the real globals; a test supplies
   * fakes. Typed loosely (not `typeof window.setInterval`) because a test's fake has no need to
   * match the DOM lib's overload set. */
  setInterval: (cb: () => void, ms: number) => unknown
  clearInterval: (id: unknown) => void
  /** True while the window/tab is not visible. */
  isHidden: () => boolean
  /** Subscribes to a visibility change; returns an unsubscribe. */
  onVisibilityChange: (cb: () => void) => () => void
}

/** Polls the Workflow tab's current-step document (spec 0017's fix pass, bugs #4 and #5),
 * pulled out of `LiveDocumentPanel` so its scheduling can be proven directly rather than only
 * through a real browser's real 2-second clock.
 *
 * Bug #4: a tick due while the window/tab is not visible is skipped, not queued — spec 0017's
 * own Decision List asks for polling "while the tab is visible, paused when it isn't", and
 * before this fix nothing ever checked visibility at all; the interval just kept running,
 * subprocess call and all, for as long as the component stayed mounted. Becoming visible again
 * fires an immediate catch-up tick rather than waiting out the rest of the interval.
 *
 * Bug #5: only the most recently STARTED fetch's result is ever applied. Each tick fires
 * independent of whether the previous one has resolved — if an earlier tick resolves AFTER a
 * later one (a slow poll overtaken by a faster one), its result is discarded rather than
 * overwriting the fresher one already applied.
 *
 * Returns a stop function; calling it also discards the result of any read still in flight. */
export function startDocumentPolling(opts: DocumentPollerOptions): () => void {
  const { openDocument, projectPath, relPath, intervalMs, onSnapshot, isHidden, onVisibilityChange } = opts
  let stopped = false
  let currentToken = 0

  const tick = () => {
    if (stopped || isHidden()) return
    const token = ++currentToken
    fetchDocumentSnapshot(openDocument, projectPath, relPath).then((snapshot) => {
      // Discarded when either this poller has stopped, or a NEWER tick has started since this
      // one began — the fix for bug #5. `stopped` alone (this codebase's existing guard
      // elsewhere, a plain boolean) is not enough here: two ticks can both be in flight while
      // still mounted, and only START order — never resolution order — decides which wins.
      if (stopped || token !== currentToken) return
      onSnapshot(snapshot)
    })
  }

  tick()
  const intervalId = opts.setInterval(tick, intervalMs)
  const unsubscribeVisibility = onVisibilityChange(() => {
    if (!isHidden()) tick() // catch up immediately rather than waiting out the rest of the interval
  })

  return () => {
    stopped = true
    opts.clearInterval(intervalId)
    unsubscribeVisibility()
  }
}
