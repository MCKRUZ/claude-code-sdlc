// #18 DefinitionList: `<dl>/<dt>/<dd>` for DocumentSections, SpecStatusView (4 columns) and the
// HandoffDialog (3). Real definition semantics, so a reader hears "term, detail" pairs rather
// than a grid of unrelated cells.
import { forwardRef } from 'react'
import type { DefinitionListProps } from './contract'
import { cn } from './cn'

const COLUMNS = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
} as const

export const DefinitionList = forwardRef<HTMLDListElement, DefinitionListProps>(function DefinitionList(
  { items, columns = 1, className, ...rest },
  ref,
) {
  return (
    <dl ref={ref} className={cn('grid gap-x-4 gap-y-2 text-xs', COLUMNS[columns], className)} {...rest}>
      {items.map((item, i) => (
        <div key={item.key ?? i} className="min-w-0">
          <dt className="text-ink-3">{item.term}</dt>
          <dd className="mt-0.5 text-ink-1">{item.detail}</dd>
        </div>
      ))}
    </dl>
  )
})
