// #11 Badge: the WorkflowTab step states and the "Now" marker. The text is always rendered and
// the kind only adds colour and a glyph, so "complete" and "locked" never collapse to two
// differently coloured circles.
import { forwardRef } from 'react'
import { Check, Circle, Lock, Sparkles, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { BadgeKind, BadgeProps } from './contract'
import { cn } from './cn'
import { Icon } from './Icon'

const KIND: Record<BadgeKind, { className: string; icon: LucideIcon }> = {
  complete: { className: 'bg-stage-signed-bg text-stage-signed-ink', icon: Check },
  current: { className: 'bg-stage-current-bg text-stage-current-ink', icon: Circle },
  locked: { className: 'bg-surface-2 text-ink-3', icon: Lock },
  now: { className: 'bg-accent-600 text-white', icon: Sparkles },
  ready: { className: 'bg-status-ok-bg text-status-ok-ink', icon: Check },
  notReady: { className: 'bg-status-warn-bg text-status-warn-ink', icon: XCircle },
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge({ kind, className, children, ...rest }, ref) {
  const { className: tone, icon } = KIND[kind]
  return (
    <span
      ref={ref}
      data-badge-kind={kind}
      // Fixed 18 px height: a badge beside a chip or in a table row shares its baseline.
      className={cn('inline-flex h-[18px] items-center gap-1 rounded-full px-1.5 text-[11px] font-medium leading-none', tone, className)}
      {...rest}
    >
      <Icon icon={icon} size={12} />
      {children}
    </span>
  )
})
