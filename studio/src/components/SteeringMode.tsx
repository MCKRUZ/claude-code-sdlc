// Steering mode (togo-command-center.md §3.5; Area `steering`, `g t`, the overflow menu; a lazy
// chunk). A read-only presentation of the standard's numbers for a committee: `steer-bg`
// full-bleed (the Frame drops `<main>`'s padding and the shell steps back to mark · name · Leave),
// the Depth lockup at 48 px (one of the two Depth places), the tiles in two LABELLED rows —
// Outcomes, then Delivery (the DORA four with the escaped bugs) — on a fixed grid: 2 across, 3
// from 1280, 5 from 1440 (v12 critique #4: a committee view never truncates meaning, so the
// "produces" sentence is set in full and the field name sits on its own mono line, breaking at
// its own `_` / `.` seams first and anywhere only as the last resort — never "revie…" and never
// "medi|an"). Each labelled row is a PAGE the room snaps to (v13: the second row was sliced at
// the fold), so the committee sees whole rows or pages between them — never half a tile.
// The number at 56 px tabular and every other word at 24 px; provenance at 20 px.
// Every number names its `scorecard.py`
// field and, for a rate, the plugin's own base ("of 4 merged") so a measured 0 % is not a no-data
// 0; "no data" is two words that never animate or tint; counters tween number→number only. Zero
// `button[data-write]`, no `<input>`, no chat, no console — the host hides them; `Esc` leaves (the
// band's one button says so). The review page and the `.narrative.md` companions open read-only.
import { useEffect, useRef, useState } from 'react'
import type { NarrativeCoverage, OpenDocumentResult, Scorecard, StageDocument } from '../../shared/types'
import { NO_DATA, WINDOW_IS_A_LABEL } from '../../shared/reasons'
import { Button, Icon } from '../ui'
import { useCountUp } from '../motion/useCountUp'
import { useEnter } from '../motion/useEnter'
import { SteeringLockup } from './brand/figures'
import { MarkdownView } from './MarkdownView'
import { denominatorText, isDora, scorecardMeasures, shownValue, type ScorecardMeasure } from './ExplainScorecard'
import { BreakableField, fieldPieces } from './fieldName'

export const STEERING_WINDOW_DAYS = 14
export const SOURCE = `scorecard.py report --window-days ${STEERING_WINDOW_DAYS} --json`
/** On a tile the script and verb alone; the full line (with its window) is said once, under the title. */
export const SOURCE_SHORT = 'scorecard.py report'
/** `narrative_status.py`'s own suffix: the companion sits beside the artifact. */
export const NARRATIVE_SUFFIX = '.narrative.md'

/** The tile grid (v12 critique #4): 2 across, 3 from 1280, 5 from 1440 — five tiles per labelled
 * row, so a row never leaves one orphan tile on a line of its own. Window-measured: the room is
 * full-bleed, so the window IS the container. At 1440 the five tiles measure ≈ 243 px, under the
 * visual's 280 floor (§4); the floor yields here on purpose — four across would wrap the fifth
 * tile into a second row that the fold slices in half, and a committee screen must page cleanly
 * (`PAGE_CLASS`). From 1680 the five are ≥ 280 again. */
export const TILE_GRID_CLASS = 'grid gap-6 grid-cols-2 min-[1280px]:grid-cols-3 min-[1440px]:grid-cols-5'

/** The room is ONE board (v15 owner's note: "the first page leaves room under Outcomes" — paging
 * the Delivery row onto a second screen hid half the standard behind a scroll nobody expected).
 * Both labelled rows and the actions sit on the first page, and the tiles are sized so the whole
 * board fits a 1440×900 window (measured ≈ 830 px tall) — at a smaller window the pages container
 * is the one scroller and the board scrolls as a unit. A companion, when opened, is its own page
 * the room snaps to. Each page carries a 40 / 32 px padding. */
export const PAGES_CLASS = 'min-h-0 flex-1 overflow-y-auto overscroll-contain snap-y snap-mandatory'
export const PAGE_CLASS = 'flex min-h-full snap-start flex-col px-10 py-8'

/** A `scorecard.py` field split at its own seams — after each `_` and `.` — so a long name like
 * `security_review_wait_median_hours` breaks between words first. The pieces joined are the field
 * byte-for-byte (the seams stay on the piece before them). */
// (v13: the splitter and `BreakableField` moved to `fieldName.tsx` so the close screen's tiles
// break the same way; re-exported here so `fieldPieces` keeps its address for steering.test.)
export { fieldPieces }

/** The two provenance lines a tile ends with: the script and verb, then the field on a line of its own. */
function Provenance({ field }: { field: string }) {
  // The script and verb are said once under the title (`steering-source`); the tile carries the
  // field alone, on one mono line that breaks at its own seams.
  return (
    <p className="mt-2 font-mono text-[13px] leading-5 text-steer-nodata-ink [overflow-wrap:anywhere]" aria-label="source">
      <span className="block" data-field-name={field}><BreakableField field={field} /></span>
    </p>
  )
}

export interface SteeringModeProps {
  projectPath: string
  /** The active sprint's id, for the review page; null when none. */
  sprintId: string | null
  onExit: () => void
}

/** Companions the plugin reports PRESENT, with the path convention it writes them under. */
export function companionsFor(docs: readonly StageDocument[], coverage: NarrativeCoverage | null): Array<{ name: string; path: string }> {
  if (!coverage || !coverage.ok) return []
  const present = new Set(coverage.artifacts.filter((a) => a.status === 'present').map((a) => a.name))
  return docs.filter((d) => !d.folder && present.has(d.name)).map((d) => ({ name: d.name, path: d.path.replace(/\.md$/, NARRATIVE_SUFFIX) }))
}

export function SteeringMode({ projectPath, sprintId, onExit }: SteeringModeProps) {
  const root = useRef<HTMLElement>(null)
  useEnter(root, 'rise', { key: projectPath })
  const [card, setCard] = useState<Scorecard | null | undefined>(undefined)
  const [companions, setCompanions] = useState<Array<{ name: string; path: string }>>([])
  const [open, setOpen] = useState<{ name: string; doc: OpenDocumentResult } | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    window.studio.getScorecard(projectPath, STEERING_WINDOW_DAYS).then((c) => { if (live) setCard(c) }).catch(() => { if (live) setCard(null) })
    Promise.all([window.studio.getStageReadiness(projectPath, 'build'), window.studio.getNarrativeCoverage(projectPath, 'build')])
      .then(([stage, coverage]) => { if (live) setCompanions(companionsFor(stage.documents ?? [], coverage)) })
      .catch(() => { if (live) setCompanions([]) })
    return () => { live = false }
  }, [projectPath])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (open) { setOpen(null); return }
      onExit()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onExit, open])

  const openReview = async () => {
    if (!sprintId) return
    const result = await window.studio.openReport(projectPath, `.sdlc/reports/sprint-${sprintId}-review.html`)
    setReportError(result.ok ? null : (result.error ?? 'The review page could not be opened.'))
  }
  const openCompanion = async (c: { name: string; path: string }) => {
    const doc = await window.studio.openDocument(projectPath, c.path)
    setOpen({ name: c.name, doc })
  }

  return (
    // The room fills <main> (which drops its padding here) and never grows past it: the pages
    // container inside is the one scroller, so the shell's "only <main> scrolls" law holds — <main>
    // has nothing to scroll — and each page snaps whole to the top.
    <section ref={root} data-testid="steering-mode" aria-label="Steering mode" className="flex h-full min-h-full flex-col bg-steer-bg text-steer-label text-steer-label-ink">
      <div className={PAGES_CLASS} data-testid={card ? 'steering-tiles' : undefined} data-steer-pages="">
        <div className={PAGE_CLASS} data-steer-page="board">
          <header className="flex h-12 shrink-0 items-center justify-between gap-6">
            <SteeringLockup />
            {sprintId && <span className="font-mono tabular-nums text-steer-label-ink" data-testid="steering-sprint">{sprintId}</span>}
          </header>
          <p className="mt-3 text-[20px] leading-7 text-steer-nodata-ink">
            The standard's numbers, as the plugin reports them. Window {STEERING_WINDOW_DAYS} days — {WINDOW_IS_A_LABEL}.
          </p>
          <p className="mt-1 font-mono text-[15px] leading-6 text-steer-nodata-ink [overflow-wrap:anywhere]" data-testid="steering-source">{SOURCE}</p>
          {card === undefined ? (
            <p role="status" aria-busy="true" className="mt-12 text-steer-label text-steer-nodata-ink">Reading the scorecard…</p>
          ) : card === null ? (
            <p role="alert" className="mt-12 text-steer-label text-steer-nodata-ink">The scorecard could not be read — these are not zeros, there are no numbers to show.</p>
          ) : (
            <TileRow label="Outcomes" group="outcomes" className="mt-5">
              {scorecardMeasures(card).filter((m) => !isDora(m)).map((m) => <SteerTile key={m.id} measure={m} />)}
            </TileRow>
          )}

        {card && (
          <>
            <TileRow label="Delivery" group="delivery" className="mt-5">
              {scorecardMeasures(card).filter(isDora).map((m) => <SteerTile key={m.id} measure={m} />)}
              <div className={TILE_CLASS} data-steer-tile="escaped-bugs">
                <p className={TILE_LABEL_CLASS}>Bugs that got through</p>
                {card.escaped_bugs.length === 0 ? (
                  <p className="mt-2 text-[20px] leading-7 text-steer-nodata-ink">none recorded in this window</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-[17px] leading-6 text-steer-number-ink">
                    {card.escaped_bugs.map((b, i) => <li key={i}>{String(b.summary ?? b.which_check ?? 'a bug')}</li>)}
                  </ul>
                )}
                <p className={TILE_PRODUCES_CLASS} data-produces="">a bug recorded after its change had merged</p>
                <Provenance field="escaped_bugs[]" />
              </div>
            </TileRow>

            <div className="mt-5 flex flex-wrap items-center gap-6" data-steer-actions="">
              <Button variant="secondary" className="h-12 px-5 text-xl" disabled={!sprintId} disabledReason={sprintId ? undefined : NO_DATA} onClick={openReview}>Open the review page</Button>
              {reportError && <p role="alert" className="text-steer-label text-status-error-ink">{reportError}</p>}
              {companions.length === 0 ? (
                <p className="text-steer-label text-steer-nodata-ink" data-testid="no-companions">no narrative companions — narrative_status.py reports none present for Build</p>
              ) : companions.map((c) => (
                <Button key={c.path} variant="ghost" className="h-12 px-5 text-xl" onClick={() => openCompanion(c)}>{c.name.replace(/\.md$/, '')} narrative</Button>
              ))}
            </div>
          </>
        )}
        </div>

        {card && open && (
          <div className={PAGE_CLASS} data-steer-page="companion">
            <article aria-label={`${open.name} narrative`} data-testid="steering-companion" className="rounded-[14px] border border-steer-tile-line bg-steer-tile p-8 text-steer-label text-steer-number-ink">
              <header className="flex items-center justify-between gap-4">
                <h3 className="text-steer-label font-semibold">{open.name.replace(/\.md$/, '')} — narrative companion</h3>
                <Button variant="ghost" className="h-10 px-4 text-base" onClick={() => setOpen(null)}>Close (Esc)</Button>
              </header>
              {open.doc.ok ? (
                <div className="mt-6 [&_p]:text-steer-label [&_li]:text-steer-label">
                  <MarkdownView source={open.doc.sections.map((s) => s.text).join('\n\n')} />
                </div>
              ) : <p className="mt-6 text-steer-nodata-ink">{open.doc.error ?? 'The companion could not be read.'}</p>}
              <p className="mt-6 font-mono text-[20px] leading-7 text-steer-nodata-ink">{open.doc.path}</p>
            </article>
          </div>
        )}
      </div>
    </section>
  )
}

/** A labelled row of tiles: the group's name in the label voice, then the tiles on `TILE_GRID_CLASS`. */
function TileRow({ label, group, className, children }: { label: string; group: string; className?: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} data-steer-group={group} className={['space-y-4', className].filter(Boolean).join(' ')}>
      <p className="text-steer-label text-steer-nodata-ink">{label}</p>
      <div className={TILE_GRID_CLASS} data-steer-grid="">{children}</div>
    </section>
  )
}

/** Tile sizes (v15): label 20/28, number 44/48, denominator and field in 13–14 px mono, the
 * sentence 17/24 — a tile is ≈ 240 px tall, so Outcomes and Delivery both sit on one board at
 * 1440×900 with nothing under a fold. */
export const TILE_CLASS = 'rounded-[14px] border border-steer-tile-line bg-steer-tile p-5'
export const TILE_LABEL_CLASS = 'text-[20px] leading-7 font-medium text-steer-label-ink'
export const TILE_PRODUCES_CLASS = 'mt-3 text-[17px] leading-6 text-steer-nodata-ink [text-wrap:pretty]'

function SteerTile({ measure }: { measure: ScorecardMeasure }) {
  const { shown, unit, words } = shownValue(measure)
  const counted = useCountUp(`steering.${measure.id}`, shown, { snap: measure.kind === 'percent' || measure.kind === 'count' ? 1 : 0.1 })
  const base = denominatorText(measure.denominator)
  return (
    <div className={TILE_CLASS} data-steer-tile={measure.id} data-field={measure.field}>
      <p className={TILE_LABEL_CLASS}>{measure.label}</p>
      {shown === null ? (
        <p className="mt-2 text-[20px] leading-7 text-steer-nodata-ink" data-no-data="">{words ?? 'no data'}</p>
      ) : (
        <>
          <p className="mt-1 text-[44px] leading-[48px] font-[650] tracking-[-0.02em] tabular-nums text-steer-number-ink" data-stat={measure.field}>
            <span ref={counted.ref}>{counted.text}</span>{unit && <span className="ml-2 text-[20px] font-medium text-steer-label-ink">{unit}</span>}
          </p>
          {base && <p className="font-mono text-[14px] leading-5 text-steer-nodata-ink" data-denominator={measure.denominator!.field}>{base}</p>}
        </>
      )}
      {/* The sentence in full — what one unit of this number is — wrapping to as many lines as it
          needs; a committee view never ends a meaning in an ellipsis. */}
      <p className={TILE_PRODUCES_CLASS} data-produces="">{measure.produces}</p>
      <Provenance field={measure.field} />
    </div>
  )
}

export default SteeringMode
