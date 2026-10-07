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
//
// Every match carries `effect`: what the plugin WRITES on Done, from the verbs' own code (five
// frontmatter keys, one ledger line per event) — shown with the argv line before Confirm. Words
// the grammar does not know get `nearestIntents`: the three templates nearest the first word,
// filled only with values the text already names (an id on the board, a known sprint, a roster
// person); the rest stays `NNNN` / `SNN` / `<…>` — never a guess.
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
  /** What the plugin WRITES if it answers Done — its own documented effect (`sprint.py`'s five
   * frontmatter keys and one ledger line per event), never a prediction of what a screen will
   * show. Previewed with the argv line before Confirm. */
  effect: string
  /** Set when the plugin lacks the verb's capability — the row is present, the Confirm disabled. */
  disabledReason?: string
}

type BareMatch = Omit<IntentMatch, 'effect'>

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

function sprintMatch(ctx: IntentContext, request: SprintVerbRequest, subtitle: string, recipient?: Recipient): BareMatch {
  return {
    intent: { kind: 'sprint', request, recipient },
    title: previewSprintVerb(request, ctx.actor),
    subtitle,
    disabledReason: capabilityGap(ctx, VERB_CAPABILITY[request.verb]),
  }
}

function parseIntentBare(raw: string, ctx: IntentContext): BareMatch | null {
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

// --- the effect sentence: what the plugin writes on Done (from the verbs' own code) ------------

/** `sprint.py` writes ONLY five frontmatter keys (`sprint next_owner eng_review data_review
 * depends_on`) and one ledger line per event (`sprint_model.EVENTS`); the other scripts' writes
 * are named in their own `--help`. The sentence is that record, so the person sees the write
 * before the argv runs — never "the card will move", which is the refreshed read's to say. */
export function effectOf(intent: Intent): string {
  switch (intent.kind) {
    case 'sprint': {
      const r = intent.request
      switch (r.verb) {
        case 'verdict': return `writes ${r.lane}_review: ${r.verdict} into spec ${r.spec}'s frontmatter and appends one "verdict" ledger line`
        case 'handoff': return `writes next_owner: ${r.to || '<to>'} into spec ${r.spec}'s frontmatter and appends one "handoff" ledger line`
        case 'ack': return `clears next_owner on spec ${r.spec} and appends one "ack" ledger line`
        case 'slate': return `writes sprint: ${r.sprint} into ${r.specs.length === 1 ? `spec ${r.specs[0]}` : `${r.specs.length} specs`} and appends one "slated" ledger line per spec`
        case 'unslate': return `clears sprint: on spec ${r.spec} and appends one "unslated" ledger line carrying the reason`
        case 'carry': return `rewrites sprint: to ${r.to} on spec ${r.spec}, both ## Slate tables, and appends one "carried" ledger line`
        case 'ready': return `moves ${r.sprint} to ready and writes its planning page (sprint-${r.sprint}-planning.html); one "ready" ledger line`
        case 'close': return `moves ${r.sprint} to closed, fills its ## Close table and writes the review page; one "closed" line plus one "carried" or "dropped" line per open spec`
        case 'new': return `creates .sdlc/sprints/${r.sprint}.md from the template and appends one "sprint_new" ledger line`
        case 'edit': return `replaces ${r.sprint}'s goal in its frontmatter and ## Goal section; one "sprint_edited" ledger line`
      }
      return 'one sprint.py write'
    }
    case 'pull': return intent.slated
      ? `handoff.py creates the branch, commits status/developer into ${intent.path}, pushes, and opens the draft PR`
      : `writes sprint: ${intent.sprint ?? '<sprint>'} into spec ${intent.spec} and appends one "slated" ledger line`
    case 'defer': return `writes status: deferred and deferred_reason into ${intent.path}`
    case 'decide': return `sets ${intent.id} to decided in .sdlc/decision-log.md, recording you and the resolution`
    case 'decision': return 'allocates the next DL-NN in .sdlc/decision-log.md — opened today, due two business days on, owner you'
    case 'confirm-tier': return `writes risk_confirmed_by: <you> into ${intent.path}`
    case 'close': return 'nothing runs — the close screen decides each open spec first'
    case 'new-sprint': return 'creates .sdlc/sprints/<id>.md from the template and appends one "sprint_new" ledger line'
  }
}

export function parseIntent(raw: string, ctx: IntentContext): IntentMatch | null {
  const bare = parseIntentBare(raw, ctx)
  return bare ? { ...bare, effect: effectOf(bare.intent) } : null
}

// --- unknown input: the three nearest intents ---------------------------------------------------

export interface IntentSuggestion {
  /** The phrase to type, with `NNNN` / `SNN` / `<…>` where a value is still needed. */
  phrase: string
  /** The grammar line it stands for. */
  template: string
  /** True when `phrase` already parses — picking it opens the dialog directly. */
  complete: boolean
  hint: string
}

interface Template { words: string[]; template: string; hint: string; fill: (ctx: IntentContext, text: string) => string }
const idIn = (ctx: IntentContext, text: string) => text.match(/\b(\d{4})\b/g)?.find((id) => row(ctx, id) !== null) ?? null
const sprintIn = (ctx: IntentContext, text: string) => text.match(/\bS\d{2,}\b/gi)?.map((s) => s.toUpperCase()).find((s) => sprintKnown(ctx, s)) ?? ctx.activeSprint
const tail = (text: string, after: RegExp) => text.match(after)?.[1]?.trim() ?? ''
const VERDICT_WORD = /\b(accepted|returned|pending|n-a|na|accept|return)\b/i

/** Grammar order. `words` are the verb and its near-synonyms a person is likely to type. */
const TEMPLATES: readonly Template[] = [
  { words: ['pull', 'start', 'take'], template: 'pull NNNN', hint: 'pull a spec into Building (hand-off if slated, slate it first otherwise)', fill: (c, t) => `pull ${idIn(c, t) ?? 'NNNN'}` },
  { words: ['verdict', 'accept', 'accepted', 'return', 'returned', 'review'], template: 'verdict NNNN accepted|returned [eng|data] [because …]', hint: 'record a review verdict on a slated spec', fill: (c, t) => {
    const v = t.match(VERDICT_WORD)?.[1].toLowerCase()
    const verdict = v ? (v === 'accept' ? 'accepted' : v === 'return' ? 'returned' : v) : 'accepted'
    return `verdict ${idIn(c, t) ?? 'NNNN'} ${verdict}${/\bdata\b/i.test(t) ? ' data' : ''}`
  } },
  { words: ['hand', 'handoff', 'give', 'pass'], template: 'hand NNNN to NAME [note …]', hint: 'open a hand-off to a person on the roster', fill: (c, t) => {
    const name = tail(t, /\bto\s+(\S+)/i) || tail(t, /\b(?:\d{4})\s+(\S+)$/)
    const who = name && resolvePerson(c, name).handle ? resolvePerson(c, name).handle : 'NAME'
    return `hand ${idIn(c, t) ?? 'NNNN'} to ${who}`
  } },
  { words: ['ack', 'acknowledge', 'got'], template: 'ack NNNN', hint: 'acknowledge a hand-off addressed to you', fill: (c, t) => `ack ${idIn(c, t) ?? 'NNNN'}` },
  { words: ['defer', 'postpone', 'carry', 'move'], template: 'defer NNNN because … · defer NNNN to SNN because …', hint: 'leave the Build loop with a reason, or carry to a later sprint', fill: (c, t) => `defer ${idIn(c, t) ?? 'NNNN'} because ${tail(t, /because\s+(.+)$/i) || '<reason>'}` },
  { words: ['unslate', 'remove', 'drop'], template: 'unslate NNNN because …', hint: 'take a spec off the slate with the reason recorded', fill: (c, t) => `unslate ${idIn(c, t) ?? 'NNNN'} because ${tail(t, /because\s+(.+)$/i) || '<reason>'}` },
  { words: ['decide', 'decided', 'resolve'], template: 'decide DL-NN …', hint: 'record a decision\'s resolution and stop its clock', fill: (_c, t) => `decide ${t.match(/\bDL-?\d+\b/i)?.[0].toUpperCase().replace(/^DL(\d)/, 'DL-$1') ?? 'DL-NN'} <resolution>` },
  { words: ['decision', 'question', 'open'], template: 'decision …', hint: 'open a decision with you as owner and a 2-business-day clock', fill: () => 'decision <text>' },
  { words: ['confirm', 'tier', 'risk'], template: 'confirm tier NNNN', hint: 'confirm a proposed risk tier as a named person', fill: (c, t) => `confirm tier ${idIn(c, t) ?? 'NNNN'}` },
  { words: ['ready'], template: 'ready SNN', hint: 'mark the sprint ready — the plugin lists every gap otherwise', fill: (c, t) => `ready ${sprintIn(c, t) ?? 'SNN'}` },
  { words: ['close', 'finish', 'end'], template: 'close SNN', hint: 'open the close screen for a sprint', fill: (c, t) => `close ${sprintIn(c, t) ?? 'SNN'}` },
  { words: ['new', 'sprint', 'create'], template: 'new sprint', hint: 'create the next sprint record', fill: () => 'new sprint' },
]

/** Levenshtein distance — small inputs, so the plain table is fine. */
export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]; prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

/** A verb word counts as near when it is within two edits of the typed word, or one is a prefix
 * of the other. Farther than that is not "nearest", it is noise — nothing is offered. */
export const NEAR_EDITS = 2

/** For words that are not a verb the grammar knows: up to three templates whose verb word is
 * nearest the FIRST typed word (a prefix of ≥ 2 letters counts as nearest of all), each filled
 * with whatever the rest of the text already names — an id on the board, a known sprint, a
 * verdict word, a roster person — and `NNNN` / `SNN` / `<…>` where nothing was said. Never a
 * guess at a value; never padded with a verb that is not near. */
export function nearestIntents(raw: string, ctx: IntentContext, limit = 3): IntentSuggestion[] {
  const text = raw.trim().replace(/\s+/g, ' ')
  const first = text.split(' ')[0]?.toLowerCase() ?? ''
  if (first.length < 2) return []
  const scored = TEMPLATES.map((t, order) => {
    const best = Math.min(...t.words.map((w) => (w.startsWith(first) ? 0 : editDistance(first, w) - (first.startsWith(w) ? 0.5 : 0))))
    return { t, order, score: best }
  }).filter((x) => x.score <= NEAR_EDITS).sort((x, y) => x.score - y.score || x.order - y.order)
  return scored.slice(0, limit).map(({ t }) => {
    const phrase = t.fill(ctx, text)
    // A placeholder is a value still to type; the grammar would accept `<reason>` as a reason, so
    // the parse alone is not enough for "complete".
    return { phrase, template: t.template, complete: !PLACEHOLDER.test(phrase) && parseIntentBare(phrase, ctx) !== null, hint: t.hint }
  })
}

/** `NNNN` / `SNN` / `NAME` / `DL-NN` / `<…>` — what a suggestion leaves for the person to type. */
export const PLACEHOLDER = /\bNNNN\b|\bSNN\b|\bNAME\b|\bDL-NN\b|<[^>]+>/

export const INTENT_ENTRY_ID = 'verb:intent'
export const SUGGEST_ENTRY_PREFIX = 'verb:suggest:'

/** The palette rows for the typed words, all in the `verbs` group. A parse → ONE row whose
 * `run()` hands the intent to the host (the dialog opens; nothing is spawned before Confirm) and
 * whose subtitle carries the effect sentence. No parse → up to three nearest intents: a complete
 * one runs as a match; an incomplete one (a value still to type) is offered only when the host
 * passes `onSuggest` to put the phrase into the field — a row that could do nothing is not shown.
 * A prefix query (`>` `#` `/` `@`) never parses as a verb. */
export function intentEntries(
  query: string, ctx: IntentContext, onIntent: (match: IntentMatch) => void, onSuggest?: (phrase: string) => void,
): PaletteEntry[] {
  if (/^[>#/@]/.test(query.trimStart())) return []
  const match = parseIntent(query, ctx)
  if (match) {
    return [{
      id: INTENT_ENTRY_ID,
      group: 'verbs',
      title: match.title,
      subtitle: `${match.disabledReason ? `${match.subtitle} — ${match.disabledReason}` : match.subtitle} · ${match.effect}`,
      keywords: [],
      run: () => onIntent(match),
    }]
  }
  const rows: PaletteEntry[] = []
  for (const [i, s] of nearestIntents(query, ctx).entries()) {
    const full = s.complete ? parseIntent(s.phrase, ctx) : null
    if (!full && !onSuggest) continue
    rows.push({
      id: `${SUGGEST_ENTRY_PREFIX}${i}`,
      group: 'verbs',
      title: s.phrase,
      subtitle: full ? `${full.title} · ${full.effect}` : `${s.template} — ${s.hint}`,
      keywords: [],
      run: () => (full ? onIntent(full) : onSuggest!(s.phrase)),
    })
  }
  return rows
}

/** The ids the parser accepts, exported so a test can assert the vocabulary is the plugin's. */
export const INTENT_ID_SHAPES = { spec: SPEC_ID, sprint: SPRINT_ID, decision: DL_ID } as const
