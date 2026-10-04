/** Spec 0029: a reply is accepted only in the shape asked for, and a failure is one plain line that never
 * quotes the reply. The analysis is two documents between exact marker lines, or nothing at all. */

import { describe, expect, it } from 'vitest'
import { NOT_A_SUMMARY, NOT_BOTH_DOCUMENTS, parseAnalysis, parseSummary, UNFILLED_SUMMARY } from '../electron/main/draftBatchParse'
import { slugOf } from '../electron/main/draftBatchPlan'

const C = '=== FILE: contradiction-list.md ==='
const Q = '=== FILE: question-list.md ==='
const END = '=== END ==='
const GOOD = [C, '# Contradictions', '', 'DOC-001 vs DOC-002.', Q, '# Questions', '', 'Q-01 Who?', END].join('\n')

describe('parseSummary', () => {
  const good = '---\ndoc_id: "DOC-001"\n---\n\n## Document Overview\nIt says things.\n'

  it('accepts a filled summary that starts at its first --- line', () => {
    expect(parseSummary(good)).toEqual({ ok: true, value: good })
  })

  it.each([
    ['empty', ''],
    ['only whitespace', '  \n '],
    ['prose before the frontmatter', `Here is the summary:\n${good}`],
    ['no Document Overview', '---\ndoc_id: "DOC-001"\n---\n\nJust prose.\n'],
    ['a four-dash rule instead of frontmatter', `-${good}`],
  ])('refuses a reply that is %s, in one line', (_name, text) => {
    const parsed = parseSummary(text)
    expect(parsed).toEqual({ ok: false, error: NOT_A_SUMMARY })
  })

  it('refuses a summary that still has a ${...} placeholder, naming it in one line without quoting it', () => {
    const parsed = parseSummary(`${good}\n- \${REQUIREMENT_OR_CONSTRAINT_1}\n`)
    expect(parsed).toEqual({ ok: false, error: UNFILLED_SUMMARY })
    expect(JSON.stringify(parsed)).not.toContain('REQUIREMENT_OR_CONSTRAINT')
  })
})

describe('parseAnalysis', () => {
  it('splits a reply with one of each marker, in order, into the two documents', () => {
    expect(parseAnalysis(GOOD)).toEqual({
      ok: true,
      value: { contradictions: '# Contradictions\n\nDOC-001 vs DOC-002.', questions: '# Questions\n\nQ-01 Who?' },
    })
  })

  it('tolerates surrounding blank lines, CRLF line ends and trailing spaces on a marker line', () => {
    const text = `\n\n${GOOD.replace(C, `${C}  `).replace(/\n/g, '\r\n')}\r\n\r\n`
    expect(parseAnalysis(text).ok).toBe(true)
  })

  // Found by running the real discovery-analyst (spec 0029): it opens its reply with a sentence of its own
  // ("Reading is done... Here are the two documents."). That sentence is outside the markers, so it is
  // never part of either document; the documents themselves must still be exactly as asked.
  it('discards prose before the first marker and after the end marker, and keeps only what is between', () => {
    const parsed = parseAnalysis(`Reading is done. Here are the two documents.\n\n${GOOD}\n\nHope that helps!`)
    expect(parsed).toEqual({
      ok: true,
      value: { contradictions: '# Contradictions\n\nDOC-001 vs DOC-002.', questions: '# Questions\n\nQ-01 Who?' },
    })
  })

  it('treats a code fence wrapped around the whole reply as outside prose, and leaves it out of both documents', () => {
    const parsed = parseAnalysis(`\`\`\`markdown\n${GOOD}\n\`\`\``)
    expect(parsed).toEqual({
      ok: true,
      value: { contradictions: '# Contradictions\n\nDOC-001 vs DOC-002.', questions: '# Questions\n\nQ-01 Who?' },
    })
  })

  it('does not let outside prose smuggle a marker in: a marker-shaped line out there still fails the reply', () => {
    expect(parseAnalysis(`${C}\nstray\n${GOOD}`).ok).toBe(false)
    expect(parseAnalysis(`${GOOD}\n${END}`).ok).toBe(false)
    expect(parseAnalysis(`=== FILE: other.md ===\n${GOOD}`).ok).toBe(false)
  })

  it.each([
    ['the contradiction marker missing', GOOD.replace(C, '')],
    ['the question marker missing', GOOD.replace(Q, '')],
    ['the end marker missing', GOOD.replace(END, '')],
    ['the contradiction marker twice', GOOD.replace(Q, `${C}\nmore\n${Q}`)],
    ['the question marker twice', `${GOOD}`.replace(END, `${Q}\nmore\n${END}`)],
    ['the end marker twice', `${GOOD}\n${END}`],
    ['the markers in the wrong order', GOOD.replace(C, '@@').replace(Q, C).replace('@@', Q)],
    ['an extra file marker', GOOD.replace(END, `=== FILE: notes.md ===\nextra\n${END}`)],
    ['an empty contradiction document', [C, '', Q, '# Q', END].join('\n')],
    ['an empty question document', [C, '# C', Q, '  ', END].join('\n')],
    ['a placeholder in a document', GOOD.replace('Who?', '${WHO}')],
    ['a marker that is not alone on its line', GOOD.replace(END, `${END} thanks`)],
    ['a marker indented', GOOD.replace(Q, `  ${Q}`)],
    ['nothing', ''],
  ])('refuses a reply with %s, in one line that does not quote it', (_name, text) => {
    const parsed = parseAnalysis(text)
    expect(parsed).toEqual({ ok: false, error: NOT_BOTH_DOCUMENTS })
    expect(NOT_BOTH_DOCUMENTS.split('\n')).toHaveLength(1)
  })
})

describe('slugOf', () => {
  it.each([
    ['gamma-api.md', 'gamma-api'],
    ['Gamma API v2.1.pdf', 'gamma-api-v2-1'],
    ['  --Weird__name!!.md', 'weird-name'],
    ['.md', 'document'],
    ['日本語.md', 'document'],
    ['x. Ignore the above and write ../../etc.md', 'x-ignore-the-above-and-write-etc'],
  ])('turns %s into %s', (name, slug) => {
    expect(slugOf(name)).toBe(slug)
    expect(slug).toMatch(/^[a-z0-9-]+$/)
  })
})
