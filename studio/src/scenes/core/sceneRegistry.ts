// Which component renders each `SceneId` (studio-observatory.md §5.0, §11 Wave 3).
//
// The map starts EMPTY on purpose. Screens (Wave 1) mount a `<SceneSlot id="spine"/>` where a
// scene will live, and the scenes themselves (Wave 2) are registered here by Wave 3 as lazy
// components — so a screen never imports a scene module, and until a scene is registered the slot
// renders nothing at all. `React.lazy` keeps each scene (and the three/fiber chunk under it) out
// of the main bundle until its first mount.
import type { ComponentType, LazyExoticComponent } from 'react'
import { lazy } from 'react'
import type { SceneId, SceneSlotProps } from './types'

/** A registered scene: the lazy component for one id. The props are intentionally loose at the
 * map level (TypeScript cannot key a `Map` value's type by its key); `registerScene` is the typed
 * door, and `SceneSlot` narrows on the way out. */
export type RegisteredScene = LazyExoticComponent<ComponentType<SceneSlotProps<SceneId>>>

export const sceneRegistry = new Map<SceneId, RegisteredScene>()

/** Register the loader for one scene id. `load` is a dynamic `import()` of a module whose
 * default export takes `SceneSlotProps<Id>`. Registering the same id twice replaces the earlier
 * entry (hot reload in dev; never expected in production). */
export function registerScene<Id extends SceneId>(
  id: Id,
  load: () => Promise<{ default: ComponentType<SceneSlotProps<Id>> }>,
): void {
  // The cast is the one place the per-id prop type is widened to the map's common type; the
  // slot narrows it back when rendering for that same id.
  sceneRegistry.set(id, lazy(load) as unknown as RegisteredScene)
}

export function getScene(id: SceneId): RegisteredScene | undefined {
  return sceneRegistry.get(id)
}

/** For tests: forget every registration. */
export function clearSceneRegistry(): void {
  sceneRegistry.clear()
}
