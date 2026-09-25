import type { ProjectStatus } from '../../shared/types'

/** Present on every screen (spec 0008's own requirement) — the actual conversation isn't
 * wired up until a later spec; this panel's job right now is only to always be there and
 * always say, plainly, what part of the project it can currently see. */
export function ChatPanel({ status }: { status: ProjectStatus | null }) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Chat</h2>
        <p className="mt-1 text-xs text-slate-500">
          {status
            ? `Can see: ${status.project_name}, ${status.current_phase.display}.`
            : 'Can see: nothing yet — open a project first.'}
        </p>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-slate-400">
        Chat isn't wired up yet — this panel is a placeholder for a later spec.
      </div>
    </aside>
  )
}
