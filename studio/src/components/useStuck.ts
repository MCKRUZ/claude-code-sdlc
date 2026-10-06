import { useEffect, useRef, type RefObject } from 'react'

/** The one sticky-header recipe every screen spells (G4-2). Flush with the page at rest; a
 * hairline (`data-[stuck]`) only once something has scrolled under it. The `::before` band covers
 * the 24 px of `<main>`'s padding above the header, which is exactly where content used to bleed
 * through; `-mx-6 px-6` spans that padding so the fill reaches the edges. The fill is OPAQUE
 * surface-0 on purpose — a 90 % wash with a blur still showed ghost text through the band in the
 * v4 Settings shot, and surface-0 is the page ground, so at rest the header is invisible anyway.
 * The band is 25 px for a 24 px gap: a half-pixel seam at its top edge let one frame of the list
 * reveal show through (v5 sprint-graph shot). Stays INSIDE the screen
 * root (never a wrapper), so `main.firstElementChild` and the `scrollWidth` pin hold. */
export const STICKY_HEADER_CLASS =
  'relative sticky top-0 z-10 -mx-6 bg-surface-0 px-6 pb-3 ' +
  'before:pointer-events-none before:absolute before:inset-x-0 before:-top-[25px] before:h-[25px] before:bg-surface-0 ' +
  'data-[stuck]:shadow-[0_1px_0_var(--color-line-1)]'

/** Watches one header; returns the detach function. */
function attach(header: HTMLElement): () => void {
  const sentinel = document.createElement('span')
  sentinel.setAttribute('aria-hidden', 'true')
  sentinel.setAttribute('data-stuck-sentinel', '')
  // Inline rather than a class: the sentinel is not React's, so it must carry its own box.
  sentinel.style.cssText = 'position:absolute;top:-1px;left:0;width:1px;height:1px;pointer-events:none;visibility:hidden'
  header.appendChild(sentinel)

  const observer = new IntersectionObserver(([entry]) => {
    if (!entry) return
    if (entry.isIntersecting) header.removeAttribute('data-stuck')
    else header.setAttribute('data-stuck', '')
  }, { threshold: [0, 1] })
  observer.observe(sentinel)

  return () => {
    observer.disconnect()
    sentinel.remove()
    header.removeAttribute('data-stuck')
  }
}

/** Toggles `data-stuck=""` on a sticky header while it is pinned to the top of its scroll
 * container.
 *
 * A 1 px sentinel sits at the header's top edge (absolutely positioned at `top:-1px`, so it adds
 * no box to the parent's `space-y-*` rhythm — a sibling node would pick up the gap margin). While
 * the header is in normal flow the sentinel is visible; once the header sticks, the sentinel is
 * 1 px above the scrollport and clipped by `<main>`'s overflow, which IntersectionObserver reports
 * as not intersecting. No scroll listener, no layout read per frame.
 *
 * Re-checked after every render rather than once: most screens render a loading state first and
 * the header only afterwards, so a mount-only effect would observe nothing. The check is a single
 * identity comparison; the observer is only rebuilt when the element itself changes.
 *
 * Guarded: jsdom has no IntersectionObserver, so under test the header is simply never stuck. */
export function useStuck(ref: RefObject<HTMLElement | null>): void {
  const attached = useRef<{ el: HTMLElement; detach: () => void } | null>(null)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const header = ref.current
    if (attached.current?.el === header) return
    attached.current?.detach()
    attached.current = header ? { el: header, detach: attach(header) } : null
  })

  useEffect(() => () => {
    attached.current?.detach()
    attached.current = null
  }, [])
}
