import { useEffect, useState } from 'react'
import type { ProjectStatus, SyncState } from '../../shared/types'

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return `${hours}h ago`
}

/** The sync indicator spec 0009 requires "on every screen" — this is that one place, since
 * Header is already present on every project screen. Re-renders on a tick so "2m ago" keeps
 * advancing without needing a new syncState push just to update the clock. */
function SyncPill({ syncState }: { syncState: SyncState }) {
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const base = 'rounded-lg border px-3 py-1.5 text-xs font-medium'

  switch (syncState.kind) {
    case 'pulling':
      return <span className={`${base} border-slate-200 text-slate-500`}>Pulling…</span>
    case 'saving':
      return <span className={`${base} border-slate-200 text-slate-500`}>Saving…</span>
    case 'clashes':
      return (
        <span className={`${base} border-amber-300 bg-amber-50 text-amber-800`}>
          {syncState.count} section{syncState.count === 1 ? '' : 's'} need your input
        </span>
      )
    case 'waitingForApproval':
      return (
        <span className={`${base} border-amber-300 bg-amber-50 text-amber-800`}>
          Waiting for {syncState.approver}
        </span>
      )
    case 'waitingForChecks':
      return <span className={`${base} border-slate-200 text-slate-500`}>Waiting for checks</span>
    case 'error':
      return (
        <span className={`${base} border-red-300 bg-red-50 text-[var(--color-command-error)]`} title={syncState.message}>
          Sync error
        </span>
      )
    case 'idle':
    default:
      return (
        <span className={`${base} border-slate-200 text-slate-500`}>
          {syncState.lastPulledAt ? `Synced ${relativeTime(syncState.lastPulledAt)}` : 'Not synced yet'}
        </span>
      )
  }
}

export function Header({
  status,
  syncState,
  consoleOpen,
  onToggleConsole,
}: {
  status: ProjectStatus
  syncState: SyncState
  consoleOpen: boolean
  onToggleConsole: () => void
}) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
      <div>
        <h1 className="text-base font-semibold text-slate-900">{status.project_name}</h1>
        <p className="text-xs text-slate-500">
          {status.profile_id} · {status.current_phase.display}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <SyncPill syncState={syncState} />
        <button
          type="button"
          onClick={onToggleConsole}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
            consoleOpen
              ? 'border-brand-600 bg-brand-50 text-brand-700'
              : 'border-slate-200 text-slate-600 hover:border-slate-300'
          }`}
        >
          Console
        </button>
      </div>
    </header>
  )
}
