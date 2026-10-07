// The words and shapes behind the Issues view, kept pure so a test reads them without a DOM. The
// plugin owns the lifecycle (`issue_model.py`): `show --json` says which actions a report allows and
// the sentence for each it refuses, and this module only routes those facts to buttons — a disabled
// action's reason is the plugin's own, a capability a newer plugin brings, or `reasons.NO_ACTOR`.
import type { ChipTone } from '../../ui/contract'
import type { IssueDetail, IssueRow, IssueVerbRequest } from '../../../shared/types'
import { buildIssueVerbArgv, describeIssueArgv, ISSUE_VERB_CAPABILITY } from '../../../shared/issueArgv'
import { NO_ACTOR, newerPlugin } from '../../../shared/reasons'

/** The dialogs the view opens — each one `report_issue.py` verb (set-status split by target status). */
export type IssueActionKind = 'triage' | 'prioritize' | 'promote' | 'note' | 'reopen' | 'fixed' | 'wont-fix' | 'duplicate' | 'file'

export const ACTION_LABEL: Readonly<Record<IssueActionKind, string>> = {
  triage: 'Triage…', prioritize: 'Prioritize…', promote: 'Promote to a bugfix spec…', note: 'Add a note…', reopen: 'Reopen…',
  fixed: 'Mark fixed…', 'wont-fix': "Won't fix…", duplicate: 'Duplicate…', file: 'File on the code host…',
}

/** The order the buttons sit in: the next step first, then the side doors, then closing. */
export const ACTION_ORDER: readonly IssueActionKind[] = ['triage', 'prioritize', 'promote', 'file', 'note', 'fixed', 'wont-fix', 'duplicate', 'reopen']

/** `show --json`'s `actions` key for a dialog kind. */
export function actionKey(kind: IssueActionKind): string {
  return kind
}

/** The one reason an action's button is disabled, or null: no actor → `NO_ACTOR`; the plugin lacks
 * the verb → `newerPlugin`; the lifecycle refuses it → the plugin's own sentence from `show`. */
export function actionReason(kind: IssueActionKind, detail: IssueDetail | null, actor: string | null, capabilities: readonly string[] | null): string | null {
  if (!actor) return NO_ACTOR
  const verb = verbFor(kind)
  const cap = ISSUE_VERB_CAPABILITY[verb]
  if (capabilities && !capabilities.includes(cap)) return newerPlugin(cap)
  if (!detail) return 'select a report to see it in full'
  const allowed = detail.actions[actionKey(kind)]
  if (!allowed) return null
  return allowed.ok ? null : (allowed.reason ?? 'the lifecycle refuses this here')
}

export function verbFor(kind: IssueActionKind): IssueVerbRequest['verb'] {
  switch (kind) {
    case 'fixed': case 'wont-fix': case 'duplicate': return 'set-status'
    default: return kind
  }
}

/** The dialog's form state — every kind reads the fields it needs; the rest stay empty. */
export interface ActionForm {
  verdict: 'confirmed' | 'needs-info' | 'duplicate' | 'wont-fix'
  severity: string
  dataImpact: string
  question: string
  of: string
  reason: string
  override: boolean
  priority: 'P1' | 'P2' | 'P3' | ''
  targetSprint: string
  risk: 'HIGH' | 'MEDIUM' | 'LOW' | ''
  owner: string
  team: string
  slate: boolean
  note: string
  label: string
  dryRun: boolean
}

export const EMPTY_FORM: ActionForm = {
  verdict: 'confirmed', severity: '', dataImpact: '', question: '', of: '', reason: '', override: false,
  priority: '', targetSprint: '', risk: '', owner: '', team: '', slate: false, note: '', label: '', dryRun: true,
}

/** The form a dialog opens with: the plugin's proposals pre-selected (a proposal, marked as one), the
 * target sprint the report already carries, the current severity and data impact for triage. */
export function initialForm(kind: IssueActionKind, detail: IssueDetail): ActionForm {
  return {
    ...EMPTY_FORM,
    severity: detail.severity, dataImpact: detail.data_impact,
    priority: (detail.priority as ActionForm['priority']) || (detail.proposed_priority as ActionForm['priority']) || '',
    targetSprint: detail.target_sprint ?? '',
    risk: (detail.proposed_risk as ActionForm['risk']) || '',
    slate: kind === 'promote' && Boolean(detail.target_sprint),
  }
}

/** The request the form becomes — one `report_issue.py` line's worth of fields, nothing invented. */
export function requestFor(kind: IssueActionKind, issue: string, f: ActionForm): IssueVerbRequest {
  switch (kind) {
    case 'triage': {
      const base = { verb: 'triage' as const, issue, verdict: f.verdict, ...(f.reason.trim() ? { reason: f.reason.trim() } : {}), ...(f.override ? { override: true } : {}) }
      if (f.verdict === 'confirmed') return { ...base, ...(f.severity ? { severity: f.severity } : {}), ...(f.dataImpact ? { dataImpact: f.dataImpact } : {}) }
      if (f.verdict === 'needs-info') return { ...base, question: f.question.trim() }
      if (f.verdict === 'duplicate') return { ...base, of: f.of.trim().toUpperCase() }
      return base
    }
    case 'prioritize':
      return { verb: 'prioritize', issue, priority: (f.priority || 'P3') as 'P1' | 'P2' | 'P3', ...(f.targetSprint ? { targetSprint: f.targetSprint } : {}), ...(f.reason.trim() ? { reason: f.reason.trim() } : {}) }
    case 'promote':
      return { verb: 'promote', issue, risk: (f.risk || 'MEDIUM') as 'HIGH' | 'MEDIUM' | 'LOW', ...(f.owner.trim() ? { owner: f.owner.trim() } : {}), ...(f.team.trim() ? { team: f.team.trim() } : {}), ...(f.slate ? { slate: true } : {}) }
    case 'note': return { verb: 'note', issue, note: f.note.trim() }
    case 'reopen': return { verb: 'reopen', issue, reason: f.reason.trim() }
    case 'fixed': return { verb: 'set-status', issue, status: 'fixed', ...(f.reason.trim() ? { reason: f.reason.trim() } : {}) }
    case 'wont-fix': return { verb: 'set-status', issue, status: 'wont-fix', reason: f.reason.trim() }
    case 'duplicate': return { verb: 'set-status', issue, status: 'duplicate', of: f.of.trim().toUpperCase(), ...(f.reason.trim() ? { reason: f.reason.trim() } : {}) }
    case 'file': return { verb: 'file', issue, dryRun: f.dryRun, ...(f.label.trim() ? { label: f.label.trim() } : {}) }
  }
}

/** The preview line: the golden argv, or the table's refusal as words. */
export function previewVerb(req: IssueVerbRequest, actor: string | null): { line: string; errors: string[] } {
  const built = buildIssueVerbArgv(req, actor ?? '<you>')
  return built.ok ? { line: describeIssueArgv(built.argv), errors: [] } : { line: describeIssueArgv([req.verb, '…']), errors: built.errors }
}

/** The dialog's title, in the verb's own words. */
export function actionTitle(kind: IssueActionKind, issue: string): string {
  switch (kind) {
    case 'triage': return `Review ${issue}`
    case 'prioritize': return `Prioritize ${issue}`
    case 'promote': return `Promote ${issue} to a bugfix spec`
    case 'note': return `Add a note to ${issue}`
    case 'reopen': return `Reopen ${issue}`
    case 'fixed': return `Mark ${issue} fixed`
    case 'wont-fix': return `Close ${issue} as won't fix`
    case 'duplicate': return `Close ${issue} as a duplicate`
    case 'file': return `File ${issue} on the code host`
  }
}

// --- chips ----------------------------------------------------------------------------------------

export function statusTone(status: string): ChipTone {
  switch (status) {
    case 'new': case 'needs-info': return 'warn'
    case 'triaged': case 'prioritized': return 'accent'
    case 'promoted': return 'current'
    case 'fixed': return 'ok'
    default: return 'neutral'
  }
}

export function severityTone(severity: string): ChipTone {
  return severity === 'blocks' ? 'error' : severity === 'degraded' ? 'warn' : 'neutral'
}

export function dataImpactTone(impact: string): ChipTone {
  return impact === 'exposed' || impact === 'wrong-written' ? 'error' : impact === 'wrong-shown' ? 'warn' : 'neutral'
}

/** The reports awaiting a decision first, as the plugin ordered them; a filter keeps the order. */
export function visibleRows(rows: readonly IssueRow[], filter: 'queue' | 'open' | 'all'): IssueRow[] {
  if (filter === 'queue') return rows.filter((r) => r.status === 'new' || r.status === 'needs-info')
  if (filter === 'open') return rows.filter((r) => !['fixed', 'wont-fix', 'duplicate'].includes(r.status))
  return [...rows]
}

/** "3 awaiting review · 2 prioritized · 1 fixed" — counts of reports by status, zeros left out. */
export function countsLine(counts: Record<string, number>, labels: Record<string, string> = {}): string {
  const parts = Object.entries(counts).filter(([, n]) => n > 0).map(([s, n]) => `${n} ${(labels[s] ?? s).split(' — ')[0].toLowerCase()}`)
  return parts.join(' · ')
}
