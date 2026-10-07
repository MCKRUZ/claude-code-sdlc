// Sprint planning (togo-command-center.md §3.2; Build view "Planning", `g p`; a lazy chunk).
// Three columns on `plan-backlog` / `plan-slate` / `plan-says`: the refined backlog, the slate in
// the plugin's build order, and what the plugin says — with its deterministic proposal and one
// Commit that runs the verbs in order. Reads: `getCommandCenter` (sprint, sprints, board, roster,
// capabilities, actor), `getReadinessAll`, `getSlateProposal`, and `getSprintStatus(prev)` for last
// sprint's mix. Writes go through `runSprintVerb` / `assignRoles` / `confirmTier`; after any exit 0
// every read here is re-run — never before. The renderer joins nothing: every list is a filter or
// an id lookup over plugin rows (`planningModel.ts`).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BoardRow, CommandCenter, ReadinessAll, SlateProposal, SprintMixTier, SprintVerbResult, SprintView } from '../../../shared/types'
import { CAPABILITIES, newerPlugin, NO_ACTOR, ORDER_ARRIVES_ON_COMMIT, SPRINT_FIELDS_FIXED, WAITING_FOR_PLUGIN_ANSWER } from '../../../shared/reasons'
import { businessDays, sprintStateChip } from '../../../shared/sprintModel'
import { Button, Chip, Eyebrow, PageHeader, Segmented, Textarea } from '../../ui'
import { useEnter } from '../../motion/useEnter'
import { SceneSlot } from '../../scenes/core/SceneSlot'
import { CcEmptyFigure } from '../brand/figures'
import { BacklogColumn } from './BacklogColumn'
import { SlateColumn } from './SlateColumn'
import { PluginSaysColumn } from './PluginSaysColumn'
import { effectOf, type IntentMatch } from '../../palette/intents'
import { CommitDialog } from './CommitDialog'
import { commitSprint, type CommitStep } from './commitSprint'
import { candidateRows, orderBacklog, previousSprintId, readinessById } from './planningModel'
import { planningSceneData, type PlanningSurface } from './planningSceneData'
import { useSprintVerb } from './VerbResult'

export interface PlanningProps {
  projectPath: string
  onOpenSpec: (row: BoardRow) => void
  /** Opens the `new` sprint dialog (the host's VerbDialog). Without it the empty state shows the plugin's note alone. */
  onNewSprint?: () => void
  /** The host's VerbDialog (§3.6): "Apply proposal" previews its one `slate` line there and runs
   * only on Confirm. Without it the column runs the verb directly and shows the result inline. */
  onIntent?: (match: IntentMatch) => void
  /** Bumped by the host after a write elsewhere landed exit 0 (the omnibar, "Refresh this screen"): re-read. */
  refreshKey?: number
}

const SURFACES: { value: PlanningSurface; label: string }[] = [{ value: 'slate', label: 'Slate' }, { value: 'proposal', label: 'Proposal' }]

export function Planning({ projectPath, onOpenSpec, onNewSprint, onIntent, refreshKey = 0 }: PlanningProps) {
  const root = useRef<HTMLDivElement>(null)
  useEnter(root, 'rise', { key: projectPath })
  const [reloads, setReloads] = useState(0)
  const reload = useCallback(() => setReloads((n) => n + 1), [])
  const [center, setCenter] = useState<CommandCenter | null>(null)
  const [readinessAll, setReadinessAll] = useState<ReadinessAll | null>(null)
  const [proposal, setProposal] = useState<SlateProposal | null>(null)
  const [lastSprint, setLastSprint] = useState<{ id: string; mix: Record<string, SprintMixTier> } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [surface, setSurface] = useState<PlanningSurface>('slate')
  const [steps, setSteps] = useState<CommitStep[]>([])
  const [committing, setCommitting] = useState(false)
  /** The Commit dialog: open with the override reason the column collected; null = closed. */
  const [commit, setCommit] = useState<{ override?: { reason: string } } | null>(null)
  const [lastResult, setLastResult] = useState<{ spec: string; result: SprintVerbResult } | null>(null)
  const [editingGoal, setEditingGoal] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const c = await window.studio.getCommandCenter(projectPath)
        if (!live) return
        setCenter(c)
        const caps = c.capabilities
        const has = (cap: string) => caps.includes(cap)
        const sprintId = c.sprint.data?.sprint?.id ?? null
        const [all, prop, prev] = await Promise.all([
          has(CAPABILITIES.readinessAll) ? window.studio.getReadinessAll(projectPath) : Promise.resolve(null),
          sprintId ? window.studio.getSlateProposal(projectPath, sprintId) : Promise.resolve(null),
          (() => { const id = previousSprintId(c.sprints.data); return id ? window.studio.getSprintStatus(projectPath, id).then((v) => (v.ok ? { id, mix: v.mix } : null)) : Promise.resolve(null) })(),
        ])
        if (!live) return
        setReadinessAll(all); setProposal(prop); setLastSprint(prev); setError(null)
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : 'The planning screen could not be read.')
      }
    })()
    return () => { live = false }
  }, [projectPath, reloads, refreshKey])

  const settled = useCallback((result: SprintVerbResult) => { if (result.exitCode === 0) reload() }, [reload])
  const verb = useSprintVerb(projectPath, settled)

  const view: SprintView | null = center?.sprint.data ?? null
  const caps = center?.capabilities
  const has = (cap: string) => caps === undefined || caps.includes(cap)
  const actor = center?.actor ?? null
  const writeReason = !center ? WAITING_FOR_PLUGIN_ANSWER : !actor ? NO_ACTOR : !has(CAPABILITIES.sprintWrite) ? newerPlugin(CAPABILITIES.sprintWrite) : undefined
  const people = center?.roster.data?.people ?? []
  const readiness = useMemo(() => readinessById(readinessAll), [readinessAll])
  const backlog = useMemo(() => orderBacklog(candidateRows(center?.board.data), readiness), [center, readiness])
  const boardById = useMemo(() => new Map((center?.board.data?.rows ?? []).map((r) => [r.spec, r])), [center])
  const scene = useMemo(() => planningSceneData(view, proposal, surface), [view, proposal, surface])
  const sprint = view?.sprint ?? null

  const runFor = async (spec: string, request: Parameters<typeof verb.run>[0]) => {
    const result = await verb.run(request)
    setLastResult({ spec, result })
  }
  const assign = async (row: BoardRow, roles: { developer?: string; checker?: string }) => {
    const result = await window.studio.assignRoles(projectPath, row.path, roles)
    setLastResult({ spec: row.spec, result: { ok: result.ok, exitCode: result.ok ? 0 : 1, refused: false, stdout: result.message ?? '', stderr: result.refusal?.message ?? '', argv: ['spec_transition.py', '--spec', row.path, 'assign', ...Object.entries(roles).flatMap(([k, v]) => [`--${k}`, v ?? ''])], verb: 'slate' } })
    if (result.ok) reload()
  }
  /** The dialog's Confirm: the sequence runs HERE, never on the column's button. */
  const runCommit = async () => {
    if (!sprint || !commit) return
    setCommitting(true); setSteps([])
    try {
      // No read reports `risk_confirmed_by` in this build, so no tier can honestly be called
      // unconfirmed: the decision step records that rather than guessing.
      await commitSprint(window.studio, {
        projectPath, sprintId: sprint.id, slated: view!.slate.map((r) => r.id), specs: view!.slate.map((r) => r.id), override: commit.override,
        unconfirmed: [], owner: actor?.name ?? null, confirmTierAvailable: has(CAPABILITIES.confirmTier),
      }, (step) => setSteps((s) => [...s, step]))
    } finally { setCommitting(false) }
  }
  /** Closing the dialog re-reads if anything ran: a `slate` that landed before `ready` refused is still a change. */
  const closeCommit = () => { setCommit(null); if (steps.length > 0) reload() }
  const applyProposal = (specs: string[]) => {
    if (!sprint) return
    if (onIntent) {
      // `effect` is the verb's own documented write (intents.ts `effectOf`), never this screen's guess.
      const intent: IntentMatch['intent'] = { kind: 'sprint', request: { verb: 'slate', sprint: sprint.id, specs } }
      onIntent({
        intent,
        title: `Apply the plugin's proposal to ${sprint.id}`,
        subtitle: 'sprint.py slate --json proposal[] — deterministic, id-order fill; one slate verb for the whole set',
        effect: effectOf(intent),
      })
    } else {
      runFor(sprint.id, { verb: 'slate', sprint: sprint.id, specs })
    }
  }

  if (error) return <p role="alert" className="text-sm text-status-error-ink">{error}</p>
  if (!center) return <p role="status" aria-busy="true" className="text-sm text-ink-3">Reading the sprint…</p>

  if (!sprint) {
    return (
      <div ref={root} data-testid="planning" className="space-y-4">
        <PageHeader eyebrow="Build · Planning" title="Planning" lede="The refined backlog, the slate in the plugin's build order, and what the plugin says." />
        <div className="flex max-w-xl flex-col items-start gap-2 rounded-xl border border-dashed border-line-2 px-5 py-6">
          <CcEmptyFigure figure="no-sprint" />
          <p className="text-[13px] leading-[18px] text-ink-2">{view?.note ?? center.sprint.error ?? 'no data — the plugin reports no sprint'}</p>
          <p className="text-xs text-ink-3">{center.sprint.source}</p>
          {onNewSprint && <Button variant="primary" size="sm" data-write="" onClick={onNewSprint}>New sprint</Button>}
        </div>
      </div>
    )
  }

  const days = sprint.days
  return (
    <div ref={root} data-testid="planning" className="space-y-4">
      <header className="space-y-2" data-testid="planning-header">
        <Eyebrow>Build · Planning · <span className="font-mono">{sprint.id}</span></Eyebrow>
        <h2 className="text-sprint-title text-ink-1" data-page-heading tabIndex={-1}>
          <span className="font-mono tabular-nums">{sprint.id}</span> — {sprint.goal || <span className="text-ink-3">no goal recorded</span>}
        </h2>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] leading-[18px] text-ink-2">
          <Chip tone={sprintStateChip(sprint.state).tone} casing="state" dot={sprintStateChip(sprint.state).dot} data-testid="sprint-state" className={sprintStateChip(sprint.state).muted ? 'text-ink-3' : undefined}>{sprintStateChip(sprint.state).label}</Chip>
          <span className="font-mono text-ident">{sprint.start || '—'} → {sprint.end || '—'}</span>
          <span data-stat="days">{days.total === null ? 'dates unreadable' : `${businessDays(days.total)} · ${days.elapsed} elapsed · ${days.remaining} remaining`}</span>
          <span data-stat="target">target {sprint.target === null ? 'no data' : `${sprint.target} specs`}</span>
          <span data-stat="wip">WIP {view!.wip.inFlight === null ? 'no data' : `${view!.wip.inFlight} of ${view!.wip.cap === null ? 'cap not set' : view!.wip.cap}`}</span>
          {editingGoal === null
            ? <Button size="sm" variant="ghost" data-write="" disabled={!has(CAPABILITIES.sprintEdit) || Boolean(writeReason)} disabledReason={!has(CAPABILITIES.sprintEdit) ? newerPlugin(CAPABILITIES.sprintEdit) : writeReason} onClick={() => setEditingGoal(sprint.goal)}>Edit goal</Button>
            : null}
          <Button size="sm" variant="ghost" disabled disabledReason={SPRINT_FIELDS_FIXED}>Edit target · mix · dates</Button>
        </p>
        {editingGoal !== null && (
          <form className="flex max-w-xl flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (editingGoal.trim()) { runFor(sprint.id, { verb: 'edit', sprint: sprint.id, goal: editingGoal.trim() }); setEditingGoal(null) } }}>
            <Textarea size="sm" rows={2} aria-label="Sprint goal" value={editingGoal} onChange={(e) => setEditingGoal(e.target.value)} />
            <div className="flex gap-2"><Button size="sm" type="submit" variant="primary" data-write="">Save goal</Button><Button size="sm" variant="ghost" onClick={() => setEditingGoal(null)}>Cancel</Button></div>
          </form>
        )}
        {view!.carriedIn.length > 0 && (
          <p className="text-xs text-ink-2" data-testid="carried-in">
            <span className="text-ink-3">Carried in: </span>
            {view!.carriedIn.map((c) => <span key={c.spec} className="mr-3"><span className="font-mono text-ident">{c.spec}</span> from <span className="font-mono text-ident">{c.fromSprint}</span> — {c.reason}</span>)}
          </p>
        )}
        {lastResult?.spec === sprint.id && <p className="text-xs text-ink-2">{lastResult.result.stdout || lastResult.result.stderr}</p>}
      </header>

      {/* Three columns measured against the screen's own width (a container query, not the
          window: the chat aside takes 380 px of the window when open). The slate is the widest
          — `1.4fr` against the backlog's `1fr`, the plugin's column fixed at 320 (visual §4) —
          and the threshold is the sum of the three minimums (300 + 400 + 320 + two 16 px gaps);
          below it the columns stack with the slate first (visual §4 "stacked slate-first"). */}
      <div className="@container">
        <div className="grid gap-4 @min-[1056px]:grid-cols-[minmax(300px,1fr)_minmax(400px,1.4fr)_320px]" data-testid="planning-columns">
          <div className="grid min-w-0 @min-[1056px]:order-none">
            <BacklogColumn projectPath={projectPath} rows={backlog} readiness={readiness} people={people} me={actor?.name ?? null} writeReason={writeReason} canConfirm={has(CAPABILITIES.confirmTier)} busy={verb.busy} lastResult={lastResult} onAddToSlate={(spec) => runFor(spec, { verb: 'slate', sprint: sprint.id, specs: [spec] })} onOpenSpec={onOpenSpec} onSettled={reload} />
          </div>
          <div className="order-first grid min-w-0 @min-[1056px]:order-none" data-slate-first="">
            <SlateColumn view={view!} boardById={boardById} readiness={readiness} people={people} me={actor?.name ?? null} lastSprint={lastSprint} writeReason={writeReason} canAssign={caps === undefined ? undefined : has(CAPABILITIES.assignRoles)} busy={verb.busy} lastResult={lastResult} onUnslate={(spec, reason) => runFor(spec, { verb: 'unslate', spec, reason })} onAssign={assign} onOpenSpec={onOpenSpec} />
          </div>
          <div className="grid min-w-0">
            <PluginSaysColumn view={view!} proposal={proposal} writeReason={writeReason} busy={verb.busy} steps={commit ? [] : steps} committing={committing} onApplyProposal={applyProposal} onCommit={(override) => { setSteps([]); setCommit({ override }) }} />
          </div>
        </div>
      </div>

      {/* The constellation below the columns: the slate is the screen, the figure its second surface. */}
      <div className="space-y-1">
        <Segmented<PlanningSurface> label="Planning graph" size="sm" options={SURFACES} value={surface} onChange={setSurface} />
        {scene && <SceneSlot id="constellation-sprint" data={scene} onActivate={(id) => { const row = boardById.get(id); if (row) onOpenSpec(row) }} />}
        {scene?.proposed && <p className="text-xs text-ink-3" data-testid="proposal-caption">{ORDER_ARRIVES_ON_COMMIT}</p>}
      </div>
      {commit && (
        <CommitDialog open sprintId={sprint.id} slated={view!.slate.map((r) => r.id)} specs={view!.slate.map((r) => r.id)} override={commit.override} actor={actor}
          confirmTierAvailable={has(CAPABILITIES.confirmTier)} steps={steps} committing={committing} onConfirm={runCommit} onClose={closeCommit} />
      )}
    </div>
  )
}

export default Planning
