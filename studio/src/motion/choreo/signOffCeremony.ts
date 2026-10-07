// Row #10 — Sign-off ceremony. Trigger: `signOffStage` returned `ok` AND the refreshed
// `ProjectStatus` arrived — both facts real before a frame moves. One labelled timeline; the
// Spine scene joins at the `"spine"` label. The tick is a `strokeDashoffset` tween on an inline
// SVG path (no MorphSVG: the button has no icon to morph). The toast and the live announcement
// are the caller's and happen whether or not motion is on.
//
// Round 2 (M1): the Sidebar's nodes arrive through `ceremonyRegistry` and the card gains the
// SEAM — a 2 px accent line drawing from the card's top-centre outward at 0.3–0.6 s. It is the
// Macron's gesture (a bar appearing from its centre), not its shape, and it plays only when the
// caller passes `refs.seam`; a card without one is simply a card. The beats, in order:
//
//   0.10  tick draws (300 ms)              0.50  connector scaleY (450 ms)
//   0.30  card rises (240 ms power3.out)   0.80  next ring POP
//   0.30  seam draws (300 ms)              0.85  Now badge Flips (300 ms)
//   0.40  signed node POP (320 ms)         0.90  bar (420 ms) · "spine" label · onSpine
//
// Reduced motion: every transform beat is dropped and every opacity beat is capped at 120 ms —
// the card still arrives, the seam and the pops do not. Off: the stub applies the end state
// (which for a `from` tween is "where it already is"), so the screen equals a cold reload.
import { Flip } from 'gsap/Flip'
import type { Choreo } from '../contract'
import { POP, SEAM } from '../presets'
import { fadeDuration, timelineFor, transformsAllowed } from './_shared'

export const CEREMONY_SPINE_LABEL = 'spine'
/** When the "spine" label sits, in seconds — P4's `playSpineCeremony` joins here. */
export const CEREMONY_SPINE_AT = 0.9
/** The seam's window: it starts with the card and is fully drawn by 0.6 s. */
export const CEREMONY_SEAM_AT = 0.3
export const CEREMONY_SEAM_S = SEAM.to.duration as number

export interface SignOffCeremonyRefs {
  overlay?: Element | null
  tickPath?: SVGPathElement | null
  successCard?: Element | null
  /** The 2 px accent line at the card's top (M1). Absent → no seam. */
  seam?: Element | null
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
    if (refs.overlay) tl.to(refs.overlay, { opacity: 0, duration: fadeDuration(ctx, ctx.durations['dur-1']) }, 0)
    if (refs.tickPath) {
      const length = typeof refs.tickPath.getTotalLength === 'function' ? refs.tickPath.getTotalLength() : 24
      tl.fromTo(refs.tickPath, { strokeDasharray: length, strokeDashoffset: length }, { strokeDashoffset: 0, duration: fadeDuration(ctx, 0.3), ease: 'power2.out' }, 0.1)
    }
    if (refs.successCard) {
      tl.fromTo(
        refs.successCard,
        { y: move ? 6 : 0, opacity: 0 },
        { y: 0, opacity: 1, duration: fadeDuration(ctx, 0.24), ease: 'power3.out', clearProps: 'transform' },
        0.3,
      )
    }
    if (refs.seam && move) tl.fromTo(refs.seam, SEAM.from, SEAM.to, CEREMONY_SEAM_AT)
    if (refs.signedNode && move) tl.fromTo(refs.signedNode, POP.from, { ...POP.to, duration: 0.32 }, 0.4)
    if (refs.connector && move) {
      tl.fromTo(refs.connector, { scaleY: 0, transformOrigin: 'top' }, { scaleY: 1, duration: 0.45, ease: 'power2.inOut', clearProps: 'transform' }, 0.5)
    }
    if (refs.nextRing && move) tl.fromTo(refs.nextRing, POP.from, POP.to, 0.8)
    if (move && refs.nowState && refs.nowBadge) {
      tl.add(Flip.from(refs.nowState, { targets: refs.nowBadge, duration: 0.3, ease: 'power3.inOut', scale: false }) as never, 0.85)
    }
    if (refs.bar && refs.toFraction !== undefined) {
      const to = `${Math.round(refs.toFraction * 100)}%`
      if (refs.fromFraction == null || !ctx.enabled) tl.set(refs.bar, { width: to }, CEREMONY_SPINE_AT)
      else tl.fromTo(refs.bar, { width: `${Math.round(refs.fromFraction * 100)}%` }, { width: to, duration: 0.42, ease: ctx.eases['dur-4'] }, CEREMONY_SPINE_AT)
    }
    tl.addLabel(CEREMONY_SPINE_LABEL, CEREMONY_SPINE_AT)
    if (refs.onSpine) tl.call(refs.onSpine, [], CEREMONY_SPINE_LABEL)
    return tl
  },
}
