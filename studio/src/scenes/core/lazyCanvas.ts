// The one dynamic import of the scene chunk, kept in its own module so a test can replace it.
//
// `SceneShell` must never cause three.js to load in jsdom or in a `--mode=test` build unless a
// test toggles the graph on purpose. The proof is `sceneShell.test`, which mocks THIS module and
// asserts the factory was never called — a spy on a module seam, rather than a guess from bundle
// contents. Nothing else in `src/scenes/core` statically imports `./CanvasHost`.
export function loadCanvasHost() {
  return import('./CanvasHost')
}
