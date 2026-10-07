// Puts the theme in React context (studio-observatory.md §2.1). The document attribute is the
// source of truth and is already set by main.tsx before this mounts; the provider only mirrors it
// into state so components re-render on a change, and keeps following the OS while the
// preference is `system`.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ThemeAttr, ThemePreference } from './tokens'
import { ThemeContext, type ThemeContextValue } from './useTheme'
import {
  applyTheme, readThemePreference, resolveTheme, setThemePreference, subscribeSystemTheme, subscribeThemePreference,
} from './theme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() => readThemePreference())
  // Resolve from the preference rather than reading the attribute back, so the initial render
  // is consistent even if something else touched `data-theme`.
  const [resolved, setResolved] = useState<ThemeAttr>(() => resolveTheme(theme))

  // Apply once on mount in case main.tsx did not (a test rendering the provider alone), then
  // follow the OS. `applyTheme` is idempotent: when the attribute already matches, nothing
  // happens — no cross-fade class, no re-render.
  useEffect(() => {
    setResolved(applyTheme(theme))
    return subscribeSystemTheme((next) => setResolved(next))
  }, [theme])

  // A write from outside the provider (the kit's ThemeToggle in Settings or the Sidebar footer
  // goes through `setThemePreference` directly) must reach `useTheme()` readers too, or the
  // context would report the preference from before the click.
  useEffect(() => subscribeThemePreference((next) => setThemeState(next)), [])

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next)
    setResolved(setThemePreference(next))
  }, [])

  const value = useMemo<ThemeContextValue>(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
