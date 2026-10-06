// Can this renderer draw with WebGL at all? (studio-observatory.md §5.0 `webgl.ts`.)
//
// The answer is probed ONCE, by asking a throwaway canvas for a context, because the probe is
// not free (it allocates a GL context, and Electron caps a renderer at sixteen) and the answer
// does not change on its own. It can change in two ways we must honour: the GPU process may take
// the context away (`webglcontextlost`, observed by CanvasHost), after which we show the table
// rather than a blank box; and it may hand it back (`webglcontextrestored`), after which we are
// allowed to probe again. Both flip a module flag and notify subscribers so every SceneShell
// re-renders to the right surface.
//
// No environment variable is consulted: the renderer runs sandboxed with contextIsolation, so a
// process env var cannot reach this code — the only truthful source is the browser itself. In
// jsdom `getContext` returns null, so this reads false and no scene ever imports three there.

type Listener = () => void

let probed: boolean | null = null
let lost = false
const listeners = new Set<Listener>()

function probe(): boolean {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return false
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    return gl !== null && gl !== undefined
  } catch {
    return false
  }
}

/** True when a WebGL context can be created and none has been lost since. Memoised. */
export function canUseWebGL(): boolean {
  if (lost) return false
  if (probed === null) probed = probe()
  return probed
}

function notify(): void {
  for (const listener of Array.from(listeners)) listener()
}

/** Called by CanvasHost on `webglcontextlost`. Every shell falls back to its table. */
export function markWebGLLost(): void {
  if (lost) return
  lost = true
  notify()
}

/** Called by CanvasHost on `webglcontextrestored`. Clears the memo so the next `canUseWebGL()`
 * probes afresh — the GPU that gave the context back may still refuse a new one. */
export function markWebGLRestored(): void {
  if (!lost && probed === null) return
  lost = false
  probed = null
  notify()
}

/** Subscribe to lost / restored transitions. Shaped for `useSyncExternalStore`. */
export function onWebGLChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
