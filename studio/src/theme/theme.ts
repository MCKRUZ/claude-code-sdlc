// Theme resolution and application (studio-observatory.md §2.1). The preference lives in
// `localStorage['studio.theme']` as system | light | dark; `system` resolves through
// `matchMedia('(prefers-color-scheme: dark)')`, guarded so that an environment without matchMedia
// (jsdom before setupTests, SSR) resolves to light instead of throwing. `applyTheme()` is called
// synchronously in main.tsx before `createRoot`, so a dark preference never flashes light.
//
// No window access at module top level: node-env tests import the UI kit, which imports
// `useTheme`, which imports this. `motion.ts` is equally window-free at load.
import type { ThemeAttr, ThemePreference } from './tokens'
import { enabled as motionEnabled, reduced as motionReduced } from '../motion/motion'

export const THEME_STORAGE_KEY = 'studio.theme'
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark']
/** How long `html.theme-switching` stays on — the CSS cross-fade is 200 ms; the margin absorbs a
 * late frame so the class never comes off mid-transition. */
export const THEME_SWITCH_MS = 260

const DARK_QUERY = '(prefers-color-scheme: dark)'

function isPreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value)
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    // Accessing localStorage can itself throw (disabled storage, opaque origin).
    return null
  }
}

/** Guarded media query: null wherever matchMedia is not a function. */
function darkQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(DARK_QUERY)
}

/** The stored preference; anything unreadable or unknown is `system`. */
export function readThemePreference(): ThemePreference {
  const raw = storage()?.getItem(THEME_STORAGE_KEY)
  return isPreference(raw) ? raw : 'system'
}

/** What the OS asks for, guarded: light when the question cannot be asked. */
export function systemTheme(): ThemeAttr {
  return darkQuery()?.matches ? 'dark' : 'light'
}

/** `system` becomes the OS answer; an explicit choice is itself. */
export function resolveTheme(preference: ThemePreference = readThemePreference()): ThemeAttr {
  return preference === 'system' ? systemTheme() : preference
}

let switchTimer: ReturnType<typeof setTimeout> | null = null

// --- M10 "dusk" reveal ------------------------------------------------------------------------
// When the person flips the theme with motion on, the new theme is revealed as a circle growing
// from where they clicked (`::view-transition-new(root)` in base.css, 420 ms). The origin is the
// last `pointerdown` seen on the window — recorded by a capture listener bound lazily on the
// first `applyTheme` with a document — or the window centre when the last input was the keyboard
// (⌘⇧D). The flip itself is still synchronous inside the transition callback; a document without
// `startViewTransition`, motion off, or reduced motion fall back to the 200 ms cross-fade.

type RevealOrigin = { x: number; y: number } | null
let lastPointer: RevealOrigin = null
let lastInputWasKeyboard = false
let revealBound = false

function bindRevealOrigin(): void {
  if (revealBound || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
  revealBound = true
  window.addEventListener('pointerdown', (e) => {
    lastPointer = { x: e.clientX, y: e.clientY }
    lastInputWasKeyboard = false
  }, true)
  window.addEventListener('keydown', () => {
    lastInputWasKeyboard = true
  }, true)
}

/** Where the reveal grows from: the last pointer, or the window centre after a key. Exported for
 * the test and for a caller that wants to show the origin it will use. */
export function themeRevealOrigin(): { x: string; y: string } {
  if (lastInputWasKeyboard || lastPointer === null) return { x: '50%', y: '50%' }
  return { x: `${Math.round(lastPointer.x)}px`, y: `${Math.round(lastPointer.y)}px` }
}

/** The seams a test replaces: whether motion is on (read from `motion.ts` by default) and the
 * document's `startViewTransition`. `null` restores the defaults and forgets the last origin. */
export interface ThemeRevealEnvironment {
  motionOn(): boolean
  startViewTransition(update: () => void): { finished: Promise<unknown> } | null
}

const defaultRevealEnvironment: ThemeRevealEnvironment = {
  motionOn: () => motionEnabled() && !motionReduced(),
  startViewTransition(update) {
    type Transition = { finished: Promise<unknown>; ready?: Promise<unknown>; updateCallbackDone?: Promise<unknown> }
    const doc = document as Document & { startViewTransition?: (cb: () => void) => Transition }
    if (typeof doc.startViewTransition !== 'function') return null
    const transition = doc.startViewTransition(update)
    // A transition the browser skips (a second one starts, the window is hidden, the walk is
    // quick) rejects `ready` with "Transition was skipped" while `finished` still settles. Nobody
    // waits on `ready`, so the rejection surfaced as an uncaught page error — observe it here.
    const swallow = () => {}
    transition.ready?.then(swallow, swallow)
    transition.updateCallbackDone?.then(swallow, swallow)
    return transition
  },
}

let revealEnvironment: ThemeRevealEnvironment = defaultRevealEnvironment

export function configureThemeRevealForTests(overrides: Partial<ThemeRevealEnvironment> | null): void {
  revealEnvironment = overrides ? { ...defaultRevealEnvironment, ...overrides } : defaultRevealEnvironment
  lastPointer = null
  lastInputWasKeyboard = false
}

/** Records a pointer origin without a real event — for a test, or a caller with its own event. */
export function noteThemeRevealPointer(x: number, y: number): void {
  lastPointer = { x, y }
  lastInputWasKeyboard = false
}

export function noteThemeRevealKeyboard(): void {
  lastInputWasKeyboard = true
}

/** Sets `<html data-theme>` to the resolved theme. When the theme actually changes on an already
 * themed document, `html.theme-switching` is toggled on for `THEME_SWITCH_MS` so the CSS
 * cross-fade in base.css runs — but not on the first application (nothing to fade from) and not
 * when motion is off (the cross-fade is a transition, and `[data-motion="off"]` zeroes it anyway).
 * With motion on and `startViewTransition` available, the flip runs inside a view transition
 * (M10) and `data-view-transition` marks the document for its duration. Returns the resolved
 * theme — synchronously in every case: the attribute is set before this returns. */
export function applyTheme(preference: ThemePreference = readThemePreference()): ThemeAttr {
  const resolved = resolveTheme(preference)
  if (typeof document === 'undefined') return resolved
  bindRevealOrigin()
  const html = document.documentElement
  const previous = html.getAttribute('data-theme')
  if (previous === resolved) return resolved
  const flip = () => {
    if (previous !== null) {
      html.classList.add('theme-switching')
      if (switchTimer !== null) clearTimeout(switchTimer)
      switchTimer = setTimeout(() => {
        html.classList.remove('theme-switching')
        switchTimer = null
      }, THEME_SWITCH_MS)
    }
    html.setAttribute('data-theme', resolved)
  }
  if (previous !== null && revealEnvironment.motionOn()) {
    const origin = themeRevealOrigin()
    html.style.setProperty('--theme-reveal-x', origin.x)
    html.style.setProperty('--theme-reveal-y', origin.y)
    html.setAttribute('data-view-transition', '')
    let transition: { finished: Promise<unknown> } | null = null
    try {
      // The browser snapshots the old frame, runs `flip` synchronously, then animates the new one.
      transition = revealEnvironment.startViewTransition(flip)
    } catch {
      transition = null
    }
    if (transition) {
      const done = () => {
        html.removeAttribute('data-view-transition')
        html.style.removeProperty('--theme-reveal-x')
        html.style.removeProperty('--theme-reveal-y')
      }
      transition.finished.then(done, done)
      // The flip runs inside the callback, AFTER the browser has captured the old frame — setting
      // the attribute here too would put the new theme into the old snapshot and there would be
      // nothing to reveal. The return value is still the resolved theme the document is moving to.
      return resolved
    }
    html.removeAttribute('data-view-transition')
    html.style.removeProperty('--theme-reveal-x')
    html.style.removeProperty('--theme-reveal-y')
  }
  flip()
  return resolved
}

const preferenceListeners = new Set<(preference: ThemePreference) => void>()

/** Persists the preference and applies it. Storage failures are swallowed: the theme still
 * applies for this session, it just will not survive a restart. Every subscriber from
 * `subscribeThemePreference` is told afterwards, so the two writers — `ThemeProvider.setTheme`
 * and the kit's `ThemeToggle` — stay in step whichever one a person used. */
export function setThemePreference(preference: ThemePreference): ThemeAttr {
  try {
    storage()?.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // quota or disabled storage — apply anyway
  }
  const resolved = applyTheme(preference)
  for (const listener of preferenceListeners) listener(preference)
  return resolved
}

/** Called with the new preference after every `setThemePreference`. Returns the unsubscribe. */
export function subscribeThemePreference(listener: (preference: ThemePreference) => void): () => void {
  preferenceListeners.add(listener)
  return () => {
    preferenceListeners.delete(listener)
  }
}

/** Re-applies the theme whenever the OS scheme changes while the preference is `system`, and
 * calls `listener` with the new resolved theme. Returns the unsubscribe; a no-op when matchMedia
 * is unavailable. */
export function subscribeSystemTheme(listener?: (resolved: ThemeAttr) => void): () => void {
  const query = darkQuery()
  if (query === null) return () => {}
  const onChange = () => {
    if (readThemePreference() !== 'system') return
    listener?.(applyTheme('system'))
  }
  // `addEventListener` is the modern API; the deprecated `addListener` pair is what older
  // Electron/Chromium builds and some test stubs still expose.
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }
  query.addListener(onChange)
  return () => query.removeListener(onChange)
}
