import { useEffect, useRef, type RefObject } from 'react'

/** The one sticky-header recipe every screen spells (G4-2), round 2 (studio-upgrade-2 C4 / A).
 *
 * TRANSPARENT AT REST. The header and its band paint nothing until something has scrolled under
 * them; only then (`data-stuck`) do both fill with OPAQUE `surface-0` and the hairline appears.
 * At rest the header is simply the page, so there is nothing for the body glow (now on
 * `#root::before`, P0) to be cut out of — that was defect A1, the 25 px band visibly lighter than
 * the ground around it. No translucent wash, no backdrop blur: a 90 % wash with a blur showed
 * ghost text through the band in the v4 Settings shot.
 *
 * THE GLYPH STRIP (A2), found by the probe rather than papered over. `SHOT_PROBE=ghost` in
 * `test/screenshots/capture-observatory-v2.mjs` opens Sprint, leaves the pointer alone, crops the
 * 25 px band above the header at 1.2 / 1.6 / 2.0 / 2.5 s and reports the max per-channel
 * deviation from `surface-0` per pixel row (ghost = any row > 8/255). BEFORE, production build,
 * GRAPH surface: one ghost row at every early capture — the row straddling the header's top
 * edge — deviating 59 / 15 / 4 / 1 at the four times (a 1 px slice of text glyphs across the
 * column, fading). The bisect (`GHOST_BISECT=n`, one `addStyleTag` each):
 *   1 `[data-reveal]` transform:none, opacity:1 (no row stagger)  → still ghosts (38 / 9 / 3 / 1),
 *     different glyphs — the stagger changes WHAT shows, it is not the cause (H1 refuted as cause)
 *   2 slate scroller overflow:visible                            → unchanged (59 / 15 / 4 / 1)
 *   3 header position:static                                     → GONE (1 / 1 / 1 / 1)
 *   4 the header's `::before` band display:none                  → GONE (1 / 1 / 1 / 1)
 *   5 TABLE surface, no canvas                                   → still ghosts (59 / 15 / 4 / 1)
 *     — the live canvas was NOT a necessary condition after all, contrary to the prior.
 * So the strip needs exactly two things: the header being STICKY (its own compositor layer) and
 * the band being a `::before` box that meets the header's box edge to edge. The sticky layer's
 * bounds snap to device pixels while the pseudo box ends on the header's fractional top edge, and
 * the one row straddling that seam is rasterised from the layer underneath for the frames in which
 * that layer is still being repainted (the arrival tweens), then settles — H3 + H4. Fix by cause:
 * (H3) the header owns a stable layer (`will-change: transform`), and (H4) a REAL element replaces
 * the pseudo band — `attach()` appends it as a real child, so every consumer of
 * this class (P1's `PageHeader sticky`, P5's screens) gets it without rendering anything — sized
 * one pixel TALLER than the gap so it overlaps the header's own box and no edge-to-edge seam
 * exists at all. AFTER: see the numbers at the end of this comment.
 *
 * The band covers the 24 px of `<main>`'s padding above the header, which is exactly where content
 * used to bleed through; `-mx-6 px-6` spans that padding so the fill reaches the edges. Stays
 * INSIDE the screen root (never a wrapper), so `main.firstElementChild` and the `scrollWidth` pin
 * hold.
 *
 * AFTER (same probe, fresh production `npx vite build`, same fixture): Sprint GRAPH surface
 * 0 ghost rows at 1.2 / 1.6 / 2.0 / 2.5 s (worst 1 / 1 / 1 / 1 of 255); Sprint TABLE surface
 * 0 / 0 / 0 / 0 (worst 1); and, because S7 moved the Sprint header to the top of the screen, the
 * same measurement on the Board's filter bar — a sticky header that sits MID-page under the team
 * chips, with the rows staggering in beneath it (`GHOST_TARGET=board`) — 0 ghost rows at all four
 * times (worst 1). */
export const STICKY_HEADER_CLASS =
  'relative sticky top-0 z-10 -mx-6 px-6 pb-3 will-change-transform ' +
  'data-[stuck]:bg-surface-0 data-[stuck]:shadow-[0_1px_0_var(--color-line-1)]'

/** The real band `attach()` appends: 26 px tall for a 24 px gap, so it overlaps the header's own
 * box by one pixel — the seam that let one glyph row through cannot exist between two boxes that
 * overlap. Fills only under `data-stuck`, mirrored from the header by the same observer. */
export const STICKY_BAND_CLASS =
  'pointer-events-none absolute inset-x-0 -top-[25px] h-[26px] data-[stuck]:bg-surface-0'

/** The nearest ancestor that scrolls (`<main id="main">` in the shell; whatever hosts the screen
 * standalone). Null when nothing above the header scrolls — then it can never be stuck. */
function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY
    if (overflow === 'auto' || overflow === 'scroll') return node
  }
  return null
}

/** Watches one header; returns the detach function.
 *
 * WHY A SCROLL LISTENER AND NOT A SENTINEL (P7, measured in the real window). The first version
 * observed a 1 px sentinel riding INSIDE the header at `top:-1px`, expecting it to leave the
 * scrollport once the header stuck. It never did: a `sticky top-0` header pins at the scroll
 * container's padding edge — `<main>` is `p-6`, so the pinned top is 24 px — and for a header
 * that is the screen's first child that is ALSO its resting position. Probed on Settings:
 * `header.getBoundingClientRect().top` read 24 at `scrollTop` 0, 400 and 1516, so the sentinel
 * sat at 23 px, inside the scrollport, at every scroll offset, `data-stuck` never set, and the
 * v8 Settings capture showed the sections scrolling through a transparent header. The geometry
 * at rest and when stuck is identical for such a header; only the scroller's `scrollTop` tells
 * them apart. So: stuck = the scroller has scrolled at all AND the header's top sits at the
 * scroller's padding edge (a mid-page header, the Board's filter bar, is only pinned once the
 * content above it has scrolled away; until then its top is lower than the edge). Passive,
 * two rect reads per scroll event, attributes touched only on a change. */
function attach(header: HTMLElement): () => void {
  const band = document.createElement('span')
  band.setAttribute('aria-hidden', 'true')
  band.setAttribute('data-stuck-band', '')
  band.className = STICKY_BAND_CLASS
  header.appendChild(band)

  let current = false
  const setStuck = (stuck: boolean) => {
    if (stuck === current) return
    current = stuck
    header.toggleAttribute('data-stuck', stuck)
    band.toggleAttribute('data-stuck', stuck)
  }

  const scroller = scrollerOf(header)
  const measure = () => {
    if (!scroller || scroller.scrollTop <= 0) { setStuck(false); return }
    const edge = scroller.getBoundingClientRect().top + (parseFloat(getComputedStyle(scroller).paddingTop) || 0)
    setStuck(header.getBoundingClientRect().top <= edge + 1)
  }
  measure()
  scroller?.addEventListener('scroll', measure, { passive: true })
  // Content above a mid-page header can grow or shrink without a scroll (a notice arriving);
  // the screen root's size change re-measures. jsdom has no ResizeObserver: skipped there.
  const resize = typeof ResizeObserver !== 'undefined' && header.parentElement ? new ResizeObserver(measure) : null
  if (resize && header.parentElement) resize.observe(header.parentElement)

  return () => {
    scroller?.removeEventListener('scroll', measure)
    resize?.disconnect()
    band.remove()
    header.removeAttribute('data-stuck')
  }
}

/** Toggles `data-stuck=""` on a sticky header while it is pinned to the top of its scroll
 * container — see `attach` for the measurement and why it is a scroll listener.
 *
 * Re-checked after every render rather than once: most screens render a loading state first and
 * the header only afterwards, so a mount-only effect would observe nothing. The check is a single
 * identity comparison; the listener is only rebuilt when the element itself changes. Under jsdom
 * nothing scrolls, so a header is never stuck (and so never opaque — which is also what a cold
 * reload at scroll 0 paints). */
export function useStuck(ref: RefObject<HTMLElement | null>): void {
  const attached = useRef<{ el: HTMLElement; detach: () => void } | null>(null)

  useEffect(() => {
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
