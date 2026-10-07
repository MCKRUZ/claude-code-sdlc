// @vitest-environment jsdom
/** Row #31: the seam draws (300 ms expo.out from the card's top-centre) on `accepted` ONLY and
 * leaves again so the card equals a cold reload; the chip crossfades at 150 ms; `returned` /
 * `pending` / `n-a` draw no seam; `settled` crossfades only; reduced keeps ≤ 120 ms fades;
 * disabled touches nothing. */
import { gsap } from 'gsap'
import { afterEach, describe, expect, it } from 'vitest'
import { MOTION_DURATIONS, MOTION_EASES } from '../src/motion/contract'
import { contextFrom } from '../src/motion/choreo'
import { VERDICT_SEAM_S, verdictSeal, verdictSealDraws } from '../src/motion/choreo/verdictSeal'
import { VERDICT_CHIP_AT_S } from '../src/motion/presets'
import type { VerdictValue } from '../shared/types'

const tokens = { durations: MOTION_DURATIONS, eases: MOTION_EASES }
const ctx = (enabled = true, reduced = false) => contextFrom(document.body, { enabled, reduced }, tokens)
const make = (tag = 'div') => document.body.appendChild(document.createElement(tag))
const tweens = (tl: unknown) => (tl as gsap.core.Timeline).getChildren(false, true, false) as gsap.core.Tween[]
const on = (tl: unknown, el: Element) => tweens(tl).filter((t) => (t.targets() as unknown[]).includes(el))

afterEach(() => { gsap.globalTimeline.clear(); document.body.innerHTML = '' })

describe('verdictSealDraws', () => {
  it('accepted only', () => {
    expect(verdictSealDraws('accepted')).toBe(true)
    for (const v of ['returned', 'pending', 'n-a'] as VerdictValue[]) expect(verdictSealDraws(v)).toBe(false)
  })
})

describe('verdictSeal', () => {
  it('accepted: the seam draws from 0 over 300 ms then fades; the chip crossfades at 150 ms; the DOM equals a cold reload after progress(1)', () => {
    const card = make(); const seam = make('span'); const chip = make('span')
    const before = seam.outerHTML
    const tl = verdictSeal.play(ctx(), { card, seam, chipIn: chip, verdict: 'accepted', tier: 'full' })
    tl.pause()
    const [draw, leave] = on(tl, seam)
    expect(draw.startTime()).toBeCloseTo(0)
    expect(draw.duration()).toBeCloseTo(VERDICT_SEAM_S)
    expect((draw.vars as { scaleX?: number }).scaleX).toBe(1)
    expect(leave.startTime()).toBeCloseTo(VERDICT_SEAM_S)
    expect(on(tl, chip)[0].startTime()).toBeCloseTo(VERDICT_CHIP_AT_S)
    expect(on(tl, chip)[0].duration()).toBeCloseTo(MOTION_DURATIONS['dur-2'])
    tl.progress(1)
    // gsap leaves an empty `style=""` behind `clearProps: 'all'`; no property survives.
    expect((seam as HTMLElement).getAttribute('style') ?? '').toBe('')
    expect(seam.outerHTML.replace(' style=""', '')).toBe(before)
    expect((chip as HTMLElement).style.opacity).toBe('')
  })

  it('returned draws no seam, only the chip crossfade', () => {
    const card = make(); const seam = make('span'); const chip = make('span')
    const tl = verdictSeal.play(ctx(), { card, seam, chipIn: chip, verdict: 'returned', tier: 'full' }); tl.pause()
    expect(on(tl, seam)).toHaveLength(0)
    expect(on(tl, chip)).toHaveLength(1)
  })

  it('settled keeps the crossfade only; reduced keeps fades ≤ 120 ms and no transform', () => {
    const card = make(); const seam = make('span'); const chip = make('span')
    const settled = verdictSeal.play(ctx(), { card, seam, chipIn: chip, verdict: 'accepted', tier: 'settled' }); settled.pause()
    expect(on(settled, seam)).toHaveLength(0)
    expect(on(settled, chip)).toHaveLength(1)
    const reduced = verdictSeal.play(ctx(true, true), { card, seam, chipIn: chip, verdict: 'accepted', tier: 'full' }); reduced.pause()
    expect(on(reduced, seam)).toHaveLength(0)
    for (const t of tweens(reduced)) expect(t.duration()).toBeLessThanOrEqual(0.12 + 1e-9)
  })

  it('disabled: a completed timeline and a byte-identical DOM', () => {
    const card = make(); const seam = make('span'); const chip = make('span')
    const before = document.body.outerHTML
    const tl = verdictSeal.play(ctx(false, true), { card, seam, chipIn: chip, verdict: 'accepted' })
    expect(tl.progress()).toBe(1)
    expect(document.body.outerHTML).toBe(before)
  })
})
