// A number that tweens between two REAL values (§4.1 `useCountUp`, catalogue row #11). The hook
// returns the text React should render and a ref for the element whose text node it drives:
// React renders the final value; when a tween is warranted the layout effect writes the
// intermediate numbers into `textContent` until it lands on the same final value. `null` renders
// the literal "no data" — text, never a 0 — and `null ↔ number` is a 120 ms opacity crossfade of
// the text, not a count. Nothing here ever counts from 0: see `classifyTransition`.
import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { CountUpOptions } from './contract'
import { MOTION_DURATIONS, REDUCED_CROSSFADE_S } from './contract'
import { enabled, reduced } from './motion'
import { scopedCounterId, useProjectKey } from './projectKey'
import { engineFor } from './useStudioGSAP'
import { classifyTransition, valueMemory, type CounterTransition } from './valueMemory'

export const NO_DATA_TEXT = 'no data'

export interface CountUp {
  ref: RefObject<HTMLElement | null>
  /** What to render. Already formatted; "no data" for `null`. */
  text: string
  /** Which rule applied on this render — exposed for tests and for a tile that wants to know. */
  transition: CounterTransition
}

function defaultFormat(snap: 1 | 0.1): (value: number) => string {
  return snap === 1 ? (v) => String(Math.round(v)) : (v) => (Math.round(v * 10) / 10).toFixed(1)
}

export function useCountUp(rawId: string, value: number | null, options: CountUpOptions = {}): CountUp {
  const snap = options.snap ?? 1
  const format = options.format ?? defaultFormat(snap)
  const text = value === null ? NO_DATA_TEXT : format(value)

  // The memory is keyed per PROJECT as well as per counter: a number another project showed is
  // not a previous value of this fact, so the first render under a new key is plain text.
  const id = scopedCounterId(useProjectKey(), rawId)

  // Classified during render (so `transition` can be returned) but committed to memory in the
  // effect, so a render React throws away does not advance the memory.
  const previous = valueMemory.recall(id)
  const transition = classifyTransition(previous, value)
  const ref = useRef<HTMLElement | null>(null)
  const formatRef = useRef(format)
  formatRef.current = format

  useLayoutEffect(() => {
    const el = ref.current
    const from = valueMemory.recall(id)
    const kind = classifyTransition(from, value)
    valueMemory.remember(id, value)
    if (!el || kind === 'first' || kind === 'none' || kind === 'swap') return
    const on = enabled()
    const g = engineFor(on)

    if (kind === 'crossfade') {
      // Text swap under a short opacity dip: 120 ms whether or not motion is reduced (the §2.7
      // crossfade allowance); off → stub → instant.
      const half = REDUCED_CROSSFADE_S / 2
      const tl = g.timeline()
      tl.to(el, { opacity: 0, duration: half }).set(el, { textContent: text }).to(el, { opacity: 1, duration: half })
      return () => {
        tl.kill()
      }
    }

    // kind === 'tween': both ends finite, previous not 0.
    if (!on || reduced() || typeof from !== 'number' || value === null) return
    const counter = { v: from }
    const tween = g.to(counter, {
      v: value,
      duration: MOTION_DURATIONS['dur-4'],
      ease: 'power3.out',
      snap: { v: snap },
      onUpdate: () => {
        el.textContent = formatRef.current(counter.v)
      },
      onComplete: () => {
        el.textContent = formatRef.current(value)
      },
    })
    return () => {
      tween.kill()
      el.textContent = formatRef.current(value)
    }
  }, [id, value, snap, text])

  return { ref, text, transition }
}
