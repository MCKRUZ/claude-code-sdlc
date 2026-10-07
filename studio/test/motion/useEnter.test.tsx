// @vitest-environment jsdom
// Two facts the shell depends on: the screen root itself is what animates (no wrapper, so
// `main.firstElementChild` is still the screen), and once the enter is over the root carries no
// `transform` — a leftover one would make it a containing block for fixed overlays.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useRef } from 'react'
import { gsap } from 'gsap'
import { useEnter } from '../../src/motion/useEnter'
import { ENTER_PRESETS, enterPreset } from '../../src/motion/presets'
import { configureMotionForTests, setPreference } from '../../src/motion/motion'
import type { EnterPreset } from '../../src/motion/contract'

function Screen({ preset, k }: { preset?: EnterPreset; k?: string }) {
  const ref = useRef<HTMLElement>(null)
  useEnter(ref, preset, { key: k })
  return (
    <section ref={ref} data-testid="screen">
      <h2>Requirements</h2>
    </section>
  )
}

beforeEach(() => {
  configureMotionForTests(null)
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  gsap.globalTimeline.clear()
  configureMotionForTests(null)
  localStorage.clear()
})

describe('useEnter', () => {
  it('renders the screen root as the first child — no wrapper element', () => {
    const { container, getByTestId } = render(<Screen />)
    expect(container.firstElementChild).toBe(getByTestId('screen'))
  })

  it('in MODE=test the stub applies the end state and the root keeps no transform', () => {
    const { getByTestId } = render(<Screen />)
    const root = getByTestId('screen')
    expect(root.style.transform).toBe('')
    expect(root.style.opacity === '' || root.style.opacity === '1').toBe(true)
  })

  it('with motion on, tweens the ref target itself and ends with clearProps: "transform"', () => {
    configureMotionForTests({ isTestMode: () => false })
    setPreference('on')
    const fromTo = vi.spyOn(gsap, 'fromTo')
    const { getByTestId } = render(<Screen preset="rise" />)
    expect(fromTo).toHaveBeenCalledTimes(1)
    const [target, from, to] = fromTo.mock.calls[0] as unknown as [Element, gsap.TweenVars, gsap.TweenVars]
    expect(target).toBe(getByTestId('screen'))
    expect(from).toEqual({ y: 6, opacity: 0 })
    expect(to).toMatchObject({ y: 0, opacity: 1, clearProps: 'transform' })
  })

  it('re-runs when the key changes, not on an unrelated re-render', () => {
    configureMotionForTests({ isTestMode: () => false })
    setPreference('on')
    const fromTo = vi.spyOn(gsap, 'fromTo')
    const { rerender } = render(<Screen k="a" />)
    rerender(<Screen k="a" />)
    expect(fromTo).toHaveBeenCalledTimes(1)
    rerender(<Screen k="b" />)
    expect(fromTo).toHaveBeenCalledTimes(2)
  })
})

describe('enter presets', () => {
  it('every transform preset ends with clearProps: "transform"', () => {
    for (const [name, pair] of Object.entries(ENTER_PRESETS)) {
      const moves = 'y' in pair.from || 'x' in pair.from
      if (moves) expect(pair.to.clearProps, name).toBe('transform')
    }
  })

  it('under reduced motion drops the transform and caps the fade at 120 ms', () => {
    const pair = enterPreset('rise', true)
    expect(pair.from).toEqual({ opacity: 0 })
    expect(pair.to.duration).toBe(0.12)
    expect('y' in pair.to).toBe(false)
  })
})
