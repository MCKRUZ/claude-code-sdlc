import type { ReactNode } from 'react'
import { Button, Card, Eyebrow } from '../ui'

/** The "AI draft — accept/edit/discard" card. FieldEditor's own draft-review box and
 * ChatPanel's proposed-write card are the same visual and interaction pattern (a bordered
 * card, an uppercase label, the proposed content, and an accept/discard action row)
 * reimplemented twice — shared here so a future fix to that pattern is made once, not found
 * and reapplied in two places. `middleActions` is for a caller that needs something between
 * Accept and Discard (ChatPanel's Edit / Cancel-edit toggle); FieldEditor's simpler
 * accept-or-discard flow leaves it out. `data-proposal-card` marks the root so the chat's
 * resolve choreography (§4 #14) can find the card it is about to collapse. */
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
    <Card tone="info" padding="sm" data-proposal-card="" className="rounded-lg">
      <Eyebrow className="text-accent-800">{label}</Eyebrow>
      {children}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button variant="primary" size="sm" disabled={busy} onClick={onAccept}>{acceptLabel}</Button>
        {middleActions}
        <Button variant="secondary" size="sm" disabled={busy} onClick={onDiscard} className="ml-auto">{discardLabel}</Button>
      </div>
    </Card>
  )
}
