// The Spine's DOM view of equal rank (studio-observatory.md §5.1 "DOM-equivalent"): an
// `<ol aria-label="Lifecycle">` of the stations grouped under Foundation / Build / Ship / Close,
// each a real `<button>` reading display · state · signed-off by (or "no name recorded") ·
// entered · completed · artifacts, the current row carrying `Badge now`. Same click targets as
// the plates: a row activates `onActivate(stageId)` and the host navigates. Never `aria-current`
// (the Badge says it in words), never inside an `<aside>`.
//
// Round 2: the row of the stage being VIEWED (`viewedStageId`, I3) carries `data-viewing` and a
// `Badge kind="current"` reading "Viewing" — never `aria-current`, never `kind="now"`, which stays
// the plugin's "now". The long legend sentence is this table's caption (S3); the figure's own
// caption is the condensed `SPINE_CAPTION`.
import { Badge } from '../../ui/Badge'
import { EYEBROW_CLASS } from '../../ui/Eyebrow'
import { VisuallyHidden } from '../../ui/VisuallyHidden'
import { BUILD_VIEWS } from '../../../shared/nav'
import { stageStateLabel } from '../../../shared/stageLabel'
import type { SceneDataSpine, Station } from '../core/types'
import { artifactsText, formatStageDate, groupCaptions, signerText, SPINE_LEGEND } from './spineModel'

export interface SpineTableProps {
  data: SceneDataSpine
  onActivate: (stageId: string) => void
  /** Shared with the plates so a hovered row lights its station when the graph is also shown. */
  hoverId?: string | null
  onHover?: (id: string | null) => void
  className?: string
}

export const VIEWING_LABEL = 'Viewing'

const CELL = 'text-xs text-ink-2'

function Row({ station, onActivate, hovered, viewing, onHover }: {
  station: Station; onActivate: (id: string) => void; hovered: boolean; viewing: boolean; onHover?: (id: string | null) => void
}) {
  const later = station.kind === 'later'
  return (
    <li data-stage-id={station.id} data-stage-kind={station.kind} data-hovered={hovered ? '' : undefined} data-viewing={viewing ? '' : undefined}>
      <button
        type="button"
        onClick={() => onActivate(station.id)}
        onMouseEnter={onHover ? () => onHover(station.id) : undefined}
        onMouseLeave={onHover ? () => onHover(null) : undefined}
        onFocus={onHover ? () => onHover(station.id) : undefined}
        onBlur={onHover ? () => onHover(null) : undefined}
        className={[
          'grid w-full grid-cols-[minmax(8rem,1.4fr)_6rem_minmax(7rem,1fr)_6rem_6rem_6rem] items-center gap-x-3 rounded-md px-2 py-1 text-left',
          'hover:bg-surface-2',
          hovered ? 'bg-surface-2' : '',
          later ? 'text-ink-3' : 'text-ink-1',
        ].join(' ')}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          {/* The row navigates, so its name says so — and the "Go to " prefix keeps this
              button's accessible name from starting with the stage display, which is how the
              sidebar's stage button is named and how every e2e locates it (`/^Build Loop/`).
              Without it, mounting the Spine on a stage home made those locators ambiguous. */}
          <VisuallyHidden>Go to </VisuallyHidden>
          {station.display}
          {station.isCurrent ? <Badge kind="now">Now</Badge> : null}
          {viewing ? <Badge kind="current">{VIEWING_LABEL}</Badge> : null}
        </span>
        <span className={CELL}>{stageStateLabel(station)}</span>
        <span className={CELL}>{signerText(station)}</span>
        <span className={`${CELL} font-mono`}>{later ? '—' : formatStageDate(station.entered_at)}</span>
        <span className={`${CELL} font-mono`}>{later ? '—' : formatStageDate(station.completed_at)}</span>
        <span className={CELL}>{artifactsText(station.artifact_count)}</span>
      </button>
      {station.isBuild ? (
        <p className="m-0 px-2 pb-1 text-2xs text-ink-3">{BUILD_VIEWS.map((v) => v.label).join(' · ')}</p>
      ) : null}
    </li>
  )
}

export function SpineTable({ data, onActivate, hoverId = null, onHover, className }: SpineTableProps) {
  const groups = groupCaptions(data)
  const viewed = data.viewedStageId ?? null
  return (
    <>
      <ol aria-label="Lifecycle" className={['m-0 flex list-none flex-col gap-2 p-0', className].filter(Boolean).join(' ')} data-spine-table="">
        <li aria-hidden="true" className={`grid grid-cols-[minmax(8rem,1.4fr)_6rem_minmax(7rem,1fr)_6rem_6rem_6rem] gap-x-3 px-2 ${EYEBROW_CLASS}`}>
          <span>Stage</span>
          <span>State</span>
          <span>Signed off by</span>
          <span>Entered</span>
          <span>Completed</span>
          <span>Artifacts</span>
        </li>
        {groups.map((group) => (
          <li key={group.label} data-spine-group={group.label}>
            <span className={`block px-2 ${EYEBROW_CLASS}`} data-spine-group-header="">
              {group.label}
            </span>
            <ol aria-label={`${group.label} stages`} className="m-0 list-none p-0">
              {data.stations.slice(group.from, group.to + 1).map((station) => (
                <Row
                  key={station.id}
                  station={station}
                  onActivate={onActivate}
                  hovered={hoverId === station.id}
                  viewing={viewed !== null && viewed === station.id}
                  onHover={onHover}
                />
              ))}
            </ol>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-ink-3" data-spine-table-caption="">{SPINE_LEGEND}</p>
    </>
  )
}
