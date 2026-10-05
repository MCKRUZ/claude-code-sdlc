import { useState, type ReactNode } from 'react'
import type { BoardRow, SprintReportKind, SprintSlateRow, SprintView } from '../../shared/types'
import {
  businessDays, decisionsLabel, emptyMessage, laneBadge, mixChips, NO_DATA, nextUpLabel, readinessLabel,
  remainingLabel, slateToBoardRow, SPRINT_CAPABILITY, stateChip, targetLabel, wipLabel, type ChipTone,
} from '../../shared/sprintModel'
import { messageOf, PANEL_BUTTON, PANEL_SECONDARY_BUTTON, PanelError, useLoaded, useScopedState } from './activityPanelBits'
import { useStageReadiness } from './StageReadinessContext'

/** The sprint the team runs (proposal: studio-improvements, Batch 2), read from
 * `sprint.py status --json` and drawn as it is. Studio computes nothing here: every count, verdict
 * age, mix figure and build-order position is the plugin's, and a value the plugin reports as
 * null reads "no data" — never a zero. Counts only, never a per-person total: the sprint layer's
 * metrics rule, kept by having no place on this screen where one could appear.
 *
 * Two shapes. The full view sits beside the Board in the Build group and opens a slate row in the
 * same spec view the board opens. The compact panel is the Build › Workflow activity row
 * (`PANEL_CONTROLS.sprint`): the same picture without the table. Both are read-only; the only
 * writes are the two report pages, which the plugin's own scripts write into .sdlc/reports/. */
export function SprintBoard({
  projectPath, sprintId, capabilities, compact = false, onOpenSpec,
}: {
  projectPath: string
  /** A sprint to show instead of the active one. */
  sprintId?: string
  /** What the installed plugin says it can do. Undefined when nothing has said: then the view is
   * drawn and the plugin's own answer decides. */
  capabilities?: string[]
  compact?: boolean
  /** Opens a slated spec in the spec view. Absent in the compact panel, whose rows are not drawn. */
  onOpenSpec?: (row: BoardRow) => void
}) {
  const testId = compact ? 'sprint-panel' : 'sprint-board'
  if (capabilities !== undefined && !capabilities.includes(SPRINT_CAPABILITY)) {
    return (
      <div data-testid={testId} className={compact ? 'mt-2' : 'space-y-4'}>
        {!compact && <h2 className="text-base font-semibold text-slate-900">Sprint</h2>}
        <p data-testid="activity-disabled-reason" className="text-xs text-slate-500">needs a newer plugin: lacks {SPRINT_CAPABILITY}</p>
      </div>
    )
  }
  return <SprintBoardBody projectPath={projectPath} sprintId={sprintId} compact={compact} onOpenSpec={onOpenSpec} testId={testId} />
}

/** The full view as App mounts it: the plugin's capabilities come from the stage readiness Frame
 * already holds, so the view can say "needs a newer plugin" before it asks the plugin anything. */
export function SprintScreen({ projectPath, onOpenSpec }: { projectPath: string; onOpenSpec: (row: BoardRow) => void }) {
  const { readiness } = useStageReadiness()
  return <SprintBoard projectPath={projectPath} capabilities={readiness?.capabilities} onOpenSpec={onOpenSpec} />
}

function SprintBoardBody({
  projectPath, sprintId, compact, onOpenSpec, testId,
}: { projectPath: string; sprintId?: string; compact: boolean; onOpenSpec?: (row: BoardRow) => void; testId: string }) {
  const [reloads, setReloads] = useState(0)
  const scope = `${projectPath}|${sprintId ?? ''}|${reloads}`
  const loaded = useLoaded(scope, () => window.studio.getSprintStatus(projectPath, sprintId), 'The sprint could not be read.')

  return (
    <div data-testid={testId} className={compact ? 'mt-2 space-y-2 text-xs text-slate-600' : 'space-y-5'}>
      {!compact && (
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Sprint</h2>
            <p className="mt-0.5 text-sm text-slate-500">What the team committed to, as the plugin reads it from the specs.</p>
          </div>
          <button
            type="button"
            onClick={() => setReloads((n) => n + 1)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300"
          >
            Refresh
          </button>
        </div>
      )}
      {loaded.kind === 'loading' && <p className="text-sm text-slate-400">Reading the sprint…</p>}
      {loaded.kind === 'failed' && <PanelError message={loaded.message} />}
      {loaded.kind === 'ready' && loaded.value.ok && (
        <SprintViewBody view={loaded.value} projectPath={projectPath} compact={compact} onOpenSpec={onOpenSpec} />
      )}
    </div>
  )
}

// --- the view ----------------------------------------------------------------------------------

function SprintViewBody({
  view, projectPath, compact, onOpenSpec,
}: { view: SprintView; projectPath: string; compact: boolean; onOpenSpec?: (row: BoardRow) => void }) {
  const { sprint } = view
  if (sprint === null) {
    return <p data-testid="sprint-empty" className="text-sm text-slate-600">{emptyMessage(view)}</p>
  }
  const empty = emptyMessage(view)
  return (
    <>
      <SprintHeader view={view} compact={compact} />
      {!compact && view.note && <p className="text-xs text-amber-700">{view.note}</p>}
      {empty ? <p data-testid="sprint-empty" className="text-sm text-slate-600">{empty}</p>
        : !compact && <SlateTable rows={view.slate} onOpenSpec={onOpenSpec} />}
      <div className={compact ? 'space-y-1' : 'grid gap-4 md:grid-cols-2'}>
        <Section title="Readiness" testId="sprint-readiness">
          <p>{readinessLabel(view)}</p>
          {view.hasData && view.readiness.gaps.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {view.readiness.gaps.map((g) => (
                <li key={g.spec || '(slate)'}><span className="font-medium text-slate-800">{g.spec || '(slate)'}</span>: {g.gaps.join('; ')}</li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Verdicts pending" testId="sprint-verdicts">
          {view.verdictsPending.length === 0 ? <p>{view.hasData ? 'none pending' : NO_DATA}</p> : (
            <ul className="space-y-0.5">
              {view.verdictsPending.map((v) => (
                <li key={`${v.spec}:${v.lane}`}><span className="font-medium text-slate-800">{v.spec}</span> · {v.lane} · {businessDays(v.sinceBusinessDays)}</li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Handoffs open" testId="sprint-handoffs">
          {view.handoffsOpen.length === 0 ? <p>{view.hasData ? 'none unacknowledged' : NO_DATA}</p> : (
            <ul className="space-y-0.5">
              {view.handoffsOpen.map((h) => (
                <li key={h.spec}><span className="font-medium text-slate-800">{h.spec}</span> → {h.to} · {businessDays(h.sinceBusinessDays)}</li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Next up" testId="sprint-next-up">
          <p className={view.nextUp ? 'font-medium text-slate-900' : ''}>{nextUpLabel(view)}</p>
          <p className="mt-1">
            <span className="text-slate-500">Build order: </span>
            {view.buildOrder.length > 0 ? view.buildOrder.join(' → ') : NO_DATA}
          </p>
          {view.buildOrder.length > 0 && <p className="text-slate-400">deps, then unblocks-most, then HIGH→LOW, then id</p>}
        </Section>
        {!compact && (
          <Section title="Dependency gaps" testId="sprint-dependency-gaps">
            {view.dependencyGaps.length === 0 ? <p>{view.hasData ? 'none' : NO_DATA}</p> : (
              <ul className="space-y-0.5 text-amber-700">{view.dependencyGaps.map((g) => <li key={g}>{g}</li>)}</ul>
            )}
          </Section>
        )}
        {!compact && (
          <Section title="Decisions" testId="sprint-decisions">
            <p>{decisionsLabel(view.decisions)}</p>
            {view.decisions && view.decisions.overdue.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-amber-700">
                {view.decisions.overdue.map((d) => (
                  <li key={d.id || d.decision}>
                    <span className="font-medium">{d.id || 'decision'}</span>
                    {d.decision && <> — {d.decision}</>} (owner: {d.owner || 'no owner'}, due {d.due || '?'})
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}
        {!compact && (
          <Section title="Carried in" testId="sprint-carried-in">
            {view.carriedIn.length === 0 ? <p>none</p> : (
              <ul className="space-y-0.5">
                {view.carriedIn.map((c) => (
                  <li key={`${c.spec}:${c.fromSprint}`}>
                    <span className="font-medium text-slate-800">{c.spec}</span> from {c.fromSprint || '?'}{c.reason && <>: {c.reason}</>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}
      </div>
      <SprintPages projectPath={projectPath} sprintId={sprint.id} />
    </>
  )
}

const CHIP: Record<ChipTone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  good: 'bg-emerald-50 text-emerald-700',
  attention: 'bg-amber-50 text-amber-800',
  muted: 'bg-slate-100 text-slate-500',
}

function Chip({ tone, children, testId }: { tone: ChipTone; children: ReactNode; testId?: string }) {
  return <span data-testid={testId} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CHIP[tone]}`}>{children}</span>
}

function SprintHeader({ view, compact }: { view: SprintView; compact: boolean }) {
  const sprint = view.sprint!
  const state = stateChip(sprint.state)
  const remaining = remainingLabel(sprint)
  const chips = mixChips(view.mix)
  return (
    <div data-testid="sprint-header" className={compact ? 'space-y-1' : 'rounded-xl border border-slate-200 bg-white px-4 py-3'}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={compact ? 'font-semibold text-slate-900' : 'text-sm font-semibold text-slate-900'}>Sprint {sprint.id}</span>
        <Chip tone={state.tone} testId="sprint-state">{state.label}</Chip>
        {sprint.goal && <span className="text-sm text-slate-600">— {sprint.goal}</span>}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {sprint.start || '?'} → {sprint.end || '?'}
        {remaining && <> · <span data-testid="sprint-remaining">{remaining}</span></>}
        {' · '}target <span data-testid="sprint-target">{targetLabel(sprint.target)}</span>
        {sprint.boardRef && <> · board: {sprint.boardRef} (manual mapping only)</>}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">Mix</span>
        {chips.length === 0 ? <span data-testid="sprint-mix">{NO_DATA}</span>
          : chips.map((c) => <Chip key={c.tier} tone="neutral" testId="sprint-mix">{c.label}</Chip>)}
        <span className="ml-2 text-slate-500">WIP</span>
        <span data-testid="sprint-wip">{wipLabel(view.wip)}</span>
      </div>
      {view.mixWarnings.length > 0 && (
        <ul data-testid="sprint-mix-warnings" className="mt-1 space-y-0.5 text-xs text-amber-700">
          {view.mixWarnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
    </div>
  )
}

function Section({ title, testId, children }: { title: string; testId: string; children: ReactNode }) {
  return (
    <section data-testid={testId} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </section>
  )
}

const TH = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500'
const TD = 'px-3 py-2 align-top text-xs text-slate-700'

/** The slate as the plugin's text table shows it, one row per slated spec. A row opens the spec
 * view when the screen can open one; otherwise it is text. */
function SlateTable({ rows, onOpenSpec }: { rows: SprintSlateRow[]; onOpenSpec?: (row: BoardRow) => void }) {
  return (
    <div data-testid="sprint-slate" className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full border-collapse">
        <thead className="border-b border-slate-200">
          <tr>
            {['Spec', 'Name', 'Risk', 'Type', 'Status', 'DoR', 'Eng', 'Data', 'Next owner', 'Depends on'].map((h) => <th key={h} className={TH}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => <SlateRow key={row.id} row={row} onOpenSpec={onOpenSpec} />)}
        </tbody>
      </table>
    </div>
  )
}

function SlateRow({ row, onOpenSpec }: { row: SprintSlateRow; onOpenSpec?: (row: BoardRow) => void }) {
  const eng = laneBadge(row.engReview), data = laneBadge(row.dataReview)
  return (
    <tr data-testid="sprint-slate-row" data-spec={row.id} className="border-b border-slate-100 last:border-0">
      <td className={`${TD} font-mono`}>
        {onOpenSpec ? (
          <button type="button" onClick={() => onOpenSpec(slateToBoardRow(row))} className="font-medium text-brand-700 hover:text-brand-800">
            {row.id}
          </button>
        ) : row.id}
      </td>
      <td className={TD}>{row.name}</td>
      <td className={TD}>{row.risk}</td>
      <td className={TD}>{row.type || '—'}</td>
      <td className={TD}>{row.status}</td>
      <td className={TD}>
        {row.dor === 'READY' ? <span className="font-medium text-emerald-700">READY</span> : (
          <details>
            <summary className="cursor-pointer font-medium text-amber-800">NOT READY</summary>
            <ul className="mt-1 space-y-0.5 text-slate-600">
              {row.dorBlocking.length === 0 ? <li>the checker gave no line</li>
                : row.dorBlocking.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </details>
        )}
      </td>
      <td className={TD}><Chip tone={eng.tone}>{eng.label}</Chip></td>
      <td className={TD}><Chip tone={data.tone}>{data.label}</Chip></td>
      <td className={TD}>{row.nextOwner || '—'}</td>
      <td className={`${TD} font-mono`}>{row.dependsOn.length > 0 ? row.dependsOn.join(', ') : '—'}</td>
    </tr>
  )
}

// --- the two pages -----------------------------------------------------------------------------

type PagesState =
  | { kind: 'idle' }
  | { kind: 'running'; page: SprintReportKind }
  | { kind: 'failed'; message: string }
  | { kind: 'done'; page: SprintReportKind; relOutput: string; openError: string | null }

const PAGES_IDLE: PagesState = { kind: 'idle' }
const PAGE_LABEL: Record<SprintReportKind, string> = { planning: 'Planning page', review: 'Review page' }

/** Writes a page through the plugin, then opens it with the system's default program (the same
 * `openReport` the phase report uses, which refuses anything outside .sdlc/reports/). Nothing
 * runs until a button is pressed — writing a file is not something looking at a screen should do. */
function SprintPages({ projectPath, sprintId }: { projectPath: string; sprintId: string }) {
  const scope = `${projectPath}|${sprintId}`
  const [state, setState, isCurrent] = useScopedState<PagesState>(scope, PAGES_IDLE)
  const running = state.kind === 'running'

  const write = async (page: SprintReportKind) => {
    setState({ kind: 'running', page })
    try {
      const written = await window.studio.renderSprintReport(projectPath, sprintId, page)
      if (!isCurrent(scope)) return
      if (!written.ok) { setState({ kind: 'failed', message: written.error || 'The sprint page could not be written.' }); return }
      let openError: string | null = null
      try {
        const opened = await window.studio.openReport(projectPath, written.relOutput)
        if (!opened.ok) openError = opened.error || 'The page could not be opened.'
      } catch (err) {
        openError = messageOf(err, 'The page could not be opened.')
      }
      if (isCurrent(scope)) setState({ kind: 'done', page, relOutput: written.relOutput, openError })
    } catch (err) {
      if (isCurrent(scope)) setState({ kind: 'failed', message: messageOf(err, 'The sprint page could not be written.') })
    }
  }

  return (
    <div data-testid="sprint-pages" className="text-xs text-slate-600">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={running} onClick={() => write('planning')} className={PANEL_BUTTON}>
          {state.kind === 'running' && state.page === 'planning' ? 'Working…' : PAGE_LABEL.planning}
        </button>
        <button type="button" disabled={running} onClick={() => write('review')} className={PANEL_SECONDARY_BUTTON}>
          {state.kind === 'running' && state.page === 'review' ? 'Working…' : PAGE_LABEL.review}
        </button>
      </div>
      <p className="mt-1 text-slate-500">Reports stay on this computer; they are not shared with the team.</p>
      {state.kind === 'failed' && <PanelError message={state.message} />}
      {state.kind === 'done' && (
        <p data-testid="sprint-page-result" className="mt-1">{PAGE_LABEL[state.page]} written: <span className="font-mono">{state.relOutput}</span></p>
      )}
      {state.kind === 'done' && state.openError && <PanelError message={state.openError} />}
    </div>
  )
}
