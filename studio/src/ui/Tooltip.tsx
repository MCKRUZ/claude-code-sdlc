// #21 Tooltip: a short label (optionally with a key chord) after a 500 ms hover or on focus.
// `role="tooltip"` and `aria-describedby` on the wrapper, so the trigger is described whether the
// tip is visible or not — the label is also the `title` fallback for a pointer that never waits.
import { useId, type KeyboardEvent } from 'react'
import type { TooltipProps } from './contract'
import { cn } from './cn'
import { PLACEMENT, useDelayedOpen } from './HoverCard'
import { Kbd } from './Kbd'

export const TOOLTIP_DELAY = 500

export function Tooltip({ label, kbd, children, placement = 'top' }: TooltipProps) {
  const id = useId()
  const { open, show, hide, close } = useDelayedOpen(TOOLTIP_DELAY, 0)
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Escape' && open) close()
  }
  return (
    <span
      className="relative inline-flex"
      aria-describedby={open ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={onKeyDown}
    >
      {children}
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-30 inline-flex w-max items-center gap-1.5 rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white shadow-2',
            PLACEMENT[placement],
          )}
        >
          {label}
          {kbd && kbd.length > 0 ? <Kbd keys={kbd} className="border-white/20 bg-white/10 text-white" /> : null}
        </span>
      ) : null}
    </span>
  )
}
