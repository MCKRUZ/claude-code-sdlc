// #2 IconButton: a square button whose only visible content is a glyph, so `label` is required
// and becomes `aria-label`. `pressed` renders `aria-pressed` for toggles (sidebar collapse, Mark
// as seen) — a toggle that only changes colour is invisible to assistive tech.
import { forwardRef } from 'react'
import type { ControlSize, IconButtonProps } from './contract'
import { cn } from './cn'
import { Icon } from './Icon'
import { DisabledReason, disabledReasonProps } from './VisuallyHidden'

const SIZE: Record<ControlSize, string> = {
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = 'md', pressed, disabled, disabledReason, className, ...rest },
  ref,
) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      {...disabledReasonProps(disabledReason, disabled)}
      ref={ref}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors',
        'hover:bg-surface-2 hover:text-ink-1 disabled:opacity-50 disabled:cursor-not-allowed motion-safe:active:scale-[.98]',
        pressed && 'bg-surface-2 text-ink-1',
        SIZE[size],
        className,
      )}
      {...rest}
    >
      <Icon icon={icon} size={16} />
      <DisabledReason reason={disabledReason} disabled={disabled} />
    </button>
  )
})
