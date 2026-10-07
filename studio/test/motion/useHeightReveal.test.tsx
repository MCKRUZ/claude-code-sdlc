// @vitest-environment jsdom
/** M11: the Build sub-list reveals its height; under the stub (test mode) the end state is the
 * cold-reload markup — no inline height, no inline opacity — and with the engine on the from
 * state is applied at mount (height 0, clipped) so the first frame is the closed box. */
import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { gsap } from 'gsap'
import { configureMotionForTests } from '../../src/motion/motion'
import { HEIGHT_REVEAL_S, useHeightReveal } from '../../src/motion/useHeightReveal'
import { MOTION_DURATIONS } from '../../src/motion/contract'

function List({ open }: { open: boolean }) {
  const ref = useRef<HTMLUListElement>(null)
  useHeightReveal(ref, open)
  return open ? <ul ref={ref} data-testid="list"><li>Board</li><li>Sprint</li></ul> : null
}

afterEach(() => {
  configureMotionForTests(null)
  gsap.globalTimeline.clear()
})

describe('useHeightReveal', () => {
  it('runs on dur-2', () => {
    expect(HEIGHT_REVEAL_S).toBe(MOTION_DURATIONS['dur-2'])
  })

  it('under the stub the list carries no inline height or opacity — the markup a cold reload shows', () => {
    const { rerender, getByTestId } = render(<List open={false} />)
    rerender(<List open />)
    const ul = getByTestId('list')
    expect(ul.style.height).toBe('')
    expect(ul.style.opacity).toBe('')
    expect(ul.style.overflow).toBe('')
    expect(ul.querySelectorAll('li')).toHaveLength(2)
  })

  it('with the engine on the from-state is applied at mount, and the tween ends on auto with its inline props cleared', () => {
    configureMotionForTests({ isTestMode: () => false })
    const { rerender, getByTestId } = render(<List open={false} />)
    rerender(<List open />)
    const ul = getByTestId('list')
    expect(ul.style.overflow).toBe('hidden')
    expect(ul.style.opacity).toBe('0')
    act(() => {
      for (const t of gsap.globalTimeline.getChildren(true, true, false)) t.progress(1)
    })
    expect(ul.style.height).toBe('')
    expect(ul.style.opacity).toBe('')
    expect(ul.style.overflow).toBe('')
  })
})
