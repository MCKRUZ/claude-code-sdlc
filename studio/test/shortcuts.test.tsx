// @vitest-environment jsdom
// The single keydown listener: chords land within their window and not after it, single keys
// are suppressed while typing unless the binding says `inInputs`, the primary modifier follows
// the platform, and Esc walks its layers and never goes back while something is being edited.
import { act, cleanup as cleanupAll, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  chordFromEvent, inSceneScope, kbdKeys, normalizeChord, SCENE_BINDINGS, SCENE_SCOPE_ATTR, SCENE_SCOPE_VALUE, sceneCommandFor, SHORTCUT_MAP,
} from '../src/shortcuts/shortcutMap'
import { useShortcuts, isEditableTarget } from '../src/shortcuts/useShortcuts'
import type { ShortcutHandlers, UseShortcutsOptions } from '../src/shortcuts/useShortcuts'
import { resetStageTabStore, SPINE_COLLAPSED_STORAGE_KEY, stageTabStore, useStageTabRequest, useSpineCollapsed } from '../src/stores/stageTabStore'

function Host(props: UseShortcutsOptions) {
  useShortcuts(props)
  return <div><input aria-label="search" /><button>b</button></div>
}

function press(key: string, init: KeyboardEventInit & { target?: Element } = {}) {
  const { target, ...rest } = init
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...rest })
  ;(target ?? document.body).dispatchEvent(ev)
  return ev
}

function setPlatform(platform: string) {
  Object.defineProperty(window.navigator, 'platform', { value: platform, configurable: true })
}

describe('chord vocabulary', () => {
  it('normalises modifier order and letter case', () => {
    expect(normalizeChord('Shift+Mod+k')).toBe('Mod+Shift+K')
    expect(normalizeChord('g')).toBe('g')
  })
  it('reads Mod from ⌘ on a Mac and Ctrl elsewhere; drops Shift for shifted punctuation', () => {
    const e = { key: 'k', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }
    expect(chordFromEvent(e, true)).toBe('Mod+K')
    expect(chordFromEvent(e, false)).toBe('Meta+K')
    expect(chordFromEvent({ ...e, metaKey: false, ctrlKey: true }, false)).toBe('Mod+K')
    expect(chordFromEvent({ key: '?', metaKey: false, ctrlKey: false, altKey: false, shiftKey: true }, true)).toBe('?')
    expect(chordFromEvent({ key: 'Shift', metaKey: false, ctrlKey: false, altKey: false, shiftKey: true }, true)).toBeNull()
    expect(kbdKeys('Mod+K', true)).toEqual(['⌘', 'K'])
    expect(kbdKeys('Mod+K', false)).toEqual(['Ctrl', 'K'])
  })
  it('the map avoids the Electron and OS defaults', () => {
    const singles = SHORTCUT_MAP.filter((b) => b.keys.length === 1).map((b) => normalizeChord(b.keys[0]))
    for (const forbidden of ['Mod+W', 'Mod+Q', 'Mod+R', 'Mod+1', 'Mod+9', 'F5']) expect(singles).not.toContain(forbidden)
  })
})

describe('useShortcuts', () => {
  afterEach(() => setPlatform('MacIntel'))

  function mount(handlers: ShortcutHandlers, over: Partial<UseShortcutsOptions> = {}) {
    return render(<Host handlers={handlers} scopes={['project', 'stageHome']} {...over} />)
  }

  it('runs a two-key chord inside the window and forgets it after 800 ms', () => {
    vi.useFakeTimers()
    setPlatform('MacIntel')
    const goBuildView = vi.fn()
    mount({ goBuildView })
    press('g')
    vi.advanceTimersByTime(500)
    press('b')
    expect(goBuildView).toHaveBeenCalledWith('board')
    press('g')
    vi.advanceTimersByTime(900)
    press('s')
    expect(goBuildView).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('g then a digit goes to that phase id; g then . goes to close', () => {
    const goStage = vi.fn()
    mount({ goStage })
    press('g'); press('2')
    press('g'); press('.')
    expect(goStage.mock.calls.map((c) => c[0])).toEqual(['2', 'close'])
  })

  it('suppresses single keys while typing, except bindings marked inInputs', () => {
    setPlatform('MacIntel')
    const openPalette = vi.fn()
    const stageTab = vi.fn()
    const { container } = mount({ openPalette, stageTab })
    const field = container.querySelector('input')!
    field.focus()
    press('/', { target: field })
    press('1', { target: field })
    expect(openPalette).not.toHaveBeenCalled()
    expect(stageTab).not.toHaveBeenCalled()
    press('k', { target: field, metaKey: true })
    expect(openPalette).toHaveBeenCalledTimes(1)
    press('/', { target: container.querySelector('button')! })
    expect(openPalette).toHaveBeenCalledTimes(2)
    expect(isEditableTarget(container.querySelector('button'))).toBe(false)
  })

  it('uses Ctrl as Mod on Windows', () => {
    setPlatform('Win32')
    const toggleConsole = vi.fn()
    mount({ toggleConsole })
    press('j', { ctrlKey: true })
    expect(toggleConsole).toHaveBeenCalledTimes(1)
    press('j', { metaKey: true })
    expect(toggleConsole).toHaveBeenCalledTimes(1)
  })

  it('a binding outside the live scopes does nothing', () => {
    const stepDocument = vi.fn()
    mount({ stepDocument })
    press('ArrowDown', { altKey: true })
    expect(stepDocument).not.toHaveBeenCalled()
  })

  it('Esc: layers first, then back — and never back while dirty', () => {
    const closeDialog = vi.fn(() => false)
    const clearSearch = vi.fn(() => true)
    const onBack = vi.fn()
    let dirty = false
    mount({}, { escLayers: [closeDialog, clearSearch], onBack, isDirty: () => dirty })
    let ev = press('Escape')
    expect(closeDialog).toHaveBeenCalledTimes(1)
    expect(clearSearch).toHaveBeenCalledTimes(1)
    expect(onBack).not.toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(true)
    clearSearch.mockReturnValue(false)
    press('Escape')
    expect(onBack).toHaveBeenCalledTimes(1)
    dirty = true
    ev = press('Escape')
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(ev.defaultPrevented).toBe(false)
  })

  it('leaves an event another handler already consumed alone', () => {
    const openPalette = vi.fn()
    mount({ openPalette })
    const ev = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })
    ev.preventDefault()
    document.body.dispatchEvent(ev)
    expect(openPalette).not.toHaveBeenCalled()
  })
})

/** Round 2 (I6): the graph's keys live in the `scene` scope, which is live ONLY while the event
 * comes from inside a `[data-shortcut-scope="scene"]` figure — a host never lists it, and the
 * same key outside the figure does nothing. `SCENE_BINDINGS` is the one table: the listener, the
 * figure's own keydown (`sceneCommandFor`) and the help dialog all read it. */
describe('scene scope (I6)', () => {
  afterEach(() => setPlatform('MacIntel'))

  function Figure(props: UseShortcutsOptions) {
    useShortcuts(props)
    return (
      <div>
        <div {...{ [SCENE_SCOPE_ATTR]: SCENE_SCOPE_VALUE }} tabIndex={0} data-testid="figure"><button>plate</button></div>
        <button data-testid="outside">elsewhere</button>
      </div>
    )
  }

  it('dispatches a graph key only when the target is inside the figure, whatever scopes the host listed', () => {
    const sceneCommand = vi.fn()
    const { getByTestId } = render(<Figure handlers={{ sceneCommand }} scopes={['project']} />)
    press('Home', { target: getByTestId('outside') })
    expect(sceneCommand).not.toHaveBeenCalled()
    const ev = press('Home', { target: getByTestId('figure') })
    expect(sceneCommand).toHaveBeenCalledWith('fit')
    expect(ev.defaultPrevented).toBe(true)
    press('n', { target: getByTestId('figure').querySelector('button')! })
    expect(sceneCommand).toHaveBeenLastCalledWith('nextUp')
    press('ArrowLeft', { target: getByTestId('figure'), shiftKey: true })
    expect(sceneCommand).toHaveBeenLastCalledWith('orbitLeft')
    press('+', { target: getByTestId('figure'), shiftKey: true })
    expect(sceneCommand).toHaveBeenLastCalledWith('zoomIn')
    press('ArrowDown', { target: getByTestId('figure') })
    expect(sceneCommand).toHaveBeenLastCalledWith('stepNext')
    // A host that listed `scene` itself still gets nothing outside the figure.
    cleanupAll()
    const again = vi.fn()
    const r = render(<Figure handlers={{ sceneCommand: again }} scopes={['project', 'scene']} />)
    press('Home', { target: r.getByTestId('outside') })
    expect(again).not.toHaveBeenCalled()
  })

  it('sceneCommandFor reads the same table as the listener; Escape is clear; a non-graph key is null', () => {
    const e = (key: string, shiftKey = false) => ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey })
    expect(sceneCommandFor(e('Home'), true)).toBe('fit')
    expect(sceneCommandFor(e('n'), true)).toBe('nextUp')
    expect(sceneCommandFor(e('ArrowUp', true), true)).toBe('orbitUp')
    expect(sceneCommandFor(e('ArrowUp'), true)).toBe('stepPrev')
    expect(sceneCommandFor(e('-'), true)).toBe('zoomOut')
    expect(sceneCommandFor(e('='), true)).toBe('zoomIn')
    expect(sceneCommandFor(e('Escape'), true)).toBe('clear')
    expect(sceneCommandFor(e('g'), true)).toBeNull()
    expect(SCENE_BINDINGS.every((b) => b.scope === 'scene' && b.action.type === 'scene')).toBe(true)
    expect(SHORTCUT_MAP.filter((b) => b.scope === 'scene')).toEqual(SCENE_BINDINGS)
    expect(normalizeChord('+')).toBe('+')
    expect(inSceneScope(null)).toBe(false)
  })
})

describe('stageTabStore (what 1 / 2 / 3 and the Spine row write)', () => {
  afterEach(() => {
    window.localStorage.removeItem(SPINE_COLLAPSED_STORAGE_KEY)
    resetStageTabStore()
  })

  it('a request carries the tab by name and a fresh nonce each time, so a repeat press is a new event', () => {
    expect(stageTabStore.tabRequest).toBeNull()
    stageTabStore.request(2)
    expect(stageTabStore.tabRequest).toEqual({ tab: 'documents', nonce: 1 })
    stageTabStore.request('documents')
    expect(stageTabStore.tabRequest).toEqual({ tab: 'documents', nonce: 2 })
    stageTabStore.request(3)
    expect(stageTabStore.tabRequest?.tab).toBe('guide')
  })

  it('re-renders a subscriber on request, and the digit shortcut reaches it through the handler', () => {
    const seen: string[] = []
    function Probe() {
      const req = useStageTabRequest()
      seen.push(req ? `${req.tab}#${req.nonce}` : 'none')
      return null
    }
    render(<><Host handlers={{ stageTab: (t) => stageTabStore.request(t) }} scopes={['project', 'stageHome']} /><Probe /></>)
    // A store write outside React's own event path needs act() to flush the subscriber's render.
    act(() => { press('1') })
    act(() => { press('3') })
    expect(seen.slice(-2)).toEqual(['workflow#1', 'guide#2'])
  })

  it('the Spine toggle persists under studio.spine.collapsed and notifies; absent, the band is collapsed (the strip shows the stations)', () => {
    const seen: boolean[] = []
    function Probe() { seen.push(useSpineCollapsed()); return null }
    render(<Probe />)
    // The default beside the lifecycle strip is collapsed (fixer round, v11 stage shots).
    expect(stageTabStore.spineCollapsed).toBe(true)
    act(() => { stageTabStore.toggleSpineCollapsed() })
    expect(window.localStorage.getItem(SPINE_COLLAPSED_STORAGE_KEY)).toBe('0')
    act(() => { stageTabStore.toggleSpineCollapsed() })
    expect(window.localStorage.getItem(SPINE_COLLAPSED_STORAGE_KEY)).toBe('1')
    expect(seen).toEqual([true, false, true])
    // An older '1' still reads collapsed; '0' reads expanded.
    window.localStorage.setItem(SPINE_COLLAPSED_STORAGE_KEY, '0')
    resetStageTabStore()
    expect(stageTabStore.spineCollapsed).toBe(false)
  })
})

/** Command center (togo-command-center.md §1, §3.1): `g l` and `g t` dispatch from the one
 * table; the lanes' keys are live ONLY inside `[data-shortcut-scope="lanes"]`, as the graph's are. */
describe('command-center bindings', () => {
  afterEach(() => setPlatform('MacIntel'))

  it('g l goes to the lifecycle home and g t to steering; g s stays a build view', () => {
    const goHome = vi.fn()
    const steering = vi.fn()
    const goBuildView = vi.fn()
    render(<Host handlers={{ goHome, steering, goBuildView }} scopes={['project']} />)
    press('g'); press('l')
    expect(goHome).toHaveBeenCalledWith('lifecycle')
    press('g'); press('t')
    expect(steering).toHaveBeenCalledTimes(1)
    press('g'); press('s')
    expect(goBuildView).toHaveBeenCalledWith('sprint')
    press('g'); press('p')
    expect(goBuildView).toHaveBeenLastCalledWith('planning')
  })

  it('j / k / Enter / h / v reach laneCommand only from inside the lane board', () => {
    const laneCommand = vi.fn()
    function Lanes(props: UseShortcutsOptions) {
      useShortcuts(props)
      return <div><div data-shortcut-scope="lanes" tabIndex={0} data-testid="lanes"><button>card</button></div><button data-testid="outside">x</button></div>
    }
    const { getByTestId } = render(<Lanes handlers={{ laneCommand }} scopes={['project']} />)
    press('j', { target: getByTestId('outside') })
    expect(laneCommand).not.toHaveBeenCalled()
    press('j', { target: getByTestId('lanes') })
    press('k', { target: getByTestId('lanes').querySelector('button')! })
    press('Enter', { target: getByTestId('lanes') })
    press('h', { target: getByTestId('lanes') })
    press('v', { target: getByTestId('lanes') })
    expect(laneCommand.mock.calls.map((c) => c[0])).toEqual(['next', 'prev', 'open', 'handoff', 'verdict'])
  })
})
