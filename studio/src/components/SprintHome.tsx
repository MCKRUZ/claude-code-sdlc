// The sprint home — the command center (togo-command-center.md §3.1; Area `sprint`, the default
// in Build). ONE read, `getCommandCenter`, every block sourced; the header, four lanes, the baton,
// the Today column, In the room, Refining and How it is going draw it as it came. Writes go
// through the closed argv table (`runSprintVerb`, `decideDecision`, `confirmTier`) with the actor
// main resolved; after any exit 0 the screen RE-READS and nothing moves until the refreshed read
// is in hand — then the verdict seal (#31) or the baton pass (#30) plays, and the lane Flip
// (`boardRegroup`) carries a card to its new lane. The slate constellation keeps its Graph surface
// behind `SceneShell`'s toggle with the old `SprintBoard` slate table as its Table twin. Motion
// reads `motion.familiarity(projectPath)`: the tier changes how a state is reached, never what.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Flip } from 'gsap/Flip'
import type { BoardRow, CommandCenter, ReadinessAll, SinceWindow, SprintVerbRequest, VerdictLane, VerdictValue } from '../../shared/types'
import { CAPABILITIES, NO_DATA } from '../../shared/reasons'
import { slateToBoardRow } from '../../shared/sprintModel'
import { PanelError } from './activityPanelBits'
import { SkeletonRows } from '../ui'
import { motion } from '../motion/motion'
import { useEnter } from '../motion/useEnter'
import { batonPass, boardRegroup, contextFrom, verdictSeal } from '../motion/choreo'
import { getScene } from '../scenes/core/sceneRegistry'
import { SceneSlot } from '../scenes/core/SceneSlot'
import { backlogStore } from '../stores/backlogStore'
import { useConnection } from '../stores/connectionStore'
import { hostReasons } from '../hostReasons'
import { constellationFromSprint } from './sprintSceneData'
import { SprintBoard } from './SprintBoard'
import { SprintHeader } from './SprintHeader'
import { InTheRoom } from './InTheRoom'
import { Refining } from './Refining'
import { LaneBoard } from './lanes/LaneBoard'
import { VerdictDialog } from './lanes/VerdictDialog'
import type { LaneFilterMode, LaneRow } from './lanes/laneModel'
import { TodayColumn } from './today/TodayColumn'
import { GoingPanel } from './today/GoingPanel'

export interface SprintHomeProps {
  projectPath: string
  onOpenSpec: (row: BoardRow) => void
  /** `h` on a card / the omnibar's "hand NNNN to NAME": the host's hand-off dialog. */
  onHandOff?: (row: BoardRow) => void
  /** The "New sprint" primary with no sprint: the host's VerbDialog on the `new` verb. */
  onNewSprint: () => void
  /** Tōgō's own record of Claude's work this session (drafts, proposals), or null. */
  claudeLine?: string | null
  /** The spec the host just handed off with exit 0 — the baton plays once the refreshed read holds it. */
  handedOff?: string | null
  /** Bumped by the host after a write elsewhere landed exit 0 (the omnibar, "Refresh this screen"): re-read. */
  refreshKey?: number
  /** Coming back from the spec card: the control that opened it takes focus again once the read
   * lands (a lane card, or a Refining row's "refine in place →"). Accessibility, not decoration. */
  focusBack?: { spec: string; where: 'lane' | 'refining'; seq?: number } | null
}

/** The opener's selector, pure for the test. */
export function focusBackSelector(back: NonNullable<SprintHomeProps['focusBack']>): string {
  const id = CSS.escape(back.spec)
  return back.where === 'lane' ? `[data-lane-card][data-spec="${id}"]` : `[data-testid="refining-row"][data-spec="${id}"] [data-refine]`
}

/** The board row the spec view takes: the board's row by exact id, else the slate row's shape. */
export function boardRowFor(row: LaneRow): BoardRow {
  return row.board ?? slateToBoardRow(row.slate)
}

export function SprintHome({ projectPath, onOpenSpec, onHandOff, onNewSprint, claudeLine = null, handedOff = null, refreshKey = 0, focusBack = null }: SprintHomeProps) {
  const [cc, setCc] = useState<CommandCenter | null>(null)
  const [readiness, setReadiness] = useState<ReadinessAll | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [since, setSince] = useState<SinceWindow>(1)
  const [filter, setFilter] = useState<LaneFilterMode>('all')
  const [verdictRow, setVerdictRow] = useState<LaneRow | null>(null)
  const [reads, setReads] = useState(0)
  const pendingSeal = useRef<{ spec: string; lane: VerdictLane; verdict: VerdictValue } | null>(null)
  const pendingBaton = useRef<string | null>(null)
  const flipState = useRef<Flip.FlipState | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const lanesRef = useRef<HTMLDivElement>(null)
  useEnter(root, 'rise', { key: projectPath })
  const tier = motion.familiarity(projectPath)
  const connection = useConnection()

  // Re-read: capture the cards' positions first so the lane Flip has a "before".
  const reload = useCallback(() => {
    const el = lanesRef.current
    if (el && motion.enabled()) flipState.current = Flip.getState(el.querySelectorAll('[data-flip-id^="spec:"]'))
    setReads((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    setError(null)
    window.studio.getCommandCenter(projectPath, since).then(
      async (doc) => {
        if (cancelled) return
        setCc(doc)
        if (doc.sprint.data) backlogStore.setSlate(projectPath, doc.sprint.data.slate)
        if (doc.board.data) backlogStore.setRows(projectPath, doc.board.data.rows)
        if (doc.capabilities.includes(CAPABILITIES.readinessAll)) {
          try { const all = await window.studio.getReadinessAll(projectPath); if (!cancelled) setReadiness(all) } catch { if (!cancelled) setReadiness(null) }
        }
      },
      (err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : 'The command center could not be read.') },
    )
    return () => { cancelled = true }
  }, [projectPath, since, reads, refreshKey])

  // Back from the spec card: focus returns to the opener once the rows exist — once per return.
  const focusedBack = useRef<string | null>(null)
  useEffect(() => {
    if (!cc || !focusBack) return
    const key = `${focusBack.where}:${focusBack.spec}:${focusBack.seq ?? 0}`
    if (focusedBack.current === key) return
    const el = root.current?.querySelector<HTMLElement>(focusBackSelector(focusBack))
    if (!el) return
    focusedBack.current = key
    el.focus({ preventScroll: false })
  }, [cc, focusBack])

  // After a refreshed read: the lane Flip, then the seal or the baton — in that order, once.
  useEffect(() => {
    if (!cc) return
    const lanes = lanesRef.current
    const ctx = (scope: Element) => contextFrom(scope, { enabled: motion.enabled(), reduced: motion.reduced() }, motion)
    if (lanes && flipState.current) {
      boardRegroup.play(ctx(lanes), { state: flipState.current, container: lanes })
      flipState.current = null
    }
    const seal = pendingSeal.current
    if (seal && lanes) {
      pendingSeal.current = null
      const card = lanes.querySelector(`[data-lane-card][data-spec="${CSS.escape(seal.spec)}"]`)
      if (card) {
        const chip = card.querySelector(`[data-review-chip="${seal.lane}"]`)
        verdictSeal.play(ctx(card), { card, seam: card.querySelector('[data-seam]'), chipIn: chip, verdict: seal.verdict, tier })
      }
    }
    const spec = pendingBaton.current ?? handedOff
    if (spec && lanes && cc.sprint.data?.handoffsOpen.some((h) => h.spec === spec)) {
      pendingBaton.current = null
      const slot = lanes.querySelector(`[data-baton-slot][data-spec="${CSS.escape(spec)}"]`)
      const card = lanes.querySelector(`[data-lane-card][data-spec="${CSS.escape(spec)}"]`)
      if (slot) batonPass.play(ctx(lanes), { baton: slot.querySelector('[data-baton]'), fromSlot: card, toSlot: slot, card, tier })
    }
  }, [cc, handedOff, tier])

  const runVerb = useCallback(async (request: SprintVerbRequest) => {
    const result = await window.studio.runSprintVerb(projectPath, request)
    if (result.ok) reload()
    return result
  }, [projectPath, reload])
  const decide = useCallback(async (id: string, resolution: string) => {
    const result = await window.studio.decideDecision(projectPath, id, resolution)
    if (result.ok) reload()
    return result
  }, [projectPath, reload])
  const confirmTier = useCallback(async (specPath: string) => {
    const result = await window.studio.confirmTier(projectPath, specPath)
    if (result.ok) reload()
    return result
  }, [projectPath, reload])
  const specPathFor = useCallback((id: string) => cc?.board.data?.rows.find((r) => r.spec === id)?.path ?? id, [cc])

  const view = cc?.sprint.data ?? null
  const scene = useMemo(() => (view && view.sprint ? constellationFromSprint(view) : null), [view])
  const sceneRegistered = getScene('constellation-sprint') !== undefined
  const openLane = useCallback((row: LaneRow) => onOpenSpec(boardRowFor(row)), [onOpenSpec])
  const openBoardRow = useCallback((id: string) => {
    const row = cc?.board.data?.rows.find((r) => r.spec === id) ?? (view ? view.slate.find((r) => r.id === id) : undefined)
    if (row) onOpenSpec('spec' in row ? row : slateToBoardRow(row))
  }, [cc, view, onOpenSpec])

  if (error) return <div ref={root} data-testid="sprint-home" className="p-6"><PanelError message={error} /></div>
  if (!cc) {
    return (
      <div ref={root} data-testid="sprint-home" aria-busy="true" className="space-y-4">
        <p role="status" className="text-sm text-ink-3">Reading the command center…</p>
        <SkeletonRows rows={4} />
      </div>
    )
  }

  const hostReason = cc.board.data?.codeHostAvailable === false ? (hostReasons(connection).board ?? cc.board.data.error ?? 'the code host could not be read') : cc.board.ok ? null : (cc.board.error ?? NO_DATA)
  const boardRows = cc.board.data?.rows ?? null
  const people = cc.roster.data?.people ?? null
  const twin = <SprintBoard projectPath={projectPath} view={view} twin onOpenSpec={onOpenSpec} onRefresh={reload} />

  return (
    // `@container`: the Today column takes its 320 px beside the lanes once THIS screen is 1000 px
    // wide — measured on the screen, not the window, because the chat takes 380 px of it (a 1440
    // window leaves ≈ 1012). Beside Today the lanes keep their own ≥ 220 px by wrapping two by two
    // (`LaneBoard`'s container query) until the lane row has the 4 × 220 + gutters that visual §4
    // sets for four across; so Today sits beside the loop on every working window, never as a band
    // below it. Narrower than 1000, Today becomes a band of groups below the lanes.
    <div ref={root} data-testid="sprint-home" data-tier={tier} className="@container space-y-12" data-fetched-at={cc.fetchedAt}>
      {view ? <SprintHeader view={view} actor={cc.actor} capabilities={cc.capabilities} onNewSprint={onNewSprint} />
        : <PanelError message={cc.sprint.error ?? 'The sprint could not be read.'} />}
      <div className="grid grid-cols-1 gap-6 @min-[1000px]:grid-cols-[minmax(0,1fr)_320px]" data-home-grid="">
        {view && view.sprint ? (
          <div ref={lanesRef}>
            <LaneBoard
              view={view} board={boardRows} hostReason={hostReason} actor={cc.actor} capabilities={cc.capabilities} roster={people}
              filter={filter} onFilter={setFilter} onOpen={openLane} onHandOff={onHandOff ? (row) => onHandOff(boardRowFor(row)) : undefined}
              onVerdict={setVerdictRow} onRun={runVerb} onAcked={(spec) => { pendingBaton.current = spec }} tier={tier} revealKey={`${projectPath}|${cc.fetchedAt}`}
            />
          </div>
        ) : (
          // No sprint: the lanes are replaced by the Board rows (the backlog as the plugin lists it).
          <div ref={lanesRef} data-testid="no-sprint-rows" className="rounded-[14px] bg-lane p-3 text-xs text-ink-2">
            {boardRows && boardRows.length > 0 ? (
              <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {boardRows.map((r) => (
                  <li key={r.spec}><button type="button" className="font-mono text-ident tabular-nums hover:underline" onClick={() => onOpenSpec(r)}>{r.spec}</button> <span className="text-ink-1">{r.name}</span> <span className="text-ink-3">· {r.status}</span></li>
                ))}
              </ul>
            ) : <p className="text-ink-3">{hostReason ?? 'no spec on the board'}</p>}
          </div>
        )}
        <TodayColumn cc={cc} onRun={runVerb} onDecide={decide} onConfirmTier={(id) => confirmTier(specPathFor(id))} onSince={setSince} onActed={reload} claudeLine={claudeLine}
          className="@min-[700px]:grid-cols-2 @min-[1000px]:grid-cols-1" />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        <InTheRoom people={people} view={view} board={boardRows} me={cc.actor?.name ?? null} />
        <Refining rows={boardRows} readiness={readiness} roster={people} actor={cc.actor} capabilities={cc.capabilities} afterSprint={view?.sprint?.id ?? null} onOpen={onOpenSpec} onConfirmTier={(row) => confirmTier(row.path)} />
        <GoingPanel block={cc.scorecard} />
      </div>
      {view && view.sprint && (
        <section aria-label="Slate" className="space-y-3">
          {scene && sceneRegistered
            ? <SceneSlot id="constellation-sprint" data={scene} onActivate={openBoardRow} table={twin} />
            : twin}
        </section>
      )}
      {verdictRow && (
        <VerdictDialog row={verdictRow} actor={cc.actor} capabilities={cc.capabilities} projectPath={projectPath} boardSpecIds={view?.slate.map((r) => r.id)}
          onClose={() => setVerdictRow(null)} onRun={runVerb} onRecorded={(spec, lane, verdict) => { pendingSeal.current = { spec, lane, verdict } }} />
      )}
    </div>
  )
}
