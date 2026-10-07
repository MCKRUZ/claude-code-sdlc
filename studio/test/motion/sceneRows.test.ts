// @vitest-environment jsdom
/** The two scene rows P4 owns (studio-upgrade-2 I8, catalogue #28 / #29). Disabled: the DOM is
 * not touched and `onOutgoingHidden` still fires — synchronously — so a toggle under `MODE=test`
 * lands in one commit and the end state is a cold reload's. Enabled: opacity only (reduced keeps
 * a capped fade), the incoming surface ends with no inline opacity, and the outgoing surface's
 * completion is what releases the canvas. */
import { gsap } from 'gsap'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MOTION_DURATIONS, MOTION_EASES } from '../../src/motion/contract'
import { contextFrom } from '../../src/motion/choreo/_shared'
import { sceneCrossfade } from '../../src/motion/choreo/sceneCrossfade'
import { spineCollapse } from '../../src/motion/choreo/spineCollapse'
import { CROSSFADE_IN, CROSSFADE_OUT } from '../../src/motion/presets'

const tokens = { durations: MOTION_DURATIONS, eases: MOTION_EASES }
const ctx = (enabled: boolean, reduced = false) => contextFrom(document.body, { enabled, reduced }, tokens)

afterEach(() => {
  gsap.globalTimeline.clear()
  document.body.innerHTML = ''
})

describe('sceneCrossfade', () => {
  it('disabled: touches no DOM and fires onOutgoingHidden at once', () => {
    const out = document.createElement('div')
    const inc = document.createElement('div')
    document.body.append(out, inc)
    const before = document.body.outerHTML
    const hidden = vi.fn()
    const tl = sceneCrossfade.play(ctx(false), { outgoing: out, incoming: inc, onOutgoingHidden: hidden })
    expect(hidden).toHaveBeenCalledTimes(1)
    expect(tl.progress()).toBe(1)
    expect(document.body.outerHTML).toBe(before)
  })

  it('enabled: outgoing dur-1, incoming dur-2, opacity only; the incoming surface ends with no inline opacity and onOutgoingHidden fires when the outgoing is gone', () => {
    const out = document.createElement('div')
    const inc = document.createElement('div')
    document.body.append(out, inc)
    const hidden = vi.fn()
    const tl = sceneCrossfade.play(ctx(true), { outgoing: out, incoming: inc, onOutgoingHidden: hidden }) as gsap.core.Timeline
    expect(CROSSFADE_OUT.to.duration).toBe(MOTION_DURATIONS['dur-1'])
    expect(CROSSFADE_IN.to.duration).toBe(MOTION_DURATIONS['dur-2'])
    expect(tl.duration()).toBeCloseTo(MOTION_DURATIONS['dur-2'])
    expect(hidden).not.toHaveBeenCalled()
    tl.progress(1)
    expect(hidden).toHaveBeenCalledTimes(1)
    expect(out.style.opacity).toBe('0')
    expect(inc.style.opacity).toBe('')
    expect(out.style.transform).toBe('')
    expect(inc.style.transform).toBe('')
  })

  it('reduced: still a fade, capped at 120 ms', () => {
    const out = document.createElement('div')
    document.body.append(out)
    const tl = sceneCrossfade.play(ctx(true, true), { outgoing: out, incoming: null, onOutgoingHidden: () => {} }) as gsap.core.Timeline
    expect(tl.duration()).toBeLessThanOrEqual(0.12 + 1e-9)
  })

  it('no outgoing surface (first graph): onOutgoingHidden still fires', () => {
    const inc = document.createElement('div')
    document.body.append(inc)
    const hidden = vi.fn()
    const tl = sceneCrossfade.play(ctx(true), { incoming: inc, onOutgoingHidden: hidden }) as gsap.core.Timeline
    tl.progress(1)
    expect(hidden).toHaveBeenCalledTimes(1)
  })
})

describe('spineCollapse', () => {
  it('disabled or no band: touches no DOM', () => {
    const band = document.createElement('div')
    document.body.append(band)
    const before = document.body.outerHTML
    expect(spineCollapse.play(ctx(false), { band, collapsed: true }).progress()).toBe(1)
    // Enabled but nothing to move: an empty real timeline, nothing tweened.
    expect((spineCollapse.play(ctx(true), { band: null, collapsed: true }) as gsap.core.Timeline).duration()).toBe(0)
    expect(document.body.outerHTML).toBe(before)
  })

  it('enabled: a height tween over dur-3 that clears its height at the end, so the host\'s own state is all that remains', () => {
    const band = document.createElement('div')
    Object.defineProperty(band, 'scrollHeight', { value: 168, configurable: true })
    document.body.append(band)
    const tl = spineCollapse.play(ctx(true), { band, collapsed: true }) as gsap.core.Timeline
    expect(tl.duration()).toBeCloseTo(MOTION_DURATIONS['dur-3'])
    tl.progress(0.5)
    expect(band.style.height).not.toBe('')
    tl.progress(1)
    expect(band.style.height).toBe('')
    expect(band.style.overflow).toBe('')
  })

  it('reduced: opacity only, cleared at the end', () => {
    const band = document.createElement('div')
    document.body.append(band)
    const tl = spineCollapse.play(ctx(true, true), { band, collapsed: false }) as gsap.core.Timeline
    tl.progress(0.5)
    expect(band.style.height).toBe('')
    tl.progress(1)
    expect(band.style.opacity).toBe('')
  })
})
