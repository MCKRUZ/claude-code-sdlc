// The palette scorer is pure, so its ordering rules are pinned here as arithmetic: word starts
// beat scattered letters, a typed id prefix wins outright, recency only nudges, and the cap
// and tie-break are the design's (12, group order).
import { describe, expect, it } from 'vitest'
import { parsePrefix, rankEntries, scoreEntry, subsequence } from '../../src/palette/score'
import type { PaletteEntry, PaletteGroup } from '../../src/palette/types'

function entry(id: string, title: string, group: PaletteGroup = 'actions', keywords: string[] = []): PaletteEntry {
  return { id, group, title, keywords, run: () => {} }
}

describe('parsePrefix', () => {
  it('recognises the four filters and nothing else', () => {
    expect(parsePrefix('>theme')).toEqual({ prefix: '>', query: 'theme' })
    expect(parsePrefix('# 0008')).toEqual({ prefix: '#', query: '0008' })
    expect(parsePrefix('/req')).toEqual({ prefix: '/', query: 'req' })
    expect(parsePrefix('@2')).toEqual({ prefix: '@', query: '2' })
    expect(parsePrefix('!x')).toEqual({ prefix: null, query: '!x' })
    // No people search: `@` is stages, and there is no fifth prefix.
    expect(parsePrefix('')).toEqual({ prefix: null, query: '' })
  })
})

describe('subsequence', () => {
  it('matches in order and fails out of order', () => {
    expect(subsequence('gph', 'Go to Phase 2')).not.toBeNull()
    expect(subsequence('hpg', 'Go to Phase 2')).toBeNull()
  })
  it('scores word starts above a scattered match', () => {
    const wordStarts = subsequence('tc', 'Toggle console')!
    const scattered = subsequence('tc', 'Settings: Connection')!
    expect(wordStarts.score).toBeGreaterThan(scattered.score)
    expect(wordStarts.matches).toEqual([0, 7])
  })
})

describe('scoreEntry', () => {
  it('a mono-id prefix on a keyword outranks any title match', () => {
    const spec = entry('spec:0008', 'Open spec 0008 — Duplicate claim 409', 'specs', ['0008'])
    const other = entry('a', 'Open spec 0100 — Zero zero zero eight', 'specs', ['0100'])
    expect(scoreEntry('000', spec)!.score).toBeGreaterThan(scoreEntry('000', other)!.score)
    expect(scoreEntry('FR-0', entry('f', 'Go to FR-002 in Requirements', 'documents', ['FR-002']))!.score)
      .toBeGreaterThan(scoreEntry('FR-0', entry('g', 'Frame - Review 0', 'documents', []))!.score)
  })
  it('recency nudges but does not override a clearly better match', () => {
    const exact = entry('x', 'Toggle console')
    const weak = entry('y', 'Theme: Dark → System')
    const boosted = scoreEntry('tc', weak, 0)
    // "tc" barely matches the theme row (t…c scattered) — recency cannot lift it above the
    // word-start match, or the palette would learn to suggest the wrong thing.
    expect(scoreEntry('tc', exact)!.score).toBeGreaterThan(boosted?.score ?? -Infinity)
    expect(scoreEntry('toggle', exact, 0)!.score).toBeGreaterThan(scoreEntry('toggle', exact)!.score)
  })
  it('returns null when nothing matches', () => {
    expect(scoreEntry('zzz', entry('a', 'Open folder…'))).toBeNull()
  })
})

describe('rankEntries', () => {
  const stages = ['0', '1', '2', '3'].map((n) => entry(`stage:${n}`, `Go to Phase ${n}: Stage ${n}`, 'stages', [n]))
  const build = [entry('build:board', 'Go to Board', 'build', ['board']), entry('build:sprint', 'Go to Sprint', 'build', ['sprint'])]
  const actions = Array.from({ length: 14 }, (_, i) => entry(`action:${i}`, `Action ${i}`, 'actions', []))
  const all = [...stages, ...build, ...actions]

  it('caps at 12 and keeps group order on an empty query', () => {
    const r = rankEntries('', all)
    expect(r).toHaveLength(12)
    expect(r[0].entry.group).toBe('stages')
    expect(r[4].entry.group).toBe('build')
  })
  it('an empty query lists recent picks first, in pick order', () => {
    const r = rankEntries('', all, { recentIds: ['action:3', 'build:sprint'] })
    expect(r.slice(0, 2).map((x) => x.entry.id)).toEqual(['action:3', 'build:sprint'])
  })
  it('a prefix restricts to its group even when another group matches better', () => {
    const r = rankEntries('>go', all)
    expect(r.every((x) => x.entry.group === 'actions')).toBe(true)
    expect(rankEntries('@', all).map((x) => x.entry.id)).toEqual(stages.map((s) => s.id))
  })
  it('breaks score ties by group order, then index order', () => {
    const tied = [entry('b', 'Same title', 'actions'), entry('a', 'Same title', 'stages'), entry('c', 'Same title', 'actions')]
    expect(rankEntries('same', tied).map((x) => x.entry.id)).toEqual(['a', 'b', 'c'])
  })
  it('fuzzy order puts the sprint view first for "sp"', () => {
    const r = rankEntries('sp', all)
    expect(r[0].entry.id).toBe('build:sprint')
  })
})
