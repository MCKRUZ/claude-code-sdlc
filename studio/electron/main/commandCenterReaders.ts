// Shape-checking readers for the command center's blocks (togo-command-center.md §2.2–§2.3).
// Each takes the one JSON document a plugin script printed and answers the typed view or `null`
// — null for ANY document that is not the one that script prints (another script's output, a
// bare `{ok:true}`, an array, prose). A reader never fills a gap with a zero: a key the plugin
// reports as null stays null, and a missing top-level key makes the whole read null, so the
// block renders "no data" rather than a shape Studio invented. Keys are camel-cased, nothing
// else is reshaped, and unknown keys on ledger lines ride along verbatim (`SprintLogEvent`).

import type {
  ChannelCheckView, DecisionRow, DecisionsView, FindingRow, FindingsView, HandOffCheck, ProjectSettings, Scorecard,
  SlateProposal, SpecLadder, SpecReadinessFull, SprintListEntry, SprintListView, SprintLogEvent, SprintLogView,
  SprintMixTier, SprintSlateRow,
} from '../../shared/types'
import type { RefusalKind } from '../../shared/types'

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const int = (v: unknown): number | null => (Number.isInteger(v) ? (v as number) : null)
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
function list<T>(raw: unknown, read: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(raw)) return null
  const out = raw.map(read)
  return out.some((x) => x === null) ? null : (out as T[])
}

/** `JSON.parse` of a script's stdout as exactly one object, or null. */
export function parseDocument(stdout: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(stdout)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

// --- sprint.py list --json ---------------------------------------------------------------------

export function readSprintList(raw: unknown): SprintListView | null {
  if (!isRecord(raw) || !Array.isArray(raw.sprints) || !('active' in raw)) return null
  const count = int(raw.count)
  if (count === null) return null
  const sprints = list<SprintListEntry>(raw.sprints, (s) => {
    if (!isRecord(s) || typeof s.id !== 'string') return null
    const ordinal = int(s.ordinal)
    if (ordinal === null) return null
    return { id: s.id, state: strOrNull(s.state), goal: str(s.goal), start: str(s.start), end: str(s.end), ordinal }
  })
  if (sprints === null) return null
  return { sprints, active: strOrNull(raw.active), count }
}

// --- sprint.py log --json ----------------------------------------------------------------------

export function readSprintLog(raw: unknown): SprintLogView | null {
  if (!isRecord(raw) || !Array.isArray(raw.events) || typeof raw.exists !== 'boolean') return null
  const count = int(raw.count), skipped = int(raw.skipped)
  if (count === null || skipped === null) return null
  if (!raw.events.every(isRecord)) return null
  // Verbatim: the ledger line is the record, so nothing is dropped or renamed here.
  return { events: raw.events as SprintLogEvent[], count, since: strOrNull(raw.since), path: str(raw.path), exists: raw.exists, skipped }
}

// --- record_findings.py report --json --------------------------------------------------------

function readFindingRow(raw: unknown): FindingRow | null {
  if (!isRecord(raw) || typeof raw.fingerprint !== 'string') return null
  const rounds = int(raw.rounds)
  if (rounds === null) return null
  const { fingerprint, id, category, severity, target, disposition, detail, off_books, first_seen, last_seen, rounds: _r, ...rest } = raw
  return {
    ...rest, fingerprint, id: str(id), category: str(category), severity: str(severity), target: str(target),
    disposition: str(disposition), detail: str(detail), offBooks: off_books === true,
    firstSeen: strOrNull(first_seen), lastSeen: strOrNull(last_seen), rounds,
  }
}

/** The three legacy counts are required (they are what every plugin prints); `findings[]` and
 * `recurrence{}` arrive with `findings-json` and are read when present. Their absence is NOT
 * "no findings" — the caller checks the capability before saying anything about rows. */
export function readFindings(raw: unknown): FindingsView | null {
  if (!isRecord(raw)) return null
  const tracked = int(raw.tracked), openDebt = int(raw.open_debt), mismatches = int(raw.fixed_claim_mismatches)
  if (tracked === null || openDebt === null || mismatches === null) return null
  const findings = raw.findings === undefined ? [] : list(raw.findings, readFindingRow)
  if (findings === null) return null
  const recurrence: Record<string, number> = {}
  if (raw.recurrence !== undefined) {
    if (!isRecord(raw.recurrence)) return null
    for (const [k, v] of Object.entries(raw.recurrence)) { const n = int(v); if (n === null) return null; recurrence[k] = n }
  }
  const view: FindingsView = { tracked, openDebt, fixedClaimMismatches: mismatches, findings, recurrence }
  if (isRecord(raw.attribution)) {
    const attributed = int(raw.attribution.attributed), unattributed = int(raw.attribution.unattributed)
    if (attributed !== null && unattributed !== null) view.attribution = { method: 'scope-paths', attributed, unattributed }
  }
  return view
}

// --- track_decisions.py --json -----------------------------------------------------------------

function readDecisionRow(raw: unknown): DecisionRow | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null
  return {
    id: raw.id, decision: str(raw.decision), owner: str(raw.owner), opened: str(raw.opened), due: str(raw.due),
    status: str(raw.status), businessDaysOpen: finite(raw.business_days_open), clockDue: strOrNull(raw.clock_due),
    overdue: raw.overdue === true,
  }
}

export function readDecisions(raw: unknown): DecisionsView | null {
  if (!isRecord(raw) || typeof raw.exists !== 'boolean') return null
  const total = int(raw.total), open = int(raw.open), overdue = int(raw.overdue), clock = int(raw.clock_business_days)
  if (total === null || open === null || overdue === null || clock === null) return null
  const openDecisions = list(raw.open_decisions, readDecisionRow), overdueDecisions = list(raw.overdue_decisions, readDecisionRow)
  if (openDecisions === null || overdueDecisions === null) return null
  return { total, open, overdue, clockBusinessDays: clock, openDecisions, overdueDecisions, logPath: str(raw.log_path), exists: raw.exists }
}

// --- scorecard.py report --json ----------------------------------------------------------------

/** The scorecard is passed through as the plugin computed it; only its identity is checked (the
 * rate keys must be present — null or number — and `dora` must be an object). */
export function readScorecard(raw: unknown): Scorecard | null {
  if (!isRecord(raw) || !isRecord(raw.dora)) return null
  for (const key of ['accepted_as_is_rate', 'review_wait_median_hours', 'rework_revert_rate', 'bounce_back_rate']) {
    if (!(key in raw) || (raw[key] !== null && finite(raw[key]) === null)) return null
  }
  return raw as unknown as Scorecard
}

// --- project_settings.py --json → roster -------------------------------------------------------

export function readRoster(raw: unknown): ProjectSettings['roster'] | null {
  if (!isRecord(raw) || !isRecord(raw.roster)) return null
  const r = raw.roster
  if (typeof r.present !== 'boolean' || !Array.isArray(r.people) || !Array.isArray(r.teams)) return null
  return r as unknown as ProjectSettings['roster']
}

// --- sprint.py slate --sprint SNN --json (the proposal) ----------------------------------------

function readProposalRow(raw: unknown): SprintSlateRow | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null
  return {
    id: raw.id, name: str(raw.name), risk: str(raw.risk), type: str(raw.type), channel: str(raw.channel), status: str(raw.status),
    sprint: str(raw.sprint), nextOwner: str(raw.next_owner), engReview: str(raw.eng_review), dataReview: str(raw.data_review),
    dependsOn: strings(raw.depends_on), dor: raw.dor === 'READY' ? 'READY' : 'NOT READY', dorBlocking: strings(raw.dor_blocking),
    path: str(raw.path), relPath: str(raw.rel_path),
  }
}

export function readSlateProposal(raw: unknown): SlateProposal | null {
  if (!isRecord(raw) || !('sprint' in raw) || !Array.isArray(raw.proposal) || !isRecord(raw.mix_after)) return null
  const candidates = int(raw.candidates)
  if (candidates === null) return null
  const proposal = list(raw.proposal, readProposalRow)
  if (proposal === null) return null
  const mixAfter: Record<string, SprintMixTier> = {}
  for (const [tier, v] of Object.entries(raw.mix_after)) {
    if (!isRecord(v)) return null
    const actual = finite(v.actual)
    if (actual === null) return null
    mixAfter[tier] = { target: finite(v.target), actual }
  }
  return {
    sprint: strOrNull(raw.sprint), target: finite(raw.target), mix: str(raw.mix), alreadySlated: strings(raw.already_slated),
    candidates, proposal, mixAfter, mixWarnings: strings(raw.mix_warnings), dependencyWarnings: strings(raw.dependency_warnings),
    hasData: raw.has_data !== false, note: strOrNull(raw.note),
  }
}

// --- spec_readiness.py --json (with ladder) and --all ------------------------------------------

export function readLadder(raw: unknown): SpecLadder | null {
  if (!isRecord(raw) || typeof raw.tier !== 'string' || !Array.isArray(raw.rungs)) return null
  const rungs = raw.rungs.filter((r): r is string => typeof r === 'string')
  if (rungs.length !== raw.rungs.length) return null
  return { tier: raw.tier, touchesGatedPath: bool(raw.touches_gated_path), rungs }
}

export function readReadiness(raw: unknown): SpecReadinessFull | null {
  if (!isRecord(raw) || typeof raw.ok !== 'boolean' || typeof raw.ready !== 'boolean') return null
  if (!Array.isArray(raw.blocking) || !Array.isArray(raw.advisory) || !Array.isArray(raw.passed)) return null
  const { ladder, ...rest } = raw
  const view = { ...rest, spec: str(raw.spec), risk: str(raw.risk), status: str(raw.status) } as unknown as SpecReadinessFull
  if (ladder !== undefined) {
    const read = readLadder(ladder)
    if (read === null) return null
    view.ladder = read
  }
  return view
}

export function readReadinessAll(raw: unknown): { ok: boolean; specs: SpecReadinessFull[] } | null {
  if (!isRecord(raw) || typeof raw.ok !== 'boolean') return null
  const specs = list(raw.specs, readReadiness)
  return specs === null ? null : { ok: raw.ok, specs }
}

// --- check_channel.py --json -------------------------------------------------------------------

export function readChannelCheck(raw: unknown): ChannelCheckView | null {
  if (!isRecord(raw) || typeof raw.bound !== 'boolean' || !Array.isArray(raw.dimensions)) return null
  const dimensions = list(raw.dimensions, (d) => (isRecord(d) && typeof d.id === 'string' && typeof d.covered === 'boolean' ? { id: d.id, covered: d.covered } : null))
  if (dimensions === null) return null
  return {
    spec: str(raw.spec), channel: strOrNull(raw.channel), bound: raw.bound, source: str(raw.source), dimensions,
    uncovered: strings(raw.uncovered), advisory: raw.advisory !== false, notes: strings(raw.notes),
  }
}

// --- handoff.py --check --json -----------------------------------------------------------------

const REFUSAL_KINDS: RefusalKind[] = ['not_ready', 'unknown_developer', 'developer_is_checker', 'team_at_limit', 'other']

/** The top-level `host` block every host-touching `--json` carries (`{name, source, cli, …}`),
 * or the bare name an older shape printed; null when neither. */
function hostName(raw: unknown): string | null {
  if (typeof raw === 'string' && raw !== '') return raw
  return isRecord(raw) && typeof raw.name === 'string' ? raw.name : null
}

export function readHandOffCheck(raw: unknown): HandOffCheck | null {
  if (!isRecord(raw) || typeof raw.ok !== 'boolean') return null
  const host = hostName(raw.host)
  if (!raw.ok) {
    if (!isRecord(raw.refusal) || typeof raw.refusal.message !== 'string') return null
    const kind = REFUSAL_KINDS.includes(raw.refusal.kind as RefusalKind) ? (raw.refusal.kind as RefusalKind) : 'other'
    return { ok: false, refusal: { kind, message: raw.refusal.message }, ...(host !== null ? { host } : {}) }
  }
  if (!isRecord(raw.would) || typeof raw.would.branch !== 'string') return null
  const w = raw.would
  return {
    ok: true, alreadyInFlight: raw.already_in_flight === true, host: host ?? '',
    would: { branch: w.branch as string, developer: str(w.developer), checker: strOrNull(w.checker), team: strOrNull(w.team), inFlightAfter: int(w.in_flight_after) },
  }
}
