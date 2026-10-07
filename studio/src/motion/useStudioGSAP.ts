// `useStudioGSAP` wraps `@gsap/react`'s `useGSAP` (§4.1) with one addition: the callback is
// handed either the real `gsap` or the disabled stub, chosen by `motion.enabled()` at effect
// time. The caller's code is identical in both cases; the stub applies end states instantly.
// `useGSAP` itself gives us the rest — a `gsap.context` scoped to `scope`, reverted on cleanup,
// so StrictMode's double-invoke and an unmount both leave no tween behind.
import { useGSAP } from '@gsap/react'
import type { RefObject } from 'react'
import { enabled } from './motion'
import { realGsap, stubGsap, type MotionGsap } from './stub'

export type { MotionGsap, MotionTimeline, AnimationLike } from './stub'

export interface StudioGSAPOptions {
  /** The subtree selectors in the callback resolve against — always set it; an unscoped
   * `gsap.to('.row')` would reach into another screen. */
  scope?: RefObject<Element | null> | Element | string
  /** When to re-run the choreography. OMITTED means "once per mount" — the same `[]` a bare
   * `useEffect` would need. Pass a list to replay when those values change. */
  dependencies?: unknown[]
  /** Revert the previous run before the next one (default true when dependencies change). */
  revertOnUpdate?: boolean
}

export type StudioGSAPCallback = (
  g: MotionGsap,
  context: gsap.Context,
  contextSafe: <T extends (...args: never[]) => unknown>(fn: T) => T,
) => void | (() => void)

export interface StudioGSAPReturn {
  context: gsap.Context
  contextSafe: <T extends (...args: never[]) => unknown>(fn: T) => T
  /** What the last run was given — lets a test assert the stub was used in MODE=test. */
  usingStub: boolean
}

/** The engine to hand a callback RIGHT NOW. Exported so a non-hook helper (pulse, splitTitle)
 * makes the same choice the hooks make. */
export function engineFor(isEnabled: boolean = enabled()): MotionGsap {
  return isEnabled ? realGsap : stubGsap
}

export function useStudioGSAP(callback: StudioGSAPCallback, options: StudioGSAPOptions = {}): StudioGSAPReturn {
  let usingStub = true
  const { context, contextSafe } = useGSAP(
    (ctx, safe) => {
      const on = enabled()
      usingStub = !on
      // `useGSAP` types contextSafe as `<T extends Function>`; narrow it for callers so a wrapped
      // handler keeps its parameter types.
      const typedSafe = (safe ?? ((fn) => fn)) as StudioGSAPReturn['contextSafe']
      return callback(engineFor(on), ctx, typedSafe)
    },
    {
      scope: options.scope as never,
      // WHY the default: `useGSAP` checks `"dependencies" in config`, so forwarding the key with
      // an `undefined` value is NOT the same as leaving it out — it becomes `useLayoutEffect(cb,
      // undefined)`, which reverts the context and replays the whole choreography on EVERY render.
      // OpeningOverlay re-renders every 250 ms for its clock; its "root fades in once" (§4.2 #16)
      // strobed four times a second. A choreography that gives no dependencies means "play once
      // when I mount", so `[]` is the honest default; an explicit list is still honoured as-is.
      dependencies: options.dependencies ?? [],
      revertOnUpdate: options.revertOnUpdate,
    },
  )
  return {
    context,
    contextSafe: contextSafe as StudioGSAPReturn['contextSafe'],
    usingStub,
  }
}
