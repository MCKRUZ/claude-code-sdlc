// Row #11 — Counters, as a timeline for a caller that is not a React component (the hook form is
// `useCountUp`). The same rule applies: both ends finite and the previous value not 0, else the
// text is swapped. `valueMemory` is the hook's; this row is handed explicit ends.
import type { Choreo } from '../contract'
import { classifyTransition } from '../valueMemory'
import { timelineFor } from './_shared'

export interface CountersRefs {
  el: Element | null
  from: number | null | undefined
  to: number | null
  snap?: 1 | 0.1
  format?: (value: number) => string
}

export const counters: Choreo<CountersRefs> = {
  name: 'counters',
  play(ctx, refs) {
    const tl = timelineFor(ctx, { defaults: { ease: 'power3.out' } })
    const el = refs.el
    if (!el) return tl
    const format = refs.format ?? ((v: number) => (refs.snap === 0.1 ? v.toFixed(1) : String(Math.round(v))))
    const finalText = refs.to === null ? 'no data' : format(refs.to)
    const kind = classifyTransition(refs.from, refs.to)
    if (kind !== 'tween' || ctx.reduced || typeof refs.from !== 'number' || refs.to === null) {
      return tl.set(el, { textContent: finalText })
    }
    const counter = { v: refs.from }
    const to = refs.to
    return tl.to(counter, {
      v: to,
      duration: ctx.durations['dur-4'],
      snap: { v: refs.snap ?? 1 },
      onUpdate: () => {
        el.textContent = format(counter.v)
      },
      onComplete: () => {
        el.textContent = format(to)
      },
    })
  },
}
