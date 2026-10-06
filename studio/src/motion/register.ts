// GSAP's one-time setup, imported once from `main.tsx` for its side effects (§4.1). Only the
// core plugins the whole renderer needs are registered here — SplitText, DrawSVG and Observer
// are `await import()`ed by the choreography that uses them, so a screen that never splits a
// title never pays for the plugin. `gsap.matchMedia` and ScrollTrigger are never imported:
// `motion.ts` is the single reduced-motion gate, and the app does not scroll-drive anything.
//
// Everything is guarded on `window` so the module is harmless under renderToStaticMarkup.
import { gsap } from 'gsap'
import { Flip } from 'gsap/Flip'
import { useGSAP } from '@gsap/react'
import { initMotion } from './motion'

let registered = false

export function registerMotion(): void {
  if (registered || typeof window === 'undefined') return
  registered = true

  gsap.registerPlugin(useGSAP, Flip)
  // §2.7 default is `dur-2` with `power2.out`; `overwrite: 'auto'` so an interrupted assemble
  // (row #2) hands over to the next tween on the same property instead of fighting it.
  gsap.defaults({ ease: 'power2.out', duration: 0.2, overwrite: 'auto' })
  // After a long stall (a debugger pause, the window hidden) the ticker treats the gap as 33 ms
  // rather than replaying a second of motion in one frame.
  gsap.ticker.lagSmoothing(500, 33)

  // Electron throttles rAF in a hidden window; pausing the global timeline too means a tween
  // that started just before the person switched away does not finish in a burst when they
  // come back, and the current-station pulse (`pulse.ts`) stops with it.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) gsap.globalTimeline.pause()
    else gsap.globalTimeline.resume()
  })

  initMotion()
}

registerMotion()
