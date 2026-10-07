// @vitest-environment jsdom
// The palette's contract with the rest of Studio: it does not exist in the DOM while closed
// (two Playwright specs count `input` elements and expect zero), it is a proper combobox while
// open, and it never calls `window.studio.*` — the index is built from state already on screen.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette, resetPaletteFirstOpen } from '../../src/palette/CommandPalette'
import { intentEntries, type IntentContext } from '../../src/palette/intents'
import { groupResults } from '../../src/palette/paletteResults'
import { rankEntries } from '../../src/palette/score'
import { buildIndex, EMPTY_SPECS_ENTRY_ID, SETTINGS_ANCHOR_LABEL } from '../../src/palette/paletteIndex'
import { buildActionEntries, SURFACE_STORAGE_KEYS, toggleSurfacePreference } from '../../src/palette/paletteActions'
import { SETTINGS_ANCHORS } from '../../src/palette/usePaletteIndex'
import type { PaletteActionHooks } from '../../src/palette/types'
import { readRecent, RECENT_STORAGE_KEY } from '../../src/palette/recent'
import type { PaletteEntry, PaletteIndexInput } from '../../src/palette/types'
import { BUILD_VIEWS, targetForBuildView } from '../../shared/nav'
import type { ProjectStage } from '../../shared/types'

// Round 3 (Q3): the palette is a cmdk combobox, and cmdk scrolls the selected row into view
// after every selection change. jsdom has no `scrollIntoView` (a real gap in jsdom, not in the
// component — the same shape as setupTests' `scrollTo` stub); an inert one lets the combobox
// run, and the assertions below stay about the DOM, not scroll physics jsdom never had.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

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
    resetPaletteFirstOpen()
  })
  afterEach(() => {
    for (const fn of Object.values(studio)) expect(fn).not.toHaveBeenCalled()
  })

  /** v13 fixer round: the palette's panel follows its result list, so it is anchored by its top
   * edge (`Dialog placement="top"`) — the input never moves between a one-row and an eight-row
   * result (the v13 shots put it at y 205 and y 352). */
  it('open: the panel is anchored at the top of the scrim, not centred', () => {
    renderOpen(buildIndex(input()))
    const scrim = screen.getByTestId('command-palette').parentElement as HTMLElement
    expect(scrim.hasAttribute('data-dialog-scrim')).toBe(true)
    expect(scrim.getAttribute('data-placement')).toBe('top')
    expect(scrim.className).toContain('items-start')
    expect(scrim.className).not.toContain('items-center')
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

  // The sprint view is relabelled Home (togo-command-center.md §1/§7 P0); its id and target are unchanged.
  it('fuzzy order: "sp" ranks the sprint home (labelled Home) first; ↓ then Enter runs the selected entry', () => {
    const navigate = vi.fn()
    const onRun = vi.fn()
    const onClose = vi.fn()
    const { combobox } = renderOpen(buildIndex(input({ navigate })), { onRun, onClose })
    fireEvent.change(combobox, { target: { value: 'sp' } })
    const options = screen.getAllByRole('option')
    expect(options[0].textContent).toContain('Go to Home')
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
    // The build group now leads with the sprint home (BUILD_VIEWS order, togo-command-center.md §1).
    expect(within(selected).getByText(/Go to Home/)).toBeTruthy()
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
      fitGraph: hook('fit-graph'), focusNextUp: hook('focus-next-up'),
      refreshScreen: hook('refresh'), copyProjectPath: hook('copy-path'), openShortcuts: hook('shortcuts'), steering: hook('steering'), back: hook('back'),
      newProject: hook('new-project'), openFolder: hook('open-folder'),
    }
    const entries = buildActionEntries(hooks)
    expect(entries.map((e) => e.id)).toEqual([
      'action:theme', 'action:density', 'action:motion', 'action:console', 'action:chat', 'action:spine', 'action:surface',
      'action:fit-graph', 'action:focus-next-up',
      'action:refresh', 'action:copy-path', 'action:shortcuts', 'action:steering', 'action:back', 'action:new-project', 'action:open-folder',
    ])
    for (const e of entries) e.run()
    expect(calls).toEqual(['theme', 'density', 'motion', 'console', 'chat', 'spine', 'surface', 'fit-graph', 'focus-next-up', 'refresh', 'copy-path', 'shortcuts', 'steering', 'back', 'new-project', 'open-folder'])
    // Labels say what WILL happen: the cycles are system → light → dark and auto → on → off.
    expect(entries[0].title).toBe('Theme: Dark → System')
    expect(entries[2].title).toBe('Animations: On → Off')
    expect(buildActionEntries({ motion: { value: 'off', set: () => {} } })[0].title).toBe('Animations: Off → Auto')
  })

  /** Round 2 (I6): the graph's two rows are screen callbacks — present only when the host passed
   * them (a graph on screen), running nothing but the callback. The `afterEach` above proves the
   * palette made zero `window.studio` calls through them. */
  it('"Fit the graph" and "Focus next up" appear only with their callbacks and run only those', () => {
    const fitGraph = vi.fn()
    const focusNextUp = vi.fn()
    const navigate = vi.fn()
    const withGraph = buildIndex(input({ navigate, actions: { fitGraph, focusNextUp } }))
    const fit = withGraph.find((e) => e.id === 'action:fit-graph')!
    const next = withGraph.find((e) => e.id === 'action:focus-next-up')!
    expect(fit.title).toBe('Fit the graph')
    expect(fit.kbd).toEqual(['Home'])
    expect(next.title).toBe('Focus next up')
    expect(next.kbd).toEqual(['n'])
    fit.run()
    next.run()
    expect(fitGraph).toHaveBeenCalledTimes(1)
    expect(focusNextUp).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
    const withoutGraph = buildIndex(input({ actions: { toggleConsole: vi.fn() } }))
    expect(withoutGraph.some((e) => e.id === 'action:fit-graph' || e.id === 'action:focus-next-up')).toBe(false)
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

  // --- round 2 (M5, M8) ---------------------------------------------------------------------------

  it('DOM order equals ranked order (grouped), on open and after a re-rank', () => {
    const entries = buildIndex(input({ actions: { toggleConsole: vi.fn(), refreshScreen: vi.fn() } }))
    const { combobox } = renderOpen(entries)
    const expectedFor = (query: string) => groupResults(rankEntries(query, entries, { recentIds: [] })).flat.map((r) => r.entry.id)
    const domIds = () => screen.getAllByRole('option').map((o) => o.getAttribute('data-entry-id'))
    expect(domIds()).toEqual(expectedFor(''))
    fireEvent.change(combobox, { target: { value: 'sp' } })
    expect(domIds()).toEqual(expectedFor('sp'))
    fireEvent.change(combobox, { target: { value: 'ref' } })
    expect(domIds()).toEqual(expectedFor('ref'))
  })

  it('every row is pressable and carries a palette:<id> flip id; the first open leaves no residual row opacity', () => {
    renderOpen(buildIndex(input()))
    const options = screen.getAllByRole('option')
    expect(options.every((o) => o.hasAttribute('data-pressable'))).toBe(true)
    for (const o of options) expect(o.getAttribute('data-flip-id')).toBe(`palette:${o.getAttribute('data-entry-id')}`)
    // Motion is off under test: the stagger is an instant end state and `clearProps` leaves no inline opacity.
    expect(options.every((o) => (o as HTMLElement).style.opacity === '')).toBe(true)
  })

  it('the empty state spells its prefixes as Kbd keycaps and the group labels / footer are words in ink-3', () => {
    const { combobox } = renderOpen(buildIndex(input()))
    const group = document.querySelector('[role="group"]')!
    const label = document.getElementById(group.getAttribute('aria-labelledby')!)!
    expect(label.className).toContain('text-ink-3')
    expect(label.className).not.toContain('ink-4')
    fireEvent.change(combobox, { target: { value: 'zzzz-nothing' } })
    const empty = document.querySelector('[data-palette-empty]')!
    expect(Array.from(empty.querySelectorAll('kbd')).map((k) => k.textContent)).toEqual(['>', '#', '/', '@'])
    expect(empty.querySelector('kbd')!.className).toContain('rounded-[5px]')
    const footer = screen.getByText('move').closest('div')!
    expect(footer.className).toContain('text-ink-3')
  })

  // --- the omnibar (togo-command-center.md §3.6) ---------------------------------------------------

  /** A verb typed in plain words is ONE row in a leading `verbs` group; `↵` on it hands the
   * intent to the host (which opens the dialog) and spawns nothing — the `afterEach` above proves
   * zero `window.studio` calls. A prefix query never parses as a verb. */
  it('the verbs group leads for a typed verb; Enter opens the intent, never runs it; prefixes bypass it', () => {
    const onIntent = vi.fn()
    const ctx: IntentContext = {
      rows: [{ spec: '0002', status: 'draft', sprint: 'S08', path: 'specs/0002-b.md' }], roster: [], activeSprint: 'S08', sprintIds: ['S08'],
      capabilities: ['sprint-status', 'sprint-write'], actor: '@arjun',
    }
    const intents = (q: string) => intentEntries(q, ctx, onIntent)
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} entries={buildIndex(input())} intents={intents} />)
    const combobox = screen.getByRole('combobox') as HTMLInputElement
    expect(document.querySelectorAll('[data-entry-id="verb:intent"]')).toHaveLength(0)
    fireEvent.change(combobox, { target: { value: 'verdict 0002 accepted' } })
    const options = screen.getAllByRole('option')
    expect(options[0].getAttribute('data-entry-id')).toBe('verb:intent')
    expect(options[0].textContent).toContain('Run: sprint.py verdict --spec 0002 --lane eng --verdict accepted --by @arjun')
    expect(options[0].getAttribute('aria-selected')).toBe('true')
    const groupLabel = document.getElementById(options[0].closest('[role="group"]')!.getAttribute('aria-labelledby')!)!
    expect(groupLabel.textContent).toBe('Verbs')
    fireEvent.keyDown(combobox, { key: 'Enter' })
    expect(onIntent).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalled()
    cleanup()
    render(<CommandPalette open onClose={vi.fn()} entries={buildIndex(input())} intents={intents} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '>verdict 0002 accepted' } })
    expect(document.querySelectorAll('[data-entry-id="verb:intent"]')).toHaveLength(0)
  })
})
