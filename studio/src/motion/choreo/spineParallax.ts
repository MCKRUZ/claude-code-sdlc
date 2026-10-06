// Row #19 — Spine parallax. Pointer position over the band becomes camera yaw / pitch within
// ±0.08 rad. The scene keeps the `{ yaw, pitch }` object and calls `play` per pointer move;
// `overwrite: 'auto'` makes each call retarget the tween in flight. Reduced / off: fixed camera.
import type { Choreo } from '../contract'
import { timelineFor, transformsAllowed } from './_shared'

export const PARALLAX_MAX_RAD = 0.08

export interface SpineParallaxRefs {
  camera: { yaw: number; pitch: number }
  /** Pointer position normalised to −1..1 across the band. */
  nx: number
  ny: number
  onUpdate?: () => void
}

export const spineParallax: Choreo<SpineParallaxRefs> = {
  name: 'spineParallax',
  play(ctx, refs) {
    const tl = timelineFor(ctx)
    if (!transformsAllowed(ctx)) return tl
    const clamp = (v: number) => Math.max(-1, Math.min(1, v)) * PARALLAX_MAX_RAD
    return tl.to(refs.camera, {
      yaw: clamp(refs.nx),
      pitch: clamp(refs.ny),
      duration: 0.3,
      ease: ctx.eases['dur-1'],
      overwrite: 'auto',
      onUpdate: refs.onUpdate,
    })
  },
}
