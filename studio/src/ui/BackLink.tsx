// #23 BackLink: "← Back to the stage" and its siblings. The visible text — arrow included — is
// passed through verbatim because the tests locate these by text; the component only supplies
// the button semantics and the hover style.
import { forwardRef } from 'react'
import type { BackLinkProps } from './contract'
import { cn } from './cn'

export const BackLink = forwardRef<HTMLButtonElement, BackLinkProps>(function BackLink({ label, className, ...rest }, ref) {
  return (
    <button
      type="button"
      ref={ref}
      className={cn('inline-flex items-center gap-1 text-xs text-ink-3 transition-colors hover:text-ink-1', className)}
      {...rest}
    >
      {label}
    </button>
  )
})
