// #20 HoverCard / Popover: read-only cards that open on hover AND `focus-visible`, close on
// Escape, and never contain a write control (the content is `pointer-events: none`, so nothing
// in it can be clicked — the rule is enforced by construction). Text-only content is a tooltip
// to assistive tech; richer content is a described region.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { HoverCardProps, Placement } from './contract'
import { cn } from './cn'

export const PLACEMENT: Record<Placement, string> = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2',
}

export const HOVER_OPEN_DELAY = 350
export const HOVER_CLOSE_DELAY = 120

/** Shared open/close timing. `openDelay` keeps a card from flashing as the pointer crosses a row;
 * `closeDelay` lets it survive the gap between trigger and card. */
export function useDelayedOpen(openDelay: number, closeDelay: number) {
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => clear, [])
  return {
    open,
    show: () => {
      clear()
      timer.current = setTimeout(() => setOpen(true), openDelay)
    },
    hide: () => {
      clear()
      timer.current = setTimeout(() => setOpen(false), closeDelay)
    },
    close: () => {
      clear()
      setOpen(false)
    },
  }
}

export function HoverCard({ trigger, content, placement = 'bottom', openDelay = HOVER_OPEN_DELAY, closeDelay = HOVER_CLOSE_DELAY, className }: HoverCardProps) {
  const id = useId()
  const { open, show, hide, close } = useDelayedOpen(openDelay, closeDelay)
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
      {...(textOnly ? { 'aria-describedby': open ? id : undefined } : {})}
    >
      {trigger}
      {open ? (
        <span
          id={id}
          role={textOnly ? 'tooltip' : undefined}
          data-hover-card=""
          className={cn(
            'pointer-events-none absolute z-30 w-max max-w-xs rounded-[10px] bg-surface-raised px-3 py-2 text-xs text-ink-1 shadow-2',
            PLACEMENT[placement],
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  )
}

export const Popover = HoverCard
