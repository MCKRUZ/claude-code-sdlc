import type { DocumentField, DocumentSection } from '../../shared/types'
import { FieldEditor } from './FieldEditor'
import { MarkdownView } from './MarkdownView'

/** The field types whose value is a block of markdown; the rest are single values. Mirrors the
 * multiline set FieldEditor already uses to decide which fields get a text area. */
export const MARKDOWN_TYPES = new Set(['longtext', 'table', 'checklist'])

/** One document's sections, field by field — extracted out of `DocumentView.tsx` for spec
 * 0017's fix pass (bug #9) so there is exactly ONE place that turns a `DocumentSection` into
 * markup: an explicit "Empty" for an unfilled field, "Not in this document." for one the shape
 * declares but the document lacks, and a proper `FieldEditor` when editing.
 *
 * Before this, the Workflow tab's live panel dumped each section's raw `.text` through
 * `MarkdownView` on its own — a second, independently-verified rendering path that skipped
 * these honest empty-states and carried a filter (`.filter(s => s.text.trim() !== '')`) that
 * was dead code for anything but a `free_text` block, since `documents.ts`'s `toSections()`
 * already drops blank free-text blocks before this ever sees them. Reusing this instead of
 * maintaining a second path is the same move spec 0016's fix pass made for `AiProposalCard`.
 *
 * `editing`/`busy`/`onSaveField` are what turn ON the write path (`FieldEditor`) — omit them
 * (as the Workflow tab's read-only panel does) and this renders exactly like `editing={false}`
 * always has: content only, no control that could change it. */
export function SectionCard({
  section,
  editing = false,
  busy = false,
  projectPath = '',
  relPath = '',
  actor = '',
  highlighted = false,
  highlightField = null,
  onSaveField,
}: {
  section: DocumentSection
  editing?: boolean
  busy?: boolean
  projectPath?: string
  relPath?: string
  actor?: string
  /** This is the section a readiness item pointed at, so it is marked and scrolled to. */
  highlighted?: boolean
  /** The field within it, when the item named one. */
  highlightField?: string | null
  /** Required only when `editing` can be true — DocumentView always passes it; a read-only
   * caller (LiveDocumentPanel) never reaches the branch that would call it, so it has none. */
  onSaveField?: (section: DocumentSection, label: string, value: string) => Promise<void>
}) {
  if (section.kind === 'free_text') {
    return (
      <div data-section-key={section.key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        {/* Free text is shown exactly as written and never edited field-by-field — the shape
            library does not model it, so Studio must not pretend it does. */}
        <MarkdownView source={section.text} />
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
      {section.custom && (
        <p className="mt-1 text-xs text-slate-500">
          Added to this document — the template does not have this section.
        </p>
      )}
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
            onSave={onSaveField ? (value) => onSaveField(section, label, value) : undefined}
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
  onSave?: (value: string) => Promise<void>
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
        {editing && onSave ? (
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
        ) : MARKDOWN_TYPES.has(field.type) ? (
          <MarkdownView source={field.value} />
        ) : (
          // A one-line value (a name, a date, an id) is shown as written — markdown would read
          // the underscores in `FR_001` as emphasis.
          <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800">{field.value.trim()}</pre>
        )}
      </dd>
    </div>
  )
}
