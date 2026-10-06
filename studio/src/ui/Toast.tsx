// #25 Toast: one notification card. Tone picks the icon and tints only the glyph — a coloured
// 4 px bar is a banner, a tinted glyph and a hairline clock are a notification. The text is
// always present. The progress rail is a CSS-driven `<span>` whose width the region controls via
// the `data-paused` attribute so hover/focus visibly stop the clock.
import { forwardRef, useEffect } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ToastItem, ToastTone } from './contract'
import { cn } from './cn'
import { Icon } from './Icon'
import { IconButton } from './IconButton'
import { shown } from './toastStore'

const TONE: Record<ToastTone, { icon: LucideIcon; glyph: string }> = {
  ok: { icon: CheckCircle2, glyph: 'text-status-ok-fill' },
  info: { icon: Info, glyph: 'text-accent-600' },
  warn: { icon: AlertTriangle, glyph: 'text-status-warn-fill' },
  error: { icon: XCircle, glyph: 'text-status-error-fill' },
}

export interface ToastProps {
  item: ToastItem
  onDismiss: (id: string) => void
  paused?: boolean
}

export const Toast = forwardRef<HTMLDivElement, ToastProps>(function Toast({ item, onDismiss, paused = false }, ref) {
  const { icon, glyph } = TONE[item.tone]
  useEffect(() => shown(item.id), [item.id])
  return (
    <div
      ref={ref}
      data-toast-tone={item.tone}
      data-paused={paused ? '' : undefined}
      className="pointer-events-auto relative flex w-[340px] items-start gap-2.5 overflow-hidden rounded-[10px] border border-line-1 bg-surface-raised px-3.5 py-2.5 text-xs text-ink-1 shadow-2"
    >
      <Icon icon={icon} size={14} className={cn('mt-0.5', glyph)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{item.title}</p>
        {item.detail ? <p className="mt-0.5 text-xs text-ink-3">{item.detail}</p> : null}
        {item.action ? (
          <button type="button" onClick={item.action.onClick} className="mt-1 text-xs font-medium text-accent-700 hover:underline">
            {item.action.label}
          </button>
        ) : null}
      </div>
      <IconButton label="Dismiss" icon={X} size="sm" onClick={() => onDismiss(item.id)} />
      {!item.sticky ? (
        <span aria-hidden="true" data-toast-rail="" className="absolute inset-x-0 bottom-0 h-px origin-left bg-ink-4/40" />
      ) : null}
    </div>
  )
})
