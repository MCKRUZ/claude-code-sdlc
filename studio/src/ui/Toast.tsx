// #25 Toast: one notification card. Tone picks the icon and tints only the glyph — a coloured
// 4 px bar is a banner, a tinted glyph and a hairline clock are a notification. The text is
// always present. Round 2 (M6): the card plays row #12 — enters from the right, its rail runs
// `scaleX 1→0` over the REAL ttl as a clock the region pauses through `paused` (mirrored to
// `data-paused` for CSS and tests), and a same-title update crossfades the text in place. Exit is
// the region's: it keeps the node mounted while the row fades and collapses it. With motion off
// every row is an instant end state, except the clock, which is left standing — a clock that
// jumps to zero would read as "expired".
import { forwardRef, useEffect, useLayoutEffect, useRef } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ToastItem, ToastTone } from './contract'
import { toastRail, toastUpdate, toasts } from '../motion/choreo/toasts'
import { cn } from './cn'
import { Icon } from './Icon'
import { IconButton } from './IconButton'
import { kitChoreoContext, motionEnabled } from './kitMotion'
import { TOAST_TTL_MS, shown } from './toastStore'

const TONE: Record<ToastTone, { icon: LucideIcon; glyph: string }> = {
  ok: { icon: CheckCircle2, glyph: 'text-status-ok-fill' },
  info: { icon: Info, glyph: 'text-accent-600' },
  warn: { icon: AlertTriangle, glyph: 'text-status-warn-fill' },
  error: { icon: XCircle, glyph: 'text-status-error-fill' },
}

export interface ToastProps {
  item: ToastItem
  onDismiss: (id: string) => void
  paused?: boolean
  /** True while the region is playing this toast's exit; the card is inert and `aria-hidden`. */
  exiting?: boolean
}

export const Toast = forwardRef<HTMLDivElement, ToastProps>(function Toast({ item, onDismiss, paused = false, exiting = false }, ref) {
  const { icon, glyph } = TONE[item.tone]
  const card = useRef<HTMLDivElement | null>(null)
  const text = useRef<HTMLDivElement | null>(null)
  const rail = useRef<HTMLSpanElement | null>(null)
  const clock = useRef<ReturnType<typeof toastRail.play> | null>(null)
  const firstItem = useRef(item)

  useEffect(() => shown(item.id), [item.id])

  // Enter once, and start the clock once — both for the life of this id.
  useLayoutEffect(() => {
    const el = card.current
    if (!el) return
    const enter = toasts.play(kitChoreoContext(el), { el, direction: 'enter' })
    // The rail is a real clock only while motion is on; otherwise it stands at full width.
    if (rail.current && !item.sticky && motionEnabled()) {
      clock.current = toastRail.play(kitChoreoContext(el), { rail: rail.current, ttlSeconds: TOAST_TTL_MS / 1000 })
    }
    return () => {
      enter.kill()
      clock.current?.kill()
      clock.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id])

  // Hover / focus on the region freezes the store's ttl AND this clock, so what is seen is true.
  useLayoutEffect(() => {
    const tl = clock.current
    if (!tl) return
    if (paused) tl.pause()
    else tl.play()
  }, [paused])

  // A same-title update replaced the item object in place: crossfade the words AND restart the
  // clock. The store re-armed a full ttl for the new words (`toastStore.toast`), so a rail left
  // running from the first arrival would reach zero up to two seconds before the toast actually
  // goes — the "expired" picture this file's header forbids. The new clock honours `paused`.
  useLayoutEffect(() => {
    if (item === firstItem.current) return
    firstItem.current = item
    const el = text.current
    if (!el) return
    const card_ = card.current
    if (card_ && rail.current && !item.sticky && motionEnabled()) {
      clock.current?.kill()
      clock.current = toastRail.play(kitChoreoContext(card_), { rail: rail.current, ttlSeconds: TOAST_TTL_MS / 1000 })
      if (paused) clock.current.pause()
    }
    const tl = toastUpdate.play(kitChoreoContext(el), { text: el })
    return () => {
      tl.kill()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item])

  return (
    <div
      ref={(el) => {
        card.current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) ref.current = el
      }}
      data-toast-tone={item.tone}
      data-toast-id={item.id}
      data-paused={paused ? '' : undefined}
      data-exiting={exiting ? '' : undefined}
      aria-hidden={exiting || undefined}
      className={cn(
        'pointer-events-auto relative flex w-[340px] items-start gap-2.5 overflow-hidden rounded-[10px] border border-line-1 bg-surface-raised px-3.5 py-2.5 text-xs text-ink-1 shadow-2',
        exiting && 'pointer-events-none',
      )}
    >
      <Icon icon={icon} size={14} className={cn('mt-0.5', glyph)} />
      <div ref={text} className="min-w-0 flex-1" data-toast-text="">
        <p className="text-sm font-medium">{item.title}</p>
        {item.detail ? <p className="mt-0.5 text-xs text-ink-3">{item.detail}</p> : null}
        {item.action ? (
          <button type="button" onClick={item.action.onClick} className="mt-1 text-xs font-medium text-accent-text hover:text-accent-text-hover hover:underline">
            {item.action.label}
          </button>
        ) : null}
      </div>
      <IconButton label="Dismiss" icon={X} size="sm" onClick={() => onDismiss(item.id)} />
      {!item.sticky ? (
        <span ref={rail} aria-hidden="true" data-toast-rail="" className="absolute inset-x-0 bottom-0 h-px origin-left bg-ink-4/40" />
      ) : null}
    </div>
  )
})
