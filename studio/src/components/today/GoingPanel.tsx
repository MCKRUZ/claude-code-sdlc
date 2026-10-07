// "How it is going" on the sprint home (togo-command-center.md §3.1): the steering scorecard
// reduced to the standard's numbers — accepted-as-is, review-wait median, security-review wait on
// its own line, rework / revert, bounce-back, escaped bugs, the DORA four — read from the command
// center's `scorecard` block (`scorecard.py report --json`) and drawn in `--text-metric`. Every
// null is the words "no data" with what would produce some; the window is a label only. No
// velocity, points, PR counts or lines — there is no place on this panel for one to appear.
import type { Scorecard, SourcedBlock } from '../../../shared/types'
import { NO_DATA, WINDOW_IS_A_LABEL } from '../../../shared/reasons'
import type { RefObject } from 'react'
import { cn, Eyebrow, EYEBROW_CLASS } from '../../ui'
import { denominatorFor, denominatorText, formatHours, NONE_RECORDED, type ScorecardMeasure } from '../ExplainScorecard'
import { useCountUp } from '../../motion/useCountUp'

const percent = (v: number) => `${Math.round(v * 100)}%`
const hours = formatHours
const count = (v: number) => String(Math.round(v))

export interface GoingMeasure {
  id: string
  label: string
  value: number | null
  format: (v: number) => string
  produces: string
  emphasis?: boolean
  /** The plugin's own base under a rate ("of 4 merged"), so a measured 0 % is not a no-data 0. */
  denominator?: ScorecardMeasure['denominator']
}

/** The measures in the standard's order; a list length (escaped bugs) is the plugin's own list. */
export function goingMeasures(card: Scorecard): GoingMeasure[] {
  const merged = denominatorFor(card.totals?.merges, 'merged', 'totals.merges')
  const deploys = denominatorFor(card.dora.deploy_count, 'deployments', 'dora.deploy_count')
  return [
    { id: 'accepted', label: 'Accepted as-is', value: card.accepted_as_is_rate, format: percent, produces: 'a merged spec recorded as accepted without rework', denominator: merged },
    { id: 'review-wait', label: 'Review wait · median', value: card.review_wait_median_hours, format: hours, produces: 'a review requested and answered' },
    { id: 'security-wait', label: 'Security review wait · median', value: card.security_review_wait_median_hours, format: hours, produces: 'a security review requested and answered', emphasis: true },
    { id: 'rework', label: 'Rework or revert', value: card.rework_revert_rate, format: percent, produces: 'a merged spec later reverted or reworked', denominator: merged },
    { id: 'bounce', label: 'Sent back', value: card.bounce_back_rate, format: percent, produces: 'a spec returned during checking', denominator: merged },
    { id: 'escaped', label: 'Escaped bugs', value: card.escaped_bugs.length === 0 ? null : card.escaped_bugs.length, format: count, produces: 'an escaped-bug event naming the check that should have caught it' },
    { id: 'deploys', label: 'Deployments', value: card.dora.deploy_count === 0 ? null : card.dora.deploy_count, format: count, produces: 'a recorded deployment' },
    { id: 'lead-time', label: 'Lead time · median', value: card.dora.lead_time_median_hours, format: hours, produces: 'a merged spec with a recorded deployment' },
    { id: 'change-fail', label: 'Change failure', value: card.dora.change_fail_rate, format: percent, produces: 'a deployment with a recorded outcome', denominator: deploys },
    { id: 'recover', label: 'Time to recover · median', value: card.dora.time_to_recover_median_hours, format: hours, produces: 'an incident opened and closed' },
  ]
}

export function GoingPanel({ block, windowLabel = '14 days', className }: { block: SourcedBlock<Scorecard>; windowLabel?: string; className?: string }) {
  return (
    <section data-testid="going-panel" aria-labelledby="going-title" className={cn('space-y-3', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Eyebrow as="h3" id="going-title">How it is going</Eyebrow>
        <span className="text-xs text-ink-3" title={block.source}>{windowLabel} · {WINDOW_IS_A_LABEL}</span>
      </div>
      {block.data === null ? (
        <p className="rounded-xl border border-dashed border-line-2 px-5 py-6 text-sm text-ink-2" data-testid="going-empty">
          <span className="font-medium text-ink-3">{NO_DATA}</span>{block.error ? <span className="text-ink-3"> · {block.error}</span> : null}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {goingMeasures(block.data).map((m) => <Metric key={m.id} measure={m} source={block.source} />)}
        </div>
      )}
    </section>
  )
}

function Metric({ measure, source }: { measure: GoingMeasure; source: string }) {
  const c = useCountUp(`going:${measure.id}`, measure.value, { snap: measure.format === percent ? 0.1 : 1, format: measure.format })
  return (
    <div data-stat={measure.id} className={cn('rounded-[10px] border bg-surface-1 px-3 py-2', measure.emphasis ? 'border-line-2' : 'border-line-1')} title={source}>
      <p className={EYEBROW_CLASS}>{measure.label}</p>
      {measure.value === null
        ? <p className="mt-1 text-xs"><span className="font-medium text-ink-3" data-no-data="">{measure.format === count ? NONE_RECORDED : NO_DATA}</span> <span className="text-ink-3">· needs {measure.produces}</span></p>
        : (
          <>
            <p ref={c.ref as RefObject<HTMLParagraphElement>} className="mt-1 text-metric tabular-nums text-ink-1">{c.text}</p>
            {denominatorText(measure.denominator) && <p className="font-mono text-ident text-ink-3" data-denominator={measure.denominator!.field}>{denominatorText(measure.denominator)}</p>}
          </>
        )}
    </div>
  )
}
