// @vitest-environment jsdom
// The counter rules, proven by watching what the hook asks GSAP to do rather than by running
// the ticker: a spy on `gsap.to` sees the tween's start value and target, which is exactly the
// fact the rules are about. Every started tween is cleared after each test.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { gsap } from 'gsap'
import { useCountUp, NO_DATA_TEXT } from '../../src/motion/useCountUp'
import { valueMemory, classifyTransition } from '../../src/motion/valueMemory'
import { configureMotionForTests, setPreference } from '../../src/motion/motion'

function Tile({ id, value }: { id: string; value: number | null }) {
  const { ref, text, transition } = useCountUp(id, value)
  return (
    <span ref={ref} data-testid="tile" data-transition={transition}>
      {text}
    </span>
  )
}

function motionOn() {
  configureMotionForTests({ isTestMode: () => false })
  setPreference('on')
}

beforeEach(() => {
  valueMemory.clear()
  configureMotionForTests(null)
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  gsap.globalTimeline.clear()
  configureMotionForTests(null)
  localStorage.clear()
})

describe('useCountUp', () => {
  it('first mount renders the value as text, no tween', () => {
    motionOn()
    const to = vi.spyOn(gsap, 'to')
    const { getByTestId } = render(<Tile id="a" value={42} />)
    expect(getByTestId('tile').textContent).toBe('42')
    expect(getByTestId('tile').dataset.transition).toBe('first')
    expect(to).not.toHaveBeenCalled()
  })

  it('null renders the words "no data" — never a 0 — with no tween', () => {
    motionOn()
    const to = vi.spyOn(gsap, 'to')
    const { getByTestId } = render(<Tile id="b" value={null} />)
    expect(getByTestId('tile').textContent).toBe(NO_DATA_TEXT)
    expect(to).not.toHaveBeenCalled()
  })

  it('number → number tweens from the previous REAL value when motion is on', () => {
    motionOn()
    const to = vi.spyOn(gsap, 'to')
    const { rerender, getByTestId } = render(<Tile id="c" value={10} />)
    rerender(<Tile id="c" value={25} />)
    expect(getByTestId('tile').dataset.transition).toBe('tween')
    expect(to).toHaveBeenCalledTimes(1)
    const [target, vars] = to.mock.calls[0] as [{ v: number }, gsap.TweenVars]
    expect(target.v).toBe(10)
    expect(vars.v).toBe(25)
    expect(vars.snap).toEqual({ v: 1 })
  })

  it('never counts up from 0: 0 → n is a text swap', () => {
    motionOn()
    const to = vi.spyOn(gsap, 'to')
    const { rerender, getByTestId } = render(<Tile id="d" value={0} />)
    rerender(<Tile id="d" value={9} />)
    expect(getByTestId('tile').textContent).toBe('9')
    expect(getByTestId('tile').dataset.transition).toBe('swap')
    expect(to).not.toHaveBeenCalled()
  })

  it('null ↔ number is a text crossfade, not a count', () => {
    motionOn()
    const to = vi.spyOn(gsap, 'to')
    const timeline = vi.spyOn(gsap, 'timeline')
    const { rerender, getByTestId } = render(<Tile id="e" value={null} />)
    rerender(<Tile id="e" value={7} />)
    expect(getByTestId('tile').dataset.transition).toBe('crossfade')
    expect(timeline).toHaveBeenCalledTimes(1)
    // No counter object was tweened — only the element's opacity through the timeline.
    expect(to.mock.calls.some(([target]) => typeof target === 'object' && target !== null && 'v' in (target as object))).toBe(false)
  })

  it('in MODE=test nothing tweens; the final text is simply rendered', () => {
    const to = vi.spyOn(gsap, 'to')
    const { rerender, getByTestId } = render(<Tile id="f" value={3} />)
    rerender(<Tile id="f" value={8} />)
    expect(getByTestId('tile').textContent).toBe('8')
    expect(to).not.toHaveBeenCalled()
  })

  it('remembers across unmount: a remount tweens from what was last shown', () => {
    motionOn()
    const to = vi.spyOn(gsap, 'to')
    const first = render(<Tile id="g" value={20} />)
    first.unmount()
    render(<Tile id="g" value={30} />)
    expect(to).toHaveBeenCalledTimes(1)
    expect((to.mock.calls[0][0] as { v: number }).v).toBe(20)
  })
})

describe('classifyTransition — the rules on their own', () => {
  it.each([
    [undefined, 5, 'first'],
    [5, 5, 'none'],
    [null, 5, 'crossfade'],
    [5, null, 'crossfade'],
    [0, 5, 'swap'],
    [5, 0, 'tween'],
    [Number.NaN, 5, 'swap'],
    [3, 9, 'tween'],
  ] as const)('%s → %s is %s', (prev, next, kind) => {
    expect(classifyTransition(prev, next)).toBe(kind)
  })
})
