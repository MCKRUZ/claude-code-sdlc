// #4 Notice: the amber / red / green / blue banners. The warn tone keeps the literal legacy
// `amber` classes because SprintBoard.test.tsx:104 checks for the word; the other tones use the
// status tokens. `error` defaults to `role="alert"` (interrupts), `warn` to `role="status"`
// (polite) — the difference between "this failed" and "this is worth knowing".
import { forwardRef } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { NoticeProps, NoticeRole, NoticeTone } from './contract'
import { cn } from './cn'
import { Icon } from './Icon'

export const NOTICE_TONE: Record<NoticeTone, string> = {
  warn: 'border-amber-200 bg-amber-50 text-amber-800',
  error: 'border-status-error-line bg-status-error-bg text-status-error-ink',
  ok: 'border-status-ok-line bg-status-ok-bg text-status-ok-ink',
  info: 'border-accent-200 bg-accent-50 text-accent-800',
}

const DEFAULT_ROLE: Record<NoticeTone, NoticeRole> = {
  warn: 'status',
  error: 'alert',
  ok: 'status',
  info: 'none',
}

const DEFAULT_ICON: Record<NoticeTone, LucideIcon> = {
  warn: AlertTriangle,
  error: XCircle,
  ok: CheckCircle2,
  info: Info,
}

export const Notice = forwardRef<HTMLDivElement, NoticeProps>(function Notice(
  { tone, title, icon, actions, role, className, children, ...rest },
  ref,
) {
  const resolvedRole = role ?? DEFAULT_ROLE[tone]
  return (
    <div
      ref={ref}
      role={resolvedRole === 'none' ? undefined : resolvedRole}
      // A step more air than a chip row: the one notice a screen shows may hold a list.
      className={cn('flex items-start gap-2.5 rounded-[10px] border px-3.5 py-2.5 text-xs', NOTICE_TONE[tone], className)}
      {...rest}
    >
      <Icon icon={icon ?? DEFAULT_ICON[tone]} size={14} className="mt-[1px]" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-0.5')}>{children}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  )
})
