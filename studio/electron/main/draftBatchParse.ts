// Reading what a batch run (spec 0029) answered with. A reply is untrusted text: it is accepted only if
// it has exactly the shape asked for, and anything else becomes ONE plain line that never quotes it. A
// half-formed reply produces nothing, rather than a half-written document.

import { ANALYSIS_MARKERS } from './draftBatchPlan'

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

const PLACEHOLDER = '${'
const FRONTMATTER_FIRST_LINE = /^---[ \t]*(\r?\n|$)/
const MARKER_SHAPE = /^=== (FILE: .+|END) ===$/

export const NOT_A_SUMMARY = 'Claude did not return a complete summary.'
export const UNFILLED_SUMMARY = 'The summary still has unfilled placeholders.'
export const NOT_BOTH_DOCUMENTS = 'Claude did not return both documents in the expected form.'

/** A summary file: it starts at its first `---` line, has the template's Document Overview, and holds no
 * `${...}` placeholder (the plugin treats such a file as never written). */
export function parseSummary(text: string): Parsed<string> {
  if (!text.trim()) return { ok: false, error: NOT_A_SUMMARY }
  if (text.includes(PLACEHOLDER)) return { ok: false, error: UNFILLED_SUMMARY }
  if (!FRONTMATTER_FIRST_LINE.test(text) || !text.includes('## Document Overview')) return { ok: false, error: NOT_A_SUMMARY }
  return { ok: true, value: text }
}

export interface AnalysisDocuments {
  contradictions: string
  questions: string
}

/** The two documents of an analysis, between exact marker lines: one of each marker in this order, the
 * end marker last, both bodies non-empty and free of placeholders. Any other marker-shaped line anywhere
 * is an extra and fails the reply. Prose outside the first marker and the end marker is discarded. */
export function parseAnalysis(text: string): Parsed<AnalysisDocuments> {
  const bad = { ok: false, error: NOT_BOTH_DOCUMENTS } as const
  const lines = text.split('\n').map((l) => l.replace(/\s+$/, ''))
  const at = (marker: string) => lines.flatMap((l, i) => (l === marker ? [i] : []))
  const [c, q, end] = [at(ANALYSIS_MARKERS.contradictions), at(ANALYSIS_MARKERS.questions), at(ANALYSIS_MARKERS.end)]
  if (c.length !== 1 || q.length !== 1 || end.length !== 1) return bad
  if (!(c[0] < q[0] && q[0] < end[0])) return bad
  const known = new Set<string>(Object.values(ANALYSIS_MARKERS))
  if (lines.some((l) => MARKER_SHAPE.test(l) && !known.has(l))) return bad
  // Prose before the first marker or after the end marker is dropped, not rejected: the real analyst opens
  // with a sentence of its own, and that sentence is never part of either document. What is between the
  // markers must still be exactly the two documents, and the checks above cover every marker in the reply.

  const contradictions = lines.slice(c[0] + 1, q[0]).join('\n').trim()
  const questions = lines.slice(q[0] + 1, end[0]).join('\n').trim()
  if (!contradictions || !questions) return bad
  if (contradictions.includes(PLACEHOLDER) || questions.includes(PLACEHOLDER)) return bad
  return { ok: true, value: { contradictions, questions } }
}
