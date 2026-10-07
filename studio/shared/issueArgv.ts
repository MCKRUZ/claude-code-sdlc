// The closed argv table for `report_issue.py` — the ONLY way the Issues view's and the Report
// dialog's words reach the plugin (the sibling of `sprintVerbArgv.ts`, same contract). Pure and
// golden-tested: main validates the request here, appends the resolved actor as `--by`, and spawns
// exactly what the builders return; the renderer only ever hands over a request object. The checks
// here are about SHAPE — a field present, an id well-formed, one screenshot, the privacy
// confirmation given — never the plugin's judgement: lengths, the channel follow-ups, image bytes,
// secret-shaped strings and the lifecycle are the plugin's to refuse, and its words come back
// verbatim.
import type { IssueReportRequest, IssueVerbRequest } from './types'

export const ISSUE_SCRIPT = 'report_issue.py'
export const ISSUE_BY_FLAG = '--by'
export const SPEC_ID = /^\d{4}$/
export const ISSUE_ID = /^ISS-\d{4}$/
export const SPRINT_ID = /^S\d{2,}$/
/** `issue_model.py`'s vocabularies, mirrored so a request with a made-up value never spawns. */
export const CHANNELS = ['web', 'api', 'voice', 'chat', 'data', 'mobile', 'other'] as const
export const ENVIRONMENTS = ['local', 'dev', 'test', 'staging', 'production'] as const
export const SEVERITIES = ['blocks', 'degraded', 'cosmetic'] as const
export const FREQUENCIES = ['always', 'sometimes', 'once'] as const
export const DATA_IMPACTS = ['none', 'wrong-shown', 'wrong-written', 'exposed'] as const
export const REPORTER_ROLES = ['builder', 'checker', 'owner', 'product', 'data', 'design', 'steering', 'client', 'end-user', 'other'] as const
export const TRIAGE_VERDICTS = ['confirmed', 'needs-info', 'duplicate', 'wont-fix'] as const
export const PRIORITIES = ['P1', 'P2', 'P3'] as const
export const RISK_TIERS = ['HIGH', 'MEDIUM', 'LOW'] as const
const ANSWER_KEY = /^[a-z][a-z0-9_]*$/
const HANDLE = /^@?[A-Za-z0-9][A-Za-z0-9._-]*$/

export type IssueArgvResult = { ok: true; argv: string[] } | { ok: false; errors: string[] }

const oneOf = (list: readonly string[], value: unknown, label: string, errors: string[]) => {
  if (!list.includes(String(value))) errors.push(`${label} '${String(value)}' is not one the plugin knows`)
}
const oneLine = (value: unknown, label: string, errors: string[], required = true) => {
  if (value === undefined || value === null || value === '') { if (required) errors.push(`${label} is required`); return }
  if (typeof value !== 'string') errors.push(`${label} is not text`)
  else if (/[\r\n]/.test(value)) errors.push(`${label} is one line`)
}

// --- new -------------------------------------------------------------------------------------------

/** The shape rules, mirrored before spawning. Everything else is the plugin's call. */
export function validateIssueRequest(req: IssueReportRequest): string[] {
  const errors: string[] = []
  if (!req || typeof req !== 'object') return ['not a report request']
  const text = (value: unknown, label: string) => {
    if (typeof value !== 'string' || !value.trim()) errors.push(`${label} is required`)
  }
  oneOf(CHANNELS, req.channel, 'channel', errors)
  text(req.title, 'title')
  text(req.whatHappened, 'what happened')
  text(req.expected, 'expected')
  if (!Array.isArray(req.steps) || req.steps.every((s) => typeof s !== 'string' || !s.trim())) errors.push('at least one step is required')
  oneOf(ENVIRONMENTS, req.environment, 'environment', errors)
  oneLine(req.productVersion, 'product version', errors, false)
  oneOf(SEVERITIES, req.severity, 'severity', errors)
  oneOf(FREQUENCIES, req.frequency, 'frequency', errors)
  oneOf(DATA_IMPACTS, req.dataImpact, 'data impact', errors)
  text(req.persona, 'the type of user')
  oneOf(REPORTER_ROLES, req.reporterRole, 'role', errors)
  if (req.spec !== undefined && req.spec !== '' && !SPEC_ID.test(req.spec)) errors.push(`spec '${req.spec}' is not a spec id (expected four digits)`)
  if (!Array.isArray(req.screenshots) || req.screenshots.length === 0) errors.push('a screenshot is required')
  else for (const p of req.screenshots) if (typeof p !== 'string' || !p.trim()) errors.push('a screenshot path is empty')
  if (req.noClientData !== true) errors.push('the privacy confirmation is required')
  text(req.environmentPath, 'environment facts')
  if (req.answers && typeof req.answers === 'object') {
    for (const [k, v] of Object.entries(req.answers)) {
      if (!ANSWER_KEY.test(k)) errors.push(`answer key '${k}' is not a field name`)
      if (typeof v !== 'string') errors.push(`answer '${k}' is not text`)
      else if (/[\r\n]/.test(v) && !['response_excerpt', 'expected_vs_actual'].includes(k)) errors.push(`answer '${k}' is one line`)
    }
  }
  oneLine(req.escapedFrom, 'escaped from', errors, false)
  return errors
}

/** `[new, …flags, --by, actor, --json]` — deterministic flag order so the dialog's preview, the
 * console line and the golden test all read the same words. Refuses (never throws). */
export function buildIssueArgv(req: IssueReportRequest, actor: string): IssueArgvResult {
  const errors = validateIssueRequest(req)
  if (!actor || !actor.trim()) errors.push('no actor')
  if (errors.length > 0) return { ok: false, errors }
  const argv: string[] = ['new', '--title', req.title.trim(), '--channel', req.channel, '--what', req.whatHappened.trim(), '--expected', req.expected.trim()]
  for (const step of req.steps) if (step.trim()) argv.push('--steps', step.trim())
  argv.push('--environment', req.environment)
  if (req.productVersion?.trim()) argv.push('--product-version', req.productVersion.trim())
  argv.push('--severity', req.severity, '--frequency', req.frequency, '--data-impact', req.dataImpact, '--persona', req.persona.trim(), '--reporter-role', req.reporterRole)
  if (req.spec) argv.push('--spec', req.spec)
  for (const key of Object.keys(req.answers ?? {}).sort()) {
    const value = req.answers[key]
    if (value.trim()) argv.push('--answer', `${key}=${value.trim()}`)
  }
  for (const shot of req.screenshots) argv.push('--screenshot', shot)
  argv.push('--no-client-data', '--env-json', req.environmentPath)
  if (req.escapedFrom?.trim()) argv.push('--escaped-from', req.escapedFrom.trim())
  argv.push(ISSUE_BY_FLAG, actor.trim(), '--json')
  return { ok: true, argv }
}

/** The line as far as the request goes, for the preview while a field is still empty: every present
 * field as its flag, a missing one as `<flag?>`. The real argv comes from the table on Confirm. */
export function sketchIssueArgv(req: IssueReportRequest, actor: string): string[] {
  const out: string[] = ['new']
  const flag = (name: string, value: string | undefined) => {
    if (value && value.trim()) out.push(`--${name}`, value.trim())
    else out.push(`--${name}`, `<${name}?>`)
  }
  flag('title', req.title); flag('channel', req.channel); flag('what', req.whatHappened); flag('expected', req.expected)
  const steps = (req.steps ?? []).filter((s) => s.trim())
  if (steps.length) for (const s of steps) out.push('--steps', s.trim()); else out.push('--steps', '<steps?>')
  flag('environment', req.environment)
  if (req.productVersion?.trim()) out.push('--product-version', req.productVersion.trim())
  flag('severity', req.severity); flag('frequency', req.frequency); flag('data-impact', req.dataImpact); flag('persona', req.persona); flag('reporter-role', req.reporterRole)
  if (req.spec) out.push('--spec', req.spec)
  for (const key of Object.keys(req.answers ?? {}).sort()) if (req.answers[key]?.trim()) out.push('--answer', `${key}=${req.answers[key].trim()}`)
  if (req.screenshots?.length) for (const s of req.screenshots) out.push('--screenshot', s); else out.push('--screenshot', '<screenshot?>')
  out.push(req.noClientData ? '--no-client-data' : '<--no-client-data?>')
  out.push('--env-json', req.environmentPath || '<environment?>')
  if (req.escapedFrom?.trim()) out.push('--escaped-from', req.escapedFrom.trim())
  out.push(ISSUE_BY_FLAG, actor || '<you>', '--json')
  return out
}

// --- the lifecycle verbs ---------------------------------------------------------------------------

/** The verbs this table knows; `sync` carries no issue and no `--by`. */
export const ISSUE_VERBS = ['triage', 'prioritize', 'promote', 'note', 'reopen', 'set-status', 'file', 'sync'] as const

/** The capability (`capabilities.py`) each verb needs. */
export const ISSUE_VERB_CAPABILITY: Readonly<Record<IssueVerbRequest['verb'], string>> = {
  triage: 'issue-triage', prioritize: 'issue-prioritize', promote: 'issue-promote', note: 'issue-triage', reopen: 'issue-triage',
  'set-status': 'issue-triage', file: 'issue-file', sync: 'issue-sync',
}

export function validateIssueVerbRequest(req: IssueVerbRequest): string[] {
  const errors: string[] = []
  if (!req || typeof req !== 'object' || !(ISSUE_VERBS as readonly string[]).includes((req as { verb?: unknown }).verb as string)) return ['not a verb this table knows']
  if (req.verb !== 'sync' && !ISSUE_ID.test(req.issue)) errors.push(`issue '${String(req.issue)}' is not an issue id (expected ISS-NNNN)`)
  switch (req.verb) {
    case 'triage':
      oneOf(TRIAGE_VERDICTS, req.verdict, 'verdict', errors)
      if (req.severity !== undefined) oneOf(SEVERITIES, req.severity, 'severity', errors)
      if (req.dataImpact !== undefined) oneOf(DATA_IMPACTS, req.dataImpact, 'data impact', errors)
      if (req.verdict === 'needs-info') oneLine(req.question, 'question', errors)
      if (req.verdict === 'duplicate' && !ISSUE_ID.test(req.of ?? '')) errors.push('duplicate needs the report it duplicates (ISS-NNNN)')
      if (req.verdict === 'wont-fix') oneLine(req.reason, 'reason', errors)
      if (req.override) oneLine(req.reason, 'reason for the override', errors)
      oneLine(req.reason, 'reason', errors, false)
      break
    case 'prioritize':
      oneOf(PRIORITIES, req.priority, 'priority', errors)
      if (req.targetSprint !== undefined && req.targetSprint !== '' && !SPRINT_ID.test(req.targetSprint)) errors.push(`target sprint '${req.targetSprint}' is not a sprint id (S07, S12, …)`)
      oneLine(req.reason, 'reason', errors, false)
      break
    case 'promote':
      oneOf(RISK_TIERS, req.risk, 'risk', errors)
      if (req.owner !== undefined && req.owner !== '' && !HANDLE.test(req.owner)) errors.push(`owner '${req.owner}' is not a handle`)
      oneLine(req.team, 'team', errors, false)
      break
    case 'note': oneLine(req.note, 'note', errors); break
    case 'reopen': oneLine(req.reason, 'reason', errors); break
    case 'set-status':
      oneOf(['fixed', 'wont-fix', 'duplicate'], req.status, 'status', errors)
      if (req.status === 'duplicate' && !ISSUE_ID.test(req.of ?? '')) errors.push('duplicate needs the report it duplicates (ISS-NNNN)')
      if (req.status === 'wont-fix') oneLine(req.reason, 'reason', errors)
      oneLine(req.reason, 'reason', errors, false)
      break
    case 'file':
      if (req.host !== undefined && req.host !== 'github' && req.host !== 'azure-devops') errors.push(`host '${String(req.host)}' is not github or azure-devops`)
      oneLine(req.label, 'label', errors, false)
      break
    case 'sync': break
  }
  return errors
}

/** `[verb, --issue ISS-NNNN, …flags, --by actor, --json]`; `sync` is `[sync, --json]`. */
export function buildIssueVerbArgv(req: IssueVerbRequest, actor: string): IssueArgvResult {
  const errors = validateIssueVerbRequest(req)
  if (req?.verb !== 'sync' && (!actor || !actor.trim())) errors.push('no actor')
  if (errors.length > 0) return { ok: false, errors }
  if (req.verb === 'sync') return { ok: true, argv: ['sync', '--json'] }
  const argv: string[] = [req.verb, '--issue', req.issue]
  switch (req.verb) {
    case 'triage':
      argv.push('--verdict', req.verdict)
      if (req.severity) argv.push('--severity', req.severity)
      if (req.dataImpact) argv.push('--data-impact', req.dataImpact)
      if (req.question?.trim()) argv.push('--question', req.question.trim())
      if (req.of) argv.push('--of', req.of)
      if (req.reason?.trim()) argv.push('--reason', req.reason.trim())
      if (req.override) argv.push('--override')
      break
    case 'prioritize':
      argv.push('--priority', req.priority)
      if (req.targetSprint) argv.push('--target-sprint', req.targetSprint)
      if (req.reason?.trim()) argv.push('--reason', req.reason.trim())
      break
    case 'promote':
      argv.push('--risk', req.risk)
      if (req.owner) argv.push('--owner', req.owner)
      if (req.team?.trim()) argv.push('--team', req.team.trim())
      if (req.slate) argv.push('--slate')
      break
    case 'note': argv.push('--note', req.note.trim()); break
    case 'reopen': argv.push('--reason', req.reason.trim()); break
    case 'set-status':
      argv.push('--status', req.status)
      if (req.reason?.trim()) argv.push('--reason', req.reason.trim())
      if (req.of) argv.push('--of', req.of)
      break
    case 'file':
      if (req.host) argv.push('--host', req.host)
      if (req.label?.trim()) argv.push('--label', req.label.trim())
      if (req.dryRun) argv.push('--dry-run')
      break
  }
  argv.push(ISSUE_BY_FLAG, actor.trim(), '--json')
  return { ok: true, argv }
}

/** "Run: report_issue.py triage --issue ISS-0001 --verdict confirmed --by @arjun --json" — values with
 * spaces quoted for reading only. */
export function describeIssueArgv(argv: readonly string[]): string {
  return `Run: ${ISSUE_SCRIPT} ${argv.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`
}
