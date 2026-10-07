// `--cockpit-chrome`, measured (v13 fixer round, owner's v12 item 1). The cockpit row is
// `100dvh − chrome`; the CSS classes carry the first-paint defaults (`cockpitLayout.ts`:
// COCKPIT_TOP_PX + the branch's own strip / filter / padding), and this hook replaces them with
// the grid's REAL top in the window once it is laid out — so a header that wraps (a long goal,
// many mix chips) or a shorter In-the-room row moves the wells with it, and the four wells and
// the rail still end exactly 24 px above the fold. Pure arithmetic lives in `cockpitLayout.ts`
// (`cockpitChromeFor`); this file only reads the DOM and writes one custom property.
//
// Reads the grid's top AT REST — `rect.top + <main>.scrollTop` — so scrolling <main> never moves
// the wells (the rect alone shrinks as the person scrolls to Refining). Bails without writing
// when nothing is laid out (jsdom: every rect is 0), so the class defaults stand under test.
import { useLayoutEffect, useState, type RefObject } from 'react'
import { cockpitChromeFor, todayBranch, type TodayBranch } from './cockpitLayout'

export const COCKPIT_CHROME_PROPERTY = '--cockpit-chrome'

/** The chrome for a laid-out home grid, or null when the geometry is not readable (not laid out,
 * or detached). In the strip branch the Today strip's REAL height counts (v14: the strip is sized
 * to whole rows, not capped, so the nominal `STRIP_MAX_PX` is only the first-paint default); a
 * strip that measures nothing (jsdom) falls back to it. Exported for the test; `useCockpitChrome`
 * writes it. */
export function measureCockpitChrome(home: HTMLElement, grid: HTMLElement): number | null {
  const rect = grid.getBoundingClientRect()
  const scroller = grid.closest('main')
  const top = rect.top + (scroller?.scrollTop ?? 0)
  const width = home.clientWidth
  if (!(top > 0) || !(width > 0)) return null
  const stripHeight = grid.querySelector<HTMLElement>('[data-today-rail]')?.offsetHeight ?? 0
  return Math.round(cockpitChromeFor(width, top, stripHeight > 0 ? stripHeight : undefined))
}

/** Which Today branch the home is in — `todayBranch(home.clientWidth)`, the same width the
 * `@max-[1239px]` classes measure — or null while nothing is laid out (jsdom's zero widths), so
 * a component that folds rows in the strip never folds under test unless told to. Re-read on
 * resize and whenever `ready` flips, because the home's root is a different element before the
 * command-center read lands than after. */
export function useTodayBranch(home: RefObject<HTMLElement | null>, ready: boolean): TodayBranch | null {
  const [branch, setBranch] = useState<TodayBranch | null>(null)
  useLayoutEffect(() => {
    const apply = () => {
      const width = home.current?.clientWidth ?? 0
      setBranch(width > 0 ? todayBranch(width) : null)
    }
    apply()
    window.addEventListener('resize', apply)
    const observer = typeof ResizeObserver !== 'undefined' && home.current ? new ResizeObserver(apply) : null
    if (observer && home.current) observer.observe(home.current)
    return () => {
      window.removeEventListener('resize', apply)
      observer?.disconnect()
    }
  }, [home, ready])
  return branch
}

export function useCockpitChrome(home: RefObject<HTMLElement | null>, grid: RefObject<HTMLElement | null>, active: boolean): void {
  useLayoutEffect(() => {
    if (!active) return
    const apply = () => {
      const h = home.current, g = grid.current
      if (!h || !g) return
      const chrome = measureCockpitChrome(h, g)
      if (chrome === null) g.style.removeProperty(COCKPIT_CHROME_PROPERTY)
      else g.style.setProperty(COCKPIT_CHROME_PROPERTY, `${chrome}px`)
    }
    apply()
    window.addEventListener('resize', apply)
    // The header or In-the-room wrapping changes the home's height and the grid's top with it;
    // the observer answers that without a timer. Setting an unchanged value re-fires nothing.
    const observer = typeof ResizeObserver !== 'undefined' && home.current ? new ResizeObserver(apply) : null
    if (observer && home.current) observer.observe(home.current)
    return () => {
      window.removeEventListener('resize', apply)
      observer?.disconnect()
      grid.current?.style.removeProperty(COCKPIT_CHROME_PROPERTY)
    }
  }, [home, grid, active])
}
