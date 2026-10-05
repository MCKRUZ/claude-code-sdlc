import { useState } from 'react'
import type { ClashChoice, FileClash } from '../../shared/types'
import { ClashDiff } from './ClashDiff'

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** One clashing section at a time — spec 0009's own language: "keep mine / keep theirs / let
 * Claude combine." It says what differs (a sentence, then only the changed lines, with the changed
 * words marked) and when each version was last changed, because two versions that look alike on
 * screen leave nothing to choose between. Nothing is saved until the person chooses (or accepts a
 * combined draft); the unchosen version stays reachable through the repository's own history,
 * never silently discarded. */
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
  const [showFull, setShowFull] = useState(false)

  const remaining = clashes.flatMap((c) => c.sections.map((s) => ({ file: c.path, clash: c, section: s })))
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

  const { file, clash, section } = current

  const resolve = async (choice: ClashChoice, combinedText?: string) => {
    await onResolve(file, section.key, choice, combinedText)
    setCombinedDraft(null)
    setCombineError(null)
    setShowFull(false)
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
    <div className="flex h-screen flex-col gap-4 overflow-auto bg-slate-50 p-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">A change needs your input</h1>
        <p className="text-sm text-slate-500">
          {file} — {section.heading} ({remaining.length} left)
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-sky-700">Your version</p>
          {clash.localModifiedAt && (
            <p className="mt-1 text-sm text-slate-700">{`Last saved ${formatWhen(clash.localModifiedAt)}`}</p>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Their version</p>
          {clash.remote && (
            <>
              <p className="mt-1 text-sm text-slate-700">{`Last changed ${formatWhen(clash.remote.when)} by ${clash.remote.author}`}</p>
              {clash.remote.subject && <p className="mt-0.5 truncate text-xs text-slate-500">{clash.remote.subject}</p>}
            </>
          )}
        </div>
      </div>

      <div className="min-h-0 rounded-xl border border-slate-200 bg-white">
        <ClashDiff mine={section.localText} theirs={section.remoteText} />
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowFull((v) => !v)}
          className="text-xs font-medium text-slate-500 underline decoration-slate-300 hover:text-slate-800"
        >
          {showFull ? 'Hide the full versions' : 'Show both versions in full'}
        </button>
        {showFull && (
          <div className="mt-2 grid grid-cols-2 gap-4">
            <FullVersion label="Your version" text={section.localText} />
            <FullVersion label="Their version" text={section.remoteText} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <button
          type="button"
          onClick={() => resolve('local')}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Keep mine
        </button>
        <button
          type="button"
          onClick={() => resolve('remote')}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Keep theirs
        </button>
        {combinedDraft === null && (
          <button
            type="button"
            onClick={requestCombine}
            disabled={combining}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-300 disabled:opacity-40"
          >
            {combining ? 'Asking Claude…' : 'Let Claude combine'}
          </button>
        )}
        {combineError && <p className="w-full text-xs text-[var(--color-command-error)]">{combineError}</p>}
      </div>

      {combinedDraft !== null && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Claude&apos;s combined draft — review before accepting</p>
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
    </div>
  )
}

function FullVersion({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex max-h-[28rem] flex-col rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 text-sm text-slate-800">{text}</pre>
    </div>
  )
}
