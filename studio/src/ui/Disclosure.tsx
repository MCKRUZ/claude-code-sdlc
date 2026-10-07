// #33 Disclosure (C8). `<details>` / `<summary>` stay the tags — sprint.spec counts
// `details[open]` and the text pins find the summary by its text — so the component only adds
// what the browser default lacks: the `::marker` triangle is hidden (both the standard marker and
// WebKit's), a lucide `ChevronRight` turns 90° on `[open]` (a CSS `rotate`, so the end state is
// the same with motion off), and `aria-expanded` mirrors the open state for readers that do not
// announce `<details>`. The summary's children are rendered as given — the chevron is a sibling
// SVG, never a text node — so a test that reads `summary.textContent` sees the caller's words only.
import { forwardRef, useState, type SyntheticEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import type { DisclosureProps } from './contract'
import { cn } from './cn'
import { Icon } from './Icon'

export const DISCLOSURE_SUMMARY_CLASS =
  'flex cursor-pointer list-none items-center gap-1.5 select-none [&::-webkit-details-marker]:hidden [&::marker]:hidden'

export const Disclosure = forwardRef<HTMLDetailsElement, DisclosureProps>(function Disclosure(
  { summary, children, open, defaultOpen = false, onToggle, summaryProps, className, ...rest },
  ref,
) {
  const controlled = open !== undefined
  // Mirror the native state so `aria-expanded` is right in the uncontrolled case too.
  const [innerOpen, setInnerOpen] = useState(defaultOpen)
  const isOpen = controlled ? open : innerOpen
  const handleToggle = (e: SyntheticEvent<HTMLDetailsElement>) => {
    const next = e.currentTarget.open
    if (!controlled) setInnerOpen(next)
    onToggle?.(next)
  }
  const { className: summaryClass, ...summaryRest } = summaryProps ?? {}
  return (
    <details
      ref={ref}
      open={isOpen}
      onToggle={handleToggle}
      className={cn('group', className)}
      {...rest}
    >
      <summary aria-expanded={isOpen} className={cn(DISCLOSURE_SUMMARY_CLASS, summaryClass)} {...summaryRest}>
        <Icon
          icon={ChevronRight}
          size={14}
          className="text-ink-3 transition-transform duration-[160ms] ease-[var(--ease-out)] group-open:rotate-90"
        />
        {summary}
      </summary>
      {children}
    </details>
  )
})
