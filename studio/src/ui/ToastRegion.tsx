// #25 ToastRegion: `<section role="region" aria-label="Notifications" aria-live="polite">` —
// never an `<aside>` (the two asides are Sidebar and ChatPanel and tests count them). Shows at
// most `max`; the oldest beyond that wait their turn. Pointer or focus on the region pauses every
// ttl. An error toast is announced assertively.
// Round 2 (C7): anchored over `<main>`, not over the chat or the console — the offsets read
// `--chat-width` and `--console-height`, which P2 sets on the Frame root (0 when absent), and
// `[data-chat-hidden]` on an ancestor pulls the stack back to the window edge. (M6): a toast the
// store dropped stays mounted while row #12's exit plays, then leaves; with motion off it leaves
// at once, so a test and a cold reload see the same DOM.
import { useLayoutEffect, useRef, useState } from 'react'
import type { ToastItem, ToastRegionProps } from './contract'
import { toasts } from '../motion/choreo/toasts'
import { cn } from './cn'
import { kitChoreoContext, motionEnabled } from './kitMotion'
import { Toast } from './Toast'
import { pause, resume } from './toastStore'
import { useToast } from './useToast'

export const TOAST_REGION_CLASS =
  'pointer-events-none fixed z-30 flex flex-col items-end gap-2 ' +
  'right-[calc(var(--chat-width,0px)+16px)] bottom-[calc(var(--console-height,0px)+16px)] ' +
  '[[data-chat-hidden]_&]:right-4'

/** The list to render: every visible item (fresh objects win), with items the store has dropped
 * kept in their place until their exit resolves. Returns `rendered` itself when nothing changed. */
export function mergeRendered(rendered: readonly ToastItem[], visible: readonly ToastItem[]): readonly ToastItem[] {
  const byId = new Map(visible.map((v) => [v.id, v]))
  const kept = rendered.map((r) => byId.get(r.id) ?? r)
  const seen = new Set(kept.map((k) => k.id))
  const next = [...kept, ...visible.filter((v) => !seen.has(v.id))]
  const same = next.length === rendered.length && next.every((n, i) => n === rendered[i])
  return same ? rendered : next
}

export function ToastRegion({ max = 3, className }: ToastRegionProps) {
  const { items, dismiss } = useToast()
  const [paused, setPaused] = useState(false)
  const visible = items.slice(0, max)
  const assertive = visible.some((t) => t.tone === 'error')

  // Derived state in render (React's sanctioned pattern): the list lags the store on removal only.
  const [rendered, setRendered] = useState<readonly ToastItem[]>(visible)
  const merged = mergeRendered(rendered, visible)
  if (merged !== rendered) setRendered(merged)
  const visibleIds = new Set(visible.map((v) => v.id))
  const nodes = useRef(new Map<string, HTMLDivElement>())
  const exiting = useRef(new Set<string>())

  useLayoutEffect(() => {
    for (const item of merged) {
      if (visibleIds.has(item.id) || exiting.current.has(item.id)) continue
      const el = nodes.current.get(item.id)
      if (!el || !motionEnabled()) {
        setRendered((r) => r.filter((x) => x.id !== item.id))
        continue
      }
      exiting.current.add(item.id)
      const tl = toasts.play(kitChoreoContext(el), { el, direction: 'exit' })
      void tl.then(() => {
        exiting.current.delete(item.id)
        nodes.current.delete(item.id)
        setRendered((r) => r.filter((x) => x.id !== item.id))
      })
    }
  })

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
      className={cn(TOAST_REGION_CLASS, className)}
    >
      {merged.map((item) => (
        <Toast
          key={item.id}
          ref={(el) => {
            if (el) nodes.current.set(item.id, el)
          }}
          item={item}
          onDismiss={dismiss}
          paused={paused}
          exiting={!visibleIds.has(item.id)}
        />
      ))}
    </section>
  )
}
