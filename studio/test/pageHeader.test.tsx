// @vitest-environment jsdom
// S1 PageHeader: the heading text is byte-identical to what the screen passes, carries
// `data-page-heading tabIndex=-1`, the lede is the h2's next sibling, the eyebrow is a word in
// ink-3 (never ink-4), actions sit to the right, and `sticky` emits the one STICKY_HEADER_CLASS.
import { render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PageHeader, Button, cn } from '../src/ui'
import { STICKY_HEADER_CLASS } from '../src/components/useStuck'

describe('PageHeader', () => {
  it('renders eyebrow · h2[data-page-heading][tabindex=-1] · lede as the next sibling · actions', () => {
    render(
      <section>
        <PageHeader eyebrow="Build · Board" title="Build" lede="6 specs" actions={<Button>Refresh</Button>} />
      </section>,
    )
    const heading = screen.getByRole('heading', { level: 2, name: 'Build' })
    expect(heading.textContent).toBe('Build')
    expect(heading.hasAttribute('data-page-heading')).toBe(true)
    expect(heading.tabIndex).toBe(-1)
    expect(heading.nextElementSibling?.tagName).toBe('P')
    expect(heading.nextElementSibling?.textContent).toBe('6 specs')
    expect(heading.nextElementSibling?.className).toContain('max-w-[64ch]')
    expect(heading.nextElementSibling?.className).toContain('text-ink-3')
    const eyebrow = screen.getByText('Build · Board')
    expect(eyebrow.className).toContain('text-ink-3')
    expect(eyebrow.className).not.toContain('ink-4')
    expect(eyebrow.className).toContain('uppercase')
    expect(screen.getByRole('button', { name: 'Refresh' }).closest('header')).toBe(heading.closest('header'))
    expect(heading.closest('header')?.parentElement?.tagName).toBe('SECTION')
  })

  it('headingProps reach the h2 (an id for aria-labelledby, a data-flip-id)', () => {
    render(<PageHeader title="Sprint" headingProps={{ id: 'sprint-title', 'data-flip-id': 'title:sprint' } as never} />)
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading.id).toBe('sprint-title')
    expect(heading.getAttribute('data-flip-id')).toBe('title:sprint')
  })

  it('sticky emits STICKY_HEADER_CLASS and data-sticky; the default header does not', () => {
    const plain = renderToStaticMarkup(<PageHeader title="Settings" />)
    expect(plain).not.toContain('sticky')
    const sticky = renderToStaticMarkup(<PageHeader title="Settings" sticky />)
    // `cn` merges `relative sticky` to `sticky` (one position value); every surviving token is emitted.
    for (const token of cn(STICKY_HEADER_CLASS).split(/\s+/)) expect(sticky).toContain(token)
    expect(sticky).toContain('data-sticky=""')
    // The heading text survives untouched in both.
    expect(sticky).toContain('>Settings</h2>')
  })

  it('renders no lede or actions wrappers when none are given', () => {
    const html = renderToStaticMarkup(<PageHeader title="Only" />)
    expect(html).not.toContain('<p')
    expect((html.match(/<div/g) ?? []).length).toBe(1)
  })
})
