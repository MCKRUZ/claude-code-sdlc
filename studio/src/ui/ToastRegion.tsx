// #25 ToastRegion: `<section role="region" aria-label="Notifications" aria-live="polite">`,
// bottom-right over `<main>` — never an `<aside>` (the two asides are Sidebar and ChatPanel and
// tests count them). Shows at most `max`; the oldest beyond that wait their turn. Pointer or
// focus on the region pauses every ttl. An error toast is announced assertively.
import { useState } from 'react'
import type { ToastRegionProps } from './contract'
import { cn } from './cn'
import { Toast } from './Toast'
import { pause, resume } from './toastStore'
import { useToast } from './useToast'

export function ToastRegion({ max = 3, className }: ToastRegionProps) {
  const { items, dismiss } = useToast()
  const [paused, setPaused] = useState(false)
  const visible = items.slice(0, max)
  const assertive = visible.some((t) => t.tone === 'error')
  const hold = () => {
    pause()
    setPaused(true)
  }
  const release = () => {
    resume()
    setPaused(false)
  }
  return (
    <section
      role="region"
      aria-label="Notifications"
      aria-live={assertive ? 'assertive' : 'polite'}
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocus={hold}
      onBlur={release}
      className={cn('pointer-events-none fixed right-4 bottom-4 z-30 flex flex-col items-end gap-2', className)}
    >
      {visible.map((item) => (
        <Toast key={item.id} item={item} onDismiss={dismiss} paused={paused} />
      ))}
    </section>
  )
}
