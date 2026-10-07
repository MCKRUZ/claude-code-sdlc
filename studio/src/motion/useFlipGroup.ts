// Flip for a list whose order or grouping changes (§4.1 `useFlipGroup`, rows #6, #7, #25):
// `capture()` BEFORE the state change records where every `[data-flip-id]` child is;
// after React commits, the hook's layout effect finds the pending state and `Flip.from`s it, so
// the rows glide from old to new place. `absolute: true` is scoped by the container: the list
// itself must be the positioned, scrolled ancestor (not `<main>`), otherwise the absolute
// positions are offset by `<main>`'s scroll. Over 80 targets the hook does nothing — a Flip of
// that size would blow the §4 tween budget and read as noise anyway.
import { useCallback, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { gsap } from 'gsap'
import { Flip } from 'gsap/Flip'
import { MOTION_DURATIONS } from './contract'
import { enabled } from './motion'

export const FLIP_TARGET_CAP = 80

export interface FlipGroupOptions {
  duration?: number
  ease?: string
  /** Seconds between each row's start. */
  stagger?: number
}

export interface FlipGroup {
  /** Call before the fact changes (in the event handler). No-op when disabled or over the cap. */
  capture(): void
  /** Run the pending Flip now. Normally not needed — the hook runs it after the next commit. */
  play(overrides?: Flip.FromToVars): gsap.core.Timeline | null
  /** True between a `capture()` and the Flip that consumes it. */
  readonly pending: boolean
}

const DEFAULTS: Required<FlipGroupOptions> = {
  duration: MOTION_DURATIONS['dur-4'],
  ease: 'power3.inOut',
  stagger: 0.012,
}

export function useFlipGroup(
  containerRef: RefObject<HTMLElement | null>,
  selector = '[data-flip-id]',
  options: FlipGroupOptions = {},
): FlipGroup {
  const pendingRef = useRef<Flip.FlipState | null>(null)
  const optionsRef = useRef({ ...DEFAULTS, ...options })
  optionsRef.current = { ...DEFAULTS, ...options }

  const capture = useCallback(() => {
    pendingRef.current = null
    if (!enabled()) return
    const container = containerRef.current
    if (!container) return
    const targets = container.querySelectorAll(selector)
    if (targets.length === 0 || targets.length > FLIP_TARGET_CAP) return
    pendingRef.current = Flip.getState(targets)
  }, [containerRef, selector])

  const play = useCallback((overrides: Flip.FromToVars = {}) => {
    const state = pendingRef.current
    pendingRef.current = null
    if (!state || !enabled()) return null
    const container = containerRef.current
    if (!container) return null
    const after = container.querySelectorAll(selector)
    if (after.length > FLIP_TARGET_CAP) return null
    const { duration, ease, stagger } = optionsRef.current
    return Flip.from(state, {
      targets: after,
      absolute: true,
      nested: true,
      scale: false,
      duration,
      ease,
      stagger,
      // A row that appears fades in from just below; one that leaves fades out in place.
      onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration, ease, clearProps: 'transform' }),
      onLeave: (els) => gsap.to(els, { opacity: 0, duration: duration / 2 }),
      ...overrides,
    })
  }, [containerRef, selector])

  // No dependency list on purpose: a captured state must be consumed by whichever commit comes
  // next, and the hook cannot know which prop that commit changes.
  useLayoutEffect(() => {
    if (pendingRef.current) play()
  })

  return {
    capture,
    play,
    get pending() {
      return pendingRef.current !== null
    },
  }
}
