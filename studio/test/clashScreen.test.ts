/** The clash screen, as a person meets it.
 *
 * It used to put two full versions side by side. On a real project the versions of a 200-line
 * spec differed in two words and looked identical, so the person could not tell what they were
 * being asked to choose between, or which version was newer. It now says what differs, shows only
 * that, and says when each version was last changed and by whom.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { FileClash } from '../shared/types'
import { ClashScreen } from '../src/components/ClashScreen'

const LOCAL = '# Spec\n\n' + Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n') + '\n- any job with `id-token=***` or login.\n'
const REMOTE = '# Spec\n\n' + Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n') + '\n- any job with `id-token: write` or login.\n'

const CLASH: FileClash = {
  path: 'specs/0025-self-hosted-ci-runner.md',
  localModifiedAt: '2026-09-28T17:58:22.000Z',
  remote: { author: 'Matt Kruczek', when: '2026-09-28T17:56:12.000Z', subject: 'docs: add spec 0025 self-hosted CI runner' },
  sections: [{ key: '__whole_file__', heading: 'specs/0025-self-hosted-ci-runner.md', localText: LOCAL, remoteText: REMOTE }],
}

const render = (clashes: FileClash[] = [CLASH]) =>
  renderToStaticMarkup(createElement(ClashScreen, {
    clashes, onResolve: async () => {}, onCombine: async () => '', onDone: () => {},
  }))

describe('ClashScreen', () => {
  it('says in a sentence how much differs', () => {
    expect(render()).toContain('1 line differs, out of 43.')
  })

  it('shows the lines that differ, from each side, labelled', () => {
    // What a person reads, not the markup: the changed words sit in highlight spans of their own.
    const text = render().replace(/<[^>]+>/g, '')
    expect(text).toContain('Yours')
    expect(text).toContain('Theirs')
    expect(text).toContain('id-token=***')
    expect(text).toContain('id-token: write')
  })

  it('highlights only the words that changed', () => {
    const html = render()
    const marked = [...html.matchAll(/<mark[^>]*>(.*?)<\/mark>/g)].map((m) => m[1].replace(/&#x27;|&quot;/g, '').trim())
    expect(marked.some((t) => t.includes('id-token=***'))).toBe(true)
    expect(marked.some((t) => t.includes('id-token:'))).toBe(true)
    expect(marked.some((t) => t.includes('deploy') || t.includes('any job'))).toBe(false)
  })

  it('folds away the identical stretch instead of printing it', () => {
    const html = render()
    expect(html).toMatch(/\d+ identical lines/)
    // Only the context near the change is printed; line 0 is far from it.
    expect(html).not.toMatch(/<[^>]*>line 0</)
  })

  it('says when each version was last changed', () => {
    const html = render()
    expect(html).toContain('Last saved')
    expect(html).toContain('Last changed')
    expect(html).toContain('2026')
  })

  it('says who changed theirs and why', () => {
    const html = render()
    expect(html).toContain('Matt Kruczek')
    expect(html).toContain('docs: add spec 0025 self-hosted CI runner')
  })

  it('still offers both versions in full, one click away', () => {
    expect(render()).toContain('Show both versions in full')
  })

  it('still offers the three ways to settle it', () => {
    const html = render()
    for (const label of ['Keep mine', 'Keep theirs', 'Let Claude combine']) expect(html).toContain(label)
  })

  it('does not invent dates it was not given', () => {
    const html = render([{ ...CLASH, localModifiedAt: undefined, remote: undefined }])
    expect(html).not.toContain('Last saved')
    expect(html).not.toContain('Last changed')
  })

  it('says plainly when the two versions have the same text', () => {
    const same = { ...CLASH, sections: [{ ...CLASH.sections[0], remoteText: LOCAL }] }
    expect(render([same])).toContain('The two versions have the same text.')
  })
})
