// #10 Chip: the pills (sprint chips, risk, roles, state). Colour is never the only signal —
// callers pass `dot` or an icon beside the text. `as="button"` keeps `rounded-full` because the
// chatAuthoring test pins `aside button.rounded-full` for the question pills.
import { forwardRef } from 'react'
import type { ChipProps, ChipSize, ChipTone } from './contract'
import { cn } from './cn'
import { Icon } from './Icon'
import { DisabledReason, disabledReasonProps } from './VisuallyHidden'

export const CHIP_TONE: Record<ChipTone, string> = {
  neutral: 'bg-surface-2 text-ink-2',
  accent: 'bg-accent-100 text-accent-800',
  ok: 'bg-status-ok-bg text-status-ok-ink',
  warn: 'bg-status-warn-bg text-status-warn-ink',
  error: 'bg-status-error-bg text-status-error-ink',
  signed: 'bg-stage-signed-bg text-stage-signed-ink',
  current: 'bg-stage-current-bg text-stage-current-ink',
  later: 'bg-stage-later-bg text-stage-later-ink',
  mono: 'bg-surface-2 font-mono text-ink-2',
}

const DOT_TONE: Record<ChipTone, string> = {
  neutral: 'bg-ink-4',
  accent: 'bg-accent-600',
  ok: 'bg-status-ok-fill',
  warn: 'bg-status-warn-fill',
  error: 'bg-status-error-fill',
  signed: 'bg-stage-signed-fill',
  current: 'bg-stage-current-fill',
  later: 'bg-stage-later-fill',
  mono: 'bg-ink-4',
}

// Fixed heights so chips in a table cell or header sit on one baseline whatever their text.
const SIZE: Record<ChipSize, string> = {
  xs: 'h-[18px] px-1.5 text-[11px] leading-none',
  sm: 'h-[22px] px-2 text-xs leading-none',
}

export const Chip = forwardRef<HTMLElement, ChipProps>(function Chip(
  { tone = 'neutral', size = 'xs', dot = false, icon, as = 'span', onClick, disabled, disabledReason, className, children, ...rest },
  ref,
) {
  const classes = cn(
    'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap',
    CHIP_TONE[tone],
    SIZE[size],
    as === 'button' && 'hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed',
    className,
  )
  const body = (
    <>
      {dot ? <span aria-hidden="true" className={cn('h-[5px] w-[5px] rounded-full', DOT_TONE[tone])} /> : null}
      {icon ? <Icon icon={icon} size={14} /> : null}
      {children}
      <DisabledReason reason={disabledReason} disabled={disabled} />
    </>
  )
  if (as === 'button') {
    return (
      <button
        type="button"
        disabled={disabled}
        data-pressable=""
        onClick={onClick}
        {...disabledReasonProps(disabledReason, disabled)}
        ref={ref as never}
        className={classes}
        {...rest}
      >
        {body}
      </button>
    )
  }
  return (
    <span ref={ref as never} className={classes} onClick={onClick} {...rest}>
      {body}
    </span>
  )
})
