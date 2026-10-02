import { useState } from 'react'

const REMEMBERED_PARENT = 'studio.newProjectParent'

function readRememberedParent(): string | null {
  try { return localStorage.getItem(REMEMBERED_PARENT) } catch { return null }
}

function rememberParent(parent: string): void {
  try { localStorage.setItem(REMEMBERED_PARENT, parent) } catch { /* a convenience, never a failure */ }
}

/** Where the new folder will land, written the way this person's operating system writes paths. */
function joinForDisplay(parent: string, name: string): string {
  const separator = parent.includes('\\') ? '\\' : '/'
  return parent.endsWith(separator) ? `${parent}${name}` : `${parent}${separator}${name}`
}

/** Start a project from nothing: a name, and where it should live. Studio makes the folder and
 * starts version tracking in it, then the person continues into the same setup wizard an
 * existing folder goes through — they never leave the app to make a folder first. */
export function NewProjectScreen({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: (projectPath: string) => void
}) {
  const [name, setName] = useState('')
  const [parent, setParent] = useState<string | null>(readRememberedParent)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = name.trim()
  const ready = trimmed !== '' && parent !== null && !busy

  const chooseLocation = async () => {
    const chosen = await window.studio.pickFolder()
    if (!chosen) return
    setParent(chosen)
    rememberParent(chosen)
    setError(null)
  }

  const create = async () => {
    if (!ready || parent === null) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.studio.createProject(parent, trimmed)
      if (result.ok && result.path) {
        onCreated(result.path)
        return
      }
      setError(result.error ?? 'The project could not be created.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The project could not be created.')
    }
    setBusy(false)
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-900">New project</h1>
          <p className="mt-1 text-sm text-slate-500">
            Studio will make the folder and set it up for you. You'll choose the lifecycle profile on the next step.
          </p>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <label htmlFor="new-project-name" className="text-xs font-medium text-slate-600">Project name</label>
            <input
              id="new-project-name"
              type="text"
              autoFocus
              value={name}
              disabled={busy}
              onChange={(e) => { setName(e.target.value); setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void create() } }}
              placeholder="e.g. Claims Portal"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </div>

          <div>
            <span className="text-xs font-medium text-slate-600">Location</span>
            <div className="mt-1 flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600" title={parent ?? undefined}>
                {parent ?? 'No location chosen yet'}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={chooseLocation}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:border-slate-300 disabled:opacity-50"
              >
                Choose location…
              </button>
            </div>
          </div>

          {parent !== null && trimmed !== '' && (
            <p className="text-xs text-slate-500">
              Will create: <span data-testid="new-project-target" className="break-all font-medium text-slate-700">{joinForDisplay(parent, trimmed)}</span>
            </p>
          )}
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-[var(--color-command-error)]">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-300 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={create}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {busy ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </div>
    </div>
  )
}
