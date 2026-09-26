import { useCallback, useEffect, useState } from 'react'
import type {
  DocumentChange, DocumentField, DocumentFocus, DocumentSection, OpenDocumentResult,
} from '../../shared/types'
import { matchesSection } from '../../shared/sections'
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
  focus,
  onBack,
  onShowHistory,
}: {
  projectPath: string
  relPath: string
  actor: string
  /** Set when the reader arrived from a readiness item rather than the document list: the
   * section and field that item was about, so they land on it instead of hunting for it. */
  focus?: DocumentFocus
  onBack: () => void
  onShowHistory: () => void
}) {
  /** The section the reader was sent to, resolved once the document is open. Held as the
   * section KEY rather than the plugin's reported name, because that is what the rendered
   * cards are addressed by. */
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const [doc, setDoc] = useState<OpenDocumentResult | null>(null)
  const [changes, setChanges] = useState<DocumentChange[]>([])
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextId, setNextId] = useState<string | null>(null)
  // Working out the next number means asking the plugin, in another process. Until that
  // answers, the control must not claim to know — see the comment on the button itself.
  const [numbering, setNumbering] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const opened = await window.studio.openDocument(projectPath, relPath)
    setDoc(opened)
    if (!opened.ok) setError(opened.error ?? 'Could not open this document.')
  }, [projectPath, relPath])

  useEffect(() => { load() }, [load])

  // Resolve the readiness item's section to a rendered card, once there is a document to look
  // in. Matched with the SAME rule the main process used to attach the finding to a field
  // (shared/sections.ts) — two different rules here would send the reader to the wrong place
  // and look like a broken link rather than a disagreement.
  useEffect(() => {
    if (!focus || !doc?.ok) { setFocusedKey(null); return }
    const hit = doc.sections.find((s) => matchesSection(s.key, s.heading, focus.section))
    setFocusedKey(hit?.key ?? null)
  }, [focus, doc])

  // Scrolled after the card exists, not when the focus arrives — the element is not in the
  // document until the section it belongs to has rendered.
  useEffect(() => {
    if (!focusedKey) return
    document.querySelector(`[data-section-key="${CSS.escape(focusedKey)}"]`)
      ?.scrollIntoView({ block: 'center' })
  }, [focusedKey])

  // Listing what changed never marks it seen — that is a separate, explicit act, so merely
  // opening a document can't quietly erase the "here's what moved" signal.
  useEffect(() => {
    window.studio.getDocumentChanges(projectPath, relPath).then(setChanges)
  }, [projectPath, relPath])

  const enterEditMode = useCallback(async () => {
    setEditing(true)

    // Most documents have no numbered sections at all — 22 of the 27 shapes — so there is no
    // next number to work out and asking for one is both pointless and actively misleading:
    // the plugin correctly answers "no numbered sections here", and reporting that as a
    // failure puts an error banner on an ordinary, healthy document. Ask only where an
    // answer is meaningful.
    if (!(doc?.sections ?? []).some((s) => s.kind === 'repeating_instance')) {
      setNextId(null)
      return
    }

    setNumbering(true)
    const next = await window.studio.nextNumber(projectPath, relPath)
    setNumbering(false)
    setNextId(next.ok ? next.id ?? null : null)
    // Here a failure IS a failure: this document has numbered sections, so not being able to
    // name the next one means something went wrong. It used to be discarded, and the only
    // visible trace was the add control quietly reading "Add another" — a silent degradation
    // wearing the costume of a design choice.
    if (!next.ok) setError(next.error ?? 'Could not work out the next number for this document.')
  }, [projectPath, relPath, doc])

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
      setNumbering(true)
      const next = await window.studio.nextNumber(projectPath, relPath)
      setNumbering(false)
      setNextId(next.ok ? next.id ?? null : null)
      if (!next.ok) setError(next.error ?? 'Could not work out the next number for this document.')
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
        // The test hook is here because asserting "no error is shown" by matching the wording
        // proves nothing: a test that looks for the wrong sentence passes whether or not the
        // banner is there. That happened — a regression test for the false-alarm defect below
        // passed with the defect still in place, because the real message was different.
        <div
          data-testid="document-error"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[var(--color-command-error)]"
        >
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
            highlighted={section.key === focusedKey}
            highlightField={section.key === focusedKey ? focus?.field ?? null : null}
            onSaveField={saveField}
          />
        ))}
      </div>

      {/* The add control exists ONLY in edit mode, and shows the number it will use before
          anything is created — spec 0010's acceptance check asks for exactly that.
          THREE states, never two. "Add another" once meant both "this document has no
          numbered sections" and "the number has not come back yet", because working it out
          is a call into another process. A slow answer then looked exactly like no answer —
          which is how a passing feature came to be reported as an unbuilt one. */}
      {editing && hasRepeating && (
        <button
          type="button"
          onClick={addRequirement}
          disabled={busy || numbering}
          className="w-full rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 hover:border-brand-500 hover:text-brand-700 disabled:opacity-40"
        >
          {numbering ? 'Working out the next number…' : nextId ? `Add ${nextId}` : 'Add another'}
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
  highlighted = false,
  highlightField = null,
  onSaveField,
}: {
  section: DocumentSection
  editing: boolean
  busy: boolean
  projectPath: string
  relPath: string
  actor: string
  /** This is the section a readiness item pointed at, so it is marked and scrolled to. */
  highlighted?: boolean
  /** The field within it, when the item named one. */
  highlightField?: string | null
  onSaveField: (section: DocumentSection, label: string, value: string) => Promise<void>
}) {
  if (section.kind === 'free_text') {
    return (
      <div data-section-key={section.key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        {/* Free text is shown exactly as written and never edited field-by-field — the shape
            library does not model it, so Studio must not pretend it does. */}
        <pre className="whitespace-pre-wrap font-sans text-sm text-slate-600">{section.text.trim()}</pre>
      </div>
    )
  }

  const fields = Object.entries(section.fields)

  return (
    <div
      data-section-key={section.key}
      data-highlighted={highlighted ? 'true' : undefined}
      className={`rounded-xl border bg-white p-4 ${
        highlighted ? 'border-brand-500 ring-2 ring-brand-200' : 'border-slate-200'}`}
    >
      <h3 className="text-sm font-semibold text-slate-900">{section.heading}</h3>
      {highlighted && (
        <p className="mt-1 text-xs text-brand-700">
          {highlightField
            ? `You were sent here to fill in ${highlightField}.`
            : 'You were sent here from what is missing on the stage.'}
        </p>
      )}
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
