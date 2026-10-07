/** What a person looking at a screen would notice, as rules a test can apply.
 *
 * The smoke suite measures each screen in the real window (see measure.ts) and hands the raw
 * numbers and text here. Nothing in this file touches a browser, so every rule is unit-tested
 * (test/smokeFindings.test.ts) and a rule that stops firing is caught, not silently lost.
 *
 * Severity decides what fails the run:
 *   bug  - a defect any user would hit: leaked internals, a control with no name, a screen that
 *          scrolls sideways at a normal size, an error banner nobody expected, a blank screen.
 *   warn - probably wrong, but a judgement call: text cut off, a tiny click target.
 *   note - wording for a non-developer (this app's audience) that reads like internals.
 * Only `bug` fails the test; the rest land in the report for the human-eye pass.
 */

export type Severity = 'bug' | 'warn' | 'note'

export interface Finding {
  severity: Severity
  kind: string
  screen: string
  size: string
  detail: string
}

/** Raw facts about one screen, collected in the page. Plain data so it can cross the process boundary. */
export interface ScreenMeasure {
  text: string
  width: number
  overflowX: boolean
  /** Short descriptions of elements that sit past the right edge of the window. */
  offscreen: string[]
  /** Interactive elements with no accessible name, described by tag and nearby text. */
  unnamed: string[]
  /** Visible interactive elements smaller than 24 by 24 CSS pixels. */
  smallTargets: string[]
  /** Elements whose text is cut off by the box it is in. */
  truncated: string[]
  /** Visible text of anything styled or marked as an error. */
  errorBanners: string[]
  headings: string[]
  interactive: number
  imagesWithoutAlt: number
}

/** Text that should never reach a person: a missing value, a template left unfilled, a stack trace,
 * a file-system error code, or a path on the person's own disk. */
const LEAKS: { kind: string; pattern: RegExp }[] = [
  // "is undefined" is a sentence about a term, not a missing value.
  { kind: 'undefined', pattern: /(?<!\b(?:is|are|was|be|remains|left) )\bundefined\b/ },
  { kind: 'NaN', pattern: /\bNaN\b/ },
  { kind: 'object-to-string', pattern: /\[object Object\]/ },
  // Only a value standing alone ("Owner: null"), not the word in a sentence ("null paths").
  { kind: 'null', pattern: /(^|:\s)null\s*($|[,.)])/m },
  // `${name}` is a template left unfilled. `${{ ... }}` is a GitHub Actions expression, which is
  // never a placeholder of Studio's own.
  { kind: 'template-placeholder', pattern: /\$\{(?!\{)[^}]*\}/ },
  // Text a command-line tool wrote for its own users, passed through as it came.
  { kind: 'raw-tool-message', pattern: /\bGH_TOKEN\b|\bgh auth login\b/ },
  { kind: 'stack-trace', pattern: /Traceback \(most recent|\bat Object\.|\bat async \w+|TypeError:|ReferenceError:|SyntaxError:/ },
  { kind: 'filesystem-error', pattern: /\b(ENOENT|EPERM|EACCES|EBUSY|EEXIST)\b/ },
  { kind: 'local-path', pattern: /\b[A-Za-z]:\\(Users|Windows|Program Files)\b|(^|\s)\/(Users|home)\/[a-z]/ },
]

export function leaks(text: string): string[] {
  const found: string[] = []
  for (const { kind, pattern } of LEAKS) {
    const m = pattern.exec(text)
    if (m) found.push(`${kind}: "${excerpt(text, m.index)}"`)
  }
  return found
}

/** Words that mean something to the people who built this and little to the people who use it. */
const JARGON = [
  'frontmatter', 'stdout', 'stderr', 'exit code', 'argv', 'subprocess', 'stack trace',
  'regex', 'YAML', 'JSON', 'ledger', 'SHA-256', 'diffhash', 'worktree', 'daemon', 'IPC',
]

export function jargon(text: string): string[] {
  return JARGON.filter((word) => new RegExp(`(^|[^A-Za-z])${escape(word)}([^A-Za-z]|$)`, 'i').test(text))
}

/** The widest a window can be and still be expected to fit without scrolling sideways is every
 * size the suite measures; a stacked layout is only promised below 640. */
const SIDEWAYS_SCROLL_IS_A_BUG_FROM = 640

export function judge(screen: string, size: string, m: ScreenMeasure): Finding[] {
  const out: Finding[] = []
  const add = (severity: Severity, kind: string, detail: string) => out.push({ severity, kind, screen, size, detail })

  if (m.text.trim().length < 20) add('bug', 'blank-screen', `only ${m.text.trim().length} characters of text on screen`)
  // A full path is warned about, not failed: Settings and the new-project form show the folder on purpose.
  for (const leak of leaks(m.text)) add(leak.startsWith('local-path') ? 'warn' : 'bug', leak.startsWith('local-path') ? 'shows-full-path' : 'leaked-internals', leak)
  for (const banner of m.errorBanners) add('bug', 'error-showing', banner)
  for (const el of m.unnamed) add('bug', 'control-without-name', el)
  if (m.overflowX) {
    const severity: Severity = m.width >= SIDEWAYS_SCROLL_IS_A_BUG_FROM ? 'bug' : 'warn'
    add(severity, 'scrolls-sideways', m.offscreen.length ? `past the edge: ${m.offscreen.join('; ')}` : 'the page is wider than the window')
  }
  if (m.imagesWithoutAlt > 0) add('warn', 'image-without-alt', `${m.imagesWithoutAlt} image(s) with no alt text`)
  for (const el of m.truncated) add('warn', 'text-cut-off', el)
  for (const el of m.smallTargets) add('warn', 'tiny-click-target', el)
  if (m.headings.length === 0 && m.text.trim().length >= 20) add('warn', 'no-heading', 'nothing on this screen says what it is')
  if (m.interactive === 0) add('warn', 'dead-end', 'no control a person could use on this screen')
  for (const word of jargon(m.text)) add('note', 'developer-wording', `"${word}" in text meant for a non-developer`)
  return out
}

function excerpt(text: string, at: number): string {
  return text.slice(Math.max(0, at - 25), at + 45).replace(/\s+/g, ' ').trim()
}

function escape(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
