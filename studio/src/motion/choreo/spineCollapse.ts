// Row #28 — Spine collapse (studio-upgrade-2 I8; P5 wires the chevron). The band's height
// between its open measurement and 0 over `dur-3`, `clearProps: 'height'` at the end so the host's
// own collapsed / open render is the only thing left in the DOM: a cold reload with or without the
// row looks exactly the same. The host owns the ORDER: collapsing, it plays on the open band and
// flips its state when the timeline ends (`.add(callback)` — synchronous under the stub); expanding, it
// flips first so the open height is there to measure, then plays. Reduced motion: an
// opacity fade only (a height tween is a layout move). Disabled: the DOM is not touched.
import type { Choreo, SpineCollapseRefs } from '../contract'
import { fadeDuration, timelineFor, transformsAllowed } from './_shared'

export type { SpineCollapseRefs }

export const spineCollapse: Choreo<SpineCollapseRefs> = {
  name: 'spineCollapse',
  play(ctx, refs) {
    const tl = timelineFor(ctx)
    const band = refs.band
    if (!ctx.enabled || !band) return tl
    const dur = ctx.durations['dur-3']
    if (!transformsAllowed(ctx)) {
      const fade = fadeDuration(ctx, dur)
      return refs.collapsed
        ? tl.fromTo(band, { opacity: 1 }, { opacity: 0, duration: fade, ease: ctx.eases['dur-1'], clearProps: 'opacity' })
        : tl.fromTo(band, { opacity: 0 }, { opacity: 1, duration: fade, ease: ctx.eases['dur-1'], clearProps: 'opacity' })
    }
    // The open height is measured, never guessed; `overflow: hidden` while it moves so the figure
    // does not spill, cleared with the height at the end.
    const open = (band as HTMLElement).scrollHeight || (band as HTMLElement).getBoundingClientRect?.().height || 0
    const from = refs.collapsed ? { height: open, overflow: 'hidden' } : { height: 0, overflow: 'hidden' }
    const to = { height: refs.collapsed ? 0 : open, duration: dur, ease: ctx.eases['dur-3'], clearProps: 'height,overflow' }
    return tl.fromTo(band, from, to)
  },
}
