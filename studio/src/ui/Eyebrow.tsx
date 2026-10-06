// #6 Eyebrow: the section / group label used 28 times. The voice is the `--text-eyebrow` token
// (11 px, 600, 0.08 em, line 16 — spec §6) in `--color-eyebrow` (= `ink-3` in both themes, C2: a
// label is a word, so it never wears `ink-4`). `as` picks the element so a section label can be a
// real heading where the structure needs one; DocumentsTab keeps its literal string.
//
// WHY the font-size is spelled through `text-(length:…)` and friends rather than `text-eyebrow`:
// Tailwind resolves a `text-*` candidate against `--color-*` BEFORE `--text-*`, and round 2's
// `--color-eyebrow` token means `text-eyebrow` now compiles to `color: var(--color-eyebrow)` only
// — the 11 px / 600 / 0.08 em typography would be silently lost. Reading the four `--text-eyebrow`
// variables by name keeps the token the source of truth and is correct whichever way the
// collision is later resolved.
import { forwardRef } from 'react'
import type { EyebrowProps } from './contract'
import { cn } from './cn'

/** The eyebrow TYPOGRAPHY alone (size, line, weight, tracking, caps) — for a label that wears a
 * different colour (a tinted table header, a plate label on a scene). */
export const EYEBROW_TYPE_CLASS =
  'text-(length:--text-eyebrow) leading-(--text-eyebrow--line-height) font-(--text-eyebrow--font-weight) tracking-(--text-eyebrow--letter-spacing) uppercase'

export const EYEBROW_CLASS = `${EYEBROW_TYPE_CLASS} text-ink-3`

export const Eyebrow = forwardRef<HTMLElement, EyebrowProps>(function Eyebrow({ as = 'p', className, ...rest }, ref) {
  const Tag = as
  return <Tag ref={ref as never} className={cn(EYEBROW_CLASS, className)} {...rest} />
})
