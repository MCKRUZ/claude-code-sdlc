import type { ProjectStatus } from '../../shared/types'

export function Header({
  status,
  consoleOpen,
  onToggleConsole,
}: {
  status: ProjectStatus
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
    </header>
  )
}
