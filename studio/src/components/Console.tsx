import { useState } from 'react'
import type { ConsoleEntry } from '../../shared/types'

function commandBasename(path: string): string {
  return path.split(/[\\/]/).pop()?.toLowerCase().replace(/\.(exe|cmd|bat)$/, '') ?? path
}

/** Recognizes a git/gh invocation regardless of how it was actually launched — a resolved
 * absolute path, or (on Windows, for a .cmd-shimmed `gh`) routed through cmd.exe /c, in
 * which case the real tool name and subcommand sit one position further into args. See
 * tooling.ts's ResolvedBinary. */
function gitOrGhSubcommand(entry: ConsoleEntry): { tool: 'git' | 'gh'; subArgs: string[] } | null {
  const base = commandBasename(entry.command)
  if (base === 'git' || base === 'gh') return { tool: base, subArgs: entry.args }
  if (base === 'cmd' && entry.args[0] === '/c') {
    const shimBase = commandBasename(entry.args[1] ?? '')
    if (shimBase === 'git' || shimBase === 'gh') return { tool: shimBase, subArgs: entry.args.slice(2) }
  }
  return null
}

const GIT_PHRASES: Record<string, string> = {
  fetch: 'Checked for changes',
  show: 'Read a file from the repository',
  push: 'Saved changes to the repository',
  'read-tree': 'Prepared a commit',
  'hash-object': 'Prepared a commit',
  'update-index': 'Prepared a commit',
  'write-tree': 'Prepared a commit',
  'commit-tree': 'Prepared a commit',
  branch: 'Checked the current branch',
  'rev-parse': 'Looked up a commit',
  remote: 'Checked the repository connection',
  'ls-tree': 'Listed files in the repository',
  log: 'Checked recent history',
}

function toolPlainPhrase(tool: 'git' | 'gh', subArgs: string[]): string {
  const sub = subArgs[0] ?? ''
  if (tool === 'git') return GIT_PHRASES[sub] ?? 'Talked to git'
  if (sub === 'pr' && subArgs[1] === 'create') return 'Opened a pull request'
  if (sub === 'pr' && subArgs[1] === 'merge') return 'Merged a pull request'
  if (sub === 'pr' && subArgs[1] === 'list') return 'Checked pull request status'
  if (sub === 'api') return 'Talked to the code host'
  return 'Talked to the code host'
}

/** One sentence describing what a command did — the console's "plain" view. Never hides a
 * command from either view; this is purely a friendlier summary of the SAME entry the
 * technical view shows in full. */
function plainSummary(entry: ConsoleEntry): string {
  const seconds = (entry.durationMs / 1000).toFixed(1)
  const gitOrGh = gitOrGhSubcommand(entry)
  if (gitOrGh) {
    const phrase = toolPlainPhrase(gitOrGh.tool, gitOrGh.subArgs)
    return entry.ok ? `${phrase} — finished in ${seconds}s.` : `${phrase} — failed after ${seconds}s.`
  }
  const name = entry.command === 'uv' ? (entry.args[2]?.split(/[\\/]/).pop() ?? entry.command) : entry.command
  if (entry.ok) {
    return `Ran ${name} — finished in ${seconds}s.`
  }
  return `${name} failed after ${seconds}s.`
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
