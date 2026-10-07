import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import type { BoardRow, SprintView } from '../../shared/types'
import {
  businessDays, decisionsLabel, emptyMessage, groupVerdicts, mixChips, NO_DATA, nextUpLabel, readinessLabel,
  remainingLabel, slateToBoardRow, SPRINT_CAPABILITY, stateChip, targetLabel, wipLabel,
} from '../../shared/sprintModel'
import { PanelError, useLoaded } from './activityPanelBits'
import { useStageReadiness } from './StageReadinessContext'
import { Button, Card, Disclosure, EmptyState, Eyebrow, PageHeader, SkeletonRows } from '../ui'
import { Flip } from 'gsap/Flip'
import { flipStore } from '../motion/flipStore'
import { motion } from '../motion/motion'
import { useEnter } from '../motion/useEnter'
import { useStudioGSAP } from '../motion/useStudioGSAP'
import { contextFrom } from '../motion/choreo'
import { sharedElementBack } from '../motion/choreo/sharedElement'
import { SceneSlot } from '../scenes/core/SceneSlot'
import { backlogStore } from '../stores/backlogStore'
import { constellationFromSprint } from './sprintSceneData'
import { useListReveal } from './screenMotion'
import { SlateTable, SprintChip } from './SprintSlateTable'
import { SprintPages } from './SprintPages'

/** The sprint the team runs (proposal: studio-improvements, Batch 2), read from
 * `sprint.py status --json` and drawn as it is. Studio computes nothing here: every count, verdict
 * age, mix figure and build-order position is the plugin's, and a value the plugin reports as
 * null reads "no data" — never a zero. Counts only, never a per-person total: the sprint layer's
 * metrics rule, kept by having no place on this screen where one could appear.
 *
 * Two shapes. The full view sits beside the Board in the Build group and opens a slate row in the
 * same spec view the board opens. The compact panel is the Build › Workflow activity row
 * (`PANEL_CONTROLS.sprint`): the same picture without the table. Both are read-only; the only
 * writes are the two report pages, which the plugin's own scripts write into .sdlc/reports/.
 *
 * Round 2 (studio-upgrade-2 S7): the screen reads in the right order — `SprintScreen` draws the
 * `PageHeader` (the one "Sprint" heading) first, then the figure, then the board; the board's
 * header Card is a one-row fact strip with Refresh inside it (the three-button pin); readiness
 * lists "id — first gap" and keeps the rest behind a closed `Disclosure`; verdicts pending are
 * grouped per spec by `groupVerdicts` (a grouping, never a new number). */
export function SprintBoard({
  projectPath, sprintId, capabilities, compact = false, onOpenSpec, onView, view, twin = false, onRefresh,
}: {
  projectPath: string
  /** A sprint to show instead of the active one. */
  sprintId?: string
  /** Command center (togo-command-center.md §3.1): the view the sprint home ALREADY fetched through
   * `getCommandCenter`, so the board draws it without a second `sprint.py status` spawn. Given →
   * no read of its own; `onRefresh` is then the host's re-read. */
  view?: SprintView | null
  /** The Table twin behind the slate constellation's Graph / Table toggle: the slate, the fact
   * sections and the page buttons WITHOUT the header card — the sprint home's `SprintHeader`
   * carries `sprint-header / -state / -target / -wip` once. Refresh stays inside the twin so the
   * three-button pin (Planning page / Refresh / Review page) holds inside `sprint-board`. */
  twin?: boolean
  onRefresh?: () => void
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
        <p data-testid="activity-disabled-reason" className="text-xs text-ink-3">needs a newer plugin: lacks {SPRINT_CAPABILITY}</p>
      </div>
    )
  }
  if (view !== undefined) {
    return <SprintGiven projectPath={projectPath} view={view} compact={compact} twin={twin} onOpenSpec={onOpenSpec} onRefresh={onRefresh} testId={testId} />
  }
  return <SprintBoardBody projectPath={projectPath} sprintId={sprintId} compact={compact} onOpenSpec={onOpenSpec} onView={onView} testId={testId} />
}

/** The board over a view the host already holds (the command center's `sprint` block). Same
 * motion hooks as the fetching body — the stagger plays once per view, Back Flips into the row. */
function SprintGiven({
  projectPath, view, compact, twin, onOpenSpec, onRefresh, testId,
}: {
  projectPath: string; view: SprintView | null; compact: boolean; twin: boolean; onOpenSpec?: (row: BoardRow) => void
  onRefresh?: () => void; testId: string
}) {
  const root = useRef<HTMLDivElement>(null)
  useListReveal(root, view ? `${projectPath}|given|${view.sprint?.id ?? ''}|${view.slate.length}` : null)
  useStudioGSAP(() => {
    const el = root.current
    if (!el || !view) return
    sharedElementBack.play(contextFrom(el, { enabled: motion.enabled(), reduced: motion.reduced() }, motion), { container: el })
  }, { scope: root, dependencies: [view !== null] })
  return (
    <div ref={root} data-testid={testId} className={compact ? 'mt-2 space-y-2 text-xs text-ink-2' : 'space-y-6'}>
      {view === null
        ? <p role="status" className="text-sm text-ink-3">{NO_DATA} — the sprint block could not be read</p>
        : <SprintViewBody view={view} projectPath={projectPath} compact={compact} twin={twin} onOpenSpec={onOpenSpec} onRefresh={onRefresh} />}
    </div>
  )
}

/** The full view as App mounts it: the plugin's capabilities come from the stage readiness Frame
 * already holds, so the view can say "needs a newer plugin" before it asks the plugin anything.
 *
 * Order (S7): the `PageHeader` first — eyebrow "BUILD · SPRINT S07", the h2 "Sprint" exactly once
 * on the screen, the lede — then the constellation slot, then the board. The header is this
 * screen's sticky header through `PageHeader sticky` — the kit's one sticky recipe
 * (`STICKY_HEADER_CLASS` + `useStuck`, attached once, inside the kit). The slot sits OUTSIDE `[data-testid=sprint-board]`,
 * so the scene host's Graph / Table toggle never joins the three buttons the sprint spec counts
 * inside it. No `table` prop is passed on purpose: the SlateTable below IS the table surface (the
 * sprint spec counts its NOT READY cells, and a second table would double them), so the scene
 * shows its one-line pointer at the list instead. */
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

  const sprintId = view?.sprint?.id
  return (
    <div ref={root} className="space-y-4">
      <PageHeader
        sticky
        eyebrow={sprintId ? `Build · Sprint ${sprintId}` : 'Build · Sprint'}
        title="Sprint"
        lede="What the team committed to, as the plugin reads it from the specs."
      />
      {scene && <SceneSlot id="constellation-sprint" data={scene} onActivate={activate} />}
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
  // M4: coming Back from a spec view, the detail's title Flips back into its slate row and focus
  // returns to that row. Nothing recorded → nothing moves.
  useStudioGSAP(() => {
    const el = root.current
    if (!el || !ready) return
    sharedElementBack.play(contextFrom(el, { enabled: motion.enabled(), reduced: motion.reduced() }, motion), { container: el })
  }, { scope: root, dependencies: [ready !== null] })

  return (
    <div ref={root} data-testid={testId} className={compact ? 'mt-2 space-y-2 text-xs text-ink-2' : 'space-y-6'}>
      {loaded.kind === 'loading' && (
        <div aria-busy="true">
          <p role="status" className="text-sm text-ink-3">Reading the sprint…</p>
          {!compact && <SkeletonRows rows={3} className="mt-3" />}
        </div>
      )}
      {loaded.kind === 'failed' && <PanelError message={loaded.message} />}
      {ready && (
        <SprintViewBody
          view={ready}
          projectPath={projectPath}
          compact={compact}
          onOpenSpec={onOpenSpec}
          onRefresh={compact ? undefined : () => setReloads((n) => n + 1)}
        />
      )}
    </div>
  )
}

// --- the view ----------------------------------------------------------------------------------

function SprintViewBody({
  view, projectPath, compact, twin = false, onOpenSpec, onRefresh,
}: { view: SprintView; projectPath: string; compact: boolean; twin?: boolean; onOpenSpec?: (row: BoardRow) => void; onRefresh?: () => void }) {
  const { sprint } = view
  // The kit's one "nothing here, and why" frame (G4-9); the sentence is the plugin's, verbatim,
  // and the testid rides on the frame's root so its text is exactly that sentence.
  if (sprint === null) {
    return <EmptyState data-testid="sprint-empty" title={emptyMessage(view)} />
  }
  const empty = emptyMessage(view)
  const verdictGroups = groupVerdicts(view.verdictsPending)
  return (
    <>
      {twin ? (
        // The twin's header is one row: what this table is, and Refresh (the sprint home's own
        // header above carries the facts and their test ids once).
        <div className="flex items-center justify-between gap-3">
          <Eyebrow as="h3">Slate · {sprint.id}</Eyebrow>
          {onRefresh && <Button size="sm" icon={RefreshCw} onClick={onRefresh}>Refresh</Button>}
        </div>
      ) : <SprintHeader view={view} compact={compact} onRefresh={onRefresh} />}
      {!compact && !twin && view.note && <p className="text-xs text-status-warn-ink">{view.note}</p>}
      {empty ? <EmptyState data-testid="sprint-empty" title={empty} />
        : !compact && <SlateTable rows={view.slate} onOpenSpec={onOpenSpec} />}
      <div className={compact ? 'space-y-1' : 'grid gap-3 md:grid-cols-2'}>
        <Section title="Readiness" testId="sprint-readiness" compact={compact}>
          <p>{readinessLabel(view)}</p>
          {view.hasData && view.readiness.gaps.length > 0 && (
            // One line per spec — "id — first gap" — so the card says WHICH specs have gaps at a
            // glance; the checker's remaining lines (long and near-identical on a fresh slate)
            // sit behind one disclosure, CLOSED by default (sprint.spec counts `details[open]`).
            // The text is the plugin's verbatim either way. Beside the slate, the plugin's
            // `DoR: <verdict> (<reasons>)` line (sprint_model.spec_gaps, always first) is SKIPPED:
            // the slate's DoR cell above already carries that verdict and those reasons word for
            // word, so the card names what the slate does not (status, eng, data). The compact
            // panel has no slate, so it keeps the line.
            <ul className="mt-1 space-y-0.5">
              {view.readiness.gaps.map((g) => {
                const lines = compact ? g.gaps : g.gaps.filter((line) => !line.startsWith('DoR:'))
                const [first, ...rest] = lines
                return (
                  <li key={g.spec || '(slate)'}>
                    <span className="font-medium text-ink-1">{g.spec || '(slate)'}</span>
                    {first ? <> — {first}</> : <> — the DoR gaps are in the slate above</>}
                    {rest.length > 0 && (
                      <Disclosure
                        className="mt-0.5"
                        summary={<span className="cursor-pointer text-ink-3">{rest.length} more line{rest.length === 1 ? '' : 's'}</span>}
                      >
                        <p className="mt-0.5 pl-3 text-ink-2">{rest.join('; ')}</p>
                      </Disclosure>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Section>
        <Section title="Verdicts pending" testId="sprint-verdicts" compact={compact}>
          {verdictGroups.length === 0 ? <p>{view.hasData ? 'none pending' : NO_DATA}</p> : (
            <ul className="space-y-0.5">
              {verdictGroups.map((group) => (
                // Grouped per spec, lanes in the plugin's order: "0008 · eng · no data · data · 2
                // business days". A grouping only — nothing here is counted.
                <li key={group.spec}>
                  <span className="font-medium text-ink-1">{group.spec}</span>
                  {group.lanes.map((v) => <span key={v.lane}> · {v.lane} · {businessDays(v.sinceBusinessDays)}</span>)}
                </li>
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
          {view.buildOrder.length > 0 && <p className="text-ink-3">deps, then unblocks-most, then HIGH→LOW, then id</p>}
        </Section>
        {!compact && (
          // Prose from the plugin, never geometry: the constellation shows these words under its
          // figure and draws nothing from them.
          <Section title="Dependency gaps" testId="sprint-dependency-gaps" compact={compact}>
            {view.dependencyGaps.length === 0 ? <p>{view.hasData ? 'none' : NO_DATA}</p> : (
              <ul className="space-y-0.5 text-status-warn-ink">{view.dependencyGaps.map((g) => <li key={g}>{g}</li>)}</ul>
            )}
          </Section>
        )}
        {!compact && (
          <Section title="Decisions" testId="sprint-decisions" compact={compact}>
            <p>{decisionsLabel(view.decisions)}</p>
            {view.decisions && view.decisions.overdue.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-status-warn-ink">
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

/** The header Card as ONE fact strip (S7): name · state chip · goal · dates → remaining (mono) ·
 * target · mix chips · WIP, wrapping only when the column is narrow. Refresh lives here in the
 * full view — inside `[data-testid=sprint-board]`, so the sprint spec's three-button count holds
 * now that the screen's heading has moved up into the `PageHeader`. */
function SprintHeader({ view, compact, onRefresh }: { view: SprintView; compact: boolean; onRefresh?: () => void }) {
  const sprint = view.sprint!
  const state = stateChip(sprint.state)
  const remaining = remainingLabel(sprint)
  const chips = mixChips(view.mix)
  const dot = <span aria-hidden="true" className="text-ink-4">·</span>
  const body = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums">
          <span className={compact ? 'font-semibold text-ink-1' : 'text-sm font-semibold text-ink-1'}>Sprint {sprint.id}</span>
          <SprintChip tone={state.tone} testId="sprint-state">{state.label}</SprintChip>
          {sprint.goal && <span className="text-sm text-ink-2">— {sprint.goal}</span>}
          {dot}
          <span className="font-mono text-ink-3">
            {sprint.start || '?'} → {sprint.end || '?'}
            {remaining && <> · <span data-testid="sprint-remaining">{remaining}</span></>}
          </span>
          {dot}
          <span className="text-ink-3">target <span data-testid="sprint-target" className="text-ink-1">{targetLabel(sprint.target)}</span></span>
          {dot}
          <span className="text-ink-3">Mix</span>
          {chips.length === 0 ? <span data-testid="sprint-mix">{NO_DATA}</span>
            : chips.map((c) => <SprintChip key={c.tier} tone="neutral" testId="sprint-mix">{c.label}</SprintChip>)}
          {dot}
          <span className="text-ink-3">WIP</span>
          <span data-testid="sprint-wip" className="text-ink-1">{wipLabel(view.wip)}</span>
          {sprint.boardRef && <>{dot}<span className="text-ink-3">board: {sprint.boardRef} (manual mapping only)</span></>}
        </div>
        {onRefresh && (
          <div className="shrink-0">
            <Button size="sm" icon={RefreshCw} onClick={onRefresh}>Refresh</Button>
          </div>
        )}
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
