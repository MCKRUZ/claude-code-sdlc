// #7 Input + Textarea. Replaces `TEXT_INPUT` and ~20 inline inputs. No `outline-none`: the
// universal `:focus-visible` ring in `index.css` is the focus style, and an input that removed
// its outline without replacing it was the bug. Never mounted in the persistent shell
// (board.spec:189 counts page-wide `input` = 0 on the spec view) — that is the caller's rule.
import { forwardRef } from 'react'
import type { ControlSize, InputProps, TextareaProps } from './contract'
import { cn } from './cn'
import { useFieldControl } from './Field'
import { DisabledReason, disabledReasonProps } from './VisuallyHidden'

// Fields answer hover like every other control (border steps up); focus is the flush halo
// base.css draws for `input:focus-visible`, so no ring class lives here.
export const INPUT_BASE =
  'w-full rounded-lg border border-line-2 bg-surface-1 text-ink-1 placeholder:text-ink-4 ' +
  'transition-[border-color,box-shadow] duration-[120ms] hover:border-line-3 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed aria-invalid:border-status-error-line'

// Fixed heights match Button's so a field and its button share a baseline; Textarea sets its
// own `min-h` and no height.
const SIZE: Record<ControlSize, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-8 px-3 text-sm',
}

const TEXTAREA_SIZE: Record<ControlSize, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', mono = false, invalid, disabled, disabledReason, className, id, required, ...rest },
  ref,
) {
  const field = useFieldControl({ id, required, 'aria-describedby': rest['aria-describedby'], 'aria-invalid': invalid })
  return (
    <>
      <input
        ref={ref}
        disabled={disabled}
        {...disabledReasonProps(disabledReason, disabled)}
        className={cn(INPUT_BASE, SIZE[size], mono && 'font-mono', className)}
        {...rest}
        {...field}
      />
      <DisabledReason reason={disabledReason} disabled={disabled} />
    </>
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { size = 'md', mono = false, invalid, disabled, disabledReason, className, id, required, ...rest },
  ref,
) {
  const field = useFieldControl({ id, required, 'aria-describedby': rest['aria-describedby'], 'aria-invalid': invalid })
  return (
    <>
      <textarea
        ref={ref}
        disabled={disabled}
        {...disabledReasonProps(disabledReason, disabled)}
        className={cn(INPUT_BASE, TEXTAREA_SIZE[size], 'min-h-[4.5rem] resize-y', mono && 'font-mono', className)}
        {...rest}
        {...field}
      />
      <DisabledReason reason={disabledReason} disabled={disabled} />
    </>
  )
})
