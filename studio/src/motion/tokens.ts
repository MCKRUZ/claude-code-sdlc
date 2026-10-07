// The §2.7 motion tokens as the renderer uses them. The VALUES live in `./contract.ts` (frozen in
// Wave 0-0 so the kit and the scenes spell the same numbers); this module only adds the two
// conveniences every choreography wants — a duration already resolved for the current reduced /
// off state, and the CSS-side millisecond spelling so a test can compare it with `index.css`.
import type { DurationToken, StaggerToken } from '../theme/tokens'
import {
  MOTION_DURATIONS, MOTION_EASES, MOTION_STAGGERS, REDUCED_CROSSFADE_S, STAGGER_1_AMOUNT_CAP,
} from './contract'

export { MOTION_DURATIONS as durations, MOTION_EASES as eases, MOTION_STAGGERS as staggers }

/** `--dur-N` as the CSS declares it: milliseconds, integer. */
export function durationMs(token: DurationToken): number {
  return Math.round(MOTION_DURATIONS[token] * 1000)
}

/** `--stagger-N` in milliseconds. */
export function staggerMs(token: StaggerToken): number {
  return Math.round(MOTION_STAGGERS[token] * 1000)
}

/** The stagger object GSAP wants for a list of rows. `stagger-1` carries the §2.7 `amount` cap so
 * forty rows still arrive inside one `dur-3`; `stagger-2` (cards, stations) is a plain `each`. */
export function staggerFor(token: StaggerToken): gsap.StaggerVars {
  return token === 'stagger-1'
    ? { each: MOTION_STAGGERS[token], amount: STAGGER_1_AMOUNT_CAP }
    : { each: MOTION_STAGGERS[token] }
}

/** How long an opacity crossfade may take under the §2.7 reduced / off rule: the token's own
 * length when motion is on, 120 ms when the OS asked for less, 0 when it is off. Transforms never
 * get this allowance — under reduced motion they are simply not tweened. */
export function crossfadeSeconds(token: DurationToken, state: { enabled: boolean; reduced: boolean }): number {
  if (!state.enabled) return 0
  if (state.reduced) return Math.min(MOTION_DURATIONS[token], REDUCED_CROSSFADE_S)
  return MOTION_DURATIONS[token]
}
