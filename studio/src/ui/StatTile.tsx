// #15 StatTile: the ExplainViews measure tiles. `value: null` renders NoData with the producing
// sentence, never a 0. The count-up (§4 #11) belongs to the motion layer: the tile exposes the
// number and its known predecessor as data attributes (`data-value`, `data-previous`) and the
// motion layer's `useCountUp` consumer tweens between them only when both are finite — the kit
// itself never animates, so the tile is correct with no motion layer mounted at all.
import { forwardRef } from 'react'
import type { StatTileProps } from './contract'
import { cn } from './cn'
import { EYEBROW_CLASS } from './Eyebrow'
import { NoData } from './NoData'

export const StatTile = forwardRef<HTMLDivElement, StatTileProps>(function StatTile(
  { id, label, value, unit, hint, previous, noDataWhat, className, ...rest },
  ref,
) {
  const hasValue = typeof value === 'number' && Number.isFinite(value)
  const hintId = `${id}-hint`
  return (
    <div
      ref={ref}
      id={id}
      data-stat-tile={id}
      className={cn('rounded-xl border border-line-1 bg-surface-1 px-4 py-3', className)}
      {...rest}
    >
      <p className={EYEBROW_CLASS}>{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-ink-1" aria-describedby={hintId}>
        {hasValue ? (
          <>
            <span data-value={value} data-previous={typeof previous === 'number' ? previous : undefined}>
              {value}
            </span>
            {unit ? <span className="ml-1 text-sm font-medium text-ink-3">{unit}</span> : null}
          </>
        ) : (
          <NoData what={noDataWhat ?? 'Nothing has been measured for this tile yet.'} />
        )}
      </p>
      <p id={hintId} className="mt-1 text-xs text-ink-3">
        {hint}
      </p>
    </div>
  )
})
