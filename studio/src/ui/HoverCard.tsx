// #20 HoverCard / Popover: read-only cards that open on hover AND `focus-visible`, close on
// Escape, and never contain a write control (the content is `pointer-events: none`, so nothing
// in it can be clicked — the rule is enforced by construction). Text-only content is a tooltip
// to assistive tech; richer content is a described region. Round 2 (M7): the card plays row #17
// — arrives `opacity 0→1, y 4→0` after the intent delay, leaves in 80 ms with its role and
// `pointer-events: none` kept through the fade; Escape closes synchronously, no fade.
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import type { HoverCardProps, Placement } from './contract'
import { hoverPlate } from '../motion/choreo/hoverPlate'
import { cn } from './cn'
import { kitChoreoContext, motionEnabled } from './kitMotion'

export const PLACEMENT: Record<Placement, string> = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2',
}

export const HOVER_OPEN_DELAY = 350
export const HOVER_CLOSE_DELAY = 120
/** How long the leave fade holds the node (M7), in ms. */
export const HOVER_LEAVE_MS = 80

export interface DelayedOpen {
  /** Mounted: visible, or leaving (fading out). */
  open: boolean
  /** True only while the leave fade plays. */
  leaving: boolean
  show(): void
  hide(): void
  /** Synchronous close (Escape): no delay, no fade. */
  close(): void
}

/** Shared open/close timing. `openDelay` keeps a card from flashing as the pointer crosses a row;
 * `closeDelay` lets it survive the gap between trigger and card; the leave fade follows the delay
 * only while motion is on, so with motion off the node leaves at once. */
export function useDelayedOpen(openDelay: number, closeDelay: number): DelayedOpen {
  const [phase, setPhase] = useState<'closed' | 'open' | 'leaving'>('closed')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => clear, [])
  return {
    open: phase !== 'closed',
    leaving: phase === 'leaving',
    show: () => {
      clear()
      timer.current = setTimeout(() => setPhase('open'), openDelay)
    },
    hide: () => {
      clear()
      timer.current = setTimeout(() => {
        if (!motionEnabled()) {
          setPhase('closed')
          return
        }
        setPhase('leaving')
        timer.current = setTimeout(() => setPhase('closed'), HOVER_LEAVE_MS)
      }, closeDelay)
    },
    close: () => {
      clear()
      setPhase('closed')
    },
  }
}

/** Plays row #17 on the plate: in on mount, out when `leaving` flips true. */
export function useHoverPlate(ref: RefObject<HTMLElement | null>, leaving: boolean): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const tl = hoverPlate.play(kitChoreoContext(el), { el, direction: leaving ? 'out' : 'in' })
    return () => {
      tl.kill()
    }
  }, [ref, leaving])
}

export function HoverCard({ trigger, content, placement = 'bottom', openDelay = HOVER_OPEN_DELAY, closeDelay = HOVER_CLOSE_DELAY, className }: HoverCardProps) {
  const id = useId()
  const { open, leaving, show, hide, close } = useDelayedOpen(openDelay, closeDelay)
  const textOnly = typeof content === 'string' || typeof content === 'number'
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation()
      close()
    }
  }
  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={onKeyDown}
      {...(textOnly ? { 'aria-describedby': open && !leaving ? id : undefined } : {})}
    >
      {trigger}
      {open ? <HoverPlate id={id} role={textOnly ? 'tooltip' : undefined} placement={placement} leaving={leaving}>{content}</HoverPlate> : null}
    </span>
  )
}

interface HoverPlateProps {
  id: string
  role?: 'tooltip'
  placement: Placement
  leaving: boolean
  className?: string
  children: HoverCardProps['content']
}

/** The plate itself — one element for HoverCard and Tooltip, so both arrive and leave alike. */
export function HoverPlate({ id, role, placement, leaving, className, children }: HoverPlateProps) {
  const ref = useRef<HTMLSpanElement | null>(null)
  useHoverPlate(ref, leaving)
  return (
    <span
      ref={ref}
      id={id}
      role={role}
      data-hover-card=""
      data-leaving={leaving ? '' : undefined}
      className={cn(
        'pointer-events-none absolute z-30 w-max max-w-xs rounded-[10px] bg-surface-raised px-3 py-2 text-xs text-ink-1 shadow-2',
        PLACEMENT[placement],
        className,
      )}
    >
      {children}
    </span>
  )
}

export const Popover = HoverCard
