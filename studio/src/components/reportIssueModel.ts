// The words and shapes behind `ReportIssueDialog`, kept pure so a test reads them without a DOM:
// the request the answers become, the preview line, the plugin's `gaps[]` routed back to their
// fields, and the one disabled reason Confirm carries. Nothing here spawns; nothing here decides —
// the plugin's `issue_model.py` is the judge of lengths, follow-ups, image bytes and secrets.
import type { IssueCapture, IssueEnvironmentRead, IssueQuestion, IssueReportRequest } from '../../shared/types'
import { buildIssueArgv, describeIssueArgv, sketchIssueArgv } from '../../shared/issueArgv'
import { CAPABILITIES, CONFIRM_NO_CLIENT_DATA, NO_ACTOR, NO_SCREENSHOT, PICK_CHANNEL, newerPlugin } from '../../shared/reasons'

/** The base fields the form holds by question id; the channel follow-ups ride in the same record. */
export type Answers = Record<string, string>

export const BASE_FIELD_IDS = [
  'channel', 'title', 'what_happened', 'expected', 'steps', 'environment', 'product_version', 'severity', 'frequency', 'data_impact',
  'persona', 'reporter_role', 'spec', 'screenshot', 'no_client_data',
] as const

/** The follow-up question ids of a plan: everything that is not a base field. */
export function followUpIds(questions: readonly IssueQuestion[]): string[] {
  return questions.filter((q) => !(BASE_FIELD_IDS as readonly string[]).includes(q.id)).map((q) => q.id)
}

export interface RequestInput {
  channel: string
  answers: Answers
  followUps: readonly string[]
  shots: readonly Extract<IssueCapture, { ok: true }>[]
  noClientData: boolean
  env: IssueEnvironmentRead | null
  escapedFrom?: string
}

/** The request the dialog hands main — built from the answers, never from anything main did not
 * hand the renderer (the screenshot paths and the environment path are main's own). */
export function buildRequest(input: RequestInput): IssueReportRequest {
  const a = input.answers
  const answers: Record<string, string> = {}
  for (const id of input.followUps) if (a[id]?.trim()) answers[id] = a[id].trim()
  return {
    channel: input.channel,
    title: a.title ?? '',
    whatHappened: a.what_happened ?? '',
    expected: a.expected ?? '',
    steps: (a.steps ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
    environment: a.environment ?? '',
    ...(a.product_version?.trim() ? { productVersion: a.product_version.trim() } : {}),
    severity: a.severity ?? '',
    frequency: a.frequency ?? '',
    dataImpact: a.data_impact ?? '',
    persona: a.persona ?? '',
    reporterRole: a.reporter_role ?? '',
    ...(a.spec?.trim() ? { spec: a.spec.trim() } : {}),
    screenshots: input.shots.map((s) => s.path),
    noClientData: input.noClientData,
    answers,
    environmentPath: input.env?.ok ? input.env.envPath : '',
    ...(input.escapedFrom?.trim() ? { escapedFrom: input.escapedFrom.trim() } : {}),
  }
}

/** The line previewed before Confirm: the golden argv when the shape is complete, the sketch with
 * `<flag?>` placeholders while it is not. `--by` shows the actor's label; main fills the real one. */
export function previewLine(req: IssueReportRequest, actor: string | null): string {
  const built = buildIssueArgv(req, actor ?? '<you>')
  return describeIssueArgv(built.ok ? built.argv : sketchIssueArgv(req, actor ?? '<you>'))
}

/** The one reason Confirm is disabled, in priority order — every sentence is `reasons.ts`'s own or
 * the argv table's shape error (the VerbDialog precedent). Null when it may run. */
export function confirmReason(input: {
  actor: string | null
  capabilities: readonly string[] | null
  channel: string
  shots: number
  noClientData: boolean
  req: IssueReportRequest
}): string | null {
  if (!input.actor) return NO_ACTOR
  if (input.capabilities && !input.capabilities.includes(CAPABILITIES.issueReport)) return newerPlugin(CAPABILITIES.issueReport)
  if (!input.channel) return PICK_CHANNEL
  if (input.shots === 0) return NO_SCREENSHOT
  if (!input.noClientData) return CONFIRM_NO_CLIENT_DATA
  const built = buildIssueArgv(input.req, input.actor)
  return built.ok ? null : built.errors.join('; ')
}

/** `gaps[]` is the plugin's `field: what clears it`; the field half routes the line to its control,
 * the rest is shown verbatim beside it. A line with no `field:` prefix stays general. */
export function gapsByField(gaps: readonly string[]): { byField: Record<string, string>; general: string[] } {
  const byField: Record<string, string> = {}
  const general: string[] = []
  for (const line of gaps) {
    const m = /^([a-z][a-z0-9_]*):\s*(.+)$/.exec(line.trim())
    if (m) byField[m[1]] = byField[m[1]] ? `${byField[m[1]]} · ${m[2]}` : m[2]
    else general.push(line)
  }
  return { byField, general }
}

/** The build-under-test line the environment block shows for a local run, from the plugin's facts. */
export function buildUnderTest(env: IssueEnvironmentRead | null): string | null {
  if (!env?.ok) return null
  const r = env.env.repo
  if (!r.branch && !r.commit) return null
  return `${r.branch ?? '?'} @ ${r.commit ?? '?'}`
}
