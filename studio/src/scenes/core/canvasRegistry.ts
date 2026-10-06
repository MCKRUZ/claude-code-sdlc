// One live Canvas at a time (studio-observatory.md §5.0 `SceneShell` guards).
//
// Electron caps a renderer at sixteen WebGL contexts and silently loses the oldest when the cap
// is hit — so two scenes both drawing would, after enough navigation, start losing contexts
// nobody asked to lose. The rule is simpler than reference counting: whichever SceneShell most
// recently decided to show its graph holds the single slot, and the previous holder is told to
// step down to its table. When the holder unmounts it releases the slot and anyone waiting is
// told so they may claim it again.
//
// This is a module store, not React state, because the two shells involved can live anywhere in
// the tree (StageHome's Spine above the Sprint screen's constellation, for instance).

type Evicted = () => void
type Listener = () => void

interface Holder {
  token: symbol
  onEvicted: Evicted
}

let holder: Holder | null = null
const waiters = new Set<Listener>()

/** Take the single live-canvas slot. If someone else holds it their `onEvicted` runs first.
 * Returns the release function; releasing a slot you no longer hold is a no-op. */
export function claimCanvas(onEvicted: Evicted): () => void {
  const token = Symbol('canvas')
  const previous = holder
  holder = { token, onEvicted }
  if (previous) previous.onEvicted()
  return () => {
    if (holder?.token !== token) return
    holder = null
    for (const listener of Array.from(waiters)) listener()
  }
}

export function isCanvasHeld(): boolean {
  return holder !== null
}

/** Be told when the slot frees up (so an evicted shell may claim it back). */
export function onCanvasReleased(listener: Listener): () => void {
  waiters.add(listener)
  return () => {
    waiters.delete(listener)
  }
}

/** For tests: drop the holder without running its eviction callback. */
export function resetCanvasRegistry(): void {
  holder = null
  waiters.clear()
}
