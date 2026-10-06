/** Round 2 (C1/C2): the text tokens pass WCAG AA (4.5:1) on the surfaces they are used on, in
 * both themes. A SOURCE check: the hex values are parsed out of `tokens.css` / `dark.css`, one
 * level of `var(--color-*)` is resolved, and the ratio is computed here — so a retune of a token
 * that quietly drops a link or an eyebrow below AA fails this file, not a screenshot review.
 *
 * Measured ground (studio-upgrade-2 §1): dark `accent-700` as text was ≈ 2.5:1 and `ink-4`
 * eyebrows 2.45:1 — the two biggest correctness gaps in the v7 shots. Both pairs are pinned. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..', 'src', 'theme')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

/** `--color-x: value;` declarations inside the first block of `selector`. */
function declarations(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(selector)
  if (start < 0) throw new Error(`${selector} not found`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const body = css.slice(open + 1, close)
  const out = new Map<string, string>()
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out.set(m[1], m[2].trim())
  return out
}

function resolveHex(vars: Map<string, string>, name: string, fallback?: Map<string, string>): string {
  let value = vars.get(name) ?? fallback?.get(name)
  for (let hops = 0; hops < 4 && value?.startsWith('var('); hops += 1) {
    const inner = value.slice(4, -1).trim()
    value = vars.get(inner) ?? fallback?.get(inner)
  }
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

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const light = declarations(read('tokens.css'), ':root')
const dark = declarations(read('dark.css'), '[data-theme="dark"]')

const AA = 4.5
const STATUSES = ['ok', 'warn', 'error', 'running'] as const

/** `[text token, surface token]` — every pair a word in that colour is drawn on. */
const PAIRS: ReadonlyArray<[string, string]> = [
  ['--color-accent-text', '--color-surface-0'],
  ['--color-accent-text', '--color-surface-1'],
  ['--color-accent-text', '--color-surface-raised'],
  ['--color-accent-text-hover', '--color-surface-0'],
  ['--color-eyebrow', '--color-surface-0'],
  ['--color-ink-3', '--color-surface-2'],
  ...STATUSES.map((s): [string, string] => [`--color-status-${s}-ink`, `--color-status-${s}-bg`]),
]

describe.each([
  ['light', light, undefined],
  ['dark', dark, light],
] as const)('%s theme text contrast', (_name, vars, fallback) => {
  it.each(PAIRS)('%s on %s is at least 4.5:1', (text, surface) => {
    const ratio = contrast(resolveHex(vars, text, fallback), resolveHex(vars, surface, fallback))
    expect(ratio, `${text} on ${surface} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA)
  })
})

describe('the two measured gaps stay closed', () => {
  it('dark accent-text is the pale end of the inverted ramp, not accent-700 (which is ≈ 2.5:1)', () => {
    expect(contrast(resolveHex(dark, '--color-accent-700', light), resolveHex(dark, '--color-surface-0'))).toBeLessThan(AA)
    expect(resolveHex(dark, '--color-accent-text')).toBe('#6fd1d4')
  })

  it('ink-4 is decoration in both themes — it fails AA on surface-0, which is why no word wears it', () => {
    expect(contrast(resolveHex(light, '--color-ink-4'), resolveHex(light, '--color-surface-0'))).toBeLessThan(AA)
    expect(contrast(resolveHex(dark, '--color-ink-4'), resolveHex(dark, '--color-surface-0'))).toBeLessThan(AA)
  })

  it('eyebrow resolves to ink-3 in both themes', () => {
    expect(resolveHex(light, '--color-eyebrow')).toBe(resolveHex(light, '--color-ink-3'))
    expect(resolveHex(dark, '--color-eyebrow', light)).toBe(resolveHex(dark, '--color-ink-3'))
  })
})
