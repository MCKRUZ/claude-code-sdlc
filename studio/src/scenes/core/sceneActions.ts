// The graph's screen-level commands, as a module store (studio-upgrade-2 I6): the mounted
// Dependency Constellation registers "fit the graph" and "focus next up"; the command palette's
// host reads them as plain callbacks (`useSceneActions`) and spreads them into its actions, so the
// two palette rows appear only while a graph is on screen and run ZERO `window.studio` calls —
// they move a camera and a focus ring, nothing more. Same shape as `spineStore`: no React parent
// joins the figure and the palette, so a store with `useSyncExternalStore` does.
import { useSyncExternalStore } from 'react'

export interface SceneActions {
  /** Return the camera to the fitted home pose (double-click / `Home`). */
  fitGraph: () => void
  /** Move focus to the plate the plugin named next up; false when there is none. */
  focusNextUp: () => boolean
}

type Listener = () => void

let current: SceneActions | null = null
const listeners = new Set<Listener>()

function notify(): void {
  for (const l of Array.from(listeners)) l()
}

/** Called by the mounted figure; returns the unregister. The latest registration wins (one live
 * graph at a time, the canvas registry sees to that). */
export function registerSceneActions(actions: SceneActions): () => void {
  current = actions
  notify()
  return () => {
    if (current === actions) {
      current = null
      notify()
    }
  }
}

export function getSceneActions(): SceneActions | null {
  return current
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const none = () => null

/** The registered actions, or null while no graph is on screen. SSR-safe. */
export function useSceneActions(): SceneActions | null {
  return useSyncExternalStore(subscribe, getSceneActions, none)
}

/** For tests. */
export function resetSceneActions(): void {
  current = null
  notify()
}
