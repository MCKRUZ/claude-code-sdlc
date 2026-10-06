// @vitest-environment jsdom
/** SceneShell as a person without a GPU meets it, and as the bundle meets it. In jsdom there is
 * no WebGL, so the table — the DOM view of equal rank — must render alone, and the lazy import of
 * the scene chunk must never be requested (proven by a spy on the module seam, not by guessing
 * from bundle contents). With WebGL simulated: one live Canvas at a time, and a lost context sends
 * every shell back to its table. */

import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetCanvasRegistry } from '../../src/scenes/core/canvasRegistry'
import { prefetchCanvasHost, resetCanvasPrefetch } from '../../src/scenes/core/lazyCanvas'
import { SceneShell } from '../../src/scenes/core/SceneShell'
import type { SceneShellProps } from '../../src/scenes/core/types'
import { canUseWebGL, markWebGLLost, markWebGLRestored } from '../../src/scenes/core/webgl'

const seam = vi.hoisted(() => {
  const StubCanvas = () => <div data-testid="canvas-stub" />
  return { loadCanvasHost: vi.fn(() => Promise.resolve({ default: StubCanvas })) }
})

// Partial: the real `prefetchCanvasHost` / `resetCanvasPrefetch` run over the spied seam.
vi.mock('../../src/scenes/core/lazyCanvas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/scenes/core/lazyCanvas')>()),
  loadCanvasHost: seam.loadCanvasHost,
}))

const shell = (over: Partial<SceneShellProps> = {}) => (
  <SceneShell
    id="spine"
    title="Lifecycle"
    summary="Phase 3 of 9 current; 3 signed off; next: Build"
    legend="Nine stages in the plugin's order. Height and depth carry no meaning."
    surface="table"
    onSurfaceChange={() => {}}
    table={<table data-testid="the-table"><tbody><tr><td>row</td></tr></tbody></table>}
    {...over}
  />
)

const realGetContext = HTMLCanvasElement.prototype.getContext
const realRect = HTMLElement.prototype.getBoundingClientRect

/** Pretend the GPU is there and the host is wide. */
function simulateWebGL() {
  HTMLCanvasElement.prototype.getContext = (() => ({})) as unknown as typeof realGetContext
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ width: 800, height: 200, top: 0, left: 0, right: 800, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  markWebGLRestored() // clears the memoised probe so the stub answers
}

beforeEach(() => {
  seam.loadCanvasHost.mockClear()
  resetCanvasRegistry()
  resetCanvasPrefetch()
})

afterEach(() => {
  cleanup()
  HTMLCanvasElement.prototype.getContext = realGetContext
  HTMLElement.prototype.getBoundingClientRect = realRect
  markWebGLRestored()
})

describe('SceneShell without WebGL (jsdom)', () => {
  it('renders the table inside a figure with its caption, and never requests the scene chunk', () => {
    render(shell({ surface: 'graph' }))
    const figure = screen.getByRole('figure')
    expect(within(figure).getByTestId('the-table')).toBeTruthy()
    expect(figure.querySelector('figcaption')?.textContent).toContain('Height and depth carry no meaning')
    expect(figure.getAttribute('data-surface')).toBe('table')
    expect(canUseWebGL()).toBe(false)
    expect(seam.loadCanvasHost).not.toHaveBeenCalled()
    // The title is the figure's accessible name.
    const labelledBy = figure.getAttribute('aria-labelledby')!
    expect(document.getElementById(labelledBy)?.textContent).toBe('Lifecycle')
    expect(figure.querySelector('aside')).toBeNull()
    expect(figure.querySelector('input')).toBeNull()
    expect(figure.querySelector('[aria-current]')).toBeNull()
  })

  it('explains the list when graph was asked for, and stays quiet when table was chosen', () => {
    const { unmount } = render(shell({ surface: 'graph' }))
    expect(screen.getByText('Showing this as a list; hardware graphics are unavailable here.')).toBeTruthy()
    unmount()
    render(shell({ surface: 'table' }))
    expect(screen.queryByText('Showing this as a list; hardware graphics are unavailable here.')).toBeNull()
  })

  it('offers the two surfaces as pressed buttons of equal rank', () => {
    render(shell({ surface: 'table' }))
    const table = screen.getByRole('button', { name: /^Table/ })
    const graph = screen.getByRole('button', { name: /^Graph/ })
    expect(table.getAttribute('aria-pressed')).toBe('true')
    expect(graph.getAttribute('aria-pressed')).toBe('false')
  })
})

describe('SceneShell with WebGL simulated', () => {
  it('mounts the lazy canvas, keeps one live, and evicts the earlier shell to its table', async () => {
    simulateWebGL()
    expect(canUseWebGL()).toBe(true)
    render(<div>{shell({ surface: 'graph', 'data-testid': 'a' })}</div>)
    const a = screen.getByTestId('a')
    expect(await within(a).findByTestId('canvas-stub')).toBeTruthy()
    expect(seam.loadCanvasHost).toHaveBeenCalledTimes(1)
    expect(a.getAttribute('data-surface')).toBe('graph')

    render(<div>{shell({ surface: 'graph', 'data-testid': 'b' })}</div>)
    const b = screen.getByTestId('b')
    expect(await within(b).findByTestId('canvas-stub')).toBeTruthy()
    // A stepped down: its table is back and its stub is gone.
    expect(within(a).queryByTestId('canvas-stub')).toBeNull()
    expect(within(a).getByTestId('the-table')).toBeTruthy()
    expect(a.getAttribute('data-surface')).toBe('table')
    expect(screen.getAllByTestId('canvas-stub')).toHaveLength(1)
  })

  it('keeps the caption OUTSIDE the fixed-height body on both surfaces, with nothing in the figure clipping it', async () => {
    simulateWebGL()
    render(shell({ surface: 'graph', height: 360 }))
    const figure = screen.getByRole('figure')
    expect(await within(figure).findByTestId('canvas-stub')).toBeTruthy()
    const caption = figure.querySelector('figcaption')!
    const fixed = Array.from(figure.querySelectorAll<HTMLElement>('div')).filter((d) => d.style.height !== '')
    expect(fixed).toHaveLength(1)
    expect(fixed[0].style.height).toBe('360px')
    expect(fixed[0].contains(caption)).toBe(false)
    // The caption follows the body as a direct child of the figure, and nothing between it and the
    // figure hides overflow — a clipped second line (observatory v4 critique) cannot come from here.
    expect(caption.parentElement).toBe(figure)
    expect(fixed[0].compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    for (let el: HTMLElement | null = caption; el && el !== figure.parentElement; el = el.parentElement) {
      expect(el.className).not.toMatch(/overflow-hidden|overflow-clip/)
      expect(el.style.overflow).toBe('')
    }
    // Table surface: the same holds with no fixed box at all.
    act(() => markWebGLLost())
    const again = figure.querySelector('figcaption')!
    expect(again.parentElement).toBe(figure)
    expect(Array.from(figure.querySelectorAll<HTMLElement>('div')).filter((d) => d.style.height !== '')).toHaveLength(0)
  })

  it('falls back to the table with a notice when the context is lost', async () => {
    simulateWebGL()
    render(shell({ surface: 'graph' }))
    expect(await screen.findByTestId('canvas-stub')).toBeTruthy()
    act(() => markWebGLLost())
    expect(screen.queryByTestId('canvas-stub')).toBeNull()
    expect(screen.getByTestId('the-table')).toBeTruthy()
    expect(screen.getByText('Showing this as a list; hardware graphics are unavailable here.')).toBeTruthy()
    expect(canUseWebGL()).toBe(false)
  })
})

/** Round 2 (I8): the surface change is a crossfade inside the fixed body; under the stub
 * (`MODE=test`) it lands in one commit and the DOM is never touched; `data-surface` is the intent
 * and flips in the same tick either way; the prefetch is a no-op in test mode. */
describe('SceneShell round 2 (I8)', () => {
  it('prefetch is a no-op in test mode: the seam is never requested', () => {
    expect(prefetchCanvasHost()).toBe(false)
    expect(seam.loadCanvasHost).not.toHaveBeenCalled()
    render(shell({ surface: 'table' }))
    expect(seam.loadCanvasHost).not.toHaveBeenCalled()
  })

  it('toggling Table → Graph → Table flips data-surface in the same tick; the stub swaps the layers in one commit; no inline styles remain', async () => {
    simulateWebGL()
    const { rerender } = render(shell({ surface: 'table', height: 280 }))
    const figure = screen.getByRole('figure')
    expect(figure.getAttribute('data-surface')).toBe('table')
    expect(figure.querySelector('[data-scene-surface="table"]')).not.toBeNull()
    rerender(shell({ surface: 'graph', height: 280 }))
    expect(figure.getAttribute('data-surface')).toBe('graph')
    // Stub crossfade: the table layer is already gone, the canvas layer is here.
    expect(figure.querySelector('[data-scene-surface="table"]')).toBeNull()
    expect(figure.querySelector('[data-scene-surface="graph"]')).not.toBeNull()
    expect(await within(figure).findByTestId('canvas-stub')).toBeTruthy()
    rerender(shell({ surface: 'table', height: 280 }))
    expect(figure.getAttribute('data-surface')).toBe('table')
    expect(within(figure).queryByTestId('canvas-stub')).toBeNull()
    expect(figure.querySelector('[data-scene-surface="graph"]')).toBeNull()
    const table = figure.querySelector<HTMLElement>('[data-scene-surface="table"]')!
    expect(table.style.opacity).toBe('')
    expect(table.className).not.toMatch(/absolute/)
    expect(Array.from(figure.querySelectorAll<HTMLElement>('div')).filter((d) => d.style.height !== '')).toHaveLength(0)
  })

  it('a lost context drops the canvas at once, not after a fade: never two live canvases', async () => {
    simulateWebGL()
    render(shell({ surface: 'graph' }))
    expect(await screen.findByTestId('canvas-stub')).toBeTruthy()
    act(() => markWebGLLost())
    expect(screen.queryByTestId('canvas-stub')).toBeNull()
    expect(screen.getAllByTestId('the-table')).toHaveLength(1)
  })
})
