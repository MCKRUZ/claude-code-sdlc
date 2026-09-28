/** How two versions of a document differ, said so a person can see it.
 *
 * The clash screen used to put two full versions side by side and leave the reading to the person.
 * On a real project the two versions of a 200-line spec differed in exactly two words (`write` and
 * `***`), and on screen they looked identical. So the difference is computed and shown: only the
 * changed lines, a little context, the identical stretches folded away, and inside a changed line
 * only the words that changed.
 */

import { describe, expect, it } from 'vitest'
import { collapse, describeDiff, diffLines } from '../shared/lineDiff'

const doc = (...lines: string[]) => lines.join('\n') + '\n'

describe('diffLines', () => {
  it('finds nothing to report when the text is the same', () => {
    const r = diffLines(doc('a', 'b', 'c'), doc('a', 'b', 'c'))
    expect(r.changedLines).toBe(0)
    expect(r.lines.every((l) => l.kind === 'same')).toBe(true)
  })

  it('does not report a line-ending difference as a change', () => {
    expect(diffLines('a\r\nb\r\n', 'a\nb\n').changedLines).toBe(0)
  })

  it('finds a single changed line and keeps everything around it', () => {
    const r = diffLines(doc('a', 'B-mine', 'c'), doc('a', 'B-theirs', 'c'))
    expect(r.lines.map((l) => [l.kind, l.text])).toEqual([
      ['same', 'a'], ['mine', 'B-mine'], ['theirs', 'B-theirs'], ['same', 'c'],
    ])
  })

  it('finds a line only one side has', () => {
    expect(diffLines(doc('a', 'extra', 'b'), doc('a', 'b')).lines.filter((l) => l.kind !== 'same'))
      .toEqual([{ kind: 'mine', text: 'extra' }])
    expect(diffLines(doc('a', 'b'), doc('a', 'extra', 'b')).lines.filter((l) => l.kind !== 'same'))
      .toEqual([{ kind: 'theirs', text: 'extra' }])
  })

  it('finds separate changes far apart in a long document', () => {
    const base = Array.from({ length: 100 }, (_, i) => `line ${i}`)
    const mine = [...base]; mine[10] = 'mine 10'; mine[90] = 'mine 90'
    const theirs = [...base]; theirs[10] = 'theirs 10'
    const r = diffLines(doc(...mine), doc(...theirs))
    expect(r.lines.filter((l) => l.kind === 'mine').map((l) => l.text)).toEqual(['mine 10', 'mine 90'])
    // Theirs never touched line 90, so their copy still holds the original there.
    expect(r.lines.filter((l) => l.kind === 'theirs').map((l) => l.text)).toEqual(['theirs 10', 'line 90'])
  })

  it('marks only the words that changed inside a changed line', () => {
    // The case from a real project: two words in a 200-line spec, invisible side by side.
    const r = diffLines(
      doc('- `deploy-dev.yml`, and any job with `id-token=*** or an Azure login.'),
      doc('- `deploy-dev.yml`, and any job with `id-token: write` or an Azure login.'),
    )
    const mine = r.lines.find((l) => l.kind === 'mine')!
    const theirs = r.lines.find((l) => l.kind === 'theirs')!
    const changed = (l: typeof mine) => l.segments!.filter((s) => s.changed).map((s) => s.text.trim())
    expect(changed(mine)).toEqual(['`id-token=***'])
    expect(changed(theirs)).toEqual(['`id-token:', 'write`'])
    // ...and nothing else on the line is marked, so the eye goes straight to it.
    expect(mine.segments!.filter((s) => !s.changed).map((s) => s.text).join('')).toContain('`deploy-dev.yml`, and any job with')
  })

  it('splits a line into segments that put back together to exactly that line', () => {
    const r = diffLines(doc('the quick brown fox'), doc('the slow brown dog'))
    for (const l of r.lines.filter((x) => x.segments)) {
      expect(l.segments!.map((s) => s.text).join('')).toBe(l.text)
    }
  })

  it('counts the lines of each side', () => {
    const r = diffLines(doc('a', 'b'), doc('a', 'b', 'c'))
    expect(r.mineLines).toBe(2)
    expect(r.theirsLines).toBe(3)
  })

  it('gives up gracefully on two enormous, unrelated texts rather than freezing', () => {
    const a = Array.from({ length: 3000 }, (_, i) => `a${i}`).join('\n')
    const b = Array.from({ length: 3000 }, (_, i) => `b${i}`).join('\n')
    const r = diffLines(a, b)
    expect(r.tooLarge).toBe(true)
    expect(r.lines.filter((l) => l.kind === 'mine')).toHaveLength(3000)
    expect(r.lines.filter((l) => l.kind === 'theirs')).toHaveLength(3000)
  })
})

describe('collapse', () => {
  const long = Array.from({ length: 50 }, (_, i) => `line ${i}`)

  it('keeps a little context around a change and folds the rest away', () => {
    const mine = [...long]; mine[25] = 'CHANGED'
    const hunks = collapse(diffLines(doc(...mine), doc(...long)).lines, 2)
    const gaps = hunks.filter((h) => h.type === 'gap')
    expect(gaps.map((g) => g.type === 'gap' && g.count)).toEqual([23, 22])
    const shown = hunks.filter((h) => h.type === 'lines').flatMap((h) => h.type === 'lines' ? h.lines.map((l) => l.text) : [])
    expect(shown).toEqual(['line 23', 'line 24', 'CHANGED', 'line 25', 'line 26', 'line 27'])
  })

  it('does not fold a stretch shorter than the context it would hide', () => {
    const a = [...long]; a[10] = 'x'; a[14] = 'y'
    const hunks = collapse(diffLines(doc(...a), doc(...long)).lines, 2)
    // Lines 12 and 13 sit between two changes and inside both contexts, so nothing is folded there.
    const middle = hunks.filter((h) => h.type === 'lines')
    expect(middle.length).toBeGreaterThan(0)
    expect(hunks.filter((h) => h.type === 'gap').length).toBe(2)
  })

  it('every line is either shown or counted in a fold', () => {
    const mine = [...long]; mine[5] = 'X'; mine[40] = 'Y'
    const r = diffLines(doc(...mine), doc(...long))
    const hunks = collapse(r.lines, 3)
    const total = hunks.reduce((n, h) => n + (h.type === 'lines' ? h.lines.length : h.count), 0)
    expect(total).toBe(r.lines.length)
  })
})

describe('describeDiff', () => {
  it('says so when the text is the same', () => {
    expect(describeDiff(diffLines('a\n', 'a\n'))).toBe('The two versions have the same text.')
  })

  it('counts differing lines in plain words, with the size of the whole', () => {
    const r = diffLines(doc('a', 'x', 'c'), doc('a', 'y', 'c'))
    expect(describeDiff(r)).toBe('1 line differs, out of 3.')
  })

  it('says how many lines differ on each side when they are not the same number', () => {
    const r = diffLines(doc('a', 'b'), doc('a', 'b', 'c', 'd'))
    expect(describeDiff(r)).toMatch(/0 lines of yours and 2 of theirs/)
  })

  it('pluralizes', () => {
    const r = diffLines(doc('x1', 'x2', 'c'), doc('y1', 'y2', 'c'))
    expect(describeDiff(r)).toBe('2 lines differ, out of 3.')
  })
})
