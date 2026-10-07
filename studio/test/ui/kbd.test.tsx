// @vitest-environment jsdom
/** v14 (observatory settings-dark shot): the Settings tooltip's ⌘, keycap drew as a blank box in
 * dark. The tooltip plate is the theme's INVERSE — `bg-slate-900 text-white` in light, flipped by
 * dark.css's exception to a pale plate with dark ink — and the keycap on it wore `text-white`,
 * which dark.css deliberately never remaps (white must stay white on accent fills). Pinned here,
 * at the SOURCE as `tokenContrast.test` does: every `--color-*` the keycap reads, off the plate
 * and on it, has a value in BOTH themes; the on-plate ink is `ink-inverse` and never `white`;
 * and that ink clears AA on the plate in both themes. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Kbd, KBD_ON_PLATE_CLASS, Tooltip, TOOLTIP_DELAY } from '../../src/ui'

const theme = join(__dirname, '..', '..', 'src', 'theme')
const read = (rel: string) => readFileSync(join(theme, rel), 'utf8')

/** `--color-x: value;` declarations inside the first block of `selector`. */
function declarations(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(selector)
  if (start < 0) throw new Error(`${selector} not found`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const out = new Map<string, string>()
  for (const m of css.slice(open + 1, close).matchAll(/(--[\w-]+):\s*([^;]+);/g)) out.set(m[1], m[2].trim())
  return out
}

function resolveHex(vars: Map<string, string>, name: string): string {
  let value = vars.get(name)
  for (let hops = 0; hops < 4 && value?.startsWith('var('); hops += 1) value = vars.get(value.slice(4, -1).trim())
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} did not resolve to a 6-digit hex (got ${value})`)
  return value
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** The `--color-*` tokens a class list reads: `bg-ink-inverse/10` → `--color-ink-inverse`,
 * `border-line-1` → `--color-line-1`. Arbitrary values (`text-[11px]`) and bare `border` are not
 * colours and are skipped. */
function colourTokensIn(classes: string): string[] {
  return Array.from(classes.matchAll(/(?:^|\s)(?:bg|border|text|ring)-([a-z][a-z0-9-]*?)(?:\/\d+)?(?=\s|$)/g))
    .map((m) => m[1])
    .filter((name) => !/^\[/.test(name) && !/^(xs|sm|base|lg|xl|2xs|left|right|center|\(length:--text-2xs\))$/.test(name))
    .map((name) => `--color-${name}`)
}

const light = declarations(read('tokens.css'), ':root')
const dark = declarations(read('dark.css'), '[data-theme="dark"]')
/** The tooltip plate: Tailwind's `slate-900` in light (the kit does not retune it), and the hex
 * dark.css's `.bg-slate-900.text-white` exception paints in dark — read from the file. */
const LIGHT_PLATE = '#0f172a'
const DARK_PLATE = /\[data-theme=dark\] \.bg-slate-900\.text-white \{[^}]*background-color:\s*(#[0-9a-f]{6})/i.exec(read('dark.css'))![1]

let overlays: HTMLElement
beforeEach(() => {
  vi.useFakeTimers()
  overlays = document.createElement('div')
  overlays.id = 'overlays'
  document.body.appendChild(overlays)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  overlays.remove()
})

describe('Kbd has a dark token', () => {
  it('every colour the keycap reads — off the plate and on it — is declared in both themes; the on-plate ink is ink-inverse, never white', () => {
    render(<Kbd keys={['Mod', 'K']} />)
    const plain = document.querySelector('kbd')!.className
    const plainTokens = colourTokensIn(plain)
    expect(plainTokens).toEqual(expect.arrayContaining(['--color-line-1', '--color-surface-1', '--color-ink-3']))
    for (const token of plainTokens) {
      expect(light.has(token), `${token} in tokens.css`).toBe(true)
      expect(dark.has(token), `${token} in dark.css`).toBe(true)
    }
    expect(KBD_ON_PLATE_CLASS).not.toMatch(/white/)
    expect(KBD_ON_PLATE_CLASS).toContain('text-ink-inverse')
    const plateTokens = colourTokensIn(KBD_ON_PLATE_CLASS)
    expect(plateTokens).toEqual(['--color-ink-inverse', '--color-ink-inverse', '--color-ink-inverse'])
    for (const token of plateTokens) {
      expect(light.has(token), `${token} in tokens.css`).toBe(true)
      expect(dark.has(token), `${token} in dark.css`).toBe(true)
    }
    // `white` is the token that LACKS a dark value — the blank box's cause — by design.
    expect(dark.has('--color-white')).toBe(false)
  })

  it('ink-inverse clears AA on the tooltip plate in both themes: light on the dark plate, dark on the pale one', () => {
    const lightInk = resolveHex(light, '--color-ink-inverse')
    const darkInk = resolveHex(dark, '--color-ink-inverse')
    expect(contrast(lightInk, LIGHT_PLATE)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(darkInk, DARK_PLATE)).toBeGreaterThanOrEqual(4.5)
    // The inversion is real: the dark ink is darker than the dark plate, the light ink lighter than its plate.
    expect(luminance(darkInk)).toBeLessThan(luminance(DARK_PLATE))
    expect(luminance(lightInk)).toBeGreaterThan(luminance(LIGHT_PLATE))
  })

  it('the tooltip puts exactly that class on its keycap', () => {
    render(<Tooltip label="Settings" kbd={['Mod', ',']}><button type="button">S</button></Tooltip>)
    fireEvent.mouseEnter(screen.getByRole('button').parentElement!)
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY + 1)
    })
    const kbd = screen.getByRole('tooltip').querySelector('kbd')!
    expect(kbd.className).toContain(KBD_ON_PLATE_CLASS)
    expect(kbd.className).not.toContain('text-white')
    expect(kbd.textContent).toContain(',')
  })
})
