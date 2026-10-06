// The one definition of "is motion on" for the whole renderer (studio-observatory.md §4.1):
//
//   enabled() = MODE !== 'test' && preference !== 'off' && !(reduced() && preference !== 'on')
//
// Everything else in `src/motion/` asks this module rather than reading `matchMedia` or the
// preference itself, so a test build, an `off` preference and an OS reduced-motion setting all
// switch every choreography off through the same gate. No GSAP import here: node-env tests load
// this file to check the rule without pulling in an animation engine.
import type { MotionApi, MotionPreference } from './contract'
import { MOTION_DURATIONS, MOTION_EASES, MOTION_PREFERENCES } from './contract'

export const MOTION_STORAGE_KEY = 'studio.motion'
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

/** The seams a test may replace. `isTestMode` reads `import.meta.env.MODE` at CALL time (not at
 * module load), so `vi.stubEnv('MODE', 'development')` also works; the override exists for a
 * test that wants to force the mode without touching the environment at all. */
export interface MotionEnvironment {
  isTestMode(): boolean
}

const defaultEnvironment: MotionEnvironment = {
  isTestMode: () => import.meta.env.MODE === 'test',
}

let environment: MotionEnvironment = defaultEnvironment
let preference: MotionPreference | null = null
let mediaList: MediaQueryList | null = null
let mediaBound = false
const listeners = new Set<() => void>()

function isPreference(value: unknown): value is MotionPreference {
  return typeof value === 'string' && (MOTION_PREFERENCES as readonly string[]).includes(value)
}

/** A stored preference is a convenience, never something to fail on: blocked storage or a stale
 * value just means `auto`. */
function readStoredPreference(): MotionPreference {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(MOTION_STORAGE_KEY)
    return isPreference(raw) ? raw : 'auto'
  } catch {
    return 'auto'
  }
}

function storePreference(next: MotionPreference): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (next === 'auto') localStorage.removeItem(MOTION_STORAGE_KEY)
    else localStorage.setItem(MOTION_STORAGE_KEY, next)
  } catch {
    // Not remembered this time; the preference still applies for this session.
  }
}

function currentPreference(): MotionPreference {
  if (preference === null) preference = readStoredPreference()
  return preference
}

function mediaQuery(): MediaQueryList | null {
  if (mediaList) return mediaList
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  try {
    mediaList = window.matchMedia(REDUCED_QUERY)
  } catch {
    return null
  }
  return mediaList
}

/** Honours the OS setting; false when `matchMedia` is missing (jsdom before setupTests, SSR). */
export function reduced(): boolean {
  return mediaQuery()?.matches ?? false
}

export function enabled(): boolean {
  if (environment.isTestMode()) return false
  const pref = currentPreference()
  if (pref === 'off') return false
  return !(reduced() && pref !== 'on')
}

/** `<html data-motion>` is what the CSS half reads (`[data-motion="off"]` in index.css). */
export function applyMotionAttribute(): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.motion = enabled() ? 'on' : 'off'
}

function notify(): void {
  applyMotionAttribute()
  for (const listener of listeners) listener()
}

/** Bound once, lazily, so a module import has no side effect and the stubbed `matchMedia` in
 * setupTests (which has `addEventListener` but no `addListener`) is enough. */
function bindMedia(): void {
  if (mediaBound) return
  const list = mediaQuery()
  if (!list) return
  mediaBound = true
  if (typeof list.addEventListener === 'function') list.addEventListener('change', notify)
  else if (typeof list.addListener === 'function') list.addListener(notify)
}

export function setPreference(next: MotionPreference): void {
  if (!isPreference(next)) return
  preference = next
  storePreference(next)
  notify()
}

export function getPreference(): MotionPreference {
  return currentPreference()
}

export function subscribe(listener: () => void): () => void {
  bindMedia()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Idempotent start-up: read the preference, bind the media listener, stamp `data-motion` so the
 * first paint already has the right CSS state. `register.ts` calls it when a window exists. */
export function initMotion(): void {
  currentPreference()
  bindMedia()
  applyMotionAttribute()
}

/** Test seam. `null` restores the real environment. Resets the cached preference and media list
 * too, so a test that changes `localStorage` or `matchMedia` between cases sees its change. */
export function configureMotionForTests(overrides: Partial<MotionEnvironment> | null): void {
  environment = overrides ? { ...defaultEnvironment, ...overrides } : defaultEnvironment
  preference = null
  mediaList = null
  mediaBound = false
}

/** The `MotionApi` object the contract describes, for callers that prefer one handle. */
export const motion: MotionApi = {
  enabled,
  reduced,
  get preference() {
    return currentPreference()
  },
  setPreference,
  subscribe,
  durations: MOTION_DURATIONS,
  eases: MOTION_EASES,
}
