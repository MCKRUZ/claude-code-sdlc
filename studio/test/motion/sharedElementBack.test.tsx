// @vitest-environment jsdom
/** M4 — the way back (studio-upgrade-2 §4 P3): Back stashes the title under `spec:back`, the list
 * screen Flips the row from there with the shared settings, siblings fade, and focus returns to
 * the row whatever the motion setting. A stash older than the TTL never replays. Flip itself
 * needs layout jsdom has not got, so `gsap/Flip` is mocked and the call shape is asserted. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MOTION_DURATIONS, MOTION_EASES } from '../../src/motion/contract'
import { STASH_TTL_MS, flipStore } from '../../src/motion/flipStore'

const getState = vi.fn(() => ({ fake: 'state' }))
const from = vi.fn(() => ({ fake: 'flip', kill: () => {}, duration: () => 0.36 }))
vi.mock('gsap/Flip', () => ({ Flip: { getState: (...a: unknown[]) => getState(...(a as [])), from: (...a: unknown[]) => from(...(a as [])) } }))

const fromTo = vi.fn(() => ({ fake: 'tween' }))
const add = vi.fn()
vi.mock('gsap', () => ({
  gsap: {
    fromTo: (...a: unknown[]) => fromTo(...(a as [])),
    timeline: () => ({ add: (...a: unknown[]) => { add(...(a as [])); return undefined }, fromTo: () => undefined, labels: {}, kill() {}, play() {}, pause() {}, progress() { return 1 }, then: () => Promise.resolve() }),
  },
}))

const { sharedElementBack, stashBack, pendingBack, clearBack, BACK_ID } = await import('../../src/motion/choreo/sharedElement')

function List() {
  return (
    <ul>
      <li><button type="button" data-flip-id="spec:0007">0007</button></li>
      <li><button type="button" data-flip-id="spec:0008">0008</button></li>
      <li><button type="button" data-flip-id="spec:0009">0009</button></li>
    </ul>
  )
}

const ctx = (enabled: boolean, reduced = false) => ({
  scope: document.body, enabled, reduced, durations: MOTION_DURATIONS, eases: MOTION_EASES,
})

beforeEach(() => {
  getState.mockClear(); from.mockClear(); fromTo.mockClear(); add.mockClear()
  clearBack()
  flipStore.clear()
})
afterEach(() => { clearBack(); flipStore.clear() })

describe('stashBack / sharedElementBack', () => {
  it('Back records the title state under BACK_ID and the id; the row Flips from it and siblings fade', () => {
    const title = document.createElement('div')
    stashBack('0008', title)
    expect(pendingBack()).toBe('0008')
    expect(flipStore.has(BACK_ID)).toBe(true)
    expect(getState).toHaveBeenCalledWith(title)

    const { container } = render(<List />)
    sharedElementBack.play(ctx(true), { container })
    expect(from).toHaveBeenCalledTimes(1)
    const [state, vars] = from.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(state).toEqual({ fake: 'state' })
    const row = container.querySelector('[data-flip-id="spec:0008"]') as HTMLButtonElement
    expect(vars.targets).toBe(row)
    expect(vars).toMatchObject({ duration: 0.36, ease: 'power3.inOut', absolute: true, scale: false, toggleClass: 'is-flipping' })
    // Siblings — every spec row but the returning one — fade in over dur-1.
    const [siblings, , to] = fromTo.mock.calls[0] as unknown as [HTMLElement[], unknown, Record<string, unknown>]
    expect(siblings.map((el) => el.getAttribute('data-flip-id'))).toEqual(['spec:0007', 'spec:0009'])
    expect(to.duration).toBe(MOTION_DURATIONS['dur-1'])
    // Focus returned to the row, and the stash is consumed: a second play moves nothing.
    expect(document.activeElement).toBe(row)
    expect(pendingBack()).toBeNull()
    expect(flipStore.has(BACK_ID)).toBe(false)
    sharedElementBack.play(ctx(true), { container })
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('motion off or reduced: focus still returns to the row, nothing Flips', () => {
    stashBack('0007', document.createElement('div'))
    const { container } = render(<List />)
    sharedElementBack.play(ctx(false), { container })
    expect(from).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(container.querySelector('[data-flip-id="spec:0007"]'))
    stashBack('0009', document.createElement('div'))
    sharedElementBack.play(ctx(true, true), { container })
    expect(from).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(container.querySelector('[data-flip-id="spec:0009"]'))
  })

  it('a stash older than the TTL never replays — stale geometry is not animated from', () => {
    const then = 1_000_000
    stashBack('0008', document.createElement('div'), then)
    const { container } = render(<List />)
    sharedElementBack.play(ctx(true), { container, now: then + STASH_TTL_MS + 1 })
    expect(from).not.toHaveBeenCalled()
    // The id was still honoured for focus: the keyboard goes back where it was.
    expect(document.activeElement).toBe(container.querySelector('[data-flip-id="spec:0008"]'))
  })

  it('nothing pending, or the row gone (filtered out), moves and focuses nothing', () => {
    const { container } = render(<List />)
    sharedElementBack.play(ctx(true), { container })
    expect(from).not.toHaveBeenCalled()
    stashBack('0042', document.createElement('div'))
    sharedElementBack.play(ctx(true), { container })
    expect(from).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.body)
  })
})
