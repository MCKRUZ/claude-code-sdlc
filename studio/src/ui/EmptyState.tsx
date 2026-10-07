// #14 EmptyState: "Nothing is currently in progress…" and its siblings. The existing sentences
// are passed verbatim as `title` / `body` because tests find them by text; the component only
// adds the frame, the optional action ("Create", "Open the Board") and, round 2 (B6), an optional
// `figure` drawn in the product's vocabulary. One frame for every empty state (dashed hairline,
// 20 px / 24 px air) so screens stop inventing their own. `figure` wins over `icon` when both are
// given; neither is content — the words are.
import { forwardRef } from 'react'
import type { EmptyStateProps } from './contract'
import { cn } from './cn'
import { EmptyFigure } from './emptyFigures'
import { Icon } from './Icon'

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { icon, figure, title, body, action, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('flex flex-col items-start gap-2 rounded-xl border border-dashed border-line-2 px-5 py-6', className)}
      {...rest}
    >
      {figure ? <EmptyFigure figure={figure} className="mb-1" /> : icon ? <Icon icon={icon} size={18} className="text-ink-4" /> : null}
      <p className="text-sm font-medium text-ink-2">{title}</p>
      {body ? <p className="mt-0.5 text-xs text-ink-3">{body}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
})
