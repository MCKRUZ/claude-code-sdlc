// Row #2 — Project open, Frame assemble. Trigger: `openProject` resolved and the Frame mounted
// (the overlay has just unmounted). Only INNER content moves: the `<aside>` elements and `<main>`
// are never transformed (§4 invariants), so the caller passes the chat panel's inner wrapper,
// not the aside, and `<main>`'s FIRST CHILD, not `<main>`. Every transform ends with
// `clearProps: 'transform'` so nothing keeps a residual `translate(0, 0)`.
//
// Round 2 (M2 / M3): the beats, from the Frame root —
//
//   0.00  sidebar header fades in (180 ms)
//   0.05  stage rows x −8→0, 24 ms apart, the whole list inside 0.32 s
//   0.10  the Spine joins (P4 registers through `frameAssemble.join`; its rail draw and station
//         pops are added at `FRAME_ASSEMBLE_JOIN_AT`)
//   0.15  the screen root rises (240 ms power3.out)
//   0.20  the chat's inner wrapper x 12→0
//
// `playOnce(key, …)` plays once per project key — a `refreshStatus` re-render never replays;
// the Frame forgets the key when it unmounts, so reopening the project is an open again. The
// familiarity tier (`motion.familiarity`) sets the pace: `full` as written, `quiet` compressed to
// `dur-4` end to end, `settled` not played at all (the end state is the cold-reload picture).
import type { Choreo, ChoreoContext, FamiliarityTier } from '../contract'
import { MOTION_DURATIONS, STAGGER_1_AMOUNT_CAP } from '../contract'
import { POP } from '../presets'
import type { MotionTimeline } from '../stub'
import { present, timelineFor, transformsAllowed } from './_shared'

export interface FrameAssembleRefs {
  sidebarHeader?: Element | null
  stageRows?: Element[]
  titleChars?: Element[]
  screenRoot?: Element | null
  chatInner?: Element | null
  /** `{ draw: 0..1 }`; the scene's material reads `draw` as `uDraw` each frame. */
  rail?: { draw: number; onUpdate?: () => void } | null
  stations?: Element[]
  /** M3: how familiar this person is with the project. Default `full`. */
  tier?: FamiliarityTier
}

/** Where a joiner's animation is placed on the assemble, in seconds. */
export const FRAME_ASSEMBLE_JOIN_AT = 0.1

/** What a joiner hands back: an animation (or callback) to add at the join point, or nothing. */
export type FrameAssembleJoiner = (ctx: ChoreoContext, tl: MotionTimeline) => gsap.core.Animation | gsap.Callback | void

const joiners = new Set<FrameAssembleJoiner>()
const played = new Set<string>()

/** The row object plus the round-2 verbs. Kept as one export so `choreo/index.ts` and the
 * catalogue keep the name `frameAssemble`. */
export const frameAssemble: Choreo<FrameAssembleRefs> & {
  /** P4's Spine registers here; returns the unregister. A joiner registered after the assemble
   * has played is simply not called — the project opened without it. */
  join(fn: FrameAssembleJoiner): () => void
  /** Play once per `key`; a second call for the same key returns null and moves nothing. */
  playOnce(key: string, ctx: ChoreoContext, refs: FrameAssembleRefs): MotionTimeline | null
  /** The Frame unmounted (or a test reset): the next `playOnce` for this key plays again. */
  forget(key: string): void
  /** True once `playOnce` has played for this key. */
  hasPlayed(key: string): boolean
} = {
  name: 'frameAssemble',
  play(ctx, refs) {
    const tl = timelineFor(ctx, { defaults: { ease: ctx.eases['dur-5'], overwrite: 'auto' } })
    const tier = refs.tier ?? 'full'
    // Settled: the flourish is skipped. Every beat below is a `from` into the natural state, so
    // skipping them IS the end state.
    if (!ctx.enabled || tier === 'settled') return tl
    const move = transformsAllowed(ctx)
    if (refs.sidebarHeader) tl.fromTo(refs.sidebarHeader, { opacity: 0 }, { opacity: 1, duration: 0.18 }, 0)
    const rows = present(refs.stageRows ?? [])
    if (rows.length > 0) {
      tl.fromTo(
        rows,
        { x: move ? -8 : 0, opacity: 0 },
        { x: 0, opacity: 1, duration: ctx.durations['dur-3'], stagger: { each: 0.024, amount: STAGGER_1_AMOUNT_CAP }, clearProps: 'transform' },
        0.05,
      )
    }
    const chars = refs.titleChars ?? []
    if (chars.length > 0) tl.fromTo(chars, { opacity: 0 }, { opacity: 1, duration: ctx.durations['dur-3'], stagger: { amount: 0.2 } }, 0.1)
    if (refs.screenRoot) {
      tl.fromTo(refs.screenRoot, { y: move ? 6 : 0, opacity: 0 }, { y: 0, opacity: 1, duration: 0.24, ease: 'power3.out', clearProps: 'transform' }, 0.15)
    }
    if (refs.chatInner) {
      tl.fromTo(refs.chatInner, { x: move ? 12 : 0, opacity: 0 }, { x: 0, opacity: 1, duration: ctx.durations['dur-3'], clearProps: 'transform' }, 0.2)
    }
    if (refs.rail) {
      const rail = refs.rail
      tl.fromTo(rail, { draw: 0 }, { draw: 1, duration: 0.7, ease: ctx.eases['dur-4'], onUpdate: () => rail.onUpdate?.() }, FRAME_ASSEMBLE_JOIN_AT)
    }
    const stations = present(refs.stations ?? [])
    if (stations.length > 0) {
      tl.fromTo(stations, { ...POP.from, opacity: 0 }, { ...POP.to, opacity: 1, stagger: 0.06 }, 0.5)
    }
    for (const joiner of Array.from(joiners)) {
      const child = joiner(ctx, tl)
      if (child) tl.add(child, FRAME_ASSEMBLE_JOIN_AT)
    }
    // Quiet: the same choreography at `dur-4` end to end — a familiar project opens briskly.
    if (tier === 'quiet' && 'timeScale' in tl && typeof (tl as { timeScale?: unknown }).timeScale === 'function') {
      const total = (tl as unknown as gsap.core.Timeline).duration()
      if (total > MOTION_DURATIONS['dur-4']) (tl as unknown as gsap.core.Timeline).timeScale(total / MOTION_DURATIONS['dur-4'])
    }
    return tl
  },
  join(fn) {
    joiners.add(fn)
    return () => {
      joiners.delete(fn)
    }
  },
  playOnce(key, ctx, refs) {
    if (played.has(key)) return null
    played.add(key)
    return this.play(ctx, refs) as MotionTimeline
  },
  forget(key) {
    played.delete(key)
  },
  hasPlayed(key) {
    return played.has(key)
  },
}

/** For tests: forget every key and every joiner. */
export function resetFrameAssemble(): void {
  played.clear()
  joiners.clear()
}
