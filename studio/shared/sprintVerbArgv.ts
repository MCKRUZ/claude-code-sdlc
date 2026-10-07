// The closed argv table (togo-command-center.md §2.4): the ONLY way a write reaches `sprint.py`.
// Pure and golden-tested — main validates the request here, appends the resolved actor as
// `--by`, and spawns exactly what `buildSprintVerbArgv` returned; the renderer only ever hands
// over a `SprintVerbRequest`. Ids are checked against the plugin's own rules (sprint `^S\d{2,}$`,
// spec `^\d{4}$`) and, when a board is in hand, against the specs it lists. `--field` has no row
// here and can never be emitted: the forbidden activity metrics (`FORBIDDEN_FIELDS`) are refused
// by the plugin with exit 2, and this table never offers the flag in the first place.
import type { SprintVerb, SprintVerbRequest } from './types'
import { SPRINT_ID } from './sprintModel'

export const SPEC_ID = /^\d{4}$/
export const SCRIPT = 'sprint.py'

/** The flag every write carries; the value comes from `actor.ts`, never from the renderer. */
export const BY_FLAG = '--by'

/** The write verbs this table knows, in the plugin's `WRITE_VERBS` order plus the two additive
 * ones (`carry`, `edit`). Reads (`status`, `list`, `log`, `slate` without `--spec`, `plan`) are
 * not writes and have no row. */
export const WRITE_VERBS: readonly SprintVerb[] = ['new', 'slate', 'unslate', 'handoff', 'ack', 'verdict', 'ready', 'close', 'carry', 'edit']

/** The capability (`capabilities.py`) each verb needs beyond `sprint-status`; null = on 1.6.x. */
export const VERB_CAPABILITY: Readonly<Record<SprintVerb, string | null>> = {
  new: 'sprint-write', slate: 'sprint-write', unslate: 'sprint-write', handoff: 'sprint-write', ack: 'sprint-write',
  verdict: 'sprint-write', ready: 'sprint-write', close: 'sprint-write', carry: 'sprint-carry', edit: 'sprint-edit',
}

export type ArgvResult = { ok: true; argv: string[] } | { ok: false; errors: string[] }

/** Rules the plugin enforces that the dialog mirrors BEFORE spawning — never a judgement, only
 * the shape of the request. The plugin remains the truth on everything else (closed sprint,
 * merged spec, over-target, AI name). */
export function validateSprintVerbRequest(req: SprintVerbRequest, boardSpecIds?: readonly string[]): string[] {
  const errors: string[] = []
  const spec = (id: string, label = 'spec') => {
    if (!SPEC_ID.test(id)) errors.push(`${label} '${id}' is not a spec id (expected four digits)`)
    else if (boardSpecIds && !boardSpecIds.includes(id)) errors.push(`${label} '${id}' is not on the board`)
  }
  const sprint = (id: string, label = 'sprint') => {
    if (!SPRINT_ID.test(id)) errors.push(`${label} '${id}' is not a sprint id (expected S07, S12, ...)`)
  }
  const text = (value: string | undefined, label: string) => {
    if (!value || !value.trim()) errors.push(`${label} is required`)
  }
  switch (req.verb) {
    case 'slate':
      sprint(req.sprint)
      if (req.specs.length === 0) errors.push('at least one spec is required')
      for (const id of req.specs) spec(id)
      if (req.override && !req.reason?.trim()) errors.push('an override needs a reason')
      break
    case 'unslate': spec(req.spec); text(req.reason, 'reason'); break
    case 'handoff': spec(req.spec); text(req.to, 'to'); break
    case 'ack': spec(req.spec); break
    case 'verdict':
      spec(req.spec)
      if (req.lane !== 'eng' && req.lane !== 'data') errors.push(`lane '${String(req.lane)}' is not eng or data`)
      if (!['accepted', 'returned', 'pending', 'n-a'].includes(req.verdict)) errors.push(`verdict '${String(req.verdict)}' is not one the plugin accepts`)
      // The plugin's rule, mirrored so the dialog shows the reason field: n-a is data-lane only and needs a reason.
      if (req.verdict === 'n-a' && req.lane !== 'data') errors.push('n-a is a data-lane verdict only')
      if (req.verdict === 'n-a' && !req.reason?.trim()) errors.push('n-a needs a reason')
      break
    case 'ready': sprint(req.sprint); break
    case 'close':
      sprint(req.sprint)
      if (req.carryTo !== undefined) sprint(req.carryTo, 'carry-to')
      for (const [id, reason] of Object.entries(req.carry)) { spec(id, 'carry'); text(reason, `reason for carrying ${id}`) }
      for (const [id, reason] of Object.entries(req.drop)) { spec(id, 'drop'); text(reason, `reason for dropping ${id}`) }
      if (Object.keys(req.carry).length > 0 && req.carryTo === undefined) errors.push('carrying a spec needs --carry-to')
      break
    case 'new':
      sprint(req.sprint); text(req.goal, 'goal'); text(req.start, 'start')
      if (req.end !== undefined && req.days !== undefined) errors.push('give end or days, not both')
      if (!Number.isInteger(req.target) || req.target < 0) errors.push('target must be a whole number')
      if (req.days !== undefined && (!Number.isInteger(req.days) || req.days <= 0)) errors.push('days must be a positive whole number')
      break
    case 'carry': spec(req.spec); sprint(req.to, 'to'); text(req.reason, 'reason'); break
    case 'edit': sprint(req.sprint); text(req.goal, 'goal'); break
  }
  return errors
}

/** The argv after the interpreter and the script path: `[verb, ...flags, '--by', actor]`.
 * Deterministic flag order per verb, so the console line, the dialog's preview and the golden
 * test all read the same words. Refuses (never throws) on a bad request. */
export function buildSprintVerbArgv(req: SprintVerbRequest, actor: string, boardSpecIds?: readonly string[]): ArgvResult {
  const errors = validateSprintVerbRequest(req, boardSpecIds)
  if (!actor || !actor.trim()) errors.push('no actor')
  if (errors.length > 0) return { ok: false, errors }
  const argv: string[] = [req.verb]
  switch (req.verb) {
    case 'slate':
      argv.push('--sprint', req.sprint)
      for (const id of req.specs) argv.push('--spec', id)
      if (req.override) argv.push('--override', '--reason', req.reason!.trim())
      break
    case 'unslate': argv.push('--spec', req.spec, '--reason', req.reason.trim()); break
    case 'handoff':
      argv.push('--spec', req.spec, '--to', req.to.trim())
      if (req.note?.trim()) argv.push('--note', req.note.trim())
      break
    case 'ack': argv.push('--spec', req.spec); break
    case 'verdict':
      argv.push('--spec', req.spec, '--lane', req.lane, '--verdict', req.verdict)
      if (req.reason?.trim()) argv.push('--reason', req.reason.trim())
      break
    case 'ready': argv.push('--sprint', req.sprint); break
    case 'close':
      argv.push('--sprint', req.sprint)
      if (req.carryTo !== undefined) argv.push('--carry-to', req.carryTo)
      for (const [id, reason] of Object.entries(req.carry)) argv.push('--carry', `${id}=${reason.trim()}`)
      for (const [id, reason] of Object.entries(req.drop)) argv.push('--drop', `${id}=${reason.trim()}`)
      break
    case 'new':
      argv.push('--sprint', req.sprint, '--goal', req.goal.trim(), '--start', req.start.trim())
      if (req.end !== undefined) argv.push('--end', req.end.trim())
      if (req.days !== undefined) argv.push('--days', String(req.days))
      argv.push('--target', String(req.target))
      if (req.mix?.trim()) argv.push('--mix', req.mix.trim())
      if (req.boardRef?.trim()) argv.push('--board-ref', req.boardRef.trim())
      break
    case 'carry': argv.push('--spec', req.spec, '--to', req.to, '--reason', req.reason.trim()); break
    case 'edit': argv.push('--sprint', req.sprint, '--goal', req.goal.trim()); break
  }
  argv.push(BY_FLAG, actor.trim())
  return { ok: true, argv }
}

/** "Run: sprint.py verdict --spec 0002 --lane eng --verdict accepted --by @arjun" — the palette
 * row and the dialog's preview, one spelling. Values with spaces are quoted for reading only. */
export function describeArgv(argv: readonly string[]): string {
  return `Run: ${SCRIPT} ${argv.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`
}

/** The verb of a request, for `SprintVerbResult.verb` and the console. */
export function verbOf(req: SprintVerbRequest): SprintVerb {
  return req.verb
}
