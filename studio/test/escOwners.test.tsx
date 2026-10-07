// @vitest-environment jsdom
/** Escape's owners (v13 fixer round): with the band's `…` menu open, Esc both closed the menu AND
 * fired the screen's `back` — App's capture-phase listener ran before Radix's DismissableLayer,
 * `defaultPrevented` was still false, and the owner list named dialogs and tooltips only. The
 * list is one module now and is held against the kit's own overlays: a Radix menu, a rich hover
 * card (no role), a text tooltip, a dialog — each makes `escOwnedAbove()` true while open and
 * false once closed, so `handleEscape` steps aside exactly while something is up. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OverflowMenu, OVERFLOW_LABEL } from '../src/components/OverflowMenu'
import { ESC_OWNER_SELECTOR, escOwnedAbove } from '../src/shortcuts/escOwners'
import { handleEscape } from '../src/shortcuts/useShortcuts'
import { Dialog, HoverCard } from '../src/ui'

let overlays: HTMLElement
beforeEach(() => {
  overlays = document.createElement('div')
  overlays.id = 'overlays'
  document.body.appendChild(overlays)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  overlays.remove()
  document.body.style.overflow = ''
})

describe('escOwnedAbove', () => {
  it('names dialogs, alert dialogs, tooltips, menus and hover cards', () => {
    for (const sel of ['[role="dialog"]', '[role="alertdialog"]', '[role="tooltip"]', '[role="menu"]', '[data-hover-card]']) expect(ESC_OWNER_SELECTOR).toContain(sel)
    expect(escOwnedAbove(undefined)).toBe(false)
    expect(escOwnedAbove()).toBe(false)
  })

  it('the band\'s … menu owns Esc while open — and `handleEscape` never reaches `back` then', () => {
    const actions = { toggleChat: vi.fn(), openShortcuts: vi.fn(), steering: vi.fn(), newProject: vi.fn(), openFolder: vi.fn() }
    render(<OverflowMenu actions={actions} />)
    expect(escOwnedAbove()).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: OVERFLOW_LABEL }))
    expect(screen.getByRole('menu')).toBeTruthy()
    expect(escOwnedAbove()).toBe(true)
    // App wires `isDirty: () => escOwnedAbove() || …`; with the menu up, Esc does nothing of the screen's.
    const onBack = vi.fn()
    expect(handleEscape({ escLayers: [], onBack, isDirty: () => escOwnedAbove() })).toBe(false)
    expect(onBack).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(escOwnedAbove()).toBe(false)
    expect(handleEscape({ escLayers: [], onBack, isDirty: () => escOwnedAbove() })).toBe(true)
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('a rich hover card (no role) and a text tooltip each own Esc while shown', () => {
    vi.useFakeTimers()
    render(<HoverCard trigger={<button type="button">Spec 0001</button>} content={<p>owner @sam-k · checker you</p>} openDelay={0} closeDelay={0} />)
    expect(escOwnedAbove()).toBe(false)
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Spec 0001' }).parentElement as HTMLElement)
    act(() => { vi.runAllTimers() })
    expect(document.querySelector('[data-hover-card]')).not.toBeNull()
    expect(document.querySelector('[data-hover-card]')?.getAttribute('role')).toBeNull()
    expect(escOwnedAbove()).toBe(true)
    cleanup()
    render(<HoverCard trigger={<button type="button">Spec 0002</button>} content="a plain sentence" openDelay={0} closeDelay={0} />)
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Spec 0002' }).parentElement as HTMLElement)
    act(() => { vi.runAllTimers() })
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull()
    expect(escOwnedAbove()).toBe(true)
  })

  it('a dialog owns Esc while open', () => {
    render(<Dialog open onClose={() => {}} title="Verdict">body</Dialog>)
    expect(escOwnedAbove()).toBe(true)
  })
})
