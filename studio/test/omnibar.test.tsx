// @vitest-environment jsdom
// Round 3 (Q3): the omnibar is a cmdk combobox under the kit Dialog. Pinned here: cmdk owns the
// one `<input role="combobox">`, the listbox it controls and the active descendant; every row is
// a cmdk item AND the kit's `<li>` (its `data-value` is the entry id); the group markup keeps the
// shape the omnibar e2e reads (a `role="group"` whose first `role="presentation"` child is its
// label); ↓ moves, a pointer over a row selects it, a click runs it once and closes; Tab and
// Shift+Tab cycle groups from the kit; Escape reaches `onClose` exactly once through the dialog's
// layer; a verb row is a cmdk item whose argv title never truncates.
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette, resetPaletteFirstOpen } from '../src/palette/CommandPalette'
import { intentEntries, type IntentContext } from '../src/palette/intents'
import { buildIndex } from '../src/palette/paletteIndex'
import type { PaletteIndexInput } from '../src/palette/types'
import { BUILD_VIEWS } from '../shared/nav'
import type { ProjectStage } from '../shared/types'

// cmdk scrolls the selected row into view; jsdom has no scrollIntoView (its gap, not the kit's).
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

const stage = (id: string, display: string, stage_state: ProjectStage['stage_state'] = 'later'): ProjectStage =>
  ({ id, name: display.toLowerCase(), display, status: 'pending', stage_state, artifact_count: 0, entered_at: null, completed_at: null, signed_off_by: null })

function entries(over: Partial<PaletteIndexInput> = {}) {
  return buildIndex({
    stages: [stage('0', 'Phase 0: Discovery', 'signed_off'), stage('2', 'Phase 2: Design', 'current'), stage('build', 'Build Loop')],
    currentStageId: '2', viewedStageId: '2', readiness: null, backlog: { rows: [], slate: [] }, buildViews: BUILD_VIEWS,
    settingsAnchors: ['repository', 'appearance'], actions: { toggleConsole: vi.fn(), refreshScreen: vi.fn() }, recentIds: [], area: 'documents',
    navigate: vi.fn(), openSpec: vi.fn(), openDocument: vi.fn(), openSettings: vi.fn(), ...over,
  })
}

beforeEach(() => {
  window.localStorage.clear()
  resetPaletteFirstOpen()
})

describe('the omnibar on cmdk', () => {
  it('cmdk owns the combobox, the listbox and the active descendant; rows are cmdk items on the kit <li>; groups keep the e2e shape', () => {
    render(<CommandPalette open onClose={vi.fn()} entries={entries()} />)
    const combobox = screen.getByRole('combobox')
    expect(combobox.hasAttribute('cmdk-input')).toBe(true)
    expect(document.querySelectorAll('input')).toHaveLength(1)
    expect(document.activeElement).toBe(combobox)
    const list = screen.getByRole('listbox')
    expect(list.hasAttribute('cmdk-list')).toBe(true)
    expect(combobox.getAttribute('aria-controls')).toBe(list.id)
    const options = screen.getAllByRole('option')
    expect(options.every((o) => o.hasAttribute('cmdk-item') && o.tagName === 'LI')).toBe(true)
    expect(options[0].getAttribute('data-value')).toBe(options[0].getAttribute('data-entry-id'))
    expect(options[0].getAttribute('aria-selected')).toBe('true')
    expect(combobox.getAttribute('aria-activedescendant')).toBe(options[0].id)
    const group = list.querySelector('[role="group"]')!
    const label = group.querySelector('[role="presentation"]')!
    expect(label.id).toBe(group.getAttribute('aria-labelledby'))
    expect(label.textContent).toBe('Stages')
    expect(label.className).toContain('text-ink-3')
  })

  it('↓ moves the active descendant, a pointer over a row selects it, and a click runs it once and closes', () => {
    const onClose = vi.fn()
    const onRun = vi.fn()
    render(<CommandPalette open onClose={onClose} onRun={onRun} entries={entries()} />)
    const combobox = screen.getByRole('combobox')
    const options = screen.getAllByRole('option')
    fireEvent.keyDown(combobox, { key: 'ArrowDown' })
    expect(options[1].getAttribute('aria-selected')).toBe('true')
    expect(combobox.getAttribute('aria-activedescendant')).toBe(options[1].id)
    fireEvent.pointerMove(options[2])
    expect(options[2].getAttribute('aria-selected')).toBe('true')
    expect(options[1].getAttribute('aria-selected')).toBe('false')
    fireEvent.click(options[2])
    expect(onRun).toHaveBeenCalledTimes(1)
    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ id: options[2].getAttribute('data-entry-id') }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Tab and Shift+Tab cycle groups from the kit; Escape reaches onClose exactly once through the dialog layer', () => {
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} entries={entries()} />)
    const combobox = screen.getByRole('combobox')
    const groups = Array.from(document.querySelectorAll('[role="group"]'))
    expect(groups.length).toBeGreaterThan(1)
    const firstOf = (g: Element) => g.querySelector('[role="option"]')!
    fireEvent.keyDown(combobox, { key: 'Tab' })
    expect(firstOf(groups[1]).getAttribute('aria-selected')).toBe('true')
    expect(combobox.getAttribute('aria-activedescendant')).toBe(firstOf(groups[1]).id)
    fireEvent.keyDown(combobox, { key: 'Tab', shiftKey: true })
    expect(firstOf(groups[0]).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(combobox, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a verb row is a cmdk item whose argv title wraps unbroken; Enter hands the intent to the host and runs nothing', () => {
    const onIntent = vi.fn()
    const ctx: IntentContext = {
      rows: [{ spec: '0002', status: 'draft', sprint: 'S08', path: 'specs/0002-b.md' }], roster: [], activeSprint: 'S08', sprintIds: ['S08'],
      capabilities: ['sprint-status', 'sprint-write'], actor: '@arjun',
    }
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} entries={entries()} intents={(q) => intentEntries(q, ctx, onIntent)} />)
    const combobox = screen.getByRole('combobox')
    fireEvent.change(combobox, { target: { value: 'verdict 0002 accepted' } })
    const verb = screen.getAllByRole('option')[0]
    expect(verb.getAttribute('data-entry-id')).toBe('verb:intent')
    expect(verb.hasAttribute('cmdk-item')).toBe(true)
    expect(verb.getAttribute('aria-selected')).toBe('true')
    const argv = verb.querySelector('[data-verb-argv]')!
    expect(argv.textContent).toContain('--by @arjun')
    expect(argv.className).not.toContain('truncate')
    fireEvent.keyDown(combobox, { key: 'Enter' })
    expect(onIntent).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('an incomplete phrase offers the nearest template; choosing it fills the query and keeps the palette open, running nothing (Q4 P4 seam)', () => {
    const onIntent = vi.fn()
    const ctx: IntentContext = {
      rows: [{ spec: '0002', status: 'draft', sprint: 'S08', path: 'specs/0002-b.md' }], roster: [], activeSprint: 'S08', sprintIds: ['S08'],
      capabilities: ['sprint-status', 'sprint-write'], actor: '@arjun',
    }
    const onClose = vi.fn()
    const onRun = vi.fn()
    render(<CommandPalette open onClose={onClose} onRun={onRun} entries={entries()} intents={(q, suggest) => intentEntries(q, ctx, onIntent, suggest)} />)
    const combobox = screen.getByRole('combobox') as HTMLInputElement
    fireEvent.change(combobox, { target: { value: 'defer 0002' } })
    const row = screen.getAllByRole('option')[0]
    expect(row.getAttribute('data-entry-id')).toBe('verb:suggest:0')
    expect(row.textContent).toContain('defer 0002 because <reason>')
    fireEvent.keyDown(combobox, { key: 'Enter' })
    // Filled, not run: the host hears nothing, the palette stays, the row is not a recent.
    expect(combobox.value).toBe('defer 0002 because <reason>')
    expect(onIntent).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(onRun).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(combobox)
  })
})
