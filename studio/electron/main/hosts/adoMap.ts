// Azure DevOps JSON → the gh-shaped entries Studio already reads: the TypeScript port of
// scripts/ado_map.py, parity-tested on the SAME captured fixtures
// (scripts/tests/fixtures/code_host/azure_devops/captured/*.json).
//
// Every function here is PURE — an az document in, a normalised object out. That is what lets
// the translation be tested on fixture JSON, and it is also where the honesty lives: an unknown
// enum maps to the CONSERVATIVE reading with a note (a policy status nobody has seen reads as
// "completed, no conclusion" — pending-ish, never green); a key the mapping NEEDS throws
// AdoShapeError instead of defaulting, because a default is how "nothing here" gets fabricated
// from a field rename.
//
// What the capture settled, each a fact from the data: `isRequired` is null (never false) when a
// reviewer is not required; `lastMergeCommit` sits on every ACTIVE PR as the trial merge, so it is
// trusted only once `status == completed`; `labels` ride `pr list` by default (null when none).

export class AdoShapeError extends Error {
  constructor(what: string) {
    super(`unexpected az shape: missing ${what}`)
    this.name = 'AdoShapeError'
  }
}

type Dict = Record<string, unknown>
const isDict = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v)

function require<T = unknown>(obj: unknown, key: string, what: string): T {
  if (!isDict(obj) || !(key in obj)) throw new AdoShapeError(`${what}.${key}`)
  return obj[key] as T
}

// Policy type ids. Build validation, minimum-reviewers and required-reviewers were observed in
// the capture; the status-check id is from the extension's source only (no org exercised it).
export const BUILD_POLICY_TYPE = '0609b952-1397-4640-95ec-e00a01b2c241'
export const STATUS_POLICY_TYPE = 'cbdc66da-9728-4af8-aada-9a5a32e4a226' // unverified
export const CHECK_POLICY_TYPES: readonly string[] = [BUILD_POLICY_TYPE, STATUS_POLICY_TYPE]

export const PR_STATE: Record<string, 'OPEN' | 'MERGED' | 'CLOSED'> = { active: 'OPEN', completed: 'MERGED', abandoned: 'CLOSED' }
// PolicyEvaluationRecord.status → gh (status, conclusion). `approved` and `queued` were observed;
// the rest are the documented values and stay conservative until seen.
export const POLICY_STATUS: Record<string, [string, string | null]> = {
  queued: ['IN_PROGRESS', null], running: ['IN_PROGRESS', null],
  approved: ['COMPLETED', 'SUCCESS'], notApplicable: ['COMPLETED', 'SUCCESS'],
  rejected: ['COMPLETED', 'FAILURE'], broken: ['COMPLETED', 'FAILURE'],
}
const APPROVE_VOTE = 5   // approve-with-suggestions counts
const REJECT_VOTE = -5   // wait-for-author counts against

export function stripRef(ref: unknown): string {
  if (typeof ref !== 'string') return ''
  if (ref.startsWith('refs/heads/')) return ref.slice('refs/heads/'.length)
  if (ref.startsWith('refs/pull/')) return ref.slice('refs/'.length)
  return ref
}

export interface Review { state: 'APPROVED' | 'CHANGES_REQUESTED'; author: { login: string }; submittedAt: null }
export interface ReviewRequest { login: string }
export interface Check { name: string; status: string; conclusion: string | null; blocking: boolean | null; _note?: string }

function uniqueName(ident: unknown): string {
  return isDict(ident) && typeof ident.uniqueName === 'string' ? ident.uniqueName : ''
}

/** (reviews, reviewRequests, reviewDecision) from `reviewers[].vote`. Groups (`isContainer`)
 * are skipped; the author's own vote is skipped because it is not a NON-author approval;
 * required reviewers (`isRequired: true` — null means not required) come first among pending. */
export function mapReviews(pr: Dict): { reviews: Review[]; reviewRequests: ReviewRequest[]; reviewDecision: string } {
  const author = uniqueName(pr.createdBy).toLowerCase()
  const reviews: Review[] = []
  const pending: Array<{ required: boolean; login: string }> = []
  for (const r of Array.isArray(pr.reviewers) ? pr.reviewers : []) {
    if (!isDict(r) || r.isContainer) continue
    const login = uniqueName(r)
    if (login.toLowerCase() === author) continue
    const vote = typeof r.vote === 'number' ? r.vote : 0
    if (vote >= APPROVE_VOTE) reviews.push({ state: 'APPROVED', author: { login }, submittedAt: null })
    else if (vote <= REJECT_VOTE) reviews.push({ state: 'CHANGES_REQUESTED', author: { login }, submittedAt: null })
    else pending.push({ required: r.isRequired === true, login })
  }
  const reviewRequests = [...pending.filter((p) => p.required), ...pending.filter((p) => !p.required)].map((p) => ({ login: p.login }))
  const states = new Set(reviews.map((r) => r.state))
  const reviewDecision = states.has('APPROVED') ? 'APPROVED' : states.has('CHANGES_REQUESTED') ? 'CHANGES_REQUESTED' : 'REVIEW_REQUIRED'
  return { reviews, reviewRequests, reviewDecision }
}

/** PolicyEvaluationRecord[] → Check[]. Only build-validation and status-check policies are
 * checks; approver-count and required-reviewer policies are the approval rung, not CI. An empty
 * list is an empty rollup — on an active PR that is "no checks", a legitimate answer. */
export function mapChecks(records: unknown): Check[] {
  const checks: Check[] = []
  for (const rec of Array.isArray(records) ? records : []) {
    const cfg = require<Dict>(rec, 'configuration', 'PolicyEvaluationRecord')
    const typeId = require<string>(require<Dict>(cfg, 'type', 'configuration'), 'id', 'configuration.type')
    if (!CHECK_POLICY_TYPES.includes(typeId)) continue
    const settings = isDict(cfg.settings) ? cfg.settings : {}
    const context = isDict((rec as Dict).context) ? ((rec as Dict).context as Dict) : {}
    const name = (settings.displayName ?? context.buildDefinitionName ?? settings.statusName) as string | undefined
    if (!name) throw new AdoShapeError('configuration.settings.displayName')
    const raw = require<string>(rec, 'status', 'PolicyEvaluationRecord')
    const blocking = typeof cfg.isBlocking === 'boolean' ? cfg.isBlocking : null
    const known = POLICY_STATUS[raw]
    if (known) checks.push({ name, status: known[0], conclusion: known[1], blocking })
    else checks.push({ name, status: 'COMPLETED', conclusion: null, blocking, _note: `policy status ${JSON.stringify(raw)} is not a known value; read as completed with no conclusion` })
  }
  return checks
}

/** The gh-shaped PullRequest Studio's merge poll reads (PrListEntry plus the fields the Python
 * side also carries). `checks` is the already-mapped policy list when the caller fetched one.
 * `files` is null: PR iterations are not fetched in v1, and null is what sends the poll down its
 * existing fail-closed branch (D-OWNER-8) — Studio never completes an Azure DevOps PR itself. */
export interface AdoPullRequest {
  number: number
  headRefName: string
  url: string | null
  state: 'OPEN' | 'MERGED' | 'CLOSED'
  isDraft: boolean
  mergedAt: string | null
  updatedAt: null
  createdAt: string | null
  author: { login: string }
  statusCheckRollup: Check[]
  reviews: Review[]
  reviewRequests: ReviewRequest[]
  labels: Array<{ name: string }>
  mergeCommit: { oid: string } | null
  reviewDecision: string
  headRepositoryOwner: { login: string }
  files: null
  _notes: string[]
}

export function mapPr(pr: Dict, webUrl: string | null, checks: Check[] | null = null): AdoPullRequest {
  const number = require<number>(pr, 'pullRequestId', 'GitPullRequest')
  const rawStatus = require<string>(pr, 'status', 'GitPullRequest')
  const source = require<string>(pr, 'sourceRefName', 'GitPullRequest')
  const createdBy = require<Dict>(pr, 'createdBy', 'GitPullRequest')
  const notes: string[] = []
  let state = PR_STATE[rawStatus]
  if (!state) {
    state = 'OPEN'
    notes.push(`pull request status ${JSON.stringify(rawStatus)} is not a known value; read as OPEN`)
  }
  const merged = state === 'MERGED'
  const { reviews, reviewRequests, reviewDecision } = mapReviews(pr)
  const rollup = checks ? [...checks] : []
  for (const c of rollup) if (c._note) notes.push(c._note)
  // An ACTIVE PR carries lastMergeCommit too (the trial merge) — trusted only once completed.
  const mergeSha = merged && isDict(pr.lastMergeCommit) && typeof pr.lastMergeCommit.commitId === 'string' ? pr.lastMergeCommit.commitId : null
  const repository = isDict(pr.repository) ? pr.repository : {}
  return {
    number, url: webUrl ? `${webUrl}/pullrequest/${number}` : null, state,
    isDraft: pr.isDraft === true, headRefName: stripRef(source),
    mergedAt: merged && typeof pr.closedDate === 'string' ? pr.closedDate : null,
    updatedAt: null, // GitPullRequest has no last-moved field; a stand-in would be a lie
    createdAt: typeof pr.creationDate === 'string' ? pr.creationDate : null,
    author: { login: uniqueName(createdBy) },
    statusCheckRollup: rollup, reviews, reviewRequests,
    labels: (Array.isArray(pr.labels) ? pr.labels : []).filter(isDict).map((lb) => ({ name: String(lb.name ?? '') })),
    mergeCommit: mergeSha ? { oid: mergeSha } : null,
    reviewDecision,
    headRepositoryOwner: { login: typeof repository.id === 'string' ? repository.id : '' },
    files: null, _notes: notes,
  }
}

/** PolicyConfiguration[] (already scoped to one repository + branch by the caller) → is the
 * branch enforcing? True when ANY policy is enabled and blocking — the same rule as Python's
 * map_policies, reduced to the one bit Studio shows. */
export function mapPolicies(configs: unknown): { enforcing: boolean; requiredContexts: string[] } {
  const enabled = (Array.isArray(configs) ? configs : []).filter((c): c is Dict => isDict(c) && c.isEnabled === true)
  const requiredContexts: string[] = []
  for (const c of enabled) {
    const typeId = isDict(c.type) ? c.type.id : undefined
    if (typeof typeId === 'string' && CHECK_POLICY_TYPES.includes(typeId)) {
      const s = isDict(c.settings) ? c.settings : {}
      const ctx = (s.displayName ?? s.statusName) as string | undefined
      if (ctx) requiredContexts.push(ctx)
    }
  }
  return { enforcing: enabled.some((c) => c.isBlocking === true), requiredContexts }
}
