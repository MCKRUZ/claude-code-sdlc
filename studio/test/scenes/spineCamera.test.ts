/** The Spine's camera (studio-observatory.md §5.1 "Camera") as a promise: nine stations fit the
 * band's width, with margin, at every height the hosts use (120 / 168 / 200) and every width the
 * graph is allowed (640 … 1400); the rail lands at a fixed fraction of the height so the captions
 * above and the plates below have room; and the distance stays inside its clamps. Pure numbers. */

import { describe, expect, it } from 'vitest'
import {
  CAMERA_FOV, DISTANCE_MAX, DISTANCE_MIN, FIT_MARGIN, RAIL_FRACTION, railHalfWidth, spineDistance, spinePose,
} from '../../src/scenes/spine/spineCamera'

const halfTan = Math.tan((CAMERA_FOV * Math.PI) / 360)

describe('spineDistance', () => {
  it('frames the whole rail with margin at every band size, within the clamps', () => {
    for (const height of [120, 168, 200]) {
      for (const width of [640, 724, 900, 1100, 1400]) {
        const aspect = width / height
        const d = spineDistance(9, aspect)
        expect(d).toBeGreaterThanOrEqual(DISTANCE_MIN)
        expect(d).toBeLessThanOrEqual(DISTANCE_MAX)
        // Half the view width at that distance covers the rail's half width plus the margin,
        // unless the clamp floor is in force (a very wide band), where the rail is simply centred.
        const halfViewWidth = d * halfTan * aspect
        if (d > DISTANCE_MIN) expect(halfViewWidth).toBeGreaterThanOrEqual(railHalfWidth(9) * FIT_MARGIN - 1e-6)
        else expect(halfViewWidth).toBeGreaterThanOrEqual(railHalfWidth(9))
      }
    }
  })

  it('backs off for a narrower band and comes closer for a wider one', () => {
    expect(spineDistance(9, 640 / 168)).toBeGreaterThan(spineDistance(9, 1400 / 168))
  })
})

describe('spinePose', () => {
  it('puts the rail at RAIL_FRACTION of the height by looking below it', () => {
    const pose = spinePose(9, 724, 168)
    const viewHeight = 2 * pose.distance * halfTan
    // Target y is negative: the camera looks below the rail so the rail rises in the frame.
    expect(pose.target[1]).toBeCloseTo(-(0.5 - RAIL_FRACTION) * viewHeight)
    expect(pose.unitsPerPx).toBeCloseTo(viewHeight / 168)
  })
})
