// Row #26 — Hand-off ceremony (M9). Trigger: `handOff` resolved `ok` AND the refreshed row
// arrived — the two facts `handoffCeremonyDue` names, so a screen asks one question before it
// plays and a refusal plays nothing (it renders a `Notice` in the plugin's words instead).
//
// The beats, all on one timeline so they read as one event:
//
//   0.00  the dialog panel fades (dur-1, 120 ms)
//   0.10  BUILDS IT crossfades "nobody" → the plugin's `developer` (200 ms; the text has
//         already changed — this is the arrival of the new word, not a morph)
//   0.20  the status chip POPs (≤ 24 px, back.out)
//   0.30  the branch / PR chips rise, `stagger-2`
//
// Reduced motion keeps the two fades (capped at 120 ms) and drops the pop and the rise. Off: the
// stub applies the end state, so the row reads exactly as a cold reload would.
//
// P2 plays the dialog half from `HandoffDialog`; P3 passes `buildsCell` / `statusChip` /
// `prChips` from `SpecStatusView` once its refreshed row is on screen.
import type { Choreo, HandoffCeremonyRefs } from '../contract'
import { CARD_RISE, CARD_STAGGER, POP } from '../presets'
import { fadeDuration, present, timelineFor, transformsAllowed } from './_shared'

export type { HandoffCeremonyRefs }

/** The gate every caller asks before `play`: the plugin said yes AND the refreshed row is what
 * the screen now shows. A refusal (`ok: false`), a result that has not come back (`null`) or a
 * row still showing the pre-hand-off state is "not yet". */
export function handoffCeremonyDue(result: { ok: boolean } | null | undefined, refreshed: boolean): boolean {
  return result?.ok === true && refreshed
}

export const HANDOFF_BUILDS_CROSSFADE_S = 0.2

export const handoffCeremony: Choreo<HandoffCeremonyRefs> = {
  name: 'handoffCeremony',
  play(ctx, refs) {
    const tl = timelineFor(ctx, { defaults: { ease: ctx.eases['dur-2'] } })
    // Off: nothing to apply. Every beat here tweens INTO the element's natural state (opacity 1,
    // no transform) and the dialog unmounts on its own, so a cold reload and "touch nothing" are
    // the same picture — and the catalogue test holds the DOM byte-identical under a stub.
    if (!ctx.enabled) return tl
    const move = transformsAllowed(ctx)
    if (refs.dialog) tl.to(refs.dialog, { opacity: 0, duration: fadeDuration(ctx, ctx.durations['dur-1']) }, 0)
    if (refs.buildsCell) {
      tl.fromTo(refs.buildsCell, { opacity: 0 }, { opacity: 1, duration: fadeDuration(ctx, HANDOFF_BUILDS_CROSSFADE_S), ease: ctx.eases['dur-2'] }, 0.1)
    }
    if (refs.statusChip && move) tl.fromTo(refs.statusChip, POP.from, POP.to, 0.2)
    const chips = present(refs.prChips ?? [])
    if (chips.length > 0) {
      tl.fromTo(
        chips,
        { y: move ? (CARD_RISE.from.y as number) : 0, opacity: 0 },
        { ...CARD_RISE.to, y: 0, opacity: 1, duration: fadeDuration(ctx, CARD_RISE.to.duration as number), stagger: CARD_STAGGER },
        0.3,
      )
    }
    return tl
  },
}
