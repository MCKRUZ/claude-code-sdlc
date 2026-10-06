// @vitest-environment jsdom
/** The theme mechanics of studio-observatory.md §2.1: how a preference resolves, that the
 * attribute is applied synchronously (so dark never flashes light), that it persists, that the
 * OS is followed only for `system`, and that an environment with no matchMedia reads light. */
import { createElement } from 'react'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  THEME_STORAGE_KEY, THEME_SWITCH_MS, applyTheme, readThemePreference, resolveTheme,
  setThemePreference, subscribeSystemTheme,
} from '../../src/theme/theme'
import { DENSITY_STORAGE_KEY, applyDensity, readDensity, setDensity } from '../../src/theme/density'
import { ThemeProvider } from '../../src/theme/ThemeProvider'
import { useTheme } from '../../src/theme/useTheme'

type Listener = (e: { matches: boolean }) => void

/** A matchMedia stub whose answer for the dark query can be changed and whose change listeners
 * can be fired — setupTests' inert stub answers false and never fires. */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<Listener>()
  const state = { matches }
  window.matchMedia = (query: string) =>
    ({
      get matches() { return query.includes('dark') ? state.matches : false },
      media: query,
      onchange: null,
      addEventListener: (_: string, l: Listener) => { listeners.add(l) },
      removeEventListener: (_: string, l: Listener) => { listeners.delete(l) },
      addListener: (l: Listener) => { listeners.add(l) },
      removeListener: (l: Listener) => { listeners.delete(l) },
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
  return {
    set(next: boolean) {
      state.matches = next
      for (const l of listeners) l({ matches: next })
    },
    get size() { return listeners.size },
  }
}

const originalMatchMedia = window.matchMedia
const html = () => document.documentElement

beforeEach(() => {
  localStorage.clear()
  html().removeAttribute('data-theme')
  html().removeAttribute('data-density')
  html().classList.remove('theme-switching')
})
afterEach(() => {
  window.matchMedia = originalMatchMedia
  vi.useRealTimers()
})

describe('resolution', () => {
  it('defaults to system, which reads light when the OS does not ask for dark', () => {
    expect(readThemePreference()).toBe('system')
    expect(resolveTheme()).toBe('light')
  })

  it('system follows the OS when it asks for dark', () => {
    stubMatchMedia(true)
    expect(resolveTheme('system')).toBe('dark')
    expect(resolveTheme('light')).toBe('light')
  })

  it('reads light, without throwing, when matchMedia is not a function at all', () => {
    ;(window as { matchMedia?: unknown }).matchMedia = undefined
    expect(resolveTheme('system')).toBe('light')
    expect(applyTheme('system')).toBe('light')
    expect(html().getAttribute('data-theme')).toBe('light')
    expect(subscribeSystemTheme()).toBeTypeOf('function')
  })

  it('treats an unknown stored value as system', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    expect(readThemePreference()).toBe('system')
  })
})

describe('applyTheme', () => {
  it('sets data-theme synchronously — the attribute is there the moment the call returns', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    applyTheme()
    expect(html().getAttribute('data-theme')).toBe('dark')
  })

  it('does not cross-fade on the first application, only on a change, and takes the class off after 260 ms', () => {
    vi.useFakeTimers()
    applyTheme('light')
    expect(html().classList.contains('theme-switching')).toBe(false)
    applyTheme('dark')
    expect(html().getAttribute('data-theme')).toBe('dark')
    expect(html().classList.contains('theme-switching')).toBe(true)
    vi.advanceTimersByTime(THEME_SWITCH_MS - 1)
    expect(html().classList.contains('theme-switching')).toBe(true)
    vi.advanceTimersByTime(1)
    expect(html().classList.contains('theme-switching')).toBe(false)
  })

  it('is idempotent: re-applying the same theme adds no class', () => {
    applyTheme('dark')
    html().classList.remove('theme-switching')
    applyTheme('dark')
    expect(html().classList.contains('theme-switching')).toBe(false)
  })
})

describe('persistence', () => {
  it('setThemePreference writes studio.theme and applies it', () => {
    expect(setThemePreference('dark')).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(readThemePreference()).toBe('dark')
    expect(html().getAttribute('data-theme')).toBe('dark')
  })
})

describe('subscribeSystemTheme', () => {
  it('follows an OS change while the preference is system, and ignores it for an explicit choice', () => {
    const media = stubMatchMedia(false)
    applyTheme('system')
    const seen: string[] = []
    const off = subscribeSystemTheme((t) => seen.push(t))
    media.set(true)
    expect(html().getAttribute('data-theme')).toBe('dark')
    expect(seen).toEqual(['dark'])
    setThemePreference('light')
    media.set(false)
    media.set(true)
    expect(html().getAttribute('data-theme')).toBe('light')
    expect(seen).toEqual(['dark'])
    off()
    expect(media.size).toBe(0)
  })
})

describe('density', () => {
  it('defaults to comfortable, applies the attribute, and persists studio.density', () => {
    expect(readDensity()).toBe('comfortable')
    applyDensity()
    expect(html().getAttribute('data-density')).toBe('comfortable')
    setDensity('compact')
    expect(localStorage.getItem(DENSITY_STORAGE_KEY)).toBe('compact')
    expect(html().getAttribute('data-density')).toBe('compact')
    localStorage.setItem(DENSITY_STORAGE_KEY, 'cosy')
    expect(readDensity()).toBe('comfortable')
  })
})

describe('ThemeProvider / useTheme', () => {
  function Probe() {
    const { theme, resolved, setTheme } = useTheme()
    return createElement(
      'button',
      { type: 'button', onClick: () => setTheme('dark') },
      `${theme}/${resolved}`,
    )
  }

  it('exposes {theme, resolved, setTheme} and applies a change to the document', () => {
    render(createElement(ThemeProvider, null, createElement(Probe)))
    const button = screen.getByRole('button')
    expect(button.textContent).toBe('system/light')
    expect(html().getAttribute('data-theme')).toBe('light')
    act(() => { button.click() })
    expect(button.textContent).toBe('dark/dark')
    expect(html().getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('reads light and tolerates setTheme outside a provider', () => {
    render(createElement(Probe))
    const button = screen.getByRole('button')
    expect(button.textContent).toBe('system/light')
    act(() => { button.click() })
    expect(button.textContent).toBe('system/light')
  })
})
