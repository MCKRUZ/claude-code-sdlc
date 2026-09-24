import { useCallback, useEffect, useState } from 'react'
import type { StageReadiness } from '../../shared/types'

/** The stage's documents: what each is for, what needs attention, and whether the stage can
 * move on. Read-only by construction — there is nothing here that changes a document. */
export function StageHome({
  projectPath,
  stageId,
  onOpenDocument,
}: {
  projectPath: string
  stageId?: string
  onOpenDocument: (relPath: string) => void
}) {
  const [readiness, setReadiness] = useState<StageReadiness | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    setReadiness(await window.studio.getStageReadiness(projectPath, stageId))
    setLoading(false)
  }, [projectPath, stageId])

  useEffect(() => { refresh() }, [refresh])

  if (loading && !readiness) {
    return <p className="text-sm text-slate-400">Checking this stage…</p>
  }
  if (!readiness?.ok) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[var(--color-command-error)]">
        {readiness?.error ?? 'Could not read this stage.'}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{readiness.display}</h2>
        {readiness.description && <p className="mt-1 text-sm text-slate-500">{readiness.description}</p>}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Documents</h3>
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {readiness.documents.map((doc) => (
            <li key={doc.path}>
              <button
                type="button"
                disabled={!doc.exists}
                onClick={() => onOpenDocument(doc.path)}
                className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-white"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-900">{doc.name}</span>
                  {doc.description && <span className="mt-0.5 block text-xs text-slate-500">{doc.description}</span>}
                </span>
                <span className="shrink-0 text-xs font-medium">
                  {!doc.exists ? (
                    <span className="text-slate-400">Not started</span>
                  ) : doc.findingCount > 0 ? (
                    <span className="text-amber-700">
                      {doc.findingCount} to fill
                    </span>
                  ) : (
                    <span className="text-[var(--color-command-ok)]">Complete</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {readiness.judgementConditions.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Questions for whoever signs this off
          </h3>
          {/* These are deliberately not checkboxes. No check can answer them, and rendering
              them as something tickable would suggest the app had verified them. */}
          <ul className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
            {readiness.judgementConditions.map((c) => (
              <li key={c} className="text-sm text-slate-700">— {c}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        {readiness.ready ? (
          <span className="text-[var(--color-command-ok)]">
            Every required document is present and complete.
          </span>
        ) : (
          <span className="text-amber-700">
            {readiness.documents.filter((d) => !d.ready).length} document(s) still need work before this stage can be signed off.
          </span>
        )}
        {readiness.signOff.signedOffBy && (
          <span className="ml-2 text-slate-500">Signed off by {readiness.signOff.signedOffBy}.</span>
        )}
      </div>
    </div>
  )
}
