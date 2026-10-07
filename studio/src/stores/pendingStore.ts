// Which writes are out right now, and what the plugin said (togo-command-center.md §2.4; Q4). A
// module store in the `roomStore` shape so a card, a dialog and the Today column read ONE
// record of a pending verb without a parent to hold it. Truthful pending states: a record is
// `sending` (the argv is on its way), then `answered` (exit heading + the plugin's first line,
// verbatim), then — on exit 0 only — `rereading` until the host's refreshed read lands and the
// record is settled away. The store holds NO next state of any card, chip or count: nothing in
// here says what the screen will show; that is the refreshed read's alone. Never reaches
// `window.studio`; the caller runs the IPC and reports back.
import { useSyncExternalStore } from 'react'
import type { SprintVerbRequest } from '../../shared/types'
import { exitHeading } from '../../shared/reasons'
import { dismiss as dismissToast, toast as showToast } from '../ui/toastStore'
import type { ToastInput } from '../ui/contract-data'
import { answeredWording, pluginFirstLine, REREADING, rereadingWording, SENDING, sendingWording, type AnswerLike } from './toastWording'

export type PendingPhase = 'sending' | 'answered' | 'rereading'

/** What the verb is about, so a card can ask "is a write out on me?" — never a person. */
export interface PendingTarget { spec?: string; sprint?: string; id?: string }

export interface PendingVerb {
  key: string
  verb: string
  argvLine: string
  target: PendingTarget
  phase: PendingPhase
  startedAt: number
  /** The plugin's answer once it arrived; null while sending. */
  answer: { exitCode: number | null; heading: string; line: string } | null
}

type Listener = () => void
const EMPTY: readonly PendingVerb[] = []
let snapshot: readonly PendingVerb[] = EMPTY
let counter = 0
const listeners = new Set<Listener>()
const toasts = new Map<string, string>()

function emit(): void { for (const l of Array.from(listeners)) l() }
function update(key: string, patch: Partial<PendingVerb>): void {
  if (!snapshot.some((p) => p.key === key)) return
  snapshot = snapshot.map((p) => (p.key === key ? { ...p, ...patch } : p))
  emit()
}
function swapToast(key: string, input: ToastInput | null): void {
  const old = toasts.get(key)
  if (old) { dismissToast(old); toasts.delete(key) }
  if (input) toasts.set(key, showToast(input))
}

/** The target a request is about: the spec for a spec verb, the sprint otherwise. */
export function targetOf(req: SprintVerbRequest): PendingTarget {
  if ('spec' in req && typeof req.spec === 'string') return { spec: req.spec }
  if (req.verb === 'slate') return { spec: req.specs[0], sprint: req.sprint }
  return 'sprint' in req ? { sprint: req.sprint } : {}
}

/** Record a write going out: a `sending` record and (when `withToast`) its sticky toast. */
export function beginPending(verb: string, argvLine: string, target: PendingTarget, withToast = true): string {
  const key = `pending-${++counter}`
  snapshot = [...snapshot, { key, verb, argvLine, target, phase: 'sending', startedAt: Date.now(), answer: null }]
  emit()
  if (withToast) swapToast(key, sendingWording(argvLine))
  return key
}

/** The plugin answered: exit heading + first line, verbatim. Exit 0 moves straight to
 * `rereading` (the host's refreshed read is what settles it); 1, 2 and Studio's own refusal
 * (`null`) stay `answered` until the person dismisses or the host settles. */
export function answerPending(key: string, answer: AnswerLike): void {
  const line = pluginFirstLine(answer.exitCode === 0 ? answer.stdout : answer.stderr, answer.exitCode === 0 ? answer.stderr : answer.stdout)
  const heading = answer.exitCode === null ? 'Not run' : exitHeading(answer.exitCode)
  const rec = snapshot.find((p) => p.key === key)
  update(key, { phase: answer.exitCode === 0 ? 'rereading' : 'answered', answer: { exitCode: answer.exitCode, heading, line } })
  if (toasts.has(key) && rec) swapToast(key, answer.exitCode === 0 ? rereadingWording(rec.argvLine) : answeredWording(answer))
}

/** The refreshed read landed (or the record is no longer wanted): drop it and its toast. After
 * an exit 0 the toast closes with the plugin's own Done line, no longer sticky. */
export function settlePending(key: string): void {
  const rec = snapshot.find((p) => p.key === key)
  if (!rec) return
  snapshot = snapshot.filter((p) => p.key !== key)
  if (snapshot.length === 0) snapshot = EMPTY
  emit()
  if (!toasts.has(key)) return
  if (rec.answer?.exitCode === 0) swapToast(key, { ...answeredWording({ exitCode: 0, stdout: rec.answer.line, stderr: '' }), sticky: false })
  else swapToast(key, null)
  toasts.delete(key)
}

/** Settle every record that is `rereading` — what the host calls when its refreshed read lands. */
export function settleReread(): void {
  for (const p of snapshot.filter((x) => x.phase === 'rereading')) settlePending(p.key)
}

export const PHASE_WORDS: Readonly<Record<PendingPhase, string>> = { sending: SENDING, answered: 'answered', rereading: REREADING }

/** The sentence for a record, in the only words the phase allows. */
export function pendingText(p: PendingVerb): string {
  if (p.phase === 'sending') return SENDING
  if (p.phase === 'rereading') return REREADING
  return p.answer ? [p.answer.heading, p.answer.line].filter(Boolean).join(' — ') : 'answered'
}

function getSnapshot(): readonly PendingVerb[] { return snapshot }
function subscribe(l: Listener): () => void { listeners.add(l); return () => { listeners.delete(l) } }

export const pendingStore = { getSnapshot, subscribe, begin: beginPending, answer: answerPending, settle: settlePending, settleReread }

/** Every pending record, re-rendering the caller as they change. */
export function usePendingVerbs(): readonly PendingVerb[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** The pending record about one target (a spec id, a sprint id or a DL id), or null. Without a
 * target: the most recent record of any kind. This is the hook a card or dialog uses to read
 * "a write is out on me" and show its truthful line. */
export function usePendingVerb(target?: PendingTarget | string): PendingVerb | null {
  const all = usePendingVerbs()
  if (target === undefined) return all[all.length - 1] ?? null
  const t = typeof target === 'string' ? { spec: target, sprint: target, id: target } : target
  const mine = all.filter((p) => (t.spec !== undefined && p.target.spec === t.spec) || (t.sprint !== undefined && p.target.sprint === t.sprint) || (t.id !== undefined && p.target.id === t.id))
  return mine[mine.length - 1] ?? null
}

/** Run one write with its truthful lifecycle: sending → the plugin's answer → (exit 0) rereading
 * until `settleReread()`; a non-zero answer is settled by `settlePending(key)` or the person. The
 * result is returned untouched — the caller still re-reads after exit 0, never before. */
export async function trackVerb<R extends AnswerLike>(verb: string, argvLine: string, target: PendingTarget, run: () => Promise<R>, withToast = true): Promise<{ key: string; result: R }> {
  const key = beginPending(verb, argvLine, target, withToast)
  try {
    const result = await run()
    answerPending(key, result)
    return { key, result }
  } catch (e) {
    answerPending(key, { exitCode: null, stdout: '', stderr: e instanceof Error ? e.message : String(e) })
    throw e
  }
}

/** For tests: forget every record and toast. */
export function resetPendingStore(): void {
  for (const id of toasts.values()) dismissToast(id)
  toasts.clear()
  snapshot = EMPTY
  emit()
}
