import { useEffect, useState } from 'react'
import type { SyncState } from '../../shared/types'

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return `${hours}h ago`
}

/** The sync indicator spec 0009 requires "on every screen". It lives in the sidebar's footer,
 * which is on every project screen. Re-renders on a tick so "2m ago" keeps advancing without
 * needing a new syncState push just to update the clock.
 *
 * It is a status, not a control: nothing here can be clicked, so it does not look as if it could
 * be. (The clash screen opens by itself when there is something to resolve.) */
export function SyncChip({ syncState }: { syncState: SyncState }) {
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const base = 'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium'
  const dot = <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />

  switch (syncState.kind) {
    case 'pulling':
      return <div className={`${base} bg-slate-100 text-slate-500`}>{dot}Pulling…</div>
    case 'saving':
      return <div className={`${base} bg-slate-100 text-slate-500`}>{dot}Saving…</div>
    case 'clashes':
      return (
        <div className={`${base} bg-amber-50 text-amber-800`}>
          {dot}
          {`${syncState.count} section${syncState.count === 1 ? '' : 's'} need your input`}
        </div>
      )
    case 'waitingForApproval':
      return <div className={`${base} bg-amber-50 text-amber-800`}>{dot}{`Waiting for ${syncState.approver}`}</div>
    case 'waitingForChecks':
      return <div className={`${base} bg-slate-100 text-slate-500`}>{dot}Waiting for checks</div>
    case 'localOnly':
      return (
        <div
          className={`${base} flex-col items-start gap-0.5 bg-slate-100 text-slate-600`}
          title="This project is not connected to a shared repository, so nothing syncs. To work with a team, connect one (git remote add origin <the repository's address>) and Studio will start syncing."
        >
          <span className="flex items-center gap-2">{dot}Saved on this computer only</span>
          <span className="pl-3.5 font-normal text-slate-500">Not shared with a team yet</span>
        </div>
      )
    case 'error':
      return (
        <div className={`${base} bg-red-50 text-[var(--color-command-error)]`} title={syncState.message}>
          {dot}Sync error
        </div>
      )
    case 'idle':
    default:
      return (
        <div className={`${base} bg-[var(--color-stage-signed-off-bg)] text-[var(--color-stage-signed-off)]`}>
          {dot}
          {syncState.lastPulledAt ? `Synced ${relativeTime(syncState.lastPulledAt)}` : 'Not synced yet'}
        </div>
      )
  }
}
