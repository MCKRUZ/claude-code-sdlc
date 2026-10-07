// @vitest-environment jsdom
/** The constellation figure's keyboard surface (studio-upgrade-2 I6) as the DOM sees it: the
 * figure is the `scene` shortcut scope, carries a visible focus ring and the sr-only key hint,
 * clears the hover on Escape without consuming the key (the window's own Escape chain still
 * runs), and registers the palette's two graph commands only while a graph can be on screen —
 * never in a window without WebGL, never on the table surface. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SprintSlateRow, SprintView } from '../../shared/types'
import { resetCanvasRegistry } from '../../src/scenes/core/canvasRegistry'
import { getSceneActions, resetSceneActions } from '../../src/scenes/core/sceneActions'
import { markWebGLRestored } from '../../src/scenes/core/webgl'
import { constellationFromSprintView } from '../../src/scenes/constellation/constellationData'
import { DependencyConstellation, SCENE_KEYS_HINT } from '../../src/scenes/constellation/DependencyConstellation'
import { SCENE_SCOPE_ATTR, SCENE_SCOPE_VALUE } from '../../src/shortcuts/shortcutMap'

vi.mock('../../src/scenes/core/lazyCanvas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/scenes/core/lazyCanvas')>()),
  loadCanvasHost: vi.fn(() => Promise.resolve({ default: () => <div data-testid="canvas-stub" /> })),
}))

function slateRow(over: Partial<SprintSlateRow> & { id: string }): SprintSlateRow {
  return {
    name: `spec ${over.id}`, risk: 'MEDIUM', type: 'feature', channel: '', status: 'ready', sprint: 'S07', nextOwner: '',
    engReview: 'pending', dataReview: 'n-a', dependsOn: [], dor: 'READY', dorBlocking: [],
    path: `/p/specs/${over.id}-x.md`, relPath: `specs/${over.id}-x.md`, ...over,
  }
}

const VIEW: SprintView = {
  ok: true, sprint: { id: 'S07' } as unknown as SprintView['sprint'],
  slate: [slateRow({ id: '0001' }), slateRow({ id: '0002', dependsOn: ['0001'] })],
  readiness: { ready: 0, total: 2, gaps: [] }, verdictsPending: [], handoffsOpen: [], mix: {}, mixWarnings: [],
  wip: { inFlight: null, cap: null }, buildOrder: ['0001', '0002'], nextUp: '0002',
  dependencyGaps: [], decisions: null, carriedIn: [], hasData: true, note: null,
}
const DATA = constellationFromSprintView(VIEW)

const realGetContext = HTMLCanvasElement.prototype.getContext
const realRect = HTMLElement.prototype.getBoundingClientRect

function simulateWebGL() {
  HTMLCanvasElement.prototype.getContext = (() => ({})) as unknown as typeof realGetContext
  markWebGLRestored()
}

beforeEach(() => {
  resetCanvasRegistry()
  resetSceneActions()
  localStorage.clear()
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ width: 800, height: 360, top: 0, left: 0, right: 800, bottom: 360, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
})
afterEach(() => {
  cleanup()
  HTMLCanvasElement.prototype.getContext = realGetContext
  HTMLElement.prototype.getBoundingClientRect = realRect
  markWebGLRestored()
})

function figure(surface: 'graph' | 'table', onHover = vi.fn()) {
  render(
    <DependencyConstellation id="constellation-sprint" data={DATA} hoverId={null} onHover={onHover} onActivate={() => {}} live={false} surface={surface} projectKey="/p" />,
  )
  return { root: screen.getByRole('group', { name: /Dependency graph/ }), onHover }
}

describe('the figure as the scene shortcut scope', () => {
  it('is the `scene` scope, focusable, with a visible ring and the sr-only key hint', () => {
    const { root } = figure('table')
    expect(root.getAttribute(SCENE_SCOPE_ATTR)).toBe(SCENE_SCOPE_VALUE)
    expect(root.getAttribute('tabindex')).toBe('0')
    expect(root.className).toContain('focus-visible:[box-shadow:var(--ring)]')
    expect(root.className).not.toContain('outline-none focus:outline-none')
    const hint = Array.from(root.querySelectorAll('.sr-only')).find((el) => el.textContent === SCENE_KEYS_HINT)
    expect(hint).toBeTruthy()
    expect(SCENE_KEYS_HINT).toContain('Shift+arrows orbit')
  })

  it('Escape clears the hover and leaves the event for the window\'s Escape chain', () => {
    const { root, onHover } = figure('table')
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    root.dispatchEvent(ev)
    expect(onHover).toHaveBeenCalledWith(null)
    expect(ev.defaultPrevented).toBe(false)
    // A graph key the figure owns is consumed; a key it does not know is not.
    const home = new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true })
    root.dispatchEvent(home)
    expect(home.defaultPrevented).toBe(true)
    const g = new KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true })
    root.dispatchEvent(g)
    expect(g.defaultPrevented).toBe(false)
  })

  it('↓ from the figure itself focuses the first plate when plates exist, and is a no-op without them', () => {
    const { root } = figure('table')
    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    root.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(false)
    const li = document.createElement('li')
    li.dataset.plateId = '0002'
    const button = document.createElement('button')
    li.append(button)
    root.append(li)
    fireEvent.keyDown(root, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(button)
    fireEvent.keyDown(button, { key: 'n' })
    expect(document.activeElement).toBe(button)
  })
})

describe('the palette\'s graph actions (I6)', () => {
  it('are registered only while a graph can be on screen: not without WebGL, not on the table surface', () => {
    figure('graph')
    expect(getSceneActions()).toBeNull()
    cleanup()
    simulateWebGL()
    figure('table')
    expect(getSceneActions()).toBeNull()
    cleanup()
    const { root } = figure('graph')
    const actions = getSceneActions()
    expect(actions).not.toBeNull()
    expect(typeof actions!.fitGraph).toBe('function')
    // Focus next up finds the plate the plugin named; none drawn yet → false, no throw.
    expect(actions!.focusNextUp()).toBe(false)
    const li = document.createElement('li')
    li.dataset.plateId = '0002'
    const button = document.createElement('button')
    li.append(button)
    root.append(li)
    expect(actions!.focusNextUp()).toBe(true)
    expect(document.activeElement).toBe(button)
    expect(() => actions!.fitGraph()).not.toThrow()
    cleanup()
    expect(getSceneActions()).toBeNull()
  })
})
