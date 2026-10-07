// The four lanes = the loop (togo-command-center.md §3.1, visual §4 "Lane"): four shallow wells
// on `lane`, each with a 40 px `lane-header` band (shape-coded monochrome glyph, eyebrow label,
// the numeral in `--text-lane-count`), cards in `surface-1`, the baton on the Building→Checking
// edge, the Mine / Team / All filter above and an "unplaced" strip below for any slated row the
// partition could not seat (listed with its raw fields, never hidden). Keyboard: `j k ↵ h v Esc`
// inside `data-shortcut-scope="lanes"`. Every number is a plugin row count or a plugin field.
import { useMemo, useRef, type ReactNode } from 'react'
import type { ActorInfo, LaneId, RosterPerson, SprintVerbRequest, SprintVerbResult, SprintView, BoardRow } from '../../../shared/types'
import { LANE_LABEL } from '../../../shared/nav'
import type { FamiliarityTier } from '../../motion/contract'
import { cn, Eyebrow, Notice } from '../../ui'
import { choreoContext } from '../screenMotion'
import { listStagger } from '../../motion/choreo'
import { enabled as motionEnabled } from '../../motion/motion'
import { useStudioGSAP } from '../../motion/useStudioGSAP'
import { LaneGlyph } from '../brand/figures'
import { Baton } from './Baton'
import { LaneCard } from './LaneCard'
import { LaneFilter } from './LaneFilter'
import { buildLanes, filterLane, LANE_IDS, teamOf, type LaneFilterMode, type LaneRow } from './laneModel'
import { revealKeyFor, revealTargets } from './laneMotion'
import { LANE_SCOPE_VALUE, useLaneKeys } from './useLaneKeys'

export interface LaneBoardProps {
  view: SprintView
  board: readonly BoardRow[] | null
  /** The host's own sentence when PR facts are unreadable; null when the host answered. */
  hostReason: string | null
  actor: ActorInfo | null
  capabilities: readonly string[]
  roster: readonly RosterPerson[] | null
  filter: LaneFilterMode
  onFilter: (mode: LaneFilterMode) => void
  onOpen: (row: LaneRow) => void
  onHandOff?: (row: LaneRow) => void
  onVerdict?: (row: LaneRow) => void
  onRun: (request: SprintVerbRequest) => Promise<SprintVerbResult>
  onAcked?: (spec: string) => void
  tier?: FamiliarityTier
  /** Changes when a fresh read arrived — the first-paint stagger plays once per key. */
  revealKey: string | null
  className?: string
}

export function LaneBoard({
  view, board, hostReason, actor, capabilities, roster, filter, onFilter, onOpen, onHandOff, onVerdict, onRun, onAcked, tier, revealKey, className,
}: LaneBoardProps) {
  const me = actor?.name ?? null
  const team = useMemo(() => teamOf(roster, me), [roster, me])
  const lanes = useMemo(() => buildLanes(view, board), [view, board])
  const visible = useMemo(() => {
    const out: Record<LaneId, LaneRow[]> = { ready: [], building: [], checking: [], merged: [] }
    for (const id of LANE_IDS) out[id] = filterLane(lanes.lanes[id], filter, me, team)
    return out
  }, [lanes, filter, me, team])
  const order = useMemo(() => LANE_IDS.flatMap((id) => visible[id]), [visible])

  const root = useRef<HTMLDivElement>(null)
  const keys = useLaneKeys(order, { onOpen, onHandOff, onVerdict }, root)
  // Row #4 on first data arrival, over the targets the tier allows (none for quiet / settled);
  // opacity is cleared when the row completes so the cards end in their natural state — the
  // same DOM a cold reload paints. Off / test: nothing plays and nothing is written.
  const staggerKey = revealKeyFor(revealKey, tier)
  useStudioGSAP((g) => {
    const el = root.current
    if (!el || staggerKey === null || !motionEnabled()) return
    const items = revealTargets(el, tier)
    if (items.length === 0) return
    const tl = listStagger.play(choreoContext(el), { items })
    void tl.then(() => { g.set(items, { clearProps: 'opacity' }) })
  }, { scope: root, dependencies: [staggerKey] })

  return (
    <div
      ref={root}
      data-testid="lane-board"
      data-shortcut-scope={LANE_SCOPE_VALUE}
      data-tier={tier ?? 'full'}
      // Programmatic focus only (`-1`): the board itself can take focus so `j` from the board,
      // before any card was touched, moves to the first card; it never joins the tab order.
      tabIndex={-1}
      onKeyDown={keys.onKeyDown}
      // A flex column, not `space-y`: when the host gives the board a height (the sprint home's
      // cockpit row), the wells' grid takes what is left under the filter row (`flex-1 min-h-0`)
      // and the four wells stretch to it — flush with the Today rail, no void under short lanes.
      className={cn('@container flex flex-col gap-3 outline-none', className)}
    >
      {/* One row above the lanes: the filter, the host's own sentence when PR facts are
          unreadable (ONCE for the board — the same quiet notice the Board and the spec card use; a
          degraded read is information, never an alarm — so the cards drop their pull-request facts
          rather than each repeating why), and the partition caption. The notice rides THIS row
          (v13: the separate block cost the lanes 44 px the 1280×800 strip branch did not have);
          the sentence is set whole (owner's rule: never truncate meaning) and wraps when narrow. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <LaneFilter value={filter} onChange={onFilter} me={me} team={team} />
        {/* No bold title line on the notice: ONE 12 px line in the row (the title + sentence pair
            cost 56 px and put the 1280×800 lane bottoms 4 px under the fold); the heading rides the
            tooltip. */}
        {hostReason !== null && (
          <Notice tone="info" role="status" data-testid="lanes-host-reason" data-compact="" className="min-w-0 flex-1 basis-[22rem] !py-1 [&>svg]:mt-0">
            <span className="block min-w-0 text-xs leading-4 [overflow-wrap:anywhere]" title={`the code host could not be read — ${hostReason}`}>{hostReason}</span>
          </Notice>
        )}
        <p className="ml-auto text-xs text-ink-3" title="sprint.py status --json · slate[] placed by status, dor, verdicts_pending and the PR's waiting_on">
          {view.slate.length === 0 ? 'nothing slated' : 'every slated spec sits in exactly one lane'}
        </p>
      </div>
      {/* Four lanes at ≥ 220 px each once the board has 4 × 220 + 3 × 12 = 916 px (visual §4);
          two by two below — the cockpit's rail threshold (SprintHome) is set so the board is never
          between 916 and 4 × 220 when Today sits beside it. `relative`: the baton is ONE overlay
          for the whole grid, centred on the Building→Checking gutter (the 50 % line of four equal
          columns), 12 px below the 40 px headers — never a child of a lane, so the four lanes
          paint identically. Below 916 px the gutter does not exist, so the same element becomes a
          full-width row between the two pairs. */}
      <div className="relative grid min-h-0 flex-1 grid-cols-2 gap-3 @min-[916px]:grid-cols-4" data-lanes-grid="">
        {LANE_IDS.map((id) => (
          <Lane key={id} id={id} rows={visible[id]} total={lanes.lanes[id].length} view={view} reserve={batonReserve(id, view.handoffsOpen.length)}>
            {visible[id].map((row) => (
              <LaneCard
                key={row.id}
                ref={keys.register(row.id)}
                row={row}
                me={me}
                roster={roster}
                hostReason={hostReason}
                active={keys.isActive(row)}
                onOpen={onOpen}
                onFocus={keys.setActive}
              />
            ))}
            {visible[id].length === 0 && (
              <p className="px-1 py-2 text-xs text-ink-3">
                {lanes.lanes[id].length === 0 ? 'no spec here' : `${lanes.lanes[id].length} hidden by the filter`}
              </p>
            )}
          </Lane>
        ))}
        {view.handoffsOpen.length > 0 && (
          <div
            data-baton-overlay=""
            className="col-span-2 @min-[916px]:absolute @min-[916px]:left-1/2 @min-[916px]:top-[52px] @min-[916px]:z-10 @min-[916px]:w-[clamp(220px,26%,320px)] @min-[916px]:-translate-x-1/2"
          >
            <Baton handoffs={view.handoffsOpen} actor={actor} capabilities={capabilities} onRun={onRun} onAcked={onAcked} />
          </div>
        )}
      </div>
      {lanes.unplaced.length > 0 && (
        <div data-testid="lane-unplaced" className="rounded-[10px] border border-dashed border-line-2 px-3 py-2 text-xs text-ink-3">
          <Eyebrow as="span">Slated, not in a lane</Eyebrow>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {lanes.unplaced.map((row) => (
              <li key={row.id} className="font-mono text-ident tabular-nums">
                <button type="button" aria-label={`${row.id} ${row.slate.name} — slated, not in a lane`} className="underline-offset-2 hover:underline" onClick={() => onOpen(row)}>{row.id}</button>
                <span className="text-ink-3"> · status {row.slate.status || 'none'} · DoR {row.slate.dor}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1">These rows refine in place; the plugin seats a row only once its status and DoR say so.</p>
        </div>
      )}
    </div>
  )
}

/** The header numeral: the plugin rows in the lane (a list length), the Building lane also
 * carrying the plugin's own `wip` "n of cap". An empty lane says so in words, not a digit. */
export function laneCount(id: LaneId, rows: readonly LaneRow[], view: SprintView): string {
  const n = rows.length
  if (id === 'building' && view.wip.inFlight !== null && view.wip.cap !== null) return `${view.wip.inFlight} of ${view.wip.cap}`
  return n === 0 ? 'none' : String(n)
}

/** The slot's height (visual §4: 28 px per hand-off, 8 px between, 12 px below the headers) that
 * the two lanes under the overlay leave clear so the baton covers no card; the other two lanes
 * reserve nothing. Zero with no hand-off — then the four lanes paint identically. */
export const BATON_SLOT_PX = 28
export const BATON_GAP_PX = 8

export function batonReserve(id: LaneId, handoffs: number): number {
  if (handoffs === 0 || (id !== 'building' && id !== 'checking')) return 0
  return 12 + handoffs * BATON_SLOT_PX + (handoffs - 1) * BATON_GAP_PX
}

/** The lane's height cap (owner's v12 item 1: every lane header on screen at 1440×900 and
 * 1280×800, cards scrolling INSIDE the lane). Binding under the sprint home's STRIP branch,
 * where the wells are content-sized: `100dvh − --cockpit-chrome` (the strip, its gap, the filter
 * row and `<main>`'s padding join the chrome there — `cockpitLayout.ts`), floor `LANE_FLOOR_PX`.
 * In the rail branch the cockpit row sizes the wells and this cap sits above it. The fallback is
 * the strip chrome, so a board rendered outside the home caps conservatively. */
export const LANE_MAX_HEIGHT_CLASS = 'max-h-[max(240px,calc(100dvh-var(--cockpit-chrome,572px)))]'

function Lane({ id, rows, total, view, reserve, children }: { id: LaneId; rows: readonly LaneRow[]; total: number; view: SprintView; reserve: number; children: ReactNode }) {
  const count = laneCount(id, rows, view)
  const title = id === 'building' && count.includes(' of ') ? 'sprint.py status --json · wip' : `${total} slated row${total === 1 ? '' : 's'} placed here`
  return (
    <section data-testid={`lane-${id}`} data-lane={id} aria-label={`${LANE_LABEL[id]} lane`} className={cn('flex min-h-[220px] flex-col rounded-[14px] bg-lane p-2', LANE_MAX_HEIGHT_CLASS)}>
      {/* The header is static and the BODY below is the scroller, so the 40 px band is always on
          screen whatever the lane holds. */}
      <header className="z-[1] -mx-2 -mt-2 mb-2 flex h-10 shrink-0 items-center justify-between rounded-t-[14px] border-b border-lane-line bg-lane-header px-3">
        <span className="flex items-center gap-2 text-ink-2">
          <LaneGlyph lane={id} size={18} className="text-ink-2" />
          <Eyebrow as="span">{LANE_LABEL[id]}</Eyebrow>
        </span>
        <span className={cn('text-lane-count tabular-nums', count === 'none' ? 'text-xs font-normal tracking-normal text-ink-3' : 'text-ink-1')} title={title} data-lane-count={id}>
          {count}
        </span>
      </header>
      {/* The reserve applies only beside the gutter the baton sits on (≥ 916 px); below that the
          baton is its own row and the lanes keep their natural top. `-mx-2 px-2` keeps a card's
          focus ring inside the scroller's clip without narrowing the card. */}
      <div
        className="-mx-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-2 pb-0.5 @max-[915px]:!pt-0"
        data-lane-scroll=""
        style={reserve > 0 ? { paddingTop: reserve } : undefined}
        data-baton-reserve={reserve > 0 ? reserve : undefined}
      >
        {children}
      </div>
    </section>
  )
}
