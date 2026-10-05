import { useState } from 'react'
import type { ToolingReport, ToolStatus } from '../../shared/types'

const INSTALL_LINKS: Record<string, string> = {
  claude: 'https://docs.claude.com/en/docs/claude-code',
  uv: 'https://docs.astral.sh/uv/getting-started/installation/',
  pluginScripts: 'https://docs.claude.com/en/docs/claude-code/plugins',
  git: 'https://git-scm.com/downloads',
  gh: 'https://cli.github.com/',
}

const LABELS: Record<string, string> = {
  claude: 'Claude Code',
  uv: 'uv (the script runner)',
  pluginScripts: 'the claude-code-sdlc plugin',
  git: 'git',
  gh: 'the GitHub CLI (gh)',
}

function IssueRow({
  toolKey,
  status,
  onOverride,
}: {
  toolKey: 'claude' | 'uv' | 'pluginScripts' | 'git' | 'gh'
  status: ToolStatus
  onOverride: (path: string) => void
}) {
  const [path, setPath] = useState('')

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-medium text-amber-900">{LABELS[toolKey]} wasn't found.</p>
      <p className="mt-1 text-xs text-amber-700">{status.error}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={INSTALL_LINKS[toolKey]}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
        >
          Install instructions
        </a>
        <span className="text-xs text-amber-600">or</span>
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder={toolKey === 'pluginScripts' ? 'Path to the plugin\'s scripts/ folder' : 'Path to the binary'}
          className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          disabled={!path.trim()}
          onClick={() => onOverride(path.trim())}
          className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 disabled:opacity-40"
        >
          Use this
        </button>
      </div>
    </div>
  )
}

export function ToolingIssues({
  report,
  onOverride,
}: {
  report: ToolingReport
  onOverride: (kind: 'claude' | 'uv' | 'pluginScripts' | 'git' | 'gh', path: string) => void
}) {
  const issues = (['claude', 'uv', 'pluginScripts', 'git', 'gh'] as const).filter((k) => !report[k].found)

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-lg space-y-3">
        <h1 className="text-lg font-semibold text-slate-900">Before Studio can open a project</h1>
        <p className="text-sm text-slate-500">
          Studio needs these on this machine — nothing gets installed automatically.
        </p>
        {issues.map((k) => (
          <IssueRow key={k} toolKey={k} status={report[k]} onOverride={(path) => onOverride(k, path)} />
        ))}
      </div>
    </div>
  )
}
