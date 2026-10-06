// #12 StatusDot: the coloured dot beside a Console row or a sync state. `aria-hidden` because the
// sibling text carries the meaning. `pulse` is a CSS animation the motion-off rule zeroes, so a
// person who turned motion off gets a still dot without the component asking.
import { forwardRef } from 'react'
import type { DotStatus, StatusDotProps } from './contract'
import { cn } from './cn'

const STATUS: Record<DotStatus, string> = {
  ok: 'bg-status-ok-fill',
  warn: 'bg-status-warn-fill',
  error: 'bg-status-error-fill',
  running: 'bg-status-running-fill',
  idle: 'bg-ink-4',
}

export const StatusDot = forwardRef<HTMLSpanElement, StatusDotProps>(function StatusDot(
  { status, pulse = false, className, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      aria-hidden="true"
      data-status={status}
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', STATUS[status], pulse && 'motion-safe:animate-pulse', className)}
      {...rest}
    />
  )
})
