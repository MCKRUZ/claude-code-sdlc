// @vitest-environment jsdom
/** M1's meeting point between the Sidebar and the sign-off ceremony: getters, not elements, so
 * the ceremony resolves against the latest render; a re-entrant hold the Sidebar's own progress
 * row reads; an unregistered getter reads null rather than throwing. */
import { describe, expect, it } from 'vitest'
import { createCeremonyRegistry, ceremonyRegistry } from '../../src/motion/ceremonyRegistry'

describe('ceremonyRegistry', () => {
  it('resolves every key, null for the ones nobody registered', () => {
    const reg = createCeremonyRegistry()
    const node = document.createElement('span')
    const off = reg.register({ signedNode: () => node, fromFraction: () => 0.25 })
    const refs = reg.resolve()
    expect(refs.signedNode).toBe(node)
    expect(refs.fromFraction).toBe(0.25)
    expect(refs.connector).toBeNull()
    expect(refs.nextRing).toBeNull()
    expect(refs.nowBadge).toBeNull()
    expect(refs.bar).toBeNull()
    off()
    expect(reg.resolve().signedNode).toBeNull()
  })

  it('reads the getter at resolve time, so a re-render between register and play is seen', () => {
    const reg = createCeremonyRegistry()
    let current: Element | null = document.createElement('i')
    reg.register({ nextRing: () => current })
    const first = reg.resolve().nextRing
    current = document.createElement('b')
    expect(reg.resolve().nextRing).not.toBe(first)
    expect(reg.resolve().nextRing?.tagName).toBe('B')
  })

  it('the latest registration wins and a throwing getter reads as absent', () => {
    const reg = createCeremonyRegistry()
    const a = document.createElement('a')
    const b = document.createElement('b')
    reg.register({ bar: () => a })
    reg.register({ bar: () => b, nowBadge: () => { throw new Error('detached') } })
    expect(reg.resolve().bar).toBe(b)
    expect(reg.resolve().nowBadge).toBeNull()
  })

  it('hold() is re-entrant: held while any holder is outstanding, and a release is idempotent', () => {
    const reg = createCeremonyRegistry()
    expect(reg.held()).toBe(false)
    const r1 = reg.hold()
    const r2 = reg.hold()
    expect(reg.held()).toBe(true)
    r1()
    r1()
    expect(reg.held()).toBe(true)
    r2()
    expect(reg.held()).toBe(false)
  })

  it('the shared instance exposes the contract surface', () => {
    for (const key of ['register', 'resolve', 'hold', 'held'] as const) expect(typeof ceremonyRegistry[key]).toBe('function')
    ceremonyRegistry.reset()
    expect(ceremonyRegistry.held()).toBe(false)
  })
})
