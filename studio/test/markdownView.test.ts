/** How a document's markdown reaches the screen.
 *
 * Field values are the markdown source exactly as stored in the file (that is what keeps a
 * save byte-exact), so read mode has to turn them into something a person can read — and the
 * same documents are edited by teammates, so it has to do that WITHOUT trusting them. A page
 * that renders whatever HTML a colleague typed into a requirements doc is a hole, not a feature.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MarkdownView } from '../src/components/MarkdownView'

const render = (source: string) => renderToStaticMarkup(createElement(MarkdownView, { source }))

describe('rendering document markdown', () => {
  it('turns a ### heading into a heading, not the literal marks', () => {
    const html = render('### 1. Adopt, don’t replace\n\nEvery decision defaults to adopting.')
    expect(html).toMatch(/<h[1-6][^>]*>1\. Adopt, don’t replace<\/h[1-6]>/)
    expect(html).not.toContain('###')
  })

  it('renders a table as a real table', () => {
    const html = render('| Decision Type | Owner |\n|---|---|\n| Phase transitions | Matt |\n')
    expect(html).toContain('<table')
    expect(html).toMatch(/<th[^>]*>Decision Type<\/th>/)
    expect(html).toMatch(/<td[^>]*>Phase transitions<\/td>/)
    expect(html).not.toContain('|---|')
  })

  it('renders bold and bullet lists', () => {
    const html = render('- **Name:** token-tracker\n- **Created:** 2026-09-15\n')
    expect(html).toContain('<ul')
    expect(html).toMatch(/<strong[^>]*>Name:<\/strong>/)
    expect(html).not.toContain('**')
  })

  it('draws a checklist as ticked and unticked marks, not as controls', () => {
    const html = render('- [x] Gate passed\n- [ ] Sign-off recorded\n')
    expect(html).toContain('☑')
    expect(html).toContain('☐')
    // Nothing that looks operable outside edit mode — not even a disabled checkbox.
    expect(html).not.toContain('<input')
  })

  it('does not execute or emit raw HTML a colleague typed into a document', () => {
    const html = render('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\ntext')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('onerror')
  })

  it('hides the HTML comments templates use as scaffolding', () => {
    const html = render('<!-- Phase 0 — Discovery | Required artifact -->\n\nReal content')
    expect(html).not.toContain('Phase 0')
    expect(html).toContain('Real content')
  })

  it('never makes a link that could navigate the app window', () => {
    for (const source of ['[docs](https://example.com)', '[x](javascript:alert(1))']) {
      const html = render(source)
      expect(html, source).not.toMatch(/<a[\s>]/)
      expect(html, source).not.toContain('href=')
    }
    expect(render('[docs](https://example.com)')).toContain('docs')
  })

  it('never loads a remote image just because a document mentions one', () => {
    const html = render('![tracking pixel](https://tracker.example/p.png)')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('tracker.example')
  })

  it('renders nothing for an empty value rather than an empty box', () => {
    expect(render('   \n')).toBe('')
  })
})
