// "In the room" (togo-command-center.md §3.1): which roster person is lit. The room's chips and
// the lane cards share no parent that could hold the hover, so — exactly as `spineStore` does for
// the sidebar and the Spine — a module store lets the room write and the cards read. Hover /
// focus state only: it never filters, never counts, never reaches `window.studio`.
import { useSyncExternalStore } from 'react'
import { samePerson } from '../../shared/identity'
import type { RoomSnapshot, RoomStore } from './contract'

type Listener = () => void

const EMPTY: RoomSnapshot = { litHandle: null }
let snapshot: RoomSnapshot = EMPTY
const listeners = new Set<Listener>()

function getSnapshot(): RoomSnapshot {
  return snapshot
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function setLit(handle: string | null): void {
  const next = handle && handle.trim() ? handle : null
  // Same person → same snapshot reference, so a lingering pointer re-renders nobody.
  if (snapshot.litHandle === next || (next !== null && samePerson(snapshot.litHandle, next))) return
  snapshot = next === null ? EMPTY : { litHandle: next }
  for (const listener of Array.from(listeners)) listener()
}

export const roomStore: RoomStore = {
  getSnapshot,
  subscribe,
  get litHandle() {
    return snapshot.litHandle
  },
  setLit,
}

/** The lit handle, re-rendering the caller when it changes. SSR-safe (same object as server snapshot). */
export function useRoomLit(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).litHandle
}

/** True when `handle` is the lit person — the `data-lit` predicate for a card or a row. */
export function useIsLit(handle: string | null | undefined): boolean {
  const lit = useRoomLit()
  return samePerson(lit, handle)
}

/** For tests: back to "nobody lit". */
export function resetRoomStore(): void {
  setLit(null)
}
