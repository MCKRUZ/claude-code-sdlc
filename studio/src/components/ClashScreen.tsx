import { useState } from 'react'
import type { ClashChoice, FileClash } from '../../shared/types'

/** One clashing section at a time, local and remote side by side — spec 0009's own
 * language: "keep mine / keep theirs / let Claude combine." Nothing is saved until the
 * person chooses (or accepts a combined draft); the unchosen version stays reachable
 * through the repository's own history, never silently discarded. */
export function ClashScreen({
  clashes,
  onResolve,
  onCombine,
  onDone,
}: {
  clashes: FileClash[]
  onResolve: (filePath: string, sectionKey: string, choice: ClashChoice, combinedText?: string) => Promise<void>
  onCombine: (localText: string, remoteText: string) => Promise<string>
  onDone: () => void
}) {
  const [combining, setCombining] = useState(false)
  const [combinedDraft, setCombinedDraft] = useState<string | null>(null)
  const [combineError, setCombineError] = useState<string | null>(null)

  const remaining = clashes.flatMap((c) => c.sections.map((s) => ({ file: c.path, section: s })))
  const current = remaining[0]

  if (!current) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 p-6">
        <div className="text-center">
          <p className="text-sm font-medium text-slate-900">Every clash is resolved.</p>
          <button
            type="button"
            onClick={onDone}
            className="mt-4 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  const { file, section } = current

  const resolve = async (choice: ClashChoice, combinedText?: string) => {
    await onResolve(file, section.key, choice, combinedText)
    setCombinedDraft(null)
    setCombineError(null)
  }

  const requestCombine = async () => {
    setCombining(true)
    setCombineError(null)
    try {
      const draft = await onCombine(section.localText, section.remoteText)
      setCombinedDraft(draft)
    } catch (err) {
      setCombineError(err instanceof Error ? err.message : 'Could not combine these — pick one of the versions instead.')
    } finally {
      setCombining(false)
    }
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50 p-6">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900">A change needs your input</h1>
        <p className="text-sm text-slate-500">
          {file} — {section.heading} ({remaining.length} left)
        </p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
        <div className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Your version
          </div>
          <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 text-sm text-slate-800">{section.localText}</pre>
          <button
            type="button"
            onClick={() => resolve('local')}
            className="border-t border-slate-200 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            Keep mine
          </button>
        </div>

        <div className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Their version
          </div>
          <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 text-sm text-slate-800">{section.remoteText}</pre>
          <button
            type="button"
            onClick={() => resolve('remote')}
            className="border-t border-slate-200 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            Keep theirs
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        {combinedDraft === null ? (
          <button
            type="button"
            onClick={requestCombine}
            disabled={combining}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 disabled:opacity-40"
          >
            {combining ? 'Asking Claude…' : 'Let Claude combine'}
          </button>
        ) : (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Claude's combined draft — review before accepting</p>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-800">{combinedDraft}</pre>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => resolve('combined', combinedDraft)}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
              >
                Accept this
              </button>
              <button
                type="button"
                onClick={() => setCombinedDraft(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300"
              >
                Discard
              </button>
            </div>
          </div>
        )}
        {combineError && <p className="mt-2 text-xs text-[var(--color-command-error)]">{combineError}</p>}
      </div>
    </div>
  )
}
