/** Owner's v12 item 6: the whole shell sat ~8 px high on the closing and review shots because
 * the document had scrolled. The rule is structural, so the test reads the stylesheet: `html`,
 * `body` and `#root` are the viewport's exact height and clip; none of them keeps a `min-height`
 * that content could re-grow; `<main>` stays the one scroller in Frame. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(import.meta.dirname, '..', 'src', 'theme', 'base.css'), 'utf-8')
const frame = readFileSync(join(import.meta.dirname, '..', 'src', 'components', 'Frame.tsx'), 'utf-8')

/** The declarations of the first rule whose selector list is exactly these selectors. */
function rule(selectors: string[]): string {
  const re = new RegExp(`${selectors.map((s) => s.replace('#', '\\#')).join(',\\s*')}\\s*\\{([^}]*)\\}`)
  const m = re.exec(css)
  if (!m) throw new Error(`no rule for ${selectors.join(', ')}`)
  return m[1]
}

describe('the root never scrolls', () => {
  it('html, body and #root are height 100% and overflow hidden', () => {
    const decl = rule(['html', 'body', '#root'])
    expect(decl).toMatch(/height:\s*100%/)
    expect(decl).toMatch(/overflow:\s*hidden/)
  })

  it('no root box keeps a min-height content could grow', () => {
    for (const sel of [['html'], ['body'], ['#root']]) {
      expect(rule(sel)).not.toMatch(/min-height/)
    }
  })

  it('<main> is the scroller inside the Frame', () => {
    expect(frame).toMatch(/<main id="main" tabIndex=\{-1\} className=\{cn\('min-w-0 flex-1 overflow-auto'/)
    expect(frame).toMatch(/className="flex h-screen flex-col/)
  })

  // v13 (the integrator): <main> is also POSITIONED — the containing block of every absolutely
  // positioned descendant, so none can resolve against the viewport, escape main's clip and grow
  // the document (the review/closing probe measured the root at 1440×1608, scrolled 7.5 px). The
  // rule is in the stylesheet because the class list on <main> is frame.memo.test's pin.
  it('<main> is positioned, so it clips what it scrolls', () => {
    expect(rule(['main#main'])).toMatch(/position:\s*relative/)
  })
})
