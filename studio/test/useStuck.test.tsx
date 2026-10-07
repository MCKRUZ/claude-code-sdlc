// @vitest-environment jsdom
/** C4 / (A) the ghost strip (studio-upgrade-2 §4 P3, mechanism re-measured by P7): the sticky
 * header is TRANSPARENT at rest and opaque `surface-0` only under `data-stuck` — header and band
 * alike — with no translucent wash and no blur; the band is a real element the hook appends, one
 * pixel taller than the gap so the two boxes overlap and no seam exists; and the attribute follows
 * the nearest scroller: stuck once it has scrolled and the header sits at its padding edge. jsdom
 * has no layout (every rect is 0 × 0 at 0,0), so "pinned at the edge" is always true here and the
 * scroller's `scrollTop` alone drives the state — exactly the signal the real window relies on. */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { STICKY_BAND_CLASS, STICKY_HEADER_CLASS, useStuck } from '../src/components/useStuck'

function Header() {
  const ref = useRef<HTMLDivElement>(null)
  useStuck(ref)
  return (
    <div ref={ref} data-testid="header" className={STICKY_HEADER_CLASS}>
      <h2>Sprint</h2>
    </div>
  )
}

/** The shell's shape: a scrolling `<main>` with the screen root inside it. */
function Shell() {
  return (
    <main data-testid="main" style={{ overflowY: 'auto', padding: 24 }}>
      <div><Header /><p>below</p></div>
    </main>
  )
}

afterEach(cleanup)

const bare = (cls: string, token: string) => new RegExp(`(^|\\s)${token.replace(/[[\]().*+?^$|\\/-]/g, '\\$&')}(\\s|$)`).test(cls)

const scrollTo = (main: HTMLElement, top: number) => {
  main.scrollTop = top
  fireEvent.scroll(main)
}

describe('useStuck / STICKY_HEADER_CLASS: transparent at rest, opaque only when stuck', () => {
  it('the class paints no fill, wash or blur at rest and fills only under data-stuck', () => {
    expect(bare(STICKY_HEADER_CLASS, 'bg-surface-0')).toBe(false)
    expect(STICKY_HEADER_CLASS).toContain('data-[stuck]:bg-surface-0')
    expect(STICKY_HEADER_CLASS).toMatch(/\bsticky\b/)
    expect(STICKY_HEADER_CLASS).not.toMatch(/backdrop|bg-surface-0\/\d|before:/)
    // H3: the sticky header owns a stable compositor layer.
    expect(STICKY_HEADER_CLASS).toContain('will-change-transform')
    // The band is the same story: filled only when stuck, and taller than the 24 px gap so it
    // overlaps the header's box (26 for 24 + the 1 px seam row).
    expect(bare(STICKY_BAND_CLASS, 'bg-surface-0')).toBe(false)
    expect(STICKY_BAND_CLASS).toContain('data-[stuck]:bg-surface-0')
    expect(STICKY_BAND_CLASS).toContain('-top-[25px]')
    expect(STICKY_BAND_CLASS).toContain('h-[26px]')
  })

  it('appends a real band, adds no sentinel box, and has no data-stuck at rest', () => {
    const { getByTestId } = render(<Shell />)
    const header = getByTestId('header')
    expect(header.hasAttribute('data-stuck')).toBe(false)
    const band = header.querySelector('[data-stuck-band]') as HTMLElement
    expect(band).toBeTruthy()
    expect(band.getAttribute('aria-hidden')).toBe('true')
    expect(band.className).toBe(STICKY_BAND_CLASS)
    expect(band.hasAttribute('data-stuck')).toBe(false)
    expect(header.querySelector('[data-stuck-sentinel]')).toBeNull()
  })

  it('gains data-stuck on header AND band once the scroller has scrolled, loses it back at the top', () => {
    const { getByTestId } = render(<Shell />)
    const header = getByTestId('header')
    const main = getByTestId('main')
    const band = header.querySelector('[data-stuck-band]') as HTMLElement
    scrollTo(main, 120)
    expect(header.hasAttribute('data-stuck')).toBe(true)
    expect(band.hasAttribute('data-stuck')).toBe(true)
    scrollTo(main, 0)
    expect(header.hasAttribute('data-stuck')).toBe(false)
    expect(band.hasAttribute('data-stuck')).toBe(false)
  })

  it('with no scrolling ancestor the header is never stuck', () => {
    const { getByTestId } = render(<div><Header /></div>)
    const header = getByTestId('header')
    fireEvent.scroll(window)
    expect(header.hasAttribute('data-stuck')).toBe(false)
  })

  it('detaches cleanly: listener gone, band removed, attribute cleared', () => {
    const { getByTestId, unmount } = render(<Shell />)
    const header = getByTestId('header')
    const main = getByTestId('main')
    scrollTo(main, 120)
    expect(header.hasAttribute('data-stuck')).toBe(true)
    unmount()
    expect(header.querySelector('[data-stuck-band]')).toBeNull()
    expect(header.hasAttribute('data-stuck')).toBe(false)
    // A late scroll on the detached scroller changes nothing.
    scrollTo(main, 300)
    expect(header.hasAttribute('data-stuck')).toBe(false)
  })
})
