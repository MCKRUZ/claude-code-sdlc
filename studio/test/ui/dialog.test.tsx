// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { Dialog } from '../../src/ui'

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
    fireEvent.keyDown(document, { key: 'Tab' })
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
})
