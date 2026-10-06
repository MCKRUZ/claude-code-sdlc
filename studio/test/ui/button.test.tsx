// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Check } from 'lucide-react'
import { Button, IconButton, BackLink } from '../../src/ui'

describe('Button', () => {
  it('emits type="button" before disabled, and the primary variant spells bg-brand-600 literally', () => {
    const html = renderToStaticMarkup(<Button variant="primary" disabled>Save</Button>)
    expect(html.startsWith('<button type="button" disabled=""')).toBe(true)
    expect(html).toContain('bg-brand-600')
    expect(html).toContain('hover:bg-brand-700')
  })

  it('renders the disabledReason as a title and as visually-hidden text', () => {
    render(<Button disabled disabledReason="needs a newer plugin">Run</Button>)
    const button = screen.getByRole('button', { name: /Run/ })
    expect(button.getAttribute('title')).toBe('needs a newer plugin')
    expect(button.querySelector('.sr-only')?.textContent).toBe('needs a newer plugin')
  })

  it('does not render a reason when the control is enabled', () => {
    render(<Button disabledReason="irrelevant">Run</Button>)
    const button = screen.getByRole('button', { name: 'Run' })
    expect(button.hasAttribute('title')).toBe(false)
    expect(button.querySelector('.sr-only')).toBeNull()
  })

  it('loading sets aria-busy, disables, and swaps the label for loadingLabel', () => {
    render(<Button loading loadingLabel="Saving…">Save</Button>)
    const button = screen.getByRole('button')
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(button.textContent).toBe('Saving…')
  })

  it('passes data-testid and onClick through, icons are aria-hidden, and merges className', () => {
    const onClick = vi.fn()
    render(<Button icon={Check} data-testid="t" className="px-6" onClick={onClick}>Ok</Button>)
    const button = screen.getByTestId('t')
    button.click()
    expect(onClick).toHaveBeenCalledOnce()
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(button.className).toContain('px-6')
    expect(button.className).not.toContain('px-3')
  })
})

describe('IconButton', () => {
  it('requires a label that becomes aria-label and maps pressed to aria-pressed', () => {
    render(<IconButton label="Collapse" icon={Check} pressed />)
    const button = screen.getByRole('button', { name: 'Collapse' })
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.getAttribute('type')).toBe('button')
  })
})

describe('BackLink', () => {
  it('keeps the exact visible text including the arrow', () => {
    render(<BackLink label="← Back to the board" />)
    expect(screen.getByRole('button', { name: '← Back to the board' })).toBeTruthy()
  })
})
