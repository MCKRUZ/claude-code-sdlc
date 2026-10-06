// @vitest-environment jsdom
/** The §4.2 catalogue, asserted ONCE (studio-upgrade-2 §4 P0): every row exists under a unique
 * name, the count is the 25 rows plus round 2's four, and every row handed a disabled context
 * returns an already-completed timeline without touching the DOM. The four new rows are
 * placeholders until their owners land — this test is what keeps their names frozen. */
import { describe, expect, it } from 'vitest'
import { MOTION_DURATIONS, MOTION_EASES } from '../../src/motion/contract'
import { CATALOGUE, CATALOGUE_ROWS, contextFrom, edgeDraw, handoffCeremony, sceneCrossfade, spineCollapse } from '../../src/motion/choreo'
import { PRESS_SCALE, RING_IN_S, THEME_REVEAL_S } from '../../src/motion/presets'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const disabled = () => contextFrom(document.body, { enabled: false, reduced: true }, { durations: MOTION_DURATIONS, eases: MOTION_EASES })

describe('CATALOGUE', () => {
  it('has 29 rows — §4.2\'s 25 plus hand-off, edge draw, spine collapse and scene crossfade', () => {
    expect(CATALOGUE_ROWS).toBe(29)
    expect(CATALOGUE).toHaveLength(CATALOGUE_ROWS)
  })

  it('names every row uniquely, in row order, ending with the four round-2 rows', () => {
    const names = CATALOGUE.map((row) => row.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names.slice(-4)).toEqual(['handoffCeremony', 'edgeDraw', 'spineCollapse', 'sceneCrossfade'])
  })

  it('every row is a named Choreo with a play function', () => {
    for (const row of CATALOGUE) {
      expect(typeof row.name, String(row.name)).toBe('string')
      expect(typeof row.play, row.name).toBe('function')
    }
  })

  it('the four round-2 rows accept their frozen ref shapes, return a completed timeline under a disabled context and leave the DOM untouched', () => {
    const ctx = disabled()
    const el = document.createElement('div')
    document.body.append(el)
    const before = document.body.outerHTML
    const timelines = [
      handoffCeremony.play(ctx, { dialog: el, buildsCell: el, statusChip: el, prChips: [el, null] }),
      edgeDraw.play(ctx, { edges: [null, undefined] }),
      spineCollapse.play(ctx, { band: el, collapsed: true }),
      sceneCrossfade.play(ctx, { outgoing: el, incoming: null, onOutgoingHidden: () => {} }),
    ]
    for (const tl of timelines) {
      expect(tl.progress()).toBe(1)
      expect(typeof tl.then).toBe('function')
    }
    expect(document.body.outerHTML).toBe(before)
    el.remove()
  })
})

describe('presets mirror base.css', () => {
  const base = readFileSync(join(__dirname, '..', '..', 'src', 'theme', 'base.css'), 'utf8')

  it('press scale, ring-in length and the theme reveal are the same numbers in CSS and GSAP', () => {
    expect(base).toContain(`transform: scale(${PRESS_SCALE});`)
    expect(RING_IN_S).toBe(MOTION_DURATIONS['dur-1'])
    expect(base).toMatch(/animation: ring-in var\(--dur-1\) var\(--ease-out\);/)
    expect(base).toContain(`animation-duration: ${Math.round(THEME_REVEAL_S * 1000)}ms;`)
  })
})
