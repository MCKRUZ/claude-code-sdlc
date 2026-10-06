// The Spine's camera pose as pure numbers (studio-observatory.md §5.1 "Camera"), so a node test
// can check that nine stations fit a 640-wide, 120-high band as well as a 1400 × 200 one. The
// scene recomputes this every frame from the canvas size — a fixed z framed the rail into about
// three quarters of the width and piled the plates (observatory v2 critique, shots 2–4).
//
// No three import: the hooks file turns the numbers into a Vector3.
import { STATION_PITCH } from './spineModel'

export const CAMERA_FOV = 24
/** Room beyond the outermost rings: a ring's radius, its halo, and a little air. */
export const RAIL_END_PADDING = 0.7
/** 12 % margin on the width, the same figure the constellation uses. */
export const FIT_MARGIN = 1.12
/** The camera never comes closer than this (a wide band would otherwise blow the rings up) nor
 * further than this (a narrow one would shrink them to dots). */
export const DISTANCE_MIN = 5.2
export const DISTANCE_MAX = 16
/** Where the rail sits vertically: this fraction of the band from the top. The plates are two
 * level rows (`spineBands.ts`): the upper one needs the caption row, a gap, a plate and the
 * clearance above the highest disc; the lower one a clearance and a plate below the lowest. At
 * 168 px that budget balances with the rail a little below the middle (v4 critique: at .45 the
 * upper plates sat in the caption row). */
export const RAIL_FRACTION = 0.58
/** Elevation of the camera above the rail plane, from the original (0, 2.1, 8.6) pose. */
export const ELEVATION = Math.atan2(2.1, 8.6)

/** Round 2 (I4): on the Closing ledger the camera OPENS 8 % further back and settles to the fit
 * over 900 ms on first data, then is still. A factor on the fitted distance; 1 is the fit. */
export const LEDGER_BACK = 1.08
export const LEDGER_SETTLE_S = 0.9

export interface SpinePose {
  distance: number
  /** Look-at point; x is the rail's centre, y is BELOW the rail so the rail lands at
   * `RAIL_FRACTION` of the band's height. */
  target: [number, number, number]
  /** World units per CSS pixel of band height, at the target depth. */
  unitsPerPx: number
}

export function railHalfWidth(stationCount: number): number {
  return (Math.max(stationCount, 1) - 1) * STATION_PITCH / 2 + RAIL_END_PADDING
}

/** Distance at which the rail's full width fits `aspect` (width / height) with the margin. */
export function spineDistance(stationCount: number, aspect: number): number {
  const halfTan = Math.tan((CAMERA_FOV * Math.PI) / 360)
  const raw = (railHalfWidth(stationCount) * FIT_MARGIN) / (halfTan * Math.max(aspect, 1e-3))
  return Math.min(DISTANCE_MAX, Math.max(DISTANCE_MIN, raw))
}

export function spinePose(stationCount: number, width: number, height: number, back = 1): SpinePose {
  const aspect = height > 0 ? width / Math.max(height, 1) : 1
  const distance = spineDistance(stationCount, aspect) * back
  const viewHeight = 2 * distance * Math.tan((CAMERA_FOV * Math.PI) / 360)
  // The target is the band's centre; the rail wants to be RAIL_FRACTION from the top, so the
  // target sits (0.5 − RAIL_FRACTION) of the view height below the rail.
  const targetY = -(0.5 - RAIL_FRACTION) * viewHeight
  return { distance, target: [0, targetY, 0], unitsPerPx: height > 0 ? viewHeight / height : 0 }
}
