import { useState } from 'react'
import type { ConsoleEntry } from '../../shared/types'

/** One sentence describing what a command did — the console's "plain" view. Never hides a
 * command from either view; this is purely a friendlier summary of the SAME entry the
 * technical view shows in full. */
function plainSummary(entry: ConsoleEntry): string {
  const name = entry.command === 'uv' ? (entry.args[2]?.split(/[\\/]/).pop() ?? entry.command) : entry.command
  if (entry.ok) {
    return `Ran ${name} — finished in ${(entry.durationMs / 1000).toFixed(1)}s.`
  }
  return `${name} failed after ${(entry.durationMs / 1000).toFixed(1)}s.`
}

function ConsoleRow({ entry, view }: { entry: ConsoleEntry; view: 'plain' | 'technical' }) {
  const [expanded, setExpanded] = useState(false)
  const statusColor = entry.ok ? 'text-[var(--color-command-ok)]' : 'text-[var(--color-command-error)]'

  return (
    <div className="border-b border-slate-200 py-2 text-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          {view === 'plain' ? (
            <p className={`${statusColor} font-medium`}>{plainSummary(entry)}</p>
          ) : (
            <code className="block truncate font-mono text-xs text-slate-700">
              {entry.command} {entry.args.join(' ')}
            </code>
          )}
          <p className="mt-0.5 text-xs text-slate-400">
            {new Date(entry.startedAt).toLocaleTimeString()} · {entry.durationMs}ms · cwd: {entry.cwd}
          </p>
        </div>
        <span className={`shrink-0 text-xs font-semibold ${statusColor}`}>
          {entry.ok ? 'OK' : `EXIT ${entry.exitCode ?? 'ERR'}`}
        </span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          {view === 'technical' && (
            <p className="font-mono text-xs text-slate-500">cwd: {entry.cwd}</p>
          )}
          {entry.stdout && (
            <pre className="max-h-48 overflow-auto rounded-lg bg-slate-900 p-2 text-xs text-slate-100">
              {entry.stdout}
            </pre>
          )}
          {entry.stderr && (
            <pre className="max-h-48 overflow-auto rounded-lg bg-red-950 p-2 text-xs text-red-100">
              {entry.stderr}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

export function Console({ entries }: { entries: ConsoleEntry[] }) {
  const [view, setView] = useState<'plain' | 'technical'>('plain')

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <h2 className="text-sm font-semibold text-slate-900">Console</h2>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setView('plain')}
            className={`rounded-md px-2 py-1 ${view === 'plain' ? 'bg-white font-medium shadow-sm' : 'text-slate-500'}`}
          >
            Plain
          </button>
          <button
            type="button"
            onClick={() => setView('technical')}
            className={`rounded-md px-2 py-1 ${view === 'technical' ? 'bg-white font-medium shadow-sm' : 'text-slate-500'}`}
          >
            Technical
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto px-3">
        {entries.length === 0 ? (
          <p className="py-4 text-sm text-slate-400">Nothing has run yet.</p>
        ) : (
          entries.map((entry) => <ConsoleRow key={entry.id} entry={entry} view={view} />)
        )}
      </div>
    </div>
  )
}
