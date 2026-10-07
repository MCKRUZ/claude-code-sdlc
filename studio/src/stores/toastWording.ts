// The words a write shows while it runs and when the plugin answers (togo-command-center.md
// §2.4; Q4). Truthful by construction: the pending line says only that the request is on its way
// ("sending to the plugin…" with the exact argv), the answer line is the exit heading and the
// plugin's FIRST line verbatim, and the in-between says re-reading — never "done", "moved" or a
// count before the exit code and the refreshed read have both arrived. No optimistic word exists
// here. Pure: no store, no DOM; `pendingStore` and the screens compose these.
import type { ToastInput, ToastTone } from '../ui/contract-data'
import { exitHeading, FORBIDDEN_METRIC_WORDS } from '../../shared/reasons'

/** While the spawn is out. The ellipsis is the only promise: a request was sent. */
export const SENDING = 'sending to the plugin…'
/** After exit 0, before the refreshed read: nothing on screen has changed yet, and says so. */
export const REREADING = 'the plugin said Done — re-reading before anything on screen changes'
/** Studio refused before spawning (no actor, a bad request): not the plugin's answer. */
export const NOT_RUN = 'Not run'
/** The pending line a disabled control may carry while its own write is out. */
export const WAITING_FOR_PLUGIN = 'waiting for the plugin to answer…'

export interface AnswerLike {
  /** 0 Done · 1 Not done · 2 Refused · null = Studio did not ask the plugin. */
  exitCode: number | null
  stdout: string
  stderr: string
}

/** The plugin's first non-empty line, verbatim (trailing whitespace only is trimmed). Empty when
 * it printed nothing — then the heading alone is the answer; nothing is invented. */
export function pluginFirstLine(...texts: string[]): string {
  for (const text of texts) {
    const line = text.split(/\r?\n/).map((l) => l.trimEnd()).find((l) => l.trim() !== '')
    if (line !== undefined) return line
  }
  return ''
}

export function toneForExit(exitCode: number | null): ToastTone {
  if (exitCode === 0) return 'ok'
  if (exitCode === 2) return 'error'
  return 'warn'
}

/** The toast while the request is out: sticky until `answeredWording` replaces it. */
export function sendingWording(argvLine: string): ToastInput {
  return { tone: 'info', title: SENDING, detail: argvLine, sticky: true }
}

/** The plugin's answer: its exit heading, its first line. A refusal or a "Not done" stays until
 * read (sticky); Done keeps the kit's six seconds. `exitCode: null` is Studio's own refusal. */
export function answeredWording(answer: AnswerLike): ToastInput {
  if (answer.exitCode === null) return { tone: 'warn', title: NOT_RUN, detail: pluginFirstLine(answer.stderr, answer.stdout), sticky: true }
  const line = pluginFirstLine(answer.exitCode === 0 ? answer.stdout : answer.stderr, answer.exitCode === 0 ? answer.stderr : answer.stdout)
  return { tone: toneForExit(answer.exitCode), title: exitHeading(answer.exitCode), detail: line || undefined, sticky: answer.exitCode !== 0 }
}

/** A script that answers `{ok, message}` rather than an exit code (`spec_transition.py`,
 * `track_decisions.py`): ok reads as exit 0, a refusal as exit 1 — these scripts never exit 2. */
export function answeredFromOk(ok: boolean, message: string, refusal = ''): ToastInput {
  return answeredWording({ exitCode: ok ? 0 : 1, stdout: ok ? message : '', stderr: ok ? '' : refusal || message })
}

/** Between exit 0 and the refreshed read. */
export function rereadingWording(argvLine: string): ToastInput {
  return { tone: 'info', title: REREADING, detail: argvLine, sticky: true }
}

/** The one guard a test can hold every wording to: no activity-metric word, no digit Studio
 * typed itself. `allowed` is the plugin's own text (an answer line may carry its numbers). */
export function isTruthfulWording(input: ToastInput, allowed: readonly string[] = []): boolean {
  const own = [input.title, input.detail].filter((v): v is string => typeof v === 'string').join('\n')
  if (FORBIDDEN_METRIC_WORDS.test(own)) return false
  const stripped = allowed.reduce((text, a) => (a ? text.split(a).join('') : text), own)
  return !/\d/.test(stripped)
}
