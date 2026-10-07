/** The plate stacking (studio-observatory.md §5.0 `Plates`): a plate sits just under its body;
 * two that would overlap never do — the one behind steps down and is marked displaced so a
 * leader line is drawn; a plate that would run off the bottom flips above instead of clipping;
 * and the result is deterministic for the same input. Pure, no DOM. */

import { describe, expect, it } from 'vitest'
import { LEADER_MIN_SHIFT, PLATE_GAP, leaderStart, stackPlates, stackPlatesStable } from '../../src/scenes/core/plateLayout'
import type { PlateInput } from '../../src/scenes/core/plateLayout'

const plate = (id: string, x: number, y: number, over: Partial<PlateInput> = {}): PlateInput =>
  ({ id, x, y, r: 10, w: 100, h: 22, side: 'below', depth: 0.5, ...over })

function overlaps(a: { left: number; top: number }, b: { left: number; top: number }, w = 100, h = 22): boolean {
  return a.left < b.left + w && a.left + w > b.left && a.top < b.top + h && a.top + h > b.top
}

describe('stackPlates', () => {
  it('hangs a lone plate centred just under its body', () => {
    const [p] = stackPlates([plate('a', 200, 100)], 800, 400)
    expect(p.left).toBe(150)
    expect(p.top).toBe(100 + 10 + PLATE_GAP)
    expect(p.displaced).toBe(false)
    expect(p.side).toBe('below')
  })

  it('stacks the farther plate below the nearer one when they would overlap, and marks it', () => {
    const placed = stackPlates([plate('near', 200, 100, { depth: 0.2 }), plate('far', 240, 104, { depth: 0.8 })], 800, 400)
    const near = placed.find((p) => p.id === 'near')!
    const far = placed.find((p) => p.id === 'far')!
    expect(near.displaced).toBe(false)
    expect(far.displaced).toBe(true)
    expect(far.shift).toBeGreaterThanOrEqual(LEADER_MIN_SHIFT)
    expect(overlaps(near, far)).toBe(false)
    expect(far.top).toBe(near.top + 22 + PLATE_GAP)
  })

  it('nine plates on a tight pitch never overlap each other', () => {
    const inputs = Array.from({ length: 9 }, (_, i) => plate(String(i), 60 + i * 75, 80, { w: 120, depth: i / 9 }))
    const placed = stackPlates(inputs, 724, 168)
    for (const a of placed) for (const b of placed) if (a.id !== b.id) expect(overlaps(a, b, 120)).toBe(false)
    // Alternation emerges: at most a few rows, not a nine-deep pile.
    const rows = new Set(placed.map((p) => p.top))
    expect(rows.size).toBeLessThanOrEqual(3)
  })

  it('keeps a plate inside the host horizontally', () => {
    const [p] = stackPlates([plate('edge', 10, 100)], 800, 400)
    expect(p.left).toBe(0)
  })

  it('flips above the body rather than running off the bottom', () => {
    const [p] = stackPlates([plate('low', 200, 390)], 800, 400)
    expect(p.side).toBe('above')
    expect(p.top).toBe(390 - 10 - PLATE_GAP - 22)
    expect(p.displaced).toBe(true)
    const start = leaderStart(p, 100, 22)
    expect(start).toEqual({ x: 200, y: p.top + 22 })
  })

  it('is deterministic', () => {
    const inputs = [plate('b', 200, 100, { depth: 0.5 }), plate('a', 210, 100, { depth: 0.5 })]
    expect(stackPlates(inputs, 800, 400)).toEqual(stackPlates([...inputs].reverse(), 800, 400))
  })
})

/** Positional stability under hover (observatory v4 critique, sprint-graph-hover): the resting
 * layout is computed on COLLAPSED boxes, so the hovered plate grows in place and nothing else
 * moves — before, one plate expanding re-stacked its neighbours and a label jumped ≈ 120 px. */
describe('stackPlatesStable', () => {
  // Three plates in a tight pile: the nearest keeps its spot, the other two are stacked under it.
  const pile = [
    plate('near', 200, 100, { depth: 0.1 }),
    plate('mid', 220, 104, { depth: 0.5 }),
    plate('far', 240, 108, { depth: 0.9 }),
  ]
  const rect = (p: { left: number; top: number; w: number; h: number }) => [p.left, p.top, p.w, p.h]

  it('with nothing expanded it is exactly the plain stack, with each box reported', () => {
    const plain = stackPlates(pile, 800, 400)
    const stable = stackPlatesStable(pile, 800, 400)
    expect(stable.map(({ w, h, ...rest }) => { expect([w, h]).toEqual([100, 22]); return rest })).toEqual(plain)
  })

  it('hovering changes only the hovered plate\'s rect; every other plate keeps its position', () => {
    const resting = stackPlatesStable(pile, 800, 400)
    const hovered = stackPlatesStable(pile, 800, 400, { id: 'mid', w: 180, h: 70 })
    for (const before of resting) {
      const after = hovered.find((p) => p.id === before.id)!
      if (before.id === 'mid') {
        // Grows in place from its top-left corner (a plate below its body).
        expect([after.left, after.top]).toEqual([before.left, before.top])
        expect([after.w, after.h]).toEqual([180, 70])
      } else {
        expect(rect(after)).toEqual(rect(before))
      }
    }
  })

  it('a plate above its body keeps its bottom-left corner when it grows', () => {
    const low = [plate('low', 200, 390)]
    const [resting] = stackPlatesStable(low, 800, 400)
    expect(resting.side).toBe('above')
    const [grown] = stackPlatesStable(low, 800, 400, { id: 'low', w: 160, h: 60 })
    expect(grown.left).toBe(resting.left)
    expect(grown.top + grown.h).toBe(resting.top + resting.h)
  })

  it('shifts the expanded plate by the minimum that keeps it inside the host, and no further', () => {
    const edge = [plate('edge', 760, 100)]
    const [resting] = stackPlatesStable(edge, 800, 400)
    expect(resting.left).toBe(700)
    const [grown] = stackPlatesStable(edge, 800, 400, { id: 'edge', w: 200, h: 30 })
    expect(grown.left).toBe(600)
    expect(grown.top).toBe(resting.top)
    // A plate whose expanded height would run off the bottom is pulled up just enough.
    const [tall] = stackPlatesStable([plate('tall', 200, 300)], 800, 400, { id: 'tall', w: 100, h: 120 })
    expect(tall.top).toBe(280)
  })
})
