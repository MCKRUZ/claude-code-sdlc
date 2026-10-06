import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import type { BoardRow, SprintView } from '../../shared/types'
import {
  businessDays, decisionsLabel, emptyMessage, mixChips, NO_DATA, nextUpLabel, readinessLabel,
  remainingLabel, slateToBoardRow, SPRINT_CAPABILITY, stateChip, targetLabel, wipLabel,
} from '../../shared/sprintModel'
import { PanelError, useLoaded } from './activityPanelBits'
import { useStageReadiness } from './StageReadinessContext'
import { Button, Card, EmptyState, Eyebrow, SkeletonRows } from '../ui'
import { Flip } from 'gsap/Flip'
import { flipStore } from '../motion/flipStore'
import { motion } from '../motion/motion'
import { useEnter } from '../motion/useEnter'
import { SceneSlot } from '../scenes/core/SceneSlot'
import { backlogStore } from '../stores/backlogStore'
import { constellationFromSprint } from './sprintSceneData'
import { useListReveal } from './screenMotion'
import { SlateTable, SprintChip } from './SprintSlateTable'
import { SprintPages } from './SprintPages'
import { STICKY_HEADER_CLASS, useStuck } from './useStuck'

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
  projectPath, sprintId, capabilities, compact = false, onOpenSpec, onView,
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
  /** The view as fetched (null while loading, failed or gated) — how `SprintScreen` feeds the
   * constellation slot and the backlog store without a second subprocess. */
  onView?: (view: SprintView | null) => void
}) {
  const testId = compact ? 'sprint-panel' : 'sprint-board'
  if (capabilities !== undefined && !capabilities.includes(SPRINT_CAPABILITY)) {
    return (
      <div data-testid={testId} className={compact ? 'mt-2' : 'space-y-4'}>
        {!compact && <h2 className="text-xl text-ink-1">Sprint</h2>}
        <p data-testid="activity-disabled-reason" className="text-xs text-ink-3">needs a newer plugin: lacks {SPRINT_CAPABILITY}</p>
      </div>
    )
  }
  return <SprintBoardBody projectPath={projectPath} sprintId={sprintId} compact={compact} onOpenSpec={onOpenSpec} onView={onView} testId={testId} />
}

/** The full view as App mounts it: the plugin's capabilities come from the stage readiness Frame
 * already holds, so the view can say "needs a newer plugin" before it asks the plugin anything.
 *
 * The constellation slot sits ABOVE the board and outside `[data-testid=sprint-board]`, so the
 * scene host's Graph / Table toggle never joins the three buttons the sprint spec counts inside
 * it. No `table` prop is passed on purpose: the SlateTable below IS the table surface (the sprint
 * spec counts its NOT READY cells, and a second table would double them), so the scene shows its
 * one-line pointer at the list instead. */
export function SprintScreen({ projectPath, onOpenSpec }: { projectPath: string; onOpenSpec: (row: BoardRow) => void }) {
  const { readiness } = useStageReadiness()
  const [view, setView] = useState<SprintView | null>(null)
  const root = useRef<HTMLDivElement>(null)
  useEnter(root, 'rise', { key: projectPath })

  const scene = useMemo(() => (view && view.sprint ? constellationFromSprint(view) : null), [view])
  // Row #8 from a plate: stash the plate's position under the same `spec:<id>` the Board row uses,
  // so the spec view's title Flips from it exactly as it does from a list row. Nothing stashed
  // (motion off, or the activation came from the keyboard on the table) → the view simply appears.
  const activate = useCallback((id: string) => {
    const row = view?.slate.find((r) => r.id === id)
    if (!row) return
    const plate = root.current?.querySelector<HTMLElement>(`[data-plate-id="${CSS.escape(id)}"] button`)
    if (plate && motion.enabled()) flipStore.stash(`spec:${id}`, Flip.getState(plate), plate)
    onOpenSpec(slateToBoardRow(row))
  }, [view, onOpenSpec])

  // One fetch, three readers: the board draws it, the slot gets the constellation shape, and the
  // backlog store holds the slate for the palette's "#" group.
  useEffect(() => {
    if (view) backlogStore.setSlate(projectPath, view.slate)
  }, [projectPath, view])

  return (
    <div ref={root} className="space-y-4">
      {/* The board's sticky title row below paints a 24 px blur band above itself (`STICKY_HEADER_CLASS`
          `before:-top-6`), which with only the 16 px rhythm gap overpainted the figure's second
          caption line on both surfaces (observatory v4 critique). The extra bottom padding keeps
          the whole band over whitespace, so the caption flows unclipped. */}
      {scene && <div className="pb-3"><SceneSlot id="constellation-sprint" data={scene} onActivate={activate} /></div>}
      <SprintBoard projectPath={projectPath} capabilities={readiness?.capabilities} onOpenSpec={onOpenSpec} onView={setView} />
    </div>
  )
}

function SprintBoardBody({
  projectPath, sprintId, compact, onOpenSpec, onView, testId,
}: {
  projectPath: string; sprintId?: string; compact: boolean; onOpenSpec?: (row: BoardRow) => void
  onView?: (view: SprintView | null) => void; testId: string
}) {
  const [reloads, setReloads] = useState(0)
  const scope = `${projectPath}|${sprintId ?? ''}|${reloads}`
  const loaded = useLoaded(scope, () => window.studio.getSprintStatus(projectPath, sprintId), 'The sprint could not be read.')
  const ready = loaded.kind === 'ready' && loaded.value.ok ? loaded.value : null

  useEffect(() => { onView?.(ready) }, [ready, onView])

  const root = useRef<HTMLDivElement>(null)
  useListReveal(root, ready ? scope : null)
  // The title row is this screen's sticky header (G4-2): flush at rest, a hairline once the
  // slate has scrolled under it. Only the full view has one; the compact panel scrolls with its host.
  const headerRef = useRef<HTMLDivElement>(null)
  useStuck(headerRef)

  return (
    <div ref={root} data-testid={testId} className={compact ? 'mt-2 space-y-2 text-xs text-ink-2' : 'space-y-6'}>
      {!compact && (
        <div ref={headerRef} className={STICKY_HEADER_CLASS}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 data-page-heading tabIndex={-1} className="text-xl text-ink-1">Sprint</h2>
              <p className="mt-1 max-w-[64ch] text-sm text-ink-3">What the team committed to, as the plugin reads it from the specs.</p>
            </div>
            <div className="flex shrink-0 gap-2 pt-0.5">
              <Button size="sm" icon={RefreshCw} onClick={() => setReloads((n) => n + 1)}>Refresh</Button>
            </div>
          </div>
        </div>
      )}
      {loaded.kind === 'loading' && (
        <div aria-busy="true">
          <p role="status" className="text-sm text-ink-4">Reading the sprint…</p>
          {!compact && <SkeletonRows rows={3} className="mt-3" />}
        </div>
      )}
      {loaded.kind === 'failed' && <PanelError message={loaded.message} />}
      {ready && <SprintViewBody view={ready} projectPath={projectPath} compact={compact} onOpenSpec={onOpenSpec} />}
    </div>
  )
}

// --- the view ----------------------------------------------------------------------------------

function SprintViewBody({
  view, projectPath, compact, onOpenSpec,
}: { view: SprintView; projectPath: string; compact: boolean; onOpenSpec?: (row: BoardRow) => void }) {
  const { sprint } = view
  // The kit's one "nothing here, and why" frame (G4-9); the sentence is the plugin's, verbatim,
  // and the testid rides on the frame's root so its text is exactly that sentence.
  if (sprint === null) {
    return <EmptyState data-testid="sprint-empty" title={emptyMessage(view)} />
  }
  const empty = emptyMessage(view)
  return (
    <>
      <SprintHeader view={view} compact={compact} />
      {!compact && view.note && <p className="text-xs text-status-warn-ink">{view.note}</p>}
      {empty ? <EmptyState data-testid="sprint-empty" title={empty} />
        : !compact && <SlateTable rows={view.slate} onOpenSpec={onOpenSpec} />}
      <div className={compact ? 'space-y-1' : 'grid gap-3 md:grid-cols-2'}>
        <Section title="Readiness" testId="sprint-readiness" compact={compact}>
          <p>{readinessLabel(view)}</p>
          {view.hasData && view.readiness.gaps.length > 0 && (
            // One disclosure per spec: the checker's lines are long and near-identical on a fresh
            // slate, so the card lists WHICH specs have gaps and opens to the words on request.
            // The text is the plugin's verbatim either way.
            <ul className="mt-1 space-y-0.5">
              {view.readiness.gaps.map((g) => (
                <li key={g.spec || '(slate)'}>
                  <details>
                    <summary className="cursor-pointer"><span className="font-medium text-ink-1">{g.spec || '(slate)'}</span></summary>
                    <p className="mt-0.5 pl-3 text-ink-2">{': '}{g.gaps.join('; ')}</p>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Verdicts pending" testId="sprint-verdicts" compact={compact}>
          {view.verdictsPending.length === 0 ? <p>{view.hasData ? 'none pending' : NO_DATA}</p> : (
            <ul className="space-y-0.5">
              {view.verdictsPending.map((v) => (
                <li key={`${v.spec}:${v.lane}`}><span className="font-medium text-ink-1">{v.spec}</span> · {v.lane} · {businessDays(v.sinceBusinessDays)}</li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Handoffs open" testId="sprint-handoffs" compact={compact}>
          {view.handoffsOpen.length === 0 ? <p>{view.hasData ? 'none unacknowledged' : NO_DATA}</p> : (
            <ul className="space-y-0.5">
              {view.handoffsOpen.map((h) => (
                <li key={h.spec}><span className="font-medium text-ink-1">{h.spec}</span> → {h.to} · {businessDays(h.sinceBusinessDays)}</li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Next up" testId="sprint-next-up" compact={compact}>
          <p className={view.nextUp ? 'font-medium text-ink-1' : ''}>{nextUpLabel(view)}</p>
          <p className="mt-1">
            <span className="text-ink-3">Build order: </span>
            {view.buildOrder.length > 0 ? view.buildOrder.join(' → ') : NO_DATA}
          </p>
          {view.buildOrder.length > 0 && <p className="text-ink-4">deps, then unblocks-most, then HIGH→LOW, then id</p>}
        </Section>
        {!compact && (
          // Prose from the plugin, never geometry: the constellation shows these words under its
          // figure and draws nothing from them.
          <Section title="Dependency gaps" testId="sprint-dependency-gaps" compact={compact}>
            {view.dependencyGaps.length === 0 ? <p>{view.hasData ? 'none' : NO_DATA}</p> : (
              <ul className="space-y-0.5 text-amber-700">{view.dependencyGaps.map((g) => <li key={g}>{g}</li>)}</ul>
            )}
          </Section>
        )}
        {!compact && (
          <Section title="Decisions" testId="sprint-decisions" compact={compact}>
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
          <Section title="Carried in" testId="sprint-carried-in" compact={compact}>
            {view.carriedIn.length === 0 ? <p>none</p> : (
              <ul className="space-y-0.5">
                {view.carriedIn.map((c) => (
                  <li key={`${c.spec}:${c.fromSprint}`}>
                    <span className="font-medium text-ink-1">{c.spec}</span> from {c.fromSprint || '?'}{c.reason && <>: {c.reason}</>}
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

function SprintHeader({ view, compact }: { view: SprintView; compact: boolean }) {
  const sprint = view.sprint!
  const state = stateChip(sprint.state)
  const remaining = remainingLabel(sprint)
  const chips = mixChips(view.mix)
  const body = (
    <>
      {/* Name, state chip and goal on one baseline; the dates line is a fact row in tabular mono
          (G4-5). `tabular-nums` is inherited, so the mix chips below pick it up from their row. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={compact ? 'font-semibold text-ink-1' : 'text-sm font-semibold text-ink-1'}>Sprint {sprint.id}</span>
        <SprintChip tone={state.tone} testId="sprint-state">{state.label}</SprintChip>
        {sprint.goal && <span className="text-sm text-ink-2">— {sprint.goal}</span>}
      </div>
      <p className="mt-1 font-mono text-xs tabular-nums text-ink-3">
        {sprint.start || '?'} → {sprint.end || '?'}
        {remaining && <> · <span data-testid="sprint-remaining">{remaining}</span></>}
        {' · '}target <span data-testid="sprint-target">{targetLabel(sprint.target)}</span>
        {sprint.boardRef && <> · board: {sprint.boardRef} (manual mapping only)</>}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs tabular-nums">
        <span className="text-ink-3">Mix</span>
        {chips.length === 0 ? <span data-testid="sprint-mix">{NO_DATA}</span>
          : chips.map((c) => <SprintChip key={c.tier} tone="neutral" testId="sprint-mix">{c.label}</SprintChip>)}
        <span className="ml-2 text-ink-3">WIP</span>
        <span data-testid="sprint-wip">{wipLabel(view.wip)}</span>
      </div>
      {view.mixWarnings.length > 0 && (
        // The literal `amber` stays: SprintBoard.test.tsx:104 reads this element's className.
        <ul data-testid="sprint-mix-warnings" className="mt-1 space-y-0.5 text-xs text-amber-700">
          {view.mixWarnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
    </>
  )
  if (compact) return <div data-testid="sprint-header" className="space-y-1">{body}</div>
  return <Card data-testid="sprint-header">{body}</Card>
}

function Section({ title, testId, compact, children }: { title: string; testId: string; compact: boolean; children: ReactNode }) {
  return (
    <Card as="section" data-testid={testId} padding={compact ? 'sm' : 'md'} className="text-xs text-ink-2">
      <Eyebrow as="h3">{title}</Eyebrow>
      <div className="mt-1.5">{children}</div>
    </Card>
  )
}
