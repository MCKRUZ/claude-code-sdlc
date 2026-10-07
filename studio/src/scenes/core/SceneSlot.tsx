// Where a screen says "a scene goes here" without importing one (studio-observatory.md §5.0,
// §11 Wave 1). Looks the id up in `sceneRegistry`; renders the registered lazy component, or
// nothing when none is registered — so a screen can ship its slot before the scene exists and
// the page is byte-identical to before until Wave 3 fills the map.
//
// `hoverId` / `onHover` / `live` are optional at the slot: a screen that has no reason to share
// hover state gets a local one, and `live` defaults to false (an idle scene renders zero frames).
import { Suspense, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { getScene } from './sceneRegistry'
import type { SceneId, SceneSlotProps } from './types'

type Managed = 'hoverId' | 'onHover' | 'live'

/** What a host may say about its scene beyond the data: the body height (the Spine's 168 / 120 /
 * 200 per density and screen), a class on the figure, and — for the constellation — the DOM table
 * of equal rank it already renders. Passed through untouched; a scene that has no use for one
 * ignores it. */
export interface SceneHostExtras {
  height?: number
  className?: string
  table?: ReactNode
  /** Passed through to `SceneShell`: a host control in the figure's header row, and whether the
   * Graph / Table toggle is drawn at all. */
  headerExtra?: ReactNode
  showToggle?: boolean
}

export type SceneSlotHostProps<Id extends SceneId> = Omit<SceneSlotProps<Id>, Managed> &
  Partial<Pick<SceneSlotProps<Id>, Managed>> &
  SceneHostExtras

export function SceneSlot<Id extends SceneId>(props: SceneSlotHostProps<Id>) {
  const [localHover, setLocalHover] = useState<string | null>(null)
  const registered = getScene(props.id)
  if (!registered) return null

  // The registry stores every scene under the widest prop type; this id's component is the one
  // registered for exactly this id, so narrowing back is sound.
  const Scene = registered as unknown as ComponentType<SceneSlotProps<Id> & SceneHostExtras>
  const sceneProps: SceneSlotProps<Id> & SceneHostExtras = {
    ...props,
    hoverId: props.hoverId ?? localHover,
    onHover: props.onHover ?? setLocalHover,
    live: props.live ?? false,
  }
  return (
    <Suspense fallback={null}>
      <Scene {...sceneProps} />
    </Suspense>
  )
}
