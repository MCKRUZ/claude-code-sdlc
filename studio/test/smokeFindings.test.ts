import { describe, expect, it } from 'vitest'
import { jargon, judge, leaks, type ScreenMeasure } from './smoke/findings'

/** A screen with nothing wrong on it, so each test changes exactly one thing. */
const CLEAN: ScreenMeasure = {
  text: 'Requirements. Every required document is present and complete.',
  width: 1280,
  overflowX: false,
  offscreen: [],
  unnamed: [],
  smallTargets: [],
  truncated: [],
  errorBanners: [],
  headings: ['Requirements'],
  interactive: 4,
  imagesWithoutAlt: 0,
}

const kinds = (m: Partial<ScreenMeasure>) => judge('Stage 1', '1280x800', { ...CLEAN, ...m }).map((f) => `${f.severity}:${f.kind}`)

describe('the smoke suite judges what a person would notice', () => {
  it('finds nothing on a clean screen', () => {
    expect(kinds({})).toEqual([])
  })

  it.each([
    ['a value that never arrived', 'Signed off by undefined.', 'undefined'],
    ['a number that is not one', 'Progress: NaN of 4', 'NaN'],
    ['an object printed as text', 'Result: [object Object]', 'object-to-string'],
    ['a missing value', 'Owner: null', 'null'],
    ['a template left unfilled', 'Hello ${name}, welcome', 'template-placeholder'],
    ['a Python traceback', 'Traceback (most recent call last):', 'stack-trace'],
    ['a JavaScript error name', 'TypeError: x is not a function', 'stack-trace'],
    ['a file-system error code', 'Could not read it (ENOENT)', 'filesystem-error'],
  ])('flags %s as a bug', (_label, text, kind) => {
    expect(leaks(text).join('|')).toContain(kind)
    expect(kinds({ text: `${CLEAN.text} ${text}` })).toContain('bug:leaked-internals')
  })

  it('warns, rather than fails, when a full path on disk is shown', () => {
    expect(leaks('Saved to C:\\Users\\sam\\projects\\x').join('|')).toContain('local-path')
    expect(leaks('Saved to /Users/sam/projects/x').join('|')).toContain('local-path')
    expect(kinds({ text: `${CLEAN.text} Location C:\\Users\\sam\\projects` })).toEqual(['warn:shows-full-path'])
  })

  it('does not call a sentence about an undefined term a leak', () => {
    expect(leaks('the word "respond" is undefined here')).toEqual([])
    expect(leaks('Signed off by undefined')).not.toEqual([])
  })

  it('does not mistake ordinary words for leaks', () => {
    // The bare word "undefined" is flagged wherever it appears (a person can dismiss a rare
    // prose use; a missed leak ships), so only words that merely CONTAIN null/NaN are exempt.
    expect(leaks('The nullable field was nullified. Banana and Nancy are not NaNs.')).toEqual([])
    expect(leaks('Review catches logic defects (off-by-ones, null paths, inverted conditions).')).toEqual([])
  })

  it('treats a screen with almost no text as blank', () => {
    expect(kinds({ text: 'Loading' })).toContain('bug:blank-screen')
  })

  it('reports an error banner, a nameless control and a sideways scroll as bugs', () => {
    const found = kinds({ errorBanners: ['Could not read this stage.'], unnamed: ['button near "3 to fill"'], overflowX: true, offscreen: ['table'] })
    expect(found).toEqual(expect.arrayContaining(['bug:error-showing', 'bug:control-without-name', 'bug:scrolls-sideways']))
  })

  it('only warns about sideways scrolling in a very narrow window', () => {
    expect(kinds({ overflowX: true, width: 480 })).toContain('warn:scrolls-sideways')
    expect(kinds({ overflowX: true, width: 480 })).not.toContain('bug:scrolls-sideways')
  })

  it('raises cut-off text, tiny targets and a missing heading as warnings, never as bugs', () => {
    const found = kinds({ truncated: ['Not-started document names'], smallTargets: ['button "x"'], headings: [], imagesWithoutAlt: 2 })
    expect(found).toEqual(expect.arrayContaining(['warn:text-cut-off', 'warn:tiny-click-target', 'warn:no-heading', 'warn:image-without-alt']))
    expect(found.filter((k) => k.startsWith('bug:'))).toEqual([])
  })

  it('calls a screen with nothing to click a dead end', () => {
    expect(kinds({ interactive: 0 })).toContain('warn:dead-end')
  })

  it('notes developer wording without failing anything', () => {
    expect(jargon('Reads the frontmatter and prints JSON to stdout')).toEqual(expect.arrayContaining(['frontmatter', 'JSON', 'stdout']))
    expect(kinds({ text: `${CLEAN.text} Reads the YAML.` })).toContain('note:developer-wording')
  })

  it('does not find jargon inside a longer word', () => {
    expect(jargon('Ledgerwood Insurance had a JSONB column')).toEqual([])
  })
})
