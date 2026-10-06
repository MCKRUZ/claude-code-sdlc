import { useState } from 'react'
import { Button, Field, Input } from '../ui'

/** Deferring one spec. The suggestion is offered, never pre-filled — a default reason gets
 * accepted unread, which turns a record of why into a record of the tool's wording. */
export function DeferControl({
  projectPath, specName, actor, onDeferred, onRefused,
}: {
  projectPath: string
  specName: string
  actor: string
  onDeferred: () => void
  onRefused: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const suggestion = 'not needed for this release — '

  const submit = async () => {
    setBusy(true)
    const result = await window.studio.deferSpec(projectPath, `specs/${specName}.md`, reason, actor)
    setBusy(false)
    if (!result.ok) {
      onRefused(result.refusal?.message ?? 'The deferral was refused.')
      return
    }
    setOpen(false)
    setReason('')
    onDeferred()
  }

  if (!open) {
    return <Button size="sm" className="ml-2" onClick={() => setOpen(true)}>Defer</Button>
  }

  return (
    <div className="mt-2 rounded-lg border border-amber-300 bg-surface-1 p-3">
      <Field label="Why was this not built? In your own words — it outlives you being asked.">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="mt-2 flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={submit} disabled={busy} loading={busy} loadingLabel="Deferring…">
          Defer this spec
        </Button>
        <Button variant="link" size="sm" onClick={() => setReason((r) => r || suggestion)}>
          Start from a suggestion
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  )
}

/** One team lead confirming their own list. The handle is required — the point of asking each
 * lead is whose assertion it is, and an anonymous yes is not one. */
export function ConfirmControl({ team, onConfirm }: { team: string; onConfirm: (handle: string) => void }) {
  const [handle, setHandle] = useState('')

  return (
    <span className="flex flex-wrap items-end gap-2 text-sm">
      <span className="w-24 shrink-0 self-center text-status-warn-ink">{team}</span>
      <Field label={`${team} lead`} className="w-32">
        <Input size="sm" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@lead" />
      </Field>
      <Button
        size="sm"
        onClick={() => onConfirm(handle.trim())}
        disabled={!handle.trim()}
        disabledReason="Type the lead's handle first — the confirmation is theirs, not the screen's."
      >
        Confirm this team's list
      </Button>
    </span>
  )
}
