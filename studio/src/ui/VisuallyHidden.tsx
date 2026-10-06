// #27 VisuallyHidden + SkipLink, plus the shared `disabledReason` rendering every control uses.
// Tailwind's `sr-only` keeps text in the accessibility tree while removing it from the visual
// layout; the kit uses this rather than `display:none` because a screen reader must still hear
// why a control is greyed out.
import { forwardRef } from 'react'
import type { SkipLinkProps, VisuallyHiddenProps } from './contract'
import { cn } from './cn'

export const VisuallyHidden = forwardRef<HTMLElement, VisuallyHiddenProps>(function VisuallyHidden(
  { as = 'span', className, ...rest },
  ref,
) {
  const Tag = as
  return <Tag ref={ref as never} className={cn('sr-only', className)} {...rest} />
})

/** The `activity-disabled-reason` convention in one place: a `title` on the control (sighted
 * hover) plus hidden text (assistive tech). Controls call `disabledReasonProps` for the title and
 * render `<DisabledReason>` inside themselves. Nothing renders when there is no reason. */
/** A disabled control always carries its reason (togo-command-center.md §2.7, §8 honesty check
 * 1): as `title` for the pointer and — when the caller renders a `DisabledReason` with the same
 * `id` — as `aria-describedby`, so the reason is the control's accessible DESCRIPTION, readable
 * by assistive tech and by a test (`#${describedby}` has the sentence, character for character). */
export function disabledReasonProps(reason: string | undefined, disabled: boolean | undefined, id?: string) {
  if (!reason || !disabled) return {}
  return id ? { title: reason, 'aria-describedby': id } : { title: reason }
}

export function DisabledReason({ reason, disabled, id }: { reason?: string; disabled?: boolean; id?: string }) {
  if (!reason || !disabled) return null
  return <VisuallyHidden id={id} data-disabled-reason="">{reason}</VisuallyHidden>
}

/** `<a href="#main">`, the first child of `#root`. Invisible until it receives focus, then it sits
 * on top of everything so a keyboard user sees where they are. */
export const SkipLink = forwardRef<HTMLAnchorElement, SkipLinkProps>(function SkipLink(
  { label = 'Skip to main content', className, ...rest },
  ref,
) {
  return (
    <a
      ref={ref}
      href="#main"
      className={cn(
        'sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg',
        'focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-ink-1 focus:shadow-2',
        className,
      )}
      {...rest}
    >
      {label}
    </a>
  )
})
