// @vitest-environment jsdom
// C5: the Icon size union gains 12 (chip and badge glyphs); Badge draws its glyph at 12 with no
// `h-3 w-3` override; a labelled icon is an image, an unlabelled one is hidden.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Check } from 'lucide-react'
import { Badge, Icon, ICON_STROKE } from '../../src/ui'

describe('Icon', () => {
  it('accepts size 12 and emits width/height to match, stroke 1.75, aria-hidden by default', () => {
    const { container } = render(<Icon icon={Check} size={12} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('12')
    expect(svg.getAttribute('height')).toBe('12')
    expect(svg.getAttribute('stroke-width')).toBe(String(ICON_STROKE))
    expect(svg.getAttribute('aria-hidden')).toBe('true')
  })

  it('a labelled icon is role=img with the label as its name', () => {
    render(<Icon icon={Check} label="Ready" />)
    const img = screen.getByRole('img', { name: 'Ready' })
    expect(img.hasAttribute('aria-hidden')).toBe(false)
  })

  it('Badge draws a 12 px glyph with no size override class', () => {
    const { container } = render(<Badge kind="ready">Ready</Badge>)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('12')
    expect(svg.getAttribute('class') ?? '').not.toMatch(/\bh-3\b|\bw-3\b/)
  })
})
