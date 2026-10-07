// #26 Spinner + ProgressRing. Both are CSS-only: `animate-spin` is a keyframe the motion-off
// rule in `index.css` zeroes, so the ring is static when a person turns motion off and the kit
// never has to ask. `label` is required — a spinning glyph with no text says nothing to a reader.
import { forwardRef } from 'react'
import type { ProgressRingProps, SpinnerProps } from './contract'
import { cn } from './cn'
import { VisuallyHidden } from './VisuallyHidden'

const RADIUS = 7
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { size = 16, label, className, ...rest },
  ref,
) {
  return (
    <span ref={ref} role="status" className={cn('inline-flex items-center', className)} {...rest}>
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        className="animate-spin text-ink-3"
      >
        <circle cx="8" cy="8" r={RADIUS} stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
        <path d="M15 8a7 7 0 0 0-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  )
})

/** `value` 0–1 draws a determinate arc; `null` draws an indeterminate dashed ring that spins.
 * Never a fabricated 0: an unknown progress is visibly different from "nothing done yet". */
export const ProgressRing = forwardRef<HTMLSpanElement, ProgressRingProps>(function ProgressRing(
  { size = 16, label, value, className, ...rest },
  ref,
) {
  const determinate = typeof value === 'number' && Number.isFinite(value)
  const clamped = determinate ? Math.min(1, Math.max(0, value)) : 0
  return (
    <span
      ref={ref}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={determinate ? Math.round(clamped * 100) : undefined}
      aria-valuetext={determinate ? `${Math.round(clamped * 100)}% ${label}` : `${label}: no data`}
      className={cn('inline-flex items-center', className)}
      {...rest}
    >
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        className={cn('text-accent-600', !determinate && 'animate-spin')}
      >
        <circle cx="8" cy="8" r={RADIUS} stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
        <circle
          cx="8"
          cy="8"
          r={RADIUS}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          transform="rotate(-90 8 8)"
          strokeDasharray={determinate ? `${CIRCUMFERENCE * clamped} ${CIRCUMFERENCE}` : `${CIRCUMFERENCE / 4} ${CIRCUMFERENCE}`}
        />
      </svg>
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  )
})
