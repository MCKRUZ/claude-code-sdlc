// Frames only while something is happening (studio-observatory.md §5.0 `useDemandLoop`).
//
// Every Canvas runs `frameloop="demand"`: nothing renders until someone calls `invalidate()`.
// This hook is the one place that calls it on a clock. While the scene is LIVE (pointer inside,
// a timeline playing, orbit damping unsettled) AND its figure is visible AND motion is enabled, it
// invalidates at most `fps` times a second from GSAP's shared ticker (one rAF for the whole
// renderer, paused by GSAP when the tab is hidden). An idle scene renders zero frames.
//
// `onTick` is how orbit damping rides the same loop: it runs before each invalidate and may
// return false to say "settled", which stops the loop until `live` flips again.
import { useContext, useEffect, useSyncExternalStore } from 'react'
import { useThree } from '@react-three/fiber'
import gsap from 'gsap'
import { motion } from '../../motion/motion'
import { CanvasActivityContext } from './canvasActivity'

export interface DemandLoopOptions {
  /** Ceiling, not a target: the ticker may run slower. Default 30; Ambient uses 24. */
  fps?: number
  /** Runs once per emitted frame with the elapsed seconds since the previous one; return false
   * to stop the loop (damping settled). */
  onTick?: (deltaSeconds: number) => boolean | void
}

const motionOff = () => false

/** `motion.enabled()` as reactive state, so a preference flip stops a running loop. */
export function useMotionEnabled(): boolean {
  return useSyncExternalStore(motion.subscribe, () => motion.enabled(), motionOff)
}

export function useDemandLoop(live: boolean, options: DemandLoopOptions = {}): void {
  const { fps = 30, onTick } = options
  const invalidate = useThree((s) => s.invalidate)
  const active = useContext(CanvasActivityContext)
  const enabled = useMotionEnabled()

  useEffect(() => {
    if (!live || !active || !enabled) return
    const interval = 1 / fps
    let last = -Infinity
    let stopped = false
    // GSAP hands the ticker's time in seconds.
    const tick = (time: number) => {
      if (stopped || time - last < interval) return
      const delta = last === -Infinity ? interval : time - last
      last = time
      if (onTick && onTick(delta) === false) {
        stopped = true
        gsap.ticker.remove(tick)
        return
      }
      invalidate()
    }
    gsap.ticker.add(tick)
    return () => {
      stopped = true
      gsap.ticker.remove(tick)
    }
  }, [live, active, enabled, fps, onTick, invalidate])
}
