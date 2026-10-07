// @vitest-environment jsdom
/** SceneShell's hook order when the host scrolls off screen.
 *
 * Found in the real window (Wave 3 e2e run, 2026-10-05): `useOnScreen(ref) && usePageVisible()`
 * short-circuited the second hook whenever the figure left the viewport, React threw #311 and the
 * whole window unmounted — every later e2e saw "no main". jsdom never caught it because
 * setupTests installs an IntersectionObserver that never fires, so "on screen" never changed.
 * This test installs one that DOES fire, flips it both ways, and expects the figure to survive.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneShell } from '../../src/scenes/core/SceneShell'

vi.mock('../../src/scenes/core/lazyCanvas', () => ({ loadCanvasHost: vi.fn(() => new Promise(() => {})) }))

type Callback = (entries: Array<{ isIntersecting: boolean }>) => void
const callbacks: Callback[] = []

class FiringIntersectionObserver {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds: readonly number[] = []
  constructor(cb: Callback) { callbacks.push(cb) }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}

const realIO = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver

beforeEach(() => {
  callbacks.length = 0
  ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FiringIntersectionObserver
  ;(window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FiringIntersectionObserver
})

afterEach(() => {
  cleanup()
  ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = realIO
  ;(window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = realIO
})

describe('SceneShell keeps its hook order when the host leaves and re-enters the viewport', () => {
  it('survives off-screen → on-screen → off-screen without a hook-order error', () => {
    const errors: unknown[] = []
    const onError = (e: ErrorEvent) => { errors.push(e.error ?? e.message); e.preventDefault() }
    window.addEventListener('error', onError)
    try {
      render(
        <SceneShell
          id="spine"
          title="Lifecycle"
          summary="summary"
          legend="legend"
          surface="table"
          onSurfaceChange={() => {}}
          table={<table data-testid="the-table"><tbody><tr><td>row</td></tr></tbody></table>}
        />,
      )
      expect(callbacks.length).toBeGreaterThan(0)
      for (const intersecting of [false, true, false]) {
        act(() => { for (const cb of callbacks) cb([{ isIntersecting: intersecting }]) })
        // The table — the DOM view of equal rank — is still there after every flip.
        expect(screen.getByTestId('the-table')).toBeTruthy()
        expect(screen.getByRole('figure', { name: 'Lifecycle' })).toBeTruthy()
      }
      expect(errors).toEqual([])
    } finally {
      window.removeEventListener('error', onError)
    }
  })
})
