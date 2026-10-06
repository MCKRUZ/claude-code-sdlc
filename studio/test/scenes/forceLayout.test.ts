/** The constellation's layout, as a promise about reproducibility and honesty: the same backlog
 * lays out the same way every time; x follows the plugin's build order (the one axis that means
 * anything); a layout of sixty bodies costs a few milliseconds, not a frame; and above the sync
 * ceiling the work is handed back in steps rather than blocking the first paint. */

import { describe, expect, it } from 'vitest'
import { computeLayout, INCREMENTAL_MAX_STEPS, INCREMENTAL_PER_STEP } from '../../src/scenes/core/layout/forceLayout'
import type { LayoutInput } from '../../src/scenes/core/layout/forceLayout'
import { layoutCacheKey, loadLayoutCache } from '../../src/scenes/core/layout/layoutCache'
import { fnv1a, mulberry32, seededPosition } from '../../src/scenes/core/layout/hash'

const id = (i: number) => String(i + 1).padStart(4, '0')

/** `n` specs in build order, each depending on the previous one. */
function chain(n: number): LayoutInput {
  return {
    nodes: Array.from({ length: n }, (_, i) => ({ id: id(i), buildOrderIndex: i })),
    links: Array.from({ length: n - 1 }, (_, i) => ({ from: id(i + 1), to: id(i) })),
  }
}

describe('hash', () => {
  it('is deterministic and the PRNG is seeded', () => {
    expect(fnv1a('0007')).toBe(fnv1a('0007'))
    expect(fnv1a('0007')).not.toBe(fnv1a('0008'))
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(seededPosition('0007')).toEqual(seededPosition('0007'))
  })
})

describe('computeLayout', () => {
  it('lays the same input out identically every time', () => {
    const input = chain(12)
    const first = computeLayout(input)
    const second = computeLayout(input)
    expect(first.settled).toBe(true)
    expect([...first.positions.entries()]).toEqual([...second.positions.entries()])
  })

  it('places x in the plugin build order, left to right', () => {
    const { positions } = computeLayout(chain(8))
    const xs = Array.from({ length: 8 }, (_, i) => positions.get(id(i))![0])
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1])
  })

  it('lays out 60 nodes in at most 20 ms', () => {
    const input = chain(60)
    computeLayout(chain(5)) // warm the JIT on the code path, not the measurement
    let best = Infinity
    for (let run = 0; run < 3; run++) {
      const start = performance.now()
      computeLayout(input)
      best = Math.min(best, performance.now() - start)
    }
    expect(best).toBeLessThanOrEqual(20)
  })

  it('drops edges whose ends are not nodes instead of throwing', () => {
    const input = chain(3)
    input.links.push({ from: '0001', to: '9999' }, { from: '0002', to: '0002' })
    expect(() => computeLayout(input)).not.toThrow()
  })

  it('leaves unordered nodes free of the order force', () => {
    const input: LayoutInput = {
      nodes: [
        { id: 'a', buildOrderIndex: 0 },
        { id: 'b', buildOrderIndex: 1 },
        { id: 'ghost', buildOrderIndex: null },
      ],
      links: [{ from: 'b', to: 'ghost' }],
    }
    const { positions } = computeLayout(input)
    expect(positions.size).toBe(3)
    expect(positions.get('ghost')!.every((n) => Number.isFinite(n))).toBe(true)
  })

  it('goes incremental above the sync ceiling and settles within the step budget', () => {
    const result = computeLayout(chain(160), { syncMax: 150 })
    expect(result.settled).toBe(false)
    expect(typeof result.step).toBe('function')
    const before = new Map(result.positions)
    let steps = 0
    while (!result.step!()) steps += 1
    expect(steps).toBeLessThanOrEqual(INCREMENTAL_MAX_STEPS)
    expect(INCREMENTAL_PER_STEP).toBeGreaterThan(0)
    // Something moved between the first 60 ticks and the settled state.
    const moved = [...result.positions].some(([k, p]) => before.get(k)![0] !== p[0])
    expect(moved).toBe(true)
  })

  it('carries initial positions instead of reseeding', () => {
    const input = chain(4)
    const first = computeLayout(input)
    const carried = computeLayout({ ...input, initial: first.positions })
    // Starting from a settled state, a settled layout barely moves.
    for (const [k, p] of first.positions) {
      const q = carried.positions.get(k)!
      expect(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])).toBeLessThan(0.5)
    }
  })
})

describe('layoutCache', () => {
  it('keys by a hash of the project path and reads null with no storage', () => {
    expect(layoutCacheKey('/p/one')).toMatch(/^studio\.constellation\.[0-9a-f]{8}$/)
    expect(layoutCacheKey('/p/one')).not.toBe(layoutCacheKey('/p/two'))
    expect(loadLayoutCache('/p/one')).toBeNull()
  })
})
