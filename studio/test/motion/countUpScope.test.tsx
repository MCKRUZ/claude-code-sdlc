// @vitest-environment jsdom
/** A counter never tweens from another project's number (studio-observatory.md §4 #11, §5.4:
 * a tween runs only between two REAL values of the SAME fact). Two guards, each proven alone:
 * `useCountUp` scopes its memory id by the project key App provides, and App clears the memory
 * when a different project opens. Proven, as useCountUp.test does, by watching what the hook
 * asks GSAP to do: a spy on `gsap.to` sees every tween that starts. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { gsap } from 'gsap'
import { useCountUp } from '../../src/motion/useCountUp'
import { ProjectKeyProvider, scopedCounterId } from '../../src/motion/projectKey'
import { valueMemory } from '../../src/motion/valueMemory'
import { configureMotionForTests, setPreference } from '../../src/motion/motion'

function Tile({ id, value }: { id: string; value: number | null }) {
  const { ref, text, transition } = useCountUp(id, value)
  return (
    <span ref={ref} data-testid="tile" data-transition={transition}>
      {text}
    </span>
  )
}

/** The same counter (same id) as a project's Closing totals would mount it. */
function inProject(projectPath: string, value: number) {
  return (
    <ProjectKeyProvider value={projectPath}>
      <Tile id="closing.totals.specs" value={value} />
    </ProjectKeyProvider>
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

describe('useCountUp across projects', () => {
  it('opening a different project renders its first value as text — no tween from the last project\'s number', () => {
    motionOn()
    const to = vi.spyOn(gsap, 'to')
    // Project A's Closing screen showed 12 specs, then the person opened project B (5 specs).
    const a = render(inProject('/projects/a', 12))
    expect(a.getByTestId('tile').textContent).toBe('12')
    a.unmount()
    const b = render(inProject('/projects/b', 5))
    expect(b.getByTestId('tile').textContent).toBe('5')
    expect(b.getByTestId('tile').dataset.transition).toBe('first')
    expect(to).not.toHaveBeenCalled()
  })

  it('within one project a remount still continues from the number it last showed', () => {
    motionOn()
    const to = vi.spyOn(gsap, 'to')
    render(inProject('/projects/a', 12)).unmount()
    const again = render(inProject('/projects/a', 15))
    expect(again.getByTestId('tile').dataset.transition).toBe('tween')
    expect(to).toHaveBeenCalledTimes(1)
    expect((to.mock.calls[0][0] as { v: number }).v).toBe(12)
  })

  it('the memory is keyed by project: the same counter id under two projects is two entries', () => {
    render(inProject('/projects/a', 12)).unmount()
    render(inProject('/projects/b', 5)).unmount()
    expect(valueMemory.recall(scopedCounterId('/projects/a', 'closing.totals.specs'))).toBe(12)
    expect(valueMemory.recall(scopedCounterId('/projects/b', 'closing.totals.specs'))).toBe(5)
    expect(valueMemory.recall('closing.totals.specs')).toBeUndefined()
  })

  it('clearing the memory on open (what App does) is enough on its own: no tween even under one key', () => {
    motionOn()
    const to = vi.spyOn(gsap, 'to')
    render(inProject('/projects/a', 12)).unmount()
    valueMemory.clear()
    const reopened = render(inProject('/projects/a', 5))
    expect(reopened.getByTestId('tile').textContent).toBe('5')
    expect(reopened.getByTestId('tile').dataset.transition).toBe('first')
    expect(to).not.toHaveBeenCalled()
  })

  it('outside a project the id is unscoped, so the existing counter tests keep their meaning', () => {
    render(<Tile id="bare" value={3} />).unmount()
    expect(valueMemory.recall('bare')).toBe(3)
    expect(scopedCounterId('', 'bare')).toBe('bare')
  })
})
