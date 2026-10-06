// The one dynamic import of the scene chunk, kept in its own module so a test can replace it.
//
// `SceneShell` must never cause three.js to load in jsdom or in a `--mode=test` build unless a
// test toggles the graph on purpose. The proof is `sceneShell.test`, which mocks THIS module and
// asserts the factory was never called — a spy on a module seam, rather than a guess from bundle
// contents. Nothing else in `src/scenes/core` statically imports `./CanvasHost`.
export function loadCanvasHost() {
  return import('./CanvasHost')
}

const MODE: string = import.meta.env.MODE

/** Round 2 (I8): warm the scene chunk before anyone toggles to Graph — on hover of the toggle,
 * on idle after a screen settles — so the first canvas mounts without the chunk's round trip.
 * Guarded: a no-op under `MODE === 'test'` (the sceneShell pin that no chunk is requested unless
 * a test asks for the graph still holds) and after the first call. Errors are swallowed: a
 * prefetch that fails simply leaves the real `lazy()` to try again. */
let prefetched = false
export function prefetchCanvasHost(): boolean {
  if (MODE === 'test' || prefetched) return false
  prefetched = true
  loadCanvasHost().catch(() => { prefetched = false })
  return true
}

/** For tests. */
export function resetCanvasPrefetch(): void {
  prefetched = false
}
