// #6 Eyebrow: the section / group label used 28 times. `text-eyebrow` is the shared token
// (11 px, 600, 0.08em, line 16 — spec §6) so every label the kit, sidebar and plates draw agrees;
// the old 12 px / 0.025em pattern shouted. `as` picks the element so a section label can be a
// real heading where the structure needs one; DocumentsTab keeps its literal string.
import { forwardRef } from 'react'
import type { EyebrowProps } from './contract'
import { cn } from './cn'

export const EYEBROW_CLASS = 'text-eyebrow uppercase text-ink-4'

export const Eyebrow = forwardRef<HTMLElement, EyebrowProps>(function Eyebrow({ as = 'p', className, ...rest }, ref) {
  const Tag = as
  return <Tag ref={ref as never} className={cn(EYEBROW_CLASS, className)} {...rest} />
})
