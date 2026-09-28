/** How two versions of a document differ, computed so a person can see it.
 *
 * The clash screen used to put two full versions side by side and leave the reading to the person.
 * On a real project the two versions of a 200-line spec differed in exactly two words and looked
 * identical on screen. This finds the changed lines, marks the changed words inside them, and
 * folds the identical stretches away. Pure and dependency-free.
 */

export type Segment = { text: string; changed: boolean }

export interface DiffLine {
  /** `mine` is in the person's version only, `theirs` in the other only. */
  kind: 'same' | 'mine' | 'theirs'
  text: string
  /** For a changed line that has a counterpart, the line cut into pieces with the differing words
   * marked. Put back together they are exactly `text`. Absent when the whole line is new. */
  segments?: Segment[]
}

export interface DiffResult {
  lines: DiffLine[]
  changedLines: number
  mineLines: number
  theirsLines: number
  /** The two were too large and too different to line up; changed lines are then reported whole. */
  tooLarge?: boolean
}

/** Beyond this many cells of the comparison table the two are treated as unrelated. */
const MAX_CELLS = 4_000_000

/** Lines without their endings, so CRLF against LF is not a difference. A final line ending is not
 * a line of its own. */
function splitLines(text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** The longest common subsequence of two arrays, as the matching index pairs. */
function commonPairs<T>(a: T[], b: T[]): Array<[number, number]> {
  const n = a.length
  const m = b.length
  const width = m + 1
  const table = new Uint32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
    }
  }
  const pairs: Array<[number, number]> = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { pairs.push([i, j]); i++; j++ }
    else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) i++
    else j++
  }
  return pairs
}

/** Splits a line into words and the spaces between them, so pieces put back together are the line. */
const tokens = (line: string) => line.split(/(\s+)/).filter((t) => t !== '')

/** Marks which words of two paired lines differ, merging neighbours into runs. */
function markWords(mine: string, theirs: string): [Segment[], Segment[]] {
  const a = tokens(mine)
  const b = tokens(theirs)
  const matched = commonPairs(a, b)
  const inA = new Set(matched.map(([i]) => i))
  const inB = new Set(matched.map(([, j]) => j))
  const runs = (toks: string[], keep: Set<number>): Segment[] => {
    const out: Segment[] = []
    toks.forEach((text, i) => {
      const changed = !keep.has(i)
      const last = out[out.length - 1]
      if (last && last.changed === changed) last.text += text
      else out.push({ text, changed })
    })
    return out
  }
  return [runs(a, inA), runs(b, inB)]
}

export function diffLines(mine: string, theirs: string): DiffResult {
  const a = splitLines(mine)
  const b = splitLines(theirs)

  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }

  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  const lines: DiffLine[] = a.slice(0, start).map((text) => ({ kind: 'same', text }))
  let tooLarge = false

  if (midA.length * midB.length > MAX_CELLS) {
    tooLarge = true
    lines.push(...midA.map((text): DiffLine => ({ kind: 'mine', text })), ...midB.map((text): DiffLine => ({ kind: 'theirs', text })))
  } else {
    let i = 0
    let j = 0
    for (const [pi, pj] of [...commonPairs(midA, midB), [midA.length, midB.length] as [number, number]]) {
      while (i < pi) lines.push({ kind: 'mine', text: midA[i++] })
      while (j < pj) lines.push({ kind: 'theirs', text: midB[j++] })
      if (pi < midA.length) { lines.push({ kind: 'same', text: midA[pi] }); i++; j++ }
    }
  }
  lines.push(...a.slice(endA).map((text): DiffLine => ({ kind: 'same', text })))

  pairChangedLines(lines)
  return {
    lines,
    changedLines: lines.filter((l) => l.kind !== 'same').length,
    mineLines: a.length,
    theirsLines: b.length,
    ...(tooLarge ? { tooLarge } : {}),
  }
}

/** Where a run of the person's changed lines is directly followed by a run of the other side's,
 * the lines are counterparts: mark the words that differ between each pair. */
function pairChangedLines(lines: DiffLine[]): void {
  let i = 0
  while (i < lines.length) {
    if (lines[i].kind !== 'mine') { i++; continue }
    let mineEnd = i
    while (mineEnd < lines.length && lines[mineEnd].kind === 'mine') mineEnd++
    let theirsEnd = mineEnd
    while (theirsEnd < lines.length && lines[theirsEnd].kind === 'theirs') theirsEnd++
    const pairs = Math.min(mineEnd - i, theirsEnd - mineEnd)
    for (let k = 0; k < pairs; k++) {
      const [ms, ts] = markWords(lines[i + k].text, lines[mineEnd + k].text)
      lines[i + k].segments = ms
      lines[mineEnd + k].segments = ts
    }
    i = theirsEnd
  }
}

export type Hunk = { type: 'lines'; lines: DiffLine[] } | { type: 'gap'; count: number; lines: DiffLine[] }

/** The diff as shown: changed lines with `context` lines either side, and each longer identical
 * stretch folded into a gap that says how many lines it holds (and keeps them, to unfold). */
export function collapse(lines: DiffLine[], context = 2): Hunk[] {
  const show = new Array<boolean>(lines.length).fill(false)
  lines.forEach((l, i) => {
    if (l.kind === 'same') return
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) show[k] = true
  })
  const hunks: Hunk[] = []
  let i = 0
  while (i < lines.length) {
    let j = i
    while (j < lines.length && show[j] === show[i]) j++
    const run = lines.slice(i, j)
    hunks.push(show[i] ? { type: 'lines', lines: run } : { type: 'gap', count: run.length, lines: run })
    i = j
  }
  return hunks
}

/** One plain sentence about how much differs. */
export function describeDiff(result: DiffResult): string {
  if (result.changedLines === 0) return 'The two versions have the same text.'
  const mine = result.lines.filter((l) => l.kind === 'mine').length
  const theirs = result.lines.filter((l) => l.kind === 'theirs').length
  const plural = (n: number) => `${n} line${n === 1 ? '' : 's'}`
  const total = Math.max(result.mineLines, result.theirsLines)
  if (mine === theirs) return `${plural(mine)} ${mine === 1 ? 'differs' : 'differ'}, out of ${total}.`
  return `${plural(mine)} of yours and ${theirs} of theirs differ, out of ${total}.`
}
