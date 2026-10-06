// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { HoverCard, Tooltip, Kbd, keyLabel, Spinner, ProgressRing, HOVER_OPEN_DELAY, HOVER_CLOSE_DELAY, TOOLTIP_DELAY } from '../../src/ui'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('HoverCard', () => {
  it('opens on hover after the delay, is a tooltip when text-only, closes on Escape, and is pointer-events-none', () => {
    render(<HoverCard trigger={<button type="button">Spec 0001</button>} content="Duplicate claim 409 — HIGH" />)
    const trigger = screen.getByRole('button')
    fireEvent.mouseEnter(trigger.parentElement!)
    expect(screen.queryByRole('tooltip')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(HOVER_OPEN_DELAY + 1)
    })
    const tip = screen.getByRole('tooltip')
    expect(tip.className).toContain('pointer-events-none')
    expect(tip.querySelector('button, input, select, textarea')).toBeNull()
    fireEvent.keyDown(trigger.parentElement!, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('opens on focus too', () => {
    render(<HoverCard trigger={<button type="button">T</button>} content={<p>Rich</p>} />)
    fireEvent.focus(screen.getByRole('button').parentElement!)
    act(() => {
      vi.advanceTimersByTime(HOVER_OPEN_DELAY + 1)
    })
    expect(screen.getByText('Rich')).toBeTruthy()
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})

describe('HoverCard round 2 (M7)', () => {
  it('keeps role=tooltip and pointer-events-none, and with motion off leaves at once after the close delay', () => {
    render(<HoverCard trigger={<button type="button">T</button>} content="Plain words" />)
    const wrap = screen.getByRole('button').parentElement!
    fireEvent.mouseEnter(wrap)
    act(() => {
      vi.advanceTimersByTime(HOVER_OPEN_DELAY + 1)
    })
    const tip = screen.getByRole('tooltip') as HTMLElement
    expect(tip.className).toContain('pointer-events-none')
    expect(tip.hasAttribute('data-leaving')).toBe(false)
    // The arrive row's end state: fully visible, no residual transform.
    expect(tip.style.transform).toBe('')
    expect(wrap.getAttribute('aria-describedby')).toBe(tip.id)
    fireEvent.mouseLeave(wrap)
    act(() => {
      vi.advanceTimersByTime(HOVER_CLOSE_DELAY + 1)
    })
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(wrap.hasAttribute('aria-describedby')).toBe(false)
  })

  it('Escape closes synchronously — no delay, no fade', () => {
    render(<HoverCard trigger={<button type="button">T</button>} content={<p>Rich</p>} />)
    const wrap = screen.getByRole('button').parentElement!
    fireEvent.focus(wrap)
    act(() => {
      vi.advanceTimersByTime(HOVER_OPEN_DELAY + 1)
    })
    expect(screen.getByText('Rich')).toBeTruthy()
    fireEvent.keyDown(wrap, { key: 'Escape' })
    expect(screen.queryByText('Rich')).toBeNull()
  })
})

describe('Tooltip + Kbd', () => {
  it('shows after 500 ms with role=tooltip and an optional chord', () => {
    render(<Tooltip label="Resize the chat" kbd={['Mod', 'Shift', 'L']}><button type="button">H</button></Tooltip>)
    fireEvent.mouseEnter(screen.getByRole('button').parentElement!)
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY + 1)
    })
    const tip = screen.getByRole('tooltip')
    expect(tip.textContent).toContain('Resize the chat')
    expect(tip.querySelector('kbd')).toBeTruthy()
  })

  it('Kbd renders <kbd> and maps Mod by platform', () => {
    render(<Kbd keys={['Mod', 'K']} />)
    expect(document.querySelector('kbd')).toBeTruthy()
    expect(keyLabel('Mod', true)).toBe('⌘')
    expect(keyLabel('Mod', false)).toBe('Ctrl')
    expect(keyLabel('Shift', true)).toBe('⇧')
  })
})

describe('Spinner + ProgressRing', () => {
  it('Spinner is a status with hidden label text; ProgressRing null says no data instead of 0%', () => {
    render(<Spinner label="Opening…" />)
    expect(screen.getByRole('status').textContent).toBe('Opening…')
    const { rerender } = render(<ProgressRing label="summaries" value={null} />)
    const ring = screen.getByRole('progressbar')
    expect(ring.hasAttribute('aria-valuenow')).toBe(false)
    expect(ring.getAttribute('aria-valuetext')).toContain('no data')
    rerender(<ProgressRing label="summaries" value={0.5} />)
    expect(ring.getAttribute('aria-valuenow')).toBe('50')
  })
})
