import { useEffect, useRef, useState } from 'react'
import type { BoardRow, SprintSlateRow } from '../../shared/types'
import { dorChipTone, laneBadge, riskTone, slateToBoardRow, statusTone, type ChipTone } from '../../shared/sprintModel'
import { ChevronRight } from 'lucide-react'
import { CHIP_TONE, Chip, DataTable, Icon, type ChipTone as KitChipTone, type DataTableColumn } from '../ui'

/** The sprint model's four tones on the kit's chip. `muted` keeps the neutral chip and dims the
 * text itself, since the kit has no "quieter neutral" and inventing one would be a new colour. */
export const LANE_TONE: Record<ChipTone, KitChipTone> = {
  neutral: 'neutral',
  good: 'ok',
  attention: 'warn',
  muted: 'neutral',
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
 * checker's lines and nothing else. NOT READY keeps its exact text and the `<summary>` tag, and
 * both verdicts wear the ONE DoR chip tone every screen uses (`dorChipTone`: READY is "now",
 * never green; NOT READY is the warn class the checker's MUST lines earn). The `<summary>` IS the
 * chip — the kit's tone classes on the summary element itself, its dot an `aria-hidden` span
 * with no text — so the words "NOT READY" stay a direct text child of the summary (the
 * SprintBoard test reads that tag name) and `summary.textContent` is still exactly "NOT READY"
 * for the three exact-text matches pinned on it. The cell is wide enough for the two words on one
 * line (`min-w-[7rem] whitespace-nowrap`). C8: the default `::marker` triangle is hidden and the
 * kit's chevron (a sibling SVG, never a text node) turns on `[open]` — the same recipe as
 * `Disclosure`, applied here by hand because the cell's tags and text are pinned. */
function DorCell({ row }: { row: SprintSlateRow }) {
  if (row.dor === 'READY') return <Chip tone={dorChipTone('READY')} casing="state" dot>READY</Chip>
  return (
    <details className="group min-w-[7rem]">
      <summary className={`inline-flex h-[18px] cursor-pointer list-none items-center gap-1 whitespace-nowrap rounded-full px-1.5 text-[11px] font-medium leading-none [&::-webkit-details-marker]:hidden [&::marker]:hidden ${CHIP_TONE[dorChipTone('NOT READY')]}`} data-dor-chip="">
        <Icon icon={ChevronRight} size={12} className="transition-transform duration-[160ms] ease-[var(--ease-out)] group-open:rotate-90" />
        <span aria-hidden="true" className="h-[5px] w-[5px] rounded-full bg-status-warn-fill" />
        NOT READY
      </summary>
      <ul className="mt-1 space-y-0.5 whitespace-normal text-ink-2">
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
          className="font-mono text-xs font-medium tabular-nums text-accent-text hover:text-accent-text-hover"
        >
          {row.id}
        </button>
      ) : row.id),
    },
    { id: 'name', header: 'Name', cell: (row) => row.name },
    { id: 'risk', header: 'Risk', cell: (row) => <Chip size="xs" casing="identifier" tone={riskTone(row.risk)}>{row.risk || 'no tier'}</Chip> },
    { id: 'type', header: 'Type', cell: (row) => row.type || '—' },
    { id: 'status', header: 'Status', cell: (row) => <Chip size="xs" casing="state" tone={statusTone(row.status)}>{row.status}</Chip> },
    { id: 'dor', header: <span title="Definition of Ready">DoR</span>, cell: (row) => <DorCell row={row} /> },
    { id: 'eng', header: 'Eng', cell: (row) => { const b = laneBadge(row.engReview); return <SprintChip tone={b.tone}>{b.label}</SprintChip> } },
    { id: 'data', header: 'Data', cell: (row) => { const b = laneBadge(row.dataReview); return <SprintChip tone={b.tone}>{b.label}</SprintChip> } },
    { id: 'owner', header: <span title="Next owner">Next owner</span>, cell: (row) => row.nextOwner || '—' },
    {
      id: 'deps', header: <span title="Depends on">Depends on</span>, mono: true,
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
        //
        // 64 px, opaque for its first 30 % (observatory v9 critique, measured): the v8/v9 shots were
        // probed in the production window — the box was drawn (forced solid, 99.7 % of its pixels),
        // `moreRight` was true at every step of the walk, the labelled region was the one that
        // scrolled — and the darkest pixel per 4 px column across the old 40 px linear ramp read
        // 62 67 100 108 135 146 185 193 218 246: under 50 % white for the left half. Round 2 widened
        // the DoR cell and darkened the header voice (`ink-4` → `ink-3`), so "NEXT OWNER" now sat in
        // that half and read as a hard cut, not a fade (v7's zone held mostly space: 171 at its
        // left). Opaque at the border, then a 45 px dissolve, whatever word the box clips melts
        // before the edge instead of being chopped at it.
        <div
          aria-hidden="true"
          data-testid="sprint-slate-fade"
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 rounded-r-xl"
          style={{ backgroundImage: 'linear-gradient(to left, var(--color-surface-1) 30%, transparent)' }}
        />
      ) : null}
    </div>
  )
}
