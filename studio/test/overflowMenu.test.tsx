// @vitest-environment jsdom
// Round 3 (Q3): the TopBand's `…` menu rides @radix-ui/react-dropdown-menu. Pinned here: the
// trigger is a labelled menu button; a click (or a pointer down — once, never both) opens a real
// `role="menu"` portalled into #overlays whose rows are `<button>`s; a row runs its callback once
// and the menu closes; Escape closes and focus returns to the trigger; ArrowDown from the trigger
// opens with the first row focused and arrows move between rows; rows the host did not pass are
// absent, and with no rows there is no trigger at all. The shell still holds no `<input>`.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OverflowMenu, OVERFLOW_LABEL, overflowRows, type OverflowActions } from '../src/components/OverflowMenu'

let overlays: HTMLElement
beforeEach(() => {
  overlays = document.createElement('div')
  overlays.id = 'overlays'
  document.body.appendChild(overlays)
})
afterEach(() => {
  vi.useRealTimers()
  overlays.remove()
})

function mount(over: Partial<OverflowActions> = {}) {
  const actions: Required<OverflowActions> = { toggleChat: vi.fn(), openShortcuts: vi.fn(), steering: vi.fn(), newProject: vi.fn(), openFolder: vi.fn(), ...over }
  render(<OverflowMenu actions={actions} className="ml-1" />)
  return { actions, more: screen.getByRole('button', { name: OVERFLOW_LABEL }) }
}

describe('OverflowMenu on Radix', () => {
  it('a labelled menu button opens a role=menu in #overlays whose rows are pressable <button>s; no input anywhere', () => {
    const { more } = mount()
    expect(more.getAttribute('aria-haspopup')).toBe('menu')
    expect(more.getAttribute('aria-expanded')).toBe('false')
    expect(more.className).toContain('ml-1')
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(more)
    const menu = screen.getByRole('menu', { name: OVERFLOW_LABEL })
    expect(overlays.contains(menu)).toBe(true)
    expect(more.getAttribute('aria-expanded')).toBe('true')
    expect(more.getAttribute('aria-controls')).toBe(menu.id)
    const items = within(menu).getAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Chat'), expect.stringContaining('Keyboard shortcuts'), expect.stringContaining('Steering mode')]))
    expect(items).toHaveLength(5)
    expect(items.every((i) => i.tagName === 'BUTTON' && i.getAttribute('type') === 'button' && i.hasAttribute('data-pressable'))).toBe(true)
    expect(menu.className).toContain('rounded-[14px]')
    expect(document.querySelectorAll('input')).toHaveLength(0)
  })

  it('a pointer down opens it (Radix) and the click the same press delivers does not toggle it shut', () => {
    const { more } = mount()
    fireEvent.pointerDown(more, { button: 0 })
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.click(more)
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('a row runs its callback once and the menu closes; Escape closes and focus returns to the trigger', () => {
    vi.useFakeTimers()
    const { actions, more } = mount()
    fireEvent.click(more)
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Steering mode/ }))
    expect(actions.steering).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(more)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    act(() => {
      vi.runAllTimers()
    })
    expect(document.activeElement).toBe(more)
    expect(more.getAttribute('aria-expanded')).toBe('false')
  })

  it('ArrowDown on the trigger opens with the first row focused; arrows move between rows; Enter runs the focused row', () => {
    vi.useFakeTimers()
    const { actions, more } = mount()
    fireEvent.keyDown(more, { key: 'ArrowDown' })
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem')
    act(() => {
      vi.runAllTimers()
    })
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(items[0], { key: 'ArrowDown' })
    act(() => {
      vi.runAllTimers()
    })
    expect(document.activeElement).toBe(items[1])
    expect(items[1].hasAttribute('data-highlighted')).toBe(true)
    fireEvent.keyDown(items[1], { key: 'Enter' })
    expect(actions.openShortcuts).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('rows the host did not pass are absent, never inert; with no rows there is no trigger', () => {
    expect(overflowRows({ toggleChat: vi.fn() }).map((r) => r.id)).toEqual(['chat'])
    const { container } = render(<OverflowMenu actions={{}} />)
    expect(container.innerHTML).toBe('')
  })
})
