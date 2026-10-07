// Row #15 — Dialog / palette open and close (M5). Open: the scrim fades 0→1 over `dur-1` while
// the panel settles from a hair smaller (`scale .98→1, y 6→0`, `dur-2`, `expo.out`) and ends with
// `clearProps: 'transform'` so a settled dialog is not a containing block for anything fixed
// inside it. Close: both fade over `dur-1` (120 ms) — the kit keeps the panel mounted until this
// resolves, then unmounts. Result rows (the palette, FIRST open only — the caller decides) fade in
// at 15 ms steps, capped at eight so a long list never delays the first row. Under a disabled
// context every tween is an instant end state (the stub), so a test sees the final DOM.
import type { Choreo } from '../contract'
import { capTargets } from '../presets'
import { fadeDuration, present, timelineFor, transformsAllowed } from './_shared'

export const DIALOG_ROW_STAGGER_S = 0.015
export const DIALOG_ROW_CAP = 8

export interface DialogRefs {
  scrim?: Element | null
  panel: Element | null
  /** Rows to stagger in after the panel (the palette's first open). */
  rows?: ReadonlyArray<Element | null>
  direction: 'open' | 'close'
}

export const dialog: Choreo<DialogRefs> = {
  name: 'dialog',
  play(ctx, refs) {
    const tl = timelineFor(ctx, { defaults: { ease: ctx.eases['dur-3'] } })
    const move = transformsAllowed(ctx)
    if (refs.direction === 'close') {
      const d = fadeDuration(ctx, ctx.durations['dur-1'])
      if (refs.scrim) tl.to(refs.scrim, { opacity: 0, duration: d, ease: ctx.eases['dur-1'] }, 0)
      if (refs.panel) tl.to(refs.panel, { opacity: 0, scale: move ? 0.98 : 1, duration: d, ease: ctx.eases['dur-1'], clearProps: 'transform' }, 0)
      return tl
    }
    if (refs.scrim) tl.fromTo(refs.scrim, { opacity: 0 }, { opacity: 1, duration: fadeDuration(ctx, ctx.durations['dur-1']), ease: ctx.eases['dur-1'] }, 0)
    if (refs.panel) {
      tl.fromTo(
        refs.panel,
        { opacity: 0, scale: move ? 0.98 : 1, y: move ? 6 : 0 },
        { opacity: 1, scale: 1, y: 0, duration: fadeDuration(ctx, ctx.durations['dur-2']), clearProps: 'transform' },
        0,
      )
    }
    const rows = capTargets(present(refs.rows ?? []), DIALOG_ROW_CAP)
    if (rows.length > 0) {
      tl.fromTo(rows, { opacity: 0 }, { opacity: 1, duration: fadeDuration(ctx, ctx.durations['dur-1']), stagger: DIALOG_ROW_STAGGER_S, clearProps: 'opacity' }, 0.05)
    }
    return tl
  },
}
