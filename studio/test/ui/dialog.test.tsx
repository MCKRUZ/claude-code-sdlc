// @vitest-environment jsdom
// Round 3 (Q3): the kit Dialog rides @radix-ui/react-dialog. One recorded pin change: Tab is fired
// on the focused control (the browser's own event path, which Radix's FocusScope hears) rather than
// on `document` (where the retired hand-rolled trap listened). The promise proved is unchanged.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRef, useState } from 'react'
import { Dialog } from '../../src/ui'
import { DIALOG_PLACEMENT_CLASS } from '../../src/ui/Dialog'

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  const close = () => {
    onClose?.()
    setOpen(false)
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog open={open} onClose={close} title="Restore this version?" description="A new version is written." footer={<button type="button">Restore as a new version</button>}>
        <label>
          <input type="checkbox" /> I understand
        </label>
      </Dialog>
    </>
  )
}

function InitialFocusHarness() {
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <Dialog open onClose={() => {}} title="Verdict" description="Says why" initialFocus={ref}>
      <button type="button">First</button>
      <button type="button" ref={ref}>Preferred</button>
    </Dialog>
  )
}

afterEach(() => {
  document.getElementById('overlays')?.remove()
  document.body.style.overflow = ''
})

describe('Dialog', () => {
  it('portals into #overlays, is role=dialog aria-modal, labelled by its title, and locks scroll', () => {
    const overlays = document.createElement('div')
    overlays.id = 'overlays'
    document.body.appendChild(overlays)
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    const dialog = screen.getByRole('dialog')
    expect(overlays.contains(dialog)).toBe(true)
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBe(dialog.querySelector('h2')?.id)
    expect(screen.getByRole('dialog', { name: 'Restore this version?' })).toBeTruthy()
    expect(document.body.style.overflow).toBe('hidden')
    expect(dialog.closest('aside')).toBeNull()
  })

  it('moves focus in, traps Tab, closes on Escape and returns focus to the opener', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const opener = screen.getByRole('button', { name: 'Open' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
    const last = screen.getByRole('button', { name: 'Restore as a new version' })
    last.focus()
    // Radix's FocusScope hears Tab on the focused control, as a browser dispatches it.
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(last)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(document.body.style.overflow).toBe('')
  })

  it('renders nothing while closed', () => {
    render(<Harness />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  /** v13 fixer round: a content-sized panel (the command palette) is anchored by its TOP edge so
   * the field the person types into never moves as the result list grows; everything else stays
   * centred. The scrim carries the placement so a probe can read it. */
  it('placement: centred by default; `top` anchors the panel 12vh from the top and keeps its offset whatever the panel holds', () => {
    render(<Dialog open onClose={() => {}} title="Centred">body</Dialog>)
    const centred = screen.getByRole('dialog').parentElement as HTMLElement
    expect(centred.getAttribute('data-placement')).toBe('center')
    expect(centred.className).toContain(DIALOG_PLACEMENT_CLASS.center)
    expect(centred.className).not.toContain('items-start')
    cleanup()
    const { rerender } = render(<Dialog open onClose={() => {}} title="Top" placement="top"><p>one row</p></Dialog>)
    const top = screen.getByRole('dialog').parentElement as HTMLElement
    expect(top.getAttribute('data-placement')).toBe('top')
    expect(top.className).toContain('items-start')
    expect(top.className).toContain('pt-[12vh]')
    expect(top.className).not.toContain('items-center')
    expect(DIALOG_PLACEMENT_CLASS.top).toBe('items-start pt-[12vh]')
    // The scrim's classes — the panel's anchor — do not change with the panel's content.
    rerender(<Dialog open onClose={() => {}} title="Top" placement="top">{Array.from({ length: 8 }, (_, i) => <p key={i}>row {i}</p>)}</Dialog>)
    expect((screen.getByRole('dialog').parentElement as HTMLElement).className).toBe(top.className)
  })

  /** v13 fixer round, a finding re-verified: Radix's modal `hideOthers` marks the siblings of the
   * dialog's ancestor chain, but the `aria-hidden` package it uses (1.2.x) KEEPS every
   * `[aria-live]` element — so the LiveAnnouncer and the ToastRegion inside #root are never
   * silenced while a dialog is open. Pinned so a dependency bump cannot take that back quietly. */
  it('a live region inside #root is not aria-hidden (nor under an aria-hidden ancestor) while a modal dialog is open', () => {
    const overlays = document.createElement('div')
    overlays.id = 'overlays'
    document.body.appendChild(overlays)
    const root = document.createElement('div')
    root.id = 'root'
    const live = document.createElement('div')
    live.setAttribute('role', 'status')
    live.setAttribute('aria-live', 'polite')
    live.textContent = 'announcer'
    const other = document.createElement('p')
    other.textContent = 'the page'
    root.append(other, live)
    document.body.appendChild(root)
    render(<Dialog open onClose={() => {}} title="Modal">body</Dialog>, { container: document.body.appendChild(document.createElement('div')) })
    expect(screen.getByRole('dialog')).toBeTruthy()
    const hiddenAbove = (el: Element | null) => { for (let p = el; p; p = p.parentElement) if (p.getAttribute('aria-hidden') === 'true' || p.hasAttribute('inert')) return true; return false }
    expect(hiddenAbove(live)).toBe(false)
    // Something IS hidden: the plain content beside the live region, so the modal still inerts the page.
    expect(hiddenAbove(other)).toBe(true)
    root.remove()
  })

  it('M5: a settled panel carries no residual transform and its end state equals a cold reload', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    const dialog = screen.getByRole('dialog') as HTMLElement
    expect(dialog.style.transform).toBe('')
    expect(dialog.style.translate).toBe('')
    expect(dialog.style.scale).toBe('')
    // Opacity is the one inline end state the row may leave; it reads as fully visible.
    expect(['', '1']).toContain(dialog.style.opacity)
    const scrim = dialog.parentElement as HTMLElement
    expect(scrim.hasAttribute('data-dialog-scrim')).toBe(true)
    expect(scrim.hasAttribute('data-closing')).toBe(false)
  })

  it('M5: closing with motion off unmounts synchronously (no 120 ms ghost under test / reduced motion)', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('[data-dialog-scrim]')).toBeNull()
  })

  it('scrollBody makes the body its own scroll box and the footer takes rounded-b-[inherit]', () => {
    render(
      <Dialog open onClose={() => {}} title="Keyboard shortcuts" scrollBody footer={<button type="button">Done</button>}>
        <ul><li>one</li></ul>
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog')
    const body = dialog.querySelector('[data-dialog-body]')!
    expect(body.className).toContain('max-h-[min(60vh,560px)]')
    expect(body.className).toContain('overflow-y-auto')
    const footer = screen.getByRole('button', { name: 'Done' }).parentElement!
    expect(footer.className).toContain('rounded-b-[inherit]')
    expect(footer.className).not.toContain('rounded-b-[20px]')
  })

  // --- round 3 (Q3): what Radix adds under the kit ------------------------------------------------

  it('Radix focus scope: the first tabbable takes focus, Shift+Tab from it wraps to the last, and the page behind is aria-hidden while open', () => {
    const { container } = render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    const close = screen.getByRole('button', { name: 'Close' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Restore as a new version' }))
    // `hideOthers`: everything outside the dialog is hidden from assistive tech, and restored on close.
    expect(container.getAttribute('aria-hidden')).toBe('true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(container.hasAttribute('aria-hidden')).toBe(false)
  })

  it('initialFocus wins over the first tabbable; a description is wired through aria-describedby; the chromeless palette shell keeps its label', () => {
    render(<InitialFocusHarness />)
    const dialog = screen.getByRole('dialog', { name: 'Verdict' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Preferred' }))
    const described = document.getElementById(dialog.getAttribute('aria-describedby')!)
    expect(described?.textContent).toBe('Says why')
    render(
      <Dialog open onClose={() => {}} title="Command palette" label="Command palette" chrome={false}>
        <span>body</span>
      </Dialog>,
    )
    const palette = screen.getByRole('dialog', { name: 'Command palette' })
    expect(palette.getAttribute('aria-label')).toBe('Command palette')
    expect(palette.querySelector('h2')?.className).toContain('sr-only')
    expect(palette.querySelector('button')).toBeNull()
  })
})
