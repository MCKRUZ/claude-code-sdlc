// @vitest-environment jsdom
/** Row #26 (M9): plays only when the plugin said `ok` AND the refreshed row arrived; a refusal
 * plays nothing. The dialog fades 120 ms, BUILDS IT crossfades 200 ms, the chip pops, the PR
 * chips rise with `stagger-2`; reduced motion keeps the fades only; disabled touches nothing. */
import { gsap } from 'gsap'
import { afterEach, describe, expect, it } from 'vitest'
import { MOTION_DURATIONS, MOTION_EASES, MOTION_STAGGERS } from '../../src/motion/contract'
import { contextFrom } from '../../src/motion/choreo'
import { HANDOFF_BUILDS_CROSSFADE_S, handoffCeremony, handoffCeremonyDue } from '../../src/motion/choreo/handoffCeremony'

const tokens = { durations: MOTION_DURATIONS, eases: MOTION_EASES }
const ctx = (enabled = true, reduced = false) => contextFrom(document.body, { enabled, reduced }, tokens)
const make = (tag = 'div') => document.body.appendChild(document.createElement(tag))
const tweens = (tl: unknown) => (tl as gsap.core.Timeline).getChildren(false, true, false) as gsap.core.Tween[]
const on = (tl: unknown, el: Element) => tweens(tl).find((t) => (t.targets() as unknown[]).includes(el))

afterEach(() => {
  gsap.globalTimeline.clear()
  document.body.innerHTML = ''
})

describe('handoffCeremonyDue', () => {
  it('is true only on ok AND refreshed', () => {
    expect(handoffCeremonyDue({ ok: true }, true)).toBe(true)
    expect(handoffCeremonyDue({ ok: true }, false)).toBe(false)
    expect(handoffCeremonyDue({ ok: false }, true)).toBe(false)
    expect(handoffCeremonyDue(null, true)).toBe(false)
    expect(handoffCeremonyDue(undefined, true)).toBe(false)
  })
})

describe('handoffCeremony', () => {
  it('fades the dialog 120 ms, crossfades BUILDS IT 200 ms at 0.1, pops the chip, rises the PR chips with stagger-2', () => {
    const dialog = make(); const buildsCell = make('span'); const statusChip = make('span'); const a = make('span'); const b = make('span')
    const tl = handoffCeremony.play(ctx(), { dialog, buildsCell, statusChip, prChips: [a, null, b] })
    tl.pause()
    expect(on(tl, dialog)?.duration()).toBeCloseTo(MOTION_DURATIONS['dur-1'])
    expect(on(tl, dialog)?.startTime()).toBeCloseTo(0)
    expect(on(tl, buildsCell)?.duration()).toBeCloseTo(HANDOFF_BUILDS_CROSSFADE_S)
    expect(on(tl, buildsCell)?.startTime()).toBeCloseTo(0.1)
    expect((on(tl, statusChip)?.vars as { scale?: number }).scale).toBe(1)
    const chips = on(tl, a)!
    expect((chips.targets() as unknown[])).toEqual([a, b])
    expect((chips.vars.stagger as { each: number }).each).toBe(MOTION_STAGGERS['stagger-2'])
    tl.progress(1)
    for (const el of [statusChip, a, b]) expect((el as HTMLElement).style.transform).toBe('')
    tl.kill()
  })

  it('reduced: the two fades stay (≤ 120 ms), the pop and the rise transforms are gone', () => {
    const dialog = make(); const buildsCell = make('span'); const statusChip = make('span'); const a = make('span')
    const tl = handoffCeremony.play(ctx(true, true), { dialog, buildsCell, statusChip, prChips: [a] })
    tl.pause()
    expect(on(tl, statusChip)).toBeUndefined()
    for (const t of tweens(tl)) {
      expect(t.duration()).toBeLessThanOrEqual(0.12 + 1e-9)
      const vars = t.vars as { y?: number; scale?: number }
      expect(vars.scale).toBeUndefined()
      if (vars.y !== undefined) expect(vars.y).toBe(0)
    }
    tl.kill()
  })

  it('disabled: completed, and the DOM is byte-identical', () => {
    const dialog = make(); const buildsCell = make('span')
    const before = document.body.outerHTML
    const tl = handoffCeremony.play(ctx(false, true), { dialog, buildsCell, statusChip: buildsCell, prChips: [dialog] })
    expect(tl.progress()).toBe(1)
    expect(document.body.outerHTML).toBe(before)
  })
})
