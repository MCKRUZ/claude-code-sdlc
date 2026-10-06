// Three tiny contexts that cross the Canvas boundary without either side importing three at
// runtime (R3F bridges React context into the Canvas, so a provider outside is readable inside).
//
// `CanvasActivityContext`: SceneShell knows whether its figure is on screen and whether the
// document is visible; the demand loop inside the Canvas needs that answer to render zero frames
// when nobody can see them. The shell writes the value, `useDemandLoop` reads it.
//
// `PlateLayerContext`: the plates are real DOM buttons that must sit OUTSIDE the `aria-hidden`
// canvas wrapper, yet their positions come from the camera inside the Canvas. CanvasHost owns one
// `PlateStore` per Canvas and publishes it here; the in-canvas `Plates` writes anchors into it
// and the DOM `PlateLayer` beside the canvas renders from it.
//
// `PlateInteractionContext`: `SceneShellProps` carries no hover or activate callbacks (they are
// `SceneSlotProps`, one level up), so a scene wraps its `<SceneShell>` in `PlateInteraction` and
// CanvasHost reads the callbacks here to wire the plate buttons.
import { createContext } from 'react'
import type { PlateStore } from './projectLabels'

/** True while the figure is both visible in the document and intersecting the viewport. */
export const CanvasActivityContext = createContext<boolean>(true)

/** The plate store for the enclosing Canvas, or null outside one. */
export const PlateLayerContext = createContext<PlateStore | null>(null)

export interface PlateInteraction {
  hoverId: string | null
  onHover: (id: string | null) => void
  onActivate: (id: string) => void
}

const noop = () => {}

export const INERT_PLATE_INTERACTION: PlateInteraction = { hoverId: null, onHover: noop, onActivate: noop }

export const PlateInteractionContext = createContext<PlateInteraction>(INERT_PLATE_INTERACTION)

/** Provide around a `<SceneShell>` so its plates share the scene's hover id and open handler. */
export const PlateInteractionProvider = PlateInteractionContext.Provider
