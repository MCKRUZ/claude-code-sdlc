/** `studio/public/brand/cc/*.svg` are the static twins of the command center's figures
 * (togo-command-center-visual.md §6), serialised by `ccStaticSvg.ts` from the one geometry the
 * React figures draw. This test is both the proof and the generator: with `CC_WRITE_ASSETS=1`
 * it writes the folder (the only sanctioned way to change it); without, it asserts every file
 * is byte-identical to what the serialiser produces now and that the folder has no strays.
 *
 * Colour discipline per file: an empty figure or the baton carries ONLY the two accent-ramp
 * hexes (#A7E6E7 quiet, #1A99A3 lit); a lane glyph only the mark's #0E7C86; nothing has a
 * `<text>` except the lockup, and only the lockup has the one Depth gradient on the brand's
 * (17, 9) → (47, 56) vector. Node only; no renderer. */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CC_STATIC_HEX, ccStaticAssets } from '../src/components/brand/figures'

const folder = resolve(__dirname, '..', 'public', 'brand', 'cc')
const assets = ccStaticAssets()
const names = Object.keys(assets).sort()

if (process.env.CC_WRITE_ASSETS === '1') {
  mkdirSync(folder, { recursive: true })
  for (const [name, svg] of Object.entries(assets)) writeFileSync(join(folder, name), svg, 'utf8')
}

const hexes = (svg: string) => Array.from(new Set(svg.match(/#[0-9A-Fa-f]{6}\b/g) ?? [])).sort()

describe('public/brand/cc is generated from the figure geometry', () => {
  it('ships exactly the twelve files the serialiser names, no strays', () => {
    expect(existsSync(folder)).toBe(true)
    expect(readdirSync(folder).filter((f) => f.endsWith('.svg')).sort()).toEqual(names)
    expect(names).toEqual([
      'baton.svg', 'empty-backlog-empty.svg', 'empty-no-decisions.svg', 'empty-no-findings.svg', 'empty-no-sprint.svg',
      'empty-nothing-needs-you.svg', 'lane-building.svg', 'lane-checking.svg', 'lane-merged.svg', 'lane-ready.svg',
      'room-ring.svg', 'steering-lockup-depth.svg',
    ])
  })

  it.each(names)('%s is byte-identical to the serialiser (run with CC_WRITE_ASSETS=1 to regenerate)', (name) => {
    expect(readFileSync(join(folder, name), 'utf8').replace(/\r\n/g, '\n')).toBe(assets[name])
  })

  it.each(names.filter((n) => n.startsWith('empty-') || n === 'baton.svg'))('%s uses the two accent tones and nothing else, with no text or gradient', (name) => {
    const svg = assets[name]!
    expect(hexes(svg)).toEqual([CC_STATIC_HEX.quiet, CC_STATIC_HEX.lit].sort())
    expect(svg).not.toMatch(/<text|<linearGradient|<filter|currentColor/)
    expect(svg).toContain('aria-hidden="true"')
    expect(svg).toMatch(/viewBox="0 0 (120 72|24 24)"/)
  })

  it.each(names.filter((n) => n.startsWith('lane-')))('%s is the mark colour only — shape is the cue', (name) => {
    const svg = assets[name]!
    expect(hexes(svg)).toEqual([CC_STATIC_HEX.glyph])
    expect(svg).not.toMatch(/<text|<linearGradient/)
    expect(svg).toContain('viewBox="0 0 18 18"')
  })

  it('room-ring.svg is the 20 px disc, a 2 px gap and a 2 px you-ring at light values', () => {
    const svg = assets['room-ring.svg']!
    expect(hexes(svg)).toEqual(['#0E7C86', '#F1F5F9', '#FFFFFF'])
    expect(svg).toContain('viewBox="0 0 28 28"')
    expect(svg).toContain('r="10"')
    expect(svg).toContain('stroke-width="2"')
  })

  it('steering-lockup-depth.svg carries the one Depth gradient on the brand vector and the wordmark at 650', () => {
    const svg = assets['steering-lockup-depth.svg']!
    expect(svg.match(/<linearGradient/g)?.length).toBe(1)
    expect(svg).toContain('gradientUnits="userSpaceOnUse" x1="17" y1="9" x2="47" y2="56"')
    expect(svg).toContain('stop-color="#6FD1D4"')
    expect(svg).toContain('stop-color="#0A3F47"')
    expect(svg).toMatch(/font-weight="650"[^>]*>Tōgō</)
    expect(svg).toContain('>STEERING<')
    // The mark is drawn at 48 px: the 64-unit grid scaled by 0.75.
    expect(svg).toContain('scale(0.75)')
  })

  it('every file says it is generated and from where', () => {
    for (const name of names) expect(assets[name], name).toContain('do not hand-edit')
  })
})
