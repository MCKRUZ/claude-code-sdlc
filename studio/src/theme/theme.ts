// Theme resolution and application (studio-observatory.md §2.1). The preference lives in
// `localStorage['studio.theme']` as system | light | dark; `system` resolves through
// `matchMedia('(prefers-color-scheme: dark)')`, guarded so that an environment without matchMedia
// (jsdom before setupTests, SSR) resolves to light instead of throwing. `applyTheme()` is called
// synchronously in main.tsx before `createRoot`, so a dark preference never flashes light.
//
// No window access at module top level: node-env tests import the UI kit, which imports
// `useTheme`, which imports this.
import type { ThemeAttr, ThemePreference } from './tokens'

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

/** Sets `<html data-theme>` to the resolved theme. When the theme actually changes on an already
 * themed document, `html.theme-switching` is toggled on for `THEME_SWITCH_MS` so the CSS
 * cross-fade in base.css runs — but not on the first application (nothing to fade from) and not
 * when motion is off (the cross-fade is a transition, and `[data-motion="off"]` zeroes it anyway).
 * Returns the resolved theme. */
export function applyTheme(preference: ThemePreference = readThemePreference()): ThemeAttr {
  const resolved = resolveTheme(preference)
  if (typeof document === 'undefined') return resolved
  const html = document.documentElement
  const previous = html.getAttribute('data-theme')
  if (previous === resolved) return resolved
  if (previous !== null) {
    html.classList.add('theme-switching')
    if (switchTimer !== null) clearTimeout(switchTimer)
    switchTimer = setTimeout(() => {
      html.classList.remove('theme-switching')
      switchTimer = null
    }, THEME_SWITCH_MS)
  }
  html.setAttribute('data-theme', resolved)
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
