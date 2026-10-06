// The current-station breathing (§4.1 `pulse.ts`, §2.7 "Ambient"): scale 1→1.18 and back on a
// 2.4 s `sine.inOut`, one of the two permitted tweens that is not evidence of a change. It stops
// after three cycles unless `hold()` says the pointer is in the sidebar — ambient motion that
// never stops becomes the thing a person's eye keeps returning to. `register.ts` pauses the
// global timeline when the window is hidden, so the pulse pauses with it.
import { gsap } from 'gsap'
import type { PulseOptions } from './contract'
import { AMBIENT_MAX_CYCLES, AMBIENT_PERIOD_S, MOTION_EASES } from './contract'
import { enabled } from './motion'

export interface PulseHandle {
  /** Start over from scale 1 — called when `status.stages` changes. */
  restart(): void
  /** Stop and clear the transform. */
  kill(): void
  /** Completed half-cycles so far (two per breath). Exposed for tests. */
  readonly halfCycles: number
}

const NOOP: PulseHandle = { restart() {}, kill() {}, halfCycles: 0 }

export function attachPulse(el: Element | null, options: PulseOptions = {}): PulseHandle {
  if (!el || !enabled()) return NOOP
  const cycles = options.cycles ?? AMBIENT_MAX_CYCLES
  const hold = options.hold ?? (() => false)
  let halfCycles = 0
  let tween: gsap.core.Tween | null = null

  const settle = () => {
    tween?.kill()
    tween = null
    gsap.set(el, { clearProps: 'transform' })
  }

  const start = () => {
    settle()
    halfCycles = 0
    tween = gsap.to(el, {
      scale: 1.18,
      duration: AMBIENT_PERIOD_S / 2,
      ease: MOTION_EASES.ambient,
      yoyo: true,
      repeat: -1,
      transformOrigin: 'center',
      onRepeat: () => {
        halfCycles += 1
        // Only stop at the END of a yoyo (an even half-cycle), so the station is back at scale 1
        // — pausing mid-breath would leave it enlarged.
        if (halfCycles % 2 === 0 && halfCycles / 2 >= cycles && !hold()) settle()
      },
    })
  }

  start()
  return {
    restart: start,
    kill: settle,
    get halfCycles() {
      return halfCycles
    },
  }
}
