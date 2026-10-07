import { useEffect, useRef, useState, type ReactNode } from 'react'
import type {
  ActivityCheckResult, DocumentFocus, StageActivity, StageDocument, StageReadiness, StartActivityResult,
} from '../../shared/types'
import { CHECK_CONTROLS, PANEL_CONTROLS } from '../../shared/activityControls'
import { pluralWord } from '../../shared/format'
import { sendChatTurn, useChatAvailable } from '../chatBridge'
import { computeActivityRows, slashCommand, type ActivityRow } from '../workflowSteps'
import { contextFrom, listStagger } from '../motion/choreo'
import { enabled as motionEnabled, motion, reduced as motionReduced } from '../motion/motion'
import { useStudioGSAP } from '../motion/useStudioGSAP'
import { Button, Card, Eyebrow, Notice } from '../ui'
import { BriefForm } from './BriefForm'
import { useFocusedActivity } from './FocusedActivityHost'
import { IntakePanel } from './IntakePanel'
import { NarrativeCoveragePanel } from './NarrativeCoveragePanel'
import { PhaseReportPanel } from './PhaseReportPanel'
import { ReviewStandingPanel } from './ReviewStandingPanel'
import { SprintBoard } from './SprintBoard'
import { useDraftJob, type DraftJobApi } from './useDraftJob'

/** "Also in this stage" (spec 0024): the optional things a person can do here, as the plugin
 * declares them, each with the ONE control its kind gets — start the documents (create), run a
 * check (check) or talk it through with the chat (talk). Status and the blocked reason are the
 * plugin's own; this component decides nothing about them. Activities never gate the stage, so
 * they sit apart from the document steps.
 *
 * Draws nothing at all — no heading — when the plugin declared nothing to draw, so an older
 * plugin leaves the tab exactly as it was.
 *
 * Two ways to show a panel activity (F11). With neither `onFocusActivity` nor a
 * `FocusedActivityContext` above it, the panel renders inline in its row, as it always has. With
 * either, the row offers an "Open" button instead and the host (WorkflowTab's
 * `FocusedActivityHost`) shows `<FocusedActivityPanel>` in the main slot — the list column stays a
 * list. The prop wins when both are present, so a caller can route the pick itself. */
export function ActivitiesPanel({
  projectPath, readiness, actor = '', onOpenDocument, onRefresh, onFocusActivity,
}: {
  projectPath: string
  readiness: StageReadiness
  /** Who is signed in; a kept or discarded model draft is recorded under this name. */
  actor?: string
  onOpenDocument: (relPath: string, focus?: DocumentFocus) => void
  /** Re-reads the stage's readiness after an action changed the project. */
  onRefresh?: () => Promise<void>
  /** When given, a panel activity is opened in the caller's slot rather than drawn in its row. */
  onFocusActivity?: (activity: StageActivity) => void
}) {
  const rows = computeActivityRows(readiness)
  // One model job at a time, shared by the summaries and the review so each knows the other is busy.
  const draft = useDraftJob(projectPath)
  const listRef = useRef<HTMLUListElement>(null)
  // §4 #4: rows stagger in once, when the list first appears — never on the 2 s readiness poll.
  useStudioGSAP(() => {
    const list = listRef.current
    if (!list) return
    const ctx = contextFrom(list, { enabled: motionEnabled(), reduced: motionReduced() }, motion)
    listStagger.play(ctx, { items: Array.from(list.querySelectorAll('[data-reveal]')) })
  }, { scope: listRef, dependencies: [projectPath, readiness.stageId] })
  // A broken declaration is the plugin's to describe; it must never take the document steps with it.
  const warning = readiness.warnings && readiness.warnings.length > 0 ? readiness.warnings.join(' ') : null
  if (readiness.activities === undefined || (rows.length === 0 && warning === null)) return null

  return (
    <section data-testid="activities-panel" aria-labelledby="activities-title" className="mt-4">
      <Eyebrow as="h3" id="activities-title">Also in this stage</Eyebrow>
      {warning && <Notice tone="warn" data-testid="activities-warning" className="mt-1">{warning}</Notice>}
      <ul ref={listRef} className="mt-2 space-y-2">
        {rows.map((row) => (
          <ActivityRowView
            key={row.activity.id}
            row={row}
            projectPath={projectPath}
            readiness={readiness}
            stageId={readiness.stageId}
            stageDisplay={readiness.display}
            documents={readiness.documents}
            draft={draft}
            actor={actor}
            onOpenDocument={onOpenDocument}
            onRefresh={onRefresh}
            onFocusActivity={onFocusActivity}
          />
        ))}
      </ul>
    </section>
  )
}

interface RowContext {
  projectPath: string
  readiness: StageReadiness
  stageId: string
  stageDisplay: string
  documents: StageDocument[]
  draft: DraftJobApi
  actor: string
  onOpenDocument: (relPath: string, focus?: DocumentFocus) => void
  onRefresh?: () => Promise<void>
  onFocusActivity?: (activity: StageActivity) => void
}

function ActivityRowView({ row, ...context }: { row: ActivityRow } & RowContext) {
  const { activity, status } = row
  return (
    <Card
      as="li"
      data-reveal=""
      data-testid="activity-row"
      data-activity-id={activity.id}
      data-activity-status={status}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-sm font-medium text-ink-1">{activity.label}</span>
        {status === 'done' && <span className="shrink-0 text-xs font-medium text-status-ok-ink">Done</span>}
      </div>
      {status === 'blocked' && <p className="mt-1 text-xs text-ink-3">{row.reason}</p>}
      {PANEL_CONTROLS[activity.id] && status !== 'blocked' && <PanelOrReason row={row} {...context} />}
      {!PANEL_CONTROLS[activity.id] && status === 'available' && (
        <ActivityControl activity={activity} disabledReason={row.disabledReason} {...context} />
      )}
    </Card>
  )
}

/** A panel activity keeps its panel once done (a done intake still shows its frozen catalogue), but
 * only when the installed plugin can supply what the panel reads. Blocked rows never reach here. */
function PanelOrReason({ row, onFocusActivity, ...context }: { row: ActivityRow } & RowContext) {
  // P2's bridge (FocusedActivityHost): null when nothing above us hosts a panel.
  const bridge = useFocusedActivity()
  if (row.disabledReason) return <DisabledReason reason={row.disabledReason} />
  if (onFocusActivity || bridge) {
    const { activity } = row
    const open = bridge?.focusedId === activity.id
    const pick = () => {
      if (onFocusActivity) return onFocusActivity(activity)
      // The hosted panel gets its OWN model-job handle (FocusedActivityPanel) rather than this
      // row's `draft`: the host stores the node, so a node closed over this render's `draft`
      // would stop updating once the job moved on. Both handles adopt the main process's state.
      bridge?.focus(
        activity,
        <FocusedActivityPanel
          activityId={activity.id}
          projectPath={context.projectPath}
          readiness={context.readiness}
          actor={context.actor}
          onOpenDocument={context.onOpenDocument}
        />,
      )
    }
    return (
      <div className="mt-2">
        <Button size="sm" aria-pressed={open} onClick={pick}>{open ? 'Showing' : 'Open'}</Button>
      </div>
    )
  }
  return <ActivityPanel id={row.activity.id} {...context} />
}

function DisabledReason({ reason }: { reason: string }) {
  return <p data-testid="activity-disabled-reason" className="mt-1 text-xs text-ink-3">{reason}</p>
}

/** Keyed by project and stage, so moving to another one starts the panel fresh. */
function ActivityPanel({ id, projectPath, stageId, documents, draft, actor, onOpenDocument }: { id: string } & RowContext) {
  const key = `${projectPath}|${stageId}`
  if (id === 'phase-report') return <PhaseReportPanel key={key} projectPath={projectPath} stageId={stageId} />
  if (id === 'intake') return <IntakePanel key={key} projectPath={projectPath} actor={actor} />
  if (id === 'brief') return <BriefForm key={key} projectPath={projectPath} actor={actor} onOpenDocument={onOpenDocument} />
  // The row is already gated on `sprint-status` by PanelOrReason, so the panel needs no capabilities.
  if (id === 'sprint') return <SprintBoard key={key} compact projectPath={projectPath} />
  if (id === 'enhance') {
    return <NarrativeCoveragePanel key={key} projectPath={projectPath} stageId={stageId} documents={documents} draft={draft} actor={actor} />
  }
  return <ReviewStandingPanel key={key} projectPath={projectPath} stageId={stageId} draft={draft} actor={actor} />
}

/** The panel a host renders in the main slot after `onFocusActivity` picked it (F11). Same panels,
 * same props, own model-job handle — the host owns one of these at a time, so "one job at a time"
 * still holds for the panels it shows. The id is the plugin's activity id. */
export function FocusedActivityPanel({
  activityId, projectPath, readiness, actor = '', onOpenDocument,
}: {
  activityId: string
  projectPath: string
  readiness: StageReadiness
  actor?: string
  onOpenDocument: (relPath: string, focus?: DocumentFocus) => void
}) {
  const draft = useDraftJob(projectPath)
  return (
    <ActivityPanel
      id={activityId}
      projectPath={projectPath}
      readiness={readiness}
      stageId={readiness.stageId}
      stageDisplay={readiness.display}
      documents={readiness.documents}
      draft={draft}
      actor={actor}
      onOpenDocument={onOpenDocument}
    />
  )
}

function ActivityControl({
  activity, disabledReason, ...context
}: { activity: StageActivity; disabledReason: string | null } & RowContext) {
  if (activity.kind === 'create') return <CreateControl activity={activity} disabledReason={disabledReason} {...context} />
  if (activity.kind === 'check') return <CheckControl activity={activity} disabledReason={disabledReason} {...context} />
  return <TalkControl activity={activity} disabledReason={disabledReason} stageDisplay={context.stageDisplay} />
}

/** The reason is rendered once, as its own line (the `activity-disabled-reason` convention the
 * tests read), so it is not also handed to the Button — two copies would read twice. */
function ControlButton({
  label, disabledReason, busy, onClick,
}: { label: string; disabledReason: string | null; busy: boolean; onClick: () => void }) {
  return (
    <div className="mt-2 space-y-1">
      <Button variant="primary" size="sm" onClick={onClick} disabled={busy || disabledReason !== null}>
        {busy ? 'Working…' : label}
      </Button>
      {disabledReason && <p data-testid="activity-disabled-reason" className="text-xs text-ink-3">{disabledReason}</p>}
    </div>
  )
}

/** True while mounted: a reply for a row the person already navigated away from must not land. */
function useAlive() {
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  return alive
}

type Phase<T> = { kind: 'idle' } | { kind: 'running' } | { kind: 'done'; value: T } | { kind: 'failed'; message: string }

function failure(err: unknown, fallback: string): { kind: 'failed'; message: string } {
  return { kind: 'failed', message: err instanceof Error ? err.message : fallback }
}

function ErrorLine({ message }: { message: string }) {
  return <Notice tone="error" role="alert" data-testid="activity-error" className="mt-1">{message}</Notice>
}

/** The ONE way Studio starts a `create` activity's documents from their templates — the plugin's
 * `ensureDocumentFromTemplate` behind `startActivity` (it never overwrites, and says which files
 * were created and which already existed). Exported so the Workflow tab's empty step panel
 * (round 2, S4) offers "Start from template" through this exact call rather than a second write
 * path. Opens the first file the plugin named, then re-reads the stage so the activity's status
 * comes from the plugin again. */
export async function ensureDocumentFromTemplate({
  projectPath, stageId, activityId, onOpenDocument, onRefresh,
}: {
  projectPath: string
  stageId: string
  activityId: string
  onOpenDocument: (relPath: string, focus?: DocumentFocus) => void
  onRefresh?: () => Promise<void>
}): Promise<StartActivityResult> {
  const result = await window.studio.startActivity(projectPath, stageId, activityId)
  if (!result.ok) return result
  const first = result.opened ?? result.created[0] ?? result.existing[0]
  if (first) onOpenDocument(first)
  await onRefresh?.()
  return result
}

function CreateControl({
  activity, disabledReason, projectPath, stageId, onOpenDocument, onRefresh,
}: { activity: StageActivity; disabledReason: string | null } & RowContext) {
  const [phase, setPhase] = useState<Phase<StartActivityResult>>({ kind: 'idle' })
  const alive = useAlive()

  const start = async () => {
    setPhase({ kind: 'running' })
    try {
      const result = await ensureDocumentFromTemplate({ projectPath, stageId, activityId: activity.id, onOpenDocument, onRefresh })
      if (alive.current) setPhase({ kind: 'done', value: result })
    } catch (err) {
      if (alive.current) setPhase(failure(err, 'Those documents could not be started.'))
    }
  }

  return (
    <>
      <ControlButton label="Create" disabledReason={disabledReason} busy={phase.kind === 'running'} onClick={start} />
      {phase.kind === 'failed' && <ErrorLine message={phase.message} />}
      {phase.kind === 'done' && (phase.value.ok
        ? <p data-testid="activity-result" className="mt-1 text-xs text-ink-2">{describeStart(phase.value)}</p>
        : <ErrorLine message={phase.value.error ?? 'Those documents could not be started.'} />)}
    </>
  )
}

const baseName = (path: string) => path.split('/').pop() ?? path

// The shared word rule (`shared/format.ts`, C6) under the name this file already used.
const plural = pluralWord

/** "Started 2 documents (a.md, b.md); 1 already existed and was left as it was (c.md)." */
function describeStart({ created, existing }: StartActivityResult): string {
  const names = (paths: string[]) => paths.map(baseName).join(', ')
  const leftAlone = existing.length === 1 ? 'was left as it was' : 'were left as they were'
  if (created.length === 0) return `Nothing new to start: ${existing.length} already existed and ${leftAlone} (${names(existing)}).`
  const started = `Started ${created.length} ${plural(created.length, 'document', 'documents')} (${names(created)})`
  if (existing.length === 0) return `${started}.`
  return `${started}; ${existing.length} already existed and ${leftAlone} (${names(existing)}).`
}

function CheckControl({
  activity, disabledReason, projectPath, onOpenDocument,
}: { activity: StageActivity; disabledReason: string | null } & RowContext) {
  const [phase, setPhase] = useState<Phase<ActivityCheckResult>>({ kind: 'idle' })
  const alive = useAlive()
  const button = CHECK_CONTROLS[activity.id]?.button ?? activity.label
  const document = CHECK_CONTROLS[activity.id]?.document

  const run = async () => {
    setPhase({ kind: 'running' })
    try {
      const result = await window.studio.runActivityCheck(projectPath, activity.id)
      if (alive.current) setPhase({ kind: 'done', value: result })
    } catch (err) {
      if (alive.current) setPhase(failure(err, 'The check could not run.'))
    }
  }

  return (
    <>
      <ControlButton label={button} disabledReason={disabledReason} busy={phase.kind === 'running'} onClick={run} />
      {phase.kind === 'failed' && <ErrorLine message={phase.message} />}
      {phase.kind === 'done' && <CheckResultView result={phase.value} />}
      {phase.kind === 'done' && phase.value.ok && phase.value.hasData && document && (
        <Button variant="link" size="sm" className="mt-1" onClick={() => onOpenDocument(document)}>
          Open {document.split('/').pop()}
        </Button>
      )}
    </>
  )
}

/** A check's result in plain language. "Nothing to check yet" is its own state: it never reads as
 * "No problems found" or as a count of zero, because an empty project has not passed anything. */
function CheckResultView({ result }: { result: ActivityCheckResult }) {
  if (!result.ok) return <ErrorLine message={result.error} />
  return (
    <div data-testid="activity-result" className="mt-1 space-y-1 text-xs text-ink-2">
      {!result.hasData ? <NothingToCheck notes={result.notes} />
        : result.check === 'rules-check' ? <RulesFindings findings={result.findings} />
        : <DataSummary result={result} />}
    </div>
  )
}

function NothingToCheck({ notes }: { notes: string[] }): ReactNode {
  return (
    <>
      <p>Nothing to check yet</p>
      {notes.map((note) => <p key={note}>{note}</p>)}
    </>
  )
}

function RulesFindings({ findings }: { findings: Array<{ subject: string; message: string }> }) {
  if (findings.length === 0) return <p>No problems found</p>
  return (
    <ul className="space-y-1">
      {findings.map((f) => (
        <li key={`${f.subject}:${f.message}`}>
          <span className="font-medium text-ink-1">{f.subject}</span> {f.message}
        </li>
      ))}
    </ul>
  )
}

function DataSummary({ result }: { result: Extract<ActivityCheckResult, { check: 'data-check' }> }) {
  const { fieldCount, piiCount, piiFields, riskImplication } = result
  return (
    <>
      <p>
        {piiCount === 0
          ? `None of the ${fieldCount} ${plural(fieldCount, 'field', 'fields')} hold personal data.`
          : `${piiCount} of ${fieldCount} ${plural(fieldCount, 'field', 'fields')} ${plural(piiCount, 'holds', 'hold')} personal data: ${piiFields.join(', ')}.`}
      </p>
      {riskImplication && <p>{riskImplication}</p>}
    </>
  )
}

/** The text the chat receives. `[Studio] ` marks it as sent by this screen on the person's behalf
 * (the chat's system prompt says how to treat it), and it names the stage and the command so the
 * model knows which optional step to help with. */
export function buildTalkMessage(activity: StageActivity, stageDisplay: string): string {
  const stage = stageDisplay.replace(/^Phase \d+:\s*/, '')
  const command = activity.command ? ` (${slashCommand(activity.command)})` : ''
  return `[Studio] The person has opened the "${activity.label}" step${command} in the ${stage} stage and wants to talk it through. Help with this step now.`
}

function TalkControl({
  activity, disabledReason, stageDisplay,
}: { activity: StageActivity; disabledReason: string | null; stageDisplay: string }) {
  const chatAvailable = useChatAvailable()
  const [unsent, setUnsent] = useState<string | null>(null)
  const alive = useAlive()
  const reason = disabledReason ?? (chatAvailable ? null : 'The chat is not open.')

  const talk = async () => {
    setUnsent(null)
    const result = await sendChatTurn(buildTalkMessage(activity, stageDisplay))
    if (alive.current && !result.sent) setUnsent(result.reason)
  }

  return (
    <>
      <ControlButton label="Talk it through" disabledReason={reason} busy={false} onClick={talk} />
      {unsent && <ErrorLine message={unsent} />}
    </>
  )
}
