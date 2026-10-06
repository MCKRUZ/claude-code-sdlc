// Row #13 — Chat message arrival. Trigger: `messages.length` grew (never a re-render of an
// existing bubble). A sub-agent bubble's dashed border settles from the accent to `line-2`. The
// typing indicator is a separate looping tween that runs only while `busy`; the kit kills it.
import type { Choreo } from '../contract'
import { fadeDuration, timelineFor, transformsAllowed } from './_shared'

export interface ChatMessageRefs {
  bubble: Element | null
  subAgent?: boolean
  /** Resolved colour strings — the row never reads a CSS variable itself. */
  accentColor?: string
  lineColor?: string
}

export const chatMessage: Choreo<ChatMessageRefs> = {
  name: 'chatMessage',
  play(ctx, refs) {
    const tl = timelineFor(ctx, { defaults: { ease: 'back.out(1.2)' } })
    if (!refs.bubble) return tl
    const move = transformsAllowed(ctx)
    tl.fromTo(refs.bubble, { y: move ? 8 : 0, scale: move ? 0.98 : 1, opacity: 0 },
      { y: 0, scale: 1, opacity: 1, duration: fadeDuration(ctx, 0.22), clearProps: 'transform' }, 0)
    if (refs.subAgent && refs.accentColor && refs.lineColor && ctx.enabled) {
      tl.fromTo(refs.bubble, { borderColor: refs.accentColor }, { borderColor: refs.lineColor, duration: 0.6, ease: 'power2.out' }, 0)
    }
    return tl
  },
}

export interface TypingDotsRefs {
  dots: ReadonlyArray<Element | null>
}

/** Three dots rising in turn, 900 ms `sine.inOut`, repeating until killed. Static "…" when off. */
export const typingDots: Choreo<TypingDotsRefs> = {
  name: 'typingDots',
  play(ctx, refs) {
    const tl = timelineFor(ctx, { repeat: -1 })
    const dots = refs.dots.filter((d): d is Element => d != null)
    if (dots.length === 0 || !transformsAllowed(ctx)) return tl
    return tl.to(dots, { y: -3, duration: 0.45, ease: ctx.eases.ambient, yoyo: true, repeat: 1, stagger: 0.15 })
  },
}
