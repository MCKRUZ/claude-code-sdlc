// The one place the scene ids meet their modules (studio-observatory.md §5.0, §11 Wave 3).
//
// `main.tsx` imports this file for its side effect, once, before React mounts. Every entry is a
// dynamic `import()` handed to `registerScene` (which wraps it in `React.lazy`), so importing this
// module costs nothing: no scene code, and none of three/fiber under it, is evaluated until a
// `<SceneSlot>` for that id actually renders. `test/scenes/registerAll.test.tsx` pins both facts —
// the four ids are registered, and no factory has run at import time.
//
// Screens never import a scene module; they render `<SceneSlot id="…">` and the registry resolves
// it. That is what keeps the main bundle free of `WebGLRenderer` (test/bundleSize.test.ts).
import { registerScene } from './core/sceneRegistry'

registerScene('spine', () => import('./spine/LifecycleSpine'))
// One module serves both constellation ids: the Sprint and the Board are two hosts of one scene.
registerScene('constellation-sprint', () => import('./constellation/DependencyConstellation'))
registerScene('constellation-board', () => import('./constellation/DependencyConstellation'))
registerScene('ambient', () => import('./ambient/AmbientField'))
