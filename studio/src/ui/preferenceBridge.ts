// The Preferences toggles' read/write seam. The toggles do not own a preference: `theme.ts`,
// `density.ts` and `motion.ts` are the single writers of `studio.theme|density|motion` and the
// `<html data-*>` attributes, and this module only (a) forwards to them and (b) turns the three
// into one external store so a toggle in the Sidebar footer and one in Settings re-render
// together — whichever module a write came through. SSR-safe: no `window` at module load.
import { useSyncExternalStore } from 'react'
import type { DensityAttr, ThemePreference } from '../theme/tokens'
import type { MotionPreference } from '../motion/contract'
import { DENSITIES, readDensity as readStoredDensity, setDensity } from '../theme/density'
import { THEME_PREFERENCES, readThemePreference, setThemePreference, subscribeThemePreference } from '../theme/theme'
import { MOTION_PREFERENCES } from '../motion/contract'
import { getPreference, setPreference, subscribe as subscribeMotion } from '../motion/motion'

export const THEME_OPTIONS: readonly ThemePreference[] = THEME_PREFERENCES
export const DENSITY_OPTIONS: readonly DensityAttr[] = DENSITIES
export const MOTION_OPTIONS: readonly MotionPreference[] = MOTION_PREFERENCES

// Density has no subscription of its own (it is applied once and only a toggle changes it), so
// the bridge notifies for it; theme and motion notify through their modules and are re-emitted.
const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

export function readTheme(): ThemePreference {
  return readThemePreference()
}

export function readDensity(): DensityAttr {
  return readStoredDensity()
}

export function readMotion(): MotionPreference {
  return getPreference()
}

/** `data-theme` is always the RESOLVED value (`light` | `dark`), never `system`. */
export function writeTheme(next: ThemePreference) {
  setThemePreference(next)
}

export function writeDensity(next: DensityAttr) {
  setDensity(next)
  notify()
}

/** `data-motion` is `on` | `off`: `auto` resolves against reduced-motion, `on` overrides it. */
export function writeMotion(next: MotionPreference) {
  setPreference(next)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const unsubscribeTheme = subscribeThemePreference(listener)
  const unsubscribeMotion = subscribeMotion(listener)
  // Another window (or devtools) editing storage: re-read rather than trust the cached value.
  const onStorage = () => listener()
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    unsubscribeTheme()
    unsubscribeMotion()
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}

export function usePreference<T extends string>(reader: () => T): T {
  return useSyncExternalStore(subscribe, reader, reader)
}
