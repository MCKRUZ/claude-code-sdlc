import { useEffect, useState } from 'react'
import type { DocumentField } from '../../shared/types'

/** Editing one field, including asking Claude to draft it.
 *
 * Two things here are load-bearing rather than cosmetic:
 *
 *  * A draft is never applied on arrival. It is shown as a proposal with Accept and Discard,
 *    because the acceptance check says the person accepts or discards it before it is saved.
 *  * Every draft is recorded WITH ITS OUTCOME, including discarded — Matt's resolved decision,
 *    reversing the spec's original "leaves no trace". The record is what makes "how much of
 *    this was AI-drafted, including what we turned down" answerable later, so the discard path
 *    records just as deliberately as the accept path does. If drafting is recorded only when
 *    it succeeds, the ledger flatters the tool.
 */
export function FieldEditor({
  field,
  busy,
  projectPath,
  relPath,
  sectionKey,
  sectionHeading,
  instance,
  actor,
  onSave,
}: {
  field: DocumentField
  busy: boolean
  projectPath: string
  relPath: string
  sectionKey: string
  sectionHeading: string
  instance?: string
  actor: string
  onSave: (value: string) => Promise<void>
}) {
  const [value, setValue] = useState(field.value)
  const [draft, setDraft] = useState<string | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)

  // A save re-reads the document, so the incoming field is the source of truth.
  useEffect(() => { setValue(field.value) }, [field.value])

  const dirty = value !== field.value
  const multiline = field.type === 'longtext' || field.type === 'checklist' || field.type === 'table'
    || field.anchor === 'labeled_block'

  const record = (outcome: 'accepted' | 'edited' | 'discarded', offered: string, kept: string) =>
    window.studio.recordDraftOutcome(
      projectPath, relPath, field.label, outcome, actor || 'unknown',
      offered.length, kept.length, instance,
    )

  const requestDraft = async () => {
    setDrafting(true)
    setDraftError(null)
    const result = await window.studio.draftField(projectPath, relPath, sectionKey, field.label, field.guidance ?? '')
    if (!result.ok || !result.text) setDraftError(result.error ?? 'Claude could not draft this.')
    else setDraft(result.text)
    setDrafting(false)
  }

  const acceptDraft = async () => {
    if (draft === null) return
    // "edited" rather than "accepted" when the person changed it before accepting — the
    // distinction is the interesting part of the ledger.
    await record(value.trim() === draft.trim() ? 'accepted' : 'edited', draft, value || draft)
    setValue(draft)
    setDraft(null)
  }

  const discardDraft = async () => {
    if (draft === null) return
    await record('discarded', draft, '')
    setDraft(null)
  }

  return (
    <div className="space-y-2">
      {field.guidance && <p className="text-xs text-slate-400">{field.guidance}</p>}

      {field.type === 'enum' && field.enumValues?.length ? (
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">—</option>
          {field.enumValues.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      ) : multiline ? (
        <textarea
          value={value}
          rows={Math.min(12, Math.max(3, value.split('\n').length + 1))}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      )}

      {draft !== null && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-700">
            Claude's draft — review before accepting
          </p>
          <pre className="mt-1 whitespace-pre-wrap font-sans text-sm text-slate-800">{draft}</pre>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={acceptDraft}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Use this
            </button>
            <button
              type="button"
              onClick={discardDraft}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {draftError && <p className="text-xs text-[var(--color-command-error)]">{draftError}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSave(value)}
          disabled={!dirty || busy}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
        >
          Save field
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => setValue(field.value)}
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            Revert
          </button>
        )}
        {draft === null && (
          <button
            type="button"
            onClick={requestDraft}
            disabled={drafting}
            className="ml-auto rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 disabled:opacity-40"
          >
            {drafting ? 'Asking Claude…' : 'Ask Claude to draft'}
          </button>
        )}
      </div>
    </div>
  )
}
