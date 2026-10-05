import type { ReactNode } from 'react'

/** The "AI draft — accept/edit/discard" card. FieldEditor's own draft-review box and
 * ChatPanel's proposed-write card are the same visual and interaction pattern (a bordered
 * card, an uppercase label, the proposed content, and an accept/discard action row)
 * reimplemented twice — shared here so a future fix to that pattern is made once, not found
 * and reapplied in two places. `middleActions` is for a caller that needs something between
 * Accept and Discard (ChatPanel's Edit / Cancel-edit toggle); FieldEditor's simpler
 * accept-or-discard flow leaves it out. */
export function AiProposalCard({
  label, busy, onAccept, onDiscard, acceptLabel = 'Accept', discardLabel = 'Discard', middleActions, children,
}: {
  label: string
  busy: boolean
  onAccept: () => void
  onDiscard: () => void
  acceptLabel?: string
  discardLabel?: string
  middleActions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-brand-700">{label}</p>
      {children}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={onAccept}
          className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
        >
          {acceptLabel}
        </button>
        {middleActions}
        <button
          type="button"
          disabled={busy}
          onClick={onDiscard}
          className="ml-auto rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 disabled:opacity-40"
        >
          {discardLabel}
        </button>
      </div>
    </div>
  )
}
