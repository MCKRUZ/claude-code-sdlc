// Sprint review / close (togo-command-center.md §3.5; Build view "Closing" while a sprint is
// active, drawn ABOVE the unchanged `FeatureCompleteScreen` — the host renders that beneath this
// as `children`; a lazy chunk). Header; Outcomes = the scorecard's fields in `--text-metric`, "no
// data" when null; Kept = the slate rows the plugin reports `merged`; Open = the rest, each with
// Carry or Drop and a REQUIRED reason and — once Carry is picked — the Carry-to picker over the
// non-closed sprints (or "create S09 first →" opening `new`); `sprint.py close` takes ONE
// `--carry-to`, so every row's picker is bound to the same target and says so; "Close the sprint"
// builds ONE `close` request for the
// dialog; Decisions = the open ones with Decide (`decideDecision`). No count of this screen's own
// ever greys the button — the plugin's exit-1 text names an undecided spec by id.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Flag, Forward } from 'lucide-react'
import type { CommandCenter, DecisionRow, SprintSlateRow, SprintView } from '../../shared/types'
import { createSprintFirst, NO_ACTOR, NO_DATA } from '../../shared/reasons'
import { businessDays, sprintStateChip } from '../../shared/sprintModel'
import { Button, Chip, Eyebrow, PageHeader, Select, Textarea } from '../ui'
import { CcEmptyFigure } from './brand/figures'
import { CloseSprintDialog, closeRequest, type CloseDecision } from './CloseSprintDialog'
import { denominatorText, isDora, NONE_RECORDED, scorecardMeasures, shownValue, type ScorecardMeasure } from './ExplainScorecard'
import { BreakableField } from './fieldName'
import { riskTone } from './planning/planningModel'

export interface SprintCloseProps {
  projectPath: string
  onNewSprint?: (suggestedId: string) => void
  /** Bumped by the host after a write elsewhere landed exit 0 (the omnibar, "Refresh this screen"): re-read. */
  refreshKey?: number
  /** The unchanged FeatureCompleteScreen, rendered beneath. */
  children?: ReactNode
}

/** "S09" after "S08" — a SUGGESTION for the `new` dialog's field, never a fact shown as the plugin's. */
export function nextSprintId(current: string): string {
  const n = Number(current.replace(/^S/, ''))
  return `S${String(n + 1).padStart(Math.max(2, current.length - 1), '0')}`
}

export function SprintClose({ projectPath, onNewSprint, refreshKey = 0, children }: SprintCloseProps) {
  const [center, setCenter] = useState<CommandCenter | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloads, setReloads] = useState(0)
  const reload = useCallback(() => setReloads((n) => n + 1), [])
  const [decisions, setDecisions] = useState<Record<string, CloseDecision>>({})
  const [carryTo, setCarryTo] = useState<string>('')
  /** The sprint this screen is closing, pinned on first read: creating the carry target (S08)
   * mid-flow makes IT the plugin's active sprint, and the screen must not swap to it. When the
   * active sprint differs, the pinned one is read by id (`sprint.py status --sprint`). */
  const [pinned, setPinned] = useState<string | null>(null)
  const [pinnedView, setPinnedView] = useState<SprintView | null>(null)
  const [dialog, setDialog] = useState(false)
  const [resolutions, setResolutions] = useState<Record<string, string>>({})
  const [decided, setDecided] = useState<Record<string, string>>({})

  useEffect(() => {
    let live = true
    window.studio.getCommandCenter(projectPath).then(async (c) => {
      if (!live) return
      setCenter(c); setError(null)
      const active = c.sprint.data?.sprint?.id ?? null
      const keep = pinned ?? active
      if (pinned === null) setPinned(active)
      if (keep && active !== keep) {
        const v = await window.studio.getSprintStatus(projectPath, keep)
        if (live) setPinnedView(v.ok ? v : null)
      } else if (live) setPinnedView(null)
    }).catch((e) => { if (live) setError(e instanceof Error ? e.message : 'The sprint could not be read.') })
    return () => { live = false }
    // `pinned` is read, never a trigger: it is set by this effect's first run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, reloads, refreshKey])

  const view = pinnedView ?? center?.sprint.data ?? null
  const sprint = view?.sprint ?? null
  const kept = useMemo(() => (view?.slate ?? []).filter((r) => r.status === 'merged'), [view])
  const open = useMemo(() => (view?.slate ?? []).filter((r) => r.status !== 'merged'), [view])
  const later = useMemo(() => (center?.sprints.data?.sprints ?? []).filter((s) => s.state !== 'closed' && s.id !== sprint?.id), [center, sprint])
  const undecided = open.filter((r) => !decisions[r.id]?.kind).map((r) => r.id)
  const request = sprint ? closeRequest(sprint.id, carryTo || null, decisions) : null
  const actor = center?.actor ?? null
  const card = center?.scorecard.data ?? null

  const decide = async (d: DecisionRow) => {
    const result = await window.studio.decideDecision(projectPath, d.id, resolutions[d.id] ?? '')
    setDecided((m) => ({ ...m, [d.id]: result.ok ? `decided ${result.decided} by ${result.by}` : result.stderr }))
    if (result.ok) reload()
  }

  // The screen beneath (FeatureCompleteScreen) is never withheld by this screen's own read.
  if (error) return <div data-testid="sprint-close" className="space-y-8"><p role="alert" className="text-sm text-status-error-ink">{error}</p>{children}</div>
  if (!center) return <div data-testid="sprint-close" className="space-y-8"><p role="status" aria-busy="true" className="text-sm text-ink-3">Reading the sprint…</p>{children}</div>

  return (
    <div data-testid="sprint-close" className="space-y-8">
      {!sprint ? (
        <div className="flex max-w-xl flex-col items-start gap-2 rounded-xl border border-dashed border-line-2 px-5 py-6">
          <CcEmptyFigure figure="no-sprint" />
          <p className="text-[13px] leading-[18px] text-ink-2">{view?.note ?? center.sprint.error ?? 'no data — the plugin reports no active sprint to close'}</p>
          <p className="text-xs text-ink-3">{center.sprint.source}</p>
        </div>
      ) : (
        <>
          <PageHeader eyebrow={<>Build · Closing · <span className="font-mono">{sprint.id}</span></>} title={<><span className="font-mono tabular-nums">{sprint.id}</span> — {sprint.goal || 'no goal recorded'}</>}
            lede={<span><Chip tone={sprintStateChip(sprint.state).tone} casing="state" dot={sprintStateChip(sprint.state).dot} data-testid="sprint-state" className={sprintStateChip(sprint.state).muted ? 'text-ink-3' : undefined}>{sprintStateChip(sprint.state).label}</Chip> <span className="font-mono text-ident">{sprint.start} → {sprint.end}</span> · {sprint.days.remaining === null ? 'dates unreadable' : `${businessDays(sprint.days.remaining)} remaining`}</span>}
            actions={<Button variant="primary" icon={Flag} data-write="" disabled={!actor || sprint.state === 'closed'} disabledReason={!actor ? NO_ACTOR : sprint.state === 'closed' ? `closed by ${sprint.closedBy || 'no name recorded'}` : undefined} onClick={() => setDialog(true)}>Close the sprint</Button>} />

          {/* The same two labelled rows steering mode draws — Outcomes, then Delivery with the escaped
              bugs — at the screen's size: one voice for the committee's room and the team's close. The
              grid measures the screen (a container query), not the window the chat aside shares. */}
          <section aria-label="Outcomes" data-testid="close-outcomes" className="@container">
            {/* Provenance is a line a person can type: mono, lower-case, never the eyebrow's caps
                ("SCORECARD.PY REPORT --JSON" in the v13 review shot). */}
            <Eyebrow as="h3">How it went · <span className="font-mono normal-case tracking-normal text-ink-3" data-source="">{center.scorecard.source}</span></Eyebrow>
            {!card ? <p className="mt-2 text-sm text-ink-3">{NO_DATA} — {center.scorecard.error ?? 'the scorecard was not read'}</p> : (
              <div className="mt-2 space-y-4">
                <OutcomeGroup label="Outcomes" group="outcomes" measures={scorecardMeasures(card).filter((m) => !isDora(m))} />
                <OutcomeGroup label="Delivery" group="delivery" measures={scorecardMeasures(card).filter(isDora)}>
                  <li className="rounded-[10px] border border-line-1 bg-surface-1 px-4 py-3" data-outcome="escaped_bugs[]">
                    <Eyebrow>Bugs that got through</Eyebrow>
                    {card.escaped_bugs.length === 0 ? (
                      <p className="mt-1 text-sm font-medium text-ink-3">{NONE_RECORDED}</p>
                    ) : (
                      <ul className="mt-1 space-y-0.5 text-sm text-ink-1" role="list">
                        {card.escaped_bugs.map((b, i) => <li key={i}>{String(b.summary ?? b.which_check ?? 'a bug')}</li>)}
                      </ul>
                    )}
                    <p className="mt-1 font-mono text-[10px] text-ink-3">escaped_bugs[]</p>
                  </li>
                </OutcomeGroup>
              </div>
            )}
          </section>

          <section aria-label="Kept" data-testid="close-kept">
            <Eyebrow as="h3">Kept · merged <span className="font-mono normal-case tracking-normal">{kept.length}</span></Eyebrow>
            {kept.length === 0 ? <p className="mt-2 text-sm text-ink-3">nothing merged in this sprint</p> : <ul className="mt-2 space-y-1" role="list">{kept.map((r) => <li key={r.id} data-testid="close-row" data-spec={r.id} data-kept="" className="text-sm text-ink-1"><span className="font-mono text-ident text-ink-2">{r.id}</span> {r.name}</li>)}</ul>}
          </section>

          <section aria-label="Open" data-testid="close-open" className="space-y-3">
            <Eyebrow as="h3">Open · carry or drop, with a reason <span className="font-mono normal-case tracking-normal">{open.length}</span></Eyebrow>
            {open.length === 0 ? <p className="text-sm text-ink-3">every slated spec is merged</p> : (
              <ul className="space-y-2" role="list">{open.map((r) => (
                <OpenRow key={r.id} row={r} decision={decisions[r.id] ?? { kind: null, reason: '' }} onChange={(d) => setDecisions((m) => ({ ...m, [r.id]: d }))}
                  carryTo={carryTo} onCarryTo={setCarryTo} later={later} createFirst={createSprintFirst(nextSprintId(sprint.id))} onCreateSprint={onNewSprint ? () => onNewSprint(nextSprintId(sprint.id)) : undefined} />
              ))}</ul>
            )}
          </section>

          <section aria-label="Decisions" data-testid="close-decisions">
            <Eyebrow as="h3">Decisions · <span className="font-mono normal-case tracking-normal text-ink-3" data-source="">{center.decisions.source}</span></Eyebrow>
            {!center.decisions.data ? <p className="mt-2 text-sm text-ink-3">{center.decisions.error ?? NO_DATA}</p>
              : center.decisions.data.openDecisions.length === 0 ? <p className="mt-2 text-sm text-ink-3">no open decisions</p> : (
                <ul className="mt-2 space-y-2" role="list">
                  {center.decisions.data.openDecisions.map((d) => (
                    <li key={d.id} data-decision={d.id} data-overdue={d.overdue ? '' : undefined} className={`rounded-[10px] border p-3 text-sm ${d.overdue ? 'border-today-late-line bg-today-late-bg' : 'border-line-1 bg-surface-1'}`}>
                      <p><span className="font-mono text-ident text-ink-2">{d.id}</span> {d.decision} <span className="text-xs text-ink-3">· owner {d.owner} · due {d.clockDue ?? d.due}{d.overdue ? ' · overdue' : ''}</span></p>
                      {decided[d.id] ? <p className="mt-1 text-xs text-ink-2">{decided[d.id]}</p> : (
                        <div className="mt-2 flex flex-wrap items-end gap-2">
                          <Textarea size="sm" rows={1} aria-label={`Resolution for ${d.id}`} className="max-w-md" placeholder="the resolution the plugin records" value={resolutions[d.id] ?? ''} onChange={(e) => setResolutions((m) => ({ ...m, [d.id]: e.target.value }))} />
                          <Button size="sm" data-write="" disabled={!actor || !(resolutions[d.id] ?? '').trim()} disabledReason={!actor ? NO_ACTOR : 'a resolution is required'} onClick={() => decide(d)}>Decide</Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
          </section>

          {/* Mounted only while open: a dismissed answer (exit 1, the undecided spec named) must not
              greet the next attempt as if it were this one's. */}
          {request && dialog && <CloseSprintDialog open projectPath={projectPath} request={request} actor={actor} undecided={undecided} missingCarryTo={Object.keys(request.carry).length > 0 && !request.carryTo} onClose={() => setDialog(false)} onClosed={reload} />}
        </>
      )}
      {children}
    </div>
  )
}

/** One labelled row of outcome tiles (the shape steering mode draws, at this screen's size): the
 * number in `--text-metric`, "no data" as words, a rate's base under it, the field on its own
 * mono line — five across once the screen is wide enough, so a row never leaves an orphan. */
function OutcomeGroup({ label, group, measures, children }: { label: string; group: string; measures: ScorecardMeasure[]; children?: ReactNode }) {
  return (
    <div data-outcome-group={group}>
      <p className="text-xs text-ink-3">{label}</p>
      <ul className="mt-1 grid grid-cols-2 gap-3 @min-[640px]:grid-cols-3 @min-[960px]:grid-cols-5" role="list">
        {measures.map((m) => {
          const { shown, unit, words } = shownValue(m)
          return (
            <li key={m.id} className="rounded-[10px] border border-line-1 bg-surface-1 px-4 py-3" data-outcome={m.field}>
              <Eyebrow>{m.label}</Eyebrow>
              {shown === null ? <p className="mt-1 text-sm font-medium text-ink-3" data-no-data="">{words ?? 'no data'}</p> : <p className="mt-1 text-metric tabular-nums text-ink-1" data-stat={m.field}>{shown}<span className="ml-1 text-sm font-medium text-ink-3">{unit}</span></p>}
              {shown !== null && denominatorText(m.denominator) && <p className="font-mono text-ident text-ink-3" data-denominator={m.denominator!.field}>{denominatorText(m.denominator)}</p>}
              {/* The field breaks at its own `_` / `.` seams first (v13: `…_media / n_hours` split mid-word here). */}
              <p className="mt-1 font-mono text-[10px] text-ink-3 [overflow-wrap:anywhere]" data-field-name={m.field}><BreakableField field={m.field} /></p>
            </li>
          )
        })}
        {children}
      </ul>
    </div>
  )
}

/** One open spec: Carry / Drop, then the reason the plugin records and — for a carry — the target
 * sprint. `sprint.py close` takes ONE `--carry-to`, so every row's picker reads and writes the same
 * target; the row says so rather than letting two rows look independent. */
function OpenRow({ row, decision, onChange, carryTo, onCarryTo, later, createFirst, onCreateSprint }: {
  row: SprintSlateRow; decision: CloseDecision; onChange: (d: CloseDecision) => void
  carryTo: string; onCarryTo: (id: string) => void; later: ReadonlyArray<{ id: string; state: string | null }>
  createFirst: string; onCreateSprint?: () => void
}) {
  return (
    <li data-testid="close-row" data-spec={row.id} data-decision-kind={decision.kind ?? 'undecided'} className="rounded-[10px] border border-line-1 bg-surface-1 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono text-ident text-ink-2">{row.id}</span><span className="text-ink-1">{row.name}</span>
        <Chip tone="neutral" casing="state">{row.status}</Chip><Chip tone={riskTone(row.risk)} casing="identifier">{row.risk}</Chip>
        {/* Two plain toggles, neither pressed until a person decides — a segmented control would
            draw its thumb on the first option and read as a decision already taken. */}
        <div role="group" aria-label={`Decision for ${row.id}`} className="ml-auto inline-flex gap-1">
          {(['carry', 'drop'] as const).map((kind) => (
            <Button key={kind} size="sm" variant={decision.kind === kind ? 'primary' : 'secondary'} aria-pressed={decision.kind === kind} icon={kind === 'carry' ? Forward : undefined} onClick={() => onChange({ ...decision, kind })}>
              {kind === 'carry' ? 'Carry' : 'Drop'}
            </Button>
          ))}
        </div>
      </div>
      {decision.kind === 'carry' && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-2">
          {later.length > 0 ? (
            <label className="flex items-center gap-2">Carry to
              <Select size="sm" value={carryTo} onChange={onCarryTo} options={[{ value: '', label: 'choose a sprint' }, ...later.map((s) => ({ value: s.id, label: `${s.id} · ${s.state ?? 'state unreadable'}` }))]} aria-label="Carry to" />
            </label>
          ) : (
            <Button size="sm" variant="ghost" icon={Forward} data-write="" disabled={!onCreateSprint} disabledReason={onCreateSprint ? undefined : createFirst} onClick={onCreateSprint}>{createFirst}</Button>
          )}
          <span className="text-ink-3" title="sprint.py close --carry-to takes one sprint">one target for every carried spec</span>
        </div>
      )}
      {decision.kind && <Textarea size="sm" rows={1} className="mt-2" aria-label={`Reason for ${decision.kind === 'carry' ? 'carrying' : 'dropping'} ${row.id}`} placeholder="required — the plugin records it in the ## Close table" value={decision.reason} onChange={(e) => onChange({ ...decision, reason: e.target.value })} />}
    </li>
  )
}

export default SprintClose
