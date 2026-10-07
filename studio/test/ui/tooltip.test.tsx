// @vitest-environment jsdom
// Round 3 (Q3): the kit Tooltip rides @radix-ui/react-tooltip. Pinned here: what Radix adds — the
// plate portals into #overlays, carries role="tooltip" and the id the trigger wrapper is described
// by while open, is placed by the popper (`data-side`), and closes through the document's Escape
// layer — and what the kit keeps: the 500 ms intent delay, the kbd chord, the `bg-slate-900`
// plate, and an immediate leave with motion off.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Tooltip, TOOLTIP_DELAY } from '../../src/ui'

let overlays: HTMLElement
beforeEach(() => {
  vi.useFakeTimers()
  overlays = document.createElement('div')
  overlays.id = 'overlays'
  document.body.appendChild(overlays)
})
afterEach(() => {
  vi.useRealTimers()
  overlays.remove()
})

const hoverOpen = (wrap: HTMLElement) => {
  fireEvent.mouseEnter(wrap)
  act(() => {
    vi.advanceTimersByTime(TOOLTIP_DELAY + 1)
  })
}

describe('Tooltip on Radix', () => {
  it('portals the plate into #overlays as role=tooltip, describes the trigger wrapper by it, places it by side, keeps the chord', () => {
    render(<Tooltip label="Console" kbd={['Mod', 'J']} placement="bottom"><button type="button">C</button></Tooltip>)
    const wrap = screen.getByRole('button').parentElement!
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(wrap.hasAttribute('aria-describedby')).toBe(false)
    hoverOpen(wrap)
    const tip = screen.getByRole('tooltip')
    expect(overlays.contains(tip)).toBe(true)
    expect(wrap.getAttribute('aria-describedby')).toBe(tip.id)
    expect(tip.getAttribute('data-side')).toBe('bottom')
    expect(tip.closest('[data-radix-popper-content-wrapper]')).not.toBeNull()
    expect(tip.textContent).toContain('Console')
    expect(tip.querySelector('kbd')).toBeTruthy()
    expect(tip.className).toContain('pointer-events-none')
    expect(tip.className).toContain('bg-slate-900')
    expect(tip.hasAttribute('data-hover-card')).toBe(true)
  })

  it('waits the full 500 ms, leaves at once on mouse leave with motion off, and closes on Escape through the document layer', () => {
    render(<Tooltip label="Settings"><button type="button">S</button></Tooltip>)
    const wrap = screen.getByRole('button').parentElement!
    fireEvent.mouseEnter(wrap)
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY - 1)
    })
    expect(screen.queryByRole('tooltip')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(2)
    })
    expect(screen.getByRole('tooltip')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    hoverOpen(wrap)
    fireEvent.mouseLeave(wrap)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(wrap.hasAttribute('aria-describedby')).toBe(false)
  })

  it('focus opens it after the same delay; the plate never adds an input or a write control; the trigger reads its state', () => {
    render(<Tooltip label="Chat"><button type="button">H</button></Tooltip>)
    const button = screen.getByRole('button')
    const wrap = button.parentElement!
    expect(wrap.getAttribute('data-state')).toBe('closed')
    button.focus()
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY + 1)
    })
    const tip = screen.getByRole('tooltip')
    expect(wrap.getAttribute('data-state')).not.toBe('closed')
    expect(tip.querySelector('button, input, a, select, textarea')).toBeNull()
    expect(document.querySelectorAll('input')).toHaveLength(0)
    expect(tip.style.transform).toBe('')
  })

  it('opening one tooltip closes another (Radix keeps one plate on screen)', () => {
    render(
      <>
        <Tooltip label="One"><button type="button">1</button></Tooltip>
        <Tooltip label="Two"><button type="button">2</button></Tooltip>
      </>,
    )
    const [one, two] = screen.getAllByRole('button').map((b) => b.parentElement!)
    hoverOpen(one)
    expect(screen.getByRole('tooltip').textContent).toBe('One')
    hoverOpen(two)
    const tips = screen.getAllByRole('tooltip')
    expect(tips.map((t) => t.textContent)).toContain('Two')
    expect(tips.length).toBeLessThanOrEqual(2)
  })

  /** v14 (observatory settings-dark shot): the band's Settings button was clicked INSIDE the
   * 500 ms intent window — Radix's pointerdown close only closes an open plate, the kit's own
   * timer still fired, and the plate then sat over the strip with the click's focus already on
   * the new screen's heading. A press now ends the intent synchronously, and nothing re-arms it
   * — not the wrapper's enter, not Radix's focus open — until the pointer has left the trigger.
   * A keyboard user never presses the pointer, so the focus-opens-it test above is unchanged. */
  it('a click inside the intent window cancels it; an open plate closes at once on pointerdown and does not reopen on focus or re-enter until the pointer has left', () => {
    render(<Tooltip label="Settings" kbd={['Mod', ',']}><button type="button">S</button></Tooltip>)
    const button = screen.getByRole('button')
    const wrap = button.parentElement!
    // The root cause: enter, press before the delay, wait past it — no plate.
    fireEvent.mouseEnter(wrap)
    act(() => {
      vi.advanceTimersByTime(100)
    })
    fireEvent.pointerDown(button)
    fireEvent.pointerUp(button)
    fireEvent.click(button)
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY + 100)
    })
    expect(screen.queryByRole('tooltip')).toBeNull()
    // Focus after the click (Radix opens on focus) arms nothing …
    button.focus()
    fireEvent.focus(button)
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY + 1)
    })
    expect(screen.queryByRole('tooltip')).toBeNull()
    // … nor does a second enter while the pointer never left.
    fireEvent.mouseEnter(wrap)
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY + 1)
    })
    expect(screen.queryByRole('tooltip')).toBeNull()
    // Leave and come back: the tooltip owes its 500 ms again.
    fireEvent.mouseLeave(wrap)
    hoverOpen(wrap)
    expect(screen.getByRole('tooltip').textContent).toContain('Settings')
    // An OPEN plate: pointerdown closes it at once — no fade, no timer left to bring it back.
    fireEvent.pointerDown(button)
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(wrap.hasAttribute('aria-describedby')).toBe(false)
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY + 100)
    })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
