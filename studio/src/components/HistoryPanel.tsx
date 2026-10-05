import { useCallback, useEffect, useState } from 'react'
import type { DocumentVersion, RestorePreview } from '../../shared/types'

/** Versions of one document: who saved each and why, what changed between two, and restoring
 * one.
 *
 * Restoring is preview-then-confirm and this component never shortcuts it. The person is shown
 * the exact diff, and confirming sends back the hash of that diff — so a restore can only
 * apply the change that was actually reviewed. Restoring also ADDS a version rather than
 * removing any, which is why the button says "Restore as a new version": it is not an undo
 * that erases history, and the label should not imply it is. */
export function HistoryPanel({
  projectPath,
  relPath,
  actor,
  onClose,
  onRestored,
}: {
  projectPath: string
  relPath: string
  actor: string
  onClose: () => void
  onRestored: () => void
}) {
  const [versions, setVersions] = useState<DocumentVersion[] | null>(null)
  const [diff, setDiff] = useState<string | null>(null)
  const [preview, setPreview] = useState<(RestorePreview & { ref: string }) | null>(null)
  const [ackSignOff, setAckSignOff] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setVersions(await window.studio.listVersions(projectPath, relPath))
  }, [projectPath, relPath])

  useEffect(() => { load() }, [load])

  const showDiff = async (ref: string) => {
    setError(null)
    const result = await window.studio.diffVersions(projectPath, relPath, ref, 'latest')
    if (!result.ok) setError(result.error ?? 'Could not compare those versions.')
    else setDiff(result.diff ?? '')
  }

  const startRestore = async (ref: string) => {
    setError(null)
    setAckSignOff(false)
    const result = await window.studio.previewRestore(projectPath, relPath, ref)
    if (!result.ok) setError(result.error ?? 'Could not prepare that restore.')
    else setPreview({ ...result, ref })
  }

  const confirm = async () => {
    if (!preview) return
    setBusy(true)
    const result = await window.studio.confirmRestore(
      projectPath, relPath, preview.ref, actor, preview.diffHash, ackSignOff,
    )
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? 'The restore was refused.')
      return
    }
    setPreview(null)
    await load()
    onRestored()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">History — {relPath.split('/').pop()}</h3>
        <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-slate-800">
          Close
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[var(--color-command-error)]">
          {error}
        </div>
      )}

      {versions === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : versions.length === 0 ? (
        <p className="text-sm text-slate-400">
          No versions recorded yet — a version is written each time this document is saved.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {[...versions].reverse().map((v) => (
            <li key={v.n} className="px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    v{v.n}
                    <span className="ml-2 font-normal text-slate-500">{v.actor || 'unknown'}</span>
                    {v.when && <span className="ml-2 font-normal text-slate-400">{v.when.slice(0, 10)}</span>}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {v.reason || <span className="text-slate-400">No reason recorded.</span>}
                  </p>
                  {v.restoredFrom !== undefined && (
                    <p className="mt-0.5 text-xs text-slate-400">Restored from v{v.restoredFrom}</p>
                  )}
                  {!v.present && (
                    // A real state, not an error: the content store is local, so a version
                    // saved on someone else's machine has metadata here but no bytes.
                    <p className="mt-0.5 text-xs text-amber-700">
                      Content not available on this machine.
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={!v.present}
                    onClick={() => showDiff(`v${v.n}`)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-300 disabled:opacity-40"
                  >
                    Compare
                  </button>
                  <button
                    type="button"
                    disabled={!v.present}
                    onClick={() => startRestore(`v${v.n}`)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-300 disabled:opacity-40"
                  >
                    Restore
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {diff !== null && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium uppercase tracking-wide text-slate-400">What changed</h4>
            <button type="button" onClick={() => setDiff(null)} className="text-xs text-slate-500 hover:text-slate-800">
              Hide
            </button>
          </div>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{diff}</pre>
        </div>
      )}

      {preview && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h4 className="text-sm font-semibold text-amber-900">Restore {preview.ref}?</h4>
          <p className="mt-1 text-xs text-amber-800">
            This adds a new version with the older content. Nothing is removed — the current
            version stays in the history.
          </p>
          <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{preview.diff}</pre>

          {preview.needsSignOffAck && (
            <label className="mt-2 flex items-start gap-2 text-xs text-amber-900">
              <input type="checkbox" checked={ackSignOff} onChange={(e) => setAckSignOff(e.target.checked)} className="mt-0.5" />
              <span>This document is signed off. I understand I am changing signed-off content, and that this override is recorded.</span>
            </label>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={busy || (preview.needsSignOffAck && !ackSignOff) || !actor.trim()}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-40"
            >
              Restore as a new version
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800"
            >
              Cancel
            </button>
            {!actor.trim() && (
              <span className="text-xs text-amber-800">Set your name in settings first — a restore is recorded against a person.</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
