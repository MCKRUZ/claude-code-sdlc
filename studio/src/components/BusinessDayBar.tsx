// The sprint's window as the plugin counted it (togo-command-center.md §3.1, visual §4): one
// 6 px segment per `days.total` business day, `elapsed` of them filled, the segment at index
// `elapsed` reading "today" while `remaining > 0`, the rest outlined. Every number is
// `sprint.py status --json`'s `days{total,elapsed,remaining}`: `remaining` is shown as given even
// when `total − elapsed` would say otherwise, and any null day means the plugin could not read
// the dates — then the bar is not drawn and the sentence `DATES_UNREADABLE` stands in its place.
// Nothing is derived from today's date in the renderer.
import { DATES_UNREADABLE } from '../../shared/reasons'
import { businessDays } from '../../shared/sprintModel'
import { cn } from '../ui'

export interface BusinessDays {
  total: number | null
  elapsed: number | null
  remaining: number | null
}

export type SegmentState = 'done' | 'today' | 'left'

/** The segment states, or null when any day is null (no bar). Pure, so a test needs no DOM. */
export function segmentStates(days: BusinessDays): SegmentState[] | null {
  const { total, elapsed, remaining } = days
  if (total === null || elapsed === null || remaining === null) return null
  if (!Number.isFinite(total) || total <= 0) return []
  const out: SegmentState[] = []
  for (let i = 0; i < total; i++) {
    if (i < elapsed) out.push('done')
    else if (i === elapsed && remaining > 0) out.push('today')
    else out.push('left')
  }
  return out
}

/** "10 business days · 4 elapsed · 6 remaining" — the plugin's three numbers, each named. */
export function daysSentence(days: BusinessDays): string {
  if (days.total === null || days.elapsed === null || days.remaining === null) return DATES_UNREADABLE
  return `${businessDays(days.total)} · ${days.elapsed} elapsed · ${days.remaining} remaining`
}

const SEGMENT: Record<SegmentState, string> = {
  done: 'bg-line-3',
  today: 'bg-strip-viewing',
  left: 'border border-line-2 bg-transparent',
}

export function BusinessDayBar({ days, source = 'sprint.py status --json · days', className }: { days: BusinessDays; source?: string; className?: string }) {
  const states = segmentStates(days)
  if (states === null) {
    return (
      <p data-testid="business-day-bar" data-bar="none" className={cn('text-xs text-ink-3', className)} title={source}>
        {DATES_UNREADABLE}
      </p>
    )
  }
  const label = daysSentence(days)
  return (
    <div data-testid="business-day-bar" data-bar="drawn" className={cn('space-y-1', className)} title={source}>
      <div role="img" aria-label={label} className="flex items-center gap-[3px]" data-stat="days">
        {states.map((state, i) => (
          <span key={i} data-segment={state} aria-hidden="true" className={cn('h-[6px] min-w-[6px] flex-1 rounded-[3px]', SEGMENT[state])} />
        ))}
      </div>
      <p className="font-mono text-ident tabular-nums text-ink-3" data-source={source}>{label}</p>
    </div>
  )
}
