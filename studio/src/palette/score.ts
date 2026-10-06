// The palette's matcher (studio-observatory.md §6.1 "Matching"). Dependency-free on purpose: a
// fuzzy-search library would be the first runtime dependency the renderer adds for a feature
// that needs a few dozen lines, and its ranking would be a black box when someone asks why
// "Open spec 0008" came second. Everything here is a plain function over strings so the ranking
// can be unit-tested without a DOM.
import { PALETTE_GROUP_ORDER, PALETTE_MAX_RESULTS, PALETTE_PREFIX_GROUP } from './types'
import type { PaletteEntry, PaletteGroup, PalettePrefix, ScoredEntry } from './types'

/** A query's leading prefix, when it is one of the four filters, and the text after it. A lone
 * prefix (`#` with nothing typed yet) still filters: the person sees the whole group. */
export function parsePrefix(raw: string): { prefix: PalettePrefix | null; query: string } {
  const first = raw.charAt(0)
  if (first in PALETTE_PREFIX_GROUP) {
    return { prefix: first as PalettePrefix, query: raw.slice(1).trimStart() }
  }
  return { prefix: null, query: raw.trim() }
}

/** Looks like one of the plugin's ids: a four-digit spec number, `FR-002`, `DL-03`, `DOC-001`,
 * `S07`. Typing the start of one is almost always a request for exactly that row, so a prefix
 * hit on an id keyword outranks a scattered subsequence through a title. */
const MONO_ID = /^(\d{3,4}|[A-Z]{1,4}-?\d{1,3})$/i

const WORD_START_BONUS = 6
const CONSECUTIVE_BONUS = 3
const ID_PREFIX_BONUS = 40
const EXACT_BONUS = 20
const GAP_PENALTY = 1
/** Recency is a tie-breaker and a nudge, never an override: the most recent pick gains less
 * than one word-start bonus so a better textual match still wins. */
const RECENCY_BOOST_MAX = 5

function isWordStart(text: string, i: number): boolean {
  if (i === 0) return true
  const prev = text.charAt(i - 1)
  return !/[a-z0-9]/i.test(prev) || (/[a-z]/.test(prev) && /[A-Z]/.test(text.charAt(i)))
}

function walk(query: string, text: string, preferWordStarts: boolean): { score: number; matches: number[] } | null {
  const t = text.toLowerCase()
  const matches: number[] = []
  let score = 0
  let ti = 0
  for (let qi = 0; qi < query.length; qi++) {
    const ch = query.charAt(qi)
    let at = -1
    if (preferWordStarts) {
      for (let k = ti; k < t.length; k++) {
        if (t.charAt(k) === ch && isWordStart(text, k)) { at = k; break }
      }
    }
    if (at < 0) at = t.indexOf(ch, ti)
    if (at < 0) return null
    const prev = matches[matches.length - 1]
    if (isWordStart(text, at)) score += WORD_START_BONUS
    if (prev !== undefined && at === prev + 1) score += CONSECUTIVE_BONUS
    if (prev !== undefined) score -= Math.min(at - prev - 1, 8) * GAP_PENALTY
    matches.push(at)
    ti = at + 1
  }
  if (t === query) score += EXACT_BONUS
  else if (t.startsWith(query)) score += EXACT_BONUS / 2
  return { score, matches }
}

/** Subsequence match of `query` through `text`. Word starts are preferred, but greedily
 * jumping to a later word start can skip past a character the rest of the query still needs
 * ("fr-0" against "Frame - Review 0" must take the first `r`), so a failed word-start walk
 * falls back to the plain greedy one before declaring no match. */
export function subsequence(query: string, text: string): { score: number; matches: number[] } | null {
  const q = query.toLowerCase()
  if (q.length === 0) return { score: 0, matches: [] }
  return walk(q, text, true) ?? walk(q, text, false)
}

/** Score one entry. Title and keywords are both tried; the best wins, with keyword hits
 * reported as no title highlight (the matched text is not on screen). */
export function scoreEntry(query: string, entry: PaletteEntry, recentRank = -1): ScoredEntry | null {
  let best: { score: number; matches: number[] } | null = subsequence(query, entry.title)
  for (const kw of entry.keywords) {
    let s = subsequence(query, kw)
    if (!s) continue
    s = { score: s.score, matches: [] }
    if (MONO_ID.test(kw) && kw.toLowerCase().startsWith(query.toLowerCase())) s.score += ID_PREFIX_BONUS
    if (!best || s.score > best.score) best = s
  }
  if (entry.subtitle && !best) {
    const s = subsequence(query, entry.subtitle)
    if (s) best = { score: s.score - WORD_START_BONUS, matches: [] }
  }
  if (!best) return null
  const boost = recentRank < 0 ? 0 : Math.max(0, RECENCY_BOOST_MAX - recentRank)
  return { entry, score: best.score + boost, matches: best.matches }
}

const groupRank = (g: PaletteGroup) => PALETTE_GROUP_ORDER.indexOf(g)

export interface RankOptions {
  recentIds?: readonly string[]
  max?: number
}

/** Rank the whole index for a raw query. A prefix narrows to its group; an empty query lists
 * the groups in order (recent picks first) so the palette is also a menu. Ties fall to group
 * order, then to the index's own order, so the result is stable between keystrokes. */
export function rankEntries(raw: string, entries: readonly PaletteEntry[], opts: RankOptions = {}): ScoredEntry[] {
  const { prefix, query } = parsePrefix(raw)
  const max = opts.max ?? PALETTE_MAX_RESULTS
  const recent = opts.recentIds ?? []
  const group = prefix ? PALETTE_PREFIX_GROUP[prefix] : null
  const pool = group ? entries.filter((e) => e.group === group) : entries
  const scored: { s: ScoredEntry; i: number }[] = []
  pool.forEach((entry, i) => {
    const rank = recent.indexOf(entry.id)
    const s = query ? scoreEntry(query, entry, rank) : { entry, score: rank < 0 ? 0 : RECENCY_BOOST_MAX - Math.min(rank, RECENCY_BOOST_MAX - 1), matches: [] }
    // A match that is all gaps (a few letters scattered through a subtitle) scores below zero
    // and would only pad the list; the person typed something, so show what it fits.
    if (s && s.score >= 0) scored.push({ s, i })
  })
  scored.sort((a, b) =>
    b.s.score - a.s.score
    || groupRank(a.s.entry.group) - groupRank(b.s.entry.group)
    || a.i - b.i)
  return scored.slice(0, max).map((x) => x.s)
}
