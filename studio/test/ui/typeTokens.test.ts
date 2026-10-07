/** Round 2 (C3): `text-2xs` is a plain small size and `text-eyebrow` is the one shouting voice.
 * Before this round `--text-2xs` carried weight 600 and 0.08 em tracking by default, so the
 * Welcome path and the Console meta line rendered letter-spaced semibold (studio-upgrade-2 §1).
 * A source check on `type.css`: the two tokens must not drift back together. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const type = readFileSync(join(__dirname, '..', '..', 'src', 'theme', 'type.css'), 'utf8')
const declares = (prop: string) => new RegExp(`^\\s*${prop.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}:`, 'm').test(type)
const valueOf = (prop: string) => type.match(new RegExp(`^\\s*${prop.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}:\\s*([^;]+);`, 'm'))?.[1]

describe('--text-2xs is plain', () => {
  it('is 10.5 / 14 with no tracking', () => {
    expect(valueOf('--text-2xs')).toBe('10.5px')
    expect(valueOf('--text-2xs--line-height')).toBe('14px')
    expect(declares('--text-2xs--letter-spacing')).toBe(false)
  })

  it('is never semibold: weight 450 for legibility at 10.5 px, not the eyebrow 600', () => {
    expect(valueOf('--text-2xs--font-weight')).toBe('450')
    expect(type).not.toMatch(/--text-2xs--font-weight:\s*600/)
  })
})

describe('--text-eyebrow is the label voice', () => {
  it('keeps 11 / 16, 0.08 em, 600', () => {
    expect(valueOf('--text-eyebrow')).toBe('11px')
    expect(valueOf('--text-eyebrow--line-height')).toBe('16px')
    expect(valueOf('--text-eyebrow--letter-spacing')).toBe('0.08em')
    expect(valueOf('--text-eyebrow--font-weight')).toBe('600')
  })

  it('is the only size that carries 0.08 em tracking', () => {
    const tracked = [...type.matchAll(/^\s*(--text-[\w-]+?)--letter-spacing:\s*0\.08em;/gm)].map((m) => m[1])
    expect(tracked).toEqual(['--text-eyebrow'])
  })
})
