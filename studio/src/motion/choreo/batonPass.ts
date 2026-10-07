// Row #30 — Baton pass (togo-command-center.md §4, visual §7). The hand-off baton on the
// Building→Checking edge POPs (`BATON_POP`, 100 ms, the glyph is ≤ 24 px) and slides along the
// lane edge over `dur-3` (`BATON_SLIDE`, `expo.out`) from where it left (`fromSlot`) to where it
// sits (`toSlot`), with a 2 px `baton` trail drawing under it; the card rises into place from
// `BATON_POP_S` (the host's `boardRegroup` Flip owns the lane change itself). 420 ms in all.
//
// Gate: `batonPassDue` — plays ONLY after this person's hand-off returned exit 0 AND the
// refreshed reads arrived; never on an optimistic update. Tiers: `full` and `quiet` play it (it
// is evidence of a verb); `settled` keeps only a crossfade at the new position. Reduced motion
// crossfades 120 ms; disabled applies the end state and touches nothing. Every tween ends in the
// element's natural state (`clearProps`), so `progress(1)` equals a cold reload under any tier.
import type { Choreo, FamiliarityTier } from '../contract'
import { BATON_POP, BATON_POP_S, BATON_SLIDE, CARD_RISE, CROSSFADE_IN, tierAllows } from '../presets'
import { fadeDuration, timelineFor, transformsAllowed } from './_shared'

export interface BatonPassRefs {
  /** The `[data-baton]` glyph (`BatonGlyph`). */
  baton: Element | null
  /** The slot it leaves and the slot it arrives in, for the slide's geometry. */
  fromSlot?: Element | null
  toSlot?: Element | null
  /** The 2 px trail element, if the host draws one. */
  trail?: Element | null
  /** The hand-off's card, Flipped by `boardRegroup` from `BATON_POP_S`. */
  card?: Element | null
  tier?: FamiliarityTier
}

/** True only on exit 0 AND the refreshed read in hand — the same gate `handoffCeremonyDue` uses. */
export function batonPassDue(result: { ok: boolean } | null | undefined, refreshed: boolean): boolean {
  return !!result && result.ok === true && refreshed === true
}

/** Where the baton came from, relative to where it now sits: the slide's `from` offset. Zero
 * when either slot is missing or has no layout (jsdom) — then the slide is a settle in place. */
export function slideOffset(fromSlot: Element | null | undefined, toSlot: Element | null | undefined): { x: number; y: number } {
  if (!fromSlot || !toSlot || typeof fromSlot.getBoundingClientRect !== 'function') return { x: 0, y: 0 }
  const a = fromSlot.getBoundingClientRect()
  const b = toSlot.getBoundingClientRect()
  return { x: a.left - b.left, y: a.top - b.top }
}

export const batonPass: Choreo<BatonPassRefs> = {
  name: 'batonPass',
  play(ctx, refs) {
    const tl = timelineFor(ctx, { defaults: { ease: ctx.eases['dur-3'] } })
    if (!ctx.enabled || !refs.baton) return tl
    const move = transformsAllowed(ctx) && tierAllows(refs.tier, 'slide')
    if (!move) {
      // Settled tier or reduced motion: the baton and the card simply arrive, 120 ms.
      tl.fromTo(refs.baton, CROSSFADE_IN.from, { ...CROSSFADE_IN.to, duration: fadeDuration(ctx, ctx.durations['dur-1']) }, 0)
      if (refs.card) tl.fromTo(refs.card, CROSSFADE_IN.from, { ...CROSSFADE_IN.to, duration: fadeDuration(ctx, ctx.durations['dur-1']) }, 0)
      return tl
    }
    const offset = slideOffset(refs.fromSlot, refs.toSlot)
    if (tierAllows(refs.tier, 'pop')) tl.fromTo(refs.baton, BATON_POP.from, BATON_POP.to, 0)
    tl.fromTo(refs.baton, { ...BATON_SLIDE.from, x: offset.x, y: offset.y }, { ...BATON_SLIDE.to, x: 0, y: 0 }, BATON_POP_S)
    if (refs.trail) {
      tl.fromTo(refs.trail, { scaleX: 0, transformOrigin: offset.x >= 0 ? '100% 50%' : '0% 50%', opacity: 1 }, { scaleX: 1, duration: BATON_SLIDE.to.duration as number, ease: ctx.eases['dur-3'] }, BATON_POP_S)
      tl.to(refs.trail, { opacity: 0, duration: fadeDuration(ctx, ctx.durations['dur-1']), clearProps: 'transform,opacity' })
    }
    if (refs.card) tl.fromTo(refs.card, CARD_RISE.from, CARD_RISE.to, BATON_POP_S)
    return tl
  },
}
