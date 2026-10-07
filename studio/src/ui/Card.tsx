// #3 Card replaces ~93 `rounded-xl border border-slate-200 bg-white` strings. `data-flip-id`
// rides through the rest props untouched because the Flip choreographies (§4 #8) read it off the
// DOM; the kit itself never animates anything. `interactive` answers hover with an edge (border +
// one shadow step), never a fill change — a whole card flashing its background is noise.
import { forwardRef } from 'react'
import type { CardPadding, CardProps, CardTone } from './contract'
import { cn } from './cn'

export const CARD_TONE: Record<CardTone, string> = {
  default: 'border-line-1 bg-surface-1',
  inset: 'border-line-1 bg-surface-2',
  warn: 'border-status-warn-line bg-status-warn-bg',
  error: 'border-status-error-line bg-status-error-bg',
  ok: 'border-status-ok-line bg-status-ok-bg',
  info: 'border-accent-200 bg-accent-50',
}

const PADDING: Record<CardPadding, string> = {
  none: '',
  sm: 'px-3 py-2',
  md: 'px-4 py-3',
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { tone = 'default', padding = 'md', interactive = false, as = 'div', header, footer, className, children, ...rest },
  ref,
) {
  // Typed as 'div' so the shared rest props (all HTMLAttributes) apply to every allowed tag.
  const Tag = as as 'div'
  return (
    <Tag
      ref={ref as never}
      className={cn(
        'rounded-xl border text-ink-1',
        CARD_TONE[tone],
        interactive && 'transition-[border-color,box-shadow] duration-[120ms] hover:border-line-2 motion-safe:hover:shadow-1',
        !header && !footer && PADDING[padding],
        className,
      )}
      {...rest}
    >
      {header ? <div className={cn('border-b border-line-1', PADDING[padding === 'none' ? 'sm' : padding])}>{header}</div> : null}
      {header || footer ? <div className={PADDING[padding]}>{children}</div> : children}
      {footer ? <div className={cn('border-t border-line-1', PADDING[padding === 'none' ? 'sm' : padding])}>{footer}</div> : null}
    </Tag>
  )
})
