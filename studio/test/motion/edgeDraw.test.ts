// @vitest-environment jsdom
/** Row #27 edge draw (I7): disabled → the completed stub and no dash left behind; reduced → an
 * opacity fade capped at 120 ms; full → each edge's dash offset runs its own length → 0 over
 * EDGE_DRAW_S and clears both dash props at the end, so the end state equals a cold reload. */
import { describe, expect, it } from 'vitest'
import { gsap } from 'gsap'
import { MOTION_DURATIONS, MOTION_EASES } from '../../src/motion/contract'
import { EDGE_DRAW_S } from '../../src/motion/presets'
import { edgeDraw } from '../../src/motion/choreo/edgeDraw'

function path(length: number | null): SVGPathElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  if (length !== null) (el as unknown as { getTotalLength: () => number }).getTotalLength = () => length
  document.body.appendChild(el)
  return el
}

const ctx = (enabled: boolean, reduced = false) => ({
  scope: document.body, enabled, reduced, durations: MOTION_DURATIONS, eases: MOTION_EASES,
})

describe('edgeDraw', () => {
  it('disabled: a completed stub, edges visible, no dash attributes', () => {
    const edge = path(100)
    const tl = edgeDraw.play(ctx(false), { edges: [edge, null] })
    expect(tl.progress()).toBe(1)
    expect(edge.style.strokeDasharray).toBe('')
    expect(edge.getAttribute('stroke-dashoffset')).toBeNull()
  })

  it('reduced: opacity only, capped at 120 ms', () => {
    const edge = path(100)
    const tl = edgeDraw.play(ctx(true, true), { edges: [edge] }) as gsap.core.Timeline
    expect(tl.duration()).toBeCloseTo(0.12)
    expect(tl.getChildren().every((t) => !('strokeDashoffset' in ((t as gsap.core.Tween).vars ?? {})))).toBe(true)
    tl.kill()
  })

  it('full: dash offset length → 0 over EDGE_DRAW_S per edge, cleared at the end', () => {
    const a = path(100)
    const b = path(50)
    const tl = edgeDraw.play(ctx(true), { edges: [a, b] }) as gsap.core.Timeline
    const tweens = tl.getChildren() as gsap.core.Tween[]
    expect(tweens).toHaveLength(2)
    expect(tweens[0].vars.strokeDashoffset).toBe(0)
    expect(tweens[0].vars.duration).toBe(EDGE_DRAW_S)
    expect(tweens[0].vars.clearProps).toContain('strokeDashoffset')
    tl.progress(1)
    expect(a.style.strokeDasharray).toBe('')
    expect(a.style.strokeDashoffset).toBe('')
    tl.kill()
  })

  it('an edge without a measurable length falls back to a fade rather than failing', () => {
    const edge = path(null)
    const tl = edgeDraw.play(ctx(true), { edges: [edge] }) as gsap.core.Timeline
    const [tween] = tl.getChildren() as gsap.core.Tween[]
    expect(tween.vars.opacity).toBe(1)
    expect('strokeDashoffset' in tween.vars).toBe(false)
    tl.kill()
    gsap.globalTimeline.clear()
  })
})
