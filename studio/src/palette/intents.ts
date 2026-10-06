// The omnibar's one parser (togo-command-center.md §3.6). `parseIntent(text, ctx)` is PURE and
// resolves ids and names ONLY against the rows and roster the host already holds — a spec id
// that is not on the board, a sprint id the plugin never listed, a name not on the roster is a
// miss or a visible gap, never a guess, so no free text ever reaches argv except the reasons and
// notes the plugin's own flags ask for. A match is one palette row (group `verbs`, titled with
// the exact `describeArgv` line); `↵` opens the VerbDialog and NEVER runs anything. The grammar:
//
//   pull NNNN · verdict NNNN accepted|returned|pending|n-a [eng|data] [because …]
//   hand [off] NNNN to NAME [note …] · ack NNNN · defer NNNN because … · defer NNNN to SNN because …
//   unslate NNNN because … · decide DL-NN … · decision … · confirm tier NNNN · ready SNN
//   close SNN · new sprint
import type { SprintVerbRequest, VerdictLane, VerdictValue } from '../../shared/types'
import { newerPlugin, CAPABILITIES } from '../../shared/reasons'
import { SPRINT_ID } from '../../shared/sprintModel'
import { buildSprintVerbArgv, describeArgv, SCRIPT, SPEC_ID, VERB_CAPABILITY } from '../../shared/sprintVerbArgv'
import { normalizeHandle } from '../../shared/identity'
import type { PaletteEntry } from './types'

/** The board facts the parser reads — a `BoardRow` or a converted slate row carries all four. */
export interface IntentRow {
  spec: string
  status: string
  sprint: string
  path: string
  name?: string
}

export interface IntentPerson {
  handle: string
  name?: string
}

export interface IntentContext {
  rows: readonly IntentRow[]
  roster: readonly IntentPerson[]
  /** `sprints.active` from the command center, or the status sprint's id; null with no sprint. */
  activeSprint: string | null
  /** Every sprint id the plugin listed (`sprint.py list --json`); empty when the list is unknown. */
  sprintIds: readonly string[]
  /** `generate_status.py --json` capabilities; null while unknown — then nothing is disabled. */
  capabilities: readonly string[] | null
  /** The signed-in person's label, for the preview line only; main fills the real `--by`. */
  actor: string | null
}

/** A hand-off recipient: resolved to a roster handle, or an unresolved typed name (the gap). */
export type Recipient = { handle: string; unresolved?: undefined } | { handle: null; unresolved: string }

export type Intent =
  /** A `sprint.py` write through the closed argv table. `fallback` marks a carry the plugin cannot do yet. */
  | { kind: 'sprint'; request: SprintVerbRequest; recipient?: Recipient }
  /** "pull NNNN": slated + READY → the hand-off; unslated → add to the slate. The dialog offers the other. */
  | { kind: 'pull'; spec: string; path: string; slated: boolean; ready: boolean; sprint: string | null }
  | { kind: 'defer'; spec: string; path: string; reason: string }
  | { kind: 'decide'; id: string; resolution: string }
  | { kind: 'decision'; text: string }
  | { kind: 'confirm-tier'; spec: string; path: string }
  | { kind: 'close'; sprint: string }
  | { kind: 'new-sprint'; sprint?: string }

export interface IntentMatch {
  intent: Intent
  /** The row's title: the exact spawn for a sprint verb, the plain sentence otherwise. */
  title: string
  subtitle: string
  /** Set when the plugin lacks the verb's capability — the row is present, the Confirm disabled. */
  disabledReason?: string
}

const VERDICTS: Record<string, VerdictValue> = { accepted: 'accepted', returned: 'returned', pending: 'pending', 'n-a': 'n-a', na: 'n-a', 'n/a': 'n-a' }
const DL_ID = /^DL-\d+$/i

/** The signed-in person as the preview's `--by`; "<you>" marks a missing actor without claiming one. */
export const ACTOR_PLACEHOLDER = '<you>'

const row = (ctx: IntentContext, id: string) => ctx.rows.find((r) => r.spec === id) ?? null
const sprintKnown = (ctx: IntentContext, id: string) => SPRINT_ID.test(id) && (ctx.sprintIds.length === 0 || ctx.sprintIds.includes(id))

/** A typed name resolves to a roster handle only when it names exactly ONE person: the handle,
 * the full name, or a first name / handle prefix that fits one row. Two Sams → unresolved (the
 * dialog asks); nobody → unresolved. Never a guess between candidates. */
function resolvePerson(ctx: IntentContext, typed: string): Recipient {
  const q = normalizeHandle(typed)
  const full = typed.trim().toLowerCase()
  const exact = ctx.roster.filter((p) => normalizeHandle(p.handle) === q || (p.name ?? '').trim().toLowerCase() === full)
  if (exact.length === 1) return { handle: exact[0].handle }
  if (exact.length === 0) {
    const loose = ctx.roster.filter((p) => normalizeHandle(p.handle).startsWith(q) || (p.name ?? '').trim().toLowerCase().split(/\s+/)[0] === full)
    if (loose.length === 1) return { handle: loose[0].handle }
  }
  return { handle: null, unresolved: typed.trim() }
}

function capabilityGap(ctx: IntentContext, cap: string | null): string | undefined {
  if (!cap || ctx.capabilities === null) return undefined
  return ctx.capabilities.includes(cap) ? undefined : newerPlugin(cap)
}

/** The preview line for a sprint verb: `describeArgv` of the golden argv with the actor label. */
export function previewSprintVerb(request: SprintVerbRequest, actor: string | null): string {
  const built = buildSprintVerbArgv(request, actor ?? ACTOR_PLACEHOLDER)
  if (built.ok) return describeArgv(built.argv)
  // A request the table refuses (an unresolved recipient, a missing reason) still previews what
  // IS known of its line, with the gap shown as a placeholder — never a guess filled in.
  return describeArgv(sketchArgv(request, actor ?? ACTOR_PLACEHOLDER))
}

/** The line as far as the request goes: every present field as its flag, a missing one as
 * `<flag?>`. Pure; only for the preview — the real argv comes from the table on Confirm. */
export function sketchArgv(request: SprintVerbRequest, actor: string): string[] {
  const r = request as unknown as Record<string, unknown>
  const out: string[] = [request.verb]
  const flag = (key: string, name = key) => {
    const v = r[key]
    if (Array.isArray(v)) { for (const item of v) out.push(`--${name}`, String(item)); return }
    if (v === undefined || v === null || v === '') { out.push(`--${name}`, `<${name}?>`); return }
    if (typeof v === 'boolean') { if (v) out.push(`--${name}`); return }
    out.push(`--${name}`, String(v))
  }
  switch (request.verb) {
    case 'slate': flag('sprint'); flag('specs', 'spec'); if (r.override) { flag('override'); flag('reason') } break
    case 'unslate': flag('spec'); flag('reason'); break
    case 'handoff': flag('spec'); flag('to'); if (r.note) flag('note'); break
    case 'ack': flag('spec'); break
    case 'verdict': flag('spec'); flag('lane'); flag('verdict'); if (r.verdict === 'n-a' || r.reason) flag('reason'); break
    case 'ready': flag('sprint'); break
    case 'close': flag('sprint'); if (r.carryTo) flag('carryTo', 'carry-to'); break
    case 'new': flag('sprint'); flag('goal'); flag('start'); flag('target'); break
    case 'carry': flag('spec'); flag('to'); flag('reason'); break
    case 'edit': flag('sprint'); flag('goal'); break
  }
  out.push('--by', actor)
  return out
}

function sprintMatch(ctx: IntentContext, request: SprintVerbRequest, subtitle: string, recipient?: Recipient): IntentMatch {
  return {
    intent: { kind: 'sprint', request, recipient },
    title: previewSprintVerb(request, ctx.actor),
    subtitle,
    disabledReason: capabilityGap(ctx, VERB_CAPABILITY[request.verb]),
  }
}

export function parseIntent(raw: string, ctx: IntentContext): IntentMatch | null {
  const text = raw.trim().replace(/\s+/g, ' ')
  if (!text) return null
  let m: RegExpMatchArray | null

  if ((m = text.match(/^pull (\d{4})$/i))) {
    const r = row(ctx, m[1])
    if (!r) return null
    const slated = r.sprint !== ''
    const ready = r.status === 'ready'
    const title = slated && ready ? `Pull ${r.spec} → hand it off (slated, READY)` : slated ? `Pull ${r.spec} → the hand-off (not READY yet)` : `Pull ${r.spec} → add it to the slate first`
    const subtitle = slated ? 'handoff.py opens the branch and the PR; the plugin checks the DoR, the roster and the WIP cap' : `sprint.py slate puts it on ${ctx.activeSprint ?? 'the active sprint'}; the hand-off comes after`
    return { intent: { kind: 'pull', spec: r.spec, path: r.path, slated, ready, sprint: ctx.activeSprint }, title, subtitle, disabledReason: slated ? undefined : capabilityGap(ctx, VERB_CAPABILITY.slate) }
  }
  if ((m = text.match(/^verdict (\d{4}) (accepted|returned|pending|n-a|na|n\/a)(?: (eng|data))?(?: because (.+))?$/i))) {
    const r = row(ctx, m[1])
    if (!r) return null
    const lane = (m[3]?.toLowerCase() ?? 'eng') as VerdictLane
    const verdict = VERDICTS[m[2].toLowerCase()]
    const request: SprintVerbRequest = { verb: 'verdict', spec: r.spec, lane, verdict, ...(m[4] ? { reason: m[4] } : {}) }
    return sprintMatch(ctx, request, `Record the ${lane} verdict on ${r.spec}; the plugin checks it is slated${verdict === 'n-a' ? ' and that n-a is a data-lane verdict with a reason' : ''}`)
  }
  if ((m = text.match(/^hand(?: off)? (\d{4}) to (\S+)(?: note (.+))?$/i))) {
    const r = row(ctx, m[1])
    if (!r) return null
    const recipient = resolvePerson(ctx, m[2])
    const request: SprintVerbRequest = { verb: 'handoff', spec: r.spec, to: recipient.handle ?? '', ...(m[3] ? { note: m[3] } : {}) }
    const subtitle = recipient.handle ? `Open a hand-off of ${r.spec} to ${recipient.handle}; the plugin checks they are a person and the spec is in the sprint` : `“${recipient.unresolved}” is not on the roster — pick the person in the dialog`
    return sprintMatch(ctx, request, subtitle, recipient)
  }
  if ((m = text.match(/^ack (\d{4})$/i))) {
    const r = row(ctx, m[1])
    return r ? sprintMatch(ctx, { verb: 'ack', spec: r.spec }, `Acknowledge the hand-off of ${r.spec}; the plugin checks one is open to you`) : null
  }
  if ((m = text.match(/^defer (\d{4}) to (S\d{2,}) because (.+)$/i))) {
    const r = row(ctx, m[1])
    const to = m[2].toUpperCase()
    if (!r || !sprintKnown(ctx, to)) return null
    return sprintMatch(ctx, { verb: 'carry', spec: r.spec, to, reason: m[3] }, `Carry ${r.spec} to ${to} with the reason recorded; the plugin checks ${to} exists and is open`)
  }
  if ((m = text.match(/^defer (\d{4}) because (.+)$/i))) {
    const r = row(ctx, m[1])
    if (!r) return null
    return { intent: { kind: 'defer', spec: r.spec, path: r.path, reason: m[2] }, title: `Defer ${r.spec} — leave the Build loop`, subtitle: 'spec_transition.py defer records the reason in the spec; the plugin refuses an empty or token reason' }
  }
  if ((m = text.match(/^unslate (\d{4}) because (.+)$/i))) {
    const r = row(ctx, m[1])
    return r ? sprintMatch(ctx, { verb: 'unslate', spec: r.spec, reason: m[2] }, `Take ${r.spec} off the slate with the reason recorded`) : null
  }
  if ((m = text.match(/^decide (DL-\d+) (.+)$/i)) && DL_ID.test(m[1])) {
    const id = m[1].toUpperCase()
    return { intent: { kind: 'decide', id, resolution: m[2] }, title: `Decide ${id}`, subtitle: 'track_decisions.py decide records the resolution against you and stops the clock' }
  }
  if ((m = text.match(/^decision (.+)$/i))) {
    return { intent: { kind: 'decision', text: m[1] }, title: 'Open a decision', subtitle: 'track_decisions.py open allocates the next DL-NN with you as owner and a 2-business-day clock' }
  }
  if ((m = text.match(/^confirm tier (\d{4})$/i))) {
    const r = row(ctx, m[1])
    if (!r) return null
    return { intent: { kind: 'confirm-tier', spec: r.spec, path: r.path }, title: `Confirm the risk tier of ${r.spec}`, subtitle: 'spec_transition.py confirm-tier writes risk_confirmed_by against you', disabledReason: capabilityGap(ctx, CAPABILITIES.confirmTier) }
  }
  if ((m = text.match(/^ready (S\d{2,})$/i))) {
    const id = m[1].toUpperCase()
    return sprintKnown(ctx, id) ? sprintMatch(ctx, { verb: 'ready', sprint: id }, `Mark ${id} ready; the plugin lists every DoR gap if a slated spec is not READY`) : null
  }
  if ((m = text.match(/^close (S\d{2,})$/i))) {
    const id = m[1].toUpperCase()
    return sprintKnown(ctx, id) ? { intent: { kind: 'close', sprint: id }, title: `Close ${id} — open the close screen`, subtitle: 'Closing is a screen: each open spec is carried or dropped with a reason before sprint.py close runs' } : null
  }
  if (/^new sprint$/i.test(text)) {
    return { intent: { kind: 'new-sprint' }, title: 'New sprint', subtitle: 'sprint.py new — id, goal, start, length and target, recorded against you', disabledReason: capabilityGap(ctx, VERB_CAPABILITY.new) }
  }
  return null
}

export const INTENT_ENTRY_ID = 'verb:intent'

/** The palette row for the typed words: zero or one entry in the `verbs` group. `run()` hands
 * the intent to the host, which opens the dialog — nothing is spawned here or there before
 * Confirm. A prefix query (`>` `#` `/` `@`) never parses as a verb. */
export function intentEntries(query: string, ctx: IntentContext, onIntent: (match: IntentMatch) => void): PaletteEntry[] {
  if (/^[>#/@]/.test(query.trimStart())) return []
  const match = parseIntent(query, ctx)
  if (!match) return []
  return [{
    id: INTENT_ENTRY_ID,
    group: 'verbs',
    title: match.title,
    subtitle: match.disabledReason ? `${match.subtitle} — ${match.disabledReason}` : match.subtitle,
    keywords: [],
    run: () => onIntent(match),
  }]
}

/** The ids the parser accepts, exported so a test can assert the vocabulary is the plugin's. */
export const INTENT_ID_SHAPES = { spec: SPEC_ID, sprint: SPRINT_ID, decision: DL_ID } as const
