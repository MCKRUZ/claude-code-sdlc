/** The CSS defines every token the types promise (studio-observatory.md §2, W0-A acceptance).
 *
 * Approach: a SOURCE check, not a Tailwind compile. Compiling index.css programmatically would
 * need Tailwind's Vite resolver for the `@import` chain and the fontsource packages, and would
 * run on every test — heavy for what is a spelling check. Instead each name in
 * `src/theme/tokens.d.ts` is expanded here through `satisfies Record<Union, 1>`, which the
 * typechecker refuses if a key is missing or extra, and the expanded name is then looked for in
 * the CSS text. The build itself is verified once by `vite build`, not here. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type {
  AccentStep, DensityVar, DurationToken, InkToken, LineToken, RadiusToken, ShadowToken,
  SpecToneToken, StageGroup, StaggerToken, StatusGroup, SurfaceToken, ToneSlot, TypeToken,
} from '../src/theme/tokens'
import { MOTION_DURATIONS, MOTION_STAGGERS } from '../src/motion/contract'

const root = join(__dirname, '..', 'src')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')
const index = read('index.css')
const tokens = read('theme/tokens.css')
const type = read('theme/type.css')
const dark = read('theme/dark.css')
const base = read('theme/base.css')

// `Record<Union, 1>` with `satisfies` is exhaustive both ways: a name the type has and this list
// lacks, or the reverse, fails `tsc -p tsconfig.test.json`.
const SURFACES = Object.keys({
  'surface-0': 1, 'surface-1': 1, 'surface-2': 1, 'surface-3': 1, 'surface-raised': 1,
  'surface-code': 1, 'surface-code-error': 1, scrim: 1,
} satisfies Record<SurfaceToken, 1>)
const INKS = Object.keys({ 'ink-1': 1, 'ink-2': 1, 'ink-3': 1, 'ink-4': 1, 'ink-inverse': 1 } satisfies Record<InkToken, 1>)
const LINES = Object.keys({ 'line-1': 1, 'line-2': 1, 'line-3': 1 } satisfies Record<LineToken, 1>)
const STEPS = Object.keys({ 50: 1, 100: 1, 200: 1, 300: 1, 400: 1, 500: 1, 600: 1, 700: 1, 800: 1, 900: 1 } satisfies Record<AccentStep, 1>)
const STAGES = Object.keys({ 'stage-signed': 1, 'stage-current': 1, 'stage-later': 1 } satisfies Record<StageGroup, 1>)
const STATUSES = Object.keys({ 'status-ok': 1, 'status-warn': 1, 'status-error': 1, 'status-running': 1 } satisfies Record<StatusGroup, 1>)
const SLOTS = Object.keys({ fill: 1, bg: 1, ink: 1, line: 1 } satisfies Record<ToneSlot, 1>)
const SPECS = Object.keys({ 'spec-ready': 1, 'spec-inflight': 1, 'spec-merged': 1, 'spec-deferred': 1, 'spec-notready': 1 } satisfies Record<SpecToneToken, 1>)
const TYPES = Object.keys({ '2xs': 1, xs: 1, sm: 1, base: 1, md: 1, lg: 1, xl: 1, '2xl': 1, display: 1, code: 1 } satisfies Record<TypeToken, 1>)
const RADII = Object.keys({ 1: 1, 2: 1, 3: 1, 4: 1, pill: 1, lg: 1, xl: 1 } satisfies Record<RadiusToken, 1>)
const SHADOWS = Object.keys({ 1: 1, 2: 1, 3: 1 } satisfies Record<ShadowToken, 1>)
const DENSITY = Object.keys({ '--pad-card': 1, '--pad-row': 1, '--gap-list': 1 } satisfies Record<DensityVar, 1>)
const DURATIONS = Object.keys({ 'dur-1': 1, 'dur-2': 1, 'dur-3': 1, 'dur-4': 1, 'dur-5': 1 } satisfies Record<DurationToken, 1>)
const STAGGERS = Object.keys({ 'stagger-1': 1, 'stagger-2': 1 } satisfies Record<StaggerToken, 1>)

const tones = (groups: string[]) => groups.flatMap((g) => SLOTS.map((s) => `${g}-${s}`))
const accent = STEPS.map((s) => `accent-${s}`)
const brand = STEPS.map((s) => `brand-${s}`)
/** Every ColorToken except `focus`, which is checked by name. */
const SEMANTIC = [...SURFACES, ...INKS, ...LINES, 'focus', ...accent, ...brand, ...tones(STAGES), ...tones(STATUSES), ...SPECS]
/** The tokens dark must restate. `brand-*` aliases `accent-*` so it follows for free. */
const DARK_OWNED = SEMANTIC.filter((n) => !n.startsWith('brand-'))

const count = (hay: string, needle: string) => hay.split(needle).length - 1
const declares = (css: string, prop: string) => new RegExp(`^\\s*${prop.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}:`, 'm').test(css)

describe('index.css', () => {
  it('keeps the Tailwind import first and imports the fonts and the four theme files', () => {
    expect(index.trimStart().startsWith('@import "tailwindcss";')).toBe(true)
    for (const dep of ['@fontsource-variable/inter/wght.css', '@fontsource-variable/jetbrains-mono/wght.css',
      './theme/tokens.css', './theme/type.css', './theme/dark.css', './theme/base.css']) {
      expect(index).toContain(`@import "${dep}";`)
    }
  })

  it('defines the attribute-driven dark variant', () => {
    expect(index).toContain('@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));')
  })
})

describe('tokens.css (light)', () => {
  it('declares every colour token on :root AND maps it to a utility in @theme inline reference', () => {
    expect(tokens).toContain('@theme inline reference {')
    for (const name of SEMANTIC) {
      expect(declares(tokens, `--color-${name}`), `--color-${name} declared`).toBe(true)
      // Once as the value on :root, once as the mapping — the mapping line is `--x: var(--x);`.
      expect(tokens, `--color-${name} mapped`).toContain(`--color-${name}: var(--color-${name});`)
      expect(count(tokens, `--color-${name}:`)).toBeGreaterThanOrEqual(2)
    }
  })

  it('defines the brand scrim once: surface-0 at .55 with a 2 px blur, aliased to the bg-scrim utility (P3)', () => {
    expect(tokens).toContain('--scrim: rgb(248 250 252 / 0.55);')
    expect(tokens).toContain('--scrim-filter: blur(2px) saturate(1);')
    expect(tokens).toMatch(/:root\s*\{[^}]*--color-scrim: var\(--scrim\);/)
    // Never a black wash: the light scrim is surface-0's rgb, not slate-900's.
    expect(tokens).not.toMatch(/--scrim: rgb\(11 17 32/)
  })

  it('completes the brand scale (200/300/800/900 were used with no CSS emitted)', () => {
    for (const step of [200, 300, 800, 900]) expect(declares(tokens, `--color-brand-${step}`)).toBe(true)
  })

  it('keeps the legacy aliases the var() usages and tests reference', () => {
    for (const legacy of ['stage-signed-off', 'stage-signed-off-bg', 'stage-current', 'stage-current-bg',
      'stage-later', 'stage-later-bg', 'command-ok', 'command-error', 'command-running']) {
      expect(declares(tokens, `--color-${legacy}`), legacy).toBe(true)
    }
    expect(tokens).toContain('--color-command-running: var(--color-status-running-fill);')
  })

  it('declares shadows, the ring, density vars, and motion vars that match the motion contract', () => {
    for (const s of SHADOWS) expect(declares(tokens, `--shadow-${s}`)).toBe(true)
    expect(tokens).toContain('--ring: 0 0 0 2px var(--color-surface-0), 0 0 0 4px var(--color-focus);')
    for (const d of DENSITY) expect(declares(tokens, d)).toBe(true)
    for (const d of DURATIONS) {
      const ms = Math.round(MOTION_DURATIONS[d as DurationToken] * 1000)
      expect(tokens, d).toContain(`--${d}: ${ms}ms;`)
    }
    for (const s of STAGGERS) {
      const ms = Math.round(MOTION_STAGGERS[s as StaggerToken] * 1000)
      expect(tokens, s).toContain(`--${s}: ${ms}ms;`)
    }
    expect(tokens).toMatch(/:root\s*\{[^}]*color-scheme: light;/)
  })
})

describe('type.css', () => {
  it('declares every type size and radius, with the Tailwind lg/xl remap and the fonts', () => {
    for (const t of TYPES) expect(declares(type, `--text-${t}`), t).toBe(true)
    for (const r of RADII) expect(declares(type, `--radius-${r}`), r).toBe(true)
    expect(type).toContain('--radius-lg: 10px;')
    expect(type).toContain('--radius-xl: 14px;')
    expect(type).toContain('--text-sm: 13px;')
    expect(type).toMatch(/--font-sans: "Inter Variable"/)
    expect(type).toMatch(/--font-mono: "JetBrains Mono Variable"/)
  })
})

describe('dark.css', () => {
  it('restates every owned colour token and the shadows under [data-theme="dark"] with color-scheme dark', () => {
    expect(dark).toMatch(/\[data-theme="dark"\]\s*\{\s*color-scheme: dark;/)
    for (const name of DARK_OWNED) expect(declares(dark, `--color-${name}`), name).toBe(true)
    for (const s of SHADOWS) expect(declares(dark, `--shadow-${s}`)).toBe(true)
  })

  it('restates the scrim as surface-0 dark at .6 and keeps the bg-scrim alias (P3)', () => {
    expect(dark).toContain('--scrim: rgb(11 17 32 / 0.6);')
    expect(dark).toMatch(/\[data-theme="dark"\]\s*\{[^}]*--color-scrim: var\(--scrim\);/)
    // The blur is defined once, on :root — dark must not fork it.
    expect(declares(dark, '--scrim-filter')).toBe(false)
  })

  it('remaps the legacy palette steps the design enumerates, and leaves white alone', () => {
    for (const step of ['slate-50', 'slate-100', 'slate-200', 'slate-300', 'slate-400', 'slate-500', 'slate-600',
      'slate-700', 'slate-800', 'slate-900', 'amber-50', 'amber-100', 'amber-200', 'amber-300', 'amber-600',
      'amber-700', 'amber-800', 'amber-900', 'red-50', 'red-100', 'red-200', 'red-300', 'red-700', 'red-800',
      'red-900', 'green-100', 'green-500', 'green-800', 'emerald-50', 'emerald-700', 'sky-50', 'sky-200', 'sky-700']) {
      expect(declares(dark, `--color-${step}`), step).toBe(true)
    }
    for (const kept of ['--color-white', '--color-amber-500', '--color-red-500', '--color-red-950']) {
      expect(declares(dark, kept), `${kept} must not be remapped`).toBe(false)
    }
  })

  it('carries the ten unlayered exception selectors verbatim (the design\'s eight plus the two solid amber chips)', () => {
    const selectors = [
      '[data-theme=dark] .bg-white {',
      '[data-theme=dark] .bg-slate-900 {',
      '[data-theme=dark] .bg-slate-900.text-white {',
      '[data-theme=dark] .bg-slate-900\\/40 {',
      '[data-theme=dark] .bg-red-950 {',
      '[data-theme=dark] .bg-slate-50 {',
      '[data-theme=dark] .bg-slate-200\\/50 {',
      '[data-theme=dark] .border-dashed.border-slate-300 {',
      '[data-theme=dark] .bg-amber-600 {',
      '[data-theme=dark] .bg-amber-700 {',
    ]
    for (const sel of selectors) expect(dark, sel).toContain(sel)
    expect(dark.match(/^\[data-theme=dark\] /gm)?.length).toBe(10)
    expect(dark).toMatch(/\.bg-red-950 \{[^}]*color: #fecaca;/)
  })
})

describe('base.css', () => {
  it('has the focus ring, the theme-switch transition (no widths), density and motion-off rules', () => {
    expect(base).toMatch(/:focus-visible \{[^}]*box-shadow: var\(--ring\);/)
    const sw = base.match(/html\.theme-switching \* \{([^}]*)\}/)?.[1] ?? ''
    expect(sw).toContain('background-color 200ms')
    expect(sw).not.toMatch(/width/)
    const compact = base.match(/\[data-density="compact"\] \{([^}]*)\}/)?.[1] ?? ''
    for (const d of DENSITY) expect(compact, d).toContain(`${d}:`)
    expect(compact).toContain('--text-sm: 12.5px;')
    expect(base).toMatch(/\[data-motion="off"\] \*,\s*\[data-motion="off"\] \*::before,\s*\[data-motion="off"\] \*::after \{[^}]*transition-duration: 0ms !important;[^}]*animation-duration: 0ms !important;[^}]*animation-iteration-count: 1 !important;/)
    expect(base).toContain('@media (prefers-reduced-motion: reduce)')
    expect(base).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })
})
