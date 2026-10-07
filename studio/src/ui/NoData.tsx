// #5 NoData: the words "no data" plus the sentence saying what would produce some. It takes no
// number on purpose — Studio computes no status, and a 0 where nothing was measured is a
// fabrication the scorecard scripts refuse to make; the UI holds the same line.
import { forwardRef } from 'react'
import type { NoDataProps } from './contract'
import { cn } from './cn'

export const NoData = forwardRef<HTMLSpanElement, NoDataProps>(function NoData({ what, className, ...rest }, ref) {
  return (
    <span ref={ref} className={cn('inline-flex flex-wrap items-baseline gap-x-1.5 text-xs', className)} {...rest}>
      <span className="font-medium text-ink-3" data-no-data="">
        no data
      </span>
      <span className="text-ink-3">{what}</span>
    </span>
  )
})
