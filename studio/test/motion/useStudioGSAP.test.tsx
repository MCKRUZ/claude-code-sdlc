// @vitest-environment jsdom
/** `useStudioGSAP`'s dependency default. `@gsap/react` tests `"dependencies" in config`, so a
 * wrapper that forwards the key with `undefined` turns "no dependencies given" into
 * `useLayoutEffect(cb, undefined)`: revert + replay on EVERY render. OpeningOverlay (a 250 ms
 * clock) strobed its fade-in four times a second that way. Omitted dependencies must mean
 * "once per mount", an explicit list must still be honoured, and a cleanup returned from the
 * callback must run on the context's revert — the mechanism SpineScene's first-open draw relies
 * on to redo itself after StrictMode's simulated unmount. */
import { StrictMode, useRef, useState } from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureMotionForTests } from '../../src/motion/motion'
import { useStudioGSAP, type StudioGSAPOptions } from '../../src/motion/useStudioGSAP'

const runs = { callback: 0, cleanup: 0 }
let bump: () => void = () => {}

function Probe({ options }: { options?: Partial<StudioGSAPOptions> }) {
  const ref = useRef<HTMLDivElement>(null)
  const [tick, setTick] = useState(0)
  bump = () => setTick((t) => t + 1)
  useStudioGSAP(() => {
    runs.callback += 1
    return () => { runs.cleanup += 1 }
  }, { scope: ref, ...options })
  return <div ref={ref} data-tick={tick} />
}

beforeEach(() => {
  runs.callback = 0
  runs.cleanup = 0
  configureMotionForTests(null)
})

afterEach(() => {
  configureMotionForTests(null)
})

describe('useStudioGSAP dependencies', () => {
  it('omitted dependencies mean once per mount: two re-renders, one run', () => {
    render(<Probe />)
    expect(runs.callback).toBe(1)
    act(() => bump())
    act(() => bump())
    expect(runs.callback).toBe(1)
    expect(runs.cleanup).toBe(0)
  })

  it('an explicit `[]` behaves the same', () => {
    render(<Probe options={{ dependencies: [] }} />)
    act(() => bump())
    expect(runs.callback).toBe(1)
  })

  it('an explicit dependency list is honoured: re-runs when it changes, not otherwise', () => {
    const { rerender } = render(<Probe options={{ dependencies: ['a'] }} />)
    expect(runs.callback).toBe(1)
    act(() => bump())
    expect(runs.callback).toBe(1)
    rerender(<Probe options={{ dependencies: ['b'] }} />)
    expect(runs.callback).toBe(2)
  })

  it('a cleanup returned from the callback runs on revert, and the callback runs again after StrictMode\'s simulated unmount', () => {
    render(<StrictMode><Probe options={{ dependencies: [3] }} /></StrictMode>)
    // Mount → revert (cleanup) → mount again: the second run is what redraws the Spine rail.
    expect(runs.cleanup).toBe(1)
    expect(runs.callback).toBe(2)
  })

  it('the cleanup runs on a real unmount too', () => {
    const { unmount } = render(<Probe />)
    unmount()
    expect(runs.cleanup).toBe(1)
  })
})
