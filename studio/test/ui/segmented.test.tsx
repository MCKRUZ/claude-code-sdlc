// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Segmented, Surface3DToggle } from '../../src/ui'

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta', disabled: true, disabledReason: 'not in this stage' },
  { value: 'c', label: 'Gamma' },
]

describe('Segmented', () => {
  it('is a labelled group of aria-pressed buttons with exactly one pressed', () => {
    render(<Segmented label="Window" options={OPTIONS} value="a" onChange={() => {}} />)
    const group = screen.getByRole('group', { name: 'Window' })
    const pressed = group.querySelectorAll('button[aria-pressed="true"]')
    expect(pressed.length).toBe(1)
    expect(pressed[0].textContent).toBe('Alpha')
    expect(group.querySelectorAll('button').length).toBe(3)
    expect(group.querySelector('[data-segmented-thumb]')).toBeTruthy()
  })

  it('tone=accent emits bg-brand-600 text-white and tone=inverse emits bg-slate-900 text-white on the active option', () => {
    const { unmount } = render(<Segmented label="A" tone="accent" options={OPTIONS} value="a" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Alpha' }).className).toMatch(/bg-brand-600 text-white/)
    unmount()
    render(<Segmented label="B" tone="inverse" options={OPTIONS} value="c" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Gamma' }).className).toMatch(/bg-slate-900 text-white/)
    expect(screen.getByRole('button', { name: 'Alpha' }).className).not.toContain('bg-slate-900')
  })

  it('roving tabIndex: only the active option is in the tab order; arrows skip disabled options and select', () => {
    const onChange = vi.fn()
    render(<Segmented label="W" options={OPTIONS} value="a" onChange={onChange} />)
    const alpha = screen.getByRole('button', { name: 'Alpha' })
    const gamma = screen.getByRole('button', { name: 'Gamma' })
    expect(alpha.tabIndex).toBe(0)
    expect(gamma.tabIndex).toBe(-1)
    alpha.focus()
    fireEvent.keyDown(alpha, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('c')
    expect(document.activeElement).toBe(gamma)
    fireEvent.keyDown(gamma, { key: 'End' })
    expect(document.activeElement).toBe(gamma)
    fireEvent.keyDown(gamma, { key: 'Home' })
    expect(document.activeElement).toBe(alpha)
  })

  it('a disabled option carries its reason as title and hidden text', () => {
    render(<Segmented label="W" options={OPTIONS} value="a" onChange={() => {}} />)
    const beta = screen.getByRole('button', { name: /Beta/ })
    expect((beta as HTMLButtonElement).disabled).toBe(true)
    expect(beta.getAttribute('title')).toBe('not in this stage')
    expect(beta.querySelector('.sr-only')?.textContent).toBe('not in this stage')
  })
})

describe('Surface3DToggle', () => {
  it('is exactly two aria-pressed buttons, Graph and Table', () => {
    render(<Surface3DToggle value="table" onChange={() => {}} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Graph', 'Table'])
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
  })
})
