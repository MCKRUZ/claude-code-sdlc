// The Lifecycle Spine as a strip (togo-command-center.md §1, visual §4 "LifecycleStrip"): the
// same nine stations the 3D Spine draws, as plain inline SVG on a horizontal rail — no canvas,
// no three. Geometry and vocabulary come from `spineModel` (`stationU` spacing, `nodeKind`
// shapes, `STAGE_SHORT_LABEL`) so the strip and the scene can never disagree about where a
// station sits or what it is. Purely presentational: the host (`LifecycleStrip`) decides which
// station is active, viewed or expanded, and reads the facts the Build station names.
//
// Honesty: the rail's lit length is `railProgress`'s `uLit` — a count of finished stations in
// plugin order, never time — and the strip exposes it as a `progressbar` whose value text is
// the same sentence the old sidebar wrote ("3 of 9 stages done"). Shape, not colour, tells the
// kinds apart (a filled disc with a tick · an outlined tick · a ringed dot · a dashed ring); the
// Build station is a loop within a loop. `aria-current` is the host's and lives on the
// `<button>`, never on an SVG element.
import type { ReactNode } from 'react'
import type { NodeKind } from '../../../shared/nav'
import { EYEBROW_CLASS, EYEBROW_TYPE_CLASS } from '../../ui/Eyebrow'
import { cn } from '../../ui/cn'
import { stationU } from './spineModel'

export interface StripStation {
  id: string
  /** The accessible name's first words ("Build Loop · S08 · 8th sprint" for Build). */
  display: string
  kind: NodeKind
  /** The short plate label (`STAGE_SHORT_LABEL`), or the Build station's long line. */
  label: string
  /** `stageMeta`'s sentence — the accessible DESCRIPTION (`aria-description`), read after the
   * name. The name is the display alone, so the Build station reads exactly "Build Loop · S08 ·
   * 8th sprint" / "Build Loop" (togo-command-center.md §1) and nothing is appended to it. */
  meta: string
  isBuild: boolean
  isCurrent: boolean
  /** The station whose home is open (`data-viewing`, the `strip-viewing` ring). */
  viewing: boolean
  /** Owns the showing screen → `aria-current="page"` (at most one across the whole nav). */
  active: boolean
  /** Build only: whether its views are open beneath. */
  expanded?: boolean
  /** Build only: a one-line note under the label (the sprint-home-unavailable reason). */
  note?: string | null
}

export interface SpineStripProps {
  stations: readonly StripStation[]
  /** `railProgress(data).uLit` — the lit fraction of the rail. */
  uLit: number
  /** Finished stations and the total, for the progressbar's words. */
  done: number
  total: number
  onActivate: (id: string) => void
  onHover?: (id: string | null) => void
  /** The Build views row, rendered beneath the stations while Build is expanded. */
  children?: ReactNode
  className?: string
}

/** Ring geometry in a 20 × 20 box: station Ø 14 at 1.5 px, viewing ring Ø 18 at 2 px (visual §4). */
export const STRIP_RING_BOX = 20
const C = STRIP_RING_BOX / 2
const R_STATION = 6.25
const R_VIEWING = 8
const R_DOT = 2.25
const R_LOOP = 3

/** The vertical centre of the rail and the rings inside the 64 px band. */
export const STRIP_RAIL_Y = 22

export function stripProgressText(done: number, total: number): string {
  return `${done} of ${total} stages done`
}

function Ring({ station }: { station: StripStation }) {
  const { kind, isBuild, viewing } = station
  const tick = <path d={`M${C - 3.3} ${C + 0.2}l2.1 2.1 4.2-4.6`} fill="none" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
  return (
    <svg
      data-station-ring=""
      viewBox={`0 0 ${STRIP_RING_BOX} ${STRIP_RING_BOX}`}
      width={STRIP_RING_BOX}
      height={STRIP_RING_BOX}
      aria-hidden="true"
      focusable="false"
      className="block overflow-visible"
    >
      {viewing ? <circle data-viewing-ring="" cx={C} cy={C} r={R_VIEWING} fill="none" strokeWidth={2} className="stroke-strip-viewing" /> : null}
      <g data-node={kind} style={{ transformOrigin: `${C}px ${C}px` }}>
        {kind === 'signed' ? (
          <>
            <circle cx={C} cy={C} r={R_STATION + 0.75} className="fill-strip-lit" />
            <g className="stroke-white">{tick}</g>
          </>
        ) : kind === 'completed' ? (
          <>
            <circle cx={C} cy={C} r={R_STATION} strokeWidth={1.5} className="fill-stage-signed-bg stroke-strip-lit" />
            <g className="stroke-strip-lit">{tick}</g>
          </>
        ) : kind === 'current' ? (
          <>
            <circle cx={C} cy={C} r={R_STATION} fill="none" strokeWidth={1.5} className="stroke-strip-viewing" />
            <circle cx={C} cy={C} r={R_DOT} className="fill-strip-viewing" />
          </>
        ) : (
          <circle cx={C} cy={C} r={R_STATION} fill="none" strokeWidth={1.5} strokeDasharray="2.4 2.2" className="stroke-stage-later-fill" />
        )}
        {isBuild ? <circle cx={C} cy={C} r={R_LOOP} fill="none" strokeWidth={1.25} className={kind === 'signed' ? 'stroke-white' : kind === 'later' ? 'stroke-stage-later-fill' : 'stroke-strip-viewing'} /> : null}
      </g>
    </svg>
  )
}

function Station({ station, u, onActivate, onHover }: {
  station: StripStation
  u: number
  onActivate: (id: string) => void
  onHover?: (id: string | null) => void
}) {
  const { id, display, meta, label, kind, isBuild, viewing, active, expanded, note } = station
  const hover = (on: boolean) => onHover?.(on ? id : null)
  return (
    <li className="absolute top-0 -translate-x-1/2" style={{ left: `${u * 100}%` }} data-stage-id={id}>
      <button
        type="button"
        data-pressable=""
        data-station={kind}
        data-viewing={viewing ? '' : undefined}
        aria-current={active ? 'page' : undefined}
        aria-expanded={isBuild ? Boolean(expanded) : undefined}
        aria-label={display}
        aria-description={meta}
        onClick={() => onActivate(id)}
        onMouseEnter={() => hover(true)}
        onMouseLeave={() => hover(false)}
        onFocus={() => hover(true)}
        onBlur={() => hover(false)}
        // No slab and no hover fill (visual §4/§9): the `strip-viewing` ring already says which
        // station is viewed, and two signals fight. Hover is the lean-in — the ring scales 1.12
        // (§7 "Strip lean-in") and the label takes `ink-1`; the only fill a station ever paints
        // is the focus ring.
        className={cn(
          'group flex flex-col items-center gap-1.5 rounded-lg px-2 pb-1.5 text-center',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)',
          '[&_[data-station-ring]]:transition-transform [&_[data-station-ring]]:duration-[120ms] hover:[&_[data-station-ring]]:scale-[1.12]',
        )}
        style={{ paddingTop: STRIP_RAIL_Y - STRIP_RING_BOX / 2 }}
      >
        <Ring station={station} />
        <span
          className={cn(
            'whitespace-nowrap',
            'transition-colors group-hover:text-ink-1',
            isBuild
              ? cn('text-xs font-medium leading-4 tabular-nums', kind === 'later' && !active ? 'text-ink-2' : 'text-ink-1')
              : cn(EYEBROW_TYPE_CLASS, 'hidden md:block', active || viewing ? 'text-ink-1' : kind === 'later' ? 'text-ink-3' : 'text-ink-2'),
          )}
        >
          {label}
        </span>
        {isBuild && note ? <span className="-mt-1 whitespace-nowrap text-2xs text-ink-3">{note}</span> : null}
      </button>
    </li>
  )
}

export function SpineStrip({ stations, uLit, done, total, onActivate, onHover, children, className }: SpineStripProps) {
  const n = stations.length
  const lit = Math.max(0, Math.min(1, uLit))
  return (
    // 56 px aside: the first and last stations are centred on the rail's ends, and their labels
    // ("DISCOVERY", "CLOSE") need the room — the shell clips what the strip does not keep inside.
    <div className={cn('relative px-14', className)} data-spine-strip="">
      <div className="relative" style={{ height: 64 }}>
        {/* The rail: the hairline is the whole journey, the lit line the finished part of it. */}
        <div
          role="progressbar"
          aria-label="stages done"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-valuetext={stripProgressText(done, total)}
          className="absolute inset-x-0 h-0.5"
          style={{ top: STRIP_RAIL_Y - 1 }}
        >
          <span aria-hidden="true" data-strip-unlit="" className="absolute inset-x-0 top-px block h-px bg-strip-unlit" />
          <svg aria-hidden="true" focusable="false" className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none">
            <line data-strip-rail="" x1="0" y1="1" x2={`${lit * 100}%`} y2="1" pathLength={100} strokeWidth={2} strokeLinecap="round" className="stroke-strip-lit" />
          </svg>
        </div>
        <ol className="relative m-0 h-full list-none p-0">
          {stations.map((station, i) => (
            <Station key={station.id} station={station} u={stationU(i, n)} onActivate={onActivate} onHover={onHover} />
          ))}
        </ol>
      </div>
      {children}
    </div>
  )
}

/** The eyebrow colour class, re-exported so the host's group captions match the labels. */
export const STRIP_LABEL_CLASS = EYEBROW_CLASS
