// The checking ladder joined to the code host (togo-command-center.md §3.3 `Ladder.tsx`). Pure.
// The rungs are the plugin's strings from `risk_model.required_rungs()` (via `spec_readiness.py
// --json` `ladder.rungs[]`); each is joined by a FIXED table to one host field of the spec's
// `pull_request`. Colour comes only from the host's own conclusion word — no rung is green
// without one; the correctness rung is always "no data"; the failing rung carries the plugin's
// `waiting_on` sentence as its reason. Nothing here computes a status: every state below names
// the host field it read and, where it can, the host's own word for it.
import type { RosterPerson, SpecStatus } from './types'
import { samePerson } from './identity'
import { GATED_PATH_NOT_DECLARED, NO_DATA } from './reasons'

export type RungKind = 'ci' | 'grader' | 'correctness' | 'security' | 'approval' | 'signoff' | 'unknown'

/** `pass` / `fail` / `pending` only from a host word; `none` is the hollow ring beside "no data". */
export type RungState = 'pass' | 'fail' | 'pending' | 'none'

export interface LadderRow {
  /** The plugin's rung string, verbatim. */
  rung: string
  kind: RungKind
  state: RungState
  /** Which host field decided the state — the provenance line. */
  field: string
  /** The host's own word(s): a conclusion, a failing check's name, an approver. `NO_DATA` for `none`. */
  detail: string
  /** The plugin's `waiting_on` on the failing rung; null elsewhere. */
  reason: string | null
}

/** Prefix → kind. The prefixes are the fixed words `required_rungs()` writes. */
const KIND_BY_PREFIX: ReadonlyArray<[RegExp, RungKind]> = [
  [/^CI\b/, 'ci'],
  [/^grader\b/, 'grader'],
  [/^correctness\b/, 'correctness'],
  [/^security pass\b/, 'security'],
  [/^non-author approval\b/, 'approval'],
  [/^named human sign-off\b/, 'signoff'],
]

export function rungKind(rung: string): RungKind {
  const hit = KIND_BY_PREFIX.find(([re]) => re.test(rung.trim()))
  return hit ? hit[1] : 'unknown'
}

/** The host words that mean success / failure. Anything else non-null is in progress. */
const SUCCESS = new Set(['success', 'succeeded', 'passed', 'approved'])
const FAILURE = new Set(['failure', 'failed', 'error', 'cancelled', 'canceled', 'timed_out', 'action_required', 'rejected'])

function stateOfWord(word: string | null | undefined): RungState {
  if (word === null || word === undefined || word === '') return 'none'
  const w = word.toLowerCase()
  if (SUCCESS.has(w)) return 'pass'
  if (FAILURE.has(w)) return 'fail'
  return 'pending'
}

type PullRequest = NonNullable<SpecStatus['pull_request']>

function joinCi(pr: PullRequest | null): Pick<LadderRow, 'state' | 'detail'> {
  if (!pr || pr.checks.length === 0) return { state: 'none', detail: NO_DATA }
  const failing = pr.checks.find((c) => stateOfWord(c.conclusion) === 'fail')
  if (failing) return { state: 'fail', detail: `failing: ${failing.name}` }
  const pending = pr.checks.find((c) => stateOfWord(c.conclusion) !== 'pass')
  if (pending) return { state: 'pending', detail: `${pending.name}: ${pending.status ?? pending.conclusion ?? 'in progress'}` }
  return { state: 'pass', detail: `${pr.checks.length} check${pr.checks.length === 1 ? '' : 's'} passed` }
}

function joinGrader(pr: PullRequest | null): Pick<LadderRow, 'state' | 'detail'> {
  if (!pr || !pr.grader_ran) return { state: 'none', detail: NO_DATA }
  if (pr.verdicts === null) return { state: 'pending', detail: pr.verdict_error ?? 'ran — verdicts not readable' }
  return { state: 'pass', detail: `ran — ${pr.verdicts.length} verdict${pr.verdicts.length === 1 ? '' : 's'}` }
}

function joinSecurity(pr: PullRequest | null): Pick<LadderRow, 'state' | 'detail'> {
  const conclusion = pr?.security_review?.conclusion ?? null
  const state = stateOfWord(conclusion)
  return { state, detail: state === 'none' ? NO_DATA : conclusion! }
}

function approvers(pr: PullRequest | null): string[] {
  return (pr?.approvals ?? []).map((a) => a.by).filter((by): by is string => !!by && by.trim() !== '')
}

function joinApproval(pr: PullRequest | null): Pick<LadderRow, 'state' | 'detail'> {
  if (!pr) return { state: 'none', detail: NO_DATA }
  const by = approvers(pr)
  if (by.length === 0) return { state: 'pending', detail: 'no approval yet' }
  return { state: 'pass', detail: `approved by ${by.join(', ')}` }
}

function joinSignoff(pr: PullRequest | null, roster: readonly RosterPerson[] | null | undefined): Pick<LadderRow, 'state' | 'detail'> {
  if (!pr) return { state: 'none', detail: NO_DATA }
  if (!roster || roster.length === 0) return { state: 'none', detail: 'no roster — who holds the security role is not recorded' }
  const security = roster.filter((p) => (p.roles ?? []).includes('security'))
  if (security.length === 0) return { state: 'none', detail: 'no roster person holds the security role' }
  const signers = approvers(pr).filter((by) => security.some((p) => samePerson(p.handle, by) || samePerson(p.email, by)))
  if (signers.length === 0) return { state: 'pending', detail: 'no approval from a security-role person yet' }
  return { state: 'pass', detail: `signed by ${signers.join(', ')}` }
}

/** The fixed join. `rungs` verbatim from the plugin; `status` the spec's `spec_status.py` read
 * (null when it could not be read); `roster` the project's people for the named sign-off. */
export function joinLadder(
  rungs: readonly string[],
  status: Pick<SpecStatus, 'pull_request'> | null | undefined,
  roster?: readonly RosterPerson[] | null,
): LadderRow[] {
  const pr = status?.pull_request ?? null
  const rows = rungs.map((rung): LadderRow => {
    const kind = rungKind(rung)
    const base = { rung, kind, reason: null as string | null }
    switch (kind) {
      case 'ci': return { ...base, field: 'pull_request.checks[]', ...joinCi(pr) }
      case 'grader': return { ...base, field: 'pull_request.grader_ran / verdicts', ...joinGrader(pr) }
      case 'correctness': return { ...base, field: 'none — no host field reports correctness', state: 'none', detail: NO_DATA }
      case 'security': return { ...base, field: 'pull_request.security_review.conclusion', ...joinSecurity(pr) }
      case 'approval': return { ...base, field: 'pull_request.approvals[]', ...joinApproval(pr) }
      case 'signoff': return { ...base, field: 'pull_request.approvals[] × roster security role', ...joinSignoff(pr, roster) }
      case 'unknown': return { ...base, field: 'none — rung not in the join table', state: 'none', detail: NO_DATA }
    }
  })
  // The failing rung carries the plugin's own sentence as its reason — the first one only.
  const failing = rows.find((r) => r.state === 'fail')
  if (failing && pr?.waiting_on) failing.reason = pr.waiting_on
  return rows
}

/** "gated path: declared" / "gated path: not declared" — only the frontmatter can declare it. */
export function gatedPathLabel(touchesGatedPath: boolean | null | undefined): string {
  return touchesGatedPath === true ? 'gated path: declared' : GATED_PATH_NOT_DECLARED
}
