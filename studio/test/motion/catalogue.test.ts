// @vitest-environment jsdom
/** The §4.2 catalogue, asserted ONCE (studio-upgrade-2 §4 P0): every row exists under a unique
 * name, the count is the 25 rows plus round 2's four, and every row handed a disabled context
 * returns an already-completed timeline without touching the DOM. The four new rows are
 * placeholders until their owners land — this test is what keeps their names frozen. */
import { describe, expect, it } from 'vitest'
import { MOTION_DURATIONS, MOTION_EASES } from '../../src/motion/contract'
import {
  batonPass, batonPassDue, CATALOGUE, CATALOGUE_ROWS, contextFrom, edgeDraw, handoffCeremony, sceneCrossfade, spineCollapse,
  stripDraw, stripDrawPlays, verdictSeal, verdictSealDraws,
} from '../../src/motion/choreo'
import { BATON_PASS_TOTAL_S, BATON_POP_S, STRIP_DRAW_S, TIER_FEATURES, tierAllows, VERDICT_CHIP_AT_S, VERDICT_SEAL } from '../../src/motion/presets'
import { PRESS_SCALE, RING_IN_S, THEME_REVEAL_S } from '../../src/motion/presets'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const disabled = () => contextFrom(document.body, { enabled: false, reduced: true }, { durations: MOTION_DURATIONS, eases: MOTION_EASES })

describe('CATALOGUE', () => {
  it('has 32 rows — §4.2\'s 25, the four round-2 rows, and the three command-center rows (the recorded 29 → 32 pin change, togo-command-center.md §8)', () => {
    expect(CATALOGUE_ROWS).toBe(32)
    expect(CATALOGUE).toHaveLength(CATALOGUE_ROWS)
  })

  it('names every row uniquely, in row order: the four round-2 rows then baton pass, verdict seal, strip draw', () => {
    const names = CATALOGUE.map((row) => row.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names.slice(-7, -3)).toEqual(['handoffCeremony', 'edgeDraw', 'spineCollapse', 'sceneCrossfade'])
    expect(names.slice(-3)).toEqual(['batonPass', 'verdictSeal', 'stripDraw'])
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

describe('the three command-center rows (#30–#32)', () => {
  it('accept their frozen ref shapes, return a completed timeline under a disabled context and leave the DOM byte-identical', () => {
    const ctx = disabled()
    const el = document.createElement('div')
    const rail = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    document.body.append(el, rail)
    const before = document.body.outerHTML
    const timelines = [
      batonPass.play(ctx, { baton: el, fromSlot: el, toSlot: null, card: el, tier: 'full' }),
      verdictSeal.play(ctx, { card: el, seam: el, chipOut: el, chipIn: null, verdict: 'accepted' }),
      stripDraw.play(ctx, { rail, stations: [el, null, undefined], tier: 'full' }),
    ]
    for (const tl of timelines) {
      expect(tl.progress()).toBe(1)
      expect(typeof tl.then).toBe('function')
    }
    expect(document.body.outerHTML).toBe(before)
    el.remove(); rail.remove()
  })

  it('baton pass plays only after exit 0 AND the refreshed read; the seal draws only on accepted; the strip draws on full only', () => {
    expect(batonPassDue({ ok: true }, true)).toBe(true)
    expect(batonPassDue({ ok: true }, false)).toBe(false)
    expect(batonPassDue({ ok: false }, true)).toBe(false)
    expect(batonPassDue(null, true)).toBe(false)
    expect(verdictSealDraws('accepted')).toBe(true)
    for (const v of ['returned', 'pending', 'n-a'] as const) expect(verdictSealDraws(v)).toBe(false)
    expect(stripDrawPlays('full')).toBe(true)
    expect(stripDrawPlays(undefined)).toBe(true)
    expect(stripDrawPlays('quiet')).toBe(false)
    expect(stripDrawPlays('settled')).toBe(false)
  })

  it('presets carry the visual direction\'s numbers: 100 ms pop + dur-3 slide = 420 ms, seam = SEAM, chip at 150 ms, strip over dur-5', () => {
    expect(BATON_POP_S).toBeCloseTo(0.1)
    expect(BATON_PASS_TOTAL_S).toBeCloseTo(0.42)
    expect(VERDICT_SEAL.to.duration).toBeCloseTo(0.3)
    expect(VERDICT_CHIP_AT_S).toBeCloseTo(0.15)
    expect(STRIP_DRAW_S).toBe(MOTION_DURATIONS['dur-5'])
  })

  it('calm by day 30: full plays everything, quiet keeps the evidence of a verb, settled keeps only crossfades and counters', () => {
    expect([...TIER_FEATURES.settled].sort()).toEqual(['counter', 'crossfade'])
    expect(tierAllows('quiet', 'stagger')).toBe(false)
    expect(tierAllows('quiet', 'draw')).toBe(false)
    expect(tierAllows('quiet', 'pulse')).toBe(false)
    for (const f of ['pop', 'seam', 'slide'] as const) expect(tierAllows('quiet', f)).toBe(true)
    for (const f of ['stagger', 'draw', 'pulse', 'pop', 'seam', 'slide', 'crossfade', 'counter'] as const) expect(tierAllows('full', f)).toBe(true)
    expect(tierAllows(undefined, 'draw')).toBe(true)
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
