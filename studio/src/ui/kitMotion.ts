// The kit's one door into the motion layer (round 2: Dialog, Toast, HoverCard, Tooltip). A
// primitive never reads `matchMedia` or the preference itself and never imports gsap: it builds a
// `ChoreoContext` here — enabled/reduced resolved by `motion.ts`, the one definition for the whole
// renderer — and hands it to a catalogue row. Under MODE=test, an `off` preference or the OS's
// reduced-motion setting the context is disabled and every row applies its end state instantly,
// so a component test sees the final DOM and a cold reload equals the animation's end.
import { MOTION_DURATIONS, MOTION_EASES, type ChoreoContext } from '../motion/contract'
import { enabled, reduced } from '../motion/motion'
import { contextFrom } from '../motion/choreo/_shared'

/** True when a choreography would actually move something — the only question a primitive may
 * ask, and only to decide whether to keep a node mounted while its exit plays. */
export function motionEnabled(): boolean {
  return enabled()
}

export function kitChoreoContext(scope: Element): ChoreoContext {
  return contextFrom(scope, { enabled: enabled(), reduced: reduced() }, { durations: MOTION_DURATIONS, eases: MOTION_EASES })
}
