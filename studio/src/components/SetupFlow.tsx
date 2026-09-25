import { useEffect, useState } from 'react'
import type { SetupPlan } from '../../shared/types'

function humanize(profileId: string): string {
  return profileId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function SetupFlow({
  projectPath,
  onCancel,
  onConfirm,
}: {
  projectPath: string
  onCancel: () => void
  onConfirm: (profileId: string) => Promise<void>
}) {
  const [profiles, setProfiles] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [plan, setPlan] = useState<SetupPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    window.studio.listProfiles().then((list) => {
      setProfiles(list)
      if (list.length > 0) setSelected(list[0])
    })
  }, [])

  useEffect(() => {
    if (!selected) return
    setPlan(null)
    setError(null)
    window.studio.previewSetup(projectPath, selected).then((result) => {
      if (result.error) setError(result.error)
      else if (result.plan) setPlan(result.plan)
    })
  }, [projectPath, selected])

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Set up a project here</h1>
          <p className="mt-1 text-xs text-slate-500">{projectPath}</p>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Playbook</span>
          <select
            value={selected ?? ''}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {profiles.map((p) => (
              <option key={p} value={p}>
                {humanize(p)}
              </option>
            ))}
          </select>
        </label>

        {error && <p className="text-sm text-[var(--color-command-error)]">{error}</p>}

        {plan?.already_exists && (
          <p className="text-sm text-slate-600">This folder already has a project — nothing would be created.</p>
        )}

        {plan && !plan.already_exists && (
          <div>
            <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              This will create
            </h2>
            <div className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-xs text-slate-600">
              {plan.directories.map((d) => (
                <div key={d}>{d}/</div>
              ))}
              {plan.files.map((f) => (
                <div key={f} className="text-slate-800">{f}</div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected || !plan || plan.already_exists || running}
            onClick={async () => {
              if (!selected) return
              setRunning(true)
              try {
                await onConfirm(selected)
              } finally {
                setRunning(false)
              }
            }}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {running ? 'Setting up…' : 'Set up project'}
          </button>
        </div>
      </div>
    </div>
  )
}
