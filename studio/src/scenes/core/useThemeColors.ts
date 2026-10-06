// Theme tokens as three.js colours (studio-observatory.md §5.0 `useThemeColors`).
//
// The CSS is the single source of truth for every colour, and a theme flip is a change of
// `data-theme` on <html> — so a scene reads its colours from `getComputedStyle` rather than
// carrying a second palette, and re-reads when that attribute changes. `Color.setStyle` runs
// the sRGB → linear conversion three's ColorManagement expects, and CanvasHost sets the output
// colour space back to sRGB with no tone mapping, so a hex token renders as exactly that hex.
//
// Must be called inside a Canvas (it invalidates the demand loop after a re-read).
import { useEffect, useMemo, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { Color } from 'three'
import type { ColorToken, ThemeAttr } from '../../theme/tokens'

// A token the CSS does not define yet (or a jsdom with no stylesheet) reads as mid grey rather
// than three's default white, so the gap is visible and never mistaken for a design choice.
const FALLBACK = '#808080'

export function readToken(name: ColorToken): string {
  if (typeof document === 'undefined') return FALLBACK
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim()
  return raw === '' ? FALLBACK : raw
}

export function readThemeAttr(): ThemeAttr {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

/** Bumps once per `data-theme` change on <html>; the shared observer for both hooks below. */
function useThemeVersion(): number {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (typeof MutationObserver !== 'function' || typeof document === 'undefined') return
    const observer = new MutationObserver(() => setVersion((v) => v + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return version
}

/** The named tokens as `Color`s, re-read on theme change. Pass a stable array (or `as const`
 * literal) so the memo holds; the colours are new instances after each theme flip. */
export function useThemeColors<K extends ColorToken>(names: readonly K[]): Record<K, Color> {
  const invalidate = useThree((s) => s.invalidate)
  const version = useThemeVersion()
  const key = names.join('|')
  const colors = useMemo(() => {
    const out = {} as Record<K, Color>
    for (const name of names) out[name] = new Color().setStyle(readToken(name))
    return out
    // `key` stands in for `names` so a caller passing a fresh array literal each render still
    // gets the memo; `version` forces the re-read after a theme flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version])
  useEffect(() => {
    if (version > 0) invalidate()
  }, [version, invalidate])
  return colors
}

/** `light` or `dark` as resolved on <html>, re-rendering on change. */
export function useThemeAttr(): ThemeAttr {
  const version = useThemeVersion()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => readThemeAttr(), [version])
}
