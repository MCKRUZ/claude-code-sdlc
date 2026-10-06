// Row #1 — Welcome open. Trigger: `screen.kind` becomes `welcome`. The h1 is split by the
// caller (`useSplitTitle`) and its chars passed in, so this module stays free of the lazy plugin.
import type { Choreo } from '../contract'
import { present, timelineFor, transformsAllowed } from './_shared'

export interface WelcomeOpenRefs {
  canvas?: Element | null
  titleChars?: Element[]
  subtitle?: Element | null
  buttons?: Element[]
  recentRows?: Element[]
}

export const welcomeOpen: Choreo<WelcomeOpenRefs> = {
  name: 'welcomeOpen',
  play(ctx, refs) {
    const tl = timelineFor(ctx, { defaults: { ease: ctx.eases['dur-3'] } })
    const move = transformsAllowed(ctx)
    if (refs.canvas) tl.fromTo(refs.canvas, { opacity: 0 }, { opacity: 1, duration: ctx.reduced ? 0 : 0.6 }, 0)
    const chars = refs.titleChars ?? []
    if (chars.length > 0) {
      tl.fromTo(chars, { y: move ? 14 : 0, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, stagger: { each: 0.018, amount: 0.25 }, clearProps: 'transform' }, 0)
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
