// @vitest-environment jsdom
// B6 figures: six names, each an `aria-hidden` SVG ≤ 120×72 with no `<text>`, no digit in its
// text content, at most one accent dot, hairlines in `line-2`, and byte-identical on re-render.
import { render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Check } from 'lucide-react'
import { EMPTY_FIGURE_NAMES, EmptyFigure, EmptyState } from '../../src/ui'

describe('EmptyFigure', () => {
  it('has exactly the six names the contract freezes', () => {
    expect([...EMPTY_FIGURE_NAMES]).toEqual(['rail', 'constellation', 'page', 'conversation', 'prompt', 'aligned'])
  })

  it.each(EMPTY_FIGURE_NAMES)('%s is aria-hidden, ≤ 120×72, has no <text> and no digit, and at most one accent dot', (figure) => {
    const { container } = render(<EmptyFigure figure={figure} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('focusable')).toBe('false')
    expect(svg.getAttribute('data-empty-figure')).toBe(figure)
    expect(Number(svg.getAttribute('width'))).toBeLessThanOrEqual(120)
    expect(Number(svg.getAttribute('height'))).toBeLessThanOrEqual(72)
    expect(svg.querySelector('text')).toBeNull()
    expect(svg.textContent ?? '').not.toMatch(/\d/)
    expect(svg.querySelectorAll('.fill-accent-400').length).toBeLessThanOrEqual(1)
    // Every stroked shape is a line-2 hairline: the only other fill is the one accent dot.
    const shapes = Array.from(svg.querySelectorAll('path, circle, rect'))
    expect(shapes.length).toBeGreaterThan(0)
    for (const shape of shapes) {
      const own = shape.getAttribute('class') ?? ''
      const group = shape.closest('g')?.getAttribute('class') ?? ''
      expect(own.includes('fill-accent-400') || group.includes('stroke-line-2') || own.includes('stroke-line-2')).toBe(true)
    }
  })

  it('renders byte-identical markup on re-render (deterministic path data)', () => {
    for (const figure of EMPTY_FIGURE_NAMES) {
      expect(renderToStaticMarkup(<EmptyFigure figure={figure} />)).toBe(renderToStaticMarkup(<EmptyFigure figure={figure} />))
    }
  })
})

describe('EmptyState with a figure', () => {
  it('draws the figure in place of the icon and keeps the sentences verbatim', () => {
    const { container, rerender } = render(<EmptyState icon={Check} figure="rail" title="Nothing is currently in progress." body="Open the Board to start." />)
    expect(container.querySelector('[data-empty-figure="rail"]')).toBeTruthy()
    expect(container.querySelectorAll('svg').length).toBe(1)
    expect(container.textContent).toContain('Nothing is currently in progress.')
    expect(container.textContent).toContain('Open the Board to start.')
    rerender(<EmptyState icon={Check} title="Nothing is currently in progress." />)
    expect(container.querySelector('[data-empty-figure]')).toBeNull()
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })
})
