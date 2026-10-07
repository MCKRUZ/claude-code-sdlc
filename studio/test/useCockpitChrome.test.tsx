// @vitest-environment jsdom
/** `--cockpit-chrome` measured from the DOM (v13 fixer round): the grid's own top in the window
 * plus the branch's fixed parts, written inline so a wrapped header moves the wells with it; read
 * at REST (`rect.top + <main>.scrollTop`) so scrolling <main> never moves them; and nothing is
 * written when nothing is laid out (jsdom's zero rects) — the class defaults stand. */
import { act, cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { COCKPIT_CHROME_PX, COCKPIT_CHROME_WITH_STRIP_PX, COCKPIT_TOP_PX } from '../src/components/lanes/cockpitLayout'
import { COCKPIT_CHROME_PROPERTY, measureCockpitChrome, useCockpitChrome } from '../src/components/lanes/useCockpitChrome'

afterEach(cleanup)

function laidOut(el: HTMLElement, rect: Partial<DOMRect>, clientWidth?: number) {
  el.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}), ...rect }) as DOMRect
  if (clientWidth !== undefined) Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true })
}

function Host({ active }: { active: boolean }) {
  const home = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  useCockpitChrome(home, grid, active)
  return (
    <main id="main">
      <div ref={home} data-home="">
        <div ref={grid} data-grid="" />
      </div>
    </main>
  )
}

describe('measureCockpitChrome', () => {
  it('rail: the grid top plus main\'s padding; strip: plus the strip, its gap and the filter row', () => {
    const home = document.createElement('div'), grid = document.createElement('div')
    home.appendChild(grid)
    laidOut(grid, { top: COCKPIT_TOP_PX }); laidOut(home, {}, 1352)
    expect(measureCockpitChrome(home, grid)).toBe(COCKPIT_CHROME_PX)
    laidOut(home, {}, 1192)
    expect(measureCockpitChrome(home, grid)).toBe(COCKPIT_CHROME_WITH_STRIP_PX)
    // A wrapped header: the grid sits 24 px lower, so does the chrome.
    laidOut(grid, { top: COCKPIT_TOP_PX + 24 }); laidOut(home, {}, 1352)
    expect(measureCockpitChrome(home, grid)).toBe(COCKPIT_CHROME_PX + 24)
    // v14: the strip is sized to whole rows, so its REAL height counts in the strip branch — a
    // 150 px strip at 1192 → 372 + 150 + 16 + 40 + 24; the rail branch ignores the Today element.
    const today = document.createElement('section')
    today.setAttribute('data-today-rail', '')
    Object.defineProperty(today, 'offsetHeight', { value: 150, configurable: true })
    grid.appendChild(today)
    laidOut(grid, { top: COCKPIT_TOP_PX }); laidOut(home, {}, 1192)
    expect(measureCockpitChrome(home, grid)).toBe(COCKPIT_TOP_PX + 150 + 16 + 40 + 24)
    laidOut(home, {}, 1352)
    expect(measureCockpitChrome(home, grid)).toBe(COCKPIT_CHROME_PX)
  })

  it('reads the top AT REST: a scrolled <main> adds its scrollTop back, so the wells never move while scrolling', () => {
    const main = document.createElement('main'), home = document.createElement('div'), grid = document.createElement('div')
    main.appendChild(home); home.appendChild(grid); document.body.appendChild(main)
    Object.defineProperty(main, 'scrollTop', { value: 300, configurable: true })
    laidOut(grid, { top: COCKPIT_TOP_PX - 300 }); laidOut(home, {}, 1352)
    expect(measureCockpitChrome(home, grid)).toBe(COCKPIT_CHROME_PX)
    main.remove()
  })

  it('not laid out (a zero rect or a zero width) → null, never a chrome of 24', () => {
    const home = document.createElement('div'), grid = document.createElement('div')
    expect(measureCockpitChrome(home, grid)).toBeNull()
    laidOut(grid, { top: 372 })
    expect(measureCockpitChrome(home, grid)).toBeNull()
  })
})

describe('useCockpitChrome', () => {
  it('writes the property once laid out, follows a window resize, and removes it when inactive or unmounted', () => {
    const { container, rerender, unmount } = render(<Host active />)
    const grid = container.querySelector('[data-grid]') as HTMLElement
    const home = container.querySelector('[data-home]') as HTMLElement
    // jsdom: zero rects → nothing written, the class defaults stand.
    expect(grid.style.getPropertyValue(COCKPIT_CHROME_PROPERTY)).toBe('')
    laidOut(grid, { top: COCKPIT_TOP_PX }); laidOut(home, {}, 1352)
    act(() => { window.dispatchEvent(new Event('resize')) })
    expect(grid.style.getPropertyValue(COCKPIT_CHROME_PROPERTY)).toBe(`${COCKPIT_CHROME_PX}px`)
    laidOut(home, {}, 1192)
    act(() => { window.dispatchEvent(new Event('resize')) })
    expect(grid.style.getPropertyValue(COCKPIT_CHROME_PROPERTY)).toBe(`${COCKPIT_CHROME_WITH_STRIP_PX}px`)
    rerender(<Host active={false} />)
    expect(grid.style.getPropertyValue(COCKPIT_CHROME_PROPERTY)).toBe('')
    rerender(<Host active />)
    expect(grid.style.getPropertyValue(COCKPIT_CHROME_PROPERTY)).toBe(`${COCKPIT_CHROME_WITH_STRIP_PX}px`)
    unmount()
    expect(grid.style.getPropertyValue(COCKPIT_CHROME_PROPERTY)).toBe('')
  })
})
