// Runs for every test file (main-process tests included — importing this costs them nothing,
// since cleanup() is a no-op when nothing was rendered). Without it, a jsdom component test
// that renders more than once in the same file leaves every earlier render's DOM in place, and
// a query like getByRole that expects exactly one match starts seeing duplicates from a
// PRIOR test's leftover markup.
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Tests that run the real plugin scripts (sprintEndToEnd, draftEndToEnd, …) spawn Python
// directly; on the Windows runner a piped stdout is cp1252 and the plugin's '→' crashes it.
// The app itself sets these on every spawn (commandRunner.ts); the tests inherit them here.
process.env.PYTHONUTF8 ??= '1'
process.env.PYTHONIOENCODING ??= 'utf-8'

afterEach(() => {
  cleanup()
})

// jsdom does not implement Element.scrollTo (it is a real limitation, not a bug in the
// component under test — ChatPanel.tsx's autoscroll-to-latest-message effect calls it on
// every render). A no-op stub is enough for a component test, which cares about what rendered,
// not about actual scroll physics jsdom never had to begin with.
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {}
}

// jsdom has no matchMedia and no ResizeObserver (both are real gaps in jsdom, not in the
// components). The motion layer asks matchMedia about prefers-reduced-motion and the scene
// layer measures its canvas with ResizeObserver; in a component test both get an inert answer —
// "no preference" and "never resizes" — so the component renders the same DOM it renders for a
// person, and the test asserts on that DOM, not on motion or WebGL (neither exists in jsdom).
if (typeof window !== 'undefined') {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })
  }
  if (typeof (window as { ResizeObserver?: unknown }).ResizeObserver !== 'function') {
    class InertResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = InertResizeObserver
    ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = InertResizeObserver
  }
}

// studio-observatory.md §8.1 — the Wave 0 additions. Each is guarded so a future jsdom that grows
// the real thing wins over the stub, and so a node-env test (no `window`, no `document`) skips
// the lot.
if (typeof window !== 'undefined') {
  // The scene layer defers mounting a Canvas until its host scrolls into view; "never visible"
  // is the right inert answer, since jsdom has no layout to be visible in.
  if (typeof (window as { IntersectionObserver?: unknown }).IntersectionObserver !== 'function') {
    class InertIntersectionObserver {
      readonly root = null
      readonly rootMargin = ''
      readonly thresholds: readonly number[] = []
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords(): IntersectionObserverEntry[] { return [] }
    }
    ;(window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = InertIntersectionObserver
    ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = InertIntersectionObserver
  }

  // jsdom's getContext already returns null for WebGL — but it also logs "not implemented" to
  // the console for every call. Answering null explicitly for the two WebGL ids keeps
  // `canUseWebGL()` deterministically false AND keeps the test output quiet; every other context
  // id still goes to the original, so a test that installs a canvas package keeps working.
  if (typeof HTMLCanvasElement !== 'undefined') {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function getContext(
      this: HTMLCanvasElement, contextId: string, ...rest: unknown[]
    ) {
      if (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl') return null
      return (original as (this: HTMLCanvasElement, id: string, ...args: unknown[]) => unknown).call(this, contextId, ...rest)
    } as typeof HTMLCanvasElement.prototype.getContext
  }

  // `document.fonts.ready` gates the SplitText title choreography (no splitting before the web
  // font has arrived, or the measured line breaks are wrong). jsdom has no font loading at all,
  // so "already ready" lets a component that awaits it proceed instead of hanging.
  if (typeof document !== 'undefined' && (document as { fonts?: unknown }).fonts === undefined) {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve(), check: () => true, addEventListener() {}, removeEventListener() {} },
    })
  }
}

// Theme, density, motion and the palette's recents all persist to localStorage. jsdom's store
// lives for the whole worker, so a preference one test set would otherwise be the next test's
// starting state.
afterEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear()
})
