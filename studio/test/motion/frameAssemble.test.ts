// @vitest-environment jsdom
/** Row #2 wired (M2 / M3): once per key, a joiner added at 0.1 s, no residual transform when it
 * ends, and the familiarity tier sets the pace — `quiet` fits inside `dur-4`, `settled` plays
 * nothing. Real GSAP, paused and inspected. */
import { gsap } from 'gsap'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MOTION_DURATIONS, MOTION_EASES, STAGGER_1_AMOUNT_CAP } from '../../src/motion/contract'
import { contextFrom } from '../../src/motion/choreo'
import { FRAME_ASSEMBLE_JOIN_AT, frameAssemble, resetFrameAssemble } from '../../src/motion/choreo/frameAssemble'

const tokens = { durations: MOTION_DURATIONS, eases: MOTION_EASES }
const ctx = (enabled = true, reduced = false) => contextFrom(document.body, { enabled, reduced }, tokens)

function refs() {
  const make = (tag = 'div') => document.body.appendChild(document.createElement(tag))
  return {
    sidebarHeader: make(),
    stageRows: [make('li'), make('li'), make('li')],
    screenRoot: make(),
    chatInner: make(),
  }
}

beforeEach(() => resetFrameAssemble())
afterEach(() => {
  gsap.globalTimeline.clear()
  document.body.innerHTML = ''
  resetFrameAssemble()
})

describe('frameAssemble', () => {
  it('plays once per key: the second call for the same key returns null and moves nothing', () => {
    const r = refs()
    const first = frameAssemble.playOnce('/p', ctx(), r)
    expect(first).not.toBeNull()
    first!.pause()
    expect(frameAssemble.hasPlayed('/p')).toBe(true)
    expect(frameAssemble.playOnce('/p', ctx(), r)).toBeNull()
    // A different project is a different open.
    const other = frameAssemble.playOnce('/q', ctx(), refs())
    expect(other).not.toBeNull()
    other!.kill()
    // Forgetting the key (the Frame unmounted) makes the next open play again.
    frameAssemble.forget('/p')
    expect(frameAssemble.hasPlayed('/p')).toBe(false)
    first!.kill()
  })

  it('leaves no residual transform on anything it moved', () => {
    const r = refs()
    const tl = frameAssemble.play(ctx(), r) as gsap.core.Timeline
    tl.pause()
    tl.progress(1)
    for (const el of [r.screenRoot, r.chatInner, ...r.stageRows]) {
      expect((el as HTMLElement).style.transform, el.tagName).toBe('')
    }
    tl.kill()
  })

  it('caps the stage-row stagger so a long list arrives inside 0.32 s', () => {
    const r = refs()
    const tl = frameAssemble.play(ctx(), r) as gsap.core.Timeline
    tl.pause()
    const rows = tl.getChildren(false, true, false).find((t) => (t.targets() as unknown[]).includes(r.stageRows[0])) as gsap.core.Tween
    const stagger = rows.vars.stagger as { each: number; amount: number }
    expect(stagger.each).toBe(0.024)
    expect(stagger.amount).toBe(STAGGER_1_AMOUNT_CAP)
    tl.kill()
  })

  it('a joiner is called with the context and its animation is added at 0.1 s', () => {
    const r = refs()
    const probe = document.body.appendChild(document.createElement('i'))
    const joiner = vi.fn(() => gsap.to(probe, { opacity: 1, duration: 0.3, paused: false }))
    const off = frameAssemble.join(joiner)
    const tl = frameAssemble.play(ctx(), r) as gsap.core.Timeline
    tl.pause()
    expect(joiner).toHaveBeenCalledTimes(1)
    const child = tl.getChildren(false, true, false).find((t) => (t.targets() as unknown[]).includes(probe))!
    expect(child.startTime()).toBeCloseTo(FRAME_ASSEMBLE_JOIN_AT)
    expect(FRAME_ASSEMBLE_JOIN_AT).toBe(0.1)
    off()
    tl.kill()
    const again = frameAssemble.play(ctx(), refs()) as gsap.core.Timeline
    again.pause()
    expect(joiner).toHaveBeenCalledTimes(1)
    again.kill()
  })

  it('quiet: the whole assemble fits inside dur-4; settled: nothing is played', () => {
    const quiet = frameAssemble.play(ctx(), { ...refs(), tier: 'quiet' }) as gsap.core.Timeline
    quiet.pause()
    expect(quiet.duration() / quiet.timeScale()).toBeLessThanOrEqual(MOTION_DURATIONS['dur-4'] + 1e-6)
    quiet.kill()
    const settled = frameAssemble.play(ctx(), { ...refs(), tier: 'settled' }) as gsap.core.Timeline
    expect(settled.getChildren(false, true, false)).toHaveLength(0)
    settled.kill()
    const full = frameAssemble.play(ctx(), { ...refs(), tier: 'full' }) as gsap.core.Timeline
    full.pause()
    expect(full.timeScale()).toBe(1)
    expect(full.getChildren(false, true, false).length).toBeGreaterThan(0)
    full.kill()
  })

  it('disabled: the stub, no DOM change', () => {
    const r = refs()
    const before = document.body.outerHTML
    const tl = frameAssemble.play(ctx(false, true), r)
    expect(tl.progress()).toBe(1)
    expect(document.body.outerHTML).toBe(before)
  })
})
