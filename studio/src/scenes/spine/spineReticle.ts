// The viewing reticle (studio-upgrade-2 I3), as pure numbers so a node test can check them: a
// thin `accent-500` ring around the station whose home is OPEN — `SceneDataSpine.viewedStageId`,
// which the host writes (StageHome) and this scene only reads. It is not the plugin's "now"
// (`currentStageId`, the breathing core) and never says so: no `aria-current`, no `kind="now"`.
// On a change it slides along the rail over `RETICLE_SLIDE_S` and the camera yaws toward it by at
// most `RETICLE_YAW_MAX` rad — a glance, not a follow. Null (Closing, or no stage open) → no ring.
import type { SceneDataSpine } from '../core/types'
import { RING_RADIUS, RING_TUBE } from './spineModel'

/** The ring sits just outside the station's own ring: `RING_RADIUS + 0.09`, tube .012. */
export const RETICLE_RADIUS = RING_RADIUS + 0.09
export const RETICLE_TUBE = 0.012
export const RETICLE_SLIDE_S = 0.32
/** The camera's yaw toward the viewed station is capped here (radians). */
export const RETICLE_YAW_MAX = 0.06

/** The figcaption sentence added while a stage is being viewed. */
export const SPINE_RETICLE_LEGEND = 'The accent ring marks the stage you are viewing.'

/** The station INDEX the reticle rings, or null: `viewedStageId` absent, null, or not a station
 * (Closing passes null; a stage the plugin does not list reads as none). */
export function reticleIndex(data: Pick<SceneDataSpine, 'stations' | 'viewedStageId'>): number | null {
  const id = data.viewedStageId
  if (id === null || id === undefined) return null
  const station = data.stations.find((s) => s.id === id)
  return station ? station.index : null
}

/** Camera yaw for a reticle at station `index` of `n`: proportional to the station's offset from
 * the rail's centre, clamped to ±`RETICLE_YAW_MAX`. A reticle at the middle yaws nothing; none
 * yaws nothing. The sign follows the parallax convention (a station on the right swings the
 * camera right, negative theta). */
export function reticleYaw(index: number | null, n: number): number {
  if (index === null || n <= 1) return 0
  const t = (index / (n - 1)) * 2 - 1
  const yaw = -Math.max(-1, Math.min(1, t)) * RETICLE_YAW_MAX
  return yaw === 0 ? 0 : yaw
}

/** Sanity for the pin: the reticle clears the ring it surrounds. */
export const RETICLE_CLEARANCE = RETICLE_RADIUS - RETICLE_TUBE - (RING_RADIUS + RING_TUBE)
