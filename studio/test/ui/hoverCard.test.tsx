// @vitest-environment jsdom
// Round 3 (Q3): the kit HoverCard rides @radix-ui/react-hover-card. Pinned here: the card portals
// into #overlays and is placed by the popper (so a card on a row deep inside a scrolling lane is
// never clipped), the trigger wrapper reads `data-state`, Escape closes through the document layer
// at once, the content is `pointer-events: none` and holds no write control, and the kit's own
// intent timing (`HOVER_OPEN_DELAY` / `HOVER_CLOSE_DELAY`) is the only timing.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HoverCard, Popover, HOVER_OPEN_DELAY, HOVER_CLOSE_DELAY, PLACEMENT } from '../../src/ui'

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

const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('HoverCard on Radix', () => {
  it('portals a rich card into #overlays as a pointer-events-none plate placed by the popper on the asked side', () => {
    render(<HoverCard trigger={<button type="button">Spec 0001</button>} content={<p>owner @sam-k · checker you</p>} placement="right" />)
    const wrap = screen.getByRole('button').parentElement!
    expect(wrap.getAttribute('data-state')).toBe('closed')
    fireEvent.mouseEnter(wrap)
    advance(HOVER_OPEN_DELAY - 1)
    expect(overlays.querySelector('[data-hover-card]')).toBeNull()
    advance(2)
    const plate = overlays.querySelector<HTMLElement>('[data-hover-card]')!
    expect(plate).toBeTruthy()
    expect(plate.getAttribute('data-side')).toBe('right')
    expect(plate.closest('[data-radix-popper-content-wrapper]')).not.toBeNull()
    expect(plate.getAttribute('role')).toBeNull()
    expect(plate.className).toContain('pointer-events-none')
    expect(plate.querySelector('button, input, a, select, textarea')).toBeNull()
    expect(wrap.getAttribute('data-state')).toBe('open')
    expect(plate.style.transform).toBe('')
  })

  it('Escape through the document layer closes it at once; a mouse leave closes after the grace delay', () => {
    render(<HoverCard trigger={<button type="button">T</button>} content={<p>Rich</p>} />)
    const wrap = screen.getByRole('button').parentElement!
    fireEvent.mouseEnter(wrap)
    advance(HOVER_OPEN_DELAY + 1)
    expect(screen.getByText('Rich')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Rich')).toBeNull()
    expect(wrap.getAttribute('data-state')).toBe('closed')
    fireEvent.mouseEnter(wrap)
    advance(HOVER_OPEN_DELAY + 1)
    fireEvent.mouseLeave(wrap)
    advance(HOVER_CLOSE_DELAY - 1)
    expect(screen.getByText('Rich')).toBeTruthy()
    advance(2)
    expect(screen.queryByText('Rich')).toBeNull()
  })

  it('text-only content is a tooltip to assistive tech, the wrapper is described by it, and the kit delays are honoured as given', () => {
    render(<HoverCard trigger={<button type="button">T</button>} content="Plain words" openDelay={50} closeDelay={10} />)
    const wrap = screen.getByRole('button').parentElement!
    fireEvent.mouseEnter(wrap)
    advance(51)
    const tip = screen.getByRole('tooltip')
    expect(overlays.contains(tip)).toBe(true)
    expect(wrap.getAttribute('aria-describedby')).toBe(tip.id)
    fireEvent.mouseLeave(wrap)
    advance(11)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('Popover is the same component and PLACEMENT names the four popper sides', () => {
    expect(Popover).toBe(HoverCard)
    expect(PLACEMENT).toEqual({ top: 'top', bottom: 'bottom', left: 'left', right: 'right' })
  })
})
