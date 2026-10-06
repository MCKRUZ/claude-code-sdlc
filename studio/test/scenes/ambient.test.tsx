// @vitest-environment jsdom
/** The Ambient field as a test build, a reduced-motion person and a GPU-less window meet it:
 * nothing. In MODE=test `AMBIENT_ENABLED` is false and the component returns null without asking
 * for any chunk. With the test gate lifted (through the module seam, not the environment), the
 * motion and WebGL gates each keep it closed on their own; only when all three open does the
 * aria-hidden, pointer-events:none host appear — and even then the canvas seam is a stub, so no
 * `<Canvas>` is ever mounted in jsdom. The numbers (slab, fade, parallax) are checked as pure
 * functions. */

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetCanvasRegistry } from '../../src/scenes/core/canvasRegistry'
import { configureMotionForTests } from '../../src/motion/motion'
import type { SceneSlotProps } from '../../src/scenes/core/types'
import {
  FADE_SECONDS,
  FIELD_COUNT,
  PARALLAX_MAX,
  SLAB,
  fadeProgress,
  normalisePointer,
  parallaxOffset,
  slabPositions,
} from '../../src/scenes/ambient/fieldModel'

const seam = vi.hoisted(() => {
  const StubCanvas = () => <div data-testid="canvas-stub" />
  return { loadCanvasHost: vi.fn(() => Promise.resolve({ default: StubCanvas })) }
})
vi.mock('../../src/scenes/core/lazyCanvas', () => ({ loadCanvasHost: seam.loadCanvasHost }))

const slotProps: SceneSlotProps<'ambient'> = {
  id: 'ambient',
  data: null,
  hoverId: null,
  onHover: () => {},
  onActivate: () => {},
  live: true,
}

const realGetContext = HTMLCanvasElement.prototype.getContext

type Gate = { ambient: boolean }

/** Load `AmbientField` fresh with `AMBIENT_ENABLED` forced; the lazyCanvas mock above persists
 * across `resetModules`, so a stub (never a Canvas) is what the open gate would mount. The
 * motion and webgl modules come back fresh too, so a test configures THESE instances — the
 * ones the component actually reads — not the file-level import. */
async function loadField(gate: Gate, motionTestMode = true) {
  vi.resetModules()
  vi.doMock('../../src/scenes/core/sceneDefaults', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/scenes/core/sceneDefaults')>()
    return { ...actual, AMBIENT_ENABLED: gate.ambient }
  })
  const webgl = await import('../../src/scenes/core/webgl')
  const motion = await import('../../src/motion/motion')
  motion.configureMotionForTests(motionTestMode ? null : { isTestMode: () => false })
  const mod = await import('../../src/scenes/ambient/AmbientField')
  return { AmbientField: mod.default, webgl, motion }
}

beforeEach(() => {
  seam.loadCanvasHost.mockClear()
  resetCanvasRegistry()
  localStorage.removeItem('studio.motion')
  configureMotionForTests(null)
})

afterEach(() => {
  cleanup()
  vi.doUnmock('../../src/scenes/core/sceneDefaults')
  HTMLCanvasElement.prototype.getContext = realGetContext
  localStorage.removeItem('studio.motion')
  configureMotionForTests(null)
})

describe('AmbientField in MODE=test', () => {
  it('renders nothing and requests no chunk: the CSS gradient is the whole field', async () => {
    const { AmbientField, motion } = await loadField({ ambient: false })
    expect(motion.enabled()).toBe(false)
    const { container } = render(<AmbientField {...slotProps} />)
    expect(container.innerHTML).toBe('')
    expect(container.querySelector('[data-ambient-field]')).toBeNull()
    expect(seam.loadCanvasHost).not.toHaveBeenCalled()
  })
})

describe('AmbientField gates (AMBIENT_ENABLED forced on through the seam)', () => {
  it('stays null when WebGL is absent (jsdom), even with motion on', async () => {
    const { AmbientField, webgl, motion } = await loadField({ ambient: true }, false)
    expect(motion.enabled()).toBe(true)
    expect(webgl.canUseWebGL()).toBe(false)
    const { container } = render(<AmbientField {...slotProps} />)
    expect(container.innerHTML).toBe('')
    expect(seam.loadCanvasHost).not.toHaveBeenCalled()
  })

  it('stays null when motion is off, even with WebGL simulated', async () => {
    HTMLCanvasElement.prototype.getContext = (() => ({})) as unknown as typeof realGetContext
    const { AmbientField, webgl, motion } = await loadField({ ambient: true }, false)
    motion.setPreference('off')
    expect(webgl.canUseWebGL()).toBe(true)
    expect(motion.enabled()).toBe(false)
    const { container } = render(<AmbientField {...slotProps} />)
    expect(container.innerHTML).toBe('')
    expect(seam.loadCanvasHost).not.toHaveBeenCalled()
  })

  it('opens only when all three gates agree: an aria-hidden, inert host behind its parent', async () => {
    HTMLCanvasElement.prototype.getContext = (() => ({})) as unknown as typeof realGetContext
    const { AmbientField, motion } = await loadField({ ambient: true }, false)
    expect(motion.enabled()).toBe(true)
    const { container, unmount } = render(<AmbientField {...slotProps} />)
    const host = container.querySelector<HTMLElement>('[data-ambient-field]')
    expect(host).not.toBeNull()
    expect(host!.getAttribute('aria-hidden')).toBe('true')
    expect(host!.style.pointerEvents).toBe('none')
    expect(host!.style.position).toBe('absolute')
    expect(host!.style.zIndex).toBe('0')
    // No buttons, no text, no live region: it carries nothing for AT or a pointer.
    expect(host!.querySelector('button, [role], input')).toBeNull()
    expect(host!.textContent).toBe('')
    expect(seam.loadCanvasHost).toHaveBeenCalledTimes(1)
    unmount()
    expect(container.querySelector('[data-ambient-field]')).toBeNull()
  })
})

describe('fieldModel', () => {
  it('fills exactly the 16 x 9 x 4 slab with 1 200 points, deterministically', () => {
    const a = slabPositions()
    const b = slabPositions()
    expect(a.length).toBe(FIELD_COUNT * 3)
    expect(Array.from(a)).toEqual(Array.from(b))
    const [w, h, d] = SLAB
    for (let i = 0; i < a.length; i += 3) {
      expect(Math.abs(a[i]!)).toBeLessThanOrEqual(w / 2)
      expect(Math.abs(a[i + 1]!)).toBeLessThanOrEqual(h / 2)
      expect(Math.abs(a[i + 2]!)).toBeLessThanOrEqual(d / 2)
    }
    // Spread through the slab, not bunched: every octant has some points.
    const octants = new Set<number>()
    for (let i = 0; i < a.length; i += 3) {
      octants.add((a[i]! > 0 ? 1 : 0) | (a[i + 1]! > 0 ? 2 : 0) | (a[i + 2]! > 0 ? 4 : 0))
    }
    expect(octants.size).toBe(8)
  })

  it('fades 0 to 1 over 900 ms, never starting lit and never overshooting', () => {
    expect(fadeProgress(-1)).toBe(0)
    expect(fadeProgress(0)).toBe(0)
    expect(fadeProgress(FADE_SECONDS / 2)).toBeCloseTo(0.5, 5)
    expect(fadeProgress(FADE_SECONDS)).toBe(1)
    expect(fadeProgress(60)).toBe(1)
    expect(FADE_SECONDS).toBe(0.9)
  })

  it('clamps parallax to 2 % of the slab half-extent and treats a lost pointer as centred', () => {
    expect(PARALLAX_MAX).toBe(0.02)
    const max = parallaxOffset(1, 1)
    expect(max.x).toBeCloseTo(PARALLAX_MAX * (SLAB[0] / 2))
    expect(max.y).toBeCloseTo(PARALLAX_MAX * (SLAB[1] / 2))
    const over = parallaxOffset(40, -40)
    expect(over.x).toBeCloseTo(max.x)
    expect(over.y).toBeCloseTo(-max.y)
    expect(parallaxOffset(Number.NaN, Number.NaN)).toEqual({ x: 0, y: 0 })
    expect(normalisePointer(400, 300, 800, 600)).toEqual({ nx: 0, ny: 0 })
    expect(normalisePointer(800, 0, 800, 600)).toEqual({ nx: 1, ny: -1 })
    expect(normalisePointer(10, 10, 0, 0)).toEqual({ nx: 0, ny: 0 })
  })
})

describe('AmbientHost keeps its hook order when the host leaves and re-enters the viewport', () => {
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

  it('survives off-screen → on-screen → off-screen without a hook-order error', async () => {
    callbacks.length = 0
    ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FiringIntersectionObserver
    ;(window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FiringIntersectionObserver
    HTMLCanvasElement.prototype.getContext = (() => ({})) as unknown as typeof realGetContext
    const errors: unknown[] = []
    const onError = (e: ErrorEvent) => { errors.push(e.error ?? e.message); e.preventDefault() }
    window.addEventListener('error', onError)
    try {
      const { AmbientField } = await loadField({ ambient: true }, false)
      const { container } = render(<AmbientField {...slotProps} />)
      expect(container.querySelector('[data-ambient-field]')).not.toBeNull()
      expect(callbacks.length).toBeGreaterThan(0)
      // `useOnScreen(ref) && usePageVisible()` skipped the second hook on the first `false` here.
      for (const intersecting of [false, true, false]) {
        act(() => { for (const cb of callbacks) cb([{ isIntersecting: intersecting }]) })
        expect(container.querySelector('[data-ambient-field]')).not.toBeNull()
      }
      expect(errors).toEqual([])
    } finally {
      window.removeEventListener('error', onError)
      ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = realIO
      ;(window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = realIO
    }
  })
})
