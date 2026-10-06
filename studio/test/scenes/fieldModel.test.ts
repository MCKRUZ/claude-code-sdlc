/** The gathered two-layer field (round 2 B3) as pure numbers: two layers in three draws, dense
 * on the hero third and thin on the far one, an exact accent share, the same arrays for the
 * same seed, a settle that only the first opens get, and a fade that shortens from the fourth
 * open. Nothing here reads plugin data — the field has no slot for any. */
import { describe, expect, it } from 'vitest'
import {
  ACCENT_SHARE,
  FAR_LAYER,
  FIELD_COUNT,
  FIELD_LAYERS,
  NEAR_LAYER,
  SETTLE_FROM,
  SLAB,
  accentIndices,
  buildField,
  fadeProgress,
  fadeSecondsFor,
  gatheredPositions,
  settleScale,
  thirds,
} from '../../src/scenes/ambient/fieldModel'

describe('two layers', () => {
  it('far dust is many and small, near motes few and larger; the total is the field count', () => {
    expect(FIELD_LAYERS.map((l) => l.name)).toEqual(['far', 'near'])
    expect(FAR_LAYER).toMatchObject({ count: 900, sizeMin: 0.6, sizeMax: 1.1 })
    expect(NEAR_LAYER).toMatchObject({ count: 120, sizeMin: 1.4, sizeMax: 1.8 })
    expect(FIELD_COUNT).toBe(1020)
  })

  it('builds three draws whose points add up to the two layers, every size inside its layer', () => {
    const draws = buildField()
    expect(draws.map((d) => d.name)).toEqual(['far', 'farAccent', 'near'])
    const far = draws[0]!, accent = draws[1]!, near = draws[2]!
    expect(far.sizes.length + accent.sizes.length).toBe(FAR_LAYER.count)
    expect(near.sizes.length).toBe(NEAR_LAYER.count)
    for (const d of draws) expect(d.positions.length).toBe(d.sizes.length * 3)
    for (const s of [...far.sizes, ...accent.sizes]) {
      expect(s).toBeGreaterThanOrEqual(FAR_LAYER.sizeMin)
      expect(s).toBeLessThanOrEqual(FAR_LAYER.sizeMax)
    }
    for (const s of near.sizes) {
      expect(s).toBeGreaterThanOrEqual(NEAR_LAYER.sizeMin)
      expect(s).toBeLessThanOrEqual(NEAR_LAYER.sizeMax)
    }
  })
})

describe('gathered on the hero third', () => {
  it('puts at least twice as many points in the hero third as in the far third, all inside the slab', () => {
    for (const draw of buildField()) {
      const [hero, , far] = thirds(draw.positions)
      expect(hero).toBeGreaterThanOrEqual(2 * far)
      const [w, h, d] = SLAB
      for (let i = 0; i < draw.positions.length; i += 3) {
        expect(Math.abs(draw.positions[i]!)).toBeLessThanOrEqual(w / 2)
        expect(Math.abs(draw.positions[i + 1]!)).toBeLessThanOrEqual(h / 2)
        expect(Math.abs(draw.positions[i + 2]!)).toBeLessThanOrEqual(d / 2)
      }
    }
  })

  it('still reaches the far third: gathered, not fenced', () => {
    const [, , far] = thirds(gatheredPositions(900, 7))
    expect(far).toBeGreaterThan(0)
  })
})

describe('accent share', () => {
  it('is an exact 6–10 % of the far dust, chosen deterministically', () => {
    expect(ACCENT_SHARE).toBe(0.08)
    const a = accentIndices(900, ACCENT_SHARE, 3)
    const b = accentIndices(900, ACCENT_SHARE, 3)
    expect([...a].sort()).toEqual([...b].sort())
    const share = a.size / 900
    expect(share).toBeGreaterThanOrEqual(0.06)
    expect(share).toBeLessThanOrEqual(0.1)
    for (const i of a) expect(i).toBeGreaterThanOrEqual(0), expect(i).toBeLessThan(900)
  })

  it('shows in the built field as its own draw', () => {
    const accent = buildField().find((d) => d.name === 'farAccent')!
    const share = accent.sizes.length / FAR_LAYER.count
    expect(share).toBeGreaterThanOrEqual(0.06)
    expect(share).toBeLessThanOrEqual(0.1)
  })
})

describe('deterministic', () => {
  it('returns identical arrays for the same seed and different ones for another', () => {
    const a = buildField(), b = buildField(), c = buildField(1)
    for (let k = 0; k < a.length; k++) {
      expect(Array.from(a[k]!.positions)).toEqual(Array.from(b[k]!.positions))
      expect(Array.from(a[k]!.sizes)).toEqual(Array.from(b[k]!.sizes))
    }
    expect(Array.from(a[0]!.positions)).not.toEqual(Array.from(c[0]!.positions))
  })
})

describe('arrival by familiarity', () => {
  it('fades over 900 ms on first opens and 320 ms from the fourth', () => {
    expect(fadeSecondsFor('full')).toBe(0.9)
    expect(fadeSecondsFor('quiet')).toBe(0.32)
    expect(fadeSecondsFor('settled')).toBe(0.32)
    expect(fadeProgress(0.16, 0.32)).toBeCloseTo(0.5, 5)
    expect(fadeProgress(0.32, 0.32)).toBe(1)
  })

  it('sizes settle 1.06× → 1× over the fade on first opens only', () => {
    expect(SETTLE_FROM).toBe(1.06)
    expect(settleScale(0)).toBeCloseTo(1.06)
    expect(settleScale(0.5)).toBeCloseTo(1.03)
    expect(settleScale(1)).toBe(1)
    expect(settleScale(7)).toBe(1)
    expect(settleScale(0, 'quiet')).toBe(1)
    expect(settleScale(0, 'settled')).toBe(1)
  })
})
