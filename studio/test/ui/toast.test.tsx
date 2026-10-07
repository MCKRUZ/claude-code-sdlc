// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastRegion, clearToasts, toast, TOAST_TTL_MS } from '../../src/ui'
import { TOAST_DEDUPE_MS } from '../../src/ui/toastStore'

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

  it('M6: the rail is marked paused while the region is hovered or focused, and released after', () => {
    render(<ToastRegion />)
    act(() => {
      toast({ tone: 'ok', title: 'Clock' })
    })
    const region = screen.getByRole('region')
    const card = region.querySelector('[data-toast-tone]')!
    expect(card.querySelector('[data-toast-rail]')).toBeTruthy()
    expect(card.hasAttribute('data-paused')).toBe(false)
    fireEvent.mouseEnter(region)
    expect(card.hasAttribute('data-paused')).toBe(true)
    fireEvent.mouseLeave(region)
    expect(card.hasAttribute('data-paused')).toBe(false)
    fireEvent.focus(region)
    expect(card.hasAttribute('data-paused')).toBe(true)
  })

  it('M6: a same-title toast within two seconds updates in place — one node, same id, fresh detail, clock restarted', () => {
    render(<ToastRegion />)
    let first = ''
    let second = ''
    act(() => {
      first = toast({ tone: 'warn', title: 'Pull failed', detail: 'first attempt' })
    })
    act(() => {
      vi.advanceTimersByTime(TOAST_TTL_MS - 500)
      second = toast({ tone: 'error', title: 'Pull failed', detail: 'second attempt' })
    })
    // Past the dedupe window: a separate toast.
    expect(second).not.toBe(first)
    clearToasts()
    act(() => {
      first = toast({ tone: 'warn', title: 'Pull failed', detail: 'first attempt' })
    })
    act(() => {
      vi.advanceTimersByTime(TOAST_DEDUPE_MS - 100)
      second = toast({ tone: 'error', title: 'Pull failed', detail: 'second attempt' })
    })
    expect(second).toBe(first)
    const region = screen.getByRole('region')
    expect(region.querySelectorAll('[data-toast-tone]').length).toBe(1)
    expect(screen.queryByText('first attempt')).toBeNull()
    expect(screen.getByText('second attempt')).toBeTruthy()
    expect(region.querySelector('[data-toast-tone]')!.getAttribute('data-toast-tone')).toBe('error')
    // The clock restarted with the new words: the first ttl's end passes and it is still there.
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.getByText('second attempt')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(TOAST_TTL_MS)
    })
    expect(screen.queryByText('second attempt')).toBeNull()
  })

  it('M6: a dismissed toast leaves the DOM (motion off: at once, no exiting ghost)', () => {
    render(<ToastRegion />)
    act(() => {
      toast({ tone: 'ok', title: 'Gone soon' })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Gone soon')).toBeNull()
    expect(document.querySelector('[data-exiting]')).toBeNull()
  })

  it('the action button wears the accent-text pair, never accent-700', () => {
    render(<ToastRegion />)
    act(() => {
      toast({ tone: 'info', title: 'Exported', action: { label: 'Open', onClick: () => {} } })
    })
    const action = screen.getByRole('button', { name: 'Open' })
    expect(action.className).toContain('text-accent-text')
    expect(action.className).not.toContain('text-accent-700')
  })
})
