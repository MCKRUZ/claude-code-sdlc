// Row #10 — Sign-off ceremony. Trigger: `signOffStage` returned `ok` AND the refreshed
// `ProjectStatus` arrived — both facts real before a frame moves. One labelled timeline; the
// Spine scene joins at the `"spine"` label. The tick is a `strokeDashoffset` tween on an inline
// SVG path (no MorphSVG: the button has no icon to morph). The toast and the live announcement
// are the caller's and happen whether or not motion is on.
import { Flip } from 'gsap/Flip'
import type { Choreo } from '../contract'
import { POP } from '../presets'
import { timelineFor, transformsAllowed } from './_shared'

export const CEREMONY_SPINE_LABEL = 'spine'

export interface SignOffCeremonyRefs {
  overlay?: Element | null
  tickPath?: SVGPathElement | null
  successCard?: Element | null
  signedNode?: Element | null
  connector?: Element | null
  nextRing?: Element | null
  nowState?: Flip.FlipState | null
  nowBadge?: Element | null
  bar?: Element | null
  fromFraction?: number | null
  toFraction?: number
  /** Called at the `"spine"` label with the timeline, so the scene adds its halo + `uLit` step. */
  onSpine?: () => void
}

export const signOffCeremony: Choreo<SignOffCeremonyRefs> = {
  name: 'signOffCeremony',
  play(ctx, refs) {
    const tl = timelineFor(ctx, { defaults: { ease: ctx.eases['dur-5'] } })
    const move = transformsAllowed(ctx)
    if (refs.overlay) tl.to(refs.overlay, { opacity: 0, duration: ctx.durations['dur-1'] }, 0)
    if (refs.tickPath) {
      const length = typeof refs.tickPath.getTotalLength === 'function' ? refs.tickPath.getTotalLength() : 24
      tl.fromTo(refs.tickPath, { strokeDasharray: length, strokeDashoffset: length }, { strokeDashoffset: 0, duration: 0.3, ease: 'power2.out' }, 0.1)
    }
    if (refs.successCard) {
      tl.fromTo(refs.successCard, { y: move ? 6 : 0, opacity: 0 }, { y: 0, opacity: 1, duration: 0.24, ease: 'power3.out', clearProps: 'transform' }, 0.3)
    }
    if (refs.signedNode && move) tl.fromTo(refs.signedNode, POP.from, { ...POP.to, duration: 0.32 }, 0.4)
    if (refs.connector && move) {
      tl.fromTo(refs.connector, { scaleY: 0, transformOrigin: 'top' }, { scaleY: 1, duration: 0.45, ease: 'power2.inOut', clearProps: 'transform' }, 0.5)
    }
    if (refs.nextRing && move) tl.fromTo(refs.nextRing, POP.from, POP.to, 0.8)
    if (ctx.enabled && !ctx.reduced && refs.nowState && refs.nowBadge) {
      tl.add(Flip.from(refs.nowState, { targets: refs.nowBadge, duration: 0.3, ease: 'power3.inOut', scale: false }) as never, 0.85)
    }
    if (refs.bar && refs.toFraction !== undefined) {
      const to = `${Math.round(refs.toFraction * 100)}%`
      if (refs.fromFraction == null || !ctx.enabled) tl.set(refs.bar, { width: to }, 0.9)
      else tl.fromTo(refs.bar, { width: `${Math.round(refs.fromFraction * 100)}%` }, { width: to, duration: 0.42, ease: ctx.eases['dur-4'] }, 0.9)
    }
    tl.addLabel(CEREMONY_SPINE_LABEL, 0.9)
    if (refs.onSpine) tl.call(refs.onSpine, [], CEREMONY_SPINE_LABEL)
    return tl
  },
}
