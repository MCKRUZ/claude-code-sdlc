// How the sign-off ceremony reaches the Spine (studio-observatory.md §4.2 row 10, §5.1).
//
// `signOffCeremony` adds a `"spine"` label and calls `refs.onSpine` there; the screen that plays
// the ceremony does not hold the scene (it is lazy, behind `SceneSlot`), so this module is the
// meeting point: the mounted scene registers a handler, the ceremony calls `playSpineCeremony`.
// No three import — safe to import from the main bundle. When no scene is mounted (table surface,
// no WebGL) the call is a no-op and returns false; the data change still updates the rail on the
// next render, so nothing depends on this hook firing.
export type SpineCeremonyHandler = (stageId: string | null) => void

const handlers = new Set<SpineCeremonyHandler>()

/** Called by the mounted scene; returns the unsubscribe. */
export function onSpineCeremony(handler: SpineCeremonyHandler): () => void {
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}

/** Advance the lit rail to the newly signed station and bloom its halo. `stageId` is the stage
 * that was just signed (null → "whatever the data now says"). True when a scene heard it. */
export function playSpineCeremony(stageId: string | null = null): boolean {
  if (handlers.size === 0) return false
  for (const handler of Array.from(handlers)) handler(stageId)
  return true
}

/** For tests. */
export function resetSpineCeremony(): void {
  handlers.clear()
}
