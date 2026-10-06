// @vitest-environment jsdom
/** "In the room" (togo-command-center.md §3.1): the lit roster person, shared between the room's
 * chips and the lane cards. Hover state only: same person → same snapshot reference; a blank is
 * nobody; `useIsLit` compares through `identity.samePerson`. */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetRoomStore, roomStore, useIsLit, useRoomLit } from '../../src/stores/roomStore'

beforeEach(() => resetRoomStore())

describe('roomStore', () => {
  it('starts with nobody lit', () => {
    expect(roomStore.getSnapshot()).toEqual({ litHandle: null })
    expect(roomStore.litHandle).toBeNull()
  })

  it('lights a person, notifies once per change, and keeps the reference while the same person stays lit', () => {
    const listener = vi.fn()
    const off = roomStore.subscribe(listener)
    roomStore.setLit('@sam')
    const snap = roomStore.getSnapshot()
    expect(snap.litHandle).toBe('@sam')
    expect(listener).toHaveBeenCalledTimes(1)
    roomStore.setLit('sam') // the same person in another spelling
    expect(roomStore.getSnapshot()).toBe(snap)
    expect(listener).toHaveBeenCalledTimes(1)
    roomStore.setLit('@priya')
    expect(listener).toHaveBeenCalledTimes(2)
    off()
    roomStore.setLit(null)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(roomStore.litHandle).toBeNull()
  })

  it('a blank handle is nobody', () => {
    roomStore.setLit('   ')
    expect(roomStore.litHandle).toBeNull()
  })

  it('useRoomLit / useIsLit re-render with the store and compare as one person', () => {
    const lit = renderHook(() => useRoomLit())
    const sam = renderHook(() => useIsLit('sam'))
    const priya = renderHook(() => useIsLit('@priya'))
    expect(lit.result.current).toBeNull()
    expect(sam.result.current).toBe(false)
    act(() => roomStore.setLit('@Sam'))
    expect(lit.result.current).toBe('@Sam')
    expect(sam.result.current).toBe(true)
    expect(priya.result.current).toBe(false)
    act(() => resetRoomStore())
    expect(sam.result.current).toBe(false)
  })
})
