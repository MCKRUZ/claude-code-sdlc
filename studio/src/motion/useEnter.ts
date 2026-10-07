// Enter-only transition on a REF to the screen root (§4.1 `useEnter`) — no wrapper element, so
// `main.firstElementChild` stays the real screen (`workflow.spec.ts:191` locates it that way).
// Runs once per `key` (the fact that changed: `area`, `openDoc`, `viewedStageId`, `tab`); the
// transform tween ends with `clearProps: 'transform'`, and under reduced motion only opacity
// moves. When motion is off the stub applies the end state, which also clears the transform.
import type { RefObject } from 'react'
import type { EnterPreset } from './contract'
import { reduced } from './motion'
import { enterPreset } from './presets'
import { useStudioGSAP } from './useStudioGSAP'

export interface UseEnterOptions {
  /** Re-run the enter when this changes (the screen identity). Omit for mount-only. */
  key?: unknown
}

export function useEnter(ref: RefObject<HTMLElement | null>, preset: EnterPreset = 'rise', options: UseEnterOptions = {}): void {
  useStudioGSAP(
    (g) => {
      const el = ref.current
      if (!el) return
      const pair = enterPreset(preset, reduced())
      g.fromTo(el, pair.from, { ...pair.to, overwrite: 'auto' })
    },
    { scope: ref, dependencies: [preset, options.key] },
  )
}
