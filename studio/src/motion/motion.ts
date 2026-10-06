// The one definition of "is motion on" for the whole renderer (studio-observatory.md §4.1):
//
//   enabled() = MODE !== 'test' && preference !== 'off' && !(reduced() && preference !== 'on')
//
// Everything else in `src/motion/` asks this module rather than reading `matchMedia` or the
// preference itself, so a test build, an `off` preference and an OS reduced-motion setting all
// switch every choreography off through the same gate. No GSAP import here: node-env tests load
// this file to check the rule without pulling in an animation engine.
import type { FamiliarityApi, FamiliarityTier, MotionApi, MotionPreference } from './contract'
import { FAMILIARITY_FULL_MAX_OPENS, FAMILIARITY_QUIET_MAX_OPENS, MOTION_DURATIONS, MOTION_EASES, MOTION_PREFERENCES } from './contract'

export const MOTION_STORAGE_KEY = 'studio.motion'
/** M3: `studio.opens.<hash>` — one counter per project, keyed by a hash so a path never lands in
 * storage as itself (a path can name a client). */
export const OPENS_STORAGE_PREFIX = 'studio.opens.'
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

// --- round 2: familiarity (M3) ----------------------------------------------------------------
// How many times this person has opened this project, as a TIER, never a date: opens 1–3 play
// the full opening, 4–10 a quieter one, past ten the flourishes are skipped. The count lives in
// `localStorage['studio.opens.<hash>']`; storage that is blocked reads as "first opens", because
// a counter that cannot be kept must not make the app quieter than the person has earned.

/** FNV-1a over the UTF-16 code units, hex — stable, short, and never the key itself. */
export function hashProjectKey(projectKey: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < projectKey.length; i += 1) {
    hash ^= projectKey.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function opensStorageKey(projectKey: string): `${typeof OPENS_STORAGE_PREFIX}${string}` {
  return `${OPENS_STORAGE_PREFIX}${hashProjectKey(projectKey)}`
}

function readOpens(projectKey: string): number {
  try {
    if (typeof localStorage === 'undefined') return 0
    const raw = localStorage.getItem(opensStorageKey(projectKey))
    const n = raw === null ? 0 : Number(raw)
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
  } catch {
    return 0
  }
}

function writeOpens(projectKey: string, count: number): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (count <= 0) localStorage.removeItem(opensStorageKey(projectKey))
    else localStorage.setItem(opensStorageKey(projectKey), String(count))
  } catch {
    // Not remembered this time; the tier stays what it was for this session.
  }
}

/** The tier for a count: the contract's two thresholds, nothing else. A count of 0 (never
 * recorded, or storage blocked) is a first open. */
export function tierForOpens(count: number): FamiliarityTier {
  if (count <= FAMILIARITY_FULL_MAX_OPENS) return 'full'
  if (count <= FAMILIARITY_QUIET_MAX_OPENS) return 'quiet'
  return 'settled'
}

export function familiarity(projectKey: string): FamiliarityTier {
  return tierForOpens(readOpens(projectKey))
}

/** One increment per open — the Frame calls it once per `projectPath` mount, Welcome once per
 * mount; a `refreshStatus` re-render is not an open. */
export function recordOpen(projectKey: string): void {
  writeOpens(projectKey, readOpens(projectKey) + 1)
}

/** Appearance's "Play the opening again": the next open is a first open. */
export function resetFamiliarity(projectKey: string): void {
  writeOpens(projectKey, 0)
}

/** The `MotionApi` object the contract describes, for callers that prefer one handle. Round 2
 * widens it with the familiarity verbs (`FamiliarityApi`); `MotionApi` itself is unchanged. */
export const motion = {
  enabled,
  reduced,
  get preference() {
    return currentPreference()
  },
  setPreference,
  subscribe,
  durations: MOTION_DURATIONS,
  eases: MOTION_EASES,
  familiarity,
  recordOpen,
  resetFamiliarity,
} satisfies MotionApi & FamiliarityApi
