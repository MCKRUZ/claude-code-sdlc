// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastRegion, clearToasts, toast, TOAST_TTL_MS } from '../../src/ui'

beforeEach(() => {
  vi.useFakeTimers()
  clearToasts()
})
afterEach(() => {
  clearToasts()
  vi.useRealTimers()
})

describe('ToastRegion', () => {
  it('is a <section role="region" aria-label="Notifications" aria-live="polite">, never an aside', () => {
    render(<ToastRegion />)
    const region = screen.getByRole('region', { name: 'Notifications' })
    expect(region.tagName).toBe('SECTION')
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(document.querySelector('aside')).toBeNull()
  })

  it('shows at most three, announces errors assertively, and expires a toast after the ttl', () => {
    render(<ToastRegion />)
    act(() => {
      toast({ tone: 'ok', title: 'Saved' })
      toast({ tone: 'ok', title: 'Exported' })
      toast({ tone: 'error', title: 'Could not write' })
      toast({ tone: 'info', title: 'Fourth' })
    })
    const region = screen.getByRole('region')
    expect(region.querySelectorAll('[data-toast-tone]').length).toBe(3)
    expect(screen.queryByText('Fourth')).toBeNull()
    expect(region.getAttribute('aria-live')).toBe('assertive')
    act(() => {
      vi.advanceTimersByTime(TOAST_TTL_MS + 1)
    })
    expect(screen.queryByText('Saved')).toBeNull()
    expect(screen.getByText('Fourth')).toBeTruthy()
  })

  it('pauses every ttl while hovered and a sticky toast stays until dismissed', () => {
    render(<ToastRegion />)
    act(() => {
      toast({ tone: 'ok', title: 'Transient' })
      toast({ tone: 'warn', title: 'Sticky', sticky: true })
    })
    const region = screen.getByRole('region')
    fireEvent.mouseEnter(region)
    act(() => {
      vi.advanceTimersByTime(TOAST_TTL_MS * 2)
    })
    expect(screen.getByText('Transient')).toBeTruthy()
    fireEvent.mouseLeave(region)
    act(() => {
      vi.advanceTimersByTime(TOAST_TTL_MS + 1)
    })
    expect(screen.queryByText('Transient')).toBeNull()
    expect(screen.getByText('Sticky')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Sticky')).toBeNull()
  })
})
