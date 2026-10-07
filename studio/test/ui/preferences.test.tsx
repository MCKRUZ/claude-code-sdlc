// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DensityToggle, MotionToggle, ThemeToggle, SkipLink, VisuallyHidden } from '../../src/ui'

beforeEach(() => {
  window.localStorage.clear()
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.density
  delete document.documentElement.dataset.motion
})
afterEach(() => window.localStorage.clear())

describe('Preference toggles', () => {
  it('are aria-pressed button groups with no <input>, and persist + apply the html attribute', () => {
    render(
      <>
        <ThemeToggle />
        <DensityToggle />
        <MotionToggle note="On overrides the OS reduced-motion setting." />
      </>,
    )
    expect(document.querySelector('input')).toBeNull()
    for (const name of ['Theme', 'Density', 'Motion']) {
      const group = screen.getByRole('group', { name })
      expect(group.querySelectorAll('button[aria-pressed="true"]').length).toBe(1)
    }
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expect(window.localStorage.getItem('studio.theme')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(screen.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }))
    expect(document.documentElement.dataset.density).toBe('compact')
    fireEvent.click(screen.getByRole('button', { name: 'Off' }))
    expect(window.localStorage.getItem('studio.motion')).toBe('off')
    expect(document.documentElement.dataset.motion).toBe('off')
    expect(screen.getByText('On overrides the OS reduced-motion setting.')).toBeTruthy()
  })

  it('system theme resolves data-theme to light or dark, never "system"', () => {
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button', { name: 'Light' }))
    fireEvent.click(screen.getByRole('button', { name: 'System' }))
    expect(window.localStorage.getItem('studio.theme')).toBe('system')
    expect(['light', 'dark']).toContain(document.documentElement.dataset.theme)
  })
})

describe('SkipLink + VisuallyHidden', () => {
  it('SkipLink is an <a href="#main">; VisuallyHidden is sr-only', () => {
    render(
      <>
        <SkipLink />
        <VisuallyHidden>hidden words</VisuallyHidden>
      </>,
    )
    const link = screen.getByRole('link', { name: 'Skip to main content' })
    expect(link.getAttribute('href')).toBe('#main')
    expect(screen.getByText('hidden words').className).toContain('sr-only')
  })
})
