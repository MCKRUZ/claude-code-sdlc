// The theme context's shape and hook. Kept apart from ThemeProvider.tsx so a component can import
// the hook without pulling React's provider JSX into a node-env test, and so the context object
// itself is shared by exactly one module.
import { createContext, useContext } from 'react'
import type { ThemeAttr, ThemePreference } from './tokens'

export interface ThemeContextValue {
  /** The stored preference: system | light | dark. */
  theme: ThemePreference
  /** What `<html data-theme>` currently is — never `system`. */
  resolved: ThemeAttr
  /** Persists, applies (with the cross-fade) and re-renders subscribers. */
  setTheme(next: ThemePreference): void
}

/** The default is a live-but-inert value, so a component rendered outside the provider (a
 * node-env `renderToStaticMarkup` test, a storybook-style harness) reads light and can still call
 * `setTheme` without throwing — it simply changes nothing. */
const INERT: ThemeContextValue = {
  theme: 'system',
  resolved: 'light',
  setTheme: () => {},
}

export const ThemeContext = createContext<ThemeContextValue>(INERT)

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
