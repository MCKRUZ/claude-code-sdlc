// @vitest-environment jsdom
/** Row #10 as one timeline (M1): the beats sit where the plan says, the seam plays only when a
 * caller passes one and lives inside 0.3–0.6 s, the "spine" label is at 0.9 s, reduced motion
 * keeps only short opacity beats, and a disabled context returns the completed stub. Real GSAP
 * builds the timeline here (paused, inspected, killed) — the point is the shape, not the frames. */
import { gsap } from 'gsap'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MOTION_DURATIONS, MOTION_EASES } from '../../src/motion/contract'
import { contextFrom } from '../../src/motion/choreo'
import {
  CEREMONY_SEAM_AT, CEREMONY_SEAM_S, CEREMONY_SPINE_AT, CEREMONY_SPINE_LABEL, signOffCeremony,
} from '../../src/motion/choreo/signOffCeremony'
import { StubTimeline } from '../../src/motion/stub'

const tokens = { durations: MOTION_DURATIONS, eases: MOTION_EASES }
const ctxFor = (enabled: boolean, reduced: boolean) => contextFrom(document.body, { enabled, reduced }, tokens)

function els() {
  const make = (tag = 'div') => document.body.appendChild(document.createElement(tag))
  return {
    successCard: make(), seam: make('span'), signedNode: make('span'), connector: make('span'), nextRing: make('span'), bar: make('span'),
  }
}

type Tween = gsap.core.Tween
function tweens(tl: unknown): Tween[] {
  return (tl as gsap.core.Timeline).getChildren(false, true, false) as Tween[]
}
function tweenOn(tl: unknown, target: Element): Tween | undefined {
  return tweens(tl).find((t) => (t.targets() as unknown[]).includes(target))
}

afterEach(() => {
  gsap.globalTimeline.clear()
  document.body.innerHTML = ''
})

describe('signOffCeremony', () => {
  it('places the beats: card at 0.3, seam 0.3→0.6, node 0.4, connector 0.5, next ring 0.8, bar and the "spine" label at 0.9', () => {
    const e = els()
    const tl = signOffCeremony.play(ctxFor(true, false), { ...e, fromFraction: 0.25, toFraction: 0.5 })
    tl.pause()
    expect(tl.labels[CEREMONY_SPINE_LABEL]).toBe(CEREMONY_SPINE_AT)
    expect(CEREMONY_SPINE_AT).toBe(0.9)
    expect(tweenOn(tl, e.successCard)?.startTime()).toBeCloseTo(0.3)
    const seam = tweenOn(tl, e.seam)!
    expect(seam.startTime()).toBeCloseTo(CEREMONY_SEAM_AT)
    expect(seam.startTime() + seam.duration()).toBeLessThanOrEqual(0.6 + 1e-9)
    expect(seam.startTime()).toBeGreaterThanOrEqual(0.3)
    expect(CEREMONY_SEAM_S).toBe(0.3)
    expect(tweenOn(tl, e.signedNode)?.startTime()).toBeCloseTo(0.4)
    expect(tweenOn(tl, e.signedNode)?.duration()).toBeCloseTo(0.32)
    expect(tweenOn(tl, e.connector)?.startTime()).toBeCloseTo(0.5)
    expect(tweenOn(tl, e.connector)?.duration()).toBeCloseTo(0.45)
    expect(tweenOn(tl, e.nextRing)?.startTime()).toBeCloseTo(0.8)
    expect(tweenOn(tl, e.bar)?.startTime()).toBeCloseTo(0.9)
    expect(tweenOn(tl, e.bar)?.duration()).toBeCloseTo(0.42)
    tl.kill()
  })

  it('draws the seam only when a caller passes one', () => {
    const { seam: _seam, ...rest } = els()
    const tl = signOffCeremony.play(ctxFor(true, false), rest)
    tl.pause()
    expect(tweens(tl).some((t) => (t.vars as { scaleX?: unknown }).scaleX !== undefined)).toBe(false)
    tl.kill()
  })

  it('calls onSpine at the label and the Flip only with a captured state', () => {
    const e = els()
    const onSpine = vi.fn()
    const tl = signOffCeremony.play(ctxFor(true, false), { ...e, onSpine })
    tl.pause()
    expect(onSpine).not.toHaveBeenCalled()
    tl.progress(1)
    expect(onSpine).toHaveBeenCalledTimes(1)
    tl.kill()
  })

  it('under reduced motion drops every transform beat and caps opacity beats at 120 ms', () => {
    const e = els()
    const tl = signOffCeremony.play(ctxFor(true, true), { ...e, fromFraction: 0.2, toFraction: 0.4 })
    tl.pause()
    const all = tweens(tl)
    for (const t of all) {
      const vars = t.vars as Record<string, unknown>
      expect(vars.scaleX ?? vars.scaleY ?? vars.scale, Object.keys(vars).join(',')).toBeUndefined()
      if (vars.y !== undefined) expect(vars.y).toBe(0)
      if (vars.opacity !== undefined || vars.strokeDashoffset !== undefined) expect(t.duration()).toBeLessThanOrEqual(0.12 + 1e-9)
    }
    // The bar is a width, still tweened: it is the fact that changed, not a flourish.
    expect(tweenOn(tl, e.bar)).toBeDefined()
    expect(tl.labels[CEREMONY_SPINE_LABEL]).toBe(CEREMONY_SPINE_AT)
    tl.kill()
  })

  it('disabled: a completed stub, the bar set to its end width, the label present', () => {
    const e = els()
    const onSpine = vi.fn()
    const tl = signOffCeremony.play(ctxFor(false, true), { ...e, fromFraction: 0.1, toFraction: 0.5, onSpine })
    expect(tl).toBeInstanceOf(StubTimeline)
    expect(tl.progress()).toBe(1)
    expect((e.bar as HTMLElement).style.width).toBe('50%')
    expect(onSpine).toHaveBeenCalledTimes(1)
    expect(CEREMONY_SPINE_LABEL in tl.labels).toBe(true)
  })
})
