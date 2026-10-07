// @vitest-environment jsdom
/** The dirty registry Esc-as-back consults (studio-observatory.md §6.2). A predicate is read at
 * ask time, a re-registration under the same id replaces the old one, an out-of-order unregister
 * cannot forget a newer registration, and a predicate that throws is treated as dirty — the
 * failure mode where a draft is lost is the one this store exists to prevent. The hook half
 * registers once per mount and always sees the latest closure without re-registering. */
import { act, render } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { dirtyStore, useRegisterDirty } from '../../src/stores/dirtyStore'

afterEach(() => {
  dirtyStore.reset()
})

describe('dirtyStore', () => {
  it('is clean with no registrations, and reads each predicate at ask time', () => {
    expect(dirtyStore.anyDirty()).toBe(false)
    let dirty = false
    const off = dirtyStore.register('a', () => dirty)
    expect(dirtyStore.anyDirty()).toBe(false)
    dirty = true
    expect(dirtyStore.anyDirty()).toBe(true)
    off()
    expect(dirtyStore.anyDirty()).toBe(false)
    expect(dirtyStore.size).toBe(0)
  })

  it('any one dirty source makes the whole store dirty', () => {
    dirtyStore.register('clean', () => false)
    dirtyStore.register('dirty', () => true)
    expect(dirtyStore.anyDirty()).toBe(true)
  })

  it('re-registering an id replaces the predicate, and a stale unregister cannot remove the newer one', () => {
    const offOld = dirtyStore.register('x', () => true)
    dirtyStore.register('x', () => false)
    expect(dirtyStore.size).toBe(1)
    expect(dirtyStore.anyDirty()).toBe(false)
    offOld() // the StrictMode double-invoke shape: the first effect's cleanup runs after the second registered
    expect(dirtyStore.size).toBe(1)
  })

  it('a predicate that throws counts as dirty', () => {
    dirtyStore.register('broken', () => { throw new Error('no') })
    expect(dirtyStore.anyDirty()).toBe(true)
  })
})

describe('useRegisterDirty', () => {
  function Editor({ probe }: { probe: { setDraft?: (v: string | null) => void } }) {
    const [draft, setDraft] = useState<string | null>(null)
    probe.setDraft = setDraft
    useRegisterDirty(() => draft !== null)
    return null
  }

  it('registers on mount, sees the latest state without re-registering, and unregisters on unmount', () => {
    const probe: { setDraft?: (v: string | null) => void } = {}
    const { unmount } = render(<Editor probe={probe} />)
    expect(dirtyStore.size).toBe(1)
    expect(dirtyStore.anyDirty()).toBe(false)
    act(() => probe.setDraft!('a draft'))
    expect(dirtyStore.size).toBe(1)
    expect(dirtyStore.anyDirty()).toBe(true)
    act(() => probe.setDraft!(null))
    expect(dirtyStore.anyDirty()).toBe(false)
    unmount()
    expect(dirtyStore.size).toBe(0)
  })
})
