// @vitest-environment jsdom
// C8 Disclosure: keeps <details>/<summary> (sprint.spec counts `details[open]`), the summary's
// text is the caller's words only, the marker is hidden and a chevron is the affordance,
// `aria-expanded` mirrors the open state in both the uncontrolled and the controlled case.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Disclosure } from '../../src/ui'

describe('Disclosure', () => {
  it('is a <details> with a <summary> whose text is exactly the caller\'s, marker hidden, chevron present', () => {
    const { container } = render(
      <Disclosure summary="Definition of Ready" summaryProps={{ 'data-testid': 'dor' } as never}>
        <p>Scope in and out.</p>
      </Disclosure>,
    )
    const details = container.querySelector('details')!
    const summary = screen.getByTestId('dor')
    expect(summary.tagName).toBe('SUMMARY')
    expect(summary.textContent).toBe('Definition of Ready')
    expect(summary.className).toContain('list-none')
    expect(summary.className).toContain('[&::-webkit-details-marker]:hidden')
    expect(summary.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(summary.querySelector('svg')?.getAttribute('class')).toContain('group-open:rotate-90')
    expect(details.hasAttribute('open')).toBe(false)
    expect(summary.getAttribute('aria-expanded')).toBe('false')
  })

  it('uncontrolled: defaultOpen renders [open]; toggling flips aria-expanded and reports through onToggle', () => {
    const onToggle = vi.fn()
    const { container } = render(
      <Disclosure summary="More" defaultOpen onToggle={onToggle}>
        <p>Body</p>
      </Disclosure>,
    )
    const details = container.querySelector('details')!
    const summary = container.querySelector('summary')!
    expect(container.querySelectorAll('details[open]').length).toBe(1)
    expect(summary.getAttribute('aria-expanded')).toBe('true')
    details.open = false
    fireEvent(details, new Event('toggle'))
    expect(onToggle).toHaveBeenCalledWith(false)
    expect(summary.getAttribute('aria-expanded')).toBe('false')
  })

  it('controlled: `open` is the truth and the parent decides', () => {
    const onToggle = vi.fn()
    const { container, rerender } = render(<Disclosure summary="S" open={false} onToggle={onToggle}>b</Disclosure>)
    const details = container.querySelector('details')!
    expect(details.hasAttribute('open')).toBe(false)
    rerender(<Disclosure summary="S" open onToggle={onToggle}>b</Disclosure>)
    expect(details.hasAttribute('open')).toBe(true)
    expect(container.querySelector('summary')!.getAttribute('aria-expanded')).toBe('true')
  })
})
