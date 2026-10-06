import type { DocumentField, DocumentSection } from '../../shared/types'
import { sectionInstanceKey } from '../../shared/sections'
import { Card, DefinitionList, Eyebrow, cn } from '../ui'
import type { DefinitionItem } from '../ui'
import { FieldEditor } from './FieldEditor'
import { MarkdownView } from './MarkdownView'

/** The field types whose value is a block of markdown; the rest are single values. Mirrors the
 * multiline set FieldEditor already uses to decide which fields get a text area. */
export const MARKDOWN_TYPES = new Set(['longtext', 'table', 'checklist'])

/** The classes a readiness item's target card wears. Kept as one literal: the e2e counts the
 * `[data-highlighted="true"]` card and the finding-focus choreography (§4 #21) pulses the ring
 * these classes draw, so neither the names nor their split may drift. */
export const HIGHLIGHT_CLASS = 'border-brand-500 ring-2 ring-brand-200'

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
  highlightNote,
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
  /** The line under the heading while highlighted. Undefined keeps the readiness wording built
   * from `highlightField`; null draws no line (the outline rail marked this card, nobody "sent"
   * the reader); a string is said as given. */
  highlightNote?: string | null
  /** Required only when `editing` can be true — DocumentView always passes it; a read-only
   * caller (LiveDocumentPanel) never reaches the branch that would call it, so it has none. */
  onSaveField?: (section: DocumentSection, label: string, value: string) => Promise<void>
}) {
  if (section.kind === 'free_text') {
    return (
      <Card tone="inset" data-section-key={section.key}>
        {/* Free text is shown exactly as written and never edited field-by-field — the shape
            library does not model it, so Studio must not pretend it does. */}
        <MarkdownView source={section.text} />
      </Card>
    )
  }

  const fields = Object.entries(section.fields)

  return (
    <Card
      data-section-key={section.key}
      data-highlighted={highlighted ? 'true' : undefined}
      className={cn(highlighted && HIGHLIGHT_CLASS)}
    >
      <h3 className="text-md text-ink-1">{section.heading}</h3>
      {section.custom && (
        <p className="mt-1 text-xs text-ink-3">
          Added to this document — the template does not have this section.
        </p>
      )}
      {highlighted && highlightNote !== null && (
        <p className="mt-1 text-xs text-accent-text">
          {highlightNote ?? (highlightField
            ? `You were sent here to fill in ${highlightField}.`
            : 'You were sent here from what is missing on the stage.')}
        </p>
      )}
      <DefinitionList
        className="mt-3 gap-y-4"
        items={fields.map(([label, field]) => fieldRow({
          label,
          field,
          editing,
          busy,
          projectPath,
          relPath,
          sectionKey: section.key,
          sectionHeading: section.heading,
          instance: sectionInstanceKey(section),
          actor,
          onSave: onSaveField ? (value) => onSaveField(section, label, value) : undefined,
        }))}
      />
    </Card>
  )
}

/** One field as a term / detail pair for the section's `DefinitionList`. A function returning
 * an item rather than a component because `<dt>`/`<dd>` must be the list's own children for the
 * definition semantics to hold — a wrapping component element would break the pairing. */
function fieldRow({
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
}): DefinitionItem {
  if (!field) {
    // Declared by the shape, absent from this document. Said plainly rather than hidden —
    // a missing field is information, and hiding it is how a form silently loses content.
    return {
      key: label,
      term: <Eyebrow as="span">{label}</Eyebrow>,
      detail: <span className="text-sm text-ink-3">Not in this document.</span>,
    }
  }

  return {
    key: label,
    term: (
      <span className="flex items-baseline gap-2">
        <Eyebrow as="span">{label}</Eyebrow>
        {field.required && <span className="text-xs text-ink-3">required</span>}
      </span>
    ),
    detail: editing && onSave ? (
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
      <span className="text-sm text-ink-3">Empty</span>
    ) : MARKDOWN_TYPES.has(field.type) ? (
      // Prose gets prose leading (14/22); a one-line value below stays on the 13 px data size.
      <div className="text-base"><MarkdownView source={field.value} /></div>
    ) : (
      // A one-line value (a name, a date, an id) is shown as written — markdown would read
      // the underscores in `FR_001` as emphasis.
      <pre className="whitespace-pre-wrap font-sans text-sm text-ink-1">{field.value.trim()}</pre>
    ),
  }
}
