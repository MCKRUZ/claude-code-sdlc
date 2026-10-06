// One polite live region for the whole app (studio-observatory.md §6.3). Frame mounts
// `<LiveAnnouncer/>` once; anything may call `announce("Phase 2: Design — Workflow")`. One region
// rather than one per screen because a screen reader queues politely per region, and several
// regions appearing and vanishing with their screens lose announcements mid-navigation. The
// module holds the listener set, so `announce` works from a plain function, not just a hook.
import { useEffect, useState } from 'react'

type Listener = (text: string, nonce: number) => void

const listeners = new Set<Listener>()
let nonce = 0
let last: { text: string; nonce: number } | null = null

/** Announce politely. The same text twice in a row is still announced: the region clears and
 * re-fills, because an identical string is a no-op to assistive tech. */
export function announce(text: string): void {
  if (!text) return
  nonce += 1
  last = { text, nonce }
  for (const l of listeners) l(text, nonce)
}

/** Test seam: what was announced last, without a DOM. */
export function lastAnnouncement(): string | null {
  return last?.text ?? null
}

export interface LiveAnnouncerProps {
  /** `status` reads politely; the region is never assertive — nothing here interrupts typing. */
  className?: string
}

export function LiveAnnouncer({ className }: LiveAnnouncerProps) {
  const [message, setMessage] = useState<{ text: string; nonce: number } | null>(null)

  useEffect(() => {
    let clearTimer: ReturnType<typeof setTimeout> | null = null
    const listener: Listener = (text, n) => {
      // Clear first so a repeated announcement is a change the region notices.
      setMessage(null)
      clearTimer = setTimeout(() => setMessage({ text, nonce: n }), 0)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      if (clearTimer) clearTimeout(clearTimer)
    }
  }, [])

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className={className ?? 'sr-only'} data-testid="live-announcer">
      {message ? <span key={message.nonce}>{message.text}</span> : null}
    </div>
  )
}
