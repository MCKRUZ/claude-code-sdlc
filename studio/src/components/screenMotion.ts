// The two catalogue rows the Sprint, Closing and Explain screens share, as hooks over the Wave 0
// motion layer: #4 list stagger on FIRST data arrival and the ceremony context a screen hands a
// choreography. Both go through `useStudioGSAP`, so MODE=test, an `off` preference and the OS
// reduced-motion setting all land on the same stub and a component test sees the final DOM.
import type { RefObject } from 'react'
import { contextFrom, listStagger } from '../motion/choreo'
import type { ChoreoContext } from '../motion/contract'
import { enabled, reduced } from '../motion/motion'
import { durations, eases } from '../motion/tokens'
import { useStudioGSAP } from '../motion/useStudioGSAP'

/** A `ChoreoContext` for `scope` as motion stands right now — for a caller outside a hook (the
 * Closing screen's advance handler plays the ceremony from an async callback). */
export function choreoContext(scope: Element): ChoreoContext {
  return contextFrom(scope, { enabled: enabled(), reduced: reduced() }, { durations, eases })
}

/** Stagger the `[data-reveal]` descendants of `ref` in once per `key` — the fact that a list has
 * ARRIVED, not a re-render (a re-stagger on every refresh turns a poll into a flicker). Pass a
 * `null` key while nothing has arrived and the hook does nothing. */
export function useListReveal(ref: RefObject<HTMLElement | null>, key: string | null): void {
  useStudioGSAP(
    () => {
      const el = ref.current
      if (!el || key === null) return
      const items = Array.from(el.querySelectorAll<HTMLElement>('[data-reveal]'))
      if (items.length === 0) return
      listStagger.play(choreoContext(el), { items })
    },
    { scope: ref, dependencies: [key] },
  )
}
