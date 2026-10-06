// #1 Button. Two pins decide the shape of this file: `type` is the FIRST JSX attribute so the
// rendered markup reads `<button type="button" disabled="">` (workflowTab.test.ts:218 compares
// attribute order), and the primary variant spells out `bg-brand-600` literally
// (board.spec.ts:127,148 locates it by class). Everything else is a plain variant table.
import { forwardRef, useId } from 'react'
import { Loader2 } from 'lucide-react'
import type { ButtonProps, ButtonVariant, ControlSize } from './contract'
import { cn } from './cn'
import { Icon } from './Icon'
import { DisabledReason, disabledReasonProps } from './VisuallyHidden'

// Press is felt, not seen: 80 ms and 1.5 % — any more reads as a wobble. The transition list
// names its properties so a layout change on the button never animates by accident.
export const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap select-none ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] ease-[var(--ease-out)] ' +
  'disabled:opacity-50 disabled:cursor-not-allowed motion-safe:active:scale-[0.985] motion-safe:active:duration-[80ms]'

export const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  // Secondary hover moves the border, not just the fill; link uses the C1 `accent-text` pair (AA
  // in both themes — dark `accent-700` as text measured ≈ 2.5:1, the biggest gap in the v7 shots).
  primary: 'bg-brand-600 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-brand-700 active:bg-accent-800',
  secondary: 'border border-line-2 bg-surface-1 text-ink-1 hover:border-line-3 hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink-1',
  danger: 'bg-status-error-fill text-white hover:brightness-95',
  link: 'text-accent-text underline-offset-2 hover:text-accent-text-hover hover:underline px-0 py-0',
}

// Fixed heights so buttons, inputs and selects in one row share a baseline.
export const BUTTON_SIZE: Record<ControlSize, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-8 px-3 text-xs',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    loadingLabel,
    icon,
    iconEnd,
    block = false,
    disabled,
    disabledReason,
    type = 'button',
    className,
    children,
    ...rest
  },
  ref,
) {
  const isDisabled = Boolean(disabled || loading)
  // The reason's element id, so the disabled control is DESCRIBED by its reason (aria-describedby).
  const reasonId = useId()
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...disabledReasonProps(disabledReason, disabled, reasonId)}
      ref={ref}
      className={cn(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], block && 'flex w-full', className)}
      {...rest}
    >
      {loading ? <Icon icon={Loader2} size={14} className="animate-spin" /> : icon ? <Icon icon={icon} size={14} /> : null}
      {loading && loadingLabel ? loadingLabel : children}
      {!loading && iconEnd ? <Icon icon={iconEnd} size={14} /> : null}
      <DisabledReason reason={disabledReason} disabled={disabled} id={reasonId} />
    </button>
  )
})
