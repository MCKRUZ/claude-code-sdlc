// The sprint header (togo-command-center.md §3.1, visual §4 "Header block"): the title in
// `--text-sprint-title` — "S08 — Adjusters file without a phone call" — the state chip, a facts
// line (dates and ids in `--text-ident`, target, "n of cap" / "cap not set", the mix chips with
// `mix_warnings` in amber), and the BusinessDayBar. Every value is `sprint.py status --json`'s;
// the test ids `sprint-header / -state / -target / -wip` are kept from the old board. With no
// sprint the header is the plugin's own `note` plus ONE primary "New sprint" — disabled only for
// an honest reason (no actor, or a plugin without `sprint-write`).
import { Plus } from 'lucide-react'
import type { ActorInfo, SprintView } from '../../shared/types'
import { CAPABILITIES, NO_ACTOR, NO_DATA, newerPlugin } from '../../shared/reasons'
import { mixChips, sprintStateChip, targetLabel } from '../../shared/sprintModel'
import { Button, Chip, Eyebrow, cn } from '../ui'
import { CcEmptyFigure } from './brand/figures'
import { BusinessDayBar } from './BusinessDayBar'

export const SPRINT_SOURCE = 'sprint.py status --json'

/** "2 of 4", "2 in flight · cap not set", or "no data" when the plugin gave no count. */
export function wipText(wip: SprintView['wip']): string {
  if (wip.inFlight === null) return NO_DATA
  if (wip.cap === null) return `${wip.inFlight} in flight · cap not set`
  return `${wip.inFlight} of ${wip.cap}`
}

/** Why "New sprint" is disabled, or null when it may run. */
export function newSprintReason(actor: ActorInfo | null, capabilities: readonly string[]): string | null {
  if (!capabilities.includes(CAPABILITIES.sprintWrite)) return newerPlugin(CAPABILITIES.sprintWrite)
  if (!actor) return NO_ACTOR
  return null
}

export function SprintHeader({
  view, actor, capabilities, onNewSprint, className,
}: {
  view: SprintView
  actor: ActorInfo | null
  capabilities: readonly string[]
  /** Opens the `new` verb dialog (the host's VerbDialog). */
  onNewSprint: () => void
  className?: string
}) {
  const { sprint } = view
  if (sprint === null) {
    const reason = newSprintReason(actor, capabilities)
    return (
      // Not `sprint-header`: the sprint spec pins that id to a sprint's facts and counts it absent
      // when there is no sprint (sprint.spec "shows no table and no count").
      <header data-testid="sprint-home-empty" data-empty="" className={cn('flex flex-wrap items-center gap-6 rounded-[14px] border border-dashed border-line-2 px-6 py-5', className)}>
        <CcEmptyFigure figure="no-sprint" />
        <div className="min-w-0 flex-1 space-y-1">
          <p data-testid="sprint-empty" className="text-sm font-medium text-ink-2" title={SPRINT_SOURCE}>{view.note ?? NO_DATA}</p>
          <p className="text-xs text-ink-3">A sprint names a goal, a window and a target count; the lanes fill from its slate.</p>
        </div>
        <Button variant="primary" icon={Plus} disabled={reason !== null} disabledReason={reason ?? undefined} onClick={onNewSprint} data-write="">
          New sprint
        </Button>
      </header>
    )
  }

  // One chip for the sprint's state on every command-center screen (`sprintStateChip`): a state
  // is not a measured wait, so it never wears amber.
  const state = sprintStateChip(sprint.state)
  const chips = mixChips(view.mix)
  const dot = <span aria-hidden="true" className="text-ink-4">·</span>
  return (
    // Owner's v12 item 1: a cockpit header — eyebrow, title row, ONE facts line (the mix gap is a
    // warn-tone chip on it, a measured gap and never an error), then the day bar across the full
    // header width. 8 px between rows, not 12: the lanes start ≈ 150 px below the eyebrow.
    <header data-testid="sprint-header" data-cockpit-header="" className={cn('space-y-2', className)}>
      {/* The area eyebrow every screen opens with (round 2's PageHeader order): area · screen · id. */}
      <Eyebrow>Build · Sprint <span className="font-mono tabular-nums">{sprint.id}</span></Eyebrow>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-sprint-title text-ink-1" title={SPRINT_SOURCE}>
          <span className="font-mono tabular-nums">{sprint.id}</span>
          {sprint.goal && <span className="text-ink-2"> — {sprint.goal}</span>}
        </h2>
        <Chip tone={state.tone} casing="state" dot={state.dot} data-testid="sprint-state" className={state.muted ? 'text-ink-3' : undefined}>{state.label}</Chip>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-[18px] text-ink-2" title={SPRINT_SOURCE}>
        <span className="font-mono text-ident tabular-nums text-ink-3" data-source={`${SPRINT_SOURCE} · sprint.start/end`}>
          {sprint.start || '?'} → {sprint.end || '?'}
        </span>
        {dot}
        <span>target <span data-testid="sprint-target" className="font-medium text-ink-1 tabular-nums">{targetLabel(sprint.target)}</span></span>
        {dot}
        <span>WIP <span data-testid="sprint-wip" className="font-medium text-ink-1 tabular-nums" data-source={`${SPRINT_SOURCE} · wip`}>{wipText(view.wip)}</span></span>
        {dot}
        <span className="inline-flex items-center gap-1">
          <span className="text-ink-3">mix</span>
          {chips.length === 0
            ? <span data-testid="sprint-mix" className="text-ink-3">{NO_DATA}</span>
            : chips.map((c) => <Chip key={c.tier} tone="neutral" size="xs" data-testid="sprint-mix">{c.label}</Chip>)}
        </span>
        {/* `mix_warnings` ride the facts line as warn-tone chips: amber only because the plugin's
            own list is non-empty (visual §8 #4), each sentence whole. */}
        {view.mixWarnings.length > 0 && (
          <ul data-testid="sprint-mix-warnings" className="inline-flex flex-wrap items-center gap-1 text-status-warn-ink" title={`${SPRINT_SOURCE} · mix_warnings`}>
            {view.mixWarnings.map((w) => <li key={w}><Chip tone="warn" size="xs" dot data-mix-warning="">{w}</Chip></li>)}
          </ul>
        )}
        {sprint.readiedBy && <>{dot}<span className="text-ink-3">readied by {sprint.readiedBy}</span></>}
        {sprint.closedBy && <>{dot}<span className="text-ink-3">closed by {sprint.closedBy}</span></>}
      </div>
      <BusinessDayBar days={sprint.days} className="w-full" />
    </header>
  )
}
