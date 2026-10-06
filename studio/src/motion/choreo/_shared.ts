// What every catalogue row shares: a timeline that is real when `ctx.enabled` and the completed
// stub otherwise, optionally joined to a parent at a label (the sign-off ceremony hands the
// Spine its `"spine"` label this way). Rows never read `motion.enabled()` themselves — the
// context already resolved it — so a row is a pure function of its inputs and testable with a
// hand-built context.
import { gsap } from 'gsap'
import type { Choreo, ChoreoContext } from '../contract'
import { StubTimeline, type MotionTimeline } from '../stub'

export type { ChoreoContext }

/** A catalogue row that exists by name before its owner has written it: returns `timelineFor(ctx)`
 * — an empty real timeline (already complete) when enabled, the stub otherwise — and moves
 * nothing. The owner replaces the file's contents and keeps the exported name and ref type. */
export function placeholderRow<Extra>(name: string): Choreo<Extra> {
  return {
    name,
    play(ctx) {
      return timelineFor(ctx)
    },
  }
}

export function timelineFor(ctx: ChoreoContext, vars: gsap.TimelineVars = {}): MotionTimeline {
  if (!ctx.enabled) return new StubTimeline(vars)
  const tl = gsap.timeline(vars) as unknown as MotionTimeline
  if (ctx.parent) ctx.parent.add(tl as unknown as gsap.core.Timeline, ctx.parentLabel)
  return tl
}

/** `0` under `off`, the cap under `reduced`, the full length otherwise — the §2.7 rule for an
 * opacity-only tween. Transforms do not get this allowance: use `transformsAllowed`. */
export function fadeDuration(ctx: ChoreoContext, full: number): number {
  if (!ctx.enabled) return 0
  return ctx.reduced ? Math.min(full, 0.12) : full
}

export function transformsAllowed(ctx: ChoreoContext): boolean {
  return ctx.enabled && !ctx.reduced
}

/** Filters out nulls so a row can be handed optional refs and skip the ones that are absent. */
export function present<T extends Element>(items: ReadonlyArray<T | null | undefined>): T[] {
  return items.filter((x): x is T => x != null)
}

/** The ctx a caller builds from `motion.ts` when it is not inside a hook. */
export function contextFrom(
  scope: Element,
  state: { enabled: boolean; reduced: boolean },
  tokens: Pick<ChoreoContext, 'durations' | 'eases'>,
  join?: { parent: gsap.core.Timeline; label?: string },
): ChoreoContext {
  return {
    scope,
    enabled: state.enabled,
    reduced: state.reduced,
    durations: tokens.durations,
    eases: tokens.eases,
    parent: join?.parent,
    parentLabel: join?.label,
  }
}
