// Row #31 — Verdict seal (togo-command-center.md §4, visual §7). On `accepted` a 2 px `SEAM`
// draws from the card's top-centre (scaleX 0→1, 300 ms `expo.out`) and then fades, so the card
// after `progress(1)` carries no mark a cold reload would not; the review-lane chip crossfades
// out `dur-1` / in `dur-2` at `VERDICT_CHIP_AT_S` to the plugin's new `eng_review` /
// `data_review` word (the text has already changed — the host re-read first). `returned`,
// `pending` and `n-a` draw NO seam, only the chip crossfade.
//
// Gate: plays only after exit 0 and the refreshed `status --json`. Tiers: `full` / `quiet` draw
// the seam, `settled` crossfades only; reduced motion keeps the crossfade (≤ 120 ms); disabled
// applies the end state and touches nothing.
import type { Choreo, FamiliarityTier } from '../contract'
import type { VerdictValue } from '../../../shared/types'
import { CROSSFADE_IN, CROSSFADE_OUT, tierAllows, VERDICT_CHIP_AT_S, VERDICT_SEAL } from '../presets'
import { fadeDuration, timelineFor, transformsAllowed } from './_shared'

export interface VerdictSealRefs {
  card: Element | null
  /** The seam element the host renders at the card's top-centre (absent → no seam). */
  seam?: Element | null
  /** Outgoing and incoming chip, for the crossfade to the plugin's new word. */
  chipOut?: Element | null
  chipIn?: Element | null
  verdict: VerdictValue
  tier?: FamiliarityTier
}

/** The seam is drawn for `accepted` only. */
export function verdictSealDraws(verdict: VerdictValue): boolean {
  return verdict === 'accepted'
}

export const VERDICT_SEAM_S = VERDICT_SEAL.to.duration as number

export const verdictSeal: Choreo<VerdictSealRefs> = {
  name: 'verdictSeal',
  play(ctx, refs) {
    const tl = timelineFor(ctx, { defaults: { ease: ctx.eases['dur-2'] } })
    if (!ctx.enabled) return tl
    const seam = refs.seam && verdictSealDraws(refs.verdict) && transformsAllowed(ctx) && tierAllows(refs.tier, 'seam')
    if (seam && refs.seam) {
      const { clearProps: _keep, ...draw } = VERDICT_SEAL.to
      void _keep
      tl.fromTo(refs.seam, VERDICT_SEAL.from, draw, 0)
      // The seam is a gesture, not a state: it leaves so the DOM equals a cold reload.
      tl.to(refs.seam, { opacity: 0, duration: fadeDuration(ctx, ctx.durations['dur-2']), clearProps: 'all' }, VERDICT_SEAM_S)
    }
    if (tierAllows(refs.tier, 'crossfade')) {
      if (refs.chipOut) tl.fromTo(refs.chipOut, CROSSFADE_OUT.from, { ...CROSSFADE_OUT.to, duration: fadeDuration(ctx, ctx.durations['dur-1']) }, VERDICT_CHIP_AT_S)
      if (refs.chipIn) {
        tl.fromTo(refs.chipIn, CROSSFADE_IN.from, { ...CROSSFADE_IN.to, duration: fadeDuration(ctx, ctx.durations['dur-2']), clearProps: 'opacity' }, VERDICT_CHIP_AT_S)
      }
    }
    return tl
  },
}
