// Steering mode (togo-command-center.md §3.5; Area `steering`, `g t`, the overflow menu; a lazy
// chunk). A read-only presentation of the standard's numbers for a committee: `steer-bg`
// full-bleed (the Frame drops `<main>`'s padding and the shell steps back to mark · name · Leave),
// the Depth lockup at 48 px (one of the two Depth places), the tiles in two LABELLED rows —
// Outcomes, then Delivery (the DORA four with the escaped bugs) — each ≥ 240 px so both rows fit a
// 1440 × 900 wall without scrolling, the number at 56 px and every other word at 24 px, the
// provenance one line at 20 px that wraps rather than clips. Every number names its `scorecard.py`
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

export const STEERING_WINDOW_DAYS = 14
export const SOURCE = `scorecard.py report --window-days ${STEERING_WINDOW_DAYS} --json`
/** On a tile the script and verb alone; the full line (with its window) is said once, under the title. */
export const SOURCE_SHORT = 'scorecard.py report'
/** `narrative_status.py`'s own suffix: the companion sits beside the artifact. */
export const NARRATIVE_SUFFIX = '.narrative.md'

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
    <section ref={root} data-testid="steering-mode" aria-label="Steering mode" className="min-h-full bg-steer-bg p-12 text-steer-label text-steer-label-ink">
      <header className="flex h-16 items-center justify-between gap-6">
        <SteeringLockup />
        {sprintId && <span className="font-mono tabular-nums text-steer-label-ink" data-testid="steering-sprint">{sprintId}</span>}
      </header>
      <p className="mt-6 text-steer-label text-steer-nodata-ink">
        The standard's numbers, as the plugin reports them. Window {STEERING_WINDOW_DAYS} days — {WINDOW_IS_A_LABEL}.
      </p>
      <p className="mt-1 font-mono text-[20px] leading-7 text-steer-nodata-ink [overflow-wrap:anywhere]" data-testid="steering-source">{SOURCE}</p>

      {card === undefined ? (
        <p role="status" aria-busy="true" className="mt-12 text-steer-label text-steer-nodata-ink">Reading the scorecard…</p>
      ) : card === null ? (
        <p role="alert" className="mt-12 text-steer-label text-steer-nodata-ink">The scorecard could not be read — these are not zeros, there are no numbers to show.</p>
      ) : (
        <>
          <div className="mt-10 space-y-10" data-testid="steering-tiles">
            <TileRow label="Outcomes" group="outcomes">
              {scorecardMeasures(card).filter((m) => !isDora(m)).map((m) => <SteerTile key={m.id} measure={m} />)}
            </TileRow>
            <TileRow label="Delivery" group="delivery">
              {scorecardMeasures(card).filter(isDora).map((m) => <SteerTile key={m.id} measure={m} />)}
              <div className="rounded-[14px] border border-steer-tile-line bg-steer-tile p-6" data-steer-tile="escaped-bugs">
                <p className="text-steer-label text-steer-label-ink">Bugs that got through</p>
                {card.escaped_bugs.length === 0 ? (
                  <p className="mt-2 text-steer-label text-steer-nodata-ink">none recorded in this window</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-steer-label text-steer-number-ink">
                    {card.escaped_bugs.map((b, i) => <li key={i}>{String(b.summary ?? b.which_check ?? 'a bug')}</li>)}
                  </ul>
                )}
                <p className="mt-3 font-mono text-[20px] leading-7 text-steer-nodata-ink [overflow-wrap:anywhere]">{SOURCE_SHORT} · escaped_bugs[]</p>
              </div>
            </TileRow>
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-6">
            <Button variant="secondary" className="h-12 px-5 text-xl" disabled={!sprintId} disabledReason={sprintId ? undefined : NO_DATA} onClick={openReview}>Open the review page</Button>
            {reportError && <p role="alert" className="text-steer-label text-status-error-ink">{reportError}</p>}
            {companions.length === 0 ? (
              <p className="text-steer-label text-steer-nodata-ink" data-testid="no-companions">no narrative companions — narrative_status.py reports none present for Build</p>
            ) : companions.map((c) => (
              <Button key={c.path} variant="ghost" className="h-12 px-5 text-xl" onClick={() => openCompanion(c)}>{c.name.replace(/\.md$/, '')} narrative</Button>
            ))}
          </div>

          {open && (
            <article aria-label={`${open.name} narrative`} data-testid="steering-companion" className="mt-12 rounded-[14px] border border-steer-tile-line bg-steer-tile p-8 text-steer-label text-steer-number-ink">
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
          )}
        </>
      )}
    </section>
  )
}

/** A labelled row of tiles: the group's name in the label voice, then the tiles ≥ 240 px wide. */
function TileRow({ label, group, children }: { label: string; group: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} data-steer-group={group} className="space-y-4">
      <p className="text-steer-label text-steer-nodata-ink">{label}</p>
      <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">{children}</div>
    </section>
  )
}

function SteerTile({ measure }: { measure: ScorecardMeasure }) {
  const { shown, unit, words } = shownValue(measure)
  const counted = useCountUp(`steering.${measure.id}`, shown, { snap: measure.kind === 'percent' || measure.kind === 'count' ? 1 : 0.1 })
  const base = denominatorText(measure.denominator)
  return (
    <div className="rounded-[14px] border border-steer-tile-line bg-steer-tile p-6" data-steer-tile={measure.id} data-field={measure.field}>
      <p className="text-steer-label text-steer-label-ink">{measure.label}</p>
      {shown === null ? (
        <p className="mt-2 text-steer-label text-steer-nodata-ink" data-no-data="">{words ?? 'no data'}</p>
      ) : (
        <>
          <p className="mt-2 text-steer-number tabular-nums text-steer-number-ink" data-stat={measure.field}>
            <span ref={counted.ref}>{counted.text}</span>{unit && <span className="ml-2 text-steer-label text-steer-label-ink">{unit}</span>}
          </p>
          {base && <p className="font-mono text-[20px] leading-7 text-steer-nodata-ink" data-denominator={measure.denominator!.field}>{base}</p>}
        </>
      )}
      {/* One line each (the full text in `title`), so a tile stays ≈ 200 px and two rows fit the wall. */}
      <p className="mt-3 line-clamp-1 text-steer-label text-steer-nodata-ink" title={measure.produces}>{measure.produces}</p>
      <p className="mt-2 font-mono text-[20px] leading-7 text-steer-nodata-ink [overflow-wrap:anywhere]" aria-label="source">{SOURCE_SHORT} · {measure.field}</p>
    </div>
  )
}

export default SteeringMode
