// #16 ProgressBar: the sidebar `h-1.5` bar and readiness `ready/total`. `role="progressbar"` with
// `aria-valuetext` ("3 of 9 stages done") so the fraction is read, not just a percentage. `null`
// draws a hairline with no fill and says "no data" — an empty bar would read as 0 of N. The width
// transition is CSS; a fill that mounts fresh has nothing to tween from, so there is never a
// 0→n sweep on first paint.
import { forwardRef } from 'react'
import type { ProgressBarProps } from './contract'
import { cn } from './cn'

export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(function ProgressBar(
  { value, max, label, valueText, className, ...rest },
  ref,
) {
  const known = typeof value === 'number' && Number.isFinite(value) && max > 0
  const fraction = known ? Math.min(1, Math.max(0, value / max)) : 0
  const text = valueText ?? (known ? `${value} of ${max} ${label}` : `${label}: no data`)
  return (
    <div
      ref={ref}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={known ? value : undefined}
      aria-valuetext={text}
      data-no-data={known ? undefined : ''}
      className={cn('h-1.5 w-full overflow-hidden rounded-full', known ? 'bg-surface-3' : 'bg-line-1', className)}
      {...rest}
    >
      {known ? (
        <span
          className="block h-full rounded-full bg-accent-600 motion-safe:transition-[width] motion-safe:duration-200"
          style={{ width: `${fraction * 100}%` }}
        />
      ) : null}
    </div>
  )
})
