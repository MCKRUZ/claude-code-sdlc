import { useCallback, useEffect, useState } from 'react'
import type {
  DocumentChange, DocumentField, DocumentSection, OpenDocumentResult,
} from '../../shared/types'
import { FieldEditor } from './FieldEditor'

/** Reading and editing one document.
 *
 * The rule that shapes this whole component: NOTHING that changes content is rendered outside
 * edit mode. Not disabled — absent. A disabled button still tells the person "this is a thing
 * you could do here", and spec 0010's acceptance check is explicit that those controls do not
 * exist outside edit mode, "including the add button on a review panel". */
export function DocumentView({
  projectPath,
  relPath,
  actor,
  onBack,
  onShowHistory,
}: {
  projectPath: string
  relPath: string
  actor: string
  onBack: () => void
  onShowHistory: () => void
}) {
  const [doc, setDoc] = useState<OpenDocumentResult | null>(null)
  const [changes, setChanges] = useState<DocumentChange[]>([])
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextId, setNextId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const opened = await window.studio.openDocument(projectPath, relPath)
    setDoc(opened)
    if (!opened.ok) setError(opened.error ?? 'Could not open this document.')
  }, [projectPath, relPath])

  useEffect(() => { load() }, [load])

  // Listing what changed never marks it seen — that is a separate, explicit act, so merely
  // opening a document can't quietly erase the "here's what moved" signal.
  useEffect(() => {
    window.studio.getDocumentChanges(projectPath, relPath).then(setChanges)
  }, [projectPath, relPath])

  const enterEditMode = useCallback(async () => {
    setEditing(true)
    const next = await window.studio.nextNumber(projectPath, relPath)
    setNextId(next.ok ? next.id ?? null : null)
  }, [projectPath, relPath])

  const saveField = useCallback(async (section: DocumentSection, label: string, value: string) => {
    setBusy(true)
    setError(null)
    const result = await window.studio.setField(projectPath, relPath, section.key, label, value)
    if (!result.ok) setError(result.error ?? 'Could not save that change.')
    else setDoc(result)
    setBusy(false)
  }, [projectPath, relPath])

  const addRequirement = useCallback(async () => {
    setBusy(true)
    setError(null)
    const result = await window.studio.addInstance(projectPath, relPath, '')
    if (!result.ok) setError(result.error ?? 'Could not add that.')
    else {
      setDoc(result)
      const next = await window.studio.nextNumber(projectPath, relPath)
      setNextId(next.ok ? next.id ?? null : null)
    }
    setBusy(false)
  }, [projectPath, relPath])

  if (!doc) return <p className="text-sm text-slate-400">Opening…</p>

  const hasRepeating = doc.sections.some((s) => s.kind === 'repeating_instance')

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <button type="button" onClick={onBack} className="mb-1 text-xs text-slate-500 hover:text-slate-800">
            ← Back to the stage
          </button>
          <h2 className="text-base font-semibold text-slate-900">{relPath.split('/').pop()}</h2>
          {doc.description && <p className="mt-0.5 text-sm text-slate-500">{doc.description}</p>}
          {/* Spec 0010: every field shows where the document lives, without leaving the page. */}
          <p className="mt-1 font-mono text-xs text-slate-400">{relPath}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onShowHistory}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300"
          >
            History
          </button>
          {editing ? (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-brand-600 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700"
            >
              Done editing
            </button>
          ) : (
            <button
              type="button"
              onClick={enterEditMode}
              disabled={!doc.shaped}
              title={doc.shaped ? undefined : 'This document has no shape, so its fields cannot be edited here.'}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {changes.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Changed since you last looked
            </h3>
            <button
              type="button"
              onClick={async () => {
                await window.studio.markDocumentSeen(projectPath, relPath)
                setChanges([])
              }}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Mark as seen
            </button>
          </div>
          <ul className="mt-2 space-y-1">
            {changes.slice(0, 8).map((c, i) => (
              <li key={`${c.when}-${i}`} className="text-sm text-slate-700">
                <span className="font-medium">{c.author}</span>
                <span className="text-slate-400"> · {c.when} · </span>
                {c.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!doc.shaped && doc.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">This document is shown as plain text.</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {doc.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
          <p className="mt-2 text-xs">
            Nothing is hidden — everything in the file is below, exactly as written.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[var(--color-command-error)]">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {doc.sections.map((section) => (
          <SectionCard
            key={section.key}
            section={section}
            editing={editing}
            busy={busy}
            projectPath={projectPath}
            relPath={relPath}
            actor={actor}
            onSaveField={saveField}
          />
        ))}
      </div>

      {/* The add control exists ONLY in edit mode, and shows the number it will use before
          anything is created — spec 0010's acceptance check asks for exactly that. */}
      {editing && hasRepeating && (
        <button
          type="button"
          onClick={addRequirement}
          disabled={busy}
          className="w-full rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 hover:border-brand-500 hover:text-brand-700 disabled:opacity-40"
        >
          {nextId ? `Add ${nextId}` : 'Add another'}
        </button>
      )}
    </div>
  )
}

function SectionCard({
  section,
  editing,
  busy,
  projectPath,
  relPath,
  actor,
  onSaveField,
}: {
  section: DocumentSection
  editing: boolean
  busy: boolean
  projectPath: string
  relPath: string
  actor: string
  onSaveField: (section: DocumentSection, label: string, value: string) => Promise<void>
}) {
  if (section.kind === 'free_text') {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        {/* Free text is shown exactly as written and never edited field-by-field — the shape
            library does not model it, so Studio must not pretend it does. */}
        <pre className="whitespace-pre-wrap font-sans text-sm text-slate-600">{section.text.trim()}</pre>
      </div>
    )
  }

  const fields = Object.entries(section.fields)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">{section.heading}</h3>
      <dl className="mt-3 space-y-3">
        {fields.map(([label, field]) => (
          <FieldRow
            key={label}
            label={label}
            field={field}
            editing={editing}
            busy={busy}
            projectPath={projectPath}
            relPath={relPath}
            sectionKey={section.key}
            sectionHeading={section.heading}
            instance={section.kind === 'repeating_instance' ? section.heading : undefined}
            actor={actor}
            onSave={(value) => onSaveField(section, label, value)}
          />
        ))}
      </dl>
    </div>
  )
}

function FieldRow({
  label, field, editing, busy, projectPath, relPath, sectionKey, sectionHeading, instance, actor, onSave,
}: {
  label: string
  field: DocumentField | null
  editing: boolean
  busy: boolean
  projectPath: string
  relPath: string
  sectionKey: string
  sectionHeading: string
  instance?: string
  actor: string
  onSave: (value: string) => Promise<void>
}) {
  if (!field) {
    // Declared by the shape, absent from this document. Said plainly rather than hidden —
    // a missing field is information, and hiding it is how a form silently loses content.
    return (
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
        <dd className="text-sm text-slate-400">Not in this document.</dd>
      </div>
    )
  }

  return (
    <div>
      <dt className="flex items-baseline gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
        {field.required && <span className="text-xs text-slate-300">required</span>}
      </dt>
      <dd className="mt-0.5">
        {editing ? (
          <FieldEditor
            field={field}
            busy={busy}
            projectPath={projectPath}
            relPath={relPath}
            sectionKey={sectionKey}
            sectionHeading={sectionHeading}
            instance={instance}
            actor={actor}
            onSave={onSave}
          />
        ) : field.empty ? (
          <span className="text-sm text-slate-400">Empty</span>
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800">{field.value.trim()}</pre>
        )}
      </dd>
    </div>
  )
}
