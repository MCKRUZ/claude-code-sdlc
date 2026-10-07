// #32 PageHeader (S1): one header for every screen. Eyebrow (the area, "BUILD · BOARD") in the
// eyebrow voice · `h2 data-page-heading tabIndex=-1` carrying the screen's heading text
// BYTE-IDENTICAL to today (heading pins; `focusOnNavigate` lands here) · the lede as the h2's
// NEXT SIBLING `<p>` (BuildBoard.test reads the spec count from `h2.nextElementSibling`) ·
// right-aligned actions. `sticky` emits `STICKY_HEADER_CLASS` and calls `useStuck` — both by name
// from `components/useStuck.ts`, the one sticky recipe, so the ghost-strip fix lands here too.
// Rendered INSIDE the screen root, never as `<main>`'s first child on its own, so
// `main.firstElementChild` pins hold. `useStuck` is guarded for jsdom (no IntersectionObserver).
import { forwardRef, useImperativeHandle, useRef } from 'react'
import { STICKY_HEADER_CLASS, useStuck } from '../components/useStuck'
import type { PageHeaderProps } from './contract'
import { cn } from './cn'
import { Eyebrow } from './Eyebrow'

export const PAGE_HEADER_CLASS = 'flex items-start justify-between gap-4'
export const PAGE_LEDE_CLASS = 'mt-1 max-w-[64ch] text-sm text-ink-3'

export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(function PageHeader(
  { eyebrow, title, lede, actions, sticky = false, headingProps, className, ...rest },
  ref,
) {
  const header = useRef<HTMLElement | null>(null)
  useImperativeHandle(ref, () => header.current as HTMLElement)
  // Always called (hooks rule); it only attaches when the header is sticky.
  useStuck(sticky ? header : { current: null })
  const { className: headingClass, ...headingRest } = headingProps ?? {}
  return (
    <header
      ref={header}
      data-page-header=""
      data-sticky={sticky ? '' : undefined}
      className={cn(PAGE_HEADER_CLASS, sticky && STICKY_HEADER_CLASS, className)}
      {...rest}
    >
      <div className="min-w-0">
        {eyebrow ? <Eyebrow className="mb-1">{eyebrow}</Eyebrow> : null}
        <h2 data-page-heading="" tabIndex={-1} className={cn('text-xl text-ink-1', headingClass)} {...headingRest}>
          {title}
        </h2>
        {lede ? <p className={PAGE_LEDE_CLASS}>{lede}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
})
