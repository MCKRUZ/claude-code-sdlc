// @vitest-environment jsdom
/** Row #32 (togo-command-center.md §4, visual §7 "Strip draw"): the rail draws and the stations
 * pop on the `full` tier only; `quiet` / `settled` / reduced / disabled move nothing; after
 * `progress(1)` no inline style survives, so the end state equals a cold reload. */
import { describe, expect, it } from 'vitest'
import { gsap } from 'gsap'
import { MOTION_DURATIONS, MOTION_EASES } from '../src/motion/contract'
import { contextFrom } from '../src/motion/choreo'
import { stripDraw, stripDrawPlays, STRIP_STATIONS_AT_S } from '../src/motion/choreo/stripDraw'

function rig() {
  const root = document.createElement('div')
  root.innerHTML = '<svg><line data-strip-rail x1="0" y1="1" x2="25%" y2="1" pathLength="100"></line></svg><svg data-s></svg><svg data-s></svg>'
  document.body.appendChild(root)
  return { root, rail: root.querySelector('line') as SVGGeometryElement, stations: Array.from(root.querySelectorAll('[data-s]')) }
}
const ctx = (enabled: boolean, reduced = false) => contextFrom(document.body, { enabled, reduced }, { durations: MOTION_DURATIONS, eases: MOTION_EASES })

describe('stripDraw (#32)', () => {
  it('full tier: the rail draws over dur-5 and the stations pop from a quarter second in; the end state is clean', () => {
    const { rail, stations, root } = rig()
    const tl = stripDraw.play(ctx(true), { rail, stations, tier: 'full' }) as unknown as gsap.core.Timeline
    expect(tl.getChildren().length).toBeGreaterThan(0)
    expect(tl.duration()).toBeGreaterThanOrEqual(MOTION_DURATIONS['dur-5'])
    expect(tl.getChildren(false, true, false).some((c) => c.startTime() === STRIP_STATIONS_AT_S)).toBe(true)
    tl.progress(1)
    expect(rail.style.strokeDashoffset).toBe('')
    expect(rail.style.strokeDasharray).toBe('')
    for (const s of stations) expect((s as HTMLElement).style.transform).toBe('')
    root.remove()
  })

  it('quiet and settled tiers, reduced motion and a disabled context move nothing and write nothing', () => {
    const before = document.body.innerHTML
    for (const [enabled, reduced, tier] of [[true, false, 'quiet'], [true, false, 'settled'], [true, true, 'full'], [false, false, 'full']] as const) {
      const { rail, stations, root } = rig()
      const html = root.innerHTML
      const tl = stripDraw.play(ctx(enabled, reduced), { rail, stations, tier }) as unknown as gsap.core.Timeline
      if (typeof tl.getChildren === 'function') expect(tl.getChildren().length, `${tier} ${enabled} ${reduced}`).toBe(0)
      expect(root.innerHTML).toBe(html)
      root.remove()
    }
    expect(document.body.innerHTML).toBe(before)
    expect(stripDrawPlays('full')).toBe(true)
    expect(stripDrawPlays('quiet')).toBe(false)
  })
})
