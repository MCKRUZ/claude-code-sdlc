import type { RecentProject } from '../../shared/types'

export function WelcomeScreen({
  recentProjects,
  onPickFolder,
  onNewProject,
  onOpenRecent,
}: {
  recentProjects: RecentProject[]
  onPickFolder: () => void
  onNewProject: () => void
  onOpenRecent: (path: string) => void
}) {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-900">SDLC Studio</h1>
          <p className="mt-1 text-sm text-slate-500">Start a new project, or open one you already have.</p>
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={onNewProject}
            className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700"
          >
            New project…
          </button>
          <button
            type="button"
            onClick={onPickFolder}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:border-slate-300"
          >
            Open folder…
          </button>
        </div>
        {recentProjects.length > 0 && (
          <div>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Recent</h2>
            <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {recentProjects.map((p) => (
                <li key={p.path}>
                  <button
                    type="button"
                    onClick={() => onOpenRecent(p.path)}
                    className="flex w-full flex-col items-start px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span className="text-sm font-medium text-slate-900">{p.name}</span>
                    <span className="text-xs text-slate-400">{p.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
