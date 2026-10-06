// Who is mid-edit (studio-observatory.md §6.2 Esc row [MF]). Esc's last layer is "back", and
// back must never throw away a FieldEditor draft, a hand-off form with text, an open AI proposal
// or a pending combined clash draft — but those live in screens App does not own, so each
// registers a predicate here while it holds unsaved work, and App's Esc handler asks `anyDirty()`.
//
// A module store rather than React state on purpose: a draft's existence is a fact the screen
// knows, not something App should re-render over, and the predicate is read at keypress time, so
// the registration never has to be refreshed on every keystroke. No IPC: nothing here touches
// `window.studio` (test/noNewIpcInRenderer.test.ts greps this folder).
import { useEffect, useId, useRef } from 'react'

const sources = new Map<string, () => boolean>()

export const dirtyStore = {
  /** Register a predicate under `id`; registering the same id again replaces it. Returns the
   * unregister — call it on unmount or once the draft is saved / discarded. */
  register(id: string, isDirty: () => boolean): () => void {
    sources.set(id, isDirty)
    return () => {
      // Only forget our own registration: a later re-register under the same id must survive an
      // earlier unregister that fires out of order (StrictMode double-invokes effects).
      if (sources.get(id) === isDirty) sources.delete(id)
    }
  },

  /** True while any registered source reports unsaved work. A predicate that throws counts as
   * dirty — losing a draft is the worse failure. */
  anyDirty(): boolean {
    for (const isDirty of sources.values()) {
      try {
        if (isDirty()) return true
      } catch {
        return true
      }
    }
    return false
  },

  /** For tests. */
  reset(): void {
    sources.clear()
  },

  get size(): number {
    return sources.size
  },
}

/** The component-side half: registers once per mount under a stable id and reads the LATEST
 * predicate through a ref, so a component passes `() => draft !== null` inline and never has to
 * memoise it. */
export function useRegisterDirty(isDirty: () => boolean): void {
  const id = useId()
  const latest = useRef(isDirty)
  latest.current = isDirty
  useEffect(() => dirtyStore.register(id, () => latest.current()), [id])
}
