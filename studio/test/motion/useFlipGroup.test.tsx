// @vitest-environment jsdom
// Flip itself needs layout jsdom does not have, so `gsap/Flip` is mocked and the test asserts the
// call shape: what was captured, when `from` ran, and with which of the §4.1 options.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useRef } from 'react'
import { useFlipGroup, FLIP_TARGET_CAP } from '../../src/motion/useFlipGroup'
import { configureMotionForTests, setPreference } from '../../src/motion/motion'
import { flipStore } from '../../src/motion/flipStore'

const getState = vi.fn(() => ({ fake: 'state' }))
const from = vi.fn(() => ({ fake: 'timeline' }))
vi.mock('gsap/Flip', () => ({ Flip: { getState: (...a: unknown[]) => getState(...(a as [])), from: (...a: unknown[]) => from(...(a as [])) } }))

let api: ReturnType<typeof useFlipGroup> | null = null

function List({ ids }: { ids: string[] }) {
  const ref = useRef<HTMLUListElement>(null)
  api = useFlipGroup(ref)
  return (
    <ul ref={ref}>
      {ids.map((id) => (
        <li key={id} data-flip-id={id}>{id}</li>
      ))}
    </ul>
  )
}

function motionOn() {
  configureMotionForTests({ isTestMode: () => false })
  setPreference('on')
}

beforeEach(() => {
  api = null
  getState.mockClear()
  from.mockClear()
  configureMotionForTests(null)
  localStorage.clear()
})

afterEach(() => {
  configureMotionForTests(null)
  localStorage.clear()
})

describe('useFlipGroup', () => {
  it('is a no-op when motion is disabled (MODE=test): nothing captured, nothing played', () => {
    const { rerender } = render(<List ids={['a', 'b']} />)
    api!.capture()
    expect(api!.pending).toBe(false)
    rerender(<List ids={['b', 'a']} />)
    expect(getState).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })

  it('captures before the change and plays after the next commit with the §4.1 options', () => {
    motionOn()
    const { rerender } = render(<List ids={['a', 'b', 'c']} />)
    api!.capture()
    expect(getState).toHaveBeenCalledTimes(1)
    expect((getState.mock.calls[0] as unknown as [NodeList])[0].length).toBe(3)
    expect(api!.pending).toBe(true)
    rerender(<List ids={['c', 'a', 'b']} />)
    expect(from).toHaveBeenCalledTimes(1)
    const [state, vars] = from.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(state).toEqual({ fake: 'state' })
    expect(vars).toMatchObject({ absolute: true, nested: true, scale: false })
    expect((vars.targets as NodeList).length).toBe(3)
    expect(api!.pending).toBe(false)
  })

  it('a commit with nothing captured plays nothing', () => {
    motionOn()
    const { rerender } = render(<List ids={['a']} />)
    rerender(<List ids={['a', 'b']} />)
    expect(from).not.toHaveBeenCalled()
  })

  it(`caps at ${FLIP_TARGET_CAP} targets: one more and it does nothing`, () => {
    motionOn()
    const many = Array.from({ length: FLIP_TARGET_CAP + 1 }, (_, i) => `r${i}`)
    render(<List ids={many} />)
    api!.capture()
    expect(getState).not.toHaveBeenCalled()
    expect(api!.pending).toBe(false)
  })

  it(`exactly ${FLIP_TARGET_CAP} is still allowed`, () => {
    motionOn()
    const many = Array.from({ length: FLIP_TARGET_CAP }, (_, i) => `r${i}`)
    render(<List ids={many} />)
    api!.capture()
    expect(getState).toHaveBeenCalledTimes(1)
  })
})

describe('flipStore — a stash is taken exactly once and expires', () => {
  afterEach(() => flipStore.clear())

  it('stash / take round-trips with the opener and then is gone', () => {
    const opener = document.createElement('button')
    const state = { fake: 'state' } as never
    flipStore.stash('spec:0008', state, opener, 1000)
    expect(flipStore.has('spec:0008')).toBe(true)
    const taken = flipStore.take('spec:0008', 1500)
    expect(taken?.state).toBe(state)
    expect(taken?.opener).toBe(opener)
    expect(flipStore.take('spec:0008', 1500)).toBeUndefined()
  })

  it('an entry older than the ttl is dropped, not animated from', () => {
    flipStore.stash('now', { fake: 'state' } as never, null, 0)
    expect(flipStore.take('now', 60_000)).toBeUndefined()
  })
})
