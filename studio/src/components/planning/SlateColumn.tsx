// Planning — middle column, the slate (togo-command-center.md §3.2, visual §4 "slate rows 56 px"):
// rows in the plugin's `build_order[]`, rows it did not list after under "order not given". One
// line per row — the build-order numeral in `--text-ident`, the id and name (never truncated to
// nothing: the name track is `minmax(12rem,1fr)`, a FLOOR, and the name wraps at its own
// hyphens — `break-word`, never `anywhere`, which lets the grid shrink a word to one letter per
// line), the DoR and risk chips, the Builder / Checker pickers (`RolePicker` → `assignRoles`) —
// a fixed `w-44` each inline when the column is ≥ 820 px wide, else on their own line under the
// name where the two share the row (`flex-1` over a 0 basis, ≥ 10 rem each) and a long value
// ellipsises with its full text in the title (v14: "Sam Kowalski (@sam-k" cut with no cue)
// — and the rest of
// the row (the HIGH line quoted verbatim from `ladder.rungs`, the people, `depends_on`, the
// Security signer slot that is always disabled with its reason, "Remove from slate" with the
// reason the plugin records) behind a disclosure on the row. The mix meter is three 6 px bars,
// actual over target, last sprint beside it as a number — never a chart.
import { useState } from 'react'
import type { BoardRow, RosterPerson, SpecReadinessFull, SprintMixTier, SprintSlateRow, SprintVerbResult, SprintView } from '../../../shared/types'
import { samePerson } from '../../../shared/identity'
import { ORDER_NOT_GIVEN, WAITING_FOR_PLUGIN_ANSWER } from '../../../shared/reasons'
import { dorChipTone, slateToBoardRow } from '../../../shared/sprintModel'
import { Button, Chip, Disclosure, Eyebrow, Textarea } from '../../ui'
import { PersonRing } from '../brand/figures'
import { highLines, mixMeter, riskTone, ringFor, slateInOrder, type SlateLine } from './planningModel'
import { RolePicker } from './RolePicker'
import { VerbResult } from './VerbResult'

export const REMOVE_FROM_SLATE = 'Remove from slate'
export const ROW_MORE = 'More on this row'

/** The slate row's line (v13 fixer round; owner's v12 item 2 re-opened at ≥ 1600 px). The name
 * track has a 12 rem FLOOR — at 1680 the column measured ≈ 723 px and two natural-width pickers
 * (≈ 190 each) plus the chips left the `minmax(0,1fr)` name ≈ 100 px, where `anywhere` broke
 * "duplicate-claim-409" into "dupl / icate- / claim-409". The pickers join the line only from
 * `SLATE_INLINE_PX`: numeral 32 + name 192 + chips ≈ 140 + 2 × 176 pickers + gaps ≈ 48 = 764,
 * rounded up to 820 so the name keeps ≥ 12 rem with room; below it they take their own line. */
export const SLATE_INLINE_PX = 820
export const SLATE_NAME_TRACK = 'minmax(12rem,1fr)'
export const SLATE_LINE_CLASS = `grid grid-cols-[2rem_${SLATE_NAME_TRACK}_auto] items-start gap-x-3 gap-y-1.5 @min-[${SLATE_INLINE_PX}px]:grid-cols-[2rem_${SLATE_NAME_TRACK}_auto_auto] @min-[${SLATE_INLINE_PX}px]:items-center`
export const SLATE_PICKERS_CLASS = `col-span-3 col-start-1 flex min-w-0 flex-wrap items-end gap-2 @min-[${SLATE_INLINE_PX}px]:col-span-1 @min-[${SLATE_INLINE_PX}px]:col-start-auto @min-[${SLATE_INLINE_PX}px]:flex-nowrap`
/** Each picker's SLOT once the pickers join the name's line: the fixed 11 rem the threshold is
 * derived from (`RolePicker`'s `COMPACT_SLOT_CLASS` makes it `flex-1` on its own line). */
export const SLATE_PICKER_SLOT_CLASS = `@min-[${SLATE_INLINE_PX}px]:w-44 @min-[${SLATE_INLINE_PX}px]:flex-none`

export interface SlateColumnProps {
  view: SprintView
  /** Board rows by spec id — a lookup by the plugin's own id for `developer` / `checker` / `path`. */
  boardById: Map<string, BoardRow>
  readiness: Map<string, SpecReadinessFull>
  people: readonly RosterPerson[]
  me: string | null
  lastSprint: { id: string; mix: Record<string, SprintMixTier> } | null
  writeReason?: string
  canAssign?: boolean
  busy: boolean
  lastResult: { spec: string; result: SprintVerbResult } | null
  onUnslate: (spec: string, reason: string) => void
  onAssign: (row: BoardRow, roles: { developer?: string; checker?: string }) => void
  onOpenSpec: (row: BoardRow) => void
}

export function SlateColumn(props: SlateColumnProps) {
  const { view, boardById, readiness, people, me, lastSprint, writeReason, canAssign, busy, lastResult, onUnslate, onAssign, onOpenSpec } = props
  const { ordered, unlisted } = slateInOrder(view)
  const bars = mixMeter(view.mix, lastSprint?.mix ?? null)
  const [removing, setRemoving] = useState<{ spec: string; reason: string } | null>(null)

  const line = (l: SlateLine) => {
    const board = boardById.get(l.row.id)
    const row = board ?? slateToBoardRow(l.row)
    const high = highLines(readiness.get(l.row.id)?.ladder)
    const isHigh = l.row.risk.toUpperCase() === 'HIGH'
    const peopleOnRow = [row.owner, row.developer, row.checker].filter(Boolean).filter((h, i, a) => a.indexOf(h) === i)
    return (
      <li key={l.row.id} data-spec={l.row.id} data-order={l.order ?? 'none'} className="rounded-[10px] border border-line-1 bg-surface-1 px-3 py-2">
        {/* The line: numeral · id + name · chips, with the two pickers on a second line under the
            name (v12 critique #2: the slate names what is slated on EVERY row). `SLATE_LINE_CLASS`
            holds the tracks and the inline threshold; the name button wraps at word seams only. */}
        <div className={SLATE_LINE_CLASS} data-slate-line="">
          <span className={`pt-0.5 font-mono text-ident tabular-nums text-ink-3 @min-[${SLATE_INLINE_PX}px]:pt-0`} aria-label={l.order === null ? ORDER_NOT_GIVEN : `build order ${l.order}`}>{l.order ?? '—'}</span>
          <button type="button" className="min-w-0 text-left leading-5 [overflow-wrap:break-word]" title={`${l.row.id} — ${l.row.name}`} onClick={() => onOpenSpec(row)}>
            <span className="font-mono text-ident text-accent-text">{l.row.id}</span>
            <span className="ml-2 text-sm font-medium text-ink-1">{l.row.name}</span>
          </button>
          <span className={`flex shrink-0 items-center gap-1.5 pt-0.5 @min-[${SLATE_INLINE_PX}px]:pt-0`}>
            <Chip tone={dorChipTone(l.row.dor)} casing="state" dot>{l.row.dor}</Chip>
            <Chip tone={riskTone(l.row.risk)} casing="identifier">{l.row.risk}</Chip>
          </span>
          <span className={SLATE_PICKERS_CLASS} data-slate-pickers="">
            <RolePicker role="developer" spec={l.row.id} value={row.developer} people={people} canAssign={canAssign} busy={busy} compact className={SLATE_PICKER_SLOT_CLASS} onChange={(h) => onAssign(row, { developer: h })} />
            <RolePicker role="checker" spec={l.row.id} value={row.checker} people={people} developer={row.developer} canAssign={canAssign} busy={busy} compact className={SLATE_PICKER_SLOT_CLASS} onChange={(h) => onAssign(row, { checker: h })} />
          </span>
        </div>
        <Disclosure summary={<span className="text-xs text-ink-3">{ROW_MORE}</span>} className="mt-1" data-testid="slate-row-more">
          <div className="mt-2 space-y-2">
            {isHigh && <RolePicker role="security" spec={l.row.id} value="" people={people} onChange={() => {}} />}
            {high.length > 0 && (
              <ul className="text-xs text-ink-2" aria-label={`HIGH rungs for ${l.row.id}`}>
                {high.map((r) => <li key={r}>“{r}”</li>)}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
              {peopleOnRow.map((h) => {
                const ring = ringFor(people, h)
                return <PersonRing key={h} initials={ring.initials} name={ring.name} you={samePerson(h, me)} />
              })}
              {l.row.dependsOn.length > 0 && <span className="font-mono text-ident">depends on {l.row.dependsOn.join(', ')}</span>}
              <Button size="sm" variant="ghost" data-write="" className="ml-auto" disabled={Boolean(writeReason) || busy} disabledReason={writeReason ?? (busy ? WAITING_FOR_PLUGIN_ANSWER : undefined)} onClick={() => setRemoving({ spec: l.row.id, reason: '' })}>
                {REMOVE_FROM_SLATE}
              </Button>
            </div>
            {removing?.spec === l.row.id && (
              <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (removing.reason.trim()) { onUnslate(l.row.id, removing.reason.trim()); setRemoving(null) } }}>
                <Textarea size="sm" rows={2} aria-label={`Reason for removing ${l.row.id}`} placeholder="the reason the plugin records (--reason)" value={removing.reason} onChange={(e) => setRemoving({ spec: l.row.id, reason: e.target.value })} />
                <div className="flex gap-2">
                  <Button size="sm" type="submit" variant="danger" data-write="" disabled={!removing.reason.trim()} disabledReason="unslate needs a reason">Remove with this reason</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
                </div>
              </form>
            )}
          </div>
        </Disclosure>
        {lastResult?.spec === l.row.id && <VerbResult compact className="mt-2" result={lastResult.result} />}
      </li>
    )
  }

  return (
    <section aria-label="The slate" data-testid="planning-slate" className="@container flex min-w-0 flex-col rounded-[14px] bg-plan-slate p-2 ring-1 ring-line-1">
      <header className="flex h-10 items-center justify-between border-b border-lane-line px-2">
        <Eyebrow as="h3">The slate</Eyebrow>
        <span className="text-lane-count tabular-nums text-ink-1" data-stat="slated">{view.slate.length}{view.sprint?.target !== null && view.sprint?.target !== undefined ? <span className="text-sm text-ink-3"> of {view.sprint.target}</span> : null}</span>
      </header>

      <div className="mt-2 rounded-[10px] bg-surface-2 p-3" data-testid="mix-meter">
        <Eyebrow>Risk mix · actual over target{lastSprint ? ` · last sprint ${lastSprint.id}` : ''}</Eyebrow>
        {bars.length === 0 ? <p className="mt-1 text-xs text-ink-3">no data — the sprint names no mix</p> : (
          <ul className="mt-2 space-y-1.5">
            {bars.map((b) => (
              <li key={b.tier} className="grid grid-cols-[56px_1fr_auto] items-center gap-2 text-xs" data-mix-tier={b.tier}>
                <span className="font-mono text-ident text-ink-2">{b.tier}</span>
                <span className="relative block h-1.5 rounded-full bg-line-2" aria-hidden="true">
                  {b.fill !== null && <span className="absolute inset-y-0 left-0 rounded-full bg-accent-600" style={{ width: `${Math.round(b.fill * 100)}%` }} />}
                </span>
                <span className="tabular-nums text-ink-2">
                  {b.actual} / {b.target === null ? 'no target' : b.target}
                  {b.last !== null && <span className="text-ink-3"> · last {b.last}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {/* The mix gap is ONE fact with ONE meaning on every screen: the same warn-tone chip the
            sprint header wears (`SprintHeader`, `data-mix-warning`) — a measured gap, never the
            error tone (v13: the slate said it in red while the home said it in amber). */}
        {view.mixWarnings.length > 0 && (
          <ul className="mt-2 flex flex-wrap items-center gap-1" data-testid="slate-mix-warnings" title="sprint.py status --json · mix_warnings">
            {view.mixWarnings.map((w) => <li key={w}><Chip tone="warn" size="xs" dot data-mix-warning="">{w}</Chip></li>)}
          </ul>
        )}
      </div>

      {view.slate.length === 0 ? (
        <p className="mt-3 px-2 text-sm text-ink-3">Nothing slated yet. Add a candidate from the backlog or apply the plugin's proposal.</p>
      ) : (
        <>
          <ul className="mt-2 space-y-2" role="list" aria-label="Slate in build order">{ordered.map(line)}</ul>
          {unlisted.length > 0 && (
            <>
              <Eyebrow className="mt-3 px-2">{ORDER_NOT_GIVEN}</Eyebrow>
              <ul className="mt-1 space-y-2" role="list" aria-label={ORDER_NOT_GIVEN}>{unlisted.map(line)}</ul>
            </>
          )}
        </>
      )}
    </section>
  )
}
