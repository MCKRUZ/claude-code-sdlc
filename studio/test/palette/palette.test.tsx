// @vitest-environment jsdom
// The palette's contract with the rest of Studio: it does not exist in the DOM while closed
// (two Playwright specs count `input` elements and expect zero), it is a proper combobox while
// open, and it never calls `window.studio.*` — the index is built from state already on screen.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette } from '../../src/palette/CommandPalette'
import { buildIndex, EMPTY_SPECS_ENTRY_ID, SETTINGS_ANCHOR_LABEL } from '../../src/palette/paletteIndex'
import { buildActionEntries, SURFACE_STORAGE_KEYS, toggleSurfacePreference } from '../../src/palette/paletteActions'
import { SETTINGS_ANCHORS } from '../../src/palette/usePaletteIndex'
import type { PaletteActionHooks } from '../../src/palette/types'
import { readRecent, RECENT_STORAGE_KEY } from '../../src/palette/recent'
import type { PaletteEntry, PaletteIndexInput } from '../../src/palette/types'
import { BUILD_VIEWS, targetForBuildView } from '../../shared/nav'
import type { ProjectStage } from '../../shared/types'

function stage(id: string, display: string, stage_state: ProjectStage['stage_state'] = 'later'): ProjectStage {
  return { id, name: display.toLowerCase(), display, status: 'pending', stage_state, artifact_count: 0, entered_at: null, completed_at: null, signed_off_by: null }
}

function input(over: Partial<PaletteIndexInput> = {}): PaletteIndexInput {
  return {
    stages: [stage('0', 'Phase 0: Discovery', 'signed_off'), stage('2', 'Phase 2: Design', 'current'), stage('build', 'Build Loop')],
    currentStageId: '2',
    viewedStageId: '2',
    readiness: null,
    backlog: { rows: [], slate: [] },
    buildViews: BUILD_VIEWS,
    settingsAnchors: ['repository', 'people', 'appearance'],
    actions: {},
    recentIds: [],
    area: 'documents',
    navigate: vi.fn(),
    openSpec: vi.fn(),
    openDocument: vi.fn(),
    openSettings: vi.fn(),
    ...over,
  }
}

/** Every method on the preload surface, each a spy — proof the palette made zero calls. */
function installStudioMock() {
  const names = ['openProject', 'pull', 'getStatus', 'getStageReadiness', 'getBoard', 'getSprintStatus', 'readDocument', 'runCommand']
  const studio = Object.fromEntries(names.map((n) => [n, vi.fn(() => Promise.resolve({}))]))
  ;(window as unknown as { studio: unknown }).studio = studio
  return studio
}

function renderOpen(entries: PaletteEntry[], over: { onClose?: () => void; onRun?: (e: PaletteEntry) => void } = {}) {
  const onClose = over.onClose ?? vi.fn()
  const utils = render(<CommandPalette open onClose={onClose} entries={entries} onRun={over.onRun} />)
  return { ...utils, onClose, combobox: screen.getByRole('combobox') as HTMLInputElement }
}

describe('CommandPalette', () => {
  let studio: Record<string, ReturnType<typeof vi.fn>>
  beforeEach(() => {
    studio = installStudioMock()
    window.localStorage.clear()
  })
  afterEach(() => {
    for (const fn of Object.values(studio)) expect(fn).not.toHaveBeenCalled()
  })

  it('closed: no <input> anywhere in the document, no dialog', () => {
    render(<CommandPalette open={false} onClose={() => {}} entries={buildIndex(input())} />)
    expect(document.querySelectorAll('input')).toHaveLength(0)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('open: a labelled modal dialog holding a combobox wired to the listbox', () => {
    const { combobox } = renderOpen(buildIndex(input()))
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBe('Command palette')
    expect(combobox.getAttribute('aria-autocomplete')).toBe('list')
    expect(combobox.getAttribute('aria-expanded')).toBe('true')
    const list = screen.getByRole('listbox')
    expect(combobox.getAttribute('aria-controls')).toBe(list.id)
    expect(document.activeElement).toBe(combobox)
    const first = within(list).getAllByRole('option')[0]
    expect(first.getAttribute('aria-selected')).toBe('true')
    expect(combobox.getAttribute('aria-activedescendant')).toBe(first.id)
    expect(screen.getAllByRole('group').length).toBeGreaterThan(0)
    expect(screen.getByText(/\d+ results/).getAttribute('aria-live')).toBe('polite')
  })

  it('prefix filters narrow to one group: > actions, # specs, / documents, @ stages', () => {
    const navigate = vi.fn()
    const entries = buildIndex(input({ navigate, actions: { toggleConsole: vi.fn(), refreshScreen: vi.fn() } }))
    const { combobox } = renderOpen(entries)
    fireEvent.change(combobox, { target: { value: '>' } })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Toggle console'), expect.stringContaining('Refresh this screen')]))
    expect(screen.queryByText(/Go to Phase/)).toBeNull()
    fireEvent.change(combobox, { target: { value: '@' } })
    expect(screen.getAllByRole('option')).toHaveLength(3)
    fireEvent.change(combobox, { target: { value: '#' } })
    // No specs indexed yet: the group says what to do, never fetches on its own.
    const only = screen.getAllByRole('option')
    expect(only).toHaveLength(1)
    expect(only[0].getAttribute('data-entry-id')).toBe(EMPTY_SPECS_ENTRY_ID)
    fireEvent.change(combobox, { target: { value: '/' } })
    expect(screen.getByText('No results')).toBeTruthy()
  })

  it('fuzzy order: "sp" ranks the Sprint view first; ↓ then Enter runs the selected entry', () => {
    const navigate = vi.fn()
    const onRun = vi.fn()
    const onClose = vi.fn()
    const { combobox } = renderOpen(buildIndex(input({ navigate })), { onRun, onClose })
    fireEvent.change(combobox, { target: { value: 'sp' } })
    const options = screen.getAllByRole('option')
    expect(options[0].textContent).toContain('Go to Sprint')
    fireEvent.keyDown(combobox, { key: 'ArrowDown' })
    fireEvent.keyDown(combobox, { key: 'ArrowUp' })
    fireEvent.keyDown(combobox, { key: 'Enter' })
    expect(navigate).toHaveBeenCalledWith(targetForBuildView('sprint'))
    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ id: 'build:sprint' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('↑ on the first row wraps to the last; Home/End jump; Tab cycles groups', () => {
    const { combobox } = renderOpen(buildIndex(input({ actions: { toggleConsole: vi.fn() } })))
    const options = screen.getAllByRole('option')
    fireEvent.keyDown(combobox, { key: 'ArrowUp' })
    expect(combobox.getAttribute('aria-activedescendant')).toBe(options[options.length - 1].id)
    fireEvent.keyDown(combobox, { key: 'Home' })
    expect(combobox.getAttribute('aria-activedescendant')).toBe(options[0].id)
    fireEvent.keyDown(combobox, { key: 'Tab' })
    const selected = screen.getAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true')!
    expect(within(selected).getByText(/Go to Board/)).toBeTruthy()
    fireEvent.keyDown(combobox, { key: 'End' })
    expect(combobox.getAttribute('aria-activedescendant')).toBe(options[options.length - 1].id)
  })

  it('Esc closes and focus returns to the opener', () => {
    const opener = document.createElement('button')
    opener.textContent = 'Search or jump…'
    document.body.appendChild(opener)
    opener.focus()
    expect(document.activeElement).toBe(opener)
    let open = true
    const onClose = vi.fn(() => { open = false })
    const entries = buildIndex(input())
    const { rerender, combobox } = renderOpen(entries, { onClose })
    expect(document.activeElement).toBe(combobox)
    fireEvent.keyDown(combobox, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    rerender(<CommandPalette open={open} onClose={onClose} entries={entries} />)
    expect(document.querySelectorAll('input')).toHaveLength(0)
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('"Refresh this screen" invokes only the callback the host passed', () => {
    const refreshScreen = vi.fn()
    const navigate = vi.fn()
    const { combobox } = renderOpen(buildIndex(input({ navigate, actions: { refreshScreen } })))
    fireEvent.change(combobox, { target: { value: 'refresh' } })
    fireEvent.keyDown(combobox, { key: 'Enter' })
    expect(refreshScreen).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('an action with no host callback is absent, not inert', () => {
    const entries = buildIndex(input({ actions: { toggleConsole: vi.fn() } }))
    expect(entries.some((e) => e.id === 'action:console')).toBe(true)
    expect(entries.some((e) => e.id === 'action:refresh')).toBe(false)
    expect(entries.some((e) => e.id === 'action:new-project')).toBe(false)
  })

  it('recent picks persist under studio.palette.recent, most recent first, capped at 8', async () => {
    const { pushRecent } = await import('../../src/palette/recent')
    for (let i = 0; i < 10; i++) pushRecent(`e${i}`)
    pushRecent('e3')
    const stored = JSON.parse(window.localStorage.getItem(RECENT_STORAGE_KEY)!)
    expect(stored).toHaveLength(8)
    expect(stored[0]).toBe('e3')
    expect(readRecent()).toEqual(stored)
  })

  // --- wiring completeness ------------------------------------------------------------------------

  it('every defined action appears when its host hook is present, in the design order', () => {
    const calls: string[] = []
    const hook = (name: string) => () => { calls.push(name) }
    const hooks: Required<PaletteActionHooks> = {
      theme: { value: 'dark', set: hook('theme') as never },
      density: { value: 'compact', set: hook('density') as never },
      motion: { value: 'on', set: hook('motion') as never },
      toggleConsole: hook('console'), toggleChat: hook('chat'), toggleSpine: hook('spine'), toggleSurface: hook('surface'),
      refreshScreen: hook('refresh'), copyProjectPath: hook('copy-path'), openShortcuts: hook('shortcuts'), back: hook('back'),
      newProject: hook('new-project'), openFolder: hook('open-folder'),
    }
    const entries = buildActionEntries(hooks)
    expect(entries.map((e) => e.id)).toEqual([
      'action:theme', 'action:density', 'action:motion', 'action:console', 'action:chat', 'action:spine', 'action:surface',
      'action:refresh', 'action:copy-path', 'action:shortcuts', 'action:back', 'action:new-project', 'action:open-folder',
    ])
    for (const e of entries) e.run()
    expect(calls).toEqual(['theme', 'density', 'motion', 'console', 'chat', 'spine', 'surface', 'refresh', 'copy-path', 'shortcuts', 'back', 'new-project', 'open-folder'])
    // Labels say what WILL happen: the cycles are system → light → dark and auto → on → off.
    expect(entries[0].title).toBe('Theme: Dark → System')
    expect(entries[2].title).toBe('Animations: On → Off')
    expect(buildActionEntries({ motion: { value: 'off', set: () => {} } })[0].title).toBe('Animations: Off → Auto')
  })

  it('Settings rows carry the literal section ids Settings renders (limits, approval), labelled', () => {
    const openSettings = vi.fn()
    const entries = buildIndex(input({ openSettings, settingsAnchors: SETTINGS_ANCHORS }))
    const settings = entries.filter((e) => e.group === 'settings')
    expect(settings.map((e) => e.id)).toContain('settings:limits')
    expect(settings.map((e) => e.id)).toContain('settings:approval')
    expect(settings.map((e) => e.id)).not.toContain('settings:build-limits')
    for (const anchor of SETTINGS_ANCHORS) expect(SETTINGS_ANCHOR_LABEL[anchor]).toBeTruthy()
    settings.find((e) => e.id === 'settings:approval')!.run()
    expect(openSettings).toHaveBeenCalledWith('approval')
  })

  it('spec and document rows open the item itself: the spec by path, the document by path', () => {
    const openSpec = vi.fn()
    const openDocument = vi.fn()
    const row = { spec: '0007', name: 'seven', path: 'specs/0007-seven.md', title: 'Seven', status: 'ready', risk: 'LOW', sprint: '' }
    const readiness = {
      ok: true, stageId: '2', name: 'design', display: 'Phase 2: Design', isCurrent: true, ready: false, judgement: [],
      signOff: { status: 'pending', signedOffBy: null, completedAt: null },
      documents: [{ name: 'design.md', path: '.sdlc/artifacts/02-design/design.md', exists: true, folder: false, shaped: true, findingCount: 0, ready: false }],
      findings: [],
    }
    const entries = buildIndex(input({ openSpec, openDocument, backlog: { rows: [row as never], slate: [] }, readiness: readiness as never }))
    entries.find((e) => e.id === 'spec:0007')!.run()
    expect(openSpec).toHaveBeenCalledWith('specs/0007-seven.md')
    entries.find((e) => e.id === 'doc:.sdlc/artifacts/02-design/design.md')!.run()
    expect(openDocument).toHaveBeenCalledWith('.sdlc/artifacts/02-design/design.md')
  })

  it('before a project opens (no stages) only the actions group exists — no Board to send anyone to', () => {
    const entries = buildIndex(input({ stages: [], currentStageId: null, viewedStageId: null, area: null, actions: { newProject: vi.fn(), openFolder: vi.fn() } }))
    expect(entries.every((e) => e.group === 'actions')).toBe(true)
    expect(entries.some((e) => e.id === EMPTY_SPECS_ENTRY_ID)).toBe(false)
    expect(entries.map((e) => e.id)).toEqual(['action:new-project', 'action:open-folder'])
  })

  it('the surface toggle flips the scene\'s stored Graph / Table and raises a same-window storage event', () => {
    const seen: string[] = []
    const onStorage = (e: StorageEvent) => { seen.push(`${e.key}=${e.newValue}`) }
    window.addEventListener('storage', onStorage)
    expect(toggleSurfacePreference('sprint')).toBe('graph')
    expect(window.localStorage.getItem(SURFACE_STORAGE_KEYS.sprint)).toBe('graph')
    expect(toggleSurfacePreference('sprint')).toBe('table')
    expect(toggleSurfacePreference('spine')).toBe('graph')
    expect(window.localStorage.getItem(SURFACE_STORAGE_KEYS.spine)).toBe('graph')
    window.removeEventListener('storage', onStorage)
    expect(seen).toEqual(['studio.sprint.surface=graph', 'studio.sprint.surface=table', 'studio.spine.surface=graph'])
  })
})
