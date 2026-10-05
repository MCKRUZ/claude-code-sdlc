import type { ReactNode } from 'react'

/** Small pieces every part of the workshop-brief form (spec 0032) is built from. */

export const TEXT_INPUT =
  'w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-brand-600 focus:outline-none'

/** A titled block with its live counter, e.g. "2 of 5". */
export function Section({
  title, counter, counterId, children,
}: { title: string; counter?: string; counterId?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-xs font-semibold text-slate-800">{title}</h4>
        {counter !== undefined && <span data-testid={counterId} className="text-xs text-slate-600">{counter}</span>}
      </div>
      {children}
    </section>
  )
}

export function Reason({ children }: { children: ReactNode }) {
  return <p className="text-xs text-slate-500">{children}</p>
}

export function toggled(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

export function withoutIndex<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index)
}
