// Mine / Team / All (togo-command-center.md §3.1): a view filter over the lanes, never a count.
// Mine needs an identity (`NO_ACTOR` otherwise); Team needs a roster that knows me (`NO_ROSTER`
// otherwise). The kit's Segmented carries each option's own disabled reason.
import { NO_ACTOR, NO_ROSTER } from '../../../shared/reasons'
import { Segmented, type SegmentedOption } from '../../ui'
import type { LaneFilterMode } from './laneModel'

export interface LaneFilterProps {
  value: LaneFilterMode
  onChange: (mode: LaneFilterMode) => void
  me: string | null
  /** The signed-in person's roster team, or null when the roster has no row for them. */
  team: string | null
  className?: string
}

export function laneFilterOptions(me: string | null, team: string | null): SegmentedOption<LaneFilterMode>[] {
  return [
    { value: 'mine', label: 'Mine', disabled: !me, disabledReason: me ? undefined : NO_ACTOR },
    { value: 'team', label: 'Team', disabled: !team, disabledReason: team ? undefined : NO_ROSTER },
    { value: 'all', label: 'All' },
  ]
}

export function LaneFilter({ value, onChange, me, team, className }: LaneFilterProps) {
  return (
    <Segmented<LaneFilterMode>
      label="Show"
      tone="neutral"
      size="sm"
      options={laneFilterOptions(me, team)}
      value={value}
      onChange={onChange}
      className={className}
      data-testid="lane-filter"
    />
  )
}
