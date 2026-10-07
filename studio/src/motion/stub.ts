// The gsap-shaped stub a choreography receives when motion is disabled (§4.1 `useStudioGSAP`).
// Its `to / from / fromTo / set / timeline` apply the END state instantly through `gsap.set` and
// return an already-completed timeline, so a caller writes one code path and never branches on
// `enabled()`. Callbacks a caller may depend on for state (`onComplete`, `call`) still fire —
// synchronously — because a screen that waits for the ceremony to finish must not wait forever.
import { gsap } from 'gsap'
import type { TimelineLike } from './contract'

/** The subset of `gsap` a choreography may use. The real `gsap` satisfies it; so does `stubGsap`. */
export interface MotionGsap {
  to(targets: gsap.TweenTarget, vars: gsap.TweenVars): AnimationLike
  from(targets: gsap.TweenTarget, vars: gsap.TweenVars): AnimationLike
  fromTo(targets: gsap.TweenTarget, fromVars: gsap.TweenVars, toVars: gsap.TweenVars): AnimationLike
  set(targets: gsap.TweenTarget, vars: gsap.TweenVars): AnimationLike
  timeline(vars?: gsap.TimelineVars): MotionTimeline
}

export interface AnimationLike {
  kill(): unknown
  progress(): number
  then(onFulfilled?: (value: unknown) => unknown): Promise<unknown>
}

/** The chainable timeline surface shared by `gsap.core.Timeline` and `StubTimeline`. */
export interface MotionTimeline extends TimelineLike {
  to(targets: gsap.TweenTarget, vars: gsap.TweenVars, position?: gsap.Position): this
  from(targets: gsap.TweenTarget, vars: gsap.TweenVars, position?: gsap.Position): this
  fromTo(targets: gsap.TweenTarget, fromVars: gsap.TweenVars, toVars: gsap.TweenVars, position?: gsap.Position): this
  set(targets: gsap.TweenTarget, vars: gsap.TweenVars, position?: gsap.Position): this
  addLabel(label: string, position?: gsap.Position): this
  call(callback: gsap.Callback, params?: unknown[], position?: gsap.Position): this
  /** Nest another animation (a Flip timeline, a scene's own timeline). */
  add(child: gsap.core.Animation | gsap.Callback, position?: gsap.Position): this
}

/** Keys that describe HOW a tween moves, not WHERE it ends. Stripped before `gsap.set`, which
 * would otherwise try to set `duration` as a CSS property. */
const TWEEN_ONLY_KEYS = new Set([
  'duration', 'delay', 'ease', 'stagger', 'repeat', 'repeatDelay', 'repeatRefresh', 'yoyo', 'yoyoEase',
  'paused', 'immediateRender', 'overwrite', 'lazy', 'startAt', 'keyframes', 'snap', 'runBackwards',
  'onStart', 'onUpdate', 'onComplete', 'onRepeat', 'onReverseComplete', 'onInterrupt',
  'onStartParams', 'onUpdateParams', 'onCompleteParams', 'onRepeatParams', 'onReverseCompleteParams',
  'callbackScope', 'data', 'id', 'inherit', 'reversed', 'autoRevert',
])

function endState(vars: gsap.TweenVars): gsap.TweenVars {
  const out: gsap.TweenVars = {}
  for (const [key, value] of Object.entries(vars)) {
    if (!TWEEN_ONLY_KEYS.has(key)) out[key] = value
  }
  return out
}

function applyNow(targets: gsap.TweenTarget, vars: gsap.TweenVars): void {
  const end = endState(vars)
  if (Object.keys(end).length > 0) gsap.set(targets, end)
  // The tween would have reached its end, so anything waiting on that still runs.
  if (typeof vars.onStart === 'function') vars.onStart(...(vars.onStartParams ?? []))
  if (typeof vars.onComplete === 'function') vars.onComplete(...(vars.onCompleteParams ?? []))
}

/** `from` tweens end where the element already IS; the only end-state work is `clearProps`. */
function applyFromNow(targets: gsap.TweenTarget, vars: gsap.TweenVars): void {
  if (vars.clearProps) gsap.set(targets, { clearProps: vars.clearProps })
  if (typeof vars.onComplete === 'function') vars.onComplete(...(vars.onCompleteParams ?? []))
}

/** A completed timeline: every method applies its end state immediately and returns `this`. */
export class StubTimeline implements MotionTimeline {
  labels: Record<string, number> = {}
  private readonly vars: gsap.TimelineVars

  constructor(vars: gsap.TimelineVars = {}) {
    this.vars = vars
  }

  to(targets: gsap.TweenTarget, vars: gsap.TweenVars): this {
    applyNow(targets, vars)
    return this
  }

  from(targets: gsap.TweenTarget, vars: gsap.TweenVars): this {
    applyFromNow(targets, vars)
    return this
  }

  fromTo(targets: gsap.TweenTarget, _fromVars: gsap.TweenVars, toVars: gsap.TweenVars): this {
    applyNow(targets, toVars)
    return this
  }

  set(targets: gsap.TweenTarget, vars: gsap.TweenVars): this {
    applyNow(targets, vars)
    return this
  }

  addLabel(label: string): this {
    this.labels[label] = 0
    return this
  }

  /** A nested real animation would be left to play; under the stub it is jumped to its end. */
  add(child: gsap.core.Animation | gsap.Callback): this {
    if (typeof child === 'function') child()
    else child.progress(1)
    return this
  }

  call(callback: gsap.Callback, params: unknown[] = []): this {
    callback(...params)
    return this
  }

  play(): this {
    return this
  }

  pause(): this {
    return this
  }

  kill(): this {
    return this
  }

  progress(): number
  progress(value: number): this
  progress(value?: number): number | this {
    return value === undefined ? 1 : this
  }

  /** Settles on the next microtask. The promise must NOT resolve with `this`: a thenable handed
   * to `resolve` has its `then` called again, which would recurse forever (and the type checker
   * sees the same loop). */
  then(onFulfilled?: (value: this) => unknown): Promise<unknown> {
    return new Promise<unknown>((resolve) => {
      queueMicrotask(() => resolve(onFulfilled ? onFulfilled(this) : undefined))
    })
  }

  /** Completes the timeline's own `onComplete`, for parity with a real one that has run. */
  finish(): this {
    if (typeof this.vars.onComplete === 'function') this.vars.onComplete(...(this.vars.onCompleteParams ?? []))
    return this
  }
}

export const stubGsap: MotionGsap = {
  to(targets, vars) {
    return new StubTimeline().to(targets, vars)
  },
  from(targets, vars) {
    return new StubTimeline().from(targets, vars)
  },
  fromTo(targets, fromVars, toVars) {
    return new StubTimeline().fromTo(targets, fromVars, toVars)
  },
  set(targets, vars) {
    return new StubTimeline().set(targets, vars)
  },
  timeline(vars) {
    return new StubTimeline(vars)
  },
}

/** The real engine, typed down to the surface the stub also offers. */
export const realGsap: MotionGsap = gsap as unknown as MotionGsap
