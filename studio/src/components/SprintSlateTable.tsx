import { useEffect, useRef, useState } from 'react'
import type { BoardRow, SprintSlateRow } from '../../shared/types'
import { laneBadge, slateToBoardRow, type ChipTone } from '../../shared/sprintModel'
import { Chip, DataTable, type ChipTone as KitChipTone, type DataTableColumn } from '../ui'

/** The sprint model's four tones on the kit's chip. `muted` keeps the neutral chip and dims the
 * text itself, since the kit has no "quieter neutral" and inventing one would be a new colour. */
export const LANE_TONE: Record<ChipTone, KitChipTone> = {
  neutral: 'neutral',
  good: 'ok',
  attention: 'warn',
  muted: 'neutral',
}

/** A spec's status is a STATE, so it wears a chip (G4-4). `ready` is the same idea as "now" and
 * takes the stage-current tone; in-flight is the accent; merged is the one signed fact; draft and
 * deferred are quiet. Studio never computes the status — the word is the plugin's. */
function statusTone(status: string): KitChipTone {
  switch (status) {
    case 'ready': return 'current'
    case 'in-flight': return 'accent'
    case 'merged': return 'ok'
    default: return 'neutral'
  }
}

export function SprintChip({ tone, children, testId }: { tone: ChipTone; children: React.ReactNode; testId?: string }) {
  return (
    <Chip tone={LANE_TONE[tone]} data-testid={testId} className={tone === 'muted' ? 'text-ink-3' : undefined}>
      {children}
    </Chip>
  )
}

/** The DoR column keeps its `<details>` INSIDE the cell rather than in the table's details row:
 * the sprint spec counts `details[open]` after clicking the first NOT READY summary, and the
 * SprintBoard test reads the summary's tag name — both hold only if the disclosure is the
 * checker's lines and nothing else. NOT READY keeps its exact text and the literal `amber`: it is
 * a warn-class fact and three exact-text matches are pinned on it. */
function DorCell({ row }: { row: SprintSlateRow }) {
  if (row.dor === 'READY') return <span className="font-medium text-status-ok-ink">READY</span>
  return (
    <details>
      <summary className="cursor-pointer font-medium text-amber-800">NOT READY</summary>
      <ul className="mt-1 space-y-0.5 text-ink-2">
        {row.dorBlocking.length === 0 ? <li>the checker gave no line</li>
          : row.dorBlocking.map((line) => <li key={line}>{line}</li>)}
      </ul>
    </details>
  )
}

function columnsFor(onOpenSpec?: (row: BoardRow) => void): DataTableColumn<SprintSlateRow>[] {
  return [
    {
      id: 'spec', header: 'Spec', mono: true,
      // The id is a link-like control, so it reads as an identifier: accent mono, tabular.
      cell: (row) => (onOpenSpec ? (
        <button
          type="button"
          onClick={() => onOpenSpec(slateToBoardRow(row))}
          data-flip-id={`spec:${row.id}`}
          className="font-mono text-xs font-medium tabular-nums text-accent-700 hover:text-accent-800"
        >
          {row.id}
        </button>
      ) : row.id),
    },
    { id: 'name', header: 'Name', cell: (row) => row.name },
    { id: 'risk', header: 'Risk', cell: (row) => <span className="font-medium">{row.risk}</span> },
    { id: 'type', header: 'Type', cell: (row) => row.type || '—' },
    { id: 'status', header: 'Status', cell: (row) => <Chip size="xs" tone={statusTone(row.status)}>{row.status}</Chip> },
    { id: 'dor', header: 'DoR', cell: (row) => <DorCell row={row} /> },
    { id: 'eng', header: 'Eng', cell: (row) => { const b = laneBadge(row.engReview); return <SprintChip tone={b.tone}>{b.label}</SprintChip> } },
    { id: 'data', header: 'Data', cell: (row) => { const b = laneBadge(row.dataReview); return <SprintChip tone={b.tone}>{b.label}</SprintChip> } },
    { id: 'owner', header: 'Next owner', cell: (row) => row.nextOwner || '—' },
    {
      id: 'deps', header: 'Depends on', mono: true,
      cell: (row) => <span className="font-mono tabular-nums">{row.dependsOn.length > 0 ? row.dependsOn.join(', ') : '—'}</span>,
    },
  ]
}

/** The slate as the plugin's text table shows it, one row per slated spec. A row opens the spec
 * view when the screen can open one; otherwise it is text. `rowProps` carries the pinned
 * `sprint-slate-row` / `data-spec` onto each `<tr>`; `data-reveal` marks the rows for the
 * first-arrival stagger (§4.2 #4). `dense` stays. */
export function SlateTable({ rows, onOpenSpec }: { rows: SprintSlateRow[]; onOpenSpec?: (row: BoardRow) => void }) {
  return (
    <SlateScroller>
      <DataTable<SprintSlateRow>
        label="Sprint slate"
        columns={columnsFor(onOpenSpec)}
        rows={rows}
        rowKey={(row) => row.id}
        rowProps={(row) => ({ 'data-testid': 'sprint-slate-row', 'data-spec': row.id, 'data-reveal': '' } as React.ComponentPropsWithoutRef<'tr'>)}
        dense
      />
    </SlateScroller>
  )
}

export const SLATE_SCROLLER_LABEL = 'Sprint slate, scrolls sideways'

/** The slate has ten columns and the Sprint screen's column is ≈ 720 px wide, so the right-hand
 * ones ("Depends on") sat past the edge with no sign they were there — macOS hides the scrollbar
 * (observatory v4 critique, sprint-table). This is the one scroll box: the kit table's own
 * wrapper is told not to clip (the border and corners move out here so they stay around the
 * visible box), the scroller is a labelled, focusable region so a keyboard user can reach and
 * scroll it, and a fade on the right edge appears ONLY while there is more to the right — read
 * from the box's own scroll metrics on scroll and resize, never assumed. */
function SlateScroller({ children }: { children: React.ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null)
  const [moreRight, setMoreRight] = useState(false)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => setMoreRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 1)
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    // The scroller's own box is constant; it is the table INSIDE it that grows when rows arrive,
    // so both are watched — otherwise the fade never appears on a table that filled in later.
    ro?.observe(el)
    if (el.firstElementChild) ro?.observe(el.firstElementChild)
    return () => {
      el.removeEventListener('scroll', measure)
      ro?.disconnect()
    }
  }, [children])
  return (
    <div data-testid="sprint-slate" className="relative">
      <div
        ref={scroller}
        role="region"
        aria-label={SLATE_SCROLLER_LABEL}
        tabIndex={0}
        data-more-right={moreRight ? '' : undefined}
        className="overflow-x-auto rounded-xl border border-line-1 bg-surface-1 [&>div]:overflow-visible [&>div]:rounded-none [&>div]:border-0"
      >
        {children}
      </div>
      {moreRight ? (
        // The gradient is an inline style on purpose: the Tailwind gradient utilities compiled to
        // custom properties only in the production build (observatory v6 probe: the fade element was
        // present, measured true, and painted nothing), and a plain `background-image` cannot miss.
        <div
          aria-hidden="true"
          data-testid="sprint-slate-fade"
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 rounded-r-xl"
          style={{ backgroundImage: 'linear-gradient(to left, var(--color-surface-1), transparent)' }}
        />
      ) : null}
    </div>
  )
}
