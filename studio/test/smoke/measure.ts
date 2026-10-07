/** Reads the facts about the screen showing in the real window. Runs INSIDE the page, so it must be
 * self-contained: no imports, no references to anything outside this function. The judgement about
 * what the facts mean lives in findings.ts, where it can be unit-tested. */

import type { Page } from '@playwright/test'
import type { ScreenMeasure } from './findings'

export function measureScreen(page: Page): Promise<ScreenMeasure> {
  return page.evaluate((): ScreenMeasure => {
    const visible = (el: Element): boolean => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return false
      const s = getComputedStyle(el)
      return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) !== 0
    }
    const describe = (el: Element): string => {
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
      return `<${el.tagName.toLowerCase()}>${text ? ` "${text}"` : ''}`
    }

    const INTERACTIVE = 'button, a[href], input:not([type=hidden]), select, textarea, [role=tab], [role=button], [role=checkbox], [role=switch]'
    const controls = Array.from(document.querySelectorAll(INTERACTIVE)).filter(visible)

    const nameOf = (el: Element): string => {
      const aria = el.getAttribute('aria-label')
      if (aria?.trim()) return aria.trim()
      const by = el.getAttribute('aria-labelledby')
      if (by) {
        const joined = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim()
        if (joined) return joined
      }
      const input = el as HTMLInputElement
      if (input.labels && input.labels.length > 0) {
        const label = Array.from(input.labels).map((l) => l.textContent ?? '').join(' ').trim()
        if (label) return label
      }
      if (el.closest('label')?.textContent?.trim()) return 'label'
      if ((el.textContent ?? '').trim()) return (el.textContent ?? '').trim()
      const title = el.getAttribute('title')
      if (title?.trim()) return title.trim()
      const placeholder = el.getAttribute('placeholder')
      if (placeholder?.trim()) return placeholder.trim()
      return ''
    }

    const unnamed = controls.filter((el) => nameOf(el) === '').map((el) => {
      const near = (el.parentElement?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
      return `<${el.tagName.toLowerCase()}${el.getAttribute('type') ? ` type=${el.getAttribute('type')}` : ''}> near "${near}"`
    })

    const smallTargets = controls
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return (r.width < 24 || r.height < 24) && !(el as HTMLInputElement).type?.match(/^(checkbox|radio)$/)
      })
      .map((el) => `${describe(el)} is ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`)

    const width = window.innerWidth
    const SCROLLS_ON_PURPOSE = '[data-smoke-ignore], pre, code, .overflow-auto, .overflow-x-auto, .overflow-y-auto'
    const pageOffscreen = Array.from(document.body.querySelectorAll('*'))
      .filter((el) => visible(el) && el.getBoundingClientRect().right > width + 1 && !el.closest(SCROLLS_ON_PURPOSE))
    // The main panel scrolls inside the window, so content wider than IT is a sideways scrollbar the
    // page-level check cannot see (Settings did this at the normal window size).
    const main = document.querySelector('main')
    const mainOverflow = main !== null && main.scrollWidth > main.clientWidth + 1
    const mainRight = main ? main.getBoundingClientRect().right : width
    const mainOffscreen = mainOverflow && main
      ? Array.from(main.querySelectorAll('*')).filter((el) => visible(el) && el.getBoundingClientRect().right > mainRight + 1 && !el.closest('pre, code, [data-smoke-ignore]'))
      : []
    const offscreen = [...pageOffscreen, ...mainOffscreen].slice(0, 5).map(describe)

    // Cut-off text: a box that clips its own content, where the person cannot scroll to the rest.
    const truncated = Array.from(document.body.querySelectorAll('*'))
      .filter((el) => {
        if (!visible(el) || el.children.length > 0) return false
        const s = getComputedStyle(el)
        const clips = s.overflow === 'hidden' || s.overflowX === 'hidden' || s.textOverflow === 'ellipsis'
        return clips && el.scrollWidth > el.clientWidth + 1 && (el.textContent ?? '').trim().length > 0
      })
      .slice(0, 8)
      .map((el) => `${describe(el)} (${el.scrollWidth}px of text in ${el.clientWidth}px)`)

    const errorBanners = Array.from(document.querySelectorAll('[role=alert], [class*="command-error"]'))
      .filter(visible)
      .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 0)
      .slice(0, 5)

    return {
      text: document.body.innerText.slice(0, 20_000),
      width,
      overflowX: document.documentElement.scrollWidth > width + 1 || mainOverflow,
      offscreen,
      unnamed,
      smallTargets: smallTargets.slice(0, 8),
      truncated,
      errorBanners,
      headings: Array.from(document.querySelectorAll('h1, h2, h3, [role=heading]')).filter(visible).map((el) => (el.textContent ?? '').trim()).filter(Boolean).slice(0, 10),
      interactive: controls.filter((el) => !(el as HTMLButtonElement).disabled).length,
      imagesWithoutAlt: Array.from(document.querySelectorAll('img')).filter((el) => visible(el) && !el.hasAttribute('alt')).length,
    }
  })
}
