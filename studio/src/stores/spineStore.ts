// `{ hover: stageId | null }` shared between the sidebar and the Lifecycle Spine
// (studio-observatory.md §5.0 `spineStore`, shape in `./contract.ts`).
//
// Hovering a sidebar row should light the matching station in the Spine so a person's spatial
// memory of "where Phase 3 is" works in both places — but the sidebar's markup is pinned by tests
// and the two components share no parent that could hold the state. A module store with
// `useSyncExternalStore` lets the sidebar write and the Spine read without either knowing where
// the other is mounted, and without any IPC: it is hover state, nothing more.
import { useSyncExternalStore } from 'react'
import type { SpineSnapshot, SpineStore } from './contract'

type Listener = () => void

let snapshot: SpineSnapshot = { hover: null }
const listeners = new Set<Listener>()

function getSnapshot(): SpineSnapshot {
  return snapshot
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function setHover(stageId: string | null): void {
  // Same id → same snapshot reference, so React does not re-render every subscriber on the
  // repeated `mouseenter` a sidebar row fires while the pointer lingers on it.
  if (snapshot.hover === stageId) return
  snapshot = { hover: stageId }
  for (const listener of Array.from(listeners)) listener()
}

export const spineStore: SpineStore = {
  getSnapshot,
  subscribe,
  get hover() {
    return snapshot.hover
  },
  setHover,
}

/** The hovered stage id, re-rendering the caller when it changes. SSR-safe: the server snapshot
 * is the same object, so `renderToStaticMarkup` sees `null`. */
export function useSpineHover(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).hover
}

/** For tests: back to "nothing hovered". */
export function resetSpineStore(): void {
  setHover(null)
}
