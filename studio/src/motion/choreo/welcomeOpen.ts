// Row #1 — Welcome open. Trigger: `screen.kind` becomes `welcome`. The h1 is split by the
// caller (`useSplitTitle`) and its chars passed in, so this module stays free of the lazy plugin.
//
// Round 2 (M3 on the entry screen): `familiarity` quietens the ceremony. `full` (opens 1–3) is
// the row as designed; `quiet` and `settled` (opens 4+) keep the same order and the same end
// state but the canvas arrives in a plain 320 ms fade and the title chars fade in place with no
// rise — the person knows this screen, so it does not need to introduce itself.
import type { Choreo, FamiliarityTier } from '../contract'
import { present, timelineFor, transformsAllowed } from './_shared'

/** The quiet canvas fade in seconds (B3: "opens 4–10: plain 320 ms fade"). */
export const WELCOME_QUIET_FADE_S = 0.32
/** The first-opens canvas fade. */
export const WELCOME_FULL_FADE_S = 0.6

export interface WelcomeOpenRefs {
  canvas?: Element | null
  titleChars?: Element[]
  subtitle?: Element | null
  buttons?: Element[]
  recentRows?: Element[]
  /** From `readFamiliarity()`; absent reads as `full`. */
  familiarity?: FamiliarityTier
}

export const welcomeOpen: Choreo<WelcomeOpenRefs> = {
  name: 'welcomeOpen',
  play(ctx, refs) {
    const tl = timelineFor(ctx, { defaults: { ease: ctx.eases['dur-3'] } })
    const quiet = (refs.familiarity ?? 'full') !== 'full'
    const move = transformsAllowed(ctx) && !quiet
    if (refs.canvas) {
      const fade = ctx.reduced ? 0 : quiet ? WELCOME_QUIET_FADE_S : WELCOME_FULL_FADE_S
      tl.fromTo(refs.canvas, { opacity: 0 }, { opacity: 1, duration: fade }, 0)
    }
    const chars = refs.titleChars ?? []
    if (chars.length > 0) {
      tl.fromTo(chars, { y: move ? 14 : 0, opacity: 0 },
        { y: 0, opacity: 1, duration: quiet ? WELCOME_QUIET_FADE_S : 0.6, stagger: quiet ? 0 : { each: 0.018, amount: 0.25 }, clearProps: 'transform' }, 0)
    }
    if (refs.subtitle) {
      tl.fromTo(refs.subtitle, { y: move ? 8 : 0, opacity: 0 }, { y: 0, opacity: 1, duration: ctx.durations['dur-3'], clearProps: 'transform' }, 0.12)
    }
    const buttons = present(refs.buttons ?? [])
    if (buttons.length > 0) tl.fromTo(buttons, { opacity: 0 }, { opacity: 1, duration: ctx.durations['dur-3'], stagger: 0.06 }, 0.2)
    const rows = present(refs.recentRows ?? [])
    if (rows.length > 0) {
      tl.fromTo(rows, { y: move ? 4 : 0, opacity: 0 }, { y: 0, opacity: 1, duration: ctx.durations['dur-3'], stagger: 0.024, clearProps: 'transform' }, 0.3)
    }
    return tl
  },
}
