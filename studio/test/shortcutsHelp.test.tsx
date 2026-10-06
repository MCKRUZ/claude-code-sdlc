// @vitest-environment jsdom
// The Shortcuts help renders the SAME table the listener dispatches from: every binding in
// SHORTCUT_MAP is on the page by label (the ten phase sequences as one row), grouped by scope,
// with `<kbd>` glyphs. Closed, nothing of it exists — no dialog, no input — so the shell's pins
// hold; Escape asks to close.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShortcutsHelp, SHORTCUTS_HELP_TITLE, helpRows } from '../src/components/ShortcutsHelp'
import { SHORTCUT_MAP, SHORTCUT_SCOPE_LABEL } from '../src/shortcuts/shortcutMap'

afterEach(() => {
  document.body.style.overflow = ''
})

describe('ShortcutsHelp', () => {
  it('closed: renders nothing — no dialog, no input', () => {
    render(<ShortcutsHelp open={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelectorAll('input')).toHaveLength(0)
  })

  it('open: a modal dialog titled "Keyboard shortcuts", every scope with bindings as a section', () => {
    render(<ShortcutsHelp open onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: SHORTCUTS_HELP_TITLE })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const scopes = new Set(SHORTCUT_MAP.map((b) => b.scope))
    for (const scope of scopes) {
      expect(within(dialog).getByRole('heading', { level: 3, name: SHORTCUT_SCOPE_LABEL[scope] })).toBeTruthy()
    }
    // Still no input anywhere: the help is read-only.
    expect(document.querySelectorAll('input')).toHaveLength(0)
    expect(document.querySelectorAll('aside')).toHaveLength(0)
  })

  it('lists every binding by label, with kbd glyphs; the phase sequences collapse into one row', () => {
    render(<ShortcutsHelp open onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    const labels = new Set(SHORTCUT_MAP.map((b) => (/^Go to Phase \d$/.test(b.label) ? 'Go to Phase 0–9' : b.label)))
    // Row labels are the <dt>s; "Keyboard shortcuts" is also the dialog's title, so read the
    // definition list rather than free text.
    const rowLabels = Array.from(dialog.querySelectorAll('dt')).map((dt) => dt.textContent)
    for (const label of labels) expect(rowLabels).toContain(label)
    expect(rowLabels).not.toContain('Go to Phase 3')
    expect(rowLabels.filter((l) => l === 'Go to Phase 0–9')).toHaveLength(1)
    expect(dialog.querySelectorAll('kbd').length).toBeGreaterThan(labels.size)
    // ⌘K and / share a label, so they share a row joined by "or".
    const paletteRow = within(dialog).getByText('Command palette').parentElement!
    expect(paletteRow.textContent).toContain('or')
    expect(paletteRow.querySelectorAll('kbd')).toHaveLength(2)
  })

  it('helpRows keeps one row per label and the two-step chords as sequences', () => {
    const rows = helpRows(SHORTCUT_MAP, 'project')
    const board = rows.find((r) => r.label === 'Go to the Board')!
    expect(board.chords).toEqual([['g', 'b']])
    expect(rows.filter((r) => r.label === 'Go to Phase 0–9')).toHaveLength(1)
    expect(helpRows(SHORTCUT_MAP, 'global').map((r) => r.label)).toContain('Keyboard shortcuts')
  })

  it('Escape asks to close', () => {
    const onClose = vi.fn()
    render(<ShortcutsHelp open onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
