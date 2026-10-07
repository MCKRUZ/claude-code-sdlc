// Node environment on purpose: `motion.ts` must answer without a window (renderToStaticMarkup
// tests import components that import it), and the stub must apply end states to plain objects
// without a DOM — GSAP tweens any object.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyMotionAttribute, configureMotionForTests, enabled, getPreference, hashProjectKey, motion, opensStorageKey, reduced,
  setPreference, subscribe, tierForOpens,
} from '../../src/motion/motion'
import { StubTimeline, stubGsap } from '../../src/motion/stub'
import { FAMILIARITY_FULL_MAX_OPENS, FAMILIARITY_QUIET_MAX_OPENS, MOTION_DURATIONS, MOTION_EASES } from '../../src/motion/contract'

// Typed as a plain record: lib DOM declares `window` as REQUIRED on `globalThis`, so the shims
// could not otherwise be assigned or deleted.
const g = globalThis as unknown as Record<string, unknown>

function fakeWindow(matches: boolean | 'missing') {
  const listeners: Array<() => void> = []
  g.window = matches === 'missing'
    ? {}
    : { matchMedia: () => ({ matches, addEventListener: (_: string, cb: () => void) => listeners.push(cb) }) }
  return { fire: () => listeners.forEach((cb) => cb()) }
}

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  g.localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
  return map
}

beforeEach(() => {
  configureMotionForTests(null)
})

afterEach(() => {
  configureMotionForTests(null)
  delete g.window
  delete g.document
  delete g.localStorage
})

describe('enabled() — the one definition', () => {
  it('is false in MODE=test even when the person opted in and nothing asks for reduced motion', () => {
    expect(import.meta.env.MODE).toBe('test')
    fakeWindow(false)
    setPreference('on')
    expect(enabled()).toBe(false)
  })

  it('auto: honours the OS — on when it does not ask for reduced motion, off when it does', () => {
    configureMotionForTests({ isTestMode: () => false })
    fakeWindow(false)
    expect(getPreference()).toBe('auto')
    expect(enabled()).toBe(true)
    configureMotionForTests({ isTestMode: () => false })
    fakeWindow(true)
    expect(reduced()).toBe(true)
    expect(enabled()).toBe(false)
  })

  it('on: an explicit opt-in overrides a reduced-motion OS setting', () => {
    configureMotionForTests({ isTestMode: () => false })
    fakeWindow(true)
    setPreference('on')
    expect(enabled()).toBe(true)
  })

  it('off wins over everything', () => {
    configureMotionForTests({ isTestMode: () => false })
    fakeWindow(false)
    setPreference('off')
    expect(enabled()).toBe(false)
  })

  it('is safe without matchMedia: reduced() is false, not a TypeError', () => {
    configureMotionForTests({ isTestMode: () => false })
    fakeWindow('missing')
    expect(reduced()).toBe(false)
    expect(enabled()).toBe(true)
  })

  it('is safe with no window at all', () => {
    configureMotionForTests({ isTestMode: () => false })
    expect(reduced()).toBe(false)
    expect(enabled()).toBe(true)
  })
})

describe('preference persistence and the data-motion attribute', () => {
  it('reads localStorage["studio.motion"] and ignores garbage', () => {
    fakeStorage({ 'studio.motion': 'off' })
    expect(getPreference()).toBe('off')
    configureMotionForTests(null)
    fakeStorage({ 'studio.motion': 'sideways' })
    expect(getPreference()).toBe('auto')
  })

  it('setPreference persists (auto = removed), stamps <html data-motion>, and notifies subscribers', () => {
    configureMotionForTests({ isTestMode: () => false })
    const store = fakeStorage()
    fakeWindow(false)
    const dataset: Record<string, string> = {}
    g.document = { documentElement: { dataset } }
    const listener = vi.fn()
    subscribe(listener)
    setPreference('off')
    expect(store.get('studio.motion')).toBe('off')
    expect(dataset.motion).toBe('off')
    expect(listener).toHaveBeenCalledTimes(1)
    setPreference('auto')
    expect(store.has('studio.motion')).toBe(false)
    expect(dataset.motion).toBe('on')
  })

  it('a media-query change re-stamps the attribute and notifies', () => {
    configureMotionForTests({ isTestMode: () => false })
    const media = fakeWindow(false)
    const dataset: Record<string, string> = {}
    g.document = { documentElement: { dataset } }
    const listener = vi.fn()
    const off = subscribe(listener)
    applyMotionAttribute()
    expect(dataset.motion).toBe('on')
    media.fire()
    expect(listener).toHaveBeenCalledTimes(1)
    off()
    media.fire()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('exposes the §2.7 token mirrors on the api object', () => {
    expect(motion.durations).toBe(MOTION_DURATIONS)
    expect(motion.eases).toBe(MOTION_EASES)
    expect(motion.preference).toBe('auto')
  })
})

describe('familiarity (M3) — a count, never a date', () => {
  it('tiers: opens 1–3 full, 4–10 quiet, past ten settled; 0 (never recorded) is a first open', () => {
    expect(tierForOpens(0)).toBe('full')
    expect(tierForOpens(FAMILIARITY_FULL_MAX_OPENS)).toBe('full')
    expect(tierForOpens(FAMILIARITY_FULL_MAX_OPENS + 1)).toBe('quiet')
    expect(tierForOpens(FAMILIARITY_QUIET_MAX_OPENS)).toBe('quiet')
    expect(tierForOpens(FAMILIARITY_QUIET_MAX_OPENS + 1)).toBe('settled')
  })

  it('counts one per recordOpen under a hashed studio.opens.<hash> key — the path itself never lands in storage', () => {
    const store = fakeStorage()
    const key = opensStorageKey('/Users/someone/clients/acme-claims')
    expect(key.startsWith('studio.opens.')).toBe(true)
    expect(key).not.toContain('acme')
    expect(hashProjectKey('a')).not.toBe(hashProjectKey('b'))
    expect(hashProjectKey('/p')).toBe(hashProjectKey('/p'))
    expect(motion.familiarity('/Users/someone/clients/acme-claims')).toBe('full')
    for (let i = 0; i < 3; i += 1) motion.recordOpen('/Users/someone/clients/acme-claims')
    expect(store.get(key)).toBe('3')
    expect(motion.familiarity('/Users/someone/clients/acme-claims')).toBe('full')
    motion.recordOpen('/Users/someone/clients/acme-claims')
    expect(motion.familiarity('/Users/someone/clients/acme-claims')).toBe('quiet')
    for (let i = 0; i < 7; i += 1) motion.recordOpen('/Users/someone/clients/acme-claims')
    expect(store.get(key)).toBe('11')
    expect(motion.familiarity('/Users/someone/clients/acme-claims')).toBe('settled')
    // Another project is another counter.
    expect(motion.familiarity('/elsewhere')).toBe('full')
  })

  it('resetFamiliarity forgets the counter; garbage and blocked storage read as a first open', () => {
    const store = fakeStorage({ [opensStorageKey('/p')]: 'twelve' })
    expect(motion.familiarity('/p')).toBe('full')
    for (let i = 0; i < 5; i += 1) motion.recordOpen('/p')
    expect(motion.familiarity('/p')).toBe('quiet')
    motion.resetFamiliarity('/p')
    expect(store.has(opensStorageKey('/p'))).toBe(false)
    expect(motion.familiarity('/p')).toBe('full')
    delete g.localStorage
    expect(motion.familiarity('/p')).toBe('full')
    expect(() => motion.recordOpen('/p')).not.toThrow()
  })
})

describe('the disabled stub — end state now, completed timeline back', () => {
  it('to / fromTo / set apply the end state synchronously and strip tween-only keys', () => {
    const o = { x: 0, y: 0, z: 0 }
    const done = vi.fn()
    expect(stubGsap.to(o, { x: 10, duration: 1, ease: 'expo.out', onComplete: done }).progress()).toBe(1)
    expect(o.x).toBe(10)
    expect(done).toHaveBeenCalledTimes(1)
    stubGsap.fromTo(o, { y: -5 }, { y: 7, delay: 2 })
    expect(o.y).toBe(7)
    stubGsap.set(o, { z: 3 })
    expect(o.z).toBe(3)
    expect('duration' in o).toBe(false)
  })

  it('from leaves the object where it is (that IS the end state)', () => {
    const o = { x: 4 }
    stubGsap.from(o, { x: 100, duration: 1 })
    expect(o.x).toBe(4)
  })

  it('timeline chains, runs call() now, records labels, resolves then()', async () => {
    const o = { a: 0, b: 0 }
    const called = vi.fn()
    const tl = stubGsap.timeline()
    expect(tl).toBeInstanceOf(StubTimeline)
    tl.to(o, { a: 1 }).addLabel('spine').call(called).fromTo(o, { b: 0 }, { b: 2 }, 'spine')
    expect([o.a, o.b]).toEqual([1, 2])
    expect(called).toHaveBeenCalledTimes(1)
    expect(tl.labels.spine).toBe(0)
    expect(tl.progress()).toBe(1)
    const seen = vi.fn()
    await tl.then(seen)
    expect(seen).toHaveBeenCalledWith(tl)
  })
})
