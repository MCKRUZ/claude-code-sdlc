// A module-level stash for shared-element Flips across screens (§4.1 `flipStore`, catalogue row
// #8): the Board row with `data-flip-id="spec:0008"` records its `Flip.getState` and the element
// that opened the detail; the detail's title block `take`s it and Flips from there. The stash is
// keyed by the flip id, lives outside React because the two screens never mount together, and
// an entry is taken exactly once — a second `take` returns undefined so a stale state from a
// previous visit can never animate a fresh screen from the wrong place.
import type { Flip } from 'gsap/Flip'

export interface StashedFlip {
  state: Flip.FlipState
  /** The element that triggered the navigation — focus returns to it on Back. */
  opener: HTMLElement | null
  stashedAt: number
}

/** Older than this and the state describes a layout that is no longer on screen. */
export const STASH_TTL_MS = 5000

const stash = new Map<string, StashedFlip>()

export const flipStore = {
  stash(id: string, state: Flip.FlipState, opener: HTMLElement | null = null, now: number = Date.now()): void {
    stash.set(id, { state, opener, stashedAt: now })
  },

  /** Removes and returns the entry; undefined when nothing (or only an expired entry) is held. */
  take(id: string, now: number = Date.now()): StashedFlip | undefined {
    const entry = stash.get(id)
    stash.delete(id)
    if (!entry) return undefined
    return now - entry.stashedAt > STASH_TTL_MS ? undefined : entry
  },

  has(id: string): boolean {
    return stash.has(id)
  },

  clear(): void {
    stash.clear()
  },

  get size(): number {
    return stash.size
  },
}
